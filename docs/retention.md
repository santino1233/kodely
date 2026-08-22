# Kodely data retention policy

Owner: Kodely operator (single-operator today).

This is the document a privacy policy can quote. Every number in it is
enforced by code, not by intention: the policy lives in `lib/retention.ts` and
is executed by `scripts/retention.mjs`. If the two ever disagree with this
page, the code is right and this page is stale — fix it.

Board context: before this existed there was no pruning, cron or retention job
anywhere in the repo, which meant the only honest thing a privacy policy could
say about any of this data was "retained indefinitely."

`app/legal/privacy/page.tsx` still says exactly that — "Kodely does not run any
automatic deletion job", "Analytics events are retained indefinitely" — and it
says nothing at all about form submissions, the admin audit log, moderation
findings or sign-in attempt records. Every period on this page is written so
that it can be quoted into that section verbatim. Editing that page is outside
the scope of the change that wrote this, so the two are out of step until
somebody makes the edit; **the code is the policy, this page describes it, and
the privacy page currently understates what is deleted.**

---

## 1. What we keep, and for how long

| Data | Retained | Enforced by |
| --- | --- | --- |
| Sign-in sessions | Deleted as soon as they expire (30 days) | `sessions` |
| Rollback snapshots of your site | The 20 most recent checkpoints per project, always at least 30 days | `build-snapshots` |
| Product analytics events | About 13 months (400 days) | `events` |
| Stripe webhook receipts | 12 months (365 days) | `stripe-events` |
| Messages sent through a form on a published site | 12 months (365 days) | `form-submissions` |
| The same, flagged as spam | 30 days | `form-spam` |
| Admin records of **viewing** customer data | 6 months (180 days) | `admin-audit-reads` |
| Admin records of **changing** anything | Permanently | — (never pruned) |
| Moderation findings, once reviewed | About 13 months (400 days after review) | `moderation-findings` |
| Moderation findings, not yet reviewed | Until reviewed | — (never on a timer) |
| Failed sign-in / signup attempt records | About 25 hours | `lib/rate-limit.ts`, not this job |
| Record that we sent you an email | Until your account is erased | — (never on a timer) |
| Your projects, files, chat and build history | Until **you** delete them | — (never on a timer) |
| Credit ledger | Permanently | — (never pruned) |

### Plain-language version, for a privacy policy

> **Sessions.** We delete expired sign-in sessions immediately. A session
> lasts 30 days.
>
> **Site checkpoints.** Every successful build saves a full copy of your
> site so you can roll back to it. We keep the 20 most recent checkpoints for
> each project, and never remove a checkpoint less than 30 days old. Older
> checkpoints beyond that depth are removed; the build history entry stays.
>
> **Analytics.** We keep a record of product actions (signed up, created a
> project, build started, build succeeded, published) for about 13 months, and
> then delete it. These records contain no prompt text and no generated
> content.
>
> **Payments.** We keep a receipt of each processed payment notification for
> 12 months. Your credit ledger — every credit granted, spent or refunded — is
> a financial record and is kept permanently.
>
> **Messages sent through your site's forms.** When a visitor fills in a form
> on a site you published, the message is stored on Kodely so you can read it
> in your dashboard. We keep it for 12 months and then delete it, whether or
> not you have read it. Messages our filters flag as spam are kept for 30 days
> — long enough for a wrongly flagged message to be recovered and for us to
> measure how often the filter is wrong — and then deleted. These messages
> belong to the person who sent them: they are never used for anything except
> showing them to you, rate-limiting abuse, and emailing you a copy.
>
> **Moderation checks.** When a publish is checked for abuse, anything the
> check flags is recorded, with the snippet that triggered it. A finding stays
> until an operator reviews it; once reviewed, it is deleted 13 months later.
> Findings survive account deletion on purpose, so that deleting an account is
> not a way to erase the record of an abuse attempt — but they are not kept
> forever.
>
> **Staff access records.** When a member of staff opens a page that shows your
> account, prompts, feedback or billing, we record who they were and when. We
> keep those access records for 6 months. Records of staff *changing* something
> — taking a site offline, changing a setting, writing a support note — are
> kept permanently, because they are the only record that the change happened.
>
> **Sign-in attempts.** To stop password guessing and bulk signups we record
> each attempt as a timestamp against either the network address it came from
> or a one-way hash of the email address typed in — never the address itself.
> These are deleted automatically about 25 hours later.
>
> **Emails we sent you.** We keep one small row per transactional email (which
> kind, and when) for as long as your account exists. It is what stops the same
> message being sent twice, and it appears in your data export. Erasing your
> account deletes it.
>
> **Your work.** Your projects, files, messages and build history are kept for
> as long as you keep them. Deleting a project deletes them; deleting your
> account deletes all of them. Neither is on a timer, and neither can be
> undone.
>
> **Account deletion.** Your analytics events are detached from your account
> immediately (the user id is removed, and cannot be re-attached), and the rows
> themselves are deleted within 400 days under the rule above.

---

## 2. Why each number

Full reasoning, including the readers that were checked, is in the comments in
`lib/retention.ts`. Short version:

**Expired sessions — deleted immediately, no grace period.**
`lib/auth.ts` already refuses an expired session at read time, so the row has
no remaining function. What it still has is a user id in a table forever.
Keeping data whose only surviving property is "could be breached" is pure
liability.

**Rollback snapshots — newest 20 per project, floor of 30 days.**
`Build.filesSnapshot` is a full JSON copy of the source tree *and* the compiled
build output, written after every successful build. It is by far the largest
thing the database stores: on the development database, real snapshots measure
about **105 kB each after compression** — roughly one fifth of the entire
`ProjectFile` table per single build.

Nothing in the product caps how far back restore reaches
(`app/api/projects/[id]/builds/route.ts` lists every successful build with no
limit), so there was no existing depth to copy and 20 is a judgement call made
deliberately deep. Rollback is used to undo the last few edits. The 30-day
floor exists so that someone iterating hard for an afternoon — who can bury a
checkpoint past rank 20 within hours — never loses rollback mid-session.

**Analytics events — 400 days.**
The product does not need this. Every aggregate reader in `lib/events.ts`
(`activationFunnel`, `greenBuildRate`, `followUpIntents`, `buildRatings`) takes
a window, and every caller in `app/admin` passes **30 days**. 400 days exists
purely so year-over-year comparison stays possible: 365 days plus a month of
reporting slack, which is the shortest window that still answers "how does this
August compare to last August".

*Re-checked* now that build ratings and follow-up intents are stored here too.
The number holds. The two feedback surfaces (`app/admin/feedback/page.tsx` and
`app/admin/feedback/notes/[userId]/page.tsx`) read newest-first with a `take`,
so what is displayed is unaffected; the lifetime "N ratings" count beside the
list shrinks after a purge, which is the same trade already accepted for the
lifetime event count on the admin user page. One reader is genuinely affected
and is recorded as a known gap in §6 below: `scanSitePublished` in
`lib/notifications/scan.ts` counts `project.published` events **over all time**
to decide whether a publish is a first publish.

**Form submissions — 365 days, and 30 days if flagged as spam.**
This is the only rule that deletes something a person is waiting to read, so
the number was chosen against readers rather than against disk. Kodely holds
the **only copy**: the owner notification in `lib/site-forms.ts` is
fire-and-forget, is skipped once a project exceeds `EMAIL_MAX_PER_HOUR`, and is
never sent at all for a flagged row. The dashboard shows the newest 200 per
project, so no age-based rule changes what is on screen; the abuse throttles
read a 24-hour window, so any period beyond a day leaves them intact. A year is
the shortest period that still covers the real way a small business reaches
back into a contact inbox ("we heard from them last spring"), and it is a clean
commitment for data belonging to a third party who never had an account here.

The 30-day period for spam is the deliberate asymmetry. The schema keeps
flagged rows rather than dropping them for two stated reasons, and 30 days is
what each actually needs: a false positive is only *recoverable* while the
enquiry still matters to the person who sent it, and a false-positive *rate*
needs a sample and a denominator, not an archive — and a recent sample measures
today's rules rather than last winter's. Spam is also the one class here whose
volume is chosen by the attacker and the one class no product surface delivers:
flagged rows are never emailed and never counted in the unread badge.

**Admin audit — 180 days for reads, permanent for writes.**
An audit log with a short retention defeats itself; one with no retention
becomes a permanent record of which operator opened which customer's account,
which is the second data-protection problem `lib/admin-audit.ts` explicitly
warns against in its own header. So the log is split along the `read`/`write`
classification that file **already declares** in `ADMIN_ACTION_INFO`, rather
than along a list invented here — which means a newly declared write action is
protected the moment it exists, and any action name not in that vocabulary is
left alone.

All of the volume is on the read side: one short browsing session measured
**144 rows**, because `site.viewed` is written on every render of the site
detail page, back button included. 180 days is sized to the question a read row
answers — "who looked at this account, and when" — which is asked when a
customer complains, when a supervisory authority asks, or when an operator's
credentials are suspected. Those arrive within weeks or months of the access,
not years, and six months spans two quarterly reviews with room for a late
complaint. Beyond that the row has stopped being oversight.

Writes are never pruned; see §3.

**Moderation findings — 400 days after review, and never before it.**
A reviewed finding and an unreviewed one are different objects. Unreviewed is
an open work queue — `app/admin/sites/page.tsx` counts it, the site registry
lists the projects it points at, and the takedown page gates on it — so nothing
ages one out (§3). A reviewed finding has already done its job; what is left is
the false-positive measurement the table exists for, and 400 days matches the
analytics window deliberately so the policy has one "about 13 months" to
explain instead of two.

**The clock runs from `reviewedAt`, not `createdAt`**: a finding raised two
years ago and reviewed this morning is not eligible today. What this gives up,
plainly: `true_positive` rows are evidence of a real abuse attempt, and
`app/api/account/_deletion.ts` keeps findings through account erasure precisely
so that requesting deletion is not a way to wipe the evidence and start again
clean. That argument is about re-registering next week and survives a 400-day
period intact — but a repeat abuser returning after fourteen months does meet a
clean slate. The alternative is holding the flagged snippet of every blocked
publish forever, which is not a promise worth making for that case.

**Stripe webhook receipts — 365 days.**
`StripeEvent` rows exist only to dedupe webhook redeliveries — the billing
webhook inserts one *before* granting credits and relies on the unique-key
conflict. Stripe abandons automatic retries within about 3 days, so a year is
roughly a hundredfold margin. Residual risk, stated plainly: a **manual**
resend from the Stripe dashboard of an event older than a year would no longer
be deduped and could grant credits twice. A year-old manual resend warrants a
human look regardless.

---

## 3. What is deliberately never deleted

**`CreditLedger` — permanently retained. Never prune this.**
It is an auditable financial record. The credit balance is *derived* from the
ledger rather than stored as a counter, so removing any row rewrites history
and can change a live balance. It survives project deletion by design
(`buildId` becomes null, the row stays).

**`Build` rows.** Only the `filesSnapshot` column is ever cleared; the row
itself stays for the life of the project. Two readers make deletion unsafe:
the admin overview and the admin user page both aggregate `costMicros` and
`creditsCharged` over *all* builds for lifetime unit economics, and
`CreditLedger.buildId` points at builds with `ON DELETE SET NULL`, so deleting
builds silently detaches spend from the thing that caused it.

**`Build.prompt`.** Free text the user wrote, and therefore a tempting
redaction target — but it is the visible label of every checkpoint in the
history panel. Redacting old prompts would turn old checkpoints into
unlabelled rows. It lives and dies with the project.

**`ProjectFile`, `Message`, `Project`.** The user's actual work. Deleted when
the user deletes the project or the account, never on a timer.

**`EmailLog` — never pruned on a timer. The safe retention here is "never".**
This is the one table where deleting a row causes a **wrong action** rather
than a missing statistic. The row *is* the claim: the unique
`(kind, dedupeKey)` is what makes a transactional send exactly-once, so
removing a row re-arms that send. `dedupeKey` is the id of the thing that
triggered the mail — a ledger row, a build, a project — deliberately **not** a
timestamp, which is what makes the guarantee independent of scheduling and also
means a claim never expires. There is therefore no age at which dropping one is
safe.

The concrete duplicate-send path is `site_published`, whose key is a project
id. A republish is held back from re-mailing by a lifetime count of
`project.published` events in `lib/notifications/scan.ts` — a count the 400-day
event rule eventually empties — which leaves this row as the last thing between
a republish and a second email. It is also reader-facing: the account export
returns it as `emailsSent`. And it is tiny.

Stated honestly: **nothing writes this table today.** `lib/notifications/send.ts`
dedupes in a process-local `Map` that resets on deploy, so the durable guard is
declared in the schema and not yet wired up. That makes this exactly the wrong
moment to also put it on a timer. Its lifecycle is per person, not per clock —
account erasure deletes a user's rows (`app/api/account/_deletion.ts`).

**`AdminAuditLog` rows whose action is a `write`.** For one action the log is
not a record of the change, it is the *only* record: takedown is not a column
anywhere, so `app/admin/sites/page.tsx` reconstructs which sites were taken
down by grouping `site.taken_down` rows. Pruning them would silently
un-take-down sites in the registry view. Writes are also rare and small — a
takedown, a flag flip, a support note — so keeping them forever costs nothing.

**`ModerationFinding` rows with `reviewedAt` still null.** Ageing one out would
mean discarding an abuse report *before anybody read it*, and removing the flag
that says the site needs looking at. A retention job silently emptying a review
queue is the worst failure available to this job. The growth this leaves
unbounded is bounded by doing the reviews; once reviewed, the 400-day rule takes
them.

---

## 4. Data with a period this job does not enforce

**`LoginAttempt` — about 25 hours, pruned by `lib/rate-limit.ts`.**

The rows are the pre-auth rate limiter's counter: one per consumed attempt,
keyed by a client IP or a salted digest of an email address, never a plaintext
address. `lib/rate-limit.ts` prunes anything older than its longest rule window
plus an hour of slack, batched, on its own reconcile timer (every 10 minutes).

That file argues at length that the rule does not belong in `lib/retention.ts`,
and **the argument is correct**. Every rule in this policy answers "how long
should we keep data that still means something", and each one has a reader
behind it. A `LoginAttempt` past the longest window means nothing to anybody:
no query reaches it, no verdict changes because of it, and the only file that
touches the table is the limiter itself — verified, every `db.loginAttempt`
call site is in `lib/rate-limit.ts`. It is spent counter state, and sweeping it
is part of operating the counter.

Two further reasons not to move it, both stronger than the tidiness argument
for moving it. Correctness would become a scheduling problem: nothing runs this
job yet, so a table on the login path would grow unbounded until a cron entry
exists. And a **second** pruner would be actively unsafe — two cutoffs racing,
with the shorter one winning, and a cutoff shorter than the limiter's longest
window deletes rows still inside a live rule window, handing an attacker back
guesses they have already spent. Duplicating the prune is worse than either
choice.

What *was* missing is a stated period, because a privacy policy has to say how
long an IP address is kept and "something else deletes it" is a different
sentence from "we do not delete it". So the period is recorded in
`PRUNED_ELSEWHERE` in `lib/retention.ts` and printed by the runner on every
run, without the job pretending to own it.

---

## 5. Running it

```bash
node scripts/retention.mjs                    # dry run — the default
node scripts/retention.mjs --only events      # dry run, one rule
node scripts/retention.mjs --apply            # actually delete
```

Rule keys: `sessions`, `build-snapshots`, `events`, `stripe-events`,
`form-submissions`, `form-spam`, `admin-audit-reads`, `moderation-findings`.
They are printed in the table on every run, along with what is never pruned and
the one period enforced elsewhere.

`--dry-run` is the default and needs no flag; **deleting requires typing
`--apply`.** Counting and deleting are separate functions in
`lib/retention.ts` — the counting path issues SELECTs only and physically
cannot delete — so the dry-run table is trustworthy rather than a
`if (dryRun)` branch away from the real thing.

Deletes are batched (500 rows per statement) and each pass re-runs its
selection instead of paging by offset, so the job never holds a long lock and
can be interrupted and resumed safely.

`DATABASE_URL` is read from `.env` by the same parser the eval harness uses
(`scripts/eval/loader.mjs`). The run prints the host and database name it is
about to touch — check it before typing `--apply`.

### Scheduling

Nothing schedules this today: `deploy.sh` deploys and restarts the service and
sets up no timers. Add a cron entry on the VM as the `kodely` user (prod lives
at `/opt/kodely`):

```cron
# Kodely data retention — 04:15 daily, off-peak. Logs kept for post-hoc review.
15 4 * * * cd /opt/kodely && /usr/bin/node scripts/retention.mjs --apply >> /var/log/kodely-retention.log 2>&1
```

Two notes on operating it:

- **Do the first run by hand, without `--apply`**, and read the table. The
  first enforcement after a long unpruned period is the largest one this job
  will ever do.
- **Postgres does not return freed space to the filesystem.** Deleted rows go
  onto each table's free list and are reused; autovacuum reclaims them in the
  background. If disk needs to come back immediately, `VACUUM` the affected
  tables by hand. `VACUUM FULL` rewrites and takes an exclusive lock — do not
  run it casually on a live database.

---

## 6. Known gaps

**1. A republish can be congratulated twice.** `scanSitePublished` in
`lib/notifications/scan.ts` decides whether a publish is a *first* publish by
counting `project.published` events for that project **over all time**, and
treating `> 1` as a republish. That count is a correctness guard, and the
400-day event rule empties it: a project first published more than 400 days ago
and republished today counts 1, and is mailed "your site is live" a second
time. The comment on that function — that events outlive anything it looks back
at — is true of the 15-minute slot it scans and not true of this count.

The cost is one duplicate congratulation email, not a wrong charge or a leak,
and the backstop is already in the schema: `EmailLog`'s unique
`(kind, dedupeKey)` makes a second `site_published` for the same project
impossible — once something writes `EmailLog`, which nothing does yet. Note the
direction: shortening the event window makes this *more* likely, not less. The
fix is either to bound that count to the project's own lifetime window, or to
wire the `EmailLog` insert that `lib/notifications/send.ts` currently replaces
with an in-process `Map`. Both are outside this file.

**2. Lifetime counters shrink.** Three "N in total" figures are computed over
whole tables and will report smaller numbers after a purge: total events on the
admin user page, total build ratings on the feedback page, and a project's
total form submissions on its inbox page. All three are context stats beside a
list that is itself unaffected (every list reads newest-first with a `take`).
None is a financial or legal record. Accepted, not overlooked.

**3. Form submissions are not in the account export.**
`app/api/account/export/route.ts` returns projects, files, messages, builds,
ledger, events, notes, email records and moderation findings — but not
`FormSubmission`. So this policy now deletes something at 12 months that a
person cannot currently export at all. That is a gap in the export, not a
reason to keep the data longer, and closing it is a change in `app/`.

**4. An operator can disappear from the audit filter.** `listAdminActors`
builds the actor filter by grouping the whole log, so an admin whose only
activity was *reads*, all older than 180 days, stops being offered as a filter
option. Their writes, if any, keep them on the list. The "outstanding work"
list on `/admin/audit` is unaffected: it is driven by `emittedBy` in
`ADMIN_ACTION_INFO`, not by row counts, precisely because "no rows" and
"nothing is watching" are different conditions.

**5. Fixed since this page was written.** Clearing an old `filesSnapshot` used
to leave a dead checkpoint in the history panel. Both readers now filter on
`filesSnapshot: { not: Prisma.DbNull }` — `app/api/projects/[id]/builds/route.ts`
and `app/projects/[id]/page.tsx` — so a pruned checkpoint no longer appears and
cannot be clicked. Kept here as a record of the interaction, since the
`build-snapshots` rule still depends on those two filters staying in place.
