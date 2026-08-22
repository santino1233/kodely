import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Blocks,
  CreditCard,
  Inbox,
  KeyRound,
  Mail,
  MessagesSquare,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { CONTACT_TO, isMailConfigured } from "@/lib/mail";
import { billingEnabled } from "@/lib/stripe";
import { hasClaimed, isPlatformConfigured, REWARD_CREDITS } from "@/app/api/rewards/_lib";
import { Badge } from "@/components/ui/Badge";
import { Card, CardHeader, SectionHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

export const dynamic = "force-dynamic";

// Bare noun; the "— Kodely" suffix is the portal layout's title template.
export const metadata: Metadata = { title: "Integrations" };

/* Every row on this page is rendered from a value read out of the running
   system — the user's own row, isMailConfigured(), billingEnabled(),
   isPlatformConfigured() — and not one of them is a thing the customer can
   connect or disconnect here. That is the honest shape of this page: it is a
   statement of what is already wired to their account, not a directory. */
function Row({
  icon,
  title,
  status,
  children,
}: {
  icon: ReactNode;
  title: string;
  status: ReactNode;
  children: ReactNode;
}) {
  return (
    <li className="flex gap-4 p-5">
      <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-2 text-ink-2">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <p className="k-h2 text-ink">{title}</p>
          {status}
        </div>
        <div className="mt-1.5 space-y-2 text-sm leading-relaxed text-ink-2">{children}</div>
      </div>
    </li>
  );
}

export default async function IntegrationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const discordConfigured = isPlatformConfigured("discord");

  const [publishedSites, submissions, discordClaimed] = await Promise.all([
    db.project.count({ where: { userId: user.id, publishedAt: { not: null } } }),
    db.formSubmission.count({ where: { project: { userId: user.id }, spam: false } }),
    discordConfigured ? hasClaimed(user.id, "discord") : Promise.resolve(false),
  ]);

  const mailReady = isMailConfigured();
  const stripeReady = billingEnabled();
  const usesGoogle = user.googleId !== null;
  const usesPassword = user.passwordHash !== null;

  return (
    <div className="flex flex-col gap-8">
      <SectionHeader as="h1"
        title="Integrations"
        description="What is already wired to your account, and what Kodely does not connect to."
      />

      <EmptyState
        kind="unavailable"
        icon={<Blocks className="size-7" aria-hidden />}
        title="There is nothing to connect here yet"
        body="Kodely has no integrations directory, no API keys, no webhooks and no third-party app connections. Nothing on this page can be switched on or off — it is here to tell you what is true, not to take a setting."
      />

      <div>
        <SectionHeader
          title="Already connected to your account"
          description="Each of these is running today. None of them was something you had to set up."
        />

        <Card padded={false}>
          <ul className="divide-y divide-hair">
            <Row
              icon={<KeyRound className="size-4.5" aria-hidden />}
              title="How you sign in"
              status={
                <Badge tone="ok" dot>
                  Active
                </Badge>
              }
            >
              {usesGoogle && usesPassword ? (
                <p>
                  Your account has both a Google sign-in and a Kodely password. Either one gets you
                  in, and both point at <span className="font-medium text-ink">{user.email}</span>.
                </p>
              ) : usesGoogle ? (
                <p>
                  You sign in with Google. Kodely holds your Google account id, your email address
                  — <span className="font-medium text-ink">{user.email}</span> — and the name
                  Google gave us, and never had a password for you to lose.
                </p>
              ) : (
                <p>
                  You sign in with an email address and a password:{" "}
                  <span className="font-medium text-ink">{user.email}</span>. If you ever use
                  Google sign-in with that same address, it links to this account rather than
                  creating a second one — your sites and credits stay where they are.
                </p>
              )}
              <p className="text-ink-3">
                The Google sign-in asks for your email address and basic profile — your name — and
                nothing beyond that. No calendar, no drive, no contacts, and no permission that
                keeps working after you have signed in.
              </p>
            </Row>

            <Row
              icon={<Mail className="size-4.5" aria-hidden />}
              title="Email from Kodely"
              status={
                mailReady ? (
                  <Badge tone="ok" dot>
                    Sending
                  </Badge>
                ) : (
                  <Badge tone="warn" dot>
                    Off right now
                  </Badge>
                )
              }
            >
              {mailReady ? (
                <>
                  <p>
                    Kodely emails <span className="font-medium text-ink">{user.email}</span> about
                    four things, and only these four: a welcome when you sign up, a warning when
                    your credits are running low, a notice when a build fails, and a confirmation
                    when a site goes live.
                  </p>
                  <p className="text-ink-3">
                    There are no notification settings, because there is nothing to choose between
                    — all four are about your own account and none of them are marketing.
                  </p>
                </>
              ) : (
                <p>
                  Email delivery is not configured on this deployment, so Kodely will not email you
                  at all — no welcome, no low-credit warning, no build-failure notice, no
                  publish confirmation. Nothing is queued for later either. Reach a person at{" "}
                  <a
                    href={`mailto:${CONTACT_TO}`}
                    className="k-focus rounded-sm font-medium text-brand underline underline-offset-2"
                  >
                    {CONTACT_TO}
                  </a>
                  .
                </p>
              )}
            </Row>

            <Row
              icon={<CreditCard className="size-4.5" aria-hidden />}
              title="Stripe"
              status={
                stripeReady ? (
                  <Badge tone="ok" dot>
                    Handling payments
                  </Badge>
                ) : (
                  <Badge tone="warn" dot>
                    Off right now
                  </Badge>
                )
              }
            >
              {stripeReady ? (
                <>
                  <p>
                    Card payments go to Stripe&apos;s own checkout. Kodely never sees or stores your
                    card, and there is no saved payment method here to manage.
                  </p>
                  <p className="text-ink-3">
                    Every purchase is a one-off credit pack. There is no subscription, so there is
                    nothing to cancel and no renewal date to watch.
                  </p>
                </>
              ) : (
                <p>
                  Card payments are not configured on this deployment, so credit packs cannot be
                  bought right now. Existing credits are unaffected.
                </p>
              )}
            </Row>

            <Row
              icon={<Inbox className="size-4.5" aria-hidden />}
              title="Forms on your published sites"
              status={
                publishedSites > 0 ? (
                  <Badge tone="ok" dot>
                    Receiving
                  </Badge>
                ) : (
                  // `dot` on BOTH halves of the pair: it is the second status
                  // channel, and dropping it from the negative case makes the
                  // one state that is not live the only one without it.
                  <Badge tone="neutral" dot>
                    Ready when you publish
                  </Badge>
                )
              }
            >
              <p>
                A contact form on a site you publish posts back to Kodely, not to a third-party form
                service. Submissions land in that site&apos;s inbox in the builder
                {submissions > 0 ? (
                  <>
                    {" "}
                    — <span className="k-num font-medium text-ink">{submissions}</span> so far
                    across your sites
                  </>
                ) : null}
                .
              </p>
              <p className="text-ink-3">
                {mailReady
                  ? "You also get an email for each one, capped at ten an hour per site so a burst of spam cannot flood your inbox. There is no forwarding to a CRM or a spreadsheet."
                  : "Email delivery is off on this deployment, so submissions are stored and readable in the builder but nothing is emailed to you."}
              </p>
            </Row>

            {discordConfigured ? (
              <Row
                icon={<MessagesSquare className="size-4.5" aria-hidden />}
                title="Discord"
                status={
                  discordClaimed ? (
                    <Badge tone="ok" dot>
                      Claimed
                    </Badge>
                  ) : (
                    <Badge tone="info" dot>
                      Available
                    </Badge>
                  )
                }
              >
                <p>
                  Joining the Discord and authorising once is worth a one-off{" "}
                  <span className="k-num font-medium text-ink">{REWARD_CREDITS}</span> credits.
                  Discord tells us whether you are actually in the server; that check is the whole
                  of the connection.
                </p>
                <p className="text-ink-3">
                  It is not an ongoing link. Kodely does not read your messages, does not post
                  anything, and does not keep talking to Discord afterwards.{" "}
                  <Link
                    href="/settings/credits"
                    className="k-focus rounded-sm font-medium text-brand underline underline-offset-2"
                  >
                    {discordClaimed ? "See it in Settings" : "Claim it in Settings"}
                  </Link>
                  .
                </p>
              </Row>
            ) : null}
          </ul>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="What Kodely does not connect to"
          description="Not hidden behind a plan, not in a private beta. These do not exist in the product."
        />
        <ul className="mt-4 grid gap-x-8 gap-y-3 text-sm leading-relaxed text-ink-2 sm:grid-cols-2">
          {[
            "An API or API keys for Kodely itself",
            "Webhooks for builds, publishes or form submissions",
            "Your own analytics — Google Analytics, Plausible, anything",
            "A CRM or a mailing list to send form submissions on to",
            "Zapier, Make, or any automation tool",
            "A CMS, so somebody else can edit the copy",
            "Taking payments or bookings on a site you built here",
            "Anything that would need a token or a secret stored for you",
          ].map((item) => (
            <li key={item} className="flex gap-2.5">
              <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-ink-3" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <p className="mt-5 border-t border-hair pt-4 text-sm leading-relaxed text-ink-2">
          There is nowhere in Kodely to store a key or a token for you, and no route that calls out
          to a service on your behalf, so none of the above can be quietly half-working. If one of
          them is the thing standing between you and using Kodely properly,{" "}
          {/* ?topic=feature — same parameter as the rail's "Request a feature"
              item, so the support form knows what this is before they type. */}
          <Link
            href="/support?topic=feature"
            className="k-focus rounded-sm font-medium text-brand underline underline-offset-2"
          >
            say which one
          </Link>{" "}
          — that is the only signal that moves this list.
        </p>
      </Card>
    </div>
  );
}
