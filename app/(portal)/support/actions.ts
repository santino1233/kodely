"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { checkSupportMessageRateLimit, checkSupportTicketRateLimit } from "@/lib/rate-limit";
import {
  BODY_MAX,
  BODY_MIN,
  DEFAULT_SUPPORT_CATEGORY,
  SUBJECT_MAX,
  appendMessage,
  isSupportCategory,
} from "@/lib/support";
import type { TicketFormState } from "./ui";

// The customer's three writes. Everything else on /support reads.
//
// Server Functions are reachable by direct POST, not only through the forms
// that render them, so every one of these resolves the session ITSELF and
// scopes every query by that user's id — app/(portal)/layout.tsx redirecting
// signed-out visitors is not an authorization boundary for a POST that never
// passes through it. Same rule, and the same reason, as
// app/admin/feedback/actions.ts.

function field(data: FormData, name: string): string {
  const raw = data.get(name);
  return typeof raw === "string" ? raw.trim() : "";
}

/**
 * Normalise line endings and drop control characters, keeping newlines.
 *
 * Bodies are rendered with `whitespace-pre-wrap` and never as HTML, on either
 * side, so this is legibility rather than safety — but a NUL or a stray escape
 * sequence is worth removing once at the boundary rather than at each of the
 * places this text is later read, one of which is an operator's queue.
 *
 * Written as a scan rather than a character-class regex because the class is
 * three disjoint ranges around the two characters being kept, and that is the
 * kind of regex people edit wrongly.
 */
function cleanBody(value: string): string {
  let out = "";
  for (const ch of value.replace(/\r\n/g, "\n")) {
    const code = ch.codePointAt(0) ?? 0;
    const printable = code >= 32 && code !== 127;
    if (printable || code === 10 || code === 9) out += ch;
  }
  return out;
}

const RATE_LIMITED_TICKET =
  "That is a lot of tickets in a short time. Add what is left to an existing thread, " +
  "or try again a little later — nothing you have already sent is lost.";

export async function createTicket(
  _prev: TicketFormState,
  formData: FormData,
): Promise<TicketFormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "You are signed out. Sign in again and your message will send." };

  const subject = field(formData, "subject");
  const body = cleanBody(field(formData, "body"));
  const rawCategory = field(formData, "category");
  const rawProjectId = field(formData, "projectId");

  if (subject.length < 3) return { error: "Give it a subject — a few words is plenty." };
  if (subject.length > SUBJECT_MAX) {
    return { error: `That subject is ${subject.length} characters. Keep it under ${SUBJECT_MAX}.` };
  }
  if (body.length < BODY_MIN) return { error: "Tell us what is going on, even roughly." };
  if (body.length > BODY_MAX) {
    return {
      error: `That message is ${body.length} characters and the limit is ${BODY_MAX}. Send the essentials and we will ask for the rest.`,
    };
  }

  // An unrecognised category is not an error the customer should see — the
  // select is a closed list, so anything else came from a hand-made POST.
  // Falling back is safer than rejecting: the ticket still reaches a human.
  const category = isSupportCategory(rawCategory) ? rawCategory : DEFAULT_SUPPORT_CATEGORY;

  // Ownership is checked in the SAME query that fetches the project. A site
  // that is not theirs must be indistinguishable from one that does not
  // exist — never "look it up, then compare userId".
  let projectId: string | null = null;
  if (rawProjectId !== "") {
    const project = await db.project.findFirst({
      where: { id: rawProjectId, userId: user.id },
      select: { id: true },
    });
    if (!project) return { error: "That site is not on your account any more. Pick another." };
    projectId = project.id;
  }

  const limit = await checkSupportTicketRateLimit(user.id);
  if (!limit.allowed) return { error: RATE_LIMITED_TICKET };

  const ticketId = await db.$transaction(async (tx) => {
    const ticket = await tx.supportTicket.create({
      data: { userId: user.id, subject, category, projectId },
      select: { id: true },
    });
    // The first message goes through the same writer as every later one, so a
    // new ticket cannot end up with different bookkeeping from a reply.
    await appendMessage(tx, { ticketId: ticket.id, author: "CUSTOMER", body });
    return ticket.id;
  });

  // Straight into the thread they just opened. redirect() signals by throwing,
  // so it stays outside any try/catch — and it is why TicketFormState carries
  // only an error: this action has no success state to render.
  redirect(`/support/${ticketId}`);
}

export async function sendReply(
  _prev: TicketFormState,
  formData: FormData,
): Promise<TicketFormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "You are signed out. Sign in again and your reply will send." };

  const ticketId = field(formData, "ticketId");
  const body = cleanBody(field(formData, "body"));

  if (body.length < BODY_MIN) return { error: "There is nothing in that reply." };
  if (body.length > BODY_MAX) {
    return { error: `That reply is ${body.length} characters and the limit is ${BODY_MAX}.` };
  }

  const ticket = await db.supportTicket.findFirst({
    where: { id: ticketId, userId: user.id },
    select: { id: true },
  });
  if (!ticket) return { error: "That ticket is not on your account." };

  const limit = await checkSupportMessageRateLimit(user.id);
  if (!limit.allowed) {
    return { error: "That is a lot of replies in an hour. Give it a moment and try again." };
  }

  // Replying to a resolved ticket reopens it: appendMessage derives the status
  // from the author, so reopening is not a separate thing anyone has to know
  // about or remember to do.
  await db.$transaction((tx) =>
    appendMessage(tx, { ticketId: ticket.id, author: "CUSTOMER", body }),
  );

  refresh();
  return { error: null };
}

export async function resolveTicket(
  _prev: TicketFormState,
  formData: FormData,
): Promise<TicketFormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "You are signed out." };

  const ticketId = field(formData, "ticketId");

  // updateMany rather than update, so the ownership filter sits in the WHERE
  // of the write itself and there is no window between checking and writing.
  const { count } = await db.supportTicket.updateMany({
    where: { id: ticketId, userId: user.id },
    data: { status: "RESOLVED" },
  });
  if (count === 0) return { error: "That ticket is not on your account." };

  refresh();
  return { error: null };
}
