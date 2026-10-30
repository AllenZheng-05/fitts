// Checks that a release build of the renderer has none of Phase 1's stand-ins: the mock "your
// site" pages, the demo projects' data and the sample user. They exist only behind
// __FITTS_DEV_TOOLS__ (src/renderer/dev.ts), which a release build sets to false, so the bundler
// drops them. Run after `electron-vite build` without FITTS_DEV_TOOLS (CI does, before packaging).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const OUT = join(import.meta.dirname, '../apps/desktop/out/renderer');

/** Text that only Phase 1's mock code contains. */
const MARKERS = [
  'This is a stand-in for your site', // GenericSite
  'Party packages starting at', // HartwellSite
  'Did you get the photos from Sunday', // DemoChatSite
  'Last run yesterday', // the sample "last run" captions
  'Uncle Joe', // demo/chat's mock contacts
  'f-null-name', // demo/chat's scripted findings
  'firstName: "Allen"', // the sample user
];

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? files(full) : full.endsWith('.js') ? [full] : [];
  });
}

const found = [];
for (const file of files(OUT)) {
  const text = readFileSync(file, 'utf8');
  for (const m of MARKERS) if (text.includes(m)) found.push(`${relative(OUT, file)}: "${m}"`);
}
if (found.length) {
  console.error(`The release bundle still has Phase 1 stand-ins:\n  ${found.join('\n  ')}`);
  process.exit(1);
}
console.log(`Release bundle is clean: none of ${MARKERS.length} stand-in markers found.`);
