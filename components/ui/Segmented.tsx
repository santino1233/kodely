"use client";

import type { ReactNode } from "react";

export type SegmentOption<T extends string> = {
  value: T;
  label: string;
  /** When set, the label is hidden and this is the accessible name — used by
      the grid/list and device toggles, which are icon-only by convention. */
  iconOnly?: boolean;
  icon?: ReactNode;
};

/* A radio group wearing a segmented control's clothes. Real radios, not
   buttons: arrow-key navigation between options and single-tab-stop
   behaviour are what the customer's keyboard already expects from a
   this-or-that choice, and neither comes free with <button>. */
export function Segmented<T extends string>({
  name,
  value,
  onChange,
  options,
  size = "md",
  className = "",
  ariaLabel,
}: {
  name: string;
  value: T;
  onChange: (v: T) => void;
  options: SegmentOption<T>[];
  size?: "sm" | "md";
  className?: string;
  ariaLabel: string;
}) {
  const h = size === "sm" ? "h-7" : "h-8";
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={`inline-flex items-center gap-0.5 rounded-md border border-hair bg-surface-2 p-0.5 ${className}`}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <label
            key={o.value}
            title={o.iconOnly ? o.label : undefined}
            className={[
              // k-focus-within, not a hand-rolled has-[:focus-visible] chain:
              // the radio is sr-only so the label never matches :focus-visible
              // itself, but the RING must still be the product's one ring. See
              // the note beside both rules in app/globals.css.
              "k-focus-within relative inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xs px-2.5 text-[0.8125rem] font-medium",
              h,
              active ? "bg-surface text-ink shadow-e1" : "text-ink-2 hover:text-ink",
              "transition-colors duration-[var(--t-1)]",
            ].join(" ")}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={active}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            {o.icon}
            {o.iconOnly ? <span className="sr-only">{o.label}</span> : o.label}
          </label>
        );
      })}
    </div>
  );
}
