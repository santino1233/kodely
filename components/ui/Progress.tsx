import type { Tone } from "./Badge";

const FILL: Record<Tone, string> = {
  neutral: "bg-ink-3",
  brand: "bg-brand",
  ok: "bg-ok",
  warn: "bg-warn",
  danger: "bg-danger",
  info: "bg-info",
};

/** Usage bars change tone as they fill. Reused by credits, websites and any
    other quota so "you are close to the limit" always looks the same. */
export function toneForUsage(fraction: number): Tone {
  if (fraction >= 0.9) return "danger";
  if (fraction >= 0.75) return "warn";
  return "brand";
}

export function Progress({
  value,
  max = 100,
  tone,
  size = "md",
  indeterminate = false,
  label,
  className = "",
}: {
  value: number;
  max?: number;
  tone?: Tone;
  size?: "sm" | "md";
  /** For work with no measurable end — a build in flight. */
  indeterminate?: boolean;
  /** Accessible name. Required whenever the bar is not adjacent to its own
      caption, which is most of the time. */
  label?: string;
  className?: string;
}) {
  // Guard the denominator before it reaches a style attribute: a NaN width is
  // silently dropped by the browser and the bar renders permanently empty,
  // which reads as "you have used nothing" rather than as a bug.
  const safeMax = max > 0 ? max : 1;
  const pct = Math.max(0, Math.min(100, (value / safeMax) * 100));
  const resolved = tone ?? toneForUsage(pct / 100);

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={indeterminate ? undefined : Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={`w-full overflow-hidden rounded-full bg-surface-3 ${size === "sm" ? "h-1" : "h-2"} ${className}`}
    >
      {indeterminate ? (
        <div className="k-indeterminate h-full w-full rounded-full" />
      ) : (
        <div
          className={`h-full rounded-full transition-[width,background-color] duration-[var(--t-3)] ease-[var(--ease)] ${FILL[resolved]}`}
          style={{ width: `${pct}%` }}
        />
      )}
    </div>
  );
}
