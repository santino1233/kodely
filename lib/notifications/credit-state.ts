import { SIGNUP_GRANT } from "@/lib/credits";

// The single definition of "is this person low on credits?" used by the email
// side of the product.
//
// The boolean part is a DELIBERATE COPY of the rule in
// components/CreditMeter.tsx (that file is a client component owned elsewhere;
// this module may not edit it). The two must stay in step: an email that says
// "you're running low" while the meter in the app is still green — or the
// reverse — undermines the meter, which is the one place this product asks
// people to trust a number about their own money. If you change the thresholds
// in CreditMeter, change them here in the same commit.
//
// Rule, from CreditMeter:
//   buildsLeft = floor(balance / avgBuildCredits)
//   empty      = balance <= 0
//   low        = !empty && (pct <= 20 || buildsLeft < 2)   where pct is the
//                balance as a share of the signup grant ("full tank")
//
// ── Why there is a TIER and not just that boolean ─────────────────────────
//
// The meter's `low` is already TRUE for a brand new account: the signup grant
// is 750 and the fallback average is 400 credits a build, so a fresh user has
// buildsLeft = 1 and the meter is amber from the moment they sign up.
//
// That breaks a naive "email them when they cross from fine to low", because
// anyone whose builds cost more than ~375 credits is never on the fine side to
// begin with — and they are precisely the people most likely to hit zero
// mid-session. The warning would silently never fire for the cohort it exists
// for.
//
// So the state is graded instead of binary, and an email is sent when someone
// moves DOWN a grade:
//
//   ok    — comfortable
//   low   — the meter's amber: at least one more build, but not many
//   spent — cannot afford another build at their own average (this includes
//           a zero or negative balance)
//
// That gives at most two warnings per tank (ok -> low, low -> spent), each one
// anchored to the single ledger row that caused it, and it never fires
// immediately after signup — being told "you're running low" ten minutes after
// creating an account would be its own kind of bill-shock.

export type CreditTier = "ok" | "low" | "spent";

export const TIER_RANK: Record<CreditTier, number> = { ok: 0, low: 1, spent: 2 };

export type CreditState = {
  balance: number;
  /** That user's measured average credits per build (lib/credits.ts). */
  avgBuildCredits: number;
  /** Whole builds the balance still covers, at that user's own average. */
  buildsLeft: number;
  /** Balance as a percentage of the reference "full tank". */
  pct: number;
  /** Balance at or below zero — the hard stop in app/api/generate. */
  empty: boolean;
  /** The meter's amber condition, verbatim. */
  meterLow: boolean;
  tier: CreditTier;
  rank: number;
  /** Worth telling them about at all. */
  needsWarning: boolean;
};

export function creditState(
  balance: number,
  avgBuildCredits: number,
  reference: number = SIGNUP_GRANT,
): CreditState {
  // averageBuildCredits() already floors at 1, but this function is pure and
  // callable with anything; a zero average would make buildsLeft Infinity and
  // silently disable every warning.
  const avg = Math.max(1, avgBuildCredits);
  const buildsLeft = Math.floor(Math.max(0, balance) / avg);
  const pct = Math.max(0, Math.min(100, Math.round((balance / Math.max(1, reference)) * 100)));

  const empty = balance <= 0;
  const meterLow = !empty && (pct <= 20 || buildsLeft < 2);

  const tier: CreditTier = buildsLeft < 1 ? "spent" : meterLow ? "low" : "ok";

  return {
    balance,
    avgBuildCredits: avg,
    buildsLeft,
    pct,
    empty,
    meterLow,
    tier,
    rank: TIER_RANK[tier],
    needsWarning: tier !== "ok",
  };
}

/**
 * The same sentence the meter shows, so the email and the UI never disagree
 * about how much runway someone has. Mirrors the ternary in CreditMeter.
 */
export function runwaySentence(state: CreditState): string {
  if (state.empty) return "You're out of credits.";
  if (state.buildsLeft < 1) return "That isn't enough for another full build.";
  if (state.buildsLeft === 1) return "That's about one more build.";
  return `That's about ${state.buildsLeft} more builds.`;
}

/**
 * True when `after` is a worse grade than `before` AND worth an email. This is
 * the whole idempotency rule for the low-credit warning: it is a property of
 * one transition, so it is true of exactly one ledger row, and that row falls
 * inside exactly one cron slot.
 */
export function droppedIntoWarning(before: CreditState, after: CreditState): boolean {
  return after.needsWarning && after.rank > before.rank;
}
