import type { ReactNode } from "react";
import { Progress } from "./Progress";
import type { Tone } from "./Badge";

/* A single number the customer is being asked to understand. The rules that
   make these readable at a glance and which every ad-hoc version got wrong:
   the LABEL is small and quiet, the VALUE is large and tabular, the unit is
   subordinate to the value rather than the same size, and any bar sits below
   both rather than beside them. */
export function Stat({
  label,
  value,
  unit,
  detail,
  bar,
  tone,
  className = "",
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  detail?: ReactNode;
  /** `{ value, max }` renders a usage bar that recolours as it fills. */
  bar?: { value: number; max: number };
  tone?: Tone;
  className?: string;
}) {
  return (
    <div className={`flex flex-col ${className}`}>
      <span className="k-label">{label}</span>
      <span className="mt-2 flex items-baseline gap-1.5">
        <span className="k-num text-2xl leading-none font-semibold tracking-tight text-ink">
          {value}
        </span>
        {unit != null && <span className="text-[0.8125rem] text-ink-3">{unit}</span>}
      </span>
      {bar != null && (
        <Progress
          className="mt-3"
          size="sm"
          value={bar.value}
          max={bar.max}
          tone={tone}
          label={label}
        />
      )}
      {detail != null && <span className="mt-2 text-xs text-ink-2">{detail}</span>}
    </div>
  );
}

/** Row of stats inside one panel, divided rather than boxed separately — four
    individual cards for four related numbers reads as four unrelated things. */
export function StatRow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`grid grid-cols-2 gap-x-6 gap-y-6 lg:grid-cols-4 lg:divide-x lg:divide-hair ${className}`}
    >
      {children}
    </div>
  );
}
