// lib/flags.ts — only the parts reachable without a database.
//
// isEnabled, listFlags, setFlag, seedFlags and deleteOrphanFlag all read or
// write the FeatureFlag table and are deliberately NOT tested here (see
// scripts/test/README.md). What is testable is the part with no I/O and the
// most subtle failure mode: the bucketing function, whose bugs are invisible
// in production because every wrong answer still looks like a plausible one.

import test from "node:test";
import assert from "node:assert/strict";

import {
  FLAGS,
  FLAG_CACHE_TTL_MS,
  FLAG_KEYS,
  FLAG_SPECS,
  clampRolloutPct,
  invalidateFlagCache,
  rolloutBucket,
} from "../lib/flags.ts";

const SUBJECTS = Array.from({ length: 2000 }, (_, i) => `user-${i}`);

// ── rolloutBucket: stability ───────────────────────────────────────────────

test("rolloutBucket is stable for the same subject and key", () => {
  // Math.random() here would make a 50% UI rollout flicker between page loads
  // and split one user's builds across both engines.
  for (const id of ["alice", "cm3x9qk0000abcdefghij", ""]) {
    const first = rolloutBucket(id, FLAGS.sdkEngine);
    for (let i = 0; i < 25; i++) assert.equal(rolloutBucket(id, FLAGS.sdkEngine), first);
  }
});

test("rolloutBucket always lands in 0..99, as an integer", () => {
  for (const id of SUBJECTS) {
    const bucket = rolloutBucket(id, FLAGS.sdkEngine);
    assert.ok(Number.isInteger(bucket), `${id} -> ${bucket}`);
    assert.ok(bucket >= 0 && bucket < 100, `${id} -> ${bucket}`);
  }
});

test("rolloutBucket is a pure function of subject and key", () => {
  // No cached state, no clock, no process identity: a restart or a second
  // instance must produce the same answer or the rollout is not a rollout.
  assert.equal(rolloutBucket("alice", FLAGS.sdkEngine), rolloutBucket("alice", FLAGS.sdkEngine));
  invalidateFlagCache();
  assert.equal(rolloutBucket("alice", FLAGS.sdkEngine), rolloutBucket("alice", FLAGS.sdkEngine));
});

// ── rolloutBucket: uniformity ──────────────────────────────────────────────

test("rolloutBucket spreads sequential cuid-like ids across the range", () => {
  // The failure this pins: id.length % 100 or a charCodeAt sum puts ids
  // created near each other in the same bucket, so a 10% rollout selects one
  // contiguous afternoon of signups rather than a random tenth.
  const sequential = Array.from({ length: 500 }, (_, i) => `cm3x9qk00${String(i).padStart(4, "0")}zzzz`);
  const buckets = new Set(sequential.map((id) => rolloutBucket(id, FLAGS.sdkEngine)));
  assert.ok(buckets.size > 80, `500 near-identical ids only reached ${buckets.size} of 100 buckets`);
});

test("a 10% rollout selects roughly a tenth of subjects", () => {
  const selected = SUBJECTS.filter((id) => rolloutBucket(id, FLAGS.sdkEngine) < 10).length;
  const share = selected / SUBJECTS.length;
  assert.ok(share > 0.07 && share < 0.13, `10% rollout selected ${(share * 100).toFixed(1)}%`);
});

test("every bucket gets used, and none of them hogs the population", () => {
  const counts = new Array(100).fill(0);
  for (const id of SUBJECTS) counts[rolloutBucket(id, FLAGS.sdkEngine)]++;
  assert.equal(
    counts.reduce((a, b) => a + b, 0),
    SUBJECTS.length,
  );
  assert.ok(Math.min(...counts) > 0, "a bucket was never selected");
  // Expected 20 per bucket at n=2000; a hash that avalanches properly stays
  // well inside this. A truncating or biased hash does not.
  assert.ok(Math.max(...counts) < 60, `one bucket took ${Math.max(...counts)} of 2000`);
});

// ── rolloutBucket: decorrelation ───────────────────────────────────────────

test("mixing the key in decorrelates flags", () => {
  // Hash the user id alone and every flag at 50% picks the SAME half of the
  // user base: the unluckiest users get every experiment at once, and two
  // independent 50% rollouts are silently one cohort.
  const agree = SUBJECTS.filter(
    (id) => rolloutBucket(id, FLAGS.sdkEngine) < 50 === rolloutBucket(id, FLAGS.promptEnhance) < 50,
  ).length;
  const rate = agree / SUBJECTS.length;
  assert.ok(rate > 0.44 && rate < 0.56, `two 50% rollouts agreed on ${(rate * 100).toFixed(1)}% of subjects`);
});

test("the same subject gets a different bucket per flag", () => {
  const perFlag = FLAG_KEYS.map((key) => rolloutBucket("alice", key));
  assert.ok(new Set(perFlag).size > 1, "one subject landed in the same bucket for every flag");
});

test("neighbouring keys do not produce neighbouring buckets", () => {
  const a = rolloutBucket("alice", "feature.a");
  const b = rolloutBucket("alice", "feature.b");
  assert.notEqual(a, b);
});

// ── clampRolloutPct ────────────────────────────────────────────────────────

test("clampRolloutPct clamps to 0..100 and rounds to an integer", () => {
  assert.equal(clampRolloutPct(-5), 0);
  assert.equal(clampRolloutPct(0), 0);
  assert.equal(clampRolloutPct(50), 50);
  assert.equal(clampRolloutPct(100), 100);
  assert.equal(clampRolloutPct(105), 100);
  assert.equal(clampRolloutPct(33.4), 33);
  assert.equal(clampRolloutPct(33.6), 34);
});

test("clampRolloutPct treats a non-finite value as fully rolled out", () => {
  // A garbled form field must not silently shed traffic from a shipped feature.
  assert.equal(clampRolloutPct(NaN), 100);
  assert.equal(clampRolloutPct(Infinity), 100);
  assert.equal(clampRolloutPct(-Infinity), 100);
});

// ── The declared vocabulary ────────────────────────────────────────────────

test("every flag key has a spec, and every spec has a key", () => {
  assert.deepEqual(FLAG_KEYS.slice().sort(), Object.keys(FLAG_SPECS).sort());
  assert.equal(FLAG_KEYS.length, Object.values(FLAGS).length);
});

test("flag keys are unique", () => {
  assert.equal(new Set(FLAG_KEYS).size, FLAG_KEYS.length);
});

test("every flag reads as a capability that is ON — no inverted flags", () => {
  // Rule 2 of the module: there must be no flag whose enabled=true means "the
  // thing is broken/off", because that is how someone turns generation OFF at
  // 3am while trying to turn it off.
  for (const key of FLAG_KEYS) {
    assert.ok(
      /\.(enabled)$|^feature\./.test(key),
      `${key} does not read as a capability that is on when true`,
    );
    assert.ok(!/disabled|_off|\.off$|kill/.test(key), `${key} reads as an inverted flag`);
  }
});

test("every kill switch fails closed", () => {
  // The entire value of a kill switch is that "off" is enforceable. A kill
  // switch that failed open would stop working during exactly the incident it
  // exists for.
  for (const [key, spec] of Object.entries(FLAG_SPECS)) {
    if (spec.kind !== "kill") continue;
    assert.equal(spec.whenUnavailable, false, `${key} fails open`);
    assert.equal(spec.whenUnset, true, `${key} is off in a fresh environment`);
  }
});

test("every spec declares a reason for its fail direction", () => {
  for (const [key, spec] of Object.entries(FLAG_SPECS)) {
    assert.ok(["kill", "gate"].includes(spec.kind), key);
    assert.equal(typeof spec.whenUnset, "boolean", key);
    assert.equal(typeof spec.whenUnavailable, "boolean", key);
    assert.ok(spec.description.length > 10, `${key} has no usable description`);
    assert.ok(spec.reason.length > 40, `${key} does not explain its fail direction`);
  }
});

test("the cache TTL is short enough that a kill feels immediate", () => {
  // At a minute people click the button twice and then look for a deploy
  // button, which is the failure mode this module exists to remove.
  assert.ok(FLAG_CACHE_TTL_MS > 0 && FLAG_CACHE_TTL_MS <= 15_000);
});

test("invalidateFlagCache is safe to call with no cache and no database", () => {
  assert.doesNotThrow(() => {
    invalidateFlagCache();
    invalidateFlagCache();
  });
});
