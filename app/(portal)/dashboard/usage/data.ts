import { db } from "@/lib/db";
import { MICROS_PER_CREDIT } from "@/lib/credits";

// Aggregations for /dashboard/usage. Everything here is derived from rows that
// already exist — CreditLedger and Build — with no schema change and no
// estimate. If a number cannot be computed from those two tables it is not in
// this file, and the page says so instead of inventing it.
//
// Deliberately absent, because nothing measures them: storage, bandwidth,
// request counts, seats, and anything resembling a plan allowance.
//
// COST BASIS IS NOT EXPOSED. Build.costMicros is our real model spend, which is
// the cost side of the retail prices in lib/stripe.ts. Every figure this module
// returns is in CREDITS; costMicros is only ever used inside an arithmetic
// comparison against what was charged, never returned as money.

const MS_DAY = 24 * 60 * 60 * 1000;

/** Epoch ms for the start of the UTC calendar day containing `d`. */
function utcDayStart(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export type DayBucket = {
  /** Start of the UTC day, epoch ms. */
  ts: number;
  credits: number;
};

/**
 * Credits spent per UTC calendar day over the last `days` days, today included.
 *
 * NOTE the deliberate mismatch with spentInWindow() in lib/credits.ts: that one
 * measures a rolling window to the millisecond because it is what the spend cap
 * enforces. A chart cannot have a half-day bucket at its left edge, so this
 * snaps to UTC day boundaries. The two totals can therefore differ by up to one
 * day's spend, and the page says so rather than presenting them as the same
 * number twice.
 *
 * Row count is bounded by one user's charges in 90 days, so bucketing in JS
 * beats a raw SQL date_trunc that would have to be written per-dialect.
 */
export async function dailySpend(userId: string, days: number): Promise<DayBucket[]> {
  const firstDay = utcDayStart(new Date()) - (days - 1) * MS_DAY;

  const rows = await db.creditLedger.findMany({
    where: { userId, delta: { lt: 0 }, createdAt: { gte: new Date(firstDay) } },
    select: { createdAt: true, delta: true },
  });

  const buckets: DayBucket[] = Array.from({ length: days }, (_, i) => ({
    ts: firstDay + i * MS_DAY,
    credits: 0,
  }));

  for (const row of rows) {
    const index = Math.round((utcDayStart(row.createdAt) - firstDay) / MS_DAY);
    // Defensive: a DST-free UTC calculation should never land outside the
    // array, but a clock skew between Postgres and this process could. A bar
    // silently written past the end of the chart is worse than a dropped one.
    if (index >= 0 && index < days) {
      buckets[index].credits += Math.abs(row.delta);
    }
  }

  return buckets;
}

export type SpendBucket = {
  /** Start of the first UTC day in the group, epoch ms. */
  ts: number;
  /** How many UTC days this bar covers. 1 for a daily bar. */
  days: number;
  credits: number;
};

/**
 * Collapse day buckets into fixed-width groups so a long range stays legible.
 * `size` of 1 is the identity, which is why every caller can go through here.
 *
 * Grouped from the NEWEST end on purpose. Grouping from the left leaves the
 * partial group at the right edge — the current, incomplete week — and a bar
 * covering three days next to bars covering seven reads as a collapse in usage
 * rather than as a shorter period. Anchoring to the newest day puts the short
 * group at the far left instead, where it is the oldest data and where the
 * label (which carries the real span) is read first.
 */
export function groupBuckets(buckets: DayBucket[], size: number): SpendBucket[] {
  if (size <= 1) return buckets.map((b) => ({ ts: b.ts, days: 1, credits: b.credits }));

  const out: SpendBucket[] = [];
  for (let end = buckets.length; end > 0; end -= size) {
    const slice = buckets.slice(Math.max(0, end - size), end);
    out.unshift({
      ts: slice[0].ts,
      days: slice.length,
      credits: slice.reduce((sum, b) => sum + b.credits, 0),
    });
  }
  return out;
}

/**
 * Whole UTC days from this account's first ledger entry to today, inclusive —
 * or null when there is no ledger at all. Drives the "All time" chart range,
 * which has to be a real span rather than an arbitrary large number of days.
 *
 * The first ledger row is the signup grant, so this is effectively account age.
 */
export async function accountSpanDays(userId: string): Promise<number | null> {
  const earliest = await db.creditLedger.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });
  if (earliest === null) return null;
  return Math.max(1, Math.round((utcDayStart(new Date()) - utcDayStart(earliest.createdAt)) / MS_DAY) + 1);
}

// Must stay equal to CAP_WINDOW_DAYS in lib/credits.ts. The comparison below is
// against the window the spend cap actually enforces; a different length here
// would silently compare a 30-day figure to a 28-day one.
const WINDOW_DAYS = 30;

export type SpendComparison = {
  /** Credits spent in the 30 days immediately BEFORE the current window. */
  previous: number;
  /**
   * False when this account did not exist for the whole of that earlier window,
   * in which case `previous` is not a period this person lived through and any
   * percentage drawn from it would be fiction. The page shows nothing at all
   * rather than a 0% that looks like a measurement.
   */
  comparable: boolean;
};

export async function previousWindowSpend(userId: string): Promise<SpendComparison> {
  const now = Date.now();
  const windowStart = new Date(now - WINDOW_DAYS * MS_DAY);
  const priorStart = new Date(now - 2 * WINDOW_DAYS * MS_DAY);

  const [earliest, prior] = await Promise.all([
    db.creditLedger.findFirst({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
    db.creditLedger.aggregate({
      where: { userId, delta: { lt: 0 }, createdAt: { gte: priorStart, lt: windowStart } },
      _sum: { delta: true },
    }),
  ]);

  return {
    previous: Math.abs(prior._sum.delta ?? 0),
    comparable: earliest !== null && earliest.createdAt.getTime() <= priorStart.getTime(),
  };
}

export type MonthToDate = {
  /** First instant of the current UTC calendar month, epoch ms. */
  start: number;
  credits: number;
  builds: number;
  /** UTC days elapsed this month, today included. */
  daysElapsed: number;
};

/**
 * This calendar month so far, in UTC.
 *
 * A CALENDAR COUNT AND NOTHING MORE. There is no monthly allowance, no billing
 * month and no reset on the 1st — credits never expire and the spend cap rolls
 * (docs/design-system.md). This exists because "how much have I built lately"
 * is a question people ask in months, not because anything in Kodely renews in
 * one, and the page has to say so where it is rendered.
 */
export async function monthToDate(userId: string): Promise<MonthToDate> {
  const now = new Date();
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const since = new Date(start);

  const [spend, builds] = await Promise.all([
    db.creditLedger.aggregate({
      where: { userId, delta: { lt: 0 }, createdAt: { gte: since } },
      _sum: { delta: true },
    }),
    db.build.count({
      where: {
        project: { userId },
        status: "SUCCEEDED",
        creditsCharged: { gt: 0 },
        createdAt: { gte: since },
      },
    }),
  ]);

  return {
    start,
    credits: Math.abs(spend._sum.delta ?? 0),
    builds,
    daysElapsed: now.getUTCDate(),
  };
}

export type SiteUsage = {
  projectId: string;
  name: string;
  credits: number;
  builds: number;
  lastAt: Date;
};

/**
 * Credits charged, grouped by the website they were charged for.
 *
 * Attribution is real, not inferred: CreditLedger.buildId -> Build.projectId.
 * This groups the Build side because it also carries the build count and the
 * last-charged date, which the ledger alone does not.
 *
 * IT CANNOT SEE DELETED SITES. Project deletion cascades its builds away and
 * SET NULLs CreditLedger.buildId (prisma/schema.prisma), so the charge survives
 * on the statement with nothing attached. The caller reconciles this total
 * against the ledger and shows the difference explicitly — see the page.
 */
export async function siteUsage(userId: string): Promise<SiteUsage[]> {
  const grouped = await db.build.groupBy({
    by: ["projectId"],
    where: { project: { userId }, status: "SUCCEEDED", creditsCharged: { gt: 0 } },
    _sum: { creditsCharged: true },
    _count: true,
    _max: { createdAt: true },
  });

  if (grouped.length === 0) return [];

  const projects = await db.project.findMany({
    where: { id: { in: grouped.map((g) => g.projectId) }, userId },
    select: { id: true, name: true },
  });
  const nameById = new Map(projects.map((p) => [p.id, p.name]));

  const rows: SiteUsage[] = [];
  for (const g of grouped) {
    const name = nameById.get(g.projectId);
    const lastAt = g._max.createdAt;
    // A group with no matching project, or no date, means the read raced a
    // delete. Drop it rather than rendering a row with a placeholder name — the
    // reconciliation below folds it into the deleted-sites total instead, which
    // is where it honestly belongs.
    if (name === undefined || lastAt === null) continue;
    rows.push({
      projectId: g.projectId,
      name,
      credits: g._sum.creditsCharged ?? 0,
      builds: g._count,
      lastAt,
    });
  }

  return rows.sort((a, b) => b.credits - a.credits || a.name.localeCompare(b.name));
}

export type NotCharged = {
  failedBuilds: number;
  repairedBuilds: number;
  /** Credits the repair rule absorbed. Conservative — see below. */
  repairWaivedCredits: number;
};

/**
 * The two things Kodely records but never bills: failed builds and repair
 * passes. Both are rules 3 and 4 of the contract in lib/credits.ts, restated as
 * arithmetic on this user's own rows.
 *
 * The waived figure is DERIVED, exactly as lib/credits.ts says it can be:
 * repairAttempts > 0 together with costMicros > creditsCharged * MICROS_PER_CREDIT
 * is "this run was repaired and we absorbed the difference".
 *
 * It understates on purpose. creditsCharged is rounded UP from the billable
 * attempt, so charging-side micros are overstated and the derived difference
 * comes out low. On a page whose entire point is not overclaiming, a saving
 * quoted slightly under the truth is the only acceptable rounding direction.
 */
export async function notCharged(userId: string): Promise<NotCharged> {
  const [failedBuilds, repaired] = await Promise.all([
    db.build.count({ where: { project: { userId }, status: "FAILED" } }),
    db.build.aggregate({
      where: { project: { userId }, status: "SUCCEEDED", repairAttempts: { gt: 0 } },
      _count: true,
      _sum: { costMicros: true, creditsCharged: true },
    }),
  ]);

  const trueMicros = repaired._sum.costMicros ?? 0;
  const chargedMicros = (repaired._sum.creditsCharged ?? 0) * MICROS_PER_CREDIT;

  return {
    failedBuilds,
    repairedBuilds: repaired._count,
    repairWaivedCredits: Math.max(0, Math.floor((trueMicros - chargedMicros) / MICROS_PER_CREDIT)),
  };
}

export type MtdBuildKind = {
  /** Credits spent this month on a project's FIRST charged build. */
  createCredits: number;
  /** Credits spent this month on every charged build after that. */
  editCredits: number;
};

/**
 * This month's spend, split by whether each build was the first charge a
 * project ever received or a follow-up.
 *
 * There is no stored "create vs edit" flag anywhere — app/api/generate/route.ts
 * derives it at request time from message count and never writes it back. This
 * recovers the same fact after the fact, from data that already exists: for
 * each project touched this month, its EARLIEST-EVER charged build (by id, not
 * by date — createdAt collisions are possible at the same millisecond) is the
 * create; every other charged build this month is an edit. A project whose
 * first build happened in an earlier month correctly counts as all edits here.
 *
 * This is the real category split behind "Usage this month" — replacing what
 * a visual reference showed as success/failure/other, which cannot be honest
 * on this account: a failed build is charged zero credits (see notCharged
 * below), so a slice attributing spend to failure would be reporting a number
 * that never happened.
 */
export async function mtdBuildKind(userId: string): Promise<MtdBuildKind> {
  const now = new Date();
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const mtdBuilds = await db.build.findMany({
    where: {
      project: { userId },
      status: "SUCCEEDED",
      creditsCharged: { gt: 0 },
      createdAt: { gte: since },
    },
    select: { id: true, projectId: true, creditsCharged: true },
  });
  if (mtdBuilds.length === 0) return { createCredits: 0, editCredits: 0 };

  const projectIds = [...new Set(mtdBuilds.map((b) => b.projectId))];
  const earliestByProject = await db.build.groupBy({
    by: ["projectId"],
    where: { projectId: { in: projectIds }, status: "SUCCEEDED", creditsCharged: { gt: 0 } },
    _min: { createdAt: true },
  });

  // A second lookup for the actual ROW at each project's earliest timestamp,
  // because groupBy only returns the aggregate, not the id it belongs to.
  const firstRows = await db.build.findMany({
    where: {
      OR: earliestByProject
        .filter((g) => g._min.createdAt !== null)
        .map((g) => ({ projectId: g.projectId, createdAt: g._min.createdAt! })),
    },
    select: { id: true },
  });
  const createIds = new Set(firstRows.map((r) => r.id));

  let createCredits = 0;
  let editCredits = 0;
  for (const b of mtdBuilds) {
    if (createIds.has(b.id)) createCredits += b.creditsCharged;
    else editCredits += b.creditsCharged;
  }
  return { createCredits, editCredits };
}

export type ActivityRow = {
  id: string;
  createdAt: Date;
  delta: number;
  reason: string;
  projectId: string | null;
  projectName: string | null;
};

/**
 * The newest few ledger entries, for a compact "Recent activity" card.
 *
 * Deliberately NOT a second paging/search/filter implementation. The full,
 * paginated, filterable statement already exists at /dashboard/billing —
 * same table, same query shape. Building a second one here would mean two
 * places that could disagree about a customer's own money. This returns a
 * short recent slice and the page links to the real one for "everything".
 */
export async function recentActivity(userId: string, take = 6): Promise<ActivityRow[]> {
  const rows = await db.creditLedger.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
    select: {
      id: true,
      createdAt: true,
      delta: true,
      reason: true,
      build: { select: { project: { select: { id: true, name: true } } } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    delta: r.delta,
    reason: r.reason,
    projectId: r.build?.project?.id ?? null,
    projectName: r.build?.project?.name ?? null,
  }));
}

export type LedgerTotals = {
  /** Every positive delta: the signup grant, paid top-ups, social rewards. */
  added: number;
  /** Every negative delta. Today only chargeForBuild writes one. */
  spent: number;
};

export async function ledgerTotals(userId: string): Promise<LedgerTotals> {
  const [credited, debited] = await Promise.all([
    db.creditLedger.aggregate({ where: { userId, delta: { gt: 0 } }, _sum: { delta: true } }),
    db.creditLedger.aggregate({ where: { userId, delta: { lt: 0 } }, _sum: { delta: true } }),
  ]);
  return {
    added: credited._sum.delta ?? 0,
    spent: Math.abs(debited._sum.delta ?? 0),
  };
}
