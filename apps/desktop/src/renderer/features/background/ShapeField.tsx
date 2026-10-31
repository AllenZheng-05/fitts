// The floating 3D shapes behind the UI (SPEC §6.12): zero-gravity physics, a cursor that
// pushes shapes away, drag and throw, and reactions to what Fitts is doing.
import { RoundedBox } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  BallCollider,
  CuboidCollider,
  Physics,
  RigidBody,
  type RapierRigidBody,
} from '@react-three/rapier';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Raycaster, Vector2, type Group, type Mesh } from 'three';
import { useRunStore } from '../../state/run-store';
import { useSpeech } from '../../state/speech';
import { isSeeThrough } from './seeThrough';
import { layout, SEVERITY_COLOR, type FieldMode, type ShapeColor, type ShapeSpec } from './shapes';
import { useFieldRunning } from './useFieldRunning';

/** Frame cap (§6.12). */
const FPS = 30;
/** Fastest a shape may move, in px/s, so nothing outruns the walls. */
const MAX_SPEED = 1800;
/** Fastest a shape may spin, in rad/s; collisions can't wind it up past this. */
const MAX_SPIN = 4;
/** Throws: release velocity is the last ~80ms of pointer motion, scaled and capped. */
const THROW_WINDOW_MS = 80;
const THROW_SCALE = 0.9;
const THROW_MAX = 1600;
/** Wandering (px/s and rad/s, scaled by the mode's speed). */
const CRUISE = [16, 36] as const;
const SPIN = [0.15, 0.45] as const;
/** How quickly a shape eases back to its wander after a bump or throw (per second). */
const SETTLE = 0.6;
/** Cursor collider radius in px (§6.12). */
const CURSOR_RADIUS = 40;
/** Rapier body types. */
const DYNAMIC = 0;
const KINEMATIC_POSITION = 2;
/**
 * Extra shapes that drop in for new findings. Once there are this many, no more are added:
 * removing a body while Rapier still holds it crashes the WebAssembly world.
 */
const MAX_DROPS = 4;

function tokenColor(name: ShapeColor): string {
  return getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim() || 'gray';
}

type Stats = NonNullable<Window['__fittsShapes']>;

/**
 * Where each shape last was (px from the window's center). Changing the motion setting rebuilds
 * the field, and the shapes carry on from where they were instead of jumping to new places.
 */
const lastAt = new Map<string, { x: number; y: number }>();
const fromLast = (specs: ShapeSpec[]) =>
  specs.map((s) => {
    const at = lastAt.get(s.id);
    return at ? { ...s, x: at.x, y: at.y } : s;
  });

/** Full-window canvas fixed behind the UI. */
export function ShapeField({ mode }: { mode: FieldMode }) {
  const running = useFieldRunning(mode);
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0"
      data-shape-field={mode}
    >
      <Canvas
        orthographic
        frameloop="never"
        dpr={[1, 2]}
        gl={{ alpha: true, antialias: true }}
        camera={{ position: [0, 0, 600], zoom: 1, near: 1, far: 2000 }}
        style={{ pointerEvents: 'none' }}
      >
        <ambientLight intensity={1.1} />
        <directionalLight position={[-400, 500, 600]} intensity={2.2} />
        <Ticker running={running && mode !== 'still'} />
        {mode === 'still' ? (
          <StillShapes />
        ) : (
          <MovingShapes key={mode} mode={mode} running={running} />
        )}
      </Canvas>
    </div>
  );
}

/**
 * Drives the canvas by hand: at most 30 frames a second, none while paused (§6.12). Physics
 * steps inside each frame, so it pauses too. A paused field still draws once after changes.
 */
function Ticker({ running }: { running: boolean }) {
  const advance = useThree((s) => s.advance);
  const size = useThree((s) => s.size);
  // r3f's clock is in seconds. It moves exactly 1/30 s per frame, so physics never catches
  // up on paused time with one giant step (which made every shape jump).
  const clock = useRef(0);
  useEffect(() => {
    const tick = () => {
      clock.current += 1 / FPS;
      advance(clock.current);
    };
    tick();
    if (!running) return;
    const timer = setInterval(tick, 1000 / FPS);
    return () => clearInterval(timer);
  }, [running, advance, size]);
  return null;
}

function Shape({ spec, meshRef }: { spec: ShapeSpec; meshRef?: (m: Mesh | null) => void }) {
  const color = useMemo(() => tokenColor(spec.color), [spec.color]);
  const material = <meshStandardMaterial color={color} roughness={0.45} metalness={0} />;
  const s = spec.size;
  switch (spec.kind) {
    case 'sphere':
      return (
        <mesh ref={meshRef}>
          <sphereGeometry args={[s, 40, 28]} />
          {material}
        </mesh>
      );
    case 'box':
      return (
        <RoundedBox ref={meshRef} args={[s, s, s]} radius={s * 0.18} smoothness={4}>
          {material}
        </RoundedBox>
      );
    case 'torus':
      return (
        <mesh ref={meshRef}>
          <torusGeometry args={[s, s * 0.32, 20, 48]} />
          {material}
        </mesh>
      );
    case 'capsule':
      return (
        <mesh ref={meshRef}>
          <capsuleGeometry args={[s, s * 2.3, 8, 20]} />
          {material}
        </mesh>
      );
    case 'pyramid':
      return (
        <mesh ref={meshRef} rotation={[0, Math.PI / 4, 0]}>
          <coneGeometry args={[s, s * 1.7, 4]} />
          {material}
        </mesh>
      );
  }
}

/** Reduced motion or "Still": the same shapes, placed, with no physics. */
function StillShapes() {
  const { width, height } = useThree((s) => s.size);
  const specs = useMemo(() => fromLast(layout('still', width, height)), [width, height]);
  useStats('still', false, () => []);
  return (
    <>
      {specs.map((spec, i) => (
        <group key={spec.id} position={[spec.x, spec.y, 0]} rotation={[0.5 + i, 0.6 * i, 0.2]}>
          <Shape spec={spec} />
        </group>
      ))}
    </>
  );
}

function MovingShapes({ mode, running }: { mode: FieldMode; running: boolean }) {
  const { width, height } = useThree((s) => s.size);
  const [specs] = useState(() => fromLast(layout(mode, width, height)));
  const [drops, setDrops] = useState<ShapeSpec[]>([]);
  const bodies = useRef(new Map<string, RapierRigidBody>());
  const meshes = useRef(new Map<Mesh, string>());
  const group = useRef<Group>(null);
  const speed = mode === 'lively' ? 1 : 0.4;

  useStats(mode, running, () =>
    [...bodies.current].map(([id, b]) => {
      const t = b.translation();
      const v = b.linvel();
      const w = b.angvel();
      const spin = Math.hypot(w.x, w.y, w.z);
      return { id, x: t.x + width / 2, y: height / 2 - t.y, vx: v.x, vy: v.y, spin };
    }),
  );

  // A new finding drops a shape in its severity color from the top edge; the run finishing
  // pushes everything gently outward from the center (§6.12).
  useEffect(() => {
    let previous = useRunStore.getState().runs[useRunStore.getState().activeProjectId];
    return useRunStore.subscribe((s) => {
      const run = s.runs[s.activeProjectId];
      if (!run || !previous || run.runId !== previous.runId) {
        previous = run;
        return;
      }
      const newest = run.findings.at(-1);
      if (newest && run.findings.length > previous.findings.length) {
        const drop: ShapeSpec = {
          id: `drop-${newest.id}`,
          kind: 'sphere',
          color: SEVERITY_COLOR[newest.severity] ?? 'coral',
          size: 16 + newest.severity * 4,
          x: (Math.random() * 2 - 1) * (width / 2 - 80),
          y: height / 2 - 40,
        };
        setDrops((d) => (d.length >= MAX_DROPS ? d : [...d, drop]));
      }
      if (run.phase === 'done' && previous.phase !== 'done') {
        for (const body of liveBodies(bodies.current)) {
          const t = body.translation();
          const len = Math.hypot(t.x, t.y) || 1;
          body.applyImpulse(
            { x: (t.x / len) * 260 * body.mass(), y: (t.y / len) * 260 * body.mass(), z: 0 },
            true,
          );
        }
      }
      previous = run;
    });
  }, [width, height]);

  const sizes = useMemo(
    () => new Map([...specs, ...drops].map((d) => [d.id, d.size])),
    [specs, drops],
  );
  const wander = useRef(new Map<string, Wander>());

  // Each frame: the speaking pulse (§6.12), then every free shape eases toward its own
  // slowly wandering heading and spin, and is kept inside the window.
  useFrame((_, delta) => {
    const g = group.current;
    if (g) {
      const target = useSpeech.getState().speaking ? 1.04 : 1;
      g.scale.setScalar(g.scale.x + (target - g.scale.x) * Math.min(1, delta / 0.3));
    }
    if (!running) return;
    const dt = Math.min(delta, 0.1);
    const hw = width / 2;
    const hh = height / 2;
    for (const [id, body] of bodies.current) {
      if (!isLive(body) || !body.isDynamic()) continue;
      let w = wander.current.get(id);
      if (!w) {
        w = newWander(speed);
        wander.current.set(id, w);
      }
      const size = sizes.get(id) ?? 20;
      const t = body.translation();
      lastAt.set(id, { x: t.x, y: t.y });

      // Drift the heading a little; near an edge, turn back toward the middle.
      w.heading += (Math.random() - 0.5) * 1.4 * dt;
      const near = size + 40;
      if (Math.abs(t.x) > hw - near || Math.abs(t.y) > hh - near) {
        w.heading = Math.atan2(-t.y, -t.x) + (Math.random() - 0.5) * 0.8;
      }

      const k = Math.min(1, dt * SETTLE);
      const v = body.linvel();
      let vx = v.x + (Math.cos(w.heading) * w.cruise - v.x) * k;
      let vy = v.y + (Math.sin(w.heading) * w.cruise - v.y) * k;
      const sp = Math.hypot(vx, vy);
      if (sp > MAX_SPEED) {
        vx *= MAX_SPEED / sp;
        vy *= MAX_SPEED / sp;
      }

      // Last resort: the window edge is a wall. Anything past it comes back, bouncing.
      const mx = Math.min(size, hw / 2);
      const my = Math.min(size, hh / 2);
      const x = Math.max(-hw + mx, Math.min(hw - mx, t.x));
      const y = Math.max(-hh + my, Math.min(hh - my, t.y));
      if (x !== t.x) vx = -vx * 0.6;
      if (y !== t.y) vy = -vy * 0.6;
      if (x !== t.x || y !== t.y) body.setTranslation({ x, y, z: 0 }, true);
      body.setLinvel({ x: vx, y: vy, z: 0 }, true);

      const a = body.angvel();
      let ax = a.x + (w.spin.x - a.x) * k;
      let ay = a.y + (w.spin.y - a.y) * k;
      let az = a.z + (w.spin.z - a.z) * k;
      const spin = Math.hypot(ax, ay, az);
      if (spin > MAX_SPIN) {
        ax *= MAX_SPIN / spin;
        ay *= MAX_SPIN / spin;
        az *= MAX_SPIN / spin;
      }
      body.setAngvel({ x: ax, y: ay, z: az }, true);
    }
  });

  return (
    <Physics gravity={[0, 0, 0]} timeStep="vary" paused={!running}>
      <Walls key={`${width}x${height}`} width={width} height={height} />
      <Cursor width={width} height={height} />
      <Dragger bodies={bodies} meshes={meshes} width={width} height={height} />
      <group ref={group}>
        {[...specs, ...drops].map((spec) => (
          <RigidBody
            key={spec.id}
            ref={(b) => {
              if (b) bodies.current.set(spec.id, b);
              else bodies.current.delete(spec.id);
            }}
            position={[spec.x, spec.y, 0]}
            colliders={spec.kind === 'sphere' ? 'ball' : 'hull'}
            restitution={0.6}
            linearDamping={0.3}
            angularDamping={0.4}
            ccd
            enabledTranslations={[true, true, false]}
            linearVelocity={spec.id.startsWith('drop-') ? [0, -260, 0] : [0, 0, 0]}
          >
            <Shape
              spec={spec}
              meshRef={(m) => {
                if (m) meshes.current.set(m, spec.id);
              }}
            />
          </RigidBody>
        ))}
      </group>
    </Physics>
  );
}

/** A body Rapier still knows about (one freed by an unmount must never be touched). */
function isLive(b: RapierRigidBody): boolean {
  try {
    return b.isValid();
  } catch {
    return false;
  }
}

function liveBodies(map: Map<string, RapierRigidBody>): RapierRigidBody[] {
  return [...map.values()].filter(isLive);
}

/** A shape's aimless float: a heading that drifts, a cruising speed and a slow spin. */
interface Wander {
  heading: number;
  cruise: number;
  spin: { x: number; y: number; z: number };
}

const between = ([lo, hi]: readonly [number, number]) => lo + Math.random() * (hi - lo);

function newWander(speed: number): Wander {
  const sign = () => (Math.random() < 0.5 ? -1 : 1);
  return {
    heading: Math.random() * Math.PI * 2,
    cruise: between(CRUISE) * speed,
    spin: {
      x: between(SPIN) * speed * sign(),
      y: between(SPIN) * speed * sign(),
      z: between(SPIN) * speed * 0.5 * sign(),
    },
  };
}

/** Invisible walls at the window edges; shapes bounce off them and each other. */
function Walls({ width, height }: { width: number; height: number }) {
  const t = 200;
  const hw = width / 2;
  const hh = height / 2;
  return (
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider args={[hw + t, t, 400]} position={[0, hh + t, 0]} restitution={0.6} />
      <CuboidCollider args={[hw + t, t, 400]} position={[0, -hh - t, 0]} restitution={0.6} />
      <CuboidCollider args={[t, hh + t, 400]} position={[-hw - t, 0, 0]} restitution={0.6} />
      <CuboidCollider args={[t, hh + t, 400]} position={[hw + t, 0, 0]} restitution={0.6} />
    </RigidBody>
  );
}

/**
 * Pointer position in world units, read from window because the canvas sits under the UI.
 * `pressed` is true while the main button is held after pressing on see-through paper.
 */
function usePointer(width: number, height: number) {
  const pointer = useRef({
    x: 99999,
    y: 99999,
    inside: false,
    pressed: false,
    /** Recent positions, for a smooth throw velocity. */
    samples: [] as { x: number; y: number; t: number }[],
  });
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (e.button === 0 && isSeeThrough(e.target)) pointer.current.pressed = true;
    };
    const onUp = () => {
      pointer.current.pressed = false;
    };
    const onMove = (e: PointerEvent) => {
      const now = performance.now();
      const p = pointer.current;
      p.x = e.clientX - width / 2;
      p.y = height / 2 - e.clientY;
      p.inside = true;
      p.samples.push({ x: p.x, y: p.y, t: now });
      while (p.samples.length > 2 && now - (p.samples[0]?.t ?? now) > THROW_WINDOW_MS * 2) {
        p.samples.shift();
      }
    };
    const onLeave = () => {
      pointer.current.inside = false;
      pointer.current.x = 99999;
      pointer.current.y = 99999;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    document.documentElement.addEventListener('pointerleave', onLeave);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      document.documentElement.removeEventListener('pointerleave', onLeave);
    };
  }, [width, height]);
  return pointer;
}

/**
 * A kinematic ball that pushes shapes away from the cursor (§6.12), only while the mouse
 * is held down on the backdrop. Otherwise it waits far off-screen and the shapes ignore
 * the cursor.
 */
function Cursor({ width, height }: { width: number; height: number }) {
  const body = useRef<RapierRigidBody>(null);
  const pointer = usePointer(width, height);
  useFrame(() => {
    const p = pointer.current;
    // Holding a shape is a drag, not a push: the collider would sit inside it and spoil
    // the throw.
    cursorActive = p.pressed && !dragging;
    const at = cursorActive ? { x: p.x, y: p.y } : { x: 99999, y: 99999 };
    body.current?.setNextKinematicTranslation({ ...at, z: 0 });
  });
  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[99999, 99999, 0]}>
      <BallCollider args={[CURSOR_RADIUS]} />
    </RigidBody>
  );
}

/**
 * Drag and throw (§6.12): a pointerdown on see-through paper (not a control or panel) raycasts
 * into the scene; a hit shape turns kinematic and follows the pointer, then is released with
 * its velocity.
 */
function Dragger({
  bodies,
  meshes,
  width,
  height,
}: {
  bodies: React.RefObject<Map<string, RapierRigidBody>>;
  meshes: React.RefObject<Map<Mesh, string>>;
  width: number;
  height: number;
}) {
  const camera = useThree((s) => s.camera);
  const pointer = usePointer(width, height);
  const held = useRef<RapierRigidBody | null>(null);

  useEffect(() => {
    const raycaster = new Raycaster();
    const onDown = (e: PointerEvent) => {
      if (!isSeeThrough(e.target) || e.button !== 0) return;
      raycaster.setFromCamera(
        new Vector2((e.clientX / width) * 2 - 1, -(e.clientY / height) * 2 + 1),
        camera,
      );
      const hit = raycaster.intersectObjects([...meshes.current.keys()], true)[0];
      if (!hit) return;
      let obj: typeof hit.object | null = hit.object;
      let id: string | undefined;
      while (obj && !id) {
        id = meshes.current.get(obj as Mesh);
        obj = obj.parent;
      }
      const body = id ? bodies.current.get(id) : undefined;
      if (!body) return;
      e.preventDefault();
      body.setBodyType(KINEMATIC_POSITION, true);
      held.current = body;
      dragging = true;
    };
    const onUp = () => {
      const body = held.current;
      if (!body) return;
      held.current = null;
      dragging = false;
      body.setBodyType(DYNAMIC, true);
      // Throw with the pointer's velocity over the last ~80ms, capped.
      const now = performance.now();
      const recent = pointer.current.samples.filter((q) => now - q.t <= THROW_WINDOW_MS);
      const first = recent[0];
      const last = recent.at(-1);
      let vx = 0;
      let vy = 0;
      if (first && last && last.t > first.t) {
        const dt = (last.t - first.t) / 1000;
        vx = ((last.x - first.x) / dt) * THROW_SCALE;
        vy = ((last.y - first.y) / dt) * THROW_SCALE;
        const sp = Math.hypot(vx, vy);
        if (sp > THROW_MAX) {
          vx *= THROW_MAX / sp;
          vy *= THROW_MAX / sp;
        }
      }
      body.setLinvel({ x: vx, y: vy, z: 0 }, true);
    };
    // Grabbing through text must not start a text selection (that's mousedown's default).
    const onMouseDown = (e: MouseEvent) => {
      if (held.current) e.preventDefault();
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('pointerup', onUp);
    };
  }, [bodies, meshes, camera, width, height, pointer]);

  useFrame(() => {
    const body = held.current;
    if (!body) return;
    // A dragged shape can't leave the window either.
    const p = pointer.current;
    const x = Math.max(-width / 2 + 40, Math.min(width / 2 - 40, p.x));
    const y = Math.max(-height / 2 + 40, Math.min(height / 2 - 40, p.y));
    body.setNextKinematicTranslation({ x, y, z: 0 });
  });
  return null;
}

/** Whether the cursor collider is in the scene this frame (read by the dev stats). */
let cursorActive = false;
/** A shape is being dragged; the cursor collider stands down meanwhile. */
let dragging = false;

/** Dev/e2e stats: frame count, mode, running, body positions. */
function useStats(mode: FieldMode, running: boolean, bodies: Stats['bodies']) {
  const frames = useRef(0);
  const bodiesRef = useRef(bodies);
  useEffect(() => {
    bodiesRef.current = bodies;
  });
  useFrame(() => {
    frames.current += 1;
  });
  useEffect(() => {
    if (!__FITTS_DEV_TOOLS__) return;
    window.__fittsShapes = {
      get frames() {
        return frames.current;
      },
      mode,
      running,
      bodies: () => bodiesRef.current(),
      cursorActive: () => cursorActive,
    };
  }, [mode, running]);
}
