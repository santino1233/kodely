import { SUPPORT_STATUS_INFO, isSupportStatus } from "@/lib/support";

// Presentational bits for the ticket queue, in the panel's own idiom —
// monochrome, hairline borders, colour only where it carries a meaning. The
// base primitives (Panel, StatTile, TableFrame, Th, Empty, formatDateTime,
// truncate) and the shared control styling come from the users and feedback
// pages rather than being re-declared, so the support queue reads as the same
// panel and not a look-alike.
//
// NOTE this deliberately does NOT import components/ui. The customer's
// /support is built from the product design system; the admin panel is a
// different, plainer system on purpose, and mixing them is how the two start
// to drift into a third thing.

/**
 * Status, as an operator reads it.
 *
 * Different words from the customer's badge for the same three values —
 * "Needs a reply" is what it means from this side, "Waiting on us" is what it
 * means from theirs — and both come out of the same record in lib/support.ts,
 * so they cannot end up describing different states.
 */
export function StatusPill({ status }: { status: string }) {
  if (!isSupportStatus(status)) {
    return <span className="text-black/40 dark:text-white/40">{status}</span>;
  }
  const label = SUPPORT_STATUS_INFO[status].staffLabel;
  if (status === "OPEN") {
    return (
      <span className="whitespace-nowrap font-medium text-amber-600 dark:text-amber-500">
        {label}
      </span>
    );
  }
  if (status === "ANSWERED") {
    return (
      <span className="whitespace-nowrap font-medium text-emerald-600 dark:text-emerald-400">
        {label}
      </span>
    );
  }
  return <span className="whitespace-nowrap text-black/50 dark:text-white/50">{label}</span>;
}

/** Nobody on our side has opened what this customer last wrote. */
export function UnseenPill() {
  return (
    <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[0.6875rem] font-medium whitespace-nowrap text-amber-700 dark:text-amber-500">
      unread
    </span>
  );
}

/**
 * A reply is published to the customer the instant it is written, so the cap
 * is not about storage — it is about what an operator is likely to paste. The
 * customer's own composer allows the same 5000 characters (BODY_MAX in
 * lib/support.ts) and this stays in step with it deliberately: a thread where
 * one side can say more than the other is a thread that gets truncated
 * mid-explanation.
 *
 * Lives here rather than beside the Server Action because a "use server" file
 * may only export async functions — same reason as NOTE_MAX in
 * app/admin/feedback/ui.tsx.
 */
export type AdminTicketFormState = { error: string | null; ok: boolean };

export const ADMIN_TICKET_FORM_INITIAL: AdminTicketFormState = { error: null, ok: false };
