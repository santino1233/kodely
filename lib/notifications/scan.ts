import { db } from "@/lib/db";
import { averageBuildCredits } from "@/lib/credits";
import { EVENTS } from "@/lib/events";
import { creditState, droppedIntoWarning, type CreditTier } from "./credit-state";

// ── How this stays idempotent without a schema change ─────────────────────
//
// There is no `sent_emails` table and none can be added here, so nothing can
// record "we told this person". Instead every notification is derived from a
// STATE TRANSITION that lands at one instant, and each run only considers
// transitions inside ONE CLOSED TIME SLOT:
//
//   slot = [floor(now, 15m) - 15m, floor(now, 15m))
//
// The slot is computed from the wall clock, not from when the job happened to
// start, so a run at 12:00:03 and a retry at 12:07 both process exactly
// [11:45, 12:00) and produce exactly the same candidate list. That list is
// then de-duplicated in-process by occurrence id (see claim() in send.ts), so
// overlapping or retried runs within a process send nothing twice.
//
// The transition is the important half, because it is what makes this correct
// rather than merely rate-limited:
//
//   low credits — the ledger row that dropped the user a GRADE (see
//                 credit-state.ts). "Balance is low" stays true forever and
//                 would re-fire every run; "this row took them from ok to low,
//                 or from low to spent" is true of exactly one row, and that
//                 row falls in exactly one slot. A top-up creates a newer row
//                 and disarms it.
//   welcome     — the User row's createdAt. Happens once, by definition.
//   build failed— a Build's endedAt. One row per failure.
//   published   — Project.publishedAt, restricted to the FIRST publish, which
//                 is derived from the count of project.published events.
//
// Known, accepted limits (the alternative to each is duplicate mail, which is
// worse — see the schema note in the report):
//
//   * A run that is skipped entirely loses that slot's notifications. Chosen
//     deliberately: at-most-once, not at-least-once.
//   * A process restart between two runs covering the same slot could resend.
//     The clock-aligned slot makes that a narrow window rather than a loop.
//   * Nobody is warned about a grade they were ALREADY in when this shipped —
//     there is no earlier state to have moved from. Someone sitting at "low"
//     today still gets the "spent" warning when they drop again; someone
//     already at "spent" gets nothing until they top up and come back down.
//     That is a feature on day one: it is what stops the first cron run from
//     mailing the entire back catalogue.

export const SLOT_MS = 15 * 60 * 1000;

export type Slot = { start: Date; end: Date };

/** The most recent slot that is fully in the past. */
export function previousSlot(now: number = Date.now()): Slot {
  const end = Math.floor(now / SLOT_MS) * SLOT_MS;
  return { start: new Date(end - SLOT_MS), end: new Date(end) };
}

// ── Welcome ───────────────────────────────────────────────────────────────

export async function scanWelcome(slot: Slot): Promise<{ userId: string }[]> {
  const users = await db.user.findMany({
    where: { createdAt: { gte: slot.start, lt: slot.end } },
    select: { id: true },
  });
  return users.map((u) => ({ userId: u.id }));
}

// ── Low credits ───────────────────────────────────────────────────────────

export type LowCreditsDue = {
  userId: string;
  /** The ledger row that crossed the threshold; also the dedupe key. */
  crossingLedgerId: string;
  balanceAfter: number;
  avgBuildCredits: number;
  buildsLeft: number;
  /** "low" or "spent" — the grade this row dropped them into. */
  tier: CreditTier;
};

export async function scanLowCredits(slot: Slot): Promise<LowCreditsDue[]> {
  // Every spend in the slot. Grants are irrelevant — a balance can only cross
  // downwards on a negative delta.
  const rows = await db.creditLedger.findMany({
    // userId is nullable: erasing an account DETACHES its ledger rows rather
    // than deleting them, so the financial record survives (see the comment on
    // CreditLedger in prisma/schema.prisma). A detached row belongs to nobody,
    // so there is nobody to email. Excluded in the query so the index does the
    // work rather than filtering in memory afterwards.
    where: {
      createdAt: { gte: slot.start, lt: slot.end },
      delta: { lt: 0 },
      userId: { not: null },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, userId: true, delta: true, balanceAfter: true, createdAt: true },
  });

  // Only the last spend of the slot per user can be the crossing row.
  // The filter above is what makes this key safe; TypeScript cannot see
  // through a Prisma `where`, so narrow explicitly rather than asserting.
  const lastPerUser = new Map<string, (typeof rows)[number] & { userId: string }>();
  for (const row of rows) {
    if (row.userId === null) continue;
    lastPerUser.set(row.userId, { ...row, userId: row.userId });
  }

  const due: LowCreditsDue[] = [];

  for (const row of lastPerUser.values()) {
    // Anything newer than this row — another build, a top-up, a reward grant —
    // means this row is no longer the user's current state. Skipping is safe
    // and lossless: the newer row belongs to a later slot and gets its own
    // evaluation on a later run.
    const newer = await db.creditLedger.count({
      where: { userId: row.userId, createdAt: { gt: row.createdAt } },
    });
    if (newer > 0) continue;

    // Both sides are graded with the SAME average — the one measured now.
    // Using a different yardstick either side of the row would let the grade
    // move because the average moved rather than because the balance did.
    const avg = await averageBuildCredits(row.userId);
    const after = creditState(row.balanceAfter, avg);
    // delta is negative, so this is the balance immediately before the spend.
    const before = creditState(row.balanceAfter - row.delta, avg);

    // The transition, not the condition. Someone who was already in this grade
    // before the build has been told about it and is not told again.
    if (!droppedIntoWarning(before, after)) continue;

    due.push({
      userId: row.userId,
      crossingLedgerId: row.id,
      balanceAfter: row.balanceAfter,
      avgBuildCredits: avg,
      buildsLeft: after.buildsLeft,
      tier: after.tier,
    });
  }

  return due;
}

// ── Build failed ──────────────────────────────────────────────────────────

// app/api/generate/route.ts writes exactly this string when the client hangs
// up mid-build. That is the user closing a tab, not a failure they need to
// hear about — mailing "your build failed" to someone who cancelled is noise.
const ABORTED_ERROR = "Client disconnected.";

export type BuildFailedDue = { buildId: string; userId: string };

export async function scanBuildFailed(slot: Slot): Promise<BuildFailedDue[]> {
  const builds = await db.build.findMany({
    where: {
      status: "FAILED",
      endedAt: { gte: slot.start, lt: slot.end },
      creditsCharged: 0,
    },
    orderBy: { endedAt: "asc" },
    select: {
      id: true,
      createdAt: true,
      error: true,
      project: { select: { userId: true } },
    },
  });

  // At most one per user per run, even if three builds failed in a row: a
  // repeated failure is one bad afternoon, not three emails.
  const lastPerUser = new Map<string, (typeof builds)[number]>();
  for (const b of builds) {
    if (b.error === ABORTED_ERROR) continue;
    lastPerUser.set(b.project.userId, b);
  }

  const due: BuildFailedDue[] = [];

  for (const [userId, build] of lastPerUser) {
    // If they started another build afterwards, they were at the keyboard and
    // already dealt with it. This email is for the person who hit a failure
    // and left.
    const later = await db.build.count({
      where: { project: { userId }, createdAt: { gt: build.createdAt } },
    });
    if (later > 0) continue;

    due.push({ buildId: build.id, userId });
  }

  return due;
}

// ── Site published ────────────────────────────────────────────────────────

export type SitePublishedDue = { projectId: string; userId: string };

/**
 * FIRST publishes only. Project.publishedAt is overwritten on every republish,
 * so the column alone can't tell a first publish from the tenth; the count of
 * `project.published` events for that project can. Events are kept 400 days
 * (EVENT_RETENTION_DAYS), far longer than this ever looks back.
 */
export async function scanSitePublished(slot: Slot): Promise<SitePublishedDue[]> {
  const projects = await db.project.findMany({
    where: { publishedAt: { gte: slot.start, lt: slot.end } },
    select: { id: true, userId: true },
  });

  const due: SitePublishedDue[] = [];

  for (const project of projects) {
    const publishes = await db.event.count({
      where: {
        name: EVENTS.sitePublished,
        props: { path: ["projectId"], equals: project.id },
      },
    });
    // 0 means the event write lost a race (track() is fire-and-forget) — the
    // publishedAt timestamp is authority enough that this is still a publish.
    // 2+ means a republish, which is not worth an email.
    if (publishes > 1) continue;

    due.push({ projectId: project.id, userId: project.userId });
  }

  return due;
}
