import { db } from "@/lib/db";
import { MICROS_PER_CREDIT } from "@/lib/credits";
import { CREDIT_PACKS } from "@/lib/stripe";

// ── Every query in this file is a single grouped pass ─────────────────────
// Same rule as app/admin/users/page.tsx: no query ever runs inside a loop over
// users or weeks. Each function below is one round trip that returns an
// already-aggregated series, so the page cost is a fixed number of queries
// regardless of how many users, builds or weeks exist.
//
// Weeks come from Postgres `date_trunc('week', ...)`, which buckets to ISO
// Mondays. Prisma stores DateTime as `timestamp(3)` holding a UTC instant, so
// the bucketing is timezone-independent and stable between machines.

/** Hard ceiling on how far back the weekly series go, so no query is unbounded. */
export const WEEKS_BACK = 26;

// ── 1. Realised revenue ───────────────────────────────────────────────────
//
// THE MAPPING, AND WHERE IT IS APPROXIMATE.
//
// `CreditLedger` records CREDITS, never dollars. A paid top-up is written by
// the Stripe webhook (app/api/billing/webhook/route.ts) as:
//
//     delta  = pack.credits
//     reason = "stripe:<checkout session id>"
//
// The reason string carries a SESSION id, not a pack id, so the only bridge
// back to money is the credit count itself. That works because the three packs
// in lib/stripe.ts have distinct credit counts (500 / 2500 / 6000), so a delta
// identifies its pack unambiguously — TODAY.
//
// Three honest limits, all surfaced in the UI rather than smoothed over:
//   a) If a pack's credit count ever changes, or two packs ever share one,
//      historical rows become ambiguous. Rows whose delta matches no current
//      pack are reported in a separate "unattributed" bucket and are NOT
//      guessed at or priced by interpolation.
//   b) This is GROSS revenue at list price. Stripe's fees (~2.9% + 30c) are
//      recorded nowhere in this database, so net receipts are lower.
//   c) A refund processed in the Stripe dashboard writes nothing here, so a
//      refunded purchase still counts. Nothing in the schema can detect that.

const PACK_BY_CREDITS = new Map(CREDIT_PACKS.map((p) => [p.credits, p]));

type RevenueRow = { week: Date; credits: number; purchases: number };

export type RevenueWeek = {
  week: Date;
  purchases: number;
  cents: number;
  /** Purchases whose credit delta matches no pack in CREDIT_PACKS. */
  unattributed: number;
};

export type Revenue = {
  weeks: RevenueWeek[];
  totalCents: number;
  totalPurchases: number;
  payingUsers: number;
  unattributedPurchases: number;
  /** Per-pack lifetime breakdown, for the "what actually sells" question. */
  byPack: { id: string; label: string; credits: number; purchases: number; cents: number }[];
};

export async function realisedRevenue(): Promise<Revenue> {
  const [rows, payers] = await Promise.all([
    db.$queryRaw<RevenueRow[]>`
      SELECT date_trunc('week', l."createdAt") AS week,
             l."delta"::int AS credits,
             COUNT(*)::int AS purchases
      FROM "CreditLedger" l
      WHERE l."reason" LIKE 'stripe:%' AND l."delta" > 0
      GROUP BY 1, 2
      ORDER BY 1, 2`,
    // Distinct buyers, counted in the database rather than by de-duplicating a
    // fetched list in memory.
    db.$queryRaw<{ n: number }[]>`
      SELECT COUNT(DISTINCT l."userId")::int AS n
      FROM "CreditLedger" l
      WHERE l."reason" LIKE 'stripe:%' AND l."delta" > 0`,
  ]);

  const byWeek = new Map<number, RevenueWeek>();
  const byPack = new Map<string, { id: string; label: string; credits: number; purchases: number; cents: number }>();
  let totalCents = 0;
  let totalPurchases = 0;
  let unattributedPurchases = 0;

  for (const r of rows) {
    const key = r.week.getTime();
    const bucket = byWeek.get(key) ?? { week: r.week, purchases: 0, cents: 0, unattributed: 0 };
    const pack = PACK_BY_CREDITS.get(r.credits);

    bucket.purchases += r.purchases;
    totalPurchases += r.purchases;

    if (pack) {
      const cents = pack.priceUsdCents * r.purchases;
      bucket.cents += cents;
      totalCents += cents;
      const p = byPack.get(pack.id) ?? {
        id: pack.id,
        label: pack.label,
        credits: pack.credits,
        purchases: 0,
        cents: 0,
      };
      p.purchases += r.purchases;
      p.cents += cents;
      byPack.set(pack.id, p);
    } else {
      // Deliberately not priced. See limit (a) above.
      bucket.unattributed += r.purchases;
      unattributedPurchases += r.purchases;
    }

    byWeek.set(key, bucket);
  }

  return {
    weeks: [...byWeek.values()].sort((a, b) => a.week.getTime() - b.week.getTime()),
    totalCents,
    totalPurchases,
    payingUsers: payers[0]?.n ?? 0,
    unattributedPurchases,
    byPack: [...byPack.values()].sort((a, b) => b.cents - a.cents),
  };
}

// ── 2. Cost and meter recovery over time ──────────────────────────────────
//
// NOT "margin". The existing /admin tile calls
// `creditsCharged * MICROS_PER_CREDIT` revenue and subtracts cost from it, but
// lib/stripe.ts is explicit that MICROS_PER_CREDIT is a COST BASIS, not a
// price: `creditsFor()` is literally `ceil(costMicros / MICROS_PER_CREDIT)`,
// so that subtraction can only ever return rounding noise. It measures whether
// the meter recovered the spend it metered — a real and useful check — and it
// is labelled as that here instead of as margin.
//
// Retail margin does not exist per build at all. It is realised at the moment
// credits are SOLD (1.5-1.8c/credit against a 0.2c/credit basis), which is
// section 1 above.

type CostRow = {
  week: Date;
  builds: number;
  succeeded: number;
  failed: number;
  costMicros: bigint;
  freeCostMicros: bigint;
  creditsCharged: bigint;
};

export type CostWeek = {
  week: Date;
  builds: number;
  succeeded: number;
  failed: number;
  costMicros: number;
  /** Cost of builds that were charged nothing: failures, and zero-telemetry runs. */
  freeCostMicros: number;
  creditsCharged: number;
  recoveredMicros: number;
};

export async function costByWeek(): Promise<CostWeek[]> {
  const rows = await db.$queryRaw<CostRow[]>`
    SELECT date_trunc('week', b."createdAt") AS week,
           COUNT(*)::int AS builds,
           COUNT(*) FILTER (WHERE b."status" = 'SUCCEEDED')::int AS succeeded,
           COUNT(*) FILTER (WHERE b."status" = 'FAILED')::int AS failed,
           COALESCE(SUM(b."costMicros"), 0)::bigint AS "costMicros",
           COALESCE(SUM(b."costMicros") FILTER (WHERE b."creditsCharged" = 0), 0)::bigint AS "freeCostMicros",
           COALESCE(SUM(b."creditsCharged"), 0)::bigint AS "creditsCharged"
    FROM "Build" b
    WHERE b."createdAt" >= date_trunc('week', NOW()) - (${WEEKS_BACK}::int * INTERVAL '1 week')
    GROUP BY 1
    ORDER BY 1`;

  return rows.map((r) => ({
    week: r.week,
    builds: r.builds,
    succeeded: r.succeeded,
    failed: r.failed,
    costMicros: Number(r.costMicros),
    freeCostMicros: Number(r.freeCostMicros),
    creditsCharged: Number(r.creditsCharged),
    recoveredMicros: Number(r.creditsCharged) * MICROS_PER_CREDIT,
  }));
}

// ── 3. Credit liability ───────────────────────────────────────────────────
//
// Unspent credits are a real obligation: each one is a promise to fund
// MICROS_PER_CREDIT of future model spend. Nothing else in the admin panel
// shows it.
//
// The split matters more than the total, because the two halves are different
// kinds of number:
//   - Credits bought and not yet spent are DEFERRED REVENUE — money already
//     received for a service not yet delivered.
//   - Credits given away (signup grants, social rewards) and not yet spent are
//     pure future cost with no matching revenue. That is marketing spend that
//     has not landed on the P&L yet.
//
// Splitting them requires an ordering assumption, because the ledger records
// a running balance, not lots: it does not say WHICH credits a spend consumed.
// The assumption used here is FIFO with grants first, which is exact for the
// common shape (signup grant, then purchases, then spend) and can only
// misclassify a user who bought credits BEFORE receiving a later free grant.
// `outstanding` below needs no such assumption and is the authoritative total.

type LiabilityRow = {
  usersWithLedger: number;
  purchased: bigint;
  granted: bigint;
  spent: bigint;
  freeOutstanding: bigint;
  paidOutstanding: bigint;
};

export type Liability = {
  usersWithLedger: number;
  usersWithBalance: number;
  purchased: number;
  granted: number;
  spent: number;
  freeOutstanding: number;
  paidOutstanding: number;
  /** Authoritative: sum of each user's newest `balanceAfter`, matching lib/credits.ts. */
  outstanding: number;
  /** Same total derived from summing every delta. A mismatch means ledger drift. */
  outstandingFromDeltas: number;
  micros: number;
};

export async function creditLiability(): Promise<Liability> {
  const [agg, balance] = await Promise.all([
    db.$queryRaw<LiabilityRow[]>`
      WITH per_user AS (
        SELECT l."userId",
               COALESCE(SUM(l."delta") FILTER (WHERE l."delta" > 0 AND l."reason" LIKE 'stripe:%'), 0) AS purchased,
               COALESCE(SUM(l."delta") FILTER (WHERE l."delta" > 0 AND l."reason" NOT LIKE 'stripe:%'), 0) AS granted,
               COALESCE(-SUM(l."delta") FILTER (WHERE l."delta" < 0), 0) AS spent
        FROM "CreditLedger" l
        GROUP BY l."userId"
      )
      SELECT COUNT(*)::int AS "usersWithLedger",
             COALESCE(SUM(purchased), 0)::bigint AS purchased,
             COALESCE(SUM(granted), 0)::bigint AS granted,
             COALESCE(SUM(spent), 0)::bigint AS spent,
             COALESCE(SUM(GREATEST(granted - spent, 0)), 0)::bigint AS "freeOutstanding",
             COALESCE(SUM(GREATEST(purchased - GREATEST(spent - granted, 0), 0)), 0)::bigint AS "paidOutstanding"
      FROM per_user`,
    // The balance lib/credits.ts would return for every user, in one DISTINCT ON
    // pass — the same idiom app/admin/users/page.tsx uses for a page of users.
    db.$queryRaw<{ outstanding: bigint; holders: number }[]>`
      SELECT COALESCE(SUM(b."balanceAfter"), 0)::bigint AS outstanding,
             COUNT(*) FILTER (WHERE b."balanceAfter" > 0)::int AS holders
      FROM (
        SELECT DISTINCT ON (l."userId") l."userId", l."balanceAfter"
        FROM "CreditLedger" l
        ORDER BY l."userId", l."createdAt" DESC, l."id" DESC
      ) b`,
  ]);

  const a = agg[0];
  const purchased = Number(a?.purchased ?? 0);
  const granted = Number(a?.granted ?? 0);
  const spent = Number(a?.spent ?? 0);
  const outstanding = Number(balance[0]?.outstanding ?? 0);

  return {
    usersWithLedger: a?.usersWithLedger ?? 0,
    usersWithBalance: balance[0]?.holders ?? 0,
    purchased,
    granted,
    spent,
    freeOutstanding: Number(a?.freeOutstanding ?? 0),
    paidOutstanding: Number(a?.paidOutstanding ?? 0),
    outstanding,
    outstandingFromDeltas: granted + purchased - spent,
    micros: outstanding * MICROS_PER_CREDIT,
  };
}

// ── 4. Signup cohorts and retention ───────────────────────────────────────
//
// Built from User / Project / Build / CreditLedger, NOT from the Event stream.
// That is a deliberate choice, not a shortcut: `Event` only started collecting
// recently (see the note in lib/events.ts about names that never fired), so a
// cohort table sourced from it would show a near-empty product. The durable
// tables have recorded every signup, project, build and purchase since day one.
// `eventCoverage()` below reports the stream's actual state so the gap is
// visible rather than implied.
//
// "Reached" here means EVER, not "within the cohort week" — these are lifetime
// conversion rates per cohort, so a recent cohort's numbers are still maturing.

type CohortRow = {
  week: Date;
  users: number;
  createdProject: number;
  builtOk: number;
  published: number;
  purchased: number;
};

export type Cohort = CohortRow & { retention: Map<number, number> };

type RetentionRow = { cohort: Date; weekOffset: number; users: number };

export async function signupCohorts(): Promise<{ cohorts: Cohort[]; maxOffset: number }> {
  const [rows, retention] = await Promise.all([
    db.$queryRaw<CohortRow[]>`
      WITH u AS (
        SELECT "id", date_trunc('week', "createdAt") AS wk
        FROM "User"
        WHERE "createdAt" >= date_trunc('week', NOW()) - (${WEEKS_BACK}::int * INTERVAL '1 week')
      ),
      first_project AS (SELECT "userId" AS uid, MIN("createdAt") AS t FROM "Project" GROUP BY 1),
      first_build AS (
        SELECT p."userId" AS uid, MIN(b."createdAt") AS t
        FROM "Build" b JOIN "Project" p ON p."id" = b."projectId"
        WHERE b."status" = 'SUCCEEDED'
        GROUP BY 1
      ),
      first_publish AS (
        SELECT "userId" AS uid, MIN("publishedAt") AS t
        FROM "Project" WHERE "publishedAt" IS NOT NULL GROUP BY 1
      ),
      first_purchase AS (
        SELECT "userId" AS uid, MIN("createdAt") AS t
        FROM "CreditLedger" WHERE "reason" LIKE 'stripe:%' AND "delta" > 0 GROUP BY 1
      )
      SELECT u.wk AS week,
             COUNT(*)::int AS users,
             COUNT(first_project.t)::int AS "createdProject",
             COUNT(first_build.t)::int AS "builtOk",
             COUNT(first_publish.t)::int AS published,
             COUNT(first_purchase.t)::int AS purchased
      FROM u
      LEFT JOIN first_project ON first_project.uid = u."id"
      LEFT JOIN first_build ON first_build.uid = u."id"
      LEFT JOIN first_publish ON first_publish.uid = u."id"
      LEFT JOIN first_purchase ON first_purchase.uid = u."id"
      GROUP BY 1
      ORDER BY 1 DESC`,
    // "Still building in later weeks": distinct users from each cohort who ran
    // at least one build (of any status — an attempt is engagement) in the week
    // N weeks after they signed up.
    db.$queryRaw<RetentionRow[]>`
      WITH u AS (
        SELECT "id", date_trunc('week', "createdAt") AS wk
        FROM "User"
        WHERE "createdAt" >= date_trunc('week', NOW()) - (${WEEKS_BACK}::int * INTERVAL '1 week')
      ),
      activity AS (
        SELECT DISTINCT p."userId" AS uid, date_trunc('week', b."createdAt") AS awk
        FROM "Build" b JOIN "Project" p ON p."id" = b."projectId"
      )
      SELECT u.wk AS cohort,
             (EXTRACT(EPOCH FROM (activity.awk - u.wk)) / 604800)::int AS "weekOffset",
             COUNT(DISTINCT u."id")::int AS users
      FROM u JOIN activity ON activity.uid = u."id"
      WHERE activity.awk >= u.wk
      GROUP BY 1, 2
      ORDER BY 1, 2`,
  ]);

  const byWeek = new Map<number, Cohort>(
    rows.map((r) => [r.week.getTime(), { ...r, retention: new Map<number, number>() }]),
  );

  let maxOffset = 0;
  for (const r of retention) {
    const c = byWeek.get(r.cohort.getTime());
    if (!c) continue;
    c.retention.set(r.weekOffset, r.users);
    if (r.weekOffset > maxOffset) maxOffset = r.weekOffset;
  }

  return { cohorts: [...byWeek.values()], maxOffset };
}

// ── 5. Event stream coverage ──────────────────────────────────────────────
// A diagnostic, not a metric. It answers "can anything on this page be sourced
// from Event yet?" — and right now the answer is no.

export type EventCoverage = {
  total: number;
  names: { name: string; count: number; first: Date; last: Date }[];
  /** Names declared in lib/events.ts that have never been recorded. */
  silent: string[];
};

export async function eventCoverage(declared: string[]): Promise<EventCoverage> {
  const rows = await db.$queryRaw<{ name: string; count: bigint; first: Date; last: Date }[]>`
    SELECT e."name", COUNT(*)::bigint AS count, MIN(e."createdAt") AS first, MAX(e."createdAt") AS last
    FROM "Event" e
    GROUP BY e."name"
    ORDER BY 2 DESC`;

  const seen = new Set(rows.map((r) => r.name));
  const names = rows.map((r) => ({ ...r, count: Number(r.count) }));

  return {
    total: names.reduce((sum, r) => sum + r.count, 0),
    names,
    silent: declared.filter((n) => !seen.has(n)).sort(),
  };
}

// ── 6. Population totals ──────────────────────────────────────────────────
// Denominators for the revenue-per-signup figure. Realised, never projected.

export async function population(): Promise<{ users: number; projects: number; published: number }> {
  const [users, projects, published] = await Promise.all([
    db.user.count(),
    db.project.count(),
    db.project.count({ where: { publishedAt: { not: null } } }),
  ]);
  return { users, projects, published };
}
