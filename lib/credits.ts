import { db } from "./db";
import { MODEL_RATES } from "./models";

// ── The anti-bill-shock contract ──────────────────────────────────────────
// 1. A credit is a fixed, published amount of real model spend. No mystery units.
// 2. We charge from METERED tokens after a build succeeds — never a flat guess.
// 3. A build that fails is recorded with its true cost and charged ZERO.
// This is Kodely's clearest wedge against the category (see the board's
// "credit bill-shock" differentiation cards), so it lives in one small module.

/** One credit = $0.002 of underlying model spend (500 credits = $1). */
export const MICROS_PER_CREDIT = 2_000;

/** New accounts start with enough to build and iterate on a real page. */
export const SIGNUP_GRANT = 250;

export type Usage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

/** Micro-dollars of real model spend for a given usage on a given model. */
export function costMicros(model: string, usage: Usage): number {
  const rate = MODEL_RATES[model] ?? MODEL_RATES.default;
  const perToken = (perMTok: number, tokens: number) => (perMTok * tokens) / 1_000_000;
  return Math.round(
    perToken(rate.input, usage.inputTokens) +
      perToken(rate.output, usage.outputTokens) +
      perToken(rate.cacheRead, usage.cacheReadTokens) +
      perToken(rate.cacheWrite, usage.cacheWriteTokens),
  );
}

export function creditsFor(micros: number): number {
  return Math.max(1, Math.ceil(micros / MICROS_PER_CREDIT));
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
 * promise to the customer is that broken output is free.
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
 */
export function estimateCredits(kind: "create" | "edit"): { low: number; high: number } {
  return kind === "create" ? { low: 8, high: 30 } : { low: 3, high: 15 };
}
