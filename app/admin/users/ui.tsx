import type { ReactNode } from "react";

// Presentational helpers shared by the user list and the user detail page.
// Not a route — only page/layout/route filenames are routable — so this file
// is safe to sit inside app/admin/users/.
//
// Everything here mirrors the vocabulary already established in
// app/admin/page.tsx (rounded-xl hairline borders, text-sm, tabular-nums on
// every figure, monochrome except for status semantics) so the two pages read
// as one panel rather than two.

export function formatUsd(micros: number, decimals = 2): string {
  return `$${(micros / 1_000_000).toFixed(decimals)}`;
}

/** Whole-second UTC stamp, matching the recent-builds table on /admin. */
export function formatDateTime(d: Date): string {
  return d.toISOString().replace("T", " ").slice(0, 19);
}

export function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function truncate(text: string, max = 60): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function statusClass(status: string): string {
  if (status === "SUCCEEDED") return "text-emerald-600 dark:text-emerald-400";
  if (status === "FAILED") return "text-red-600 dark:text-red-400";
  return "text-black/40 dark:text-white/40";
}

/**
 * CreditLedger.reason is free text and carries three different encodings —
 * plain words ("build", "signup_grant"), a Stripe session id, and the social
 * reward state machine (app/api/rewards/_lib.ts) whose reason string embeds an
 * identity HASH. Rendering those raw would put a 64-char hex blob in the
 * middle of a billing statement, so decode them into something a human can
 * scan. The raw string is still shown on hover via `title`.
 */
export function reasonLabel(reason: string): string {
  if (reason === "build") return "Build";
  if (reason === "signup_grant") return "Signup grant";
  if (reason.startsWith("stripe:")) return "Credit purchase";
  if (reason.startsWith("reward:")) {
    const parts = reason.split(":");
    const platform = parts[1] ?? "";
    const name = platform ? platform[0].toUpperCase() + platform.slice(1) : "Social";
    return parts[2] === "pending" ? `${name} reward (pending)` : `${name} reward`;
  }
  return reason.replace(/_/g, " ");
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
  tone?: "warn";
}) {
  return (
    <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
      <div className="text-xs text-black/50 dark:text-white/50">{label}</div>
      <div
        className={`mt-1 text-xl font-semibold tabular-nums ${
          tone === "warn" ? "text-amber-600 dark:text-amber-500" : ""
        }`}
      >
        {value}
      </div>
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

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-black/15 p-10 text-center text-sm text-black/60 dark:border-white/15 dark:text-white/60">
      {children}
    </div>
  );
}

/** Scrolling wrapper + hairline frame used by every table on both pages. */
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
