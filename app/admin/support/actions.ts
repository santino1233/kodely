"use server";

import { refresh } from "next/cache";
import { db } from "@/lib/db";
import { getAdminUser } from "@/lib/auth";
import { ADMIN_ACTIONS, ADMIN_TARGET_TYPES, adminActionRow } from "@/lib/admin-audit";
import { notifySupportReply } from "@/lib/notifications/send";
import { BODY_MAX, BODY_MIN, appendMessage, isSupportStatus } from "@/lib/support";
import type { AdminTicketFormState } from "./ui";

// The two mutations the ticket queue performs. Everything else on these pages
// reads.
//
// Server Functions are reachable by direct POST, not only through this UI, so
// the admin check happens HERE and not merely on the page that renders the
// form — app/admin/layout.tsx is the primary gate but a layout is not an
// authorization boundary. Same rule as app/admin/feedback/actions.ts.

function field(data: FormData, name: string): string {
  const raw = data.get(name);
  return typeof raw === "string" ? raw.trim() : "";
}

/** Normalise line endings, drop control characters, keep newlines and tabs. */
function cleanBody(value: string): string {
  let out = "";
  for (const ch of value.replace(/\r\n/g, "\n")) {
    const code = ch.codePointAt(0) ?? 0;
    if ((code >= 32 && code !== 127) || code === 10 || code === 9) out += ch;
  }
  return out;
}

/**
 * Reply to a customer.
 *
 * THIS IS THE ONE WRITE IN THE ADMIN PANEL WHOSE OUTPUT IS PUBLISHED. What is
 * typed here appears in that customer's own thread on /support the moment the
 * transaction commits, and an email goes out telling them to read it. It is
 * the opposite of a SupportNote, which is written about a customer and never
 * shown to one; nothing copies between the two, and this is not the place to
 * put anything you would only write because they cannot see it.
 */
export async function replyToTicket(
  _prev: AdminTicketFormState,
  formData: FormData,
): Promise<AdminTicketFormState> {
  const admin = await getAdminUser();
  if (!admin) return { error: "You are not signed in as an admin.", ok: false };

  const ticketId = field(formData, "ticketId");
  const body = cleanBody(field(formData, "body"));

  if (body.length < BODY_MIN) return { error: "A reply needs something in it.", ok: false };
  if (body.length > BODY_MAX) {
    return {
      error: `That is ${body.length} characters — the customer's composer stops at ${BODY_MAX}, and so does this. Split it, or point at the app.`,
      ok: false,
    };
  }

  // Verify the target rather than letting the foreign key throw: a 500 on a
  // stale tab is a worse answer than a sentence.
  const ticket = await db.supportTicket.findUnique({
    where: { id: ticketId },
    select: { id: true, status: true },
  });
  if (!ticket) return { error: "That ticket no longer exists.", ok: false };

  // The reply and its audit row go in together or not at all. adminActionRow
  // rather than recordAdminAction exists for exactly this: a message the
  // customer can read must not be able to exist without the row saying who
  // sent it, and there must be no log row for a reply that rolled back.
  //
  // meta holds IDS AND A LENGTH, never the reply text. The body is already
  // disclosable to the customer and returned in their data export; copying it
  // into the audit log would double the number of places it has to be found
  // and redacted, for no gain — the id joins straight back to the message.
  const messageId = await db.$transaction(async (tx) => {
    const message = await appendMessage(tx, {
      ticketId: ticket.id,
      author: "STAFF",
      // From the session, never from the form. Attribution nobody can spoof is
      // the whole point of recording it.
      staffEmail: admin.email,
      body,
    });
    await tx.adminAuditLog.create({
      data: adminActionRow(admin, ADMIN_ACTIONS.ticketReplied, {
        targetType: ADMIN_TARGET_TYPES.supportTicket,
        targetId: ticket.id,
        meta: { messageId: message.id, chars: body.length, statusBefore: ticket.status },
      }),
    });
    return message.id;
  });

  // OUTSIDE the transaction, and fire-and-forget: a dead SMTP server must
  // never roll back or delay a reply the customer can already read on their
  // thread. The email is the notification; the thread is the mechanism.
  notifySupportReply(messageId);

  refresh();
  return { error: null, ok: true };
}

/**
 * Change a ticket's status by hand.
 *
 * In practice this means RESOLVED — OPEN and ANSWERED are set by the act of
 * somebody writing, so setting them here is only ever undoing a mistake. The
 * full vocabulary is offered anyway, because a status you can reach but not
 * leave is a trap.
 */
export async function changeTicketStatus(
  _prev: AdminTicketFormState,
  formData: FormData,
): Promise<AdminTicketFormState> {
  const admin = await getAdminUser();
  if (!admin) return { error: "You are not signed in as an admin.", ok: false };

  const ticketId = field(formData, "ticketId");
  const status = field(formData, "status");
  // Closed set, checked with hasOwnProperty inside isSupportStatus. A form
  // field is untrusted input however few options the <select> renders.
  if (!isSupportStatus(status)) return { error: "That is not a status.", ok: false };

  const ticket = await db.supportTicket.findUnique({
    where: { id: ticketId },
    select: { id: true, status: true },
  });
  if (!ticket) return { error: "That ticket no longer exists.", ok: false };
  if (ticket.status === status) return { error: null, ok: true };

  // SupportTicket keeps only the CURRENT status, so the previous value exists
  // nowhere else once this commits — which is why it goes in meta, and why the
  // row is written in the same transaction as the change it records.
  await db.$transaction([
    db.supportTicket.update({ where: { id: ticket.id }, data: { status } }),
    db.adminAuditLog.create({
      data: adminActionRow(admin, ADMIN_ACTIONS.ticketStatusChanged, {
        targetType: ADMIN_TARGET_TYPES.supportTicket,
        targetId: ticket.id,
        meta: { from: ticket.status, to: status },
      }),
    }),
  ]);

  refresh();
  return { error: null, ok: true };
}
