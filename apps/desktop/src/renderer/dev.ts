/**
 * True only in e2e builds (FITTS_DEV_TOOLS=1). Phase 1's stand-ins (the mock engine and sites,
 * demo projects, the canned user and transcripts, the Scenario panel) are the test harness and
 * sit behind this flag: it's a build-time constant, so `pnpm dev` and a release drop them
 * entirely (scripts/check-release-bundle.mjs checks the release). Users only ever see their own
 * projects and their own sites.
 */
export const TEST_BUILD = __FITTS_DEV_TOOLS__;
