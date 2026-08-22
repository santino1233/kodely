import type { ReactNode } from "react";

// Feedback-specific presentational bits. The base primitives (Panel, StatTile,
// TableFrame, Th, Empty, formatDateTime, truncate) are imported from
// app/admin/users/ui.tsx rather than re-declared, so the inbox and the user
// pages stay ONE panel instead of two look-alikes that drift apart.

/**
 * The closed reason set, mirrored from REASONS in app/api/feedback/route.ts.
 * The ids are the contract — the API only ever stores one of these — and the
 * labels are the exact words the customer clicked in
 * app/projects/[id]/BuildRating.tsx, so an operator reading this page and a
 * customer filling the form are talking about the same thing.
 *
 * Order is the order they are offered in, not frequency: a stable axis makes
 * two snapshots of the breakdown comparable by eye.
 */
export const REASONS: { id: string; label: string }[] = [
  { id: "looks-generic", label: "Looks generic" },
  { id: "wrong-content", label: "Wrong content" },
  { id: "layout-off", label: "Layout is off" },
  { id: "missing-something", label: "Missing something" },
  { id: "broken", label: "Something's broken" },
  { id: "other", label: "Other" },
];

const REASON_LABELS = new Map(REASONS.map((r) => [r.id, r.label]));

/** Falls back to the raw id, so a reason added to the API but not here is still legible. */
export function reasonLabel(id: string): string {
  return REASON_LABELS.get(id) ?? id;
}

export function isReasonId(v: string): boolean {
  return REASON_LABELS.has(v);
}

/**
 * Thumbs up/down. Deliberately a word plus a glyph rather than a bare emoji:
 * the emoji alone is what a screen reader announces as "thumbs down sign",
 * and the table is scanned by eye for the word.
 */
export function RatingPill({ rating }: { rating: string | null }) {
  if (rating === "up") {
    return (
      <span className="whitespace-nowrap font-medium text-emerald-600 dark:text-emerald-400">
        Up
      </span>
    );
  }
  if (rating === "down") {
    return (
      <span className="whitespace-nowrap font-medium text-red-600 dark:text-red-400">Down</span>
    );
  }
  return <span className="text-black/30 dark:text-white/30">—</span>;
}

/**
 * Horizontal bar, same vocabulary as the funnel and intent charts on /admin:
 * every bar is scaled against the largest value in its own list, so the shape
 * is the comparison and the numbers are the detail.
 */
export function Bar({ value, max }: { value: number; max: number }) {
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
      <span
        className="block h-full rounded-full bg-black/70 dark:bg-white/70"
        style={{ width: `${max <= 0 ? 0 : (value / max) * 100}%` }}
      />
    </span>
  );
}

/**
 * The amber "read this before you draw a conclusion" box, matching the
 * "Needs a look" panel on the user detail page. Used for the empty-stream
 * caveat, which is a genuine hazard rather than decoration: an empty
 * satisfaction page looks identical to a happy one.
 */
export function Caution({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-8 rounded-xl border border-amber-500/40 bg-amber-500/5 p-5 text-sm">
      <h2 className="text-sm font-medium text-amber-700 dark:text-amber-500">{title}</h2>
      <div className="mt-2 text-black/70 dark:text-white/70">{children}</div>
    </div>
  );
}

/**
 * Notes are operator shorthand, not a transcript. A cap keeps them that way —
 * and keeps someone from pasting a customer's whole email thread, with all the
 * personal data in it, into a table that has no retention policy of its own.
 *
 * Lives here rather than beside the Server Action because a "use server" file
 * may only export async functions.
 */
export const NOTE_MAX = 1500;

export type NoteFormState = { error: string | null; ok: boolean };

export const NOTE_FORM_INITIAL: NoteFormState = { error: null, ok: false };

/** Shared control styling for the GET filter forms. Monochrome, hairline, admin idiom. */
export const controlClass =
  "rounded-xl border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-black/40 dark:border-white/10 dark:focus-visible:ring-white/40";

export const buttonClass =
  "rounded-xl border border-black/10 px-3 py-2 text-sm font-medium hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/40 dark:border-white/10 dark:hover:bg-white/5 dark:focus-visible:ring-white/40";
