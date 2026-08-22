"use client";

import { useActionState } from "react";
import { BODY_MAX, SUPPORT_STATUSES, SUPPORT_STATUS_INFO } from "@/lib/support";
import { buttonClass, controlClass } from "../feedback/ui";
import { changeTicketStatus, replyToTicket } from "./actions";
import { ADMIN_TICKET_FORM_INITIAL } from "./ui";

// The two write surfaces on a thread. Client components only so the operator
// gets a pending state and an inline error instead of a full page reload with
// a half-written reply lost — both `<form action>`s still post without
// JavaScript, and React clears the textarea itself once the action resolves.

export function ReplyBox({ ticketId, customerEmail }: { ticketId: string; customerEmail: string }) {
  const [state, formAction, pending] = useActionState(replyToTicket, ADMIN_TICKET_FORM_INITIAL);

  return (
    <form action={formAction}>
      <input type="hidden" name="ticketId" value={ticketId} />

      <label htmlFor="reply-body" className="block text-sm font-medium">
        Reply to {customerEmail}
      </label>

      {/* Not a placeholder and not a tooltip: this has to be readable while
          the operator is typing, which is the moment it matters. */}
      <p id="reply-guidance" className="mt-1 text-xs text-black/60 dark:text-white/60">
        <strong>This is published to the customer on send.</strong> It appears in their thread on
        /support immediately and they are emailed to say so. It is not a support note — anything
        you would only write because they cannot see it belongs in{" "}
        <span className="font-mono text-[0.6875rem]">/admin/feedback/notes</span> instead.
      </p>

      <textarea
        id="reply-body"
        name="body"
        rows={6}
        required
        maxLength={BODY_MAX}
        aria-describedby="reply-guidance reply-status"
        placeholder="You weren't charged for that build — failed builds never are. The 40 credits on the 21st were the successful rebuild an hour later; here's the line in your history…"
        className="mt-2 w-full resize-y rounded-xl border border-black/10 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-black/40 focus-visible:ring-2 focus-visible:ring-black/40 dark:border-white/10 dark:placeholder:text-white/40 dark:focus-visible:ring-white/40"
      />

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button type="submit" className={buttonClass} disabled={pending}>
          {pending ? "Sending…" : "Send reply"}
        </button>
        <span className="text-xs text-black/50 dark:text-white/50">
          Up to {BODY_MAX} characters. Replies cannot be edited or unsent.
        </span>
      </div>

      {/* One live region for both outcomes, so a screen reader hears the result
          of the submit it just made without the focus moving anywhere. */}
      <p
        id="reply-status"
        role="status"
        aria-live="polite"
        className={`mt-2 text-sm ${
          state.error ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"
        }`}
      >
        {state.error ? state.error : state.ok ? "Sent. The customer can see it now." : ""}
      </p>
    </form>
  );
}

export function StatusForm({ ticketId, status }: { ticketId: string; status: string }) {
  const [state, formAction, pending] = useActionState(
    changeTicketStatus,
    ADMIN_TICKET_FORM_INITIAL,
  );

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="ticketId" value={ticketId} />
      <label htmlFor="status-select" className="text-sm text-black/60 dark:text-white/60">
        Status
      </label>
      <select id="status-select" name="status" defaultValue={status} className={controlClass}>
        {SUPPORT_STATUSES.map((s) => (
          <option key={s} value={s}>
            {SUPPORT_STATUS_INFO[s].staffLabel}
          </option>
        ))}
      </select>
      <button type="submit" className={buttonClass} disabled={pending}>
        {pending ? "Saving…" : "Set"}
      </button>
      <span
        role="status"
        aria-live="polite"
        className="text-xs text-black/50 dark:text-white/50"
      >
        {state.error ?? ""}
      </span>
      <span className="basis-full text-xs text-black/50 dark:text-white/50">
        Replying already sets this — a reply marks it answered, and anything the customer sends
        puts it back to needing one. Set it by hand only to close a thread or undo a mis-set one.
      </span>
    </form>
  );
}
