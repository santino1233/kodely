"use client";

import { useActionState, useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Field";
import {
  BODY_MAX,
  SUBJECT_MAX,
  SUPPORT_CATEGORIES,
  SUPPORT_CATEGORY_LABELS,
  type SupportCategory,
  type SupportTopic,
  guidanceFor,
} from "@/lib/support";
import { createTicket } from "./actions";
import { TICKET_FORM_INITIAL } from "./ui";

export type SupportSite = {
  id: string;
  name: string;
  /** The real public address, computed server-side. Not a guess. */
  address: string;
  published: boolean;
};

/**
 * Open a ticket.
 *
 * A client component so the customer gets a pending state and an inline error
 * instead of a full reload with their message lost — but `<form action>` still
 * posts without JavaScript, and every rule the action enforces is enforced on
 * the server, not here. The lengths below are the SAME constants the action
 * checks against, so the browser and the server cannot disagree about the cap.
 */
export function TicketComposer({
  sites,
  topic,
  mailReady,
}: {
  sites: SupportSite[];
  /** Set when the customer arrived from the rail's "Bug or idea" menu. */
  topic: SupportTopic | null;
  mailReady: boolean;
}) {
  const [state, formAction, pending] = useActionState(createTicket, TICKET_FORM_INITIAL);

  const initialCategory: SupportCategory = topic?.category ?? "help";
  const [category, setCategory] = useState<SupportCategory>(initialCategory);
  const [body, setBody] = useState(guidanceFor(initialCategory).scaffold);
  const [siteId, setSiteId] = useState("");

  const guidance = guidanceFor(category);

  /**
   * Swap the scaffold when the category changes — but ONLY when the box holds
   * nothing the customer wrote. Anything else would delete their words to make
   * room for our headings, which is the one thing a helper like this must
   * never do.
   */
  function changeCategory(next: string) {
    const value = (SUPPORT_CATEGORIES as readonly string[]).includes(next)
      ? (next as SupportCategory)
      : "help";
    setBody((current) =>
      current.trim() === "" || current === guidanceFor(category).scaffold
        ? guidanceFor(value).scaffold
        : current,
    );
    setCategory(value);
  }

  const remaining = BODY_MAX - body.length;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="What is this about?"
          name="category"
          value={category}
          onChange={(e) => changeCategory(e.target.value)}
          disabled={pending}
        >
          {SUPPORT_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {SUPPORT_CATEGORY_LABELS[c]}
            </option>
          ))}
        </Select>

        <Select
          label="Which site?"
          name="projectId"
          value={siteId}
          onChange={(e) => setSiteId(e.target.value)}
          disabled={pending || sites.length === 0}
          hint={
            sites.length === 0 ? "You have no sites yet, so there is nothing to attach." : guidance.siteHint
          }
        >
          <option value="">Not about one specific site</option>
          {sites.map((site) => (
            <option key={site.id} value={site.id}>
              {site.name}
              {site.published ? "" : " (draft)"}
            </option>
          ))}
        </Select>
      </div>

      <Input
        label="Subject"
        name="subject"
        required
        maxLength={SUBJECT_MAX}
        disabled={pending}
        // Focused only when they came here to write something specific, so
        // the page does not yank the cursor out from under someone who opened
        // /support to read the answers below.
        autoFocus={topic !== null}
        placeholder={
          category === "bug"
            ? "The preview goes blank after I publish"
            : category === "feature"
              ? "Let me duplicate a site"
              : category === "billing"
                ? "Credits came off a build that failed"
                : "How do I change my site's address?"
        }
        hint="One line. It is what you will see in your list, and what we see in ours."
      />

      <Textarea
        label="What is going on?"
        name="body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={category === "bug" ? 10 : 7}
        required
        maxLength={BODY_MAX}
        disabled={pending}
        hint={remaining < 400 ? `${remaining} characters left.` : guidance.bodyHint}
      />

      {state.error != null && (
        <p
          role="alert"
          className="rounded-md border border-danger/30 bg-danger-tint px-3 py-2.5 text-sm leading-relaxed text-danger"
        >
          {state.error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button
          type="submit"
          variant="primary"
          loading={pending}
          icon={<Send className="size-4" aria-hidden />}
        >
          {pending ? "Sending" : "Open ticket"}
        </Button>
        <p className="text-xs leading-relaxed text-ink-3">
          {mailReady
            ? "It lands in the queue immediately, and we email you when someone replies."
            : "It lands in the queue immediately. Outgoing email is off on this deployment, so nothing will land in your inbox — the reply appears here."}
        </p>
      </div>
    </form>
  );
}
