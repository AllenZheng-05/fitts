/**
 * True in `pnpm dev` and e2e builds; false in a release. Phase 1's stand-ins (mock sites, demo
 * projects, the canned user and transcripts) are only reachable behind this flag: it's a
 * build-time constant, so a release bundle drops them entirely (scripts/check-release-bundle.mjs
 * checks that). Real users only ever see their own projects and their own sites.
 */
export const DEV = __FITTS_DEV_TOOLS__;
