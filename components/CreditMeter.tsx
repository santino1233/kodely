import Link from "next/link";

// The credit bar, and the warning that fires before the user hits zero.
//
// Design position: the number alone ("412 credits") is meaningless to someone
// who has never seen a build's cost. What people actually want to know is
// "how much more can I do?", so the primary line is BUILDS remaining, derived
// from that user's own measured average, with the raw credit count secondary.
//
// The warning appears at 20% of the reference tank, or whenever fewer than two
// builds remain — before the dead end, never at it. See lib/credits.ts.

export type CreditMeterProps = {
  balance: number;
  /** That user's measured average credits per build. */
  avgBuildCredits: number;
  /** Reference "full tank" for the bar — the signup grant. */
  reference: number;
  canTopUp?: boolean;
};

export default function CreditMeter({
  balance,
  avgBuildCredits,
  reference,
  canTopUp = false,
}: CreditMeterProps) {
  const buildsLeft = Math.floor(balance / avgBuildCredits);
  const pct = Math.max(0, Math.min(100, Math.round((balance / reference) * 100)));

  const empty = balance <= 0;

  // Tone is driven by how much of the tank is gone, NOT by buildsLeft alone.
  //
  // `buildsLeft < 2` was wrong and fired on day one: the signup grant is 750
  // and the fallback average is 400, so a brand-new account computes
  // buildsLeft = 1 and rendered amber the moment someone signed up. A warning
  // shown at full balance isn't a warning, it's noise — and it trains people
  // to ignore the real one.
  //
  // The COUNT stays honest ("About 1 more build" is true at 750); only the
  // alarm colour waits until the tank is actually draining, or until they
  // genuinely cannot afford another build.
  const low = !empty && (pct <= 25 || buildsLeft < 1);

  const tone = empty
    ? { bar: "bg-red-500", text: "text-red-600 dark:text-red-400" }
    : low
      ? { bar: "bg-amber-500", text: "text-amber-600 dark:text-amber-500" }
      : { bar: "bg-emerald-500", text: "text-black/60 dark:text-white/60" };

  return (
    <div className="w-44">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium tabular-nums">{balance}</span>
        <span className="text-xs text-black/50 dark:text-white/50">credits</span>
      </div>

      <div
        className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10"
        role="progressbar"
        aria-valuenow={balance}
        aria-valuemin={0}
        aria-valuemax={reference}
        aria-label="Credits remaining"
      >
        <div className={`h-full rounded-full transition-all ${tone.bar}`} style={{ width: `${pct}%` }} />
      </div>

      <p className={`mt-1.5 text-xs ${tone.text}`}>
        {empty
          ? "Out of credits"
          : buildsLeft < 1
            ? "Not enough for a full build"
            : `About ${buildsLeft} more ${buildsLeft === 1 ? "build" : "builds"}`}
        {(low || empty) && canTopUp && (
          <>
            {" · "}
            <Link href="/pricing" className="underline underline-offset-2 hover:no-underline">
              Top up
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
