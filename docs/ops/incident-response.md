# Incident response

What to do when Kodely breaks, written from the failures that have actually
happened to this system rather than from a generic template.

**Read this first, because it changes how everything below works.** There is
no uptime monitoring, no alerting, no paging and no on-call rotation. Nothing
watches this service. Every "how you notice" section below is therefore a
description of a real, unreliable detection path — usually a person looking,
or a customer complaining — and not a promise that anyone will be told. The
public status page at `/status` is computed when someone loads it; it is not a
monitor and it stores no history.

Secrets discipline in this file matches the rest of the repo: environment
variables appear by **name** only, never by value. Host addresses are not
repeated here either — they are the `HOST` and `VM` values at the top of
`deploy.sh`, and the security audit already flags committing them once
(`docs/security/audit-2026-08.md`, L11) as more than enough.

---

## The three things worth knowing before an incident

**1. `/api/health` proves almost nothing.** It returns `{ ok: true }` from the
process with no dependency touched — a deliberate liveness probe. The
application can be answering it perfectly while the database is unreachable
and every generation is failing. `deploy.sh`'s verification loop curls it plus
four static pages, so **a deploy can pass verification during a total database
outage.**

**2. `/admin/health` is the real diagnostic.** It clusters `Build.error` into
failure families and names which of them is *our config*, *the host*, *the
model* or *the visitor*, plus presence checks for the database, the engine
credentials, the foundation tree and the integrations. Nearly every incident
below is identified there in one screen. It is admin-only and deliberately so.

**3. `/admin/flags` can stop the bleeding without a deploy.** The kill
switches — `generation.enabled`, `publishing.enabled`, `signups.enabled`,
`rewards.enabled` — take effect within one flag-cache TTL with no build and no
restart. Given this project's history of deploys shipping stale code, reaching
for a flag is almost always safer than reaching for a deploy mid-incident. A
process that has read the table even once keeps serving its last-known-good
snapshot through a database outage, so flags are not a lever you can rely on
while Postgres is down.

---

## How you actually find out

| Path | Latency | Covers |
| --- | --- | --- |
| A customer emails via `/contact` | Hours to never | Anything user-visible |
| You open `/admin/health` | Only when you look | Generation, dependencies |
| You open `/status` | Only when you look | The three public components |
| `deploy.sh` verification fails | Deploy time only | Process up, five URLs 200 |
| Stripe dashboard delivery failures | Only when you look | Billing webhook |

That is the whole detection surface. Everything else in this document assumes
you have already noticed.

---

## First five minutes

Do these in order. They are cheap and they discriminate between the families
below quickly.

1. **`https://kodely.me/status`** — does it load at all? If it does not, the
   application itself is down; skip to *Database unreachable* only after
   checking the service is running, because the status page renders from the
   app process.
2. **`curl -s -o /dev/null -w '%{http_code}' https://kodely.me/api/health`** —
   200 means the Next.js process is alive. It means nothing else.
3. **`/admin/health`** — read the failing dependency checks first, then the
   failure families. A `config`-blamed family on top means no amount of
   retrying or prompt work will help.
4. **On the VM: `systemctl status kodely` and `journalctl -u kodely -n 200`**
   — the full error text lives here and only here. `/admin/health` withholds
   database errors because they can echo the connection string; the log is
   where you read them.
5. **Compare deployed code to what you think is deployed** —
   `cd /opt/kodely && git rev-parse --short HEAD` against your workstation's
   `git rev-parse --short HEAD`. This is a two-second check that has caught a
   real incident twice.

---

## Family 1 — SDK subscription auth expired

The single largest cause of build failures observed to date. On the
development database **75% of all local build failures were this one
incident**, not many independent ones.

**Signature.** Every generation fails, in seconds, costing nothing. Error text
is `Not logged in · Please run /login`, `Failed to authenticate. API Error:
401 OAuth access token is invalid`, or `KODELY_ENGINE=sdk but no subscription
credentials were found`.

**How you notice.** `/admin/health` shows *SDK subscription auth* at or near
100% of failures. The duration panel is the corroborating tell: failures
returning an order of magnitude faster than successes means the run never
reached the model. On the development database that contrast was **p50 3.2s
for failures against 167.8s for successes**. Without someone looking, the
first signal is a customer saying every build fails instantly.

**How you confirm.** On the app host, as the user the service runs as: is
`CLAUDE_CODE_OAUTH_TOKEN` set in the service environment, or does
`~/.claude/.credentials.json` exist? Note the trap — `/admin/health` checks
**presence, not validity**. An expired or revoked token reads as OK there and
still fails every build. The failure family is the authoritative signal, not
the dependency check.

**How you fix.**

- Re-authenticate: run `claude setup-token` **as the service account**, not as
  your own login. A token in the wrong user's home directory is invisible to
  the service.
- Or set `CLAUDE_CODE_OAUTH_TOKEN` in the service environment and restart the
  unit.
- If re-authentication is not immediately possible, turn `generation.enabled`
  off at `/admin/flags` so users get a clean "temporarily unavailable" instead
  of burning attempts on a guaranteed failure. Turn it back on before you
  verify.
- There is deliberately **no fallback to the metered API engine**. Do not add
  one under time pressure; that is how an incident becomes a bill.

**How you verify.** Run one real generation end to end and watch it succeed.
Nothing short of that is proof, because every cheaper check is presence-only.
Then reload `/admin/health` and confirm no new members of the family appear.

---

## Family 2 — Foundation directory misconfigured

The second-largest cause, and the one that lies to you about what is wrong.
It has bitten twice.

**Signature.** Builds fail with `Cannot find module`, `MODULE_NOT_FOUND`, or
`Build could not start`, which reads like a defect in the generated site and
is not. On Windows hosts the classic form is
`EPERM: operation not permitted, symlink 'C:\home\kodely\kodely-foundation\node_modules' -> …`
— that path is the giveaway: `KODELY_FOUNDATION_DIR` was unset, so
`lib/build-site.ts` fell back to its Linux default `/home/kodely/kodely-foundation`,
which on Windows resolves under the drive root and does not exist.

**How you notice.** `/admin/health` shows the *Foundation tree missing* family
and, above it, one or more of the three foundation dependency checks failing.

**How you confirm.** Those three checks are deliberately separate, and you
want to know which one fails:

1. *Foundation directory* — the path exists.
2. *Foundation node_modules* — the shared tree inside it exists.
3. *Vite entrypoint* — `node_modules/vite/bin/vite.js`, the exact file
   `lib/build-site.ts` spawns, is on disk.

A directory that exists but is incomplete fails exactly like no directory at
all, which is why check 3 exists.

**How you fix.** Set `KODELY_FOUNDATION_DIR` to a real absolute path in the
service environment, then run `node scripts/install-foundation.mjs` on that
host as the service user, then restart the service. On Windows, note that
`lib/build-site.ts` uses an NTFS junction rather than a symlink precisely
because a directory symlink needs elevation — if you are seeing EPERM on a
Linux host instead, look at filesystem permissions on the foundation tree, not
at the code.

**How you verify.** All three foundation checks green on `/admin/health`, then
one real generation that compiles. The checks alone are not enough: they prove
the files are present, not that vite can run them.

---

## Family 3 — Database unreachable

**Signature.** Everything that reads data fails; the process stays up.

**How you notice.** This is the incident the tooling is worst at announcing.
`/api/health` still returns 200 — it touches nothing. `deploy.sh` verification
still passes on `/api/health` and can pass on the static marketing pages too.
The honest signals are: `/status` reporting *Published-site serving: Outage*,
`/admin/health` degrading to dependency checks only, or a customer reporting
that the dashboard is empty.

**How you confirm.** `/admin/health` runs `SELECT 1` first and on its own, and
reports the latency. It **withholds the driver's message on purpose**, because
a Postgres connection error can echo the DSN. Read the real error from
`journalctl -u kodely`. Then check whether Postgres itself is up on the VM and
whether the `DATABASE_URL` in the service environment still points where you
think it does — a `db push` run against the wrong target is a plausible cause
in this environment.

**How you fix.** Restore Postgres, or correct `DATABASE_URL` and restart the
service. Do not attempt a deploy as a remedy: `deploy.sh` runs `npm run build`
on the box, and a build that needs the database will fail in a second,
unrelated way and confuse the timeline.

**How you verify.** `/admin/health` shows the database check green with a
sane latency (over 1000ms is flagged as *warn* for a reason), `/status` returns
*Published-site serving: Operational*, and one published site loads on its
`*.kodely.site` subdomain.

**Caution.** Flag reads fall back to per-flag declared defaults when the
database cannot be read by a cold process. Do not conclude a kill switch is
"stuck" during a database outage; check it again once the database is back.

---

## Family 4 — A deploy shipped stale code

This has genuinely happened, twice on 2026-08-21, and it reported success both
times.

**Signature.** The deploy says it worked. The service restarted. The change is
not live.

**Root cause, stated plainly.** The VM cannot reach GitHub over SSH. The VM's
own `/home/kodely/deploy.sh` runs `git fetch origin main && git reset --hard
origin/main`; when the fetch fails, `origin/main` is a **stale
remote-tracking ref**, so the reset succeeds against the wrong commit and
everything downstream looks healthy. This repo's `deploy.sh` exists to avoid
that path — it ships commits over SSH as a git bundle and refuses to finish
unless the deployed `HEAD` equals the commit it just shipped.

**How you notice.** Ideally, `deploy.sh` aborting with `<env> is on <sha>,
expected <sha> — deploy did not take`. Otherwise: the feature you shipped is
missing, or a bug you fixed is still there.

**How you confirm.**

```bash
# on your workstation
git rev-parse --short HEAD
# on the VM (both environments)
cd /opt/kodely         && git rev-parse --short HEAD && stat -c %y .next/BUILD_ID
cd /opt/kodely-staging && git rev-parse --short HEAD && stat -c %y .next/BUILD_ID
```

Three ways this shows up, and they need different fixes:

- **HEAD is old** — the transport did not land. The bundle path failed, or
  someone ran the VM's own script.
- **HEAD is right but `BUILD_ID` is old** — the code landed and `npm run
  build` did not, so the service is serving the previous compile.
- **Both are right and behaviour is still wrong** — you are looking at a
  cached response, or at the other environment.

**How you fix.** Re-run `./deploy.sh` from a clean checkout on your
workstation. Never run the VM's own `deploy.sh` while GitHub is unreachable
from the VM. If you must intervene by hand, `git fetch` from the transferred
bundle and `git reset --hard FETCH_HEAD` — do not reset to `origin/main` on
the VM, which is the stale ref that caused this. To roll back, `deploy.sh`
prints the pre-deploy prod SHA as `rollback:` at the end of every run; check
that SHA out on the VM, rebuild, and restart.

**How you verify.** Deployed `HEAD` equals your local `HEAD`, `BUILD_ID` is
newer than the deploy started, `systemctl is-active` reports the unit running,
and — the only real check — the actual behaviour you shipped is present in the
running app.

**Related hazard, from the same root.** `deploy.sh` runs **no database
migrations**. A release that adds models or columns will deploy "successfully"
and then fail at runtime against an old schema. See
`docs/ops/runbook-deploy.md`; that ordering is a deploy-time discipline, not
an incident-time fix.

---

## Family 5 — Stripe webhook failures

Money has moved and the product does not know.

**Signature.** A customer paid and has no credits.

**How you notice.** Almost certainly the customer, via `/contact`. The
secondary path is the Stripe dashboard's event log showing failed deliveries.
Nothing in the app alerts on this.

**How you confirm.** Work from Stripe's event log inward:

1. Did Stripe deliver the event, and what status did it get back? A 4xx/5xx
   there means the request never completed — check `journalctl -u kodely`
   around that timestamp.
2. Is there a `StripeEvent` row for that event id? The webhook claims that row
   **before** granting credits, deliberately, so that a redelivery cannot
   double-grant.
3. Is there a matching `CreditLedger` row for the user?

The dangerous combination is **row 2 present, row 3 absent**: the claim
committed and the grant then failed, so every Stripe retry sees the duplicate
key and returns `{ deduped: true }`. The customer paid, silently received
nothing, and Stripe considers the delivery successful. This is finding L1 in
the security audit and it is the failure mode to check first.

Two configuration causes worth ruling out before anything else: signature
verification failing (the webhook rejects before any of the above happens, so
there will be **no** `StripeEvent` row) and billing being inert because
`STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` are not both set in the service
environment. `/admin/health` reports the latter as a presence check.

**How you fix.** Restore correct configuration and restart, then reconcile the
affected customer's credits from the ledger. There is no admin credit-grant UI
today, so a grant is a deliberate, written-down manual operation against
`CreditLedger` — record what you did and why, because that table is the
financial record and is retained permanently
(`docs/retention.md`). Note that the ledger's read-then-write shape is racy
(audit M1), so do it while nothing else is granting for that user. Do **not**
ask Stripe to resend an event older than a year: `StripeEvent` rows are pruned
at 365 days, so a manual resend past that point is no longer deduplicated and
can grant twice.

**How you verify.** Stripe shows the delivery succeeded; the user's balance
matches what they bought; `/admin/users` shows no ledger drift for that
account.

---

## Family 6 — Abuse report on a published site

**Signature.** Someone reports that a `*.kodely.site` page is phishing, hosting
malware, impersonating a brand, or is a spam farm.

**How you notice.** Inbound report, a registrar or host complaint, or a
confirmed moderation finding. `ModerationFinding` rows record sub-blocking
findings that did not stop a publish, which is the proactive path — it needs
someone to look.

**How you confirm.** Open the site yourself before acting. Then find it under
`/admin/sites` and read the project's findings. Judge the page, not the
report: a takedown is visible to the owner and reversible only by them
republishing.

**How you fix.** Use the takedown flow at `/admin/sites/<id>/takedown`.

- It requires **typing the slug** and picking a reason from a fixed list
  (`abuse_report`, `moderation_finding`, `phishing`, `malware`, `spam`,
  `legal`, `other`). Both guards are enforced server-side, not just in the
  browser.
- It clears `Project.publishedAt` and writes an `AdminAuditLog` row in the
  **same transaction**, so a site can never go dark with no record of who
  darkened it.
- **Nothing is deleted.** Published files, the draft tree and the slug all
  survive; the owner can republish. If the intent is that they must not, the
  takedown is not the whole action — turn `publishing.enabled` off, or handle
  the account.
- For a wave rather than a single site, `publishing.enabled` at `/admin/flags`
  stops all new public pages immediately with no deploy.

**How you verify.** The site's URL returns 404 on its `*.kodely.site`
subdomain, and the row appears in `/admin/audit`.

**Say this correctly when you reply to the report.** The site route sends
`Cache-Control: public, max-age=60` and nothing purges a cache. The origin
answers 404 immediately, but a cached copy can survive about a minute and an
open tab keeps what it has until reloaded. Treat a takedown as effective
within a minute, and do not quote a to-the-second timestamp to a reporter.

---

## Communicating during an incident

`/status` derives itself and stores nothing, so there is no incident banner to
post and no history to update. That is a real gap, not a style choice.

What the page *will* do on its own: report *Site generation: Degraded* or
*Outage* once recent build outcomes move, and *Published-site serving: Outage*
if the origin cannot read published content. It publishes no cause, and it
must not — build error text can contain a customer's source code.

Until there is somewhere to post an incident, the honest options are a direct
reply to affected customers and a note in the changelog after the fact.

---

## What would make any of this real

In rough order of value per hour spent:

1. **An external uptime check** on `https://kodely.me/api/health` from
   somewhere that is not the VM. Nothing today would tell you the box is down.
2. **A generation canary** — one scheduled build whose failure notifies
   someone. It is the only check that covers SDK auth, the foundation tree and
   the compile path at once, and those are the top two failure families.
3. **Somewhere for an alert to go.** An alert with no destination is a log
   line.
4. **An incident log.** Even a markdown file. This document was written from
   evidence recovered out of a database, which is not a repeatable method.
5. **A status page that can be edited by hand**, so a human can say what is
   happening during the outage the automated page cannot see.
