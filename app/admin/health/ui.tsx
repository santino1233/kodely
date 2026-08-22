import type { ReactNode } from "react";
import type { CheckStatus } from "./checks";

// Presentational helpers for /admin/health. Not a route — only page/layout/
// route filenames are routable — so this file is safe inside the segment.
//
// The vocabulary is the one app/admin/page.tsx and app/admin/users/ui.tsx
// already established: rounded-xl hairline borders, text-sm, tabular-nums on
// every figure, monochrome except where colour carries status meaning. Kept
// local rather than imported across admin subtrees so this page has no
// coupling to another section's internals.

export function truncate(text: string, max = 60): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/**
 * Error text is multi-line and can contain fragments of a customer's source
 * code. Collapse it to a single line before it is ever rendered, then cut it
 * short — a list view is for recognising a shape, not for reading a log.
 */
export function oneLine(text: string, max = 150): string {
  return truncate(text.replace(/\s+/g, " ").trim(), max);
}

export function formatDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

export function formatUsd(micros: number, decimals = 2): string {
  return `$${(micros / 1_000_000).toFixed(decimals)}`;
}

export function pct(n: number, d: number): number | null {
  if (d <= 0) return null;
  return Math.round((n / d) * 1000) / 10;
}

export function formatPct(v: number | null): string {
  return v === null ? "—" : `${v.toFixed(1)}%`;
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
        <p className="mt-4 text-xs text-black/50 dark:text-white/50">{footnote}</p>
      ) : null}
    </section>
  );
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
  tone?: "warn" | "bad" | "good";
}) {
  const toneClass =
    tone === "bad"
      ? "text-red-600 dark:text-red-400"
      : tone === "warn"
        ? "text-amber-600 dark:text-amber-500"
        : tone === "good"
          ? "text-emerald-600 dark:text-emerald-400"
          : "";
  return (
    <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
      <div className="text-xs text-black/50 dark:text-white/50">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${toneClass}`}>{value}</div>
      {hint ? <div className="mt-1 text-xs text-black/50 dark:text-white/50">{hint}</div> : null}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-black/15 p-10 text-center text-sm text-black/60 dark:border-white/15 dark:text-white/60">
      {children}
    </div>
  );
}

/** Same dashed treatment as Empty, sized to sit inside a Panel. */
export function PanelEmpty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-black/15 p-6 text-center text-sm text-black/50 dark:border-white/15 dark:text-white/50">
      {children}
    </p>
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
}: {
  children: ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th className={`px-4 py-2 font-medium ${align === "right" ? "text-right" : ""}`}>{children}</th>
  );
}

const STATUS_DOT: Record<CheckStatus, string> = {
  ok: "bg-emerald-500",
  fail: "bg-red-500",
  warn: "bg-amber-500",
  unknown: "bg-black/25 dark:bg-white/25",
};

const STATUS_WORD: Record<CheckStatus, string> = {
  ok: "OK",
  fail: "FAIL",
  warn: "NOT SET",
  unknown: "UNKNOWN",
};

const STATUS_TEXT: Record<CheckStatus, string> = {
  ok: "text-emerald-600 dark:text-emerald-400",
  fail: "text-red-600 dark:text-red-400",
  warn: "text-amber-600 dark:text-amber-500",
  unknown: "text-black/40 dark:text-white/40",
};

export function StatusDot({ status }: { status: CheckStatus }) {
  return (
    <span
      aria-hidden
      className={`inline-block size-2 shrink-0 rounded-full ${STATUS_DOT[status]}`}
    />
  );
}

export function StatusWord({ status }: { status: CheckStatus }) {
  return (
    <span className={`text-xs font-medium tabular-nums ${STATUS_TEXT[status]}`}>
      {STATUS_WORD[status]}
    </span>
  );
}

/** A single horizontal share bar. Monochrome by default; colour only for status. */
export function Bar({ width, tone }: { width: number; tone?: "bad" | "good" }) {
  const fill =
    tone === "bad"
      ? "bg-red-500/70"
      : tone === "good"
        ? "bg-emerald-500/70"
        : "bg-black/70 dark:bg-white/70";
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
      <span
        className={`block h-full rounded-full ${fill}`}
        style={{ width: `${Math.max(0, Math.min(100, width))}%` }}
      />
    </span>
  );
}
