// lib/credits.ts — the anti-bill-shock arithmetic.
//
// This is the module where a wrong number is a wrong charge on a real card, so
// it gets the densest coverage in the suite. Everything here is pure: no
// getBalance, no grantCredits, no chargeForBuild (those are Prisma calls and
// belong nowhere near this runner — see scripts/test/README.md).

import test from "node:test";
import assert from "node:assert/strict";

import {
  MICROS_PER_CREDIT,
  SIGNUP_GRANT,
  costMicros,
  creditsFor,
  estimateCredits,
  settleBuild,
  sumUsage,
} from "../lib/credits.ts";
import { MODEL_RATES } from "../lib/models.ts";

/** Shorthand: input, output, cacheRead, cacheWrite. */
const usage = (inputTokens = 0, outputTokens = 0, cacheReadTokens = 0, cacheWriteTokens = 0) => ({
  inputTokens,
  outputTokens,
  cacheReadTokens,
  cacheWriteTokens,
});

// ── costMicros ─────────────────────────────────────────────────────────────

test("costMicros: MODEL_RATES is USD-per-MTok read directly as micros-per-token", () => {
  // The regression this pins: dividing by 1e6 here computes whole dollars and
  // floors every build under $0.50 to zero. Sonnet input is $3/MTok, so 1M
  // input tokens must cost 3_000_000 micros ($3.00) — not 3.
  assert.equal(costMicros("claude-sonnet-5", usage(1_000_000)), 3_000_000);
  assert.equal(costMicros("claude-sonnet-5", usage(1_000)), 3_000);
});

test("costMicros: a real ~$0.22 build is not floored to zero", () => {
  // 2026-08-17. 60k input + 12k output on Sonnet = 180_000 + 180_000 micros.
  const micros = costMicros("claude-sonnet-5", usage(60_000, 12_000));
  assert.equal(micros, 360_000);
  assert.ok(micros > 100_000, "a real build must not round down toward free");
});

test("costMicros: every rate component is charged", () => {
  const r = MODEL_RATES["claude-sonnet-5"];
  assert.equal(costMicros("claude-sonnet-5", usage(1000, 0, 0, 0)), r.input * 1000);
  assert.equal(costMicros("claude-sonnet-5", usage(0, 1000, 0, 0)), r.output * 1000);
  assert.equal(costMicros("claude-sonnet-5", usage(0, 0, 1000, 0)), r.cacheRead * 1000);
  assert.equal(costMicros("claude-sonnet-5", usage(0, 0, 0, 1000)), r.cacheWrite * 1000);
  // And the sum of the parts equals the whole — no component silently dropped.
  assert.equal(
    costMicros("claude-sonnet-5", usage(1000, 1000, 1000, 1000)),
    (r.input + r.output + r.cacheRead + r.cacheWrite) * 1000,
  );
});

test("costMicros: zero usage costs zero micros", () => {
  assert.equal(costMicros("claude-sonnet-5", usage()), 0);
  assert.equal(costMicros("claude-opus-5", usage()), 0);
});

test("costMicros: an unknown model falls back to the conservative default rate", () => {
  // The fallback exists so an unknown model can never UNDER-bill us; it must
  // therefore be at least as expensive as the priciest known model.
  assert.equal(
    costMicros("some-model-we-have-never-heard-of", usage(1000)),
    MODEL_RATES.default.input * 1000,
  );
  assert.ok(MODEL_RATES.default.input >= MODEL_RATES["claude-sonnet-5"].input);
  assert.ok(MODEL_RATES.default.output >= MODEL_RATES["claude-sonnet-5"].output);
});

test("costMicros: returns a whole number of micros", () => {
  // 0.1 * 5 = 0.5 → 1. Fractions of a micro must never reach the ledger.
  const m = costMicros("claude-haiku-4-5", usage(0, 0, 5, 0));
  assert.equal(m, 1);
  assert.ok(Number.isInteger(m));
  assert.ok(Number.isInteger(costMicros("claude-haiku-4-5", usage(0, 0, 4, 0))));
});

// ── creditsFor ─────────────────────────────────────────────────────────────

test("creditsFor(0) is 0 — never charge for spend that did not happen", () => {
  // THE REGRESSION. Before 2026-08-22 the bare Math.max(1, …) floor turned an
  // unmetered build (SDK engine with missing telemetry reports 0 tokens and
  // 0 micros) into a 1-credit charge, in the one module whose stated purpose
  // is never doing that. Found in a real ledger row.
  assert.equal(creditsFor(0), 0);
});

test("creditsFor: negative or non-positive micros are also 0", () => {
  assert.equal(creditsFor(-1), 0);
  assert.equal(creditsFor(-5_000), 0);
  assert.equal(creditsFor(-0), 0);
});

test("creditsFor: a real but tiny cost still floors to 1 credit", () => {
  // The other half of the contract: the floor must survive the zero fix.
  assert.equal(creditsFor(1), 1);
  assert.equal(creditsFor(MICROS_PER_CREDIT - 1), 1);
  assert.equal(creditsFor(MICROS_PER_CREDIT), 1);
});

test("creditsFor: rounds UP on the credit boundary", () => {
  assert.equal(creditsFor(MICROS_PER_CREDIT + 1), 2);
  assert.equal(creditsFor(MICROS_PER_CREDIT * 2), 2);
  assert.equal(creditsFor(MICROS_PER_CREDIT * 2 + 1), 3);
});

test("creditsFor: the published exchange rate holds — 500 credits = $1", () => {
  assert.equal(MICROS_PER_CREDIT, 2_000);
  assert.equal(creditsFor(1_000_000), 500);
});

test("creditsFor is monotonic across the zero boundary", () => {
  let previous = -1;
  for (const micros of [-10, -1, 0, 1, 1_999, 2_000, 2_001, 10_000]) {
    const credits = creditsFor(micros);
    assert.ok(credits >= previous, `creditsFor(${micros}) = ${credits} went backwards`);
    previous = credits;
  }
});

// ── sumUsage ───────────────────────────────────────────────────────────────

test("sumUsage adds every field and returns zeros for no attempts", () => {
  assert.deepEqual(sumUsage([usage(1, 2, 3, 4), usage(10, 20, 30, 40)]), usage(11, 22, 33, 44));
  assert.deepEqual(sumUsage([]), usage());
});

test("sumUsage does not mutate its inputs", () => {
  const a = usage(1, 1, 1, 1);
  const b = usage(2, 2, 2, 2);
  sumUsage([a, b]);
  assert.deepEqual(a, usage(1, 1, 1, 1));
  assert.deepEqual(b, usage(2, 2, 2, 2));
});

// ── settleBuild (rule 4: the repair pass is on us) ─────────────────────────

test("settleBuild: a clean single-attempt run bills its whole measured cost", () => {
  const s = settleBuild("claude-sonnet-5", [usage(100_000, 20_000)]);
  assert.equal(s.costMicros, 600_000);
  assert.equal(s.billedMicros, 600_000);
  assert.equal(s.waivedMicros, 0);
  assert.equal(s.credits, 300);
  assert.equal(s.waivedCredits, 0);
  assert.equal(s.repairWaived, false);
});

test("settleBuild: a repaired run is charged the SAME as a clean one", () => {
  // The promise, stated as arithmetic. Attempt 1 is identical in both runs, so
  // the charge must be identical too — the repair pass is our mistake.
  const clean = settleBuild("claude-sonnet-5", [usage(100_000, 20_000)]);
  const repaired = settleBuild("claude-sonnet-5", [usage(100_000, 20_000), usage(80_000, 10_000)]);
  assert.equal(repaired.credits, clean.credits);
  assert.equal(repaired.billedMicros, clean.billedMicros);
});

test("settleBuild: the TRUE cost of every attempt is still reported", () => {
  // Only what we CHARGE is reduced. /admin must still see real spend.
  const s = settleBuild("claude-sonnet-5", [usage(100_000, 20_000), usage(80_000, 10_000)]);
  assert.equal(s.costMicros, costMicros("claude-sonnet-5", usage(180_000, 30_000)));
  assert.equal(s.costMicros, 990_000);
  assert.equal(s.billedMicros, 600_000);
  assert.equal(s.waivedMicros, 390_000);
  assert.equal(s.costMicros, s.billedMicros + s.waivedMicros);
  assert.equal(s.credits, 300);
  assert.equal(s.waivedCredits, 195);
  assert.equal(s.repairWaived, true);
});

test("settleBuild: waivedCredits is the saving against the pre-rule-4 charge", () => {
  const attempts = [usage(100_000, 20_000), usage(80_000, 10_000)];
  const s = settleBuild("claude-sonnet-5", attempts);
  const wholeRun = creditsFor(costMicros("claude-sonnet-5", sumUsage(attempts)));
  assert.equal(s.credits + s.waivedCredits, wholeRun);
});

test("settleBuild: three attempts still bill only the first", () => {
  const s = settleBuild("claude-sonnet-5", [usage(10_000), usage(90_000), usage(90_000)]);
  assert.equal(s.billedMicros, costMicros("claude-sonnet-5", usage(10_000)));
  assert.equal(s.credits, creditsFor(costMicros("claude-sonnet-5", usage(10_000))));
  assert.equal(s.repairWaived, true);
});

test("settleBuild: no telemetry at all settles to zero, not to one credit", () => {
  // Same contract as creditsFor(0), one level up. An empty attempt list is
  // what an unmetered SDK build produces.
  const s = settleBuild("claude-sonnet-5", []);
  assert.deepEqual(s, {
    costMicros: 0,
    billedMicros: 0,
    waivedMicros: 0,
    credits: 0,
    waivedCredits: 0,
    repairWaived: false,
  });
});

test("settleBuild: an all-zero attempt settles to zero", () => {
  const s = settleBuild("claude-sonnet-5", [usage(), usage()]);
  assert.equal(s.credits, 0);
  assert.equal(s.waivedCredits, 0);
  assert.equal(s.repairWaived, false);
});

test("settleBuild: repairWaived is false when the repair saved nothing", () => {
  // One attempt can never be a repair, however expensive it was.
  assert.equal(settleBuild("claude-sonnet-5", [usage(500_000, 500_000)]).repairWaived, false);
  // Two attempts where the second is free (it was, e.g., a cache-only pass
  // that reported nothing) waive nothing, so the flag must stay down.
  const s = settleBuild("claude-sonnet-5", [usage(100_000), usage()]);
  assert.equal(s.waivedCredits, 0);
  assert.equal(s.repairWaived, false);
});

test("settleBuild: charge never exceeds true cost, and nothing goes negative", () => {
  const cases = [
    [],
    [usage()],
    [usage(1)],
    [usage(1), usage(1_000_000)],
    [usage(1_000_000), usage(1)],
    [usage(0, 0, 0, 1), usage(0, 0, 1, 0), usage(3, 3, 3, 3)],
  ];
  for (const attempts of cases) {
    const s = settleBuild("claude-sonnet-5", attempts);
    assert.ok(s.billedMicros <= s.costMicros, "billed more than the run actually cost");
    assert.ok(s.waivedMicros >= 0);
    assert.ok(s.credits >= 0);
    assert.ok(s.waivedCredits >= 0);
  }
});

// ── estimates and grants ───────────────────────────────────────────────────

test("estimateCredits: a range, wide, skewed high, and never inverted", () => {
  for (const kind of ["create", "edit"]) {
    const { low, high } = estimateCredits(kind);
    assert.ok(Number.isInteger(low) && Number.isInteger(high));
    assert.ok(low > 0, "quoting zero would be a lie");
    assert.ok(high > low, "a single number would be falsely precise");
  }
});

test("estimateCredits: creating costs more than editing, at both ends", () => {
  const create = estimateCredits("create");
  const edit = estimateCredits("edit");
  assert.ok(create.low > edit.low);
  assert.ok(create.high > edit.high);
});

test("estimateCredits: the quote covers the two builds we have actually measured", () => {
  // 144 credits (2026-08-17) and 472 credits (2026-08-21). An estimate that
  // does not span its own evidence is worse than showing nothing.
  const { low, high } = estimateCredits("create");
  assert.ok(low <= 144, `low quote ${low} is above a real measured build of 144`);
  assert.ok(high >= 472, `high quote ${high} is below a real measured build of 472`);
});

test("SIGNUP_GRANT covers at least one measured first build", () => {
  assert.ok(SIGNUP_GRANT >= 472, "a new account must be able to finish one real build");
});
