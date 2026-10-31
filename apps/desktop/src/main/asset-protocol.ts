// fitts-asset://<projectId>/<runId>/<shots|assets>/<file> (SPEC-phase2 §12.3): read-only,
// path-checked access to a run's step shots and media for the renderer's <img>s.
import { net, protocol } from 'electron';
import { existsSync } from 'node:fs';
import { join, normalize, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runDir, SAFE_ID } from './store/run-log';

export const ASSET_SCHEME = 'fitts-asset';

/** Must run before app ready. */
export function registerAssetScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: ASSET_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
  ]);
}

/** The file an asset URL names, or null when it isn't a plain shot or asset path. */
export function assetPath(root: string, url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const projectId = u.hostname;
  const [runId, kind, ...rest] = decodeURIComponent(u.pathname).split('/').filter(Boolean);
  if (!SAFE_ID.test(projectId) || !runId || !SAFE_ID.test(runId)) return null;
  if (kind !== 'shots' && kind !== 'assets') return null;
  // A style board is an .html asset (SPEC-phase3 §2), shown in a sandboxed iframe.
  if (rest.length !== 1 || !/^[\w.-]+\.(jpg|png|webp|svg|html)$/.test(rest[0] ?? '')) return null;
  const base = join(runDir(root, projectId, runId), kind);
  const file = normalize(join(base, rest[0] ?? ''));
  return file.startsWith(base + sep) ? file : null;
}

/** A style board may draw only with what it carries: no scripts, nothing from the network. */
export const BOARD_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; base-uri 'none'; form-action 'none'";

export function handleAssets(root: string): void {
  protocol.handle(ASSET_SCHEME, async (req) => {
    const file = assetPath(root, req.url);
    if (!file || !existsSync(file)) return new Response('Not found', { status: 404 });
    const res = await net.fetch(pathToFileURL(file).toString());
    if (!file.endsWith('.html')) return res;
    return new Response(res.body, {
      headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': BOARD_CSP },
    });
  });
}
