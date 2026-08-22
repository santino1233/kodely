# Deploy preflight

```bash
node scripts/preflight.mjs            # read this before you touch deploy.sh
node scripts/preflight.mjs --json     # same answers, for scripting
node scripts/preflight.mjs --strict   # warnings also make the exit non-zero
```

`docs/ops/runbook-deploy.md` is the procedure. This is the part of it a machine
can check, so that getting one step out of order stops being a memory test.

**It is read-only.** No migration, no `db push`, no `git fetch`, no deploy, no
file written. Every git command is a read — `git ls-remote` contacts the remote
but updates no ref — and every database statement is a `SELECT` or a Prisma
read. It changes nothing and it fixes nothing; it tells you what to go and fix.

**It never prints an environment variable's value**, masked or otherwise. Env
vars appear by name only. The one identifying thing it prints about the
database is the name `current_database()` reports back — a server answer, not a
substring of `DATABASE_URL` — because "which database am I actually pointed at"
is the question step 4 of the runbook says gets answered wrong.

## Exit codes

| Code | Meaning |
|------|---------|
| `0` | No blockers. Warnings may still be listed — read them. |
| `1` | At least one BLOCKER. Do not deploy. |
| `2` | Warnings only, and `--strict` was passed. |
| `3` | The checker itself failed to run. Treat as unknown, not as pass. |

Warnings do not fail the run by default, deliberately. Several of them are the
*correct* state in some environments — billing is meant to be off on staging,
and a stale local `.next` is irrelevant because `deploy.sh` builds on the VM. A
checker that blocks on those gets `|| true`-d into uselessness within a week,
and a bypassed checker catches nothing. Use `--strict` where the environment is
known and every warning has been decided on.

## BLOCKERS

### `git-branch` — On branch main
`deploy.sh` aborts on anything else, and the bundle it cuts is `BASE..main`, so
a non-`main` HEAD ships something you did not verify.
**Fix:** `git switch main`.

### `git-clean` — Working tree clean
`deploy.sh` dies on a dirty tree. The more dangerous half: it ships *commits*,
so anything uncommitted is absent from the deploy while still being exactly what
you tested locally.
**Fix:** commit or stash.

### `git-remote` — HEAD matches the real origin/main
This is the local face of the hazard that shipped the wrong commit twice on
2026-08-21. The VM's own `/home/kodely/deploy.sh` runs
`git fetch && git reset --hard origin/main`; the VM cannot reach GitHub over
SSH, so the fetch fails, the reset lands on a **stale remote-tracking ref**, and
the deploy reports healthy on the wrong code. This repo's `deploy.sh` sidesteps
it by transporting a bundle, but `refs/remotes/origin/main` *in your checkout*
has the same property: it is only as fresh as your last successful fetch.

So the check asks the remote directly with `git ls-remote` and compares three
things — the live remote tip, your cached ref, and HEAD:

- **HEAD behind the live remote → BLOCKER.** Someone pushed work you do not
  have. **Fix:** `git fetch origin main && git rebase origin/main`.
- **Cached ref ≠ live remote → WARNING.** Your local `origin/main` is stale.
  Nothing is broken yet, but every `git log origin/main..HEAD` you run is
  answering from a cache. **Fix:** `git fetch origin main`.
- **`ls-remote` fails → WARNING.** Staleness is now unverifiable. `deploy.sh`
  will refuse anyway — it does its own fetch and dies with "cannot reach GitHub
  from here".

### `db-reachable` — Database answers a real query
Runs `SELECT current_database(), now()`. A real round trip, not a connection
open. **Check the database name it prints against the one you meant.**

This exists because `deploy.sh`'s verification cannot see it: `/api/health`
returns a static JSON literal and `/`, `/pricing`, `/blog`, `/contact` are
static marketing pages. All five return 200 during a total database outage.

**Fix:** the database, before anything else.

### `schema-drift` — Database schema matches prisma/schema.prisma
**The most valuable check here.** `deploy.sh` fetches commits, `npm ci`s,
builds, and restarts. Nothing in that chain touches the schema, and there is no
`prisma/migrations/` directory — `db push` is the mechanism, run by hand, so
ordering is the only safety net.

Direction is the whole point:

- **Database missing something the schema declares → BLOCKER.**
  Code-ahead-of-schema. The new code starts serving against tables that are not
  there and dies at runtime: on login (`LoginAttempt`), on every analytics write
  (`Event`), on every admin page, on the flag lookups that guard generation and
  publishing.
- **Database has something the schema does not → WARNING.**
  Schema-ahead-of-code, which is safe and is the point of the runbook's
  ordering. Running code cannot select what it does not declare. This is also
  the expected shape after a code rollback — the runbook is explicit that schema
  is never rolled back. **Do not drop anything to tidy this up.**
- An `ALTER COLUMN` whose direction cannot be inferred is reported verbatim and
  counted as a blocker. Safer than guessing "harmless".

**Fix (missing objects):** push the schema to *this* environment before the code
reaches it, per steps 1 and 4 of the runbook:

```bash
cd <the checkout whose .env points at this database>
npx prisma db push --schema /tmp/kodely-schema.prisma --skip-generate
```

Read the printed plan. Only `CREATE TABLE` / `ALTER TABLE … ADD COLUMN` /
`CREATE INDEX` is expected. If it proposes a `DROP` or an `ALTER`, **stop** —
the target has drifted and pushing loses data. Never `--accept-data-loss`.

<details>
<summary>How drift is computed, and why that way</summary>

Primary method:

```
prisma migrate diff --from-schema-datasource prisma/schema.prisma \
                    --to-schema-datamodel   prisma/schema.prisma --script
```

It introspects the live database and prints the SQL that would turn it into what
`schema.prisma` declares. An empty script means no drift. Four reasons it is the
right tool:

1. **No shadow database.** A shadow DB is only needed when a migration *history*
   has to be replayed (`--from-migrations` / `--to-migrations`). Both endpoints
   here are direct — a live datasource and a datamodel file — so nothing is
   replayed and nothing is created. Verified against this checkout: it runs
   clean with no `--shadow-database-url` and no `CREATEDB` rights.
2. **It is read-only.** `migrate diff` computes and prints; only `migrate dev`
   and `db push` write.
3. **It knows the whole surface** — types, defaults, nullability, indexes,
   unique constraints, enums — not just whether a column of that name exists. A
   name-only comparison silently passes a column that exists with the wrong
   type, which is exactly what an interrupted `db push` leaves behind.
4. **`--from-schema-datasource`** reads `DATABASE_URL` out of the datasource
   block, so the connection string never appears in `argv` and never lands in a
   process listing. `--from-url <url>` would.

Fallback: an `information_schema` comparison against a parsed `schema.prisma`,
used automatically when the Prisma CLI is absent or errors for a
non-connectivity reason, and forceable with `--no-prisma-diff`. It compares
presence of tables and columns only — **no types** — and says so in its output,
rather than presenting a weaker answer as if it were the same one.

</details>

### `admin-account` — At least one ADMIN account exists
No account currently has `role = ADMIN`, which makes the entire admin section
unreachable by everyone. Two things depend on it and both are post-deploy:

- Step 3 of the runbook verifies the release through `/admin/health`,
  `/admin/flags`, `/admin/audit` and `/admin/sites`.
- The documented way to kill a bad feature **without** a rollback is flipping a
  row on `/admin/flags`.

**Fix:** `node scripts/promote-admin.mjs <email>` — run it against *this*
database. `DATABASE_URL` differs per environment, so promoting yourself locally
does nothing on staging or prod.

### `env-required` — Required environment variables are set
`DATABASE_URL`, plus the generation credential that `KODELY_ENGINE` selects:

- `KODELY_ENGINE` unset or anything but `sdk` → the `api` engine →
  **`ANTHROPIC_API_KEY`** is required.
- `KODELY_ENGINE=sdk` → **`CLAUDE_CODE_OAUTH_TOKEN`**, *or* a
  `~/.claude/.credentials.json` written by `claude setup-token`. Either is
  sufficient; the check accepts both. Without one, `assertSdkCredentials()`
  throws on every build, and there is deliberately no fallback to the metered
  key.

**Fix:** set them on the box. `.env*` is gitignored and nothing deploys it, so
each environment keeps its own. Names only in tickets and chat — never a value.

### `foundation` — Foundation tree is usable
`lib/build-site.ts` symlinks `$KODELY_FOUNDATION_DIR/node_modules` into every
throwaway build directory and spawns node against
`node_modules/vite/bin/vite.js` inside it. The check verifies the directory
exists, has `node_modules`, and contains that exact entrypoint. Both the default
path and the entrypoint are read back out of `lib/build-site.ts` rather than
hardcoded, so the check cannot silently drift from the code it checks.

When `KODELY_FOUNDATION_DIR` is unset the code falls back to
`/home/kodely/kodely-foundation`. That is correct on the VM and resolves to
nothing anywhere else — which is why this is a check on the *resolved directory*
rather than on the variable being set. Every generation then fails with a
`Cannot find module` that names vite rather than the missing foundation, so the
failure is reliably misdiagnosed.

**Fix:** set `KODELY_FOUNDATION_DIR` for this machine, then
`node scripts/install-foundation.mjs`.

## WARNINGS

### `env-features` — features that are silently inert
The runbook calls this the shape most likely to be missed: nothing throws,
nothing logs, the feature simply never happens. Each one is listed with the
names that are unset and what stops working.

The two that cost real money or real trust:

- **`KODELY_REWARDS_ID_SALT`** — `identitySecret()` returns `null` and
  `grantReward` is never reached. **No reward is ever granted.** Also inert if
  the value is under 16 characters, which this check cannot see.
- **`KODELY_CRON_SECRET`** — `POST /api/notifications/run` fails closed with a
  404. The cron fires, nothing sends, nothing complains. Same effect under 16
  characters.

Also covered: Stripe (billing off, checkout 503), SMTP (contact mail and every
notification skipped), Google sign-in, the Discord reward, `APP_URL` (falls back
to `https://kodely.me` — correct on prod, wrong on staging, where a checkout
success bounces the user to production), `KODELY_SITES_BASE`,
`KODELY_STAGING_HOST`, `KODELY_ADMIN_HOST`, `LOGIN_KEY_SALT`.

A group flagged `PARTIALLY configured` is worse than one that is wholly unset —
half a Stripe or SMTP config reads as "configured" in some code paths.

**Fix:** decide per environment which of these is intentional, then set the rest.

### `env-empty` — a variable defined as an empty string
The app reads these as `process.env.X ?? "default"`. `??` substitutes only for
`undefined` and `null`, so an empty value passes straight through and the
documented default **never applies**. A `NAME=` line in a `.env` is
indistinguishable from a correct one at a glance, which makes this strictly
worse than leaving the variable out.

**Fix:** give it a real value, or delete the line entirely. Deleting is what
restores the default.

### `build-freshness` — local `.next` is older than the newest source file
A warning and not a blocker, and the distinction matters: `deploy.sh` runs
`npm ci && npm run build` on the VM from the commits it transports, so a stale
local `.next` cannot ship. It only misleads *you* — anything you check against a
local `next start` right now is the old build.

**Fix:** `npm run build`, or ignore it if you are not verifying locally.

### `health-shallow` — deploy verification depth
Static check on `app/api/health/route.ts`: it imports nothing and touches no
dependency. There is nothing to fix before this deploy. The point is to stop you
reading a green `deploy.sh` as "the release works" — its real job is catching a
stale commit and a service that did not come back up. Step 3 of the runbook is
the actual verification, and the `db-reachable` and `schema-drift` checks are
this tool's substitute for the part `deploy.sh` cannot see.

The warning clears on its own if `/api/health` ever starts touching the database.

### `content-coupling` — blog claims vs. what is shipping
Triggers when `app/api/projects/[id]/export/route.ts` is present in the tree,
i.e. this deploy makes the project zip download real. Live `BlogPost` rows
currently state there is no zip or full-project download — true today, false the
moment this ships — and those rows live only on the production database. This
repo has no copy of 42 of them, so no build and no test will ever notice.

Both orderings are wrong, which is why it has to be the same window:

- Corrections **before** the export deploy → 30+ live pages claim a feature that
  is not there.
- Corrections **long after** → the same pages tell people a shipped feature does
  not exist.

**Fix**, immediately after step 5 verifies — not the next morning:

```bash
# on the VM, in /opt/kodely
node scripts/seo/correct-live.mjs --gate export-shipped            # dry run, the default
node scripts/seo/correct-live.mjs --gate export-shipped --apply
```

Passing the gate is you asserting the route is live — download a `.zip` from a
real project on production first. The script sweeps every row afterwards and
exits non-zero on residue; a non-zero exit means it is **not** finished. Read
the reported context; do not re-run and hope.

## What this does NOT check

Not a substitute for the runbook. Known gaps:

- **Ordering itself.** Nothing can verify "schema was pushed before the code
  arrived" after the fact. The `schema-drift` check is the instrument: run it
  against each environment *before* deploying to that environment, and again
  after the `db push`.
- **The remote boxes.** Every check runs against this checkout and the database
  this directory's `.env` points at. Staging's and production's schema, env
  vars, foundation tree and admin roster are all separate answers — run this
  from a checkout pointed at each, or accept that you have only checked one.
- **Secret *values*.** It sees that `KODELY_REWARDS_ID_SALT` and
  `KODELY_CRON_SECRET` are set; it cannot see that they meet the 16-character
  minimum both features enforce, because reading the value to measure it is
  exactly what it must not do.
- **The VM's stale-ref condition.** Detectable only from the VM, and this tool
  opens no SSH connection. The mitigation is procedural: never use the VM's own
  `/home/kodely/deploy.sh`.
- **Anything scheduled.** `deploy.sh` schedules nothing. Data retention
  (`scripts/retention.mjs`), the notifications cron, and monitoring are still
  manual and still absent — see the end of the runbook.
