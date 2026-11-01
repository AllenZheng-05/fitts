// Which model does which job (SPEC-phase2 §2), by profile. Contributor mode swaps Spark 1.3 for
// its contributor variant, for demo/* projects only unless the user enabled it per project.
import type { Provider } from './call';

export type Profile = 'quality' | 'economy' | 'open';
export type Job = 'interview' | 'understand' | 'chat' | 'crawl' | 'aggregate' | 'themefit' | 'fix';

export interface ModelChoice {
  provider: Provider;
  model: string;
}

export const SPARK = 'muse-spark-1.3';
export const SPARK_CONTRIBUTOR = 'muse-spark-1.3-contributor';
export const WONDER = 'muse-wonder-1.0';
export const SPARK_OPEN = 'meta-models/muse-spark-open-1026';

export interface RouteOptions {
  contributor: boolean;
  /** A Baseten key exists (one Spark reviewer runs on Spark Open even in Quality). */
  baseten: boolean;
}

const spark = (o: RouteOptions): ModelChoice => ({
  provider: 'meta',
  model: o.contributor ? SPARK_CONTRIBUTOR : SPARK,
});
const open: ModelChoice = { provider: 'baseten', model: SPARK_OPEN };
const wonder: ModelChoice = { provider: 'meta', model: WONDER };

export function modelFor(job: Job, profile: Profile, o: RouteOptions): ModelChoice {
  switch (job) {
    case 'interview':
    case 'understand':
    case 'chat':
    case 'crawl':
      return spark(o);
    case 'aggregate':
    case 'themefit':
      return profile === 'quality' ? wonder : profile === 'open' && o.baseten ? open : spark(o);
    case 'fix':
      return profile === 'quality' ? wonder : spark(o);
  }
}

/** The five reviewer personas' models, in persona order (§8.1). */
export function reviewerRoster(profile: Profile, o: RouteOptions): ModelChoice[] {
  if (profile === 'open' && o.baseten) return [open, open, open, open, open];
  if (profile === 'economy') return [spark(o), spark(o), spark(o), spark(o), spark(o)];
  // Quality: 3 Spark + 2 Wonder; one Spark reviewer runs on Spark Open when Baseten is set up.
  return [o.baseten ? open : spark(o), spark(o), spark(o), wonder, wonder];
}

/** Contributor pricing applies to demo projects unless the user opted a project in. */
export const contributorFor = (projectId: string, contributorMode: boolean, optedIn = false) =>
  contributorMode && (optedIn || projectId.startsWith('demo'));
