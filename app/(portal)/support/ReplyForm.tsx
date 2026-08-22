"use client";

import { useActionState } from "react";
import { CheckCheck, CornerDownLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Field";
import { BODY_MAX } from "@/lib/support";
import { resolveTicket, sendReply } from "./actions";
import { TICKET_FORM_INITIAL } from "./ui";

/**
 * Reply on a thread, and close it.
 *
 * Two separate `<form>`s rather than one with two submit buttons: they run
 * different actions with different failure messages, and a nested form is not
 * a thing. The textarea is UNCONTROLLED on purpose — React clears it itself
 * when the action resolves, which is exactly the behaviour wanted here and is
 * one fewer piece of state that can get out of step with what was sent.
 */
export function ReplyForm({ ticketId, resolved }: { ticketId: string; resolved: boolean }) {
  const [replyState, replyAction, replying] = useActionState(sendReply, TICKET_FORM_INITIAL);
  const [closeState, closeAction, closing] = useActionState(resolveTicket, TICKET_FORM_INITIAL);

  return (
    <div className="flex flex-col gap-4">
      <form action={replyAction} className="flex flex-col gap-3">
        <input type="hidden" name="ticketId" value={ticketId} />
        <Textarea
          label={resolved ? "Reply and reopen" : "Reply"}
          name="body"
          rows={5}
          required
          maxLength={BODY_MAX}
          disabled={replying}
          hint={
            resolved
              ? "This ticket is marked resolved. Replying reopens it and puts it back in front of us."
              : "Anything you have found since, or an answer to what we asked."
          }
        />

        {replyState.error != null && (
          <p
            role="alert"
            className="rounded-md border border-danger/30 bg-danger-tint px-3 py-2.5 text-sm leading-relaxed text-danger"
          >
            {replyState.error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            variant="primary"
            loading={replying}
            icon={<CornerDownLeft className="size-4" aria-hidden />}
          >
            {replying ? "Sending" : "Send reply"}
          </Button>
        </div>
      </form>

      {!resolved && (
        <form action={closeAction} className="border-t border-hair pt-4">
          <input type="hidden" name="ticketId" value={ticketId} />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Button
              type="submit"
              variant="secondary"
              size="sm"
              loading={closing}
              icon={<CheckCheck className="size-4" aria-hidden />}
            >
              {closing ? "Closing" : "Mark as resolved"}
            </Button>
            <p className="text-xs text-ink-3">
              Sorted it yourself? Close it. Nothing is deleted, and replying reopens it.
            </p>
          </div>
          {closeState.error != null && (
            <p role="alert" className="mt-2 text-xs text-danger">
              {closeState.error}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
