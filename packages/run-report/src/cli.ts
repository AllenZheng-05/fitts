// pnpm --filter @fitts/run-report export <run dir> <out dir> [--label "…"]
// pnpm --filter @fitts/run-report site (<run dir> | --latest <project id>) --id <id> [--label "…"] [--featured]
import { basename, relative } from 'node:path';
import { exportRun } from './export';
import { latestRun, publishToSite } from './site';
import { usd } from './words';

const USAGE = `Usage:
  export <run dir> <out dir> [--label "…"]
      Writes the run's report as a static folder you can share or host.
  site (<run dir> | --latest <project id>) --id <id> [--label "…"] [--featured]
      Publishes it on the Fitts site at /runs/<id>/ and lists it on /runs/.
      --featured makes it the run Home and Showcase link to.`;

function parse(argv: string[]) {
  const pos: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] ?? '';
    if (a.startsWith('--')) {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--') && a !== '--featured') {
        flags[a.slice(2)] = next;
        i++;
      } else flags[a.slice(2)] = true;
    } else pos.push(a);
  }
  return { pos, flags };
}

const str = (v: string | true | undefined) => (typeof v === 'string' ? v : undefined);

function main() {
  // pnpm passes a lone "--" through when the user separates arguments with it.
  const [cmd, ...rest] = process.argv.slice(2).filter((a) => a !== '--');
  const { pos, flags } = parse(rest);
  const label = str(flags.label);
  if (cmd === 'export') {
    const [runDir, outDir] = pos;
    if (!runDir || !outDir) throw new Error(USAGE);
    const r = exportRun(runDir, outDir, label ? { label } : {});
    console.log(
      `Wrote ${r.files.length} files to ${outDir}: ${r.data.stats.shown} findings, ${r.data.stats.verified} verified fixes, ${usd(r.data.stats.spentUsd)}. Open index.html.`,
    );
    return;
  }
  if (cmd === 'site') {
    const project = str(flags.latest);
    const runDir = project ? latestRun(project) : pos[0];
    const id = str(flags.id);
    if (!runDir || !id) throw new Error(USAGE);
    const r = publishToSite(runDir, {
      id,
      ...(label ? { label } : {}),
      featured: flags.featured === true,
    });
    console.log(
      [
        `Published ${basename(runDir)} as /runs/${id}/ (${r.files.length} files in ${relative(process.cwd(), r.outDir) || r.outDir}).`,
        `${r.data.stats.shown} findings, ${r.data.stats.verified} verified fixes, ${usd(r.data.stats.spentUsd)}.`,
        `The site links to: /runs/${r.manifest.featured}/`,
        `Check it: pnpm --filter @fitts/site test && pnpm --filter @fitts/site test:e2e`,
      ].join('\n'),
    );
    return;
  }
  throw new Error(USAGE);
}

try {
  main();
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}
