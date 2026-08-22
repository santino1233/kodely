import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Globe, Mail } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { isMailConfigured } from "@/lib/mail";
import {
  SUPPORT_STATUS_INFO,
  categoryLabel,
  getCustomerTicket,
  isSupportStatus,
  markCustomerRead,
  type TicketMessage,
} from "@/lib/support";
import { Card, CardHeader, SectionHeader } from "@/components/ui/Card";
import { formatDateTime } from "../../settings/_format";
import { ReplyForm } from "../ReplyForm";
import { TicketStatus } from "../ui";

export const dynamic = "force-dynamic";

// The subject is the customer's own words and would make a better tab title,
// but generateMetadata runs its own render pass and would either duplicate the
// query or force the read-marking write into it. A fixed noun costs nothing.
export const metadata: Metadata = { title: "Ticket" };

/**
 * One turn of the conversation.
 *
 * A STAFF message is attributed to "Kodely support" and never to the person
 * who wrote it: SupportMessage.staffEmail exists so the record survives that
 * operator's account being deleted, not so a customer is handed a colleague's
 * address. The data export withholds it for the same reason.
 */
function Message({ message }: { message: TicketMessage }) {
  const staff = message.author === "STAFF";
  return (
    <div
      className={[
        "k-msg-in rounded-lg border p-4",
        staff ? "border-brand/25 bg-brand-tint" : "border-hair bg-surface-2",
      ].join(" ")}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-[0.8125rem] font-semibold text-ink">
          {staff ? "Kodely support" : "You"}
        </span>
        <span className="k-num text-xs text-ink-3">{formatDateTime(message.createdAt)}</span>
      </div>
      {/* Plain text, whitespace preserved, never HTML — on both sides. */}
      <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap text-ink-2">{message.body}</p>
    </div>
  );
}

export default async function SupportTicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;

  // Marked read BEFORE the thread is fetched, and the PREVIOUS mark is kept,
  // so the "new since you last looked" line can still be drawn on the very
  // render that clears it. Opening a thread should not make the thing you came
  // to read vanish.
  //
  // A write during a render is normally worth avoiding, and it is bounded here
  // by two things: this route is `force-dynamic`, so Next's default prefetch
  // only reaches the nearest loading boundary rather than rendering it, and
  // the links that point here set `prefetch={false}` anyway. The precedent is
  // recordAdminAction, which awaits an insert before every admin page's reads
  // for the same "do it before, not after" reason.
  //
  // Null means no such ticket OR not theirs — deliberately the same answer, so
  // another person's ticket id is indistinguishable from one that never
  // existed.
  const read = await markCustomerRead(user.id, id);
  if (!read) notFound();

  const thread = await getCustomerTicket(user.id, id);
  if (!thread) notFound();

  const { ticket, messages } = thread;
  const mailReady = isMailConfigured();

  // The first message they had not seen last time they were here. Only staff
  // messages count: their own reply is not news to them.
  const firstUnseen = messages.find(
    (m) => m.author === "STAFF" && (read.previous === null || m.createdAt > read.previous),
  );

  const hint = isSupportStatus(ticket.status)
    ? SUPPORT_STATUS_INFO[ticket.status].customerHint
    : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/support"
          className="k-focus inline-flex items-center gap-1.5 rounded-sm text-[0.8125rem] text-ink-2 transition-colors duration-[var(--t-1)] hover:text-ink"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          All tickets
        </Link>
        <div className="mt-3">
          <SectionHeader
            as="h1"
            title={ticket.subject}
            description={
              <span className="k-num">
                {categoryLabel(ticket.category)} · opened {formatDateTime(ticket.createdAt)}
                {hint === null ? "" : ` · ${hint}`}
              </span>
            }
            action={<TicketStatus status={ticket.status} />}
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card padded={false}>
            <ol className="flex flex-col gap-3 p-5">
              {messages.map((message) => (
                <li key={message.id} className="flex flex-col gap-3">
                  {firstUnseen !== undefined && message.id === firstUnseen.id && (
                    <div
                      className="flex items-center gap-3 pt-1"
                      role="separator"
                      aria-label="New since you last looked"
                    >
                      <span className="h-px flex-1 bg-brand/30" />
                      <span className="k-label text-brand">New since you last looked</span>
                      <span className="h-px flex-1 bg-brand/30" />
                    </div>
                  )}
                  <Message message={message} />
                </li>
              ))}
            </ol>
          </Card>

          <Card>
            <ReplyForm ticketId={ticket.id} resolved={ticket.status === "RESOLVED"} />
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title="This ticket" />
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="k-label">Status</dt>
                <dd className="mt-1.5 text-ink-2">
                  {isSupportStatus(ticket.status)
                    ? SUPPORT_STATUS_INFO[ticket.status].customerLabel
                    : ticket.status}
                </dd>
              </div>
              <div>
                <dt className="k-label">About</dt>
                <dd className="mt-1.5 text-ink-2">{categoryLabel(ticket.category)}</dd>
              </div>
              <div>
                <dt className="k-label">Site</dt>
                <dd className="mt-1.5 text-ink-2">
                  {ticket.project ? (
                    <Link
                      href={`/projects/${ticket.project.id}`}
                      className="k-focus inline-flex items-center gap-1.5 rounded-sm text-brand underline underline-offset-2 hover:no-underline"
                    >
                      <Globe className="size-3.5" aria-hidden />
                      {ticket.project.name}
                    </Link>
                  ) : (
                    <span className="text-ink-3">Not about one specific site</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="k-label">Last activity</dt>
                <dd className="k-num mt-1.5 text-ink-2">{formatDateTime(ticket.lastMessageAt)}</dd>
              </div>
            </dl>
            {ticket.project === null && (
              <p className="mt-4 text-xs leading-relaxed text-ink-3">
                A site cannot be attached after the fact — the picker is on the ticket you open.
                If this turns out to be about one, say which in a reply and we will find it.
              </p>
            )}
          </Card>

          <Card>
            <CardHeader title="What happens next" />
            <ul className="mt-4 space-y-3 text-sm leading-relaxed text-ink-2">
              <li className="flex gap-3">
                <Mail className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />
                <span>
                  {mailReady
                    ? `The reply appears here, and we email ${user.email} to say it has. The email will not contain the reply itself — that stays behind your sign-in.`
                    : "The reply appears here. Outgoing email is switched off on this deployment, so nothing will nudge you — check back, or leave the tab open and reload."}
                </span>
              </li>
            </ul>
            <p className="mt-4 text-xs leading-relaxed text-ink-3">
              Nobody has promised you a response time, here or anywhere else in Kodely, because
              nothing measures one. This thread is the whole record: it is in your data export,
              and deleting your account deletes it.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
