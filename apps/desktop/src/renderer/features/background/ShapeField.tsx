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
import { layout, SEVERITY_COLOR, type FieldMode, type ShapeColor, type ShapeSpec } from './shapes';
import { useFieldRunning } from './useFieldRunning';

/** Frame cap (§6.12). */
const FPS = 30;
/** Cursor collider radius in px (§6.12). */
const CURSOR_RADIUS = 40;
/** Rapier body types. */
const DYNAMIC = 0;
const KINEMATIC_POSITION = 2;
/** Extra shapes that drop in for new findings, oldest removed first. */
const MAX_DROPS = 4;

function tokenColor(name: ShapeColor): string {
  return getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim() || 'gray';
}

type Stats = NonNullable<Window['__fittsShapes']>;

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
  useEffect(() => {
    advance(performance.now());
    if (!running) return;
    const timer = setInterval(() => advance(performance.now()), 1000 / FPS);
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
  const specs = useMemo(() => layout('still', width, height), [width, height]);
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
  const [specs] = useState(() => layout(mode, width, height));
  const [drops, setDrops] = useState<ShapeSpec[]>([]);
  const bodies = useRef(new Map<string, RapierRigidBody>());
  const meshes = useRef(new Map<Mesh, string>());
  const group = useRef<Group>(null);
  const speed = mode === 'lively' ? 1 : 0.4;

  useStats(mode, running, () =>
    [...bodies.current].map(([id, b]) => {
      const t = b.translation();
      const v = b.linvel();
      return { id, x: t.x + width / 2, y: height / 2 - t.y, vx: v.x, vy: v.y };
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
          y: height / 2 + 40,
        };
        setDrops((d) => [...d, drop].slice(-MAX_DROPS));
      }
      if (run.phase === 'done' && previous.phase !== 'done') {
        for (const body of bodies.current.values()) {
          const t = body.translation();
          const len = Math.hypot(t.x, t.y) || 1;
          body.applyImpulse(
            { x: (t.x / len) * 900 * body.mass(), y: (t.y / len) * 900 * body.mass(), z: 0 },
            true,
          );
        }
      }
      previous = run;
    });
  }, [width, height]);

  // Slow random drift impulses every 4–8 s (§6.12).
  useEffect(() => {
    if (!running) return;
    let timer: ReturnType<typeof setTimeout>;
    const nudge = () => {
      for (const body of bodies.current.values()) {
        if (!body.isDynamic()) continue;
        const angle = Math.random() * Math.PI * 2;
        const strength = (40 + Math.random() * 60) * speed * body.mass();
        body.applyImpulse(
          { x: Math.cos(angle) * strength, y: Math.sin(angle) * strength, z: 0 },
          true,
        );
        body.applyTorqueImpulse({ x: 0, y: 0, z: (Math.random() - 0.5) * strength * 20 }, true);
      }
      timer = setTimeout(nudge, 4000 + Math.random() * 4000);
    };
    timer = setTimeout(nudge, 600);
    return () => clearTimeout(timer);
  }, [running, speed]);

  // Fitts speaking: every shape pulses to 1.04 (§6.12).
  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    const target = useSpeech.getState().speaking ? 1.04 : 1;
    const k = Math.min(1, delta / 0.3);
    const next = g.scale.x + (target - g.scale.x) * k;
    g.scale.setScalar(next);
  });

  return (
    <Physics gravity={[0, 0, 0]} timeStep="vary" paused={!running}>
      <Walls width={width} height={height} />
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

/** Pointer position in world units, read from window because the canvas sits under the UI. */
function usePointer(width: number, height: number) {
  const pointer = useRef({ x: 99999, y: 99999, vx: 0, vy: 0, t: 0, inside: false });
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const now = performance.now();
      const x = e.clientX - width / 2;
      const y = height / 2 - e.clientY;
      const p = pointer.current;
      const dt = Math.max(1, now - p.t) / 1000;
      p.vx = p.inside ? (x - p.x) / dt : 0;
      p.vy = p.inside ? (y - p.y) / dt : 0;
      p.x = x;
      p.y = y;
      p.t = now;
      p.inside = true;
    };
    const onLeave = () => {
      pointer.current.inside = false;
      pointer.current.x = 99999;
      pointer.current.y = 99999;
    };
    window.addEventListener('pointermove', onMove);
    document.documentElement.addEventListener('pointerleave', onLeave);
    return () => {
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
    };
  }, [width, height]);
  return pointer;
}

/** A kinematic ball that follows the pointer, so shapes bump away from it (§6.12). */
function Cursor({ width, height }: { width: number; height: number }) {
  const body = useRef<RapierRigidBody>(null);
  const pointer = usePointer(width, height);
  useFrame(() => {
    const p = pointer.current;
    body.current?.setNextKinematicTranslation({ x: p.x, y: p.y, z: 0 });
  });
  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[99999, 99999, 0]}>
      <BallCollider args={[CURSOR_RADIUS]} />
    </RigidBody>
  );
}

/**
 * Drag and throw (§6.12): a pointerdown on the backdrop (not on UI) raycasts into the scene;
 * a hit shape turns kinematic and follows the pointer, then is released with its velocity.
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
      const target = e.target as HTMLElement | null;
      const onBackdrop =
        target === document.documentElement ||
        target === document.body ||
        target?.closest('[data-backdrop]') === target;
      if (!onBackdrop || e.button !== 0) return;
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
    };
    const onUp = () => {
      const body = held.current;
      if (!body) return;
      held.current = null;
      body.setBodyType(DYNAMIC, true);
      const p = pointer.current;
      const clamp = (v: number) => Math.max(-1500, Math.min(1500, v));
      body.setLinvel({ x: clamp(p.vx), y: clamp(p.vy), z: 0 }, true);
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
    };
  }, [bodies, meshes, camera, width, height, pointer]);

  useFrame(() => {
    const body = held.current;
    if (!body) return;
    const p = pointer.current;
    body.setNextKinematicTranslation({ x: p.x, y: p.y, z: 0 });
  });
  return null;
}

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
    };
  }, [mode, running]);
}
