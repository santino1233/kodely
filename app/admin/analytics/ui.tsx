import type { ReactNode } from "react";

// Presentational helpers for /admin/analytics. Not a route — only page /
// layout / route filenames are routable — so this file is safe here, same as
// app/admin/users/ui.tsx.
//
// Deliberately a local copy of that vocabulary rather than an import from
// app/admin/users/ui.tsx: that subtree belongs to another surface, and a shared
// import would couple two pages that are free to diverge. The classes are
// identical on purpose (rounded-xl hairline borders, text-sm, tabular-nums on
// every figure, monochrome except amber for a caveat) so the panel reads as one
// admin app.

export function formatUsd(micros: number, decimals = 2): string {
  return `$${(micros / 1_000_000).toFixed(decimals)}`;
}

export function formatCents(cents: number, decimals = 2): string {
  return `$${(cents / 100).toFixed(decimals)}`;
}

export function formatInt(n: number): string {
  return n.toLocaleString("en-US");
}

/** ISO Monday that starts the bucket, as a plain date. */
export function weekLabel(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Share as a whole-ish percent, or an em dash when the denominator is zero. */
export function pct(numerator: number, denominator: number): string {
  if (denominator <= 0) return "—";
  return `${Math.round((numerator / denominator) * 1000) / 10}%`;
}

export function StatTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "warn" | "muted";
}) {
  const toneClass =
    tone === "warn"
      ? "text-amber-600 dark:text-amber-500"
      : tone === "muted"
        ? "text-black/40 dark:text-white/40"
        : "";
  return (
    <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
      <div className="text-xs text-black/50 dark:text-white/50">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${toneClass}`}>{value}</div>
      {hint ? <div className="mt-1 text-xs text-black/50 dark:text-white/50">{hint}</div> : null}
    </div>
  );
}

export function Panel({
  title,
  subtitle,
  children,
  footnote,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footnote?: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-black/10 p-5 dark:border-white/10">
      <h2 className="text-sm font-medium">{title}</h2>
      {subtitle ? (
        <p className="mt-0.5 text-xs text-black/50 dark:text-white/50">{subtitle}</p>
      ) : null}
      <div className="mt-4">{children}</div>
      {footnote ? (
        <p className="mt-3 text-xs text-black/50 dark:text-white/50">{footnote}</p>
      ) : null}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-black/15 p-8 text-center text-sm text-black/60 dark:border-white/15 dark:text-white/60">
      {children}
    </div>
  );
}

/**
 * A figure that is known to be a model rather than a measurement. Amber is the
 * only non-monochrome colour on this page, and it means exactly one thing:
 * "do not read this number as money that moved".
 */
export function Caveat({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-amber-600/30 bg-amber-500/5 p-4 dark:border-amber-500/30">
      <div className="text-sm font-medium text-amber-700 dark:text-amber-400">{title}</div>
      <div className="mt-1 space-y-2 text-sm text-black/70 dark:text-white/70">{children}</div>
    </div>
  );
}

export function TableFrame({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-black/10 dark:border-white/10">
      <table className="w-full text-left text-sm">{children}</table>
    </div>
  );
}

export function Th({
  children,
  align = "left",
  title,
}: {
  children: ReactNode;
  align?: "left" | "right";
  title?: string;
}) {
  return (
    <th
      title={title}
      className={`whitespace-nowrap px-4 py-2 font-medium ${align === "right" ? "text-right" : ""}`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = "left",
  muted = true,
  title,
}: {
  children: ReactNode;
  align?: "left" | "right";
  muted?: boolean;
  title?: string;
}) {
  return (
    <td
      title={title}
      className={`whitespace-nowrap px-4 py-2 tabular-nums ${align === "right" ? "text-right" : ""} ${
        muted ? "text-black/70 dark:text-white/70" : ""
      }`}
    >
      {children}
    </td>
  );
}

/**
 * The funnel-bar pattern from app/admin/page.tsx, extracted so every series on
 * this page uses the same visual. Widths are always relative to a single shared
 * maximum passed by the caller, so bars in one list are comparable to each
 * other — a per-row scale would make every row look full.
 */
export function Bar({ value, max }: { value: number; max: number }) {
  const width = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
      <span
        className="block h-full rounded-full bg-black/70 dark:bg-white/70"
        style={{ width: `${width}%` }}
      />
    </span>
  );
}

/**
 * A labelled bar row: name on the left, bar in the middle, figure on the right.
 * Used for the cohort conversion steps so they read like the activation funnel
 * on /admin rather than like a new chart type.
 */
export function BarRow({
  label,
  value,
  max,
  right,
}: {
  label: ReactNode;
  value: number;
  max: number;
  right: ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 text-sm">
      <span className="w-40 shrink-0">{label}</span>
      <span className="flex-1">
        <Bar value={value} max={max} />
      </span>
      <span className="w-28 shrink-0 text-right tabular-nums text-black/60 dark:text-white/60">
        {right}
      </span>
    </li>
  );
}

/**
 * Retention heat cell. Monochrome by design — opacity carries the value, so it
 * stays readable in both themes and needs no colour legend.
 */
export function HeatCell({ value, denominator }: { value: number | undefined; denominator: number }) {
  if (value === undefined || denominator <= 0) {
    return <Td align="right">—</Td>;
  }
  const share = value / denominator;
  return (
    <td className="relative whitespace-nowrap px-4 py-2 text-right tabular-nums">
      <span
        aria-hidden
        className="absolute inset-x-1 inset-y-0.5 rounded bg-black dark:bg-white"
        style={{ opacity: 0.06 + share * 0.22 }}
      />
      <span className="relative">{pct(value, denominator)}</span>
    </td>
  );
}
