import type { ReactNode } from "react";
import type { Preview } from "./catalogue";

// Presentational helpers for /admin/assets.
//
// A LOCAL copy of the vocabulary in app/admin/sites/ui.tsx and
// app/admin/content/ui.tsx, for the reason those two files each state: a shared
// presentational module that any admin surface can retune turns a styling
// change over there into a visual regression over here. The vocabulary is
// copied on purpose — rounded-xl hairline borders, text-sm, tabular-nums on
// every figure, monochrome except where a colour carries meaning — so the
// panels still read as one product.
//
// Not a route: only page/layout/route filenames are routable.

export function truncate(text: string, max = 60): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current";

export const linkClass = `underline-offset-4 hover:underline ${focusRing}`;

export const buttonClass = `rounded-xl border border-black/10 px-3 py-2 text-sm font-medium hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5 ${focusRing}`;

export const fieldClass = `w-full rounded-xl border border-black/10 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-black/40 focus:border-black/30 dark:border-white/10 dark:placeholder:text-white/40 dark:focus:border-white/30 ${focusRing}`;

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
  const toneClass =
    tone === "bad"
      ? "text-red-600 dark:text-red-400"
      : tone === "warn"
        ? "text-amber-600 dark:text-amber-500"
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
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-black/10 p-5 dark:border-white/10">
      <h2 className="text-sm font-medium">{title}</h2>
      {subtitle ? (
        <p className="mt-0.5 text-xs text-black/50 dark:text-white/50">{subtitle}</p>
      ) : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function Notice({
  tone = "neutral",
  title,
  children,
}: {
  tone?: "neutral" | "warn" | "bad" | "good";
  title?: ReactNode;
  children: ReactNode;
}) {
  const frame =
    tone === "bad"
      ? "border-red-500/40 bg-red-500/5"
      : tone === "warn"
        ? "border-amber-500/40 bg-amber-500/5"
        : tone === "good"
          ? "border-emerald-500/40 bg-emerald-500/5"
          : "border-black/10 bg-black/[0.02] dark:border-white/10 dark:bg-white/[0.02]";
  const heading =
    tone === "bad"
      ? "text-red-700 dark:text-red-400"
      : tone === "warn"
        ? "text-amber-700 dark:text-amber-500"
        : tone === "good"
          ? "text-emerald-700 dark:text-emerald-400"
          : "";
  return (
    <div className={`rounded-xl border p-5 text-sm ${frame}`}>
      {title ? <h2 className={`text-sm font-medium ${heading}`}>{title}</h2> : null}
      <div className={`${title ? "mt-2 " : ""}space-y-3 text-black/70 dark:text-white/70`}>
        {children}
      </div>
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

export function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-black/10 px-1.5 py-0.5 text-[11px] text-black/55 dark:border-white/10 dark:text-white/55">
      {children}
    </span>
  );
}

/**
 * One asset's preview.
 *
 * ── WHY dangerouslySetInnerHTML IS THE RIGHT CALL HERE, AND IS NOT IN
 *    components/brand/LogoPreview.tsx ────────────────────────────────────────
 * That component draws an SVG the USER just picked off their disk, so it must
 * go through an image context where a browser refuses to run script. These
 * strings are the opposite: every one is produced by a pure function in
 * lib/assets over hand-authored literals committed to this repository. No
 * request parameter, no database column and no customer input reaches any of
 * them, so there is nothing here that a sanitiser could protect against that
 * `git log` does not already cover.
 *
 * Inlining rather than a data: URI also costs no network request — the whole
 * point of the catalogue is that these assets are strings, and the page should
 * demonstrate that rather than work around it.
 */
export function AssetPreview({ preview, label }: { preview: Preview; label: string }) {
  const box = "flex items-center justify-center rounded-md border border-black/10 bg-white text-black dark:border-white/10 dark:bg-white/5 dark:text-white";

  if (preview.type === "svg") {
    return (
      <div
        role="img"
        aria-label={label}
        className={`${box} ${preview.shape === "wide" ? "h-10 w-24 overflow-hidden" : "h-10 w-12"} [&>svg]:max-h-full [&>svg]:max-w-full`}
        dangerouslySetInnerHTML={{ __html: preview.markup }}
      />
    );
  }

  if (preview.type === "css") {
    return <div role="img" aria-label={label} className={`${box} h-10 w-12`} style={preview.style} />;
  }

  return (
    <div role="img" aria-label={label} className={`${box} h-10 w-12 text-lg`}>
      {preview.text}
    </div>
  );
}
