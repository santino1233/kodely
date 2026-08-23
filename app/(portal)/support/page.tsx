import type { Metadata } from "next";
import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Activity,
  ChevronRight,
  CreditCard,
  FileText,
  Inbox,
  LifeBuoy,
  Link2,
  Mail,
  MessageSquare,
  Sparkles,
  ThumbsUp,
  Zap,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { averageBuildCredits, getBalance } from "@/lib/credits";
import { db } from "@/lib/db";
import { CONTACT_TO, isMailConfigured } from "@/lib/mail";
import {
  categoryShort,
  hasUnreadReply,
  listCustomerTickets,
  supportTopic,
  type TicketSummary,
} from "@/lib/support";
import { Card, CardHeader, SectionHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHero } from "@/components/ui/PageHero";
import { siteAddress } from "../dashboard/domains/address";
import { formatDateTime } from "../settings/_format";
import { TicketComposer, type SupportSite } from "./TicketComposer";
import { TicketStatus, UnreadPill } from "./ui";

export const dynamic = "force-dynamic";

// Bare noun; the "— Kodely" suffix is the portal layout's title template.
export const metadata: Metadata = { title: "Support" };

/* Native <details>, not a hand-rolled disclosure. There is no accordion in
   components/ui, and the browser's own one is keyboard-accessible, announced
   correctly, findable by in-page search when open, and works with JavaScript
   switched off. `k-focus` goes on the summary because that is the element
   that actually takes focus. */
function Answer({ q, children }: { q: string; children: ReactNode }) {
  return (
    <details className="group border-b border-hair last:border-b-0">
      <summary className="k-focus flex cursor-pointer list-none items-center gap-3 rounded-sm py-3.5 text-sm font-medium text-ink marker:content-none">
        <ChevronRight
          aria-hidden
          className="size-4 shrink-0 text-ink-3 transition-transform duration-[var(--t-2)] ease-[var(--ease)] group-open:rotate-90"
        />
        <span>{q}</span>
      </summary>
      <div className="space-y-2 pb-4 pl-7 text-sm leading-relaxed text-ink-2">{children}</div>
    </details>
  );
}

function Elsewhere({
  href,
  icon,
  title,
  body,
  external = false,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  body: string;
  external?: boolean;
}) {
  const inner = (
    <>
      <span className="mt-0.5 shrink-0 text-ink-3">{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{title}</span>
        <span className="mt-0.5 block text-[0.8125rem] leading-relaxed text-ink-2">{body}</span>
      </span>
    </>
  );
  const className =
    "k-focus flex gap-3 rounded-lg border border-hair bg-surface-2/50 p-4 transition-colors duration-[var(--t-1)] hover:border-line-mid hover:bg-surface-2";

  return external ? (
    <a href={href} target="_blank" rel="noreferrer" className={className}>
      {inner}
    </a>
  ) : (
    <Link href={href} className={className}>
      {inner}
    </Link>
  );
}

/** One row in the customer's own list. */
function TicketRow({ ticket }: { ticket: TicketSummary }) {
  const unread = hasUnreadReply(ticket);
  return (
    <li>
      <Link
        href={`/support/${ticket.id}`}
        /* Opening a thread marks it read, and that write happens while the
           thread page renders. A dynamic route is not fully prefetched by
           default — only down to the nearest loading boundary — but saying so
           explicitly costs nothing and makes it impossible for a later change
           of default to quietly mark somebody's unread replies as read from a
           hover they never followed. */
        prefetch={false}
        className="k-focus flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-hair px-5 py-3.5 transition-colors duration-[var(--t-1)] last:border-b-0 hover:bg-surface-2"
      >
        <span className="min-w-0 flex-1 basis-full sm:basis-auto">
          <span className="block truncate text-sm font-medium text-ink">{ticket.subject}</span>
          <span className="k-num mt-0.5 block text-xs text-ink-3">
            {categoryShort(ticket.category)}
            {ticket.project ? ` · ${ticket.project.name}` : ""} · {ticket.messageCount}{" "}
            {ticket.messageCount === 1 ? "message" : "messages"} ·{" "}
            {formatDateTime(ticket.lastMessageAt)}
          </span>
        </span>
        {unread && <UnreadPill />}
        <TicketStatus status={ticket.status} />
      </Link>
    </li>
  );
}

export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const sp = await searchParams;
  // The rail's "Bug or idea" menu links here as /support?topic=bug and
  // ?topic=feature. Resolved against a CLOSED table in lib/support.ts with
  // Object.prototype.hasOwnProperty.call, never `x in OBJ`: `?topic=
  // constructor` has to be an unrecognised topic rather than a Function handed
  // to the composer. Anything unrecognised returns null and this renders as
  // the ordinary page — a bad query string is not an error, and it must never
  // produce a category that does not exist.
  const topic = supportTopic(sp.topic);

  const [headerList, projects, tickets, balance, avgBuildCredits, chargedBuilds] =
    await Promise.all([
      headers(),
      db.project.findMany({
        where: { userId: user.id },
        orderBy: { updatedAt: "desc" },
        select: { id: true, name: true, slug: true, publishedAt: true },
      }),
      listCustomerTickets(user.id),
      getBalance(user.id),
      averageBuildCredits(user.id),
      // Whether `avgBuildCredits` is this person's own measured number or the
      // global fallback — the same condition averageBuildCredits() uses to
      // decide. The card below says which one it is, so it has to know.
      db.build.count({
        where: { project: { userId: user.id }, status: "SUCCEEDED", creditsCharged: { gt: 0 } },
      }),
    ]);

  const host = headerList.get("host") ?? "";
  const sites: SupportSite[] = projects.map((p) => ({
    id: p.id,
    name: p.name,
    address: siteAddress(host, p.slug),
    published: p.publishedAt !== null,
  }));

  const mailReady = isMailConfigured();
  const openTickets = tickets.filter((t) => t.status !== "RESOLVED").length;
  const unreadTickets = tickets.filter(hasUnreadReply).length;

  // Identical arithmetic and identical wording to the credits card in the rail
  // (components/app/SidebarFooter.tsx), because the two sit on this screen at
  // the same time and a customer reading two different answers to "how much
  // can I still build" would be right to distrust both.
  const buildsLeft = avgBuildCredits > 0 ? Math.floor(balance / avgBuildCredits) : 0;

  return (
    <div className="flex flex-col gap-8">
      <PageHero
        icon={<LifeBuoy className="size-5" aria-hidden />}
        title="Support"
        description={
          tickets.length === 0
            ? "Open a ticket and it goes into a queue a person reads. The reply comes back here, on the ticket."
            : `${tickets.length} ticket${tickets.length === 1 ? "" : "s"} · ${openTickets} still open${
                unreadTickets > 0 ? ` · ${unreadTickets} with a reply you have not read` : ""
              }`
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader
              title={topic?.heading ?? "Open a ticket"}
              description={
                topic?.intro ??
                "It lands in a queue with a status you can watch, and the reply arrives on the ticket itself."
              }
            />
            <div className="mt-5">
              <TicketComposer sites={sites} topic={topic} mailReady={mailReady} />
            </div>
          </Card>

          <Card padded={false}>
            <div className="p-5 pb-4">
              <CardHeader
                title="Your tickets"
                description="Newest activity first. Everything you have ever sent us is here — nothing is archived away."
              />
            </div>
            {tickets.length === 0 ? (
              <div className="px-5 pb-5">
                <EmptyState
                  kind="empty"
                  icon={<Inbox className="size-7" aria-hidden />}
                  title="No tickets yet"
                  body="When you open one it appears here with a real status, and stays until you close it."
                />
              </div>
            ) : (
              <ul>
                {tickets.map((ticket) => (
                  <TicketRow key={ticket.id} ticket={ticket} />
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          {/* ── The one gradient fill this PAGE contributes. ───────────────
              No bar and no percentage, matching the rail: credits are bought
              in packs and never expire, so there is no allowance for this to
              be a fraction OF, and a bar would have to invent a denominator.
              No plan, no monthly figure and no reset date either — none of the
              three exists. The number, what it buys, and where that estimate
              came from is the whole truth available. */}
          <div className="btn-cta-gradient relative overflow-hidden rounded-xl p-5 text-white shadow-e2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[0.6875rem] font-semibold tracking-[0.07em] uppercase opacity-80">
                  Your credits
                </p>
                <p className="mt-2 flex items-baseline gap-1.5">
                  <span className="k-num text-3xl leading-none font-semibold">
                    {balance.toLocaleString()}
                  </span>
                  <span className="text-sm opacity-90">credits</span>
                </p>
              </div>
              <Zap className="size-5 shrink-0 opacity-80" aria-hidden />
            </div>

            <p className="mt-3 text-sm leading-relaxed opacity-95">
              {balance <= 0
                ? "Out of credits — the next build will not start until you top up."
                : buildsLeft >= 1
                  ? `About ${buildsLeft} more ${buildsLeft === 1 ? "build" : "builds"}.`
                  : "Not quite enough for a full build."}{" "}
              {chargedBuilds > 0
                ? `Measured from your own builds, which have averaged ${avgBuildCredits.toLocaleString()} credits each.`
                : `Based on a typical Kodely build, about ${avgBuildCredits.toLocaleString()} credits. Once you have run a few, this uses your own average instead.`}
            </p>

            <p className="mt-3 text-xs leading-relaxed opacity-90">
              Credits never expire, and a build that fails is never charged.{" "}
              <Link
                href="/dashboard/billing"
                className="k-focus rounded-xs font-medium underline underline-offset-2 hover:no-underline"
              >
                Every line of your credit history
              </Link>
              .
            </p>
          </div>

          <Card>
            <CardHeader title="How a ticket works" />
            <ul className="mt-4 space-y-3 text-sm leading-relaxed text-ink-2">
              <li className="flex gap-3">
                <MessageSquare className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />
                <span>
                  The reply lands on the ticket, here, and you answer back on the same thread. The
                  status is real rather than decorative:{" "}
                  <strong className="font-medium text-ink">Waiting on us</strong> means nobody has
                  answered yet, and <strong className="font-medium text-ink">Replied</strong> means
                  somebody has.
                </span>
              </li>
              <li className="flex gap-3">
                <Mail className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />
                <span>
                  {mailReady ? (
                    <>
                      We also email {user.email} when someone replies, so you do not have to keep
                      checking. That email only says there is a reply — the reply itself stays
                      here, behind your sign-in.
                    </>
                  ) : (
                    <>
                      Outgoing email is switched off on this deployment, so nothing will arrive in
                      your inbox. Tickets work exactly the same either way: the email is a nudge,
                      not the mechanism, and every reply appears on the thread.
                    </>
                  )}
                </span>
              </li>
              <li className="flex gap-3">
                <Sparkles className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />
                <span>
                  There is no live chat, no AI support agent and no published response time. Kodely
                  is small, and nothing here measures how fast we answer — so nothing here will
                  claim a number. If something is time-critical, say so and say when.
                </span>
              </li>
            </ul>
          </Card>

          <Card>
            <CardHeader title="Rating a build isn't a message" />
            <div className="mt-3 flex gap-3">
              <ThumbsUp className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />
              <p className="text-sm leading-relaxed text-ink-2">
                The thumbs up and down after a build records a rating we read in aggregate to work
                out which builds go wrong. Nobody replies to one, and there is nowhere for a reply
                to land. If you want an answer, open a ticket.
              </p>
            </div>
          </Card>
        </div>
      </div>

      <Card padded={false}>
        <div className="border-b border-hair p-5">
          <CardHeader
            title="Answers you can get right now"
            description="The questions that come in most often, and the real reason behind each one."
          />
        </div>
        <div className="px-5">
          <Answer q="I renamed my site. Why is the web address still the old name?">
            <p>
              Because the address is fixed at creation and renaming only changes the label in your
              dashboard. If a rename moved the address, every existing link to your site would
              break with no redirect behind it, and the address you left would be free for someone
              else to take.
            </p>
            <p>
              <Link
                href="/dashboard/domains"
                className="k-focus rounded-sm font-medium text-brand underline underline-offset-2"
              >
                See your addresses
              </Link>
            </p>
          </Answer>

          <Answer q="Can I use my own domain?">
            <p>
              Not yet, and there is no hidden setting for it. Custom domains are genuinely not
              built — no verification, no certificates, nothing. Your site lives at its
              kodely.site address, with HTTPS, and that address is permanent.
            </p>
            <p>
              <Link
                href="/dashboard/domains"
                className="k-focus rounded-sm font-medium text-brand underline underline-offset-2"
              >
                What that means, in full
              </Link>
            </p>
          </Answer>

          <Answer q="A build failed. Was I charged?">
            <p>
              No. A failed build is recorded so we can look at it, and it is never charged — the
              charge only happens on a build that succeeded. If your balance moved around a failure
              and you can see it in your credit history, open a ticket under &ldquo;Credits or a
              charge&rdquo; and we will go through it with you.
            </p>
            <p>
              <Link
                href="/dashboard/billing"
                className="k-focus rounded-sm font-medium text-brand underline underline-offset-2"
              >
                Open your credit history
              </Link>
            </p>
          </Answer>

          <Answer q="Do my credits expire?">
            <p>
              No. Credits never expire, there is no monthly allowance, and there is no reset day to
              spend before. You buy credits once and they sit there.
            </p>
            <p>
              The spend cap in Settings is a different thing: a ceiling you set yourself over a
              rolling thirty days, so a runaway session cannot surprise you. Nothing resets it,
              because there is nothing to reset — the window simply slides.
            </p>
          </Answer>

          <Answer q="Publishing was blocked. What happened?">
            <p>
              Two checks run at the moment you publish, and both refuse rather than warn. The first
              looks for anything shaped like a real secret — an API key, a token — in your files,
              because publishing puts them on the open web. The second is an abuse check on the
              content itself.
            </p>
            <p>
              The message names the file and what it found. If it is wrong about your page, open a
              ticket with that site attached and we will look at the actual finding.
            </p>
          </Answer>

          <Answer q="Someone filled in the contact form on my published site. Where does it go?">
            <p>
              To the submissions inbox for that site, inside the builder. Your published pages are
              static, so the form posts back to Kodely rather than to your own server — that is the
              one thing a generated site does over the network.
            </p>
            {mailReady ? (
              <p>
                We also email you when one arrives, up to ten an hour per site so a spam burst
                cannot take over your inbox. Anything past that is still waiting in the inbox.
              </p>
            ) : (
              <p>
                Nothing is emailed to you on this deployment — outgoing email is switched off — so
                the inbox in the builder is the only place submissions appear.
              </p>
            )}
          </Answer>

          <Answer q="I published, but I'm still seeing the old version.">
            <p>
              Published pages are cached for up to a minute, so a republish can take that long to
              show up. Give it sixty seconds and reload. If it is still wrong after that, it is not
              the cache — tell us.
            </p>
          </Answer>

          <Answer q="Is it broken for everyone, or just me?">
            <p>
              The status page reports what the app can actually measure about itself, and prints
              &quot;unknown&quot; where it cannot measure anything, rather than a reassuring green
              tick it has not earned.
            </p>
            <p>
              <a
                href="/status"
                target="_blank"
                rel="noreferrer"
                className="k-focus rounded-sm font-medium text-brand underline underline-offset-2"
              >
                Open the status page
              </a>
            </p>
          </Answer>

          <Answer q="Who reads my ticket, and what else can they see?">
            <p>
              Kodely staff, in an internal queue. They see your email address, what you wrote, and
              the site you attached. A ticket grants no access they did not already have — an
              operator can already open an account&apos;s projects, builds and credit history — it
              only puts your question next to it.
            </p>
            <p>
              Each time an operator opens or answers your thread it is recorded, with who they were
              and when. Your tickets are in your data export in full, and deleting your account
              deletes them.
            </p>
          </Answer>

          <Answer q="I want my data, or I want my account gone.">
            <p>
              Both are self-serve and neither needs us. You can download everything Kodely holds
              about you — your tickets and our replies included — and you can start an account
              deletion, which has a grace period you can cancel within and then erases the account.
            </p>
            <p>
              <a
                href="/legal/rights"
                target="_blank"
                rel="noreferrer"
                className="k-focus rounded-sm font-medium text-brand underline underline-offset-2"
              >
                Your data rights
              </a>
            </p>
          </Answer>
        </div>
      </Card>

      <div>
        <SectionHeader title="Before you write" description="These answer faster than we can." />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Elsewhere
            href="/status"
            external
            icon={<Activity className="size-4" aria-hidden />}
            title="Status"
            body="What the app can measure about itself right now."
          />
          <Elsewhere
            href="/dashboard/domains"
            icon={<Link2 className="size-4" aria-hidden />}
            title="Your addresses"
            body="Every site's real web address, and why it never changes."
          />
          <Elsewhere
            href="/dashboard/billing"
            icon={<CreditCard className="size-4" aria-hidden />}
            title="Credit history"
            body="Every credit in and out, with the build it paid for."
          />
          <Elsewhere
            href="/legal/rights"
            external
            icon={<FileText className="size-4" aria-hidden />}
            title="Data rights"
            body="Export everything, or delete the account."
          />
        </div>
      </div>

      <p className="text-xs leading-relaxed text-ink-3">
        Prefer plain email?{" "}
        <a
          href={`mailto:${CONTACT_TO}?subject=${encodeURIComponent("Kodely support")}&body=${encodeURIComponent(`Kodely account: ${user.email}\n\n`)}`}
          className="k-focus rounded-xs underline underline-offset-2"
        >
          {CONTACT_TO}
        </a>{" "}
        is a real mailbox and does not depend on anything on this server. A message sent that way
        has no ticket behind it, though, so it will not appear in the list above and it has no
        status to watch.
      </p>
    </div>
  );
}
