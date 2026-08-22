import type { ReactNode } from "react";

// Presentational helpers for /admin/content.
//
// Local copies of the vocabulary established in app/admin/page.tsx and
// app/admin/users/ui.tsx — rounded-xl hairline borders, text-sm, tabular-nums
// on every figure, monochrome except where a colour carries status meaning — so
// this section reads as part of the same panel. Duplicated rather than imported
// for the same reason app/admin/flags/page.tsx duplicates them: those helpers
// belong to the /admin/users route folder.
//
// Not a route: only page/layout/route filenames are routable, so this file is
// safe inside app/admin/content/.

export function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function formatDateTime(d: Date): string {
  return d.toISOString().replace("T", " ").slice(0, 19);
}

export function truncate(text: string, max = 60): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** Same arithmetic as readingTime() in app/blog/[slug]/page.tsx. */
export function wordCount(html: string): number {
  return html.replace(/<[^>]+>/g, " ").trim().split(/\s+/).filter(Boolean).length;
}

export const buttonClass =
  "rounded-xl border border-black/10 px-3 py-2 text-sm font-medium hover:bg-black/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current dark:border-white/10 dark:hover:bg-white/5";

export const primaryButtonClass =
  "rounded-xl border border-black/70 bg-black px-3 py-2 text-sm font-medium text-white hover:bg-black/85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current disabled:opacity-40 dark:border-white/70 dark:bg-white dark:text-black dark:hover:bg-white/85";

export const fieldClass =
  "w-full rounded-xl border border-black/10 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-black/40 focus:border-black/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current dark:border-white/10 dark:placeholder:text-white/40 dark:focus:border-white/30";

/** Every interactive element needs a visible keyboard focus state, not just a hover one. */
export const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current";

export const linkClass = `underline-offset-4 hover:underline ${focusRing}`;

export function StatTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "warn" | "bad";
}) {
  return (
    <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
      <div className="text-xs text-black/50 dark:text-white/50">{label}</div>
      <div
        className={`mt-1 text-xl font-semibold tabular-nums ${
          tone === "warn"
            ? "text-amber-600 dark:text-amber-500"
            : tone === "bad"
              ? "text-red-600 dark:text-red-400"
              : ""
        }`}
      >
        {value}
      </div>
      {hint ? <div className="mt-1 text-xs text-black/50 dark:text-white/50">{hint}</div> : null}
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

export function Th({ children, align = "left" }: { children: ReactNode; align?: "left" | "right" }) {
  return (
    <th className={`px-4 py-2 font-medium ${align === "right" ? "text-right" : ""}`}>{children}</th>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-black/15 p-10 text-center text-sm text-black/60 dark:border-white/15 dark:text-white/60">
      {children}
    </div>
  );
}

/**
 * A validator verdict. Problems are red because they refuse the save; warnings
 * are amber because they never do. Colour is the only thing separating them, so
 * each list is also labelled in words.
 */
export function VerdictList({
  problems,
  warnings,
  okLabel = "Passes every check in scripts/seo/validate.mjs.",
}: {
  problems: string[];
  warnings: string[];
  okLabel?: string;
}) {
  if (problems.length === 0 && warnings.length === 0) {
    return (
      <p className="text-sm text-emerald-700 dark:text-emerald-400">{okLabel}</p>
    );
  }
  return (
    <div className="space-y-3 text-sm">
      {problems.length > 0 ? (
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-red-600 dark:text-red-400">
            {problems.length} {problems.length === 1 ? "problem" : "problems"} — save refused
          </div>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-red-700 dark:text-red-300">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {warnings.length > 0 ? (
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-amber-600 dark:text-amber-500">
            {warnings.length} {warnings.length === 1 ? "warning" : "warnings"} — does not block
          </div>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-amber-700 dark:text-amber-500">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
