// Bootstrap for `node --test`. Loaded once, before any test file, via
// `node --import ./scripts/test/register.mjs --test tests/`.
//
// The only job here is making the app's .ts modules importable from a plain
// Node process. That problem was already solved for the eval harness, so this
// file deliberately REUSES scripts/eval/loader.mjs rather than registering a
// second, subtly different resolver — two mechanisms for one problem is how
// "it passes under the tests but not under the evals" starts.
//
// What is reused: `registerTsResolution` (the module.registerHooks resolver
// that teaches Node about extensionless imports and the "@/" alias) and
// `quietNodeWarnings`.
//
// What is deliberately NOT reused: `loadEnv`. It throws unless
// KODELY_FOUNDATION_DIR points at an installed foundation checkout, because
// the eval harness runs real builds. This suite runs pure functions and must
// stay runnable on a laptop with no .env, no foundation and no database.
//
// The two env vars set below are read at MODULE SCOPE by code under test, so
// they have to be in place before the first import, not inside a test:
//   - KODELY_SITES_BASE  — lib/site-seo.ts captures it into a const, so the
//     host-shape branches in siteBaseUrl are otherwise untestable.
//   - NODE_ENV=test      — keeps lib/db.ts off the `globalThis.prisma` cache
//     path. No test touches the database (see scripts/test/README.md), but
//     several modules under test import ./db transitively, so the client is
//     constructed either way; it just never gets a query.

import { registerTsResolution, quietNodeWarnings } from "../eval/loader.mjs";

process.env.NODE_ENV ??= "test";
process.env.KODELY_SITES_BASE ??= "kodely.site";
// Pin the rate card inputs so lib/models.ts reads its declared defaults even
// if a real .env in the working copy overrides them.
process.env.KODELY_MODEL_BUILDER ??= "claude-sonnet-5";

quietNodeWarnings();
registerTsResolution();
