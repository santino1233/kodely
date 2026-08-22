import { Prisma } from "@prisma/client";
import { ADMIN_ACTION_INFO } from "./admin-audit";
import { db } from "./db";

// Data retention policy — the single place that decides how long Kodely keeps
// anything. docs/retention.md is written FROM this file; scripts/retention.mjs
// is the runner that executes it. Nothing here runs on its own: a cron entry
// has to call the script (see docs/retention.md), so until that exists this
// module only describes the policy.
//
// Two rules shape the whole design:
//
// 1. COUNTING AND DELETING ARE SEPARATE FUNCTIONS, never one function with a
//    `dryRun` flag. A flag means the dry run and the real run share a code
//    path that branches on a boolean at the last moment, and the thing you
//    reviewed is not quite the thing that ran. Here `count()` physically
//    cannot delete: it issues SELECTs only.
// 2. NOTHING IS PRUNED THAT A PRODUCT FEATURE READS. Every rule below names
//    the readers that were checked and what happens to them. Where a reader
//    exists, the rule either backs off or is not written at all — see
//    NEVER_PRUNED at the bottom, which is the more important half of a
//    retention policy.
//
// Three lists at the bottom, not one, because the policy has to be complete
// before it can be quoted: RETENTION_RULES (what this job deletes),
// NEVER_PRUNED (what is kept on purpose, and why), and PRUNED_ELSEWHERE (data
// that has a real period which something else enforces — today only
// LoginAttempt, swept by lib/rate-limit.ts). A table missing from all three is
// a table nobody has decided about.

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

/**
 * Expired sessions are purged with no grace period.
 *
 * lib/auth.ts already treats `expiresAt < now` as signed-out at read time
 * (getCurrentUser returns null), so an expired row has no function whatsoever.
 * What it still is, is a userId sitting in a table forever. Keeping data whose
 * only remaining property is "could be breached" is pure liability, so the
 * grace period is zero rather than a token few days.
 */
export const SESSION_GRACE_DAYS = 0;

/**
 * How many of a project's most recent successful builds keep their
 * `filesSnapshot` (the rollback checkpoint).
 *
 * app/api/projects/[id]/builds/route.ts lists EVERY successful build as a
 * restore point, with no `take` — so at the product level restore currently
 * reaches back forever, and there is no existing depth to copy. 20 is
 * therefore a judgement call, made deliberately deep: rollback is used to undo
 * the last few edits, and a user who has scrolled past twenty checkpoints is
 * not rolling back, they are archaeology. Combined with the age floor below,
 * a project churning fifty builds in a fortnight loses nothing.
 *
 * KNOWN EDGE — see docs/retention.md: the list route selects only
 * {id, prompt, createdAt, filesWritten} and never checks whether the snapshot
 * survives, so a cleared checkpoint still appears in the history panel and
 * fails with "Checkpoint not found." when clicked. Fixing that properly means
 * filtering the list route, which is out of scope here; the depth below is set
 * so that the stale entries are ones nobody realistically clicks.
 */
export const SNAPSHOT_KEEP_PER_PROJECT = 20;

/**
 * Floor under the rule above: a snapshot is never cleared while it is younger
 * than this, no matter how many newer builds have buried it. This is what
 * protects an active session — someone iterating hard all afternoon can push a
 * checkpoint past rank 20 within hours, and losing rollback mid-session
 * because you worked fast would be the worst possible failure of this job.
 */
export const SNAPSHOT_MIN_AGE_DAYS = 30;

/**
 * Analytics events.
 *
 * Every aggregate reader in lib/events.ts (activationFunnel, greenBuildRate,
 * followUpIntents, buildRatings) takes a `sinceDays` window, and every call
 * site in app/admin passes 30. The only unwindowed readers are on the admin
 * user-detail page: a journey list capped at `take: 100` (unaffected — it
 * shows the newest rows) and a lifetime `db.event.count`, which will report a
 * smaller number after a purge. That count is a support-context stat, not a
 * financial or legal record, so shrinking it is acceptable.
 *
 * So the product needs 30 days and nothing needs more. 400 days is not for the
 * product, it is for year-over-year: a full 365-day cohort comparison plus a
 * month of reporting slack, which is the shortest honest window that still
 * lets you answer "how does this August compare to last August". It rounds to
 * a clean public statement — "about 13 months".
 *
 * RE-CHECKED after build ratings and follow-up intents started landing here.
 * Three readers exist now that did not when 400 was chosen. The number still
 * holds, but two of them lose something and one of them is a correctness
 * interaction that has to be stated rather than absorbed:
 *
 *  * app/admin/feedback/page.tsx reads `build.rated` newest-first with
 *    `take: WINDOW`, so the visible list is untouched — but beside it sits a
 *    LIFETIME `db.event.count({ name: build.rated })`. That number shrinks
 *    after a purge. Same class as the lifetime count already accepted on the
 *    admin user page: a context stat, not a financial or legal record.
 *  * app/admin/feedback/notes/[userId]/page.tsx reads one user's ratings
 *    newest-first with `take: RATING_LIMIT`. Unaffected.
 *  * lib/notifications/scan.ts scanSitePublished counts `project.published`
 *    events for a project OVER ALL TIME and treats `> 1` as "this is a
 *    republish, do not mail again". That count is a correctness guard, and it
 *    is the one reader here that a purge can actually break: a project first
 *    published more than 400 days ago and republished today loses its old
 *    event, counts 1, and is mailed "your site is live" a second time. The
 *    comment on that function says events outlive anything it looks back at,
 *    which is true of the 15-minute slot it scans and NOT true of this count.
 *
 *    The consequence is one duplicate congratulation email, not a wrong
 *    charge or a leak, and the backstop already exists in the schema:
 *    EmailLog's unique (kind, dedupeKey) makes a second `site_published` for
 *    the same project impossible — once something writes EmailLog, which
 *    nothing does yet (see NEVER_PRUNED). Shortening the event window would
 *    make this MORE likely, not less, so the answer is not a smaller number
 *    here; it is bounding that count in scan.ts or wiring EmailLog, both
 *    outside this file. Recorded in docs/retention.md as a known gap.
 */
export const EVENT_RETENTION_DAYS = 400;

/**
 * Form submissions from published sites that are NOT flagged as spam.
 *
 * These are the one thing this job deletes that somebody is waiting to read.
 * A row here is a real enquiry sent to a real small business through a form
 * on their generated site, and Kodely holds the only copy: the owner
 * notification in lib/site-forms.ts is fire-and-forget, is skipped entirely
 * once a project passes EMAIL_MAX_PER_HOUR, and is skipped for anything
 * flagged. So the readers were checked before a number was chosen:
 *
 *  * app/projects/[id]/submissions/page.tsx shows the newest PAGE_SIZE = 200
 *    per project — untouched by any age-based rule — beside a LIFETIME
 *    `count` of the project's submissions, which shrinks after a purge.
 *  * app/projects/[id]/page.tsx counts unread, non-spam rows for the inbox
 *    badge. A year-old unread enquiry stops being counted when it is deleted.
 *    Stated plainly rather than hidden: this rule deletes read and UNREAD
 *    submissions alike. Protecting unread rows forever sounds kinder and is
 *    not — it would make an abandoned project's inbox the one table nothing
 *    can ever clean up, which is exactly how "we keep everything forever"
 *    happens.
 *  * lib/site-forms.ts reads a 24-hour window for its per-IP and per-project
 *    throttles. Any period longer than a day leaves the abuse limits intact.
 *  * app/api/forms/[projectId]/route.ts only marks rows read.
 *  * NOT in app/api/account/export/route.ts. Submissions are absent from the
 *    account export, which is its own gap and not this file's to close.
 *
 * A year is the shortest period that still covers "I know we got an enquiry
 * from them last spring" — the actual way a small business reaches back into a
 * contact inbox — and it is a clean thing to state in a privacy policy for
 * data belonging to a third party who never had an account here.
 */
export const FORM_SUBMISSION_RETENTION_DAYS = 365;

/**
 * Form submissions FLAGGED as spam, which age out an order of magnitude
 * faster than real ones. The schema asks for these to be kept rather than
 * dropped, for two stated reasons, and 30 days is what each of them actually
 * needs:
 *
 *  * "a false positive is recoverable" — recoverable BY SOMEBODY, within the
 *    time an enquiry is still worth recovering. The honeypot and timing checks
 *    in lib/site-forms.ts fire on the visitor's own request; a person who was
 *    wrongly flagged and heard nothing back will have phoned, emailed or given
 *    up long before a month is out. Keeping their message for a year does not
 *    make it more recoverable, it just holds it.
 *  * "the rate is measurable" — a rate needs a sample and a denominator, not
 *    an archive. Thirty days of both classes measures it, and measures the
 *    CURRENT rules rather than the ones that were live last winter.
 *
 * The asymmetry also goes the right way under attack. Spam is the only class
 * here whose volume is chosen by the attacker, and it is the class no product
 * surface delivers: flagged rows are never emailed to the owner and never
 * counted in the unread badge. Holding an attacker's traffic for as long as a
 * customer's enquiries would be a strange promise to make.
 */
export const FORM_SPAM_RETENTION_DAYS = 30;

/**
 * Admin audit rows that record a READ, as opposed to a write.
 *
 * This is the rule that was hardest to justify, and the split is what makes it
 * defensible at all. A short retention on an audit log defeats the log; an
 * unbounded one turns it into a permanent record of which operator opened
 * which customer's account, which is its own data-protection problem wearing
 * the clothes of a solution — lib/admin-audit.ts says exactly that about the
 * log's own contents.
 *
 * So the two halves are not treated the same, using the classification that
 * file ALREADY declares (`kind: "read" | "write"` in ADMIN_ACTION_INFO) rather
 * than a second list invented here:
 *
 *  * WRITES are never pruned. An unrecorded write means state changed and
 *    nothing anywhere says who changed it. They are also rare and small — a
 *    takedown, a flag flip, a support note — so keeping them forever costs
 *    nothing. See NEVER_PRUNED.
 *  * READS age out at 180 days. Volume is entirely on this side: a single
 *    short browsing session measured 144 rows, because `site.viewed` is
 *    written on every render of app/admin/sites/[id]/page.tsx, back button
 *    included.
 *
 * Why 180 and not 30 or 3650. The question a read row answers is "who looked
 * at this account, and when" — asked when a customer complains, when a
 * supervisory authority asks, or when an operator's credentials are suspected.
 * All three arrive within weeks or a few months of the access, not years, and
 * six months spans two quarterly reviews with room for a complaint to be filed
 * late. Beyond that the row has stopped being oversight and become the surveil-
 * lance record the log itself warns against.
 *
 * Readers checked, all in lib/admin-audit.ts unless noted:
 *
 *  * listAdminActions — newest-first paging with a filtered `total`. The page
 *    is unaffected; the total shrinks for read actions.
 *  * countAdminActions — per-action row counts. NOT the source of the
 *    "outstanding work" list, which is driven by `emittedBy` in
 *    ADMIN_ACTION_INFO precisely because a zero count and a missing emitter
 *    are different conditions. So pruning cannot fabricate a work order — a
 *    filter count is all that moves.
 *  * listAdminActors — everyone who has ever appeared. An admin whose only
 *    activity was reads, all older than 180 days, drops off the actor filter.
 *    Their writes, if any, keep them on it.
 *  * app/admin/sites/[id]/page.tsx — one project's audit trail, newest
 *    AUDIT_LIMIT. Loses old views of that site; keeps every takedown.
 *  * app/admin/sites/page.tsx runs a raw GROUP BY over `site.taken_down` rows
 *    to reconstruct which sites were taken down, because takedown is not a
 *    column anywhere. That query is the reason writes are never pruned: this
 *    log IS the takedown record, and pruning it would silently un-take-down
 *    sites in the registry view.
 */
export const ADMIN_AUDIT_READ_RETENTION_DAYS = 180;

/**
 * Moderation findings that a human has REVIEWED, measured from the review, not
 * from the finding.
 *
 * Reviewed and unreviewed rows are not the same object. An unreviewed finding
 * is an open work queue — app/admin/sites/page.tsx counts it, the site registry
 * lists the projects it points at, and app/admin/sites/[id]/takedown/page.tsx
 * gates on it. Deleting one on a timer would mean quietly discarding an abuse
 * report nobody ever read, which is the single worst thing this job could do.
 * Those are never pruned (see NEVER_PRUNED), whatever their age.
 *
 * A reviewed finding has already done its job: someone looked, wrote an
 * outcome, and either acted or dismissed it. What remains is measurement — the
 * false-positive rate that gates promoting a rule from "recorded" to
 * "blocked", which is what the table's schema comment says it exists for.
 * 400 days matches EVENT_RETENTION_DAYS deliberately, so the two longitudinal
 * measurements this product keeps expire together and the policy has one
 * "about 13 months" to explain instead of two.
 *
 * THE CLOCK RUNS FROM reviewedAt. A finding raised two years ago and reviewed
 * this morning is not eligible today — the retention is on the closed case,
 * not on the incident, so nothing can be deleted the week a human first looked
 * at it.
 *
 * What this gives up, said plainly: `outcome: "true_positive"` rows are
 * evidence of an actual abuse attempt, and app/api/account/_deletion.ts keeps
 * findings through account erasure on exactly that basis — so that requesting
 * deletion is not a way to wipe the evidence and start again clean. That
 * argument is about someone re-registering next week, and it survives intact:
 * 400 days is far longer than any plausible re-registration cycle. It does mean
 * a repeat abuser returning after fourteen months meets a clean slate. The
 * alternative is holding the `evidence` snippets of every blocked publish for
 * ever, which is not a promise worth making for that case.
 *
 * Readers checked: app/admin/sites/page.tsx (lifetime `count`, unreviewed
 * `count`, and a groupBy over UNREVIEWED rows only — untouched by this rule);
 * app/admin/sites/[id]/page.tsx (per-project newest FINDINGS_LIMIT, per-project
 * count, and a whole-table count used only to distinguish "scanned clean" from
 * "nothing has ever been written"); app/admin/sites/[id]/takedown/page.tsx
 * (per-project counts); app/admin/sites/actions.ts (findUnique + update on
 * review); and app/api/account/export/route.ts, which returns a person's own
 * findings in their data export — a purge shortens that export, which is the
 * correct direction for erasure but worth knowing about.
 */
export const MODERATION_REVIEWED_RETENTION_DAYS = 400;

/**
 * Stripe webhook idempotency records.
 *
 * app/api/billing/webhook/route.ts inserts one row per Stripe event id BEFORE
 * granting credits, and relies on the resulting P2002 unique conflict to
 * dedupe. Delete a row and that event id could be granted a second time if it
 * were ever redelivered. Stripe's automatic retries run out inside ~3 days, so
 * 365 days is roughly a hundredfold margin — but note the residual risk
 * honestly: a MANUAL resend from the Stripe dashboard of an event older than a
 * year would no longer be deduped. That is a deliberate trade for a table that
 * otherwise grows forever, and the mitigation is human: a year-old manual
 * resend should be checked by hand anyway.
 */
export const STRIPE_EVENT_RETENTION_DAYS = 365;

/**
 * Rows touched per statement. Deliberately modest: this job runs against the
 * live database while people are using the product, and the point of batching
 * is that no single statement holds locks long enough to be noticed. A bigger
 * batch would finish sooner and serve users worse.
 */
export const BATCH_SIZE = 500;

/**
 * Hard stop on the batch loop. Every loop below terminates on its own because
 * each pass narrows the candidate set, but "should terminate" is not a
 * property worth betting a production table on. If a delete ever silently
 * affects zero rows, this is what stops the script instead of spinning.
 */
const MAX_BATCHES = 20_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** What a rule would remove. Produced by SELECTs only. */
export type RetentionCount = {
  /** Rows the rule would delete (or, for snapshots, blank out). */
  rows: number;
  /** Rows currently in the target table, for context. */
  total: number;
  /**
   * Estimated bytes reclaimed, or null when it cannot be estimated. Postgres
   * returns freed space to the table's own free list, not to the filesystem,
   * until the table is vacuumed — see docs/retention.md.
   */
  bytes: number | null;
};

/** What a rule actually removed. */
export type RetentionPurge = {
  rows: number;
  batches: number;
  /** True if MAX_BATCHES stopped the loop early — re-run to finish. */
  truncated: boolean;
};

export type RetentionRule = {
  /** Stable key, also what `--only` matches. */
  key: string;
  title: string;
  /** Table (and column, when the rule blanks a column rather than deleting). */
  target: string;
  /** Human-readable threshold, printed by the runner and quoted in the docs. */
  threshold: string;
  /** One-line justification, printed by the runner. */
  rationale: string;
  /** SELECT-only. Never mutates. */
  count: () => Promise<RetentionCount>;
  /** Mutates. Only ever reached via an explicit --apply. */
  purge: () => Promise<RetentionPurge>;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 86_400_000);
}

/**
 * Total on-disk size of a table including its indexes and TOAST. Used to turn
 * a row count into a byte estimate proportionally, which is cheap and — unlike
 * summing row widths — accounts for the index entries that also go away.
 */
async function relationBytes(table: string): Promise<number | null> {
  const rows = await db.$queryRaw<{ size: bigint | null }[]>`
    SELECT pg_total_relation_size(${`"${table}"`}::regclass) AS size`;
  const size = rows[0]?.size;
  return size == null ? null : Number(size);
}

/** Proportional byte estimate: whole-table size scaled by the share going away. */
async function estimateBytes(table: string, rows: number, total: number): Promise<number | null> {
  if (rows === 0) return 0;
  if (total === 0) return null;
  const size = await relationBytes(table);
  return size === null ? null : Math.round((size * rows) / total);
}

/**
 * The one batched-mutation loop, shared by every rule.
 *
 * `selectIds` hands back at most `take` ids that still match the rule, and
 * `mutate` removes them. Each pass re-runs the selection rather than paging
 * with an offset, so rows the previous pass handled drop out of the candidate
 * set naturally and concurrent inserts cannot shift a window underneath us.
 */
async function purgeInBatches(
  selectIds: (take: number) => Promise<string[]>,
  mutate: (ids: string[]) => Promise<number>,
): Promise<RetentionPurge> {
  let rows = 0;
  let batches = 0;

  while (batches < MAX_BATCHES) {
    const ids = await selectIds(BATCH_SIZE);
    if (ids.length === 0) return { rows, batches, truncated: false };

    const affected = await mutate(ids);
    batches++;
    rows += affected;

    // Selected rows but changed none: the mutation is not narrowing the
    // candidate set, so the next pass would select the same ids forever.
    if (affected === 0) return { rows, batches, truncated: true };
  }

  return { rows, batches, truncated: true };
}

// ---------------------------------------------------------------------------
// Rule: expired sessions
// ---------------------------------------------------------------------------

function sessionCutoff(): Date {
  return daysAgo(SESSION_GRACE_DAYS);
}

export async function countExpiredSessions(): Promise<RetentionCount> {
  const where = { expiresAt: { lt: sessionCutoff() } };
  const [rows, total] = await Promise.all([db.session.count({ where }), db.session.count()]);
  return { rows, total, bytes: await estimateBytes("Session", rows, total) };
}

export async function purgeExpiredSessions(): Promise<RetentionPurge> {
  const cutoff = sessionCutoff();
  return purgeInBatches(
    async (take) => {
      const rows = await db.session.findMany({
        where: { expiresAt: { lt: cutoff } },
        select: { id: true },
        orderBy: { expiresAt: "asc" },
        take,
      });
      return rows.map((r) => r.id);
    },
    async (ids) => (await db.session.deleteMany({ where: { id: { in: ids } } })).count,
  );
}

// ---------------------------------------------------------------------------
// Rule: stale build snapshots
// ---------------------------------------------------------------------------

// Rank successful builds newest-first WITHIN each project, then take the ones
// that are both buried past SNAPSHOT_KEEP_PER_PROJECT and older than
// SNAPSHOT_MIN_AGE_DAYS, and that still carry a snapshot.
//
// The ranking runs over all SUCCEEDED builds, not only the ones that still
// have a snapshot, so "the 20 newest checkpoints" means the same thing on the
// second run as on the first — already-cleared builds keep their rank instead
// of letting the window creep forward run after run.
//
// Note this deliberately ignores FAILED builds: they never get a snapshot in
// the first place (app/api/generate/route.ts only writes one on success).
const staleSnapshotSource = (cutoff: Date) => Prisma.sql`
  FROM (
    SELECT b.id,
           b."filesSnapshot" AS snapshot,
           b."createdAt"     AS created_at,
           row_number() OVER (
             PARTITION BY b."projectId"
             ORDER BY b."createdAt" DESC, b.id DESC
           ) AS rn
    FROM "Build" b
    WHERE b.status = 'SUCCEEDED'
  ) ranked
  WHERE ranked.rn > ${SNAPSHOT_KEEP_PER_PROJECT}
    AND ranked.created_at < ${cutoff}
    AND ranked.snapshot IS NOT NULL`;

export async function countStaleBuildSnapshots(): Promise<RetentionCount> {
  const cutoff = daysAgo(SNAPSHOT_MIN_AGE_DAYS);

  // pg_column_size reports the stored (TOAST-compressed) width, which is the
  // honest number here — it is what the snapshot actually costs on disk, not
  // what the JSON would measure if you printed it.
  const [row] = await db.$queryRaw<{ rows: number; bytes: bigint }[]>`
    SELECT count(*)::int AS rows,
           COALESCE(SUM(pg_column_size(ranked.snapshot)), 0)::bigint AS bytes
    ${staleSnapshotSource(cutoff)}`;

  const total = await db.build.count({ where: { filesSnapshot: { not: Prisma.DbNull } } });

  return { rows: row?.rows ?? 0, total, bytes: Number(row?.bytes ?? 0) };
}

export async function purgeStaleBuildSnapshots(): Promise<RetentionPurge> {
  const cutoff = daysAgo(SNAPSHOT_MIN_AGE_DAYS);

  return purgeInBatches(
    async (take) => {
      const rows = await db.$queryRaw<{ id: string }[]>`
        SELECT ranked.id
        ${staleSnapshotSource(cutoff)}
        ORDER BY ranked.created_at ASC
        LIMIT ${take}`;
      return rows.map((r) => r.id);
    },
    // The Build row itself stays — only the snapshot column is emptied. See
    // NEVER_PRUNED: deleting builds would break the lifetime cost aggregates
    // and detach the credit ledger.
    async (ids) =>
      (
        await db.build.updateMany({
          where: { id: { in: ids } },
          data: { filesSnapshot: Prisma.DbNull },
        })
      ).count,
  );
}

// ---------------------------------------------------------------------------
// Rule: old analytics events
// ---------------------------------------------------------------------------

export async function countOldEvents(): Promise<RetentionCount> {
  const where = { createdAt: { lt: daysAgo(EVENT_RETENTION_DAYS) } };
  const [rows, total] = await Promise.all([db.event.count({ where }), db.event.count()]);
  return { rows, total, bytes: await estimateBytes("Event", rows, total) };
}

export async function purgeOldEvents(): Promise<RetentionPurge> {
  const cutoff = daysAgo(EVENT_RETENTION_DAYS);
  return purgeInBatches(
    async (take) => {
      const rows = await db.event.findMany({
        where: { createdAt: { lt: cutoff } },
        select: { id: true },
        orderBy: { createdAt: "asc" },
        take,
      });
      return rows.map((r) => r.id);
    },
    async (ids) => (await db.event.deleteMany({ where: { id: { in: ids } } })).count,
  );
}

// ---------------------------------------------------------------------------
// Rule: old Stripe idempotency records
// ---------------------------------------------------------------------------

export async function countOldStripeEvents(): Promise<RetentionCount> {
  const where = { createdAt: { lt: daysAgo(STRIPE_EVENT_RETENTION_DAYS) } };
  const [rows, total] = await Promise.all([db.stripeEvent.count({ where }), db.stripeEvent.count()]);
  return { rows, total, bytes: await estimateBytes("StripeEvent", rows, total) };
}

export async function purgeOldStripeEvents(): Promise<RetentionPurge> {
  const cutoff = daysAgo(STRIPE_EVENT_RETENTION_DAYS);
  return purgeInBatches(
    async (take) => {
      const rows = await db.stripeEvent.findMany({
        where: { createdAt: { lt: cutoff } },
        select: { id: true },
        orderBy: { createdAt: "asc" },
        take,
      });
      return rows.map((r) => r.id);
    },
    async (ids) => (await db.stripeEvent.deleteMany({ where: { id: { in: ids } } })).count,
  );
}

// ---------------------------------------------------------------------------
// Rule: old form submissions (real, and spam)
// ---------------------------------------------------------------------------
//
// Two rules over one table rather than one rule with two cutoffs, so that each
// period is a separate line in the printed table, can be run on its own with
// --only, and can be quoted separately in the privacy policy. They are
// mutually exclusive by construction: `spam` is a non-null boolean, so every
// row belongs to exactly one of them and neither can hide the other's backlog.

function countFormSubmissions(spam: boolean, days: number): () => Promise<RetentionCount> {
  return async () => {
    const where = { spam, createdAt: { lt: daysAgo(days) } };
    const [rows, total] = await Promise.all([
      db.formSubmission.count({ where }),
      db.formSubmission.count(),
    ]);
    return { rows, total, bytes: await estimateBytes("FormSubmission", rows, total) };
  };
}

function purgeFormSubmissions(spam: boolean, days: number): () => Promise<RetentionPurge> {
  return async () => {
    const cutoff = daysAgo(days);
    return purgeInBatches(
      async (take) => {
        const rows = await db.formSubmission.findMany({
          where: { spam, createdAt: { lt: cutoff } },
          select: { id: true },
          orderBy: { createdAt: "asc" },
          take,
        });
        return rows.map((r) => r.id);
      },
      async (ids) => (await db.formSubmission.deleteMany({ where: { id: { in: ids } } })).count,
    );
  };
}

export const countOldFormSubmissions = countFormSubmissions(false, FORM_SUBMISSION_RETENTION_DAYS);
export const purgeOldFormSubmissions = purgeFormSubmissions(false, FORM_SUBMISSION_RETENTION_DAYS);
export const countOldFormSpam = countFormSubmissions(true, FORM_SPAM_RETENTION_DAYS);
export const purgeOldFormSpam = purgeFormSubmissions(true, FORM_SPAM_RETENTION_DAYS);

// ---------------------------------------------------------------------------
// Rule: old admin audit READS
// ---------------------------------------------------------------------------

/**
 * The action names this rule may touch, derived from the vocabulary in
 * lib/admin-audit.ts rather than copied.
 *
 * That indirection is the safety property, not tidiness: a name added to
 * ADMIN_ACTIONS with `kind: "write"` is unprunable the moment it exists, with
 * no edit here, and a second hand-maintained list could not promise that. Any
 * action string NOT in the vocabulary — an old name, a hand-inserted row — is
 * outside the filter and is therefore KEPT. Unknown means keep.
 */
export const ADMIN_AUDIT_READ_ACTIONS: string[] = Object.entries(ADMIN_ACTION_INFO)
  .filter(([, info]) => info.kind === "read")
  .map(([action]) => action);

export async function countOldAdminAuditReads(): Promise<RetentionCount> {
  const where = {
    action: { in: ADMIN_AUDIT_READ_ACTIONS },
    createdAt: { lt: daysAgo(ADMIN_AUDIT_READ_RETENTION_DAYS) },
  };
  const [rows, total] = await Promise.all([
    db.adminAuditLog.count({ where }),
    db.adminAuditLog.count(),
  ]);
  return { rows, total, bytes: await estimateBytes("AdminAuditLog", rows, total) };
}

export async function purgeOldAdminAuditReads(): Promise<RetentionPurge> {
  const cutoff = daysAgo(ADMIN_AUDIT_READ_RETENTION_DAYS);
  return purgeInBatches(
    async (take) => {
      const rows = await db.adminAuditLog.findMany({
        where: { action: { in: ADMIN_AUDIT_READ_ACTIONS }, createdAt: { lt: cutoff } },
        select: { id: true },
        orderBy: { createdAt: "asc" },
        take,
      });
      return rows.map((r) => r.id);
    },
    async (ids) => (await db.adminAuditLog.deleteMany({ where: { id: { in: ids } } })).count,
  );
}

// ---------------------------------------------------------------------------
// Rule: old REVIEWED moderation findings
// ---------------------------------------------------------------------------
//
// `reviewedAt: { lt: cutoff }` is doing both jobs at once: Prisma renders it as
// `"reviewedAt" < $1`, and SQL comparison against NULL is never true, so an
// unreviewed finding is excluded by the same predicate that ages a reviewed
// one. The `not: null` is still written out below because a rule that deletes
// evidence should say which rows it spares in words, not rely on three-valued
// logic to be read correctly by the next person.

export async function countOldModerationFindings(): Promise<RetentionCount> {
  const cutoff = daysAgo(MODERATION_REVIEWED_RETENTION_DAYS);
  const where = { reviewedAt: { not: null, lt: cutoff } };
  const [rows, total] = await Promise.all([
    db.moderationFinding.count({ where }),
    db.moderationFinding.count(),
  ]);
  return { rows, total, bytes: await estimateBytes("ModerationFinding", rows, total) };
}

export async function purgeOldModerationFindings(): Promise<RetentionPurge> {
  const cutoff = daysAgo(MODERATION_REVIEWED_RETENTION_DAYS);
  return purgeInBatches(
    async (take) => {
      const rows = await db.moderationFinding.findMany({
        where: { reviewedAt: { not: null, lt: cutoff } },
        select: { id: true },
        orderBy: { reviewedAt: "asc" },
        take,
      });
      return rows.map((r) => r.id);
    },
    async (ids) => (await db.moderationFinding.deleteMany({ where: { id: { in: ids } } })).count,
  );
}

// ---------------------------------------------------------------------------
// The policy
// ---------------------------------------------------------------------------

export const RETENTION_RULES: RetentionRule[] = [
  {
    key: "sessions",
    title: "Expired sign-in sessions",
    target: "Session",
    threshold: "expired (SESSION_DAYS = 30 in lib/auth.ts)",
    rationale: "Already invalid at read time; the row is liability with no function.",
    count: countExpiredSessions,
    purge: purgeExpiredSessions,
  },
  {
    key: "build-snapshots",
    title: "Stale rollback snapshots",
    target: "Build.filesSnapshot",
    threshold: `older than ${SNAPSHOT_MIN_AGE_DAYS}d AND past the newest ${SNAPSHOT_KEEP_PER_PROJECT} per project`,
    rationale: "Rollback reaches back a few edits, not a few hundred. Build rows are kept.",
    count: countStaleBuildSnapshots,
    purge: purgeStaleBuildSnapshots,
  },
  {
    key: "events",
    title: "Analytics events",
    target: "Event",
    threshold: `older than ${EVENT_RETENTION_DAYS}d (~13 months)`,
    rationale: "Every dashboard reads a 30-day window; 400d only preserves year-over-year.",
    count: countOldEvents,
    purge: purgeOldEvents,
  },
  {
    key: "stripe-events",
    title: "Stripe idempotency records",
    target: "StripeEvent",
    threshold: `older than ${STRIPE_EVENT_RETENTION_DAYS}d`,
    rationale: "Dedupes webhook retries, which Stripe abandons within ~3 days.",
    count: countOldStripeEvents,
    purge: purgeOldStripeEvents,
  },
  {
    key: "form-submissions",
    title: "Form submissions from published sites",
    target: "FormSubmission (spam = false)",
    threshold: `older than ${FORM_SUBMISSION_RETENTION_DAYS}d (1 year)`,
    rationale: "Real enquiries, and the only copy. A year covers how far back an inbox is used.",
    count: countOldFormSubmissions,
    purge: purgeOldFormSubmissions,
  },
  {
    key: "form-spam",
    title: "Form submissions flagged as spam",
    target: "FormSubmission (spam = true)",
    threshold: `older than ${FORM_SPAM_RETENTION_DAYS}d`,
    rationale: "Kept to catch false positives and measure the rate; both need weeks, not a year.",
    count: countOldFormSpam,
    purge: purgeOldFormSpam,
  },
  {
    key: "admin-audit-reads",
    title: "Admin audit rows recording a read",
    target: "AdminAuditLog (kind = read)",
    threshold: `older than ${ADMIN_AUDIT_READ_RETENTION_DAYS}d (6 months)`,
    rationale: "\"Who looked\" answers complaints for months, not years. Writes are never pruned.",
    count: countOldAdminAuditReads,
    purge: purgeOldAdminAuditReads,
  },
  {
    key: "moderation-findings",
    title: "Reviewed moderation findings",
    target: "ModerationFinding (reviewedAt set)",
    threshold: `reviewed more than ${MODERATION_REVIEWED_RETENTION_DAYS}d ago (~13 months)`,
    rationale: "Closed cases, kept only to measure the false-positive rate. Unreviewed rows stay.",
    count: countOldModerationFindings,
    purge: purgeOldModerationFindings,
  },
];

export function findRule(key: string): RetentionRule | undefined {
  return RETENTION_RULES.find((r) => r.key === key);
}

/**
 * The other half of the policy: what is deliberately kept forever, and why.
 * A retention document that lists only deletions is not a policy, it is a
 * changelog — these are the commitments someone can be held to.
 */
export const NEVER_PRUNED: { target: string; reason: string }[] = [
  {
    target: "CreditLedger",
    reason:
      "An auditable financial record. The balance is derived from the ledger rather than " +
      "stored as a counter (lib/credits.ts, and the DISTINCT ON balance query in " +
      "app/admin/users/page.tsx), so removing any row rewrites history and can change a " +
      "live balance. It survives project deletion by design — buildId goes null, the row " +
      "stays. Retained permanently.",
  },
  {
    target: "Build (the row, as opposed to its snapshot)",
    reason:
      "Two unbounded readers make deletion unsafe: app/admin/page.tsx and " +
      "app/admin/users/[id]/page.tsx both run db.build.aggregate over ALL builds for " +
      "lifetime costMicros and creditsCharged, and CreditLedger.buildId points here " +
      "(ON DELETE SET NULL), so deleting builds silently detaches spend from what caused " +
      "it. Kept for the life of the project; deleting a project cascades them away.",
  },
  {
    target: "Build.prompt",
    reason:
      "Free text the user wrote, so a tempting redaction target — but it is the visible " +
      "label of every checkpoint in the history panel " +
      "(app/api/projects/[id]/builds/route.ts selects it). Redacting old prompts would " +
      "turn old checkpoints into unlabelled rows. Kept for the life of the project.",
  },
  {
    target: "ProjectFile / Message / Project",
    reason:
      "The user's actual work and conversation. These are the product, not exhaust. They " +
      "are deleted when the user deletes the project or their account, and never on a " +
      "timer.",
  },
  {
    target: "EmailLog",
    reason:
      "The idempotency guard for transactional email, and the one table here where a " +
      "delete can produce a WRONG ACTION rather than a missing statistic: the row IS the " +
      "claim (the unique (kind, dedupeKey) is what makes a send exactly-once), so removing " +
      "one re-arms that send. dedupeKey is the id of the thing that triggered the mail — a " +
      "ledger row, a build, a project — never a timestamp, so a claim does not expire and " +
      "there is no age at which it is safe to drop. The concrete path is site_published, " +
      "whose key is a projectId: a republish is only held back by a lifetime count of " +
      "project.published events (lib/notifications/scan.ts), which the 400-day event rule " +
      "eventually removes, leaving this row as the last thing standing between a republish " +
      "and a second email. It is also a reader-facing record — app/api/account/export " +
      "returns it as \"emailsSent\" in a person's own data export — and it is tiny (four " +
      "kinds, one short row each). NOTE: nothing writes this table today; " +
      "lib/notifications/send.ts dedupes in a process-local Map that resets on deploy. The " +
      "durable guard is declared and unwired, which makes this the wrong moment to also " +
      "put it on a timer. Deleted per person, not per clock: erasure removes a user's rows " +
      "(app/api/account/_deletion.ts).",
  },
  {
    target: "SupportTicket / SupportMessage",
    reason:
      "A conversation, not exhaust — and the only rows in this file a CUSTOMER reads back. " +
      "/support renders every ticket a person has ever opened, so ageing one out would " +
      "delete a thread out from under someone mid-exchange and silently rewrite what they " +
      "were told. There is also no safe age: a ticket arguing about a charge is that " +
      "person's own evidence, and the credit ledger it argues about is retained " +
      "permanently. Deleted per person, not per clock — erasure removes them " +
      "(app/api/account/_deletion.ts), and they are returned in full in the data export. " +
      "If volume ever justifies a rule, the honest version ages FROM RESOLVED and says the " +
      "period on the support page itself, rather than sweeping silently.",
  },
  {
    target: "AdminAuditLog (rows whose action is a WRITE)",
    reason:
      "The accountability half of the log. An unrecorded write means state changed and " +
      "nothing anywhere says who changed it — and for one action the log is not a record " +
      "of the change, it is the ONLY record: takedown is not a column, so " +
      "app/admin/sites/page.tsx reconstructs which sites were taken down by grouping " +
      "site.taken_down rows. Pruning them would un-take-down sites in the registry view. " +
      "They are rare and small; the volume in this table is entirely on the read side, " +
      "which ages out at 180 days. Classified by `kind` in ADMIN_ACTION_INFO, so a new " +
      "write action is protected the moment it is declared, and any action name not in " +
      "that vocabulary is left alone.",
  },
  {
    target: "ModerationFinding (rows with reviewedAt = NULL)",
    reason:
      "An open work queue, not a record. app/admin/sites/page.tsx counts unreviewed " +
      "findings and lists the projects they point at; the takedown page gates on the same " +
      "count. Ageing one out would mean discarding an abuse report BEFORE anybody read it " +
      "and removing the flag that says the site needs looking at — a retention job " +
      "silently emptying a review queue is the worst failure available in this file. The " +
      "growth this leaves unbounded is bounded by doing the reviews; once reviewed, the " +
      "400-day rule takes them.",
  },
];

/**
 * Data with a real retention period that this job does not enforce, because
 * something else already does.
 *
 * This list exists so the policy can be complete without the job pretending to
 * own things it does not. A privacy policy has to state a period for every
 * table; docs/retention.md is written from this file; and "we do not delete
 * this" and "something else deletes it" are very different sentences to be
 * missing from that document. Duplicating the prune here instead would be
 * worse than either choice — two schedules racing on the same rows, with the
 * shorter cutoff winning.
 */
export const PRUNED_ELSEWHERE: { target: string; period: string; by: string; reason: string }[] = [
  {
    target: "LoginAttempt",
    period: "~25 hours (the longest rate-limit window, plus an hour of slack)",
    by: "lib/rate-limit.ts, on its own reconcile timer (every 10 minutes)",
    reason:
      "That file argues it does not belong in this one, and the argument holds. A rule " +
      "here answers 'how long should we keep data that still means something', and every " +
      "other rule in this file has a reader behind it. A LoginAttempt older than the " +
      "longest window means nothing to anybody: no query reaches it, no verdict changes " +
      "because of it, and the only file that touches the table is the limiter itself " +
      "(verified — every db.loginAttempt call site is in lib/rate-limit.ts). It is spent " +
      "counter state, and sweeping it is part of operating the counter. Two further " +
      "reasons to leave it there. Correctness would become a scheduling problem: nothing " +
      "runs this job yet, so moving the prune here would let a table on the login path " +
      "grow unbounded until a cron entry exists. And a second pruner would be actively " +
      "unsafe — a shorter cutoff than MAX_WINDOW deletes rows still inside a live rule " +
      "window, which hands an attacker back the guesses they have already spent. The one " +
      "thing that WAS missing is a stated period, which is why it is written down here " +
      "and in docs/retention.md.",
  },
];
