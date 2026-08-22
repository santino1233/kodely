"use client";

import { useActionState } from "react";
import { addSupportNote } from "../../actions";
import { NOTE_FORM_INITIAL, NOTE_MAX, buttonClass } from "../../ui";

// The one write surface in the support inbox.
//
// A client component only so the operator gets a pending state and an inline
// error instead of a full page reload with the note lost. The <form action>
// still posts without JavaScript — React only takes over once hydrated — and
// React clears the textarea itself when the action resolves successfully.

export default function NoteForm({ userId, email }: { userId: string; email: string }) {
  const [state, formAction, pending] = useActionState(addSupportNote, NOTE_FORM_INITIAL);

  return (
    <form action={formAction}>
      <input type="hidden" name="userId" value={userId} />

      <label htmlFor="note-body" className="block text-sm font-medium">
        New note about {email}
      </label>

      {/* Not a placeholder and not a tooltip: this has to be readable while
          the operator is typing, which is the moment it matters. */}
      <p id="note-guidance" className="mt-1 text-xs text-black/60 dark:text-white/60">
        Operator-only — this is never shown to the customer. It is still{" "}
        <strong>disclosable in a data-subject access request</strong>, so write only what you would
        stand behind if this customer read it back to you. Facts and next steps, not opinions about
        the person.
      </p>

      <textarea
        id="note-body"
        name="body"
        rows={4}
        required
        maxLength={NOTE_MAX}
        aria-describedby="note-guidance note-status"
        placeholder="Emailed about the hero section rebuilding on every edit. Reproduced on their project; pointed at the repair loop."
        className="mt-2 w-full resize-y rounded-xl border border-black/10 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-black/40 focus-visible:ring-2 focus-visible:ring-black/40 dark:border-white/10 dark:placeholder:text-white/40 dark:focus-visible:ring-white/40"
      />

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button type="submit" className={buttonClass} disabled={pending}>
          {pending ? "Saving…" : "Add note"}
        </button>
        <span className="text-xs text-black/50 dark:text-white/50">
          Up to {NOTE_MAX} characters. Notes cannot be edited or deleted from here.
        </span>
      </div>

      {/* One live region for both outcomes, so a screen reader hears the result
          of the submit it just made without the focus moving anywhere. */}
      <p
        id="note-status"
        role="status"
        aria-live="polite"
        className={`mt-2 text-sm ${
          state.error
            ? "text-red-600 dark:text-red-400"
            : "text-emerald-600 dark:text-emerald-400"
        }`}
      >
        {state.error ? state.error : state.ok ? "Note saved." : ""}
      </p>
    </form>
  );
}
