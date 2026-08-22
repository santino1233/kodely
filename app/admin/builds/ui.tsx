import type { ReactNode } from "react";
import { BLAME_LABEL, family, type FamilyId } from "../health/errors";

// Presentational helpers for /admin/builds. Not a route — only page/layout/
// route filenames are routable — so this file is safe inside the segment.
//
// The vocabulary is the one app/admin/page.tsx, app/admin/users/ui.tsx and
// app/admin/health/ui.tsx already established: rounded-xl hairline borders,
// text-sm, tabular-nums on every figure, monochrome except where colour
// carries status meaning. Kept LOCAL rather than imported from another admin
// subtree, for the reason app/admin/health/ui.tsx states: a shared presentation
// module across subtrees couples two sections' internals for the sake of a
// dozen lines. The one thing this section deliberately does NOT re-implement is
// error classification — that lives in ../health/errors and is imported, never
// copied.

export function truncate(text: string, max = 60): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/**
 * Error text and prompts are multi-line and error text can contain fragments of
 * a customer's source. Collapse to one line before rendering anywhere that is
 * not the detail page's dedicated block, then cut short — a list is for
 * recognising a shape, not for reading customer content.
 */
export function oneLine(text: string, max = 120): string {
  return truncate(text.replace(/\s+/g, " ").trim(), max);
}

/** Whole-second UTC stamp, matching every other table in the panel. */
export function formatDateTime(d: Date): string {
  return d.toISOString().replace("T", " ").slice(0, 19);
}

export function formatUsd(micros: number, decimals = 2): string {
  return `$${(micros / 1_000_000).toFixed(decimals)}`;
}

export function formatInt(n: number): string {
  return n.toLocaleString("en-US");
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Duration from the two timestamps, defended the same way
 * app/admin/health/data.ts defends its percentiles: `endedAt` is null while a
 * build is in flight, and clock skew between the two writes has already
 * produced at least one row in this database where endedAt precedes createdAt.
 * A wrong duration is worse than a missing one.
 */
export function formatDuration(createdAt: Date, endedAt: Date | null): string {
  if (!endedAt) return "—";
  const ms = endedAt.getTime() - createdAt.getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

export function statusClass(status: string): string {
  if (status === "SUCCEEDED") return "text-emerald-600 dark:text-emerald-400";
  if (status === "FAILED") return "text-red-600 dark:text-red-400";
  return "text-black/40 dark:text-white/40";
}

/** Build.model is an empty string until the engine stamps it — every failure that never reached the model. */
export function modelLabel(model: string): string {
  return model || "not stamped";
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

/** A bordered callout. `tone="warn"` for anything that needs a human decision. */
export function Notice({ tone, children }: { tone?: "warn"; children: ReactNode }) {
  const cls =
    tone === "warn"
      ? "border-amber-500/40 bg-amber-500/5"
      : "border-black/10 bg-black/[0.02] dark:border-white/10 dark:bg-white/[0.02]";
  return <div className={`rounded-xl border p-4 text-sm ${cls}`}>{children}</div>;
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

/** Label + value, for the two-column facts blocks on the detail page. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <span className="shrink-0 text-xs text-black/50 dark:text-white/50">{label}</span>
      <span className="text-right text-sm tabular-nums">{children}</span>
    </div>
  );
}

export function Dash() {
  return <span className="text-black/30 dark:text-white/30">—</span>;
}

/**
 * The classified family of an error, with who has to act. Both come straight
 * from ../health/errors — this component renders that vocabulary, it does not
 * hold a second copy of it.
 */
export function FamilyBadge({ id, showBlame = true }: { id: FamilyId; showBlame?: boolean }) {
  const f = family(id);
  return (
    <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
      <span className="rounded-md border border-black/15 px-1.5 py-0.5 text-xs font-medium dark:border-white/15">
        {f.label}
      </span>
      {showBlame ? (
        <span className="text-xs text-black/40 dark:text-white/40">{BLAME_LABEL[f.blame]}</span>
      ) : null}
    </span>
  );
}

/** Thumbs up/down, as recorded by build.rated in lib/events.ts. */
export function RatingMark({ rating }: { rating: string }) {
  if (rating === "up") {
    return <span className="text-emerald-600 dark:text-emerald-400">up</span>;
  }
  if (rating === "down") {
    return <span className="text-red-600 dark:text-red-400">down</span>;
  }
  return <span className="text-black/40 dark:text-white/40">{truncate(rating, 12)}</span>;
}
