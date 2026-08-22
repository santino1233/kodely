import { EmptyState } from "@/components/ui/EmptyState";
import { formatCredits } from "../billing/ledger";
import type { SpendBucket } from "./data";

/* Credits spent over time, drawn by hand.
   ───────────────────────────────────────────────────────────────────────────
   NO CHARTING DEPENDENCY. This is plain SVG in a Server Component: it ships no
   JavaScript at all, which for a static bar chart is not a compromise — it is
   the better answer.

   THEMING. Every colour is a Tailwind class bound to a design token
   (`fill-brand`, `stroke-hair`, `fill-ink-3`), never an attribute and never a
   hex, so light and dark are handled by the same variable swap as the rest of
   the product. Presentational SVG attributes lose to CSS, which is why the
   classes work at all.

   ACCESSIBILITY. Three channels, in order of who they serve:
     1. A prose summary above the chart — the shape of the data in a sentence,
        for everyone including people who skim.
     2. The <svg> is role="img" with an aria-label carrying that same summary,
        so a screen reader gets the gist instead of 30 unlabelled <rect>s.
     3. A real <table> in a <details>, keyboard-operable, carrying every figure
        the bars encode. The bars are not individually focusable BECAUSE the
        table exists: 30 tab stops that each announce one number is worse than
        one tab stop that opens all of them.
   The chart is also legible at any width — it scales uniformly with its
   viewBox, so no label is ever clipped or squashed.

   GRANULARITY. A bar may cover one UTC day or a whole week — see groupBuckets
   in ./data.ts, which the "All time" range needs because 400 daily bars in a
   660-unit plot are 1px apart. Every label, the summary and the table read the
   span off the bucket itself rather than assuming a day, so a weekly bar is
   never presented as a daily one. */

const AXIS_DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

const FULL_DATE = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const SPAN_DATE = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const MS_DAY = 24 * 60 * 60 * 1000;

/** Last UTC day a bucket covers. */
function endTs(b: SpendBucket): number {
  return b.ts + (b.days - 1) * MS_DAY;
}

/** "Mon 12 Aug 2026" for a single day, "12 Aug – 18 Aug 2026" for a group. */
function bucketLabel(b: SpendBucket): string {
  if (b.days <= 1) return FULL_DATE.format(new Date(b.ts));
  return `${SPAN_DATE.format(new Date(b.ts))} – ${SPAN_DATE.format(new Date(endTs(b)))}`;
}

/** Round a peak up to a round number so the top gridline reads as a real
    quantity ("500") rather than as the maximum sample ("472"). */
function niceCeiling(peak: number): number {
  if (peak <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(peak));
  for (const step of [1, 1.5, 2, 2.5, 5, 10]) {
    const candidate = step * magnitude;
    if (candidate >= peak) return Math.ceil(candidate);
  }
  return Math.ceil(10 * magnitude);
}

// User-space geometry. The SVG scales uniformly to its container, so these are
// proportions rather than pixels.
const W = 720;
const H = 210;
const PAD_L = 48;
const PAD_R = 10;
const PAD_T = 12;
const PAD_B = 30;
const PLOT_W = W - PAD_L - PAD_R;
const PLOT_H = H - PAD_T - PAD_B;

export function UsageChart({
  buckets,
  days,
  rangeLabel,
}: {
  buckets: SpendBucket[];
  /** Total UTC days the range covers, however they are grouped into bars. */
  days: number;
  /** How the range reads in a sentence: "the last 30 days", "all time". */
  rangeLabel: string;
}) {
  const total = buckets.reduce((sum, b) => sum + b.credits, 0);
  const grouped = buckets.some((b) => b.days > 1);
  const unit = grouped ? "week" : "day";

  if (total === 0 || buckets.length === 0) {
    return (
      <EmptyState
        className="mt-5"
        kind="empty"
        title={`No credits spent in ${rangeLabel}`}
        body="Nothing has been charged to your account in this window. A build only reaches this chart once it has succeeded and had measured model cost — failed builds are free and never appear."
      />
    );
  }

  const active = buckets.filter((b) => b.credits > 0);
  const activeCount = active.length;
  const peak = buckets.reduce((best, b) => (b.credits > best.credits ? b : best), buckets[0]);
  const max = niceCeiling(peak.credits);

  const summary =
    `Credits spent per ${unit} over ${rangeLabel}. ` +
    `${formatCredits(total)} credits in total across ${activeCount} ` +
    `${activeCount === 1 ? unit : `${unit}s`} with any spend. ` +
    `The heaviest ${unit} was ${bucketLabel(peak)} at ` +
    `${formatCredits(peak.credits)} credits.`;

  const slot = PLOT_W / buckets.length;
  const barW = Math.max(2, Math.min(18, slot * 0.62));

  // Three gridlines is the most a 170-unit-tall plot can carry without the
  // labels becoming the loudest thing in it.
  const gridValues = [0, max / 2, max];

  // Four x labels, evenly spaced and always including both ends, so the reader
  // can date any bar by interpolation without 30 overlapping labels.
  const last = buckets.length - 1;
  const tickIndexes = Array.from(
    new Set([0, Math.round(last / 3), Math.round((2 * last) / 3), last]),
  ).filter((i) => i >= 0 && i <= last);

  const y = (value: number) => PAD_T + PLOT_H * (1 - value / max);

  return (
    <figure className="mt-5">
      <figcaption className="text-sm leading-relaxed text-ink-2">
        <span className="k-num font-medium text-ink">{formatCredits(total)}</span> credits over{" "}
        {rangeLabel}, across{" "}
        <span className="k-num font-medium text-ink">{activeCount}</span>{" "}
        {activeCount === 1 ? unit : `${unit}s`} with any spend. Heaviest {unit}:{" "}
        <span className="k-num font-medium text-ink">{formatCredits(peak.credits)}</span> credits,{" "}
        {bucketLabel(peak)}.
      </figcaption>

      <svg role="img" aria-label={summary} viewBox={`0 0 ${W} ${H}`} className="mt-4 h-auto w-full">
        {gridValues.map((value) => (
          <g key={value}>
            <line
              x1={PAD_L}
              x2={W - PAD_R}
              y1={y(value)}
              y2={y(value)}
              className={value === 0 ? "stroke-line-mid" : "stroke-hair"}
              strokeWidth={1}
            />
            <text
              x={PAD_L - 8}
              y={y(value) + 3.5}
              textAnchor="end"
              fontSize={10}
              className="k-num fill-ink-3"
            >
              {formatCredits(Math.round(value))}
            </text>
          </g>
        ))}

        {buckets.map((b, i) => {
          if (b.credits <= 0) return null;
          // A one-unit floor so a real but tiny period is a visible mark rather
          // than a gap indistinguishable from one with no spend at all.
          const height = Math.max(1.5, (b.credits / max) * PLOT_H);
          return (
            <rect
              key={b.ts}
              x={PAD_L + slot * (i + 0.5) - barW / 2}
              y={PAD_T + PLOT_H - height}
              width={barW}
              height={height}
              rx={1.5}
              className="fill-brand"
            />
          );
        })}

        {tickIndexes.map((i) => (
          <text
            key={buckets[i].ts}
            x={PAD_L + slot * (i + 0.5)}
            y={H - 10}
            textAnchor={i === 0 ? "start" : i === last ? "end" : "middle"}
            fontSize={10}
            className="k-num fill-ink-3"
          >
            {AXIS_DATE.format(new Date(buckets[i].ts))}
          </text>
        ))}
      </svg>

      <details className="mt-4">
        <summary className="k-focus inline-flex cursor-pointer rounded-sm text-[0.8125rem] font-medium text-ink-2 hover:text-ink">
          Show these <span className="k-num">{activeCount}</span>{" "}
          {activeCount === 1 ? unit : `${unit}s`} as a table
        </summary>
        <div className="k-scroll-x mt-3 rounded-lg border border-hair">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">
              Credits spent per {unit} over {rangeLabel}. Periods with no spend are omitted.
            </caption>
            <thead>
              <tr className="border-b border-hair">
                <th scope="col" className="k-label px-4 py-2.5 font-semibold">
                  {grouped ? "Period (UTC)" : "Day (UTC)"}
                </th>
                <th scope="col" className="k-label px-4 py-2.5 text-right font-semibold">
                  Credits
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hair">
              {active
                .slice()
                .reverse()
                .map((b) => (
                  <tr key={b.ts}>
                    <td className="k-num px-4 py-2.5 whitespace-nowrap text-ink-2">
                      {bucketLabel(b)}
                    </td>
                    <td className="k-num px-4 py-2.5 text-right font-medium whitespace-nowrap text-ink">
                      {formatCredits(b.credits)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-ink-3">
          {grouped ? (
            <>
              Weeks with no spend are left out —{" "}
              <span className="k-num">{buckets.length - activeCount}</span> of{" "}
              <span className="k-num">{buckets.length}</span>. Each week is seven UTC days except
              the earliest, which is trimmed to the start of the range.
            </>
          ) : (
            <>
              Days with no spend are left out —{" "}
              <span className="k-num">{days - activeCount}</span> of the last{" "}
              <span className="k-num">{days}</span>.
            </>
          )}
        </p>
      </details>
    </figure>
  );
}
