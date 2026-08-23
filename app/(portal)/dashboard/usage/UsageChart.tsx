"use client";

import { useState } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatCredits } from "../billing/ledger";
import type { SpendBucket } from "./data";

/* Credits spent over time, drawn by hand.
   ───────────────────────────────────────────────────────────────────────────
   NO CHARTING DEPENDENCY. This is plain SVG — a "use client" component now
   only because the reference screen wants a hover tooltip along the line,
   which needs mouse-position state. Everything ELSE about the chart is the
   same hand-drawn approach as before: no library, every colour a design
   token via CSS variables (never a raw hex on an element), same three
   accessibility channels.

   THEMING. Gradients are declared as local <defs>, not the reserved
   --brand-gradient (that stays on the primary CTA / credits cards) — see the
   comment beside them below.

   ACCESSIBILITY. Three channels, in order of who they serve:
     1. A prose summary above the chart — the shape of the data in a sentence,
        for everyone including people who skim.
     2. The <svg> is role="img" with an aria-label carrying that same summary,
        so a screen reader gets the gist instead of an unlabelled path.
     3. A real <table> in a <details>, keyboard-operable, carrying every figure
        the line encodes. The hover tooltip is a POINTER-ONLY convenience on
        top of this, never the only way to read a value.
   The chart is also legible at any width — it scales uniformly with its
   viewBox, so no label is ever clipped or squashed.

   GRANULARITY. A point may cover one UTC day or a whole week — see
   groupBuckets in ./data.ts, which the "All time" range needs because 400
   daily points in a 660-unit plot are 1px apart. Every label, the summary and
   the table read the span off the bucket itself rather than assuming a day,
   so a weekly point is never presented as a daily one.

   LINE, NOT BARS, AND WHAT THAT COSTS. A zero-spend period is now a dip to
   the baseline rather than an omitted bar — genuinely more honest about
   continuity (spend didn't pause, it was literally zero that day) at the cost
   of the line looking busier on a mostly-idle account. Both are real
   readings of the same numbers; this is the one the reference asked for. */

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
const PAD_T = 16;
const PAD_B = 30;
const PLOT_W = W - PAD_L - PAD_R;
const PLOT_H = H - PAD_T - PAD_B;

type Point = { x: number; y: number; b: SpendBucket };

/** A light Catmull-Rom-to-cubic-Bezier smoothing (tension 1/6) — enough to
    turn straight segments into the soft curve the reference chart uses,
    without a charting dependency. Passes through every real point exactly;
    only the curvature between them is interpolated. */
function smoothPath(points: Point[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? 0 : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 < points.length ? i + 2 : i + 1];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

export function UsageChart({
  buckets,
  days,
  rangeLabel,
}: {
  buckets: SpendBucket[];
  /** Total UTC days the range covers, however they are grouped into points. */
  days: number;
  /** How the range reads in a sentence: "the last 30 days", "all time". */
  rangeLabel: string;
}) {
  const [hover, setHover] = useState<number | null>(null);

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

  // Three gridlines is the most a 164-unit-tall plot can carry without the
  // labels becoming the loudest thing in it.
  const gridValues = [0, max / 2, max];

  const last = buckets.length - 1;
  const tickIndexes = Array.from(
    new Set([0, Math.round(last / 3), Math.round((2 * last) / 3), last]),
  ).filter((i) => i >= 0 && i <= last);

  const xAt = (i: number) => (last > 0 ? PAD_L + (PLOT_W * i) / last : PAD_L + PLOT_W / 2);
  const yAt = (value: number) => PAD_T + PLOT_H * (1 - value / max);

  const points: Point[] = buckets.map((b, i) => ({ x: xAt(i), y: yAt(b.credits), b }));
  const linePath = smoothPath(points);
  const areaPath =
    points.length > 0
      ? `${linePath} L ${points[last].x} ${PAD_T + PLOT_H} L ${points[0].x} ${PAD_T + PLOT_H} Z`
      : "";

  const hovered = hover !== null ? points[hover] : null;

  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    if (last <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const localX = ((e.clientX - rect.left) / rect.width) * W;
    const t = (localX - PAD_L) / PLOT_W;
    setHover(Math.max(0, Math.min(last, Math.round(t * last))));
  }

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

      <div className="relative mt-4">
        <svg
          role="img"
          aria-label={summary}
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full"
          onMouseMove={handleMove}
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            {/* Line + fill gradients, local to this chart — not the reserved
                --brand-gradient (that stays on the primary CTA / credits
                cards). The line runs brand → chart-2 left to right; the fill
                fades from a soft brand wash at the line down to nothing at
                the baseline, the "glow under the curve" look the reference
                uses. */}
            <linearGradient id="usage-line" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--brand)" />
              <stop offset="100%" stopColor="var(--brand-chart-2)" />
            </linearGradient>
            <linearGradient id="usage-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.35" />
              <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {gridValues.map((value) => (
            <g key={value}>
              <line
                x1={PAD_L}
                x2={W - PAD_R}
                y1={yAt(value)}
                y2={yAt(value)}
                className={value === 0 ? "stroke-line-mid" : "stroke-hair"}
                strokeWidth={1}
              />
              <text
                x={PAD_L - 8}
                y={yAt(value) + 3.5}
                textAnchor="end"
                fontSize={10}
                className="k-num fill-ink-3"
              >
                {formatCredits(Math.round(value))}
              </text>
            </g>
          ))}

          <path d={areaPath} fill="url(#usage-area)" />
          <path d={linePath} fill="none" stroke="url(#usage-line)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />

          {points.map((p, i) =>
            p.b.credits > 0 ? (
              <circle
                key={p.b.ts}
                cx={p.x}
                cy={p.y}
                r={hover === i ? 4 : 2.5}
                className="fill-brand"
                style={{ transition: "r 120ms var(--ease-io)" }}
              />
            ) : null,
          )}

          {hovered && (
            <line
              x1={hovered.x}
              x2={hovered.x}
              y1={PAD_T}
              y2={PAD_T + PLOT_H}
              className="stroke-line-mid"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          )}

          {tickIndexes.map((i) => (
            <text
              key={buckets[i].ts}
              x={xAt(i)}
              y={H - 10}
              textAnchor={i === 0 ? "start" : i === last ? "end" : "middle"}
              fontSize={10}
              className="k-num fill-ink-3"
            >
              {AXIS_DATE.format(new Date(buckets[i].ts))}
            </text>
          ))}
        </svg>

        {/* The hover tooltip — a pointer-only convenience, positioned by the
            same viewBox math as the SVG itself, so it always lands on the
            hovered point regardless of how wide the chart has scaled. */}
        {hovered && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[calc(100%+10px)] rounded-lg border border-hair bg-surface px-3 py-2 text-xs whitespace-nowrap shadow-e2"
            style={{ left: `${(hovered.x / W) * 100}%`, top: `${(hovered.y / H) * 100}%` }}
          >
            <p className="font-medium text-ink">{bucketLabel(hovered.b)}</p>
            <p className="k-num text-ink-2">{formatCredits(hovered.b.credits)} credits</p>
          </div>
        )}
      </div>

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
