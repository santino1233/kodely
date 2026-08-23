import { formatCredits } from "../billing/ledger";

/* "Usage this month", as a real two-way split rather than the three-way
   success/failed/other split a visual reference showed.
   ───────────────────────────────────────────────────────────────────────────
   THAT SPLIT CANNOT BE HONEST HERE: a failed build is charged zero credits
   (see notCharged in ./data.ts) — chargeForBuild is only ever reached on the
   SUCCEEDED path — so a slice attributing spend to "failed builds" would be a
   100%/0%/0% chart wearing a three-category costume.

   THE REAL SPLIT: every charged build is either a project's first charge
   (a new site) or a follow-up (an edit to one that already existed). That is
   recoverable from data that already exists — see mtdBuildKind in ./data.ts —
   and it says something genuinely useful: whether this month's spend went on
   starting things or improving them.

   Plain SVG, no dependency, same conventions as ./UsageChart.tsx: colour is
   Tailwind classes bound to tokens, never a hex; the arc is decorative
   (aria-hidden) because the legend beside it is the real, accessible source
   of the numbers — the same "picture plus text, text is authoritative"
   split the chart uses via its table fallback. */

const R = 40;
const CIRCUMFERENCE = 2 * Math.PI * R;

export function SpendKindDonut({
  createCredits,
  editCredits,
}: {
  createCredits: number;
  editCredits: number;
}) {
  const total = createCredits + editCredits;

  if (total <= 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <div className="grid size-28 place-items-center rounded-full border-8 border-surface-3">
          <span className="k-num text-lg font-semibold text-ink-3">0</span>
        </div>
        <p className="text-xs text-ink-3">Nothing charged yet this month.</p>
      </div>
    );
  }

  const createFraction = createCredits / total;
  const createLength = CIRCUMFERENCE * createFraction;

  return (
    <div className="flex items-center gap-5">
      <svg
        viewBox="0 0 100 100"
        width={112}
        height={112}
        aria-hidden
        className="shrink-0 -rotate-90"
      >
        <defs>
          {/* Two local gradients, not the reserved --brand-gradient — same
              rule as UsageChart.tsx's bar fill. "New sites" runs brand →
              chart-2 (pink → purple); "Edits" runs chart-2 → chart-3
              (purple → peach), so the two arcs read as one continuous
              spectrum split in two rather than "brand vs. flat grey". */}
          <linearGradient id="donut-create" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--brand)" />
            <stop offset="100%" stopColor="var(--brand-chart-2)" />
          </linearGradient>
          <linearGradient id="donut-edit" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--brand-chart-2)" />
            <stop offset="100%" stopColor="var(--brand-chart-3)" />
          </linearGradient>
          {/* A soft glow behind the ring — purely decorative, matches the
              luminous-arc look the reference chart uses. */}
          <filter id="donut-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <circle cx="50" cy="50" r={R} fill="none" strokeWidth="12" className="stroke-surface-3" />
        <g filter="url(#donut-glow)">
          {editCredits > 0 && (
            <circle
              cx="50"
              cy="50"
              r={R}
              fill="none"
              strokeWidth="12"
              strokeLinecap="butt"
              stroke="url(#donut-edit)"
              strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
            />
          )}
          {createCredits > 0 && (
            <circle
              cx="50"
              cy="50"
              r={R}
              fill="none"
              strokeWidth="12"
              strokeLinecap="butt"
              stroke="url(#donut-create)"
              strokeDasharray={`${createLength} ${CIRCUMFERENCE}`}
            />
          )}
        </g>
      </svg>

      <div className="min-w-0 flex-1">
        <p
          className="k-num bg-clip-text text-3xl leading-none font-bold text-transparent"
          style={{ backgroundImage: "linear-gradient(135deg, var(--brand), var(--brand-chart-2))" }}
        >
          {formatCredits(total)}
        </p>
        <p className="mt-1 text-xs text-ink-2">credits this month</p>

        <ul className="mt-3 flex flex-col gap-1.5 text-xs">
          <li className="flex items-center gap-2">
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full"
              style={{ background: "linear-gradient(135deg, var(--brand), var(--brand-chart-2))" }}
            />
            <span className="text-ink-2">New sites</span>
            <span className="k-num ml-auto font-medium text-ink">
              {formatCredits(createCredits)}
            </span>
          </li>
          <li className="flex items-center gap-2">
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full"
              style={{
                background: "linear-gradient(135deg, var(--brand-chart-2), var(--brand-chart-3))",
              }}
            />
            <span className="text-ink-2">Edits</span>
            <span className="k-num ml-auto font-medium text-ink">
              {formatCredits(editCredits)}
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
}
