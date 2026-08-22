"use client";

// Plan-before-spend: what a build is likely to cost, shown BEFORE the button
// that spends it. Sits directly above Build/Apply and is wired to that button
// with aria-describedby, so the estimate is read out when the button takes
// focus — no second live region (two of those in this file is exactly how the
// progress line ended up being announced twice).
//
// ── What this must never do ───────────────────────────────────────────────
// Present a precise number. estimateCredits() in lib/credits.ts is explicit
// that its range comes from TWO measured builds, 144 and 472 credits — a 3x
// spread that the function's own comment calls "not a distribution". Averaging
// those into "about 300 credits" would be inventing a prediction out of two
// samples, on the one product surface whose entire promise is no bill shock.
// So the global figure is only ever shown as the bracket it is.
//
// Once the user HAS history, their own measured average is a better answer
// than our bracket, and it replaces it — but only when there is really a
// measurement behind it. averageBuildCredits() silently falls back to a global
// constant for a user with no charged builds, so `measuredBuilds` is what
// decides whether we are allowed to call it "your" average. Same gate as the
// "Your average build" tile in app/dashboard/billing/page.tsx, and the same
// reason.

export type CreditRange = { low: number; high: number };

export default function CostEstimate({
  id,
  kind,
  range,
  balance,
  avgBuildCredits,
  measuredBuilds,
}: {
  /** Referenced by the Build button's aria-describedby. */
  id: string;
  kind: "create" | "edit";
  /** estimateCredits(kind) — computed on the server, see page.tsx. */
  range: CreditRange;
  balance: number;
  /** This user's measured average. Only trustworthy when measuredBuilds > 0. */
  avgBuildCredits: number;
  /** Successful, charged builds this user has. 0 means we have measured nothing. */
  measuredBuilds: number;
}) {
  const measured = measuredBuilds > 0;

  // What we compare the balance against. With history that is the user's own
  // average; without it, the TOP of the bracket — warning against the bottom
  // of a 120–550 range would be a warning that never fires when it matters.
  const reference = measured ? avgBuildCredits : range.high;
  const short = balance > 0 && balance < reference;
  const empty = balance <= 0;

  return (
    <div
      id={id}
      className="rounded-md border border-hair bg-surface-2/60 px-2.5 py-2 text-[0.75rem]"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium text-ink-2">
          {kind === "create" ? "Likely cost of this build" : "Likely cost of this change"}
        </span>
        <span className="k-num shrink-0 text-ink-2">
          {measured ? `~${avgBuildCredits} credits` : `${range.low}–${range.high} credits`}
        </span>
      </div>

      <p className="mt-1 leading-relaxed text-ink-3">
        {measured
          ? `Averaged from your own builds (${measuredBuilds} charged so far). An average, not a quote — this one can land either side of it.`
          : "A deliberately wide bracket from the handful of builds we have measured, not a prediction. You are charged for what the build actually uses."}
      </p>

      {(short || empty) && (
        <p className={`mt-1.5 leading-relaxed ${empty ? "text-danger" : "text-warn"}`}>
          {empty ? (
            <>You have no credits left, so this build won&rsquo;t start.</>
          ) : (
            <>
              You have <span className="k-num">{balance}</span> credits —{" "}
              {measured ? "less than your average build" : "less than the top of that range"}.
              {" "}
              {/* Verified against app/api/generate/route.ts: the only pre-flight
                  gate is balance <= 0 (plus the spend cap). Nothing stops a
                  build partway for cost, and chargeForBuild writes the real
                  amount even when it takes the balance negative — so promising
                  a mid-build cutoff here would be inventing engine behaviour. */}
              A build that costs more than you have still finishes and is charged in full; it&rsquo;s the
              next one that won&rsquo;t start.
            </>
          )}
        </p>
      )}
    </div>
  );
}
