import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminUser } from "@/lib/auth";
import { ADMIN_ACTIONS, ADMIN_TARGET_TYPES, recordAdminAction } from "@/lib/admin-audit";
import {
  categoryLabel,
  getStaffTicket,
  markStaffRead,
  type TicketMessage,
} from "@/lib/support";
import { Empty, Panel, formatDateTime } from "../../users/ui";
import { Caution } from "../../feedback/ui";
import { ReplyBox, StatusForm } from "../TicketActions";
import { StatusPill } from "../ui";

export const dynamic = "force-dynamic";

// One support thread, and the two things an operator does with it.

function Message({ message, unseen }: { message: TicketMessage; unseen: boolean }) {
  const staff = message.author === "STAFF";
  return (
    <li
      className={[
        "rounded-xl border p-4",
        staff
          ? "border-black/10 bg-black/[0.02] dark:border-white/10 dark:bg-white/[0.02]"
          : "border-black/10 dark:border-white/10",
        unseen ? "ring-1 ring-amber-500/40" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs text-black/50 dark:text-white/50">
        <span className="font-medium text-black/70 dark:text-white/70">
          {/* The staff address is shown HERE and never to the customer: this is
              the record of who answered, and it is the panel's job to keep it.
              Their thread says "Kodely support". */}
          {staff ? (message.staffEmail ?? "Kodely support") : "Customer"}
        </span>
        <span className="tabular-nums">{formatDateTime(message.createdAt)}</span>
      </div>
      {/* Customer-written text on one side and operator-written on the other,
          rendered as text and never as HTML, with whitespace preserved. Shown
          in full: both are length-capped at the point they were written, and
          truncating the thing a person wrote on purpose defeats the page. */}
      <p className="mt-2 text-sm whitespace-pre-wrap break-words">{message.body}</p>
    </li>
  );
}

export default async function AdminSupportThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Defense in depth — see app/admin/support/page.tsx. The layout gate is the
  // primary one, but a layout must not be the sole authorization boundary.
  const admin = await getAdminUser();
  if (!admin) notFound();

  const { id } = await params;

  // Recorded BEFORE the thread is even looked up, and awaited. This is the
  // most concentrated view of one customer's own words in the panel, and
  // recording first means a probe at an id that turns out not to exist still
  // leaves a row — an operator typing ids into the URL bar is exactly the
  // access this log is for.
  //
  // The id is the TARGET rather than meta, which is what makes "everything
  // anyone did to this thread" a real query: targetType/targetId is the column
  // AdminAuditLog indexes.
  await recordAdminAction(admin, ADMIN_ACTIONS.ticketViewed, {
    targetType: ADMIN_TARGET_TYPES.supportTicket,
    targetId: id,
  });

  // Marked read before the fetch, keeping the previous mark, so the messages
  // nobody had seen are still highlighted on the render that clears them.
  const read = await markStaffRead(id);
  if (!read) notFound();

  const thread = await getStaffTicket(id);
  if (!thread) notFound();

  const { ticket, messages } = thread;

  const unseenIds = new Set(
    messages
      .filter(
        (m) =>
          m.author === "CUSTOMER" && (read.previous === null || m.createdAt > read.previous),
      )
      .map((m) => m.id),
  );

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-8">
        <Link
          href="/admin/support"
          className="rounded text-xs text-black/50 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/40 dark:text-white/50 dark:focus-visible:ring-white/40"
        >
          ← Support tickets
        </Link>
        <div className="mt-1 text-lg font-semibold tracking-tight">{ticket.subject}</div>
        <p className="text-sm text-black/60 dark:text-white/60">
          <StatusPill status={ticket.status} /> · {categoryLabel(ticket.category)} · opened{" "}
          <span className="tabular-nums">{formatDateTime(ticket.createdAt)}</span>
        </p>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          <Link
            href={`/admin/users/${ticket.user.id}`}
            className="rounded underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/40 dark:focus-visible:ring-white/40"
          >
            {ticket.user.email}
          </Link>
          {" · "}
          <Link
            href={`/admin/feedback/notes/${ticket.user.id}`}
            className="rounded underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/40 dark:focus-visible:ring-white/40"
          >
            operator notes →
          </Link>
          {ticket.project ? (
            <>
              {" · "}
              <Link
                href={`/admin/sites/${ticket.project.id}`}
                className="rounded underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/40 dark:focus-visible:ring-white/40"
              >
                {ticket.project.name} →
              </Link>
            </>
          ) : (
            " · no site attached"
          )}
        </p>
        <p className="mt-1 font-mono text-xs text-black/40 dark:text-white/40">{ticket.id}</p>
      </div>

      <Caution title="A reply here is published to the customer">
        <p>
          Anything sent below appears in this person&apos;s own thread on{" "}
          <code className="font-mono text-xs">/support</code> the moment it commits, and they are
          emailed to say so. That is the difference between this and an operator note: a note is
          written <em>about</em> a customer and is never rendered to them, a reply is written{" "}
          <em>to</em> one and always is. Nothing copies between the two tables in either direction.
        </p>
        <p className="mt-2">
          Both are disclosable if this person asks for their data, so neither is a private channel
          — but only one of them is on their screen.
        </p>
      </Caution>

      <div className="mb-8">
        <Panel
          title="Thread"
          subtitle={`${messages.length} message(s), oldest first. Amber ring = written since anyone on our side last opened this.`}
        >
          {messages.length === 0 ? (
            <Empty>
              This ticket has no messages, which should be impossible — a ticket is created with
              its first one in the same transaction. Worth looking at.
            </Empty>
          ) : (
            <ol className="space-y-3">
              {messages.map((m) => (
                <Message key={m.id} message={m} unseen={unseenIds.has(m.id)} />
              ))}
            </ol>
          )}
        </Panel>
      </div>

      <div className="mb-8">
        <Panel
          title="Reply"
          subtitle="Sending marks the ticket answered. If they write back it goes to needing a reply again, by itself."
        >
          <ReplyBox ticketId={ticket.id} customerEmail={ticket.user.email} />
        </Panel>
      </div>

      <Panel
        title="Status"
        subtitle="Three values, and only one of them is usually set by hand."
      >
        <StatusForm ticketId={ticket.id} status={ticket.status} />
      </Panel>
    </div>
  );
}
