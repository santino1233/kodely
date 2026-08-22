# The test suite

Pure-logic tests for the modules where a wrong answer is expensive: what we
charge, what we publish, what we refuse to publish, and what we tell the user
is happening.

## Running it

From the repo root:

```
node --import ./scripts/test/register.mjs --test "tests/*.test.mjs"
```

Keep the quotes. Node expands the glob itself; letting a shell do it breaks on
Windows, and passing the bare directory (`--test tests/`) fails because the
resolver hook in `scripts/eval/loader.mjs` intercepts the directory specifier.

Everything is in-process and pure, so the whole suite runs in about a second.

**As of the last run: 209 tests, 198 pass, 11 fail.** The 11 failures are all in
`tests/open-bugs.test.mjs` and are all real bugs in application code — see
[Known failures](#known-failures) below. To run only the part that should be
green, and get a zero exit code:

```
node --import ./scripts/test/register.mjs --test --test-skip-pattern="^BUG:" "tests/*.test.mjs"
```

One file, one module:

```
node --import ./scripts/test/register.mjs --test tests/credits.test.mjs
```

One test by name:

```
node --import ./scripts/test/register.mjs --test --test-name-pattern="creditsFor" "tests/*.test.mjs"
```

### A package.json script

`package.json` was out of scope for the change that added this suite, so there
is no `npm test` yet. Adding one is two lines:

```json
"test": "node --import ./scripts/test/register.mjs --test \"tests/*.test.mjs\"",
"test:green": "node --import ./scripts/test/register.mjs --test --test-skip-pattern=\"^BUG:\" \"tests/*.test.mjs\""
```

## How .ts modules load under bare Node

`node --test` runs plain Node. Node 24 strips TypeScript types natively, but
its ESM resolver still demands full specifiers, and the app uses extensionless
imports (`./models`) and the `@/` tsconfig alias throughout.

That problem was already solved for the eval harness, so
`scripts/test/register.mjs` **reuses `scripts/eval/loader.mjs`** —
`registerTsResolution()` and `quietNodeWarnings()` — rather than registering a
second, subtly different resolver. Two mechanisms for one problem is how "it
passes under the tests but not under the evals" starts.

The one thing it does *not* reuse is `loadEnv()`. That function throws unless
`KODELY_FOUNDATION_DIR` points at an installed foundation checkout, because the
eval harness runs real builds. This suite must stay runnable on a laptop with
no `.env`, no foundation and no database, so `register.mjs` sets the two
module-scope environment variables the code under test actually reads
(`KODELY_SITES_BASE`, `NODE_ENV`) and nothing else.

No test framework, and no new dependency: `node:test` and `node:assert` only.

## What does NOT belong here

**Nothing that touches the database, the network, or a model call.** No Prisma
queries, no `fetch`, no `runAgent`, no `buildSite`. If a test needs a row to
exist, it is in the wrong file.

That is a hard line, not a preference:

- These tests run on every developer's machine, including one with a `.env`
  pointing at production. A suite that can write is a suite that can write
  there.
- A test that needs a database is a test nobody runs, and a test nobody runs is
  worse than no test — it is a green badge over an unverified module.
- Determinism. No wall-clock sleeps, no `Date.now()`-dependent assertions, no
  unseeded random input. Every fixture here is a literal; where a test needs
  many inputs (bucket distribution, CRC round trips) it generates them from a
  fixed sequence, never from `Math.random()`.

Some modules import `./db` transitively — `lib/credits.ts` and `lib/flags.ts`
both do — and that is fine: constructing a `PrismaClient` opens no connection.
It is *queries* that are banned, so those modules are tested only through their
pure exports.

For anything that genuinely needs the real pipeline, use the eval harness
(`scripts/eval`) instead. It exists for exactly that and is deliberately kept
separate.

### Modules deliberately left untested

| Module | Why |
| --- | --- |
| `lib/credits.ts` — `getBalance`, `grantCredits`, `chargeForBuild`, `averageBuildCredits`, `spentInWindow`, `getSpendCapStatus` | Every one is a `db.creditLedger` / `db.user` / `db.build` query. The arithmetic they *wrap* (`costMicros`, `creditsFor`, `settleBuild`) is covered. |
| `lib/flags.ts` — `isEnabled`, `listFlags`, `setFlag`, `seedFlags`, `deleteOrphanFlag`, the cache | All read or write the `FeatureFlag` table. `rolloutBucket`, `clampRolloutPct` and the declared spec table are covered; the resolution order in `isEnabled` needs a fake Prisma client and belongs in an integration suite. |
| `lib/moderation.ts` — `recordModerationFindings` | Writes `ModerationFinding` rows. The analyzer it records the output of is covered in full. |
| `app/admin/users/page.tsx`, `app/admin/content/page.tsx` — `isSortKey` | Not exported, and the module is a Next server component that pulls in `next/navigation` and Prisma at import time. The identical bug in the two *exported* twins (`lib/flags.ts` `isFlagKey`, `app/admin/health/data.ts` `isWindowKey`) is covered instead. |
| `lib/agent.ts`, `lib/agent-sdk.ts`, `lib/build-site.ts`, `lib/enhance.ts` | Model calls and real builds. That is what `scripts/eval` is for. |

## Layout

| File | Covers |
| --- | --- |
| `tests/credits.test.mjs` | `costMicros`, `creditsFor`, `sumUsage`, `settleBuild`, `estimateCredits` |
| `tests/build-narration.test.mjs` | `describePath`, `narrateTool` |
| `tests/feedback-intent.test.mjs` | `classifyFollowUp` |
| `tests/site-seo.test.mjs` | `siteBaseUrl`, `applySeo`, `robotsTxt`, `sitemapXml` |
| `tests/seo-head.test.mjs` | `applyHead`, `escapeAttr` |
| `tests/moderation.test.mjs` | the heuristic rules, `blockingFindings`, the provider seam |
| `tests/assets.test.mjs` | `findAssets`, `getAsset`, `listAssets`, `assetCatalogSummary` |
| `tests/flags.test.mjs` | `rolloutBucket`, `clampRolloutPct`, the flag/spec vocabulary |
| `tests/zip.test.mjs` | `zipStream` — CRC, STORE-vs-deflate, zip-slip, DOS dates, structure |
| `tests/open-bugs.test.mjs` | **fails on purpose** — see below |

Every test in the first nine files pins behaviour that is correct today,
including a regression case for each of the bugs found by hand over the last
few days: `creditsFor(0)`, the `colou?r` plural, the `applySeo` entity round
trip, `"CTASection.tsx"`, and `"french flag"`.

## Known failures

`tests/open-bugs.test.mjs` asserts the behaviour the code claims — in its own
comments — and every test in it fails today. They are not `skip`ped and not
marked `todo`, because a suite that quietly tolerates a known-wrong answer is
how the answer stays wrong. Each test names the file and line, and each goes
green the moment the bug is fixed, with no rewriting.

1. **`lib/site-seo.ts:155-160` — `og:title` still double-escapes.** The entity
   round trip was fixed for `description` (line 142 decodes first) but the
   `og:title` upsert passes the already-encoded title straight to `escapeHtml`,
   so "Bloom & Co" reaches link previews as `Bloom &amp; Co`. Same bug, same
   module, on the tag link previews read first.
2. **`$`-substitution in `String.prototype.replace` replacements** —
   `lib/site-seo.ts:114,117,135` and `app/api/projects/[id]/seo/head.ts:23,40,41`.
   The replacement is built as a string, so `$&`, `` $` ``, `$'` and `$1` are
   interpreted as substitution patterns. `escapeHtml`/`escapeAttr` do not
   escape `$`, and `$` is ordinary in a business name ("Everything $1 Store").
   `` $` `` splices the entire preceding document into a meta attribute, and
   `applySeo` runs on every read of every published site. Fix: pass a replacer
   function.
3. **Prototype-chain membership guards** — `lib/flags.ts:167` (`isFlagKey`) and
   `app/admin/health/data.ts:22` (`isWindowKey`), plus the unexported twins at
   `app/admin/users/page.tsx:37` and `app/admin/content/page.tsx:53`.
   `app/admin/sites` was fixed by switching to `hasKey`
   (`app/admin/sites/ui.tsx:25`); four guards of the same shape were left
   behind. `?sort=constructor` and `?window=constructor` are reachable 500s,
   and in `lib/flags.ts` the guard is the only thing stopping `setFlag` from
   writing a junk key. Fix: `Object.hasOwn`, or reuse `hasKey`.
4. **`lib/assets/index.ts:126,543` — `"american flag"` returns American Samoa.**
   The `DEMONYMS` comment claims the fix covers "american"; it does not.
   France and the UK only win because the score tie is broken by
   `id.localeCompare` and the alphabet happens to run the right way
   (`flag:fr` < `flag:gf`, `flag:gb` < `flag:io`). For the US it runs the wrong
   way (`flag:as` < `flag:us`).
5. **`lib/assets/index.ts:505-512` — `findAssets("coffee shop")` returns `[]`.**
   That is the docstring's own example. `shop` expands to
   store/shopping/cart/bag, the coffee icon carries none of them, so every
   entry misses a token.
6. **`lib/feedback-intent.ts:56-69` — `"the copy is generic"` buckets as
   `visual`.** That phrase is the module header's headline example of a
   *content* complaint. "generic" sits in the visual pattern and visual is
   tested before content, so "copy" never gets a look in — the dashboard the
   module exists to feed files copy complaints under styling. Same class as the
   `colou?r` plural bug: an over-broad token in a higher-priority rule.

None of these were fixed here: the change that added this suite was scoped to
`tests/` and `scripts/test/` and explicitly forbidden from touching application
code.

## Adding a test

Put it in the file for the module it covers. Import the module by relative path
from `tests/` (`../lib/credits.ts`) or through the alias (`@/lib/credits`) —
both resolve. Prefer a fixture that looks like something a real user would
produce over a minimal string; most of the false-positive cases in
`tests/moderation.test.mjs` only mean anything because they read like real
pages.
