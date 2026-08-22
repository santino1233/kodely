import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { classifyError, FAMILIES, type FamilyId } from "./errors";

// Every query here is a groupBy, an aggregate, or one grouped raw statement
// with bound parameters. Nothing runs inside a loop over rows — the same rule
// app/admin/users/page.tsx follows. The one findMany is bounded by `take` and
// selects three columns, because error text has to be classified in TypeScript
// (the family rules are regexes, and pushing them into SQL would put the
// vocabulary in two places).

export const WINDOWS = {
  "24h": { label: "24 hours", hours: 24, unit: "hour" as const },
  "7d": { label: "7 days", hours: 24 * 7, unit: "day" as const },
  "30d": { label: "30 days", hours: 24 * 30, unit: "day" as const },
  "90d": { label: "90 days", hours: 24 * 90, unit: "day" as const },
};

export type WindowKey = keyof typeof WINDOWS;

export function isWindowKey(v: unknown): v is WindowKey {
  // hasOwnProperty, not `in` — `in` walks the prototype chain, so
  // ?window=constructor passed this guard and produced a reachable 500.
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(WINDOWS, v);
}

/** How many failures are pulled back for classification in one query. */
const FAILURE_SAMPLE_CAP = 2000;

/** A RUNNING build older than this is not running, it is abandoned. */
export const STUCK_AFTER_MS = 15 * 60 * 1000;

export type Bucket = {
  start: Date;
  total: number;
  succeeded: number;
  failed: number;
  running: number;
};

type BucketRow = {
  bucket: Date;
  total: number;
  succeeded: number;
  failed: number;
  running: number;
};

type TimingRow = {
  status: string;
  n: number;
  p50: number | null;
  p95: number | null;
  max: number | null;
};

export type Timing = { status: string; n: number; p50: number | null; p95: number | null; max: number | null };

export type FamilyStat = {
  id: FamilyId;
  count: number;
  /** Share of all classified failures in the window. */
  share: number;
  /** Count within the recent half of the window. */
  recent: number;
  /** Share of failures within the recent half. Null when that half had none. */
  recentShare: number | null;
  lastSeen: Date | null;
  /** Most recent raw error in this family — collapsed and truncated before render. */
  sample: string;
};

export type HealthData = {
  since: Date;
  now: Date;
  midpoint: Date;
  unit: "hour" | "day";

  totalAllTime: number;
  total: number;
  succeeded: number;
  failed: number;
  running: number;
  stuck: number;

  buckets: Bucket[];
  peakFailureRate: { rate: number; start: Date } | null;

  families: FamilyStat[];
  failuresTotal: number;
  failuresSampled: number;

  timings: Timing[];
  repairs: { attempts: number; count: number }[];
  repaired: number;
  succeededFirstTry: number;

  costMicros: number;
  sdkStampedBuilds: number;
};

function bucketStarts(since: Date, now: Date, unit: "hour" | "day"): Date[] {
  const stepMs = unit === "hour" ? 3_600_000 : 86_400_000;
  // Align to a UTC boundary so these line up with Postgres date_trunc, which
  // truncates the stored (UTC) timestamp.
  const first = Math.floor(since.getTime() / stepMs) * stepMs;
  const last = Math.floor(now.getTime() / stepMs) * stepMs;
  const out: Date[] = [];
  for (let t = first; t <= last; t += stepMs) out.push(new Date(t));
  return out;
}

export async function loadHealthData(windowKey: WindowKey): Promise<HealthData> {
  const cfg = WINDOWS[windowKey];
  const now = new Date();
  const since = new Date(now.getTime() - cfg.hours * 3_600_000);
  const midpoint = new Date(since.getTime() + (now.getTime() - since.getTime()) / 2);
  const stuckBefore = new Date(now.getTime() - STUCK_AFTER_MS);

  const inWindow = { createdAt: { gte: since } };

  // Two literal statements rather than one with the unit bound in, so the
  // truncation unit is never string-interpolated into SQL under any code path.
  const bucketRows: BucketRow[] =
    cfg.unit === "hour"
      ? await db.$queryRaw<BucketRow[]>`
          SELECT date_trunc('hour', b."createdAt") AS "bucket",
                 COUNT(*)::int AS "total",
                 COUNT(*) FILTER (WHERE b."status" = 'SUCCEEDED')::int AS "succeeded",
                 COUNT(*) FILTER (WHERE b."status" = 'FAILED')::int AS "failed",
                 COUNT(*) FILTER (WHERE b."status" NOT IN ('SUCCEEDED', 'FAILED'))::int AS "running"
          FROM "Build" b
          WHERE b."createdAt" >= ${since}
          GROUP BY 1
          ORDER BY 1`
      : await db.$queryRaw<BucketRow[]>`
          SELECT date_trunc('day', b."createdAt") AS "bucket",
                 COUNT(*)::int AS "total",
                 COUNT(*) FILTER (WHERE b."status" = 'SUCCEEDED')::int AS "succeeded",
                 COUNT(*) FILTER (WHERE b."status" = 'FAILED')::int AS "failed",
                 COUNT(*) FILTER (WHERE b."status" NOT IN ('SUCCEEDED', 'FAILED'))::int AS "running"
          FROM "Build" b
          WHERE b."createdAt" >= ${since}
          GROUP BY 1
          ORDER BY 1`;

  const [
    totalAllTime,
    statusCounts,
    stuck,
    failuresTotal,
    failureRows,
    timingRows,
    repairRows,
    succeededFirstTry,
    costTotals,
    sdkStampedBuilds,
  ] = await Promise.all([
    db.build.count(),
    db.build.groupBy({ by: ["status"], where: inWindow, _count: { _all: true } }),
    db.build.count({
      where: { status: { notIn: ["SUCCEEDED", "FAILED"] }, createdAt: { lt: stuckBefore } },
    }),
    db.build.count({ where: { ...inWindow, status: "FAILED" } }),
    db.build.findMany({
      where: { ...inWindow, status: "FAILED" },
      select: { error: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: FAILURE_SAMPLE_CAP,
    }),
    // Duration comes from the two timestamps rather than a stored field, so
    // it has to be defended: endedAt is null while a build is in flight, and
    // clock skew between the two writes has produced at least one row in this
    // database where endedAt is 2ms BEFORE createdAt. A negative duration in
    // a percentile is worse than a missing one.
    db.$queryRaw<TimingRow[]>`
      SELECT b."status",
             COUNT(*)::int AS "n",
             percentile_cont(0.5) WITHIN GROUP (
               ORDER BY (EXTRACT(EPOCH FROM (b."endedAt" - b."createdAt")) * 1000)::float8
             ) AS "p50",
             percentile_cont(0.95) WITHIN GROUP (
               ORDER BY (EXTRACT(EPOCH FROM (b."endedAt" - b."createdAt")) * 1000)::float8
             ) AS "p95",
             MAX((EXTRACT(EPOCH FROM (b."endedAt" - b."createdAt")) * 1000)::float8) AS "max"
      FROM "Build" b
      WHERE b."createdAt" >= ${since}
        AND b."endedAt" IS NOT NULL
        AND b."endedAt" >= b."createdAt"
      GROUP BY b."status"
      ORDER BY b."status"`,
    db.build.groupBy({
      by: ["repairAttempts"],
      where: inWindow,
      _count: { _all: true },
      orderBy: { repairAttempts: "asc" },
    }),
    db.build.count({ where: { ...inWindow, status: "SUCCEEDED", repairAttempts: 0 } }),
    db.build.aggregate({ where: inWindow, _sum: { costMicros: true } }),
    // The only rows that PROVE they came from the subscription engine. See the
    // caveat rendered on the page: this is a floor, not the true count.
    db.build.count({ where: { ...inWindow, model: "claude-agent-sdk-subscription" } }),
  ]);

  const succeeded = statusCounts.find((s) => s.status === "SUCCEEDED")?._count._all ?? 0;
  const failed = statusCounts.find((s) => s.status === "FAILED")?._count._all ?? 0;
  const total = statusCounts.reduce((acc, s) => acc + s._count._all, 0);
  const running = total - succeeded - failed;

  // Fill the gaps so the x-axis is real time, not "hours that happened to have
  // a build". A quiet stretch is information.
  const byBucket = new Map(bucketRows.map((r) => [r.bucket.getTime(), r]));
  const buckets: Bucket[] = bucketStarts(since, now, cfg.unit).map((start) => {
    const r = byBucket.get(start.getTime());
    return {
      start,
      total: r ? Number(r.total) : 0,
      succeeded: r ? Number(r.succeeded) : 0,
      failed: r ? Number(r.failed) : 0,
      running: r ? Number(r.running) : 0,
    };
  });

  let peakFailureRate: { rate: number; start: Date } | null = null;
  for (const b of buckets) {
    const finished = b.succeeded + b.failed;
    if (finished === 0) continue;
    const rate = (b.failed / finished) * 100;
    if (!peakFailureRate || rate > peakFailureRate.rate) {
      peakFailureRate = { rate, start: b.start };
    }
  }

  // ── Clustering ────────────────────────────────────────────────────────
  const counts = new Map<FamilyId, FamilyStat>();
  for (const f of FAMILIES) {
    counts.set(f.id, {
      id: f.id,
      count: 0,
      share: 0,
      recent: 0,
      recentShare: null,
      lastSeen: null,
      sample: "",
    });
  }
  let recentTotal = 0;
  for (const row of failureRows) {
    const id = classifyError(row.error);
    const stat = counts.get(id);
    if (!stat) continue;
    stat.count += 1;
    // failureRows is ordered newest-first, so the first row a family sees is
    // its most recent one.
    if (!stat.lastSeen) {
      stat.lastSeen = row.createdAt;
      stat.sample = row.error ?? "(no error text recorded)";
    }
    if (row.createdAt >= midpoint) {
      stat.recent += 1;
      recentTotal += 1;
    }
  }

  const sampled = failureRows.length;
  const families = [...counts.values()]
    .filter((f) => f.count > 0)
    .map((f) => ({
      ...f,
      share: sampled === 0 ? 0 : (f.count / sampled) * 100,
      recentShare: recentTotal === 0 ? null : (f.recent / recentTotal) * 100,
    }))
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));

  return {
    since,
    now,
    midpoint,
    unit: cfg.unit,
    totalAllTime,
    total,
    succeeded,
    failed,
    running,
    stuck,
    buckets,
    peakFailureRate,
    families,
    failuresTotal,
    failuresSampled: sampled,
    timings: timingRows.map((t) => ({
      status: t.status,
      n: Number(t.n),
      p50: t.p50 === null ? null : Number(t.p50),
      p95: t.p95 === null ? null : Number(t.p95),
      max: t.max === null ? null : Number(t.max),
    })),
    repairs: repairRows.map((r) => ({ attempts: r.repairAttempts, count: r._count._all })),
    repaired: repairRows.reduce((acc, r) => acc + (r.repairAttempts > 0 ? r._count._all : 0), 0),
    succeededFirstTry,
    costMicros: costTotals._sum.costMicros ?? 0,
    sdkStampedBuilds,
  };
}

// Re-exported so page.tsx can narrow a caught Prisma error without importing
// the client itself.
export function isPrismaError(e: unknown): boolean {
  return (
    e instanceof Prisma.PrismaClientKnownRequestError ||
    e instanceof Prisma.PrismaClientInitializationError ||
    e instanceof Prisma.PrismaClientUnknownRequestError
  );
}
