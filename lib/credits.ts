import { db } from "./db";
import { MODEL_RATES } from "./models";

// ── The anti-bill-shock contract ──────────────────────────────────────────
// 1. A credit is a fixed, published amount of real model spend. No mystery units.
// 2. We charge from METERED tokens after a build succeeds — never a flat guess.
// 3. A build that fails is recorded with its true cost and charged ZERO.
// 4. We never bill for the AI's own mistake. When a build does not compile and
//    the model has to repair its own broken output, the repair pass is
//    recorded at its true cost and charged ZERO. See settleBuild below.
// This is Kodely's clearest wedge against the category (see the board's
// "credit bill-shock" differentiation cards), so it lives in one small module.

/** One credit = $0.002 of underlying model spend (500 credits = $1). */
export const MICROS_PER_CREDIT = 2_000;

/**
 * New accounts start with enough to build and iterate on a real page.
 * Sized from measured real costs (2026-08-17): a full first build runs
 * ~$0.29 (144 credits), a follow-up edit ~$0.34 (172 credits) on Sonnet 5 —
 * 750 covers roughly one build plus 2-3 real edits.
 */
export const SIGNUP_GRANT = 750;

export type Usage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

/**
 * Micro-dollars of real model spend for a given usage on a given model.
 * MODEL_RATES stores USD per MILLION tokens, which — numerically — is
 * already USD-per-token expressed in micro-dollars (1e-6 USD = 1 microUSD).
 * So `rate * tokens` IS the cost in micros directly; do NOT also divide by
 * 1e6, that computes cost in whole dollars instead and silently floors every
 * build under $0.50 to 0 (which is exactly the bug this comment replaced —
 * caught 2026-08-17 when a real ~$0.22 build was charged only 1 credit).
 */
export function costMicros(model: string, usage: Usage): number {
  const rate = MODEL_RATES[model] ?? MODEL_RATES.default;
  const perToken = (perMTok: number, tokens: number) => perMTok * tokens;
  return Math.round(
    perToken(rate.input, usage.inputTokens) +
      perToken(rate.output, usage.outputTokens) +
      perToken(rate.cacheRead, usage.cacheReadTokens) +
      perToken(rate.cacheWrite, usage.cacheWriteTokens),
  );
}

export function creditsFor(micros: number): number {
  // Zero measured cost means zero credits. The floor below exists so a real
  // but tiny cost never rounds down to free — it must NOT turn a build with no
  // metered spend at all into a 1-credit charge.
  //
  // This is not hypothetical: on the SDK engine a build whose telemetry is
  // missing reports 0 tokens and 0 micros (see meterUsage in lib/agent-sdk.ts),
  // and every one of those was being billed a credit for spend that provably
  // did not happen — inside the one module whose stated purpose is never doing
  // that. Found 2026-08-22 in a real ledger row.
  if (micros <= 0) return 0;
  return Math.max(1, Math.ceil(micros / MICROS_PER_CREDIT));
}

// ── Rule 4: the repair pass is on us ──────────────────────────────────────
//
// A run can take more than one attempt (MAX_BUILD_ATTEMPTS in
// app/api/generate/route.ts). Attempt 1 is what the customer asked for. Every
// attempt after it exists only because attempt 1 produced code that did not
// compile — the model's mistake, fed back to the model with a fixed repair
// prompt the customer never sees and cannot steer.
//
// Until this function existed the route summed the tokens of every attempt and
// charged the lot, so a run that broke, self-repaired and then succeeded cost
// roughly double a clean one. Rule 3 already says a build that never compiles
// is free; charging double for one that took two goes to get there contradicts
// the same principle one step later.
//
// WHY WE BILL ATTEMPT 1 AND NOT THE SUCCESSFUL ATTEMPT:
//   - Attempt 1 is the only pass whose content the customer chose. The repair
//     pass is driven entirely by our build error.
//   - Attempt 1's metered cost IS "what a clean run of this request would have
//     cost" — a real measurement, not a cap pulled from a constant. Billing
//     the successful attempt instead would sometimes charge MORE than a clean
//     run, because a repair pass re-reads a project that attempt 1 just grew.
//   - It makes the charge for a repaired run indistinguishable from the charge
//     for a clean one. That is the promise, stated as arithmetic.
//
// The waived tokens were really spent, and `costMicros` below still reports
// every one of them so /admin and /admin/analytics see the true cost. Only
// `credits` — what we CHARGE — is reduced.

const NO_USAGE: Usage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

export function sumUsage(attempts: readonly Usage[]): Usage {
  return attempts.reduce<Usage>(
    (acc, u) => ({
      inputTokens: acc.inputTokens + u.inputTokens,
      outputTokens: acc.outputTokens + u.outputTokens,
      cacheReadTokens: acc.cacheReadTokens + u.cacheReadTokens,
      cacheWriteTokens: acc.cacheWriteTokens + u.cacheWriteTokens,
    }),
    NO_USAGE,
  );
}

export type BuildSettlement = {
  /** TRUE spend for the whole run, every attempt included. Goes on Build.costMicros. */
  costMicros: number;
  /** Spend on the one billable attempt. */
  billedMicros: number;
  /** Spend absorbed because it went on repairing our own broken output. */
  waivedMicros: number;
  /** Credits to actually charge. Goes on Build.creditsCharged and the ledger. */
  credits: number;
  /** Credits the whole-run rule would have charged on top of `credits`. */
  waivedCredits: number;
  /** True when a repair happened AND it saved the customer at least one credit. */
  repairWaived: boolean;
};

/**
 * Turn one run's per-attempt usage into what we record and what we charge.
 *
 * `attempts` is in the order the attempts ran; `attempts[0]` is the customer's
 * request and is the only billable one. An empty array (no telemetry at all)
 * settles to zero, same as any unmetered build — see creditsFor.
 */
export function settleBuild(model: string, attempts: readonly Usage[]): BuildSettlement {
  const total = costMicros(model, sumUsage(attempts));
  const billed = costMicros(model, attempts[0] ?? NO_USAGE);
  const credits = creditsFor(billed);
  // Measured against what the pre-rule-4 behaviour would have charged, so the
  // number we show the customer is the saving they actually made, already
  // rounded the same way their charge is.
  const waivedCredits = Math.max(0, creditsFor(total) - credits);
  return {
    costMicros: total,
    billedMicros: billed,
    waivedMicros: Math.max(0, total - billed),
    credits,
    waivedCredits,
    repairWaived: attempts.length > 1 && waivedCredits > 0,
  };
}

export async function getBalance(userId: string): Promise<number> {
  const latest = await db.creditLedger.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  return latest?.balanceAfter ?? 0;
}

export async function grantCredits(userId: string, amount: number, reason: string) {
  const balance = await getBalance(userId);
  return db.creditLedger.create({
    data: { userId, delta: amount, reason, balanceAfter: balance + amount },
  });
}

/**
 * Charge for a SUCCESSFUL build. Never call this on a failed build — the whole
 * promise to the customer is that broken output is free. `credits` must be the
 * settled figure from settleBuild, not the run's raw cost.
 *
 * The reason string stays exactly "build", including when rule 4 waived a
 * repair. That is deliberate, not an oversight. `describeReason` in
 * app/dashboard/billing/ledger.ts is a closed allowlist that never echoes
 * `reason` back to a customer (it can carry a Stripe session id or an account
 * hash), so ANY new string here — "build:repair_waived" or otherwise — falls
 * through to its unknown branch and downgrades the statement row from "Site
 * build" to a bare "Credits used". Encoding the waiver in `reason` would make
 * the statement worse, not better.
 *
 * The statement does not need an encoding: it already joins CreditLedger.build,
 * and the truth is on that row. Build.repairAttempts > 0 together with
 * costMicros > creditsCharged * MICROS_PER_CREDIT is exactly "this run was
 * repaired and we absorbed it". Surfacing it is two changes outside this
 * module: add `repairAttempts`, `costMicros`, `creditsCharged` to the
 * `build: { select: … }` in app/dashboard/billing/page.tsx, and render a second
 * line on those rows.
 */
export async function chargeForBuild(userId: string, buildId: string, credits: number) {
  const balance = await getBalance(userId);
  await db.creditLedger.create({
    data: {
      userId,
      delta: -credits,
      reason: "build",
      buildId,
      balanceAfter: balance - credits,
    },
  });
  return balance - credits;
}

/**
 * Pre-flight estimate shown BEFORE the user spends anything. Deliberately a
 * range derived from observed build sizes, not a fake precise number.
 *
 * Numbers corrected 2026-08-21. The previous 8-30 / 3-15 ranges predated the
 * costMicros fix and understated real spend by roughly an order of magnitude —
 * on a product whose headline promise is no bill shock, an estimate that low
 * is worse than showing nothing.
 *
 * The honest state of our evidence: measured builds have come in at ~144
 * credits (2026-08-17) and ~472 credits (2026-08-21, a first build of a
 * tradesman site via the eval harness). That is a 3x spread across two
 * samples, so the range below is deliberately wide rather than falsely
 * precise, and skews high — quoting low and charging high is the exact
 * failure this whole module exists to prevent.
 *
 * REPLACE THIS with real percentiles once the eval harness has run a full
 * sweep (scripts/eval). Two data points is not a distribution.
 */
export function estimateCredits(kind: "create" | "edit"): { low: number; high: number } {
  return kind === "create" ? { low: 120, high: 550 } : { low: 60, high: 300 };
}

/**
 * Fallback when a user has no build history to average. Sits near the upper
 * of our two measurements on purpose: this drives "about N more builds", and
 * over-promising remaining builds is how someone hits zero mid-build.
 */
const TYPICAL_BUILD_CREDITS = 400;

/**
 * What a build actually costs THIS user, averaged over their recent successful
 * builds. Personal history beats a global constant: someone building one-page
 * sites and someone building ten-page sites deserve different answers to
 * "how many builds do I have left?".
 */
export async function averageBuildCredits(userId: string): Promise<number> {
  const recent = await db.build.findMany({
    where: { project: { userId }, status: "SUCCEEDED", creditsCharged: { gt: 0 } },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { creditsCharged: true },
  });
  if (recent.length === 0) return TYPICAL_BUILD_CREDITS;
  const total = recent.reduce((sum, b) => sum + b.creditsCharged, 0);
  return Math.max(1, Math.round(total / recent.length));
}

// ── Self-imposed spend cap ────────────────────────────────────────────────
// Point 4 of the anti-bill-shock contract. The three rules above stop us from
// OVERCHARGING for a given build; none of them stop a user from running fifty
// builds in an afternoon and being genuinely shocked by the total. A ceiling
// the user sets themselves is the honest answer, and it is the one guard a
// competitor's $607-against-a-$25-plan incident would have needed.
//
// Rolling 30 days, not calendar month, so there is no "reset day" to game and
// no cliff where a cap silently stops protecting someone mid-month.

const CAP_WINDOW_DAYS = 30;

export type SpendCapStatus = {
  /** NULL when the user has set no cap. */
  cap: number | null;
  spent: number;
  /** Credits still available under the cap; Infinity when uncapped. */
  remaining: number;
  reached: boolean;
};

/** Credits spent on builds in the rolling window. Grants are excluded. */
export async function spentInWindow(userId: string): Promise<number> {
  const since = new Date(Date.now() - CAP_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const { _sum } = await db.creditLedger.aggregate({
    where: { userId, createdAt: { gte: since }, delta: { lt: 0 } },
    _sum: { delta: true },
  });
  // Deltas are negative for spend; report it as a positive number.
  return Math.abs(_sum.delta ?? 0);
}

export async function getSpendCapStatus(userId: string): Promise<SpendCapStatus> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { spendCapCredits: true },
  });
  const cap = user?.spendCapCredits ?? null;

  if (cap === null) {
    return { cap: null, spent: 0, remaining: Infinity, reached: false };
  }

  const spent = await spentInWindow(userId);
  return { cap, spent, remaining: Math.max(0, cap - spent), reached: spent >= cap };
}
