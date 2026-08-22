# Deploy runbook

How to ship this checkout to staging and production without the two things
that have actually gone wrong here: a deploy that reports success while
running stale code, and code that arrives ahead of the schema it needs.

`deploy.sh` handles the transport and refuses to finish if the deployed commit
is not the one it shipped. It does **not** handle anything else. In
particular:

> **`deploy.sh` runs no database migrations and schedules nothing.**

That single sentence is the reason this runbook exists.

Environment variables appear by **name** only. Host addresses are the `HOST`
and `VM` values at the top of `deploy.sh` and are not repeated here.

---

## The ordering hazard, stated once

**This release adds seven models and two columns.** New models: `Event`,
`LoginAttempt`, `EmailLog`, `AdminAuditLog`, `FeatureFlag`,
`ModerationFinding`, `SupportNote`. New columns: `User.spendCapCredits` and
`Build.repairAttempts`.

`deploy.sh` fetches commits, runs `npm ci`, runs `npm run build`, and restarts
the service. Nothing in that chain touches the database schema. So if the code
ships first, the new code starts serving against a schema that has none of
those tables, and it fails at runtime — on login (`LoginAttempt`), on every
analytics write (`Event`), on every admin page that reads the new tables, and
on the flag lookups that guard generation and publishing.

**Therefore: `prisma db push` runs on staging and on production BEFORE the
code that needs it ships to that environment.**

The reverse order is safe, and this is why. Every change in this release is
**additive**: new tables, plus two columns that are nullable or defaulted. The
currently-deployed code has no knowledge of them and will not select them, so
a database that is ahead of its code behaves exactly as before. A database
that is behind its code does not.

There is no `prisma/migrations/` directory in this repo — `db push` is the
mechanism, not `migrate deploy`. That means the ordering discipline is the
only safety net; there is no migration history to reconcile against.

---

## Pre-flight

Run from your workstation, in a clean checkout.

```bash
git rev-parse --abbrev-ref HEAD        # must be main
git status --porcelain                 # must be empty
npx tsc --noEmit                       # must be clean
npx eslint app lib components          # must be clean
```

`deploy.sh` enforces the first two itself and aborts otherwise. The last two
are on you: the deploy builds on the VM, and a type error there costs a failed
deploy and a restart rather than ten seconds locally.

Also confirm, before you start:

- **Which commit each environment is on now.** `deploy.sh` prints prod's SHA
  as the rollback point, but read staging's too — it is routinely behind, and
  the bundle is cut from the older of the two.
- **The VM's own `/home/kodely/deploy.sh` must not be used.** It resets to
  `origin/main`, and the VM cannot currently reach GitHub over SSH, so that
  ref is stale. This is exactly how a healthy-looking deploy shipped the wrong
  commit twice on 2026-08-21. Always deploy with this repo's `deploy.sh`,
  which transports commits as a git bundle.
- **Environment variables are not deployed.** `.env*` is gitignored, so each
  box keeps its own. If this release reads a name the box does not define,
  the feature is silently inert rather than loudly broken — the shape most
  likely to be missed. Check these names on both boxes before shipping:
  `KODELY_CRON_SECRET` (notifications fail closed with a 404 and simply never
  send when it is unset or shorter than 16 characters), `KODELY_FOUNDATION_DIR`,
  `KODELY_SITES_BASE`, `KODELY_STAGING_HOST`, `KODELY_ADMIN_HOST`,
  `KODELY_REWARDS_ID_SALT`. Names only — never write a value into a document,
  a ticket, or a chat message.

---

## Step 1 — Push the schema to **staging**, before the code

Land the new schema file on the box without touching the checkout, then push
it into the staging database.

```bash
# from your workstation
scp prisma/schema.prisma <via the SSH path deploy.sh uses>:/tmp/kodely-schema.prisma

# on the VM
cd /opt/kodely-staging
npx prisma db push --schema /tmp/kodely-schema.prisma --skip-generate
```

Three details that matter:

- **`--schema /tmp/…`, not the checkout's copy.** The checkout still holds the
  *old* schema at this point; that is the whole premise of running this first.
- **`cd /opt/kodely-staging` first.** The Prisma CLI reads `DATABASE_URL` from
  the `.env` in the working directory. Standing in the wrong directory pushes
  the wrong database, and nothing will tell you.
- **`--skip-generate`.** Without it, `db push` regenerates the Prisma client
  in place, which swaps the client underneath the *currently running* old code.
  Harmless for an additive change, unnecessary, and not the kind of surprise
  you want mid-deploy. `npm ci` regenerates it properly during the deploy
  anyway, via the `postinstall` hook.

**Read the plan before confirming.** `db push` prints what it intends to do.
Expect only `CREATE TABLE`, `ALTER TABLE … ADD COLUMN` and `CREATE INDEX`. If
it proposes to drop or alter anything, **stop** — that means the target
database has drifted from what this schema expects, and pushing anyway will
lose data. Never pass `--accept-data-loss` to get past that prompt.

---

## Step 2 — Deploy the code to staging

```bash
./deploy.sh --staging
```

It bundles the commits, applies them, `npm ci`, `npm run build`, restarts
`kodely-staging`, and then verifies: the deployed `HEAD` must equal the commit
just shipped, and `/api/health`, `/`, `/pricing`, `/blog`, `/contact` must all
return 200.

**Do not read that verification as "staging is healthy."** `/api/health`
touches no dependencies, and the other four are static marketing pages. The
entire suite passes with the database unreachable. Its real job is catching a
stale deploy and a process that failed to come back up.

---

## Step 3 — Verify staging properly

The parts that exercise the new schema:

- **`/admin/health`** — the database check green, the foundation checks green,
  no new failure family.
- **One real generation, end to end.** This is the only check that covers SDK
  auth, the foundation tree, the vite compile and the `Event` writes at once.
- **One sign-in.** It writes `LoginAttempt` rows; a missing table shows up
  here first.
- **`/admin/flags`, `/admin/audit`, `/admin/sites`** — each reads one of the
  new tables.
- **`/status`** — unauthenticated. It should report the app operational and,
  once the generation above lands, site generation with a real success rate.
- **The export route**, if this window is the one shipping it — see step 6.

---

## Step 4 — Push the schema to **production**, before the code

Identical to step 1, against the production checkout's environment:

```bash
cd /opt/kodely
npx prisma db push --schema /tmp/kodely-schema.prisma --skip-generate
```

Same three details, same rule about reading the plan. This is the highest-risk
command in the whole sequence: it is the one that stands in a directory whose
`.env` points at the production database.

---

## Step 5 — Deploy the code to production

```bash
./deploy.sh
```

A full run re-deploys staging first (a no-op if it is already on the same
commit) and then production, verifying each. It prints the pre-deploy prod SHA
as `rollback:` — **write it down before you close the terminal.**

Then repeat step 3 against production, and check `/status` from a browser that
has never had a session on the site, which is the only way to see the page the
way a customer does.

---

## Step 6 — Blog-content corrections, in the **same window** as the export feature

This is a coupling, not a cleanup task, and it does not survive being deferred
to next week.

`scripts/seo/correct-live.mjs` applies literal, idempotent find-and-replace
edits to `BlogPost` rows that live only on the production database. One group
of corrections is gated behind `--gate export-shipped` because those sentences
are **only true once the export route is deployed**. Today the live pages
correctly say the feature does not exist.

That creates a window with a wrong answer on both sides:

- Apply the corrections **before** the export deploy, and 30+ live pages claim
  a feature that is not there.
- Apply them **long after**, and the same pages tell people a shipped feature
  does not exist.

There is no safe ordering other than the same window. So, immediately after
step 5 verifies:

```bash
# on the VM, in /opt/kodely
node scripts/seo/correct-live.mjs --gate export-shipped                # dry run first
node scripts/seo/correct-live.mjs --gate export-shipped --apply
```

Notes on operating it:

- **Dry run is the default**; writing requires `--apply`.
- Passing the gate flag is you asserting the export route is live. Confirm it
  actually is — download a `.zip` from a project on production — before you
  type it.
- Every edit is an exact literal string, never a regex, and re-running is a
  no-op. A literal that no longer matches changes nothing and is reported
  loudly.
- The script **checks its own work**: after applying, it sweeps every row for
  the claims it was supposed to correct and exits non-zero if any residue
  remains, including on the live posts this repo has no copy of. A non-zero
  exit means the job is not finished — read the reported context, do not
  re-run and hope.

---

## Rollback

**Code rolls back. Schema does not, and must not.**

- **Code.** Take the SHA `deploy.sh` printed as `rollback:`, check it out in
  `/opt/kodely`, `npm ci`, `npm run build`, restart the unit. Verify with the
  same `HEAD`/`BUILD_ID` pair.
- **Schema.** Leave it. The new tables and columns are additive; the older
  code ignores them entirely. Trying to "roll back" a `db push` means dropping
  tables that may already hold rows — `AdminAuditLog` is append-only and
  `Event` starts filling immediately. There is no scenario in this release
  where reversing the schema is the right move.
- **Behaviour, without any deploy.** For a bad feature rather than a bad
  build, `/admin/flags` is faster and safer than a rollback:
  `generation.enabled`, `publishing.enabled`, `signups.enabled`,
  `rewards.enabled`, `feature.prompt_enhance`, `feature.sdk_engine`. Flipping
  a row takes effect within one flag-cache TTL with no build and no restart —
  which is precisely why they are rows and not environment variables.

---

## After the deploy — the things nothing does for you

`deploy.sh` schedules nothing, so these stay manual until someone installs
them:

- **Data retention.** `scripts/retention.mjs` is dry-run by default and no
  timer runs it. See §4 of `docs/retention.md` for the cron entry, and run the
  first pass by hand without `--apply`.
- **Notifications.** The cron-triggered run at `/api/notifications/run`
  requires `KODELY_CRON_SECRET` and returns 404 when it is unset, so nothing
  sends and nothing complains.
- **Monitoring.** Still none. The deploy verified five URLs once, at deploy
  time, from your workstation. Nothing checks them again.
