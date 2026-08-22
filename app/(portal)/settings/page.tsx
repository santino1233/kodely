import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Mail } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PRIVACY_EMAIL } from "@/app/api/account/_deletion";
import NameForm from "./NameForm";
import { formatDate } from "./_format";

export const dynamic = "force-dynamic";

/* Titles across the three Settings tabs are the tab's own label qualified by
   "Settings", and the "— Kodely" suffix is added by the title template on
   app/(portal)/layout.tsx. Deliberately NOT a second template on
   app/(portal)/settings/layout.tsx: only the CLOSEST ancestor template is
   applied, so a nested one would swallow the portal's suffix and leave these
   three pages as the only portal tabs without it. */
export const metadata: Metadata = { title: "Settings" };

/* ACCOUNT — who you are on Kodely.
   One editable field (the name), one read-only one (the email), and a plain
   statement about the emails we send. Nothing on this page is a control that
   does not do something. */
export default async function SettingsAccountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // app/api/rewards/discord/{start,callback} redirect to /settings?reward=…
  // and predate this section split. Free credits now live on the Credits tab,
  // so the outcome is forwarded there rather than silently dropped on a page
  // that no longer has a rewards card to show it in. Fixing this here keeps
  // the change out of the rewards routes entirely.
  const reward = (await searchParams).reward;
  if (typeof reward === "string" && reward.length > 0) {
    redirect(`/settings/credits?reward=${encodeURIComponent(reward)}`);
  }

  return (
    <>
      <Card>
        <CardHeader
          title="Profile"
          description="Your name is what the portal greets you with and what your welcome email is addressed to. It is never shown on a site you publish."
        />
        <NameForm initialName={user.name} />
      </Card>

      <Card>
        <CardHeader title="Email address" />
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-md border border-hair bg-surface-2 px-3.5 py-2.5">
          <Mail className="size-4 shrink-0 text-ink-3" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-sm text-ink">{user.email}</span>
        </div>
        <p className="mt-3 text-[0.8125rem] leading-relaxed text-ink-2">
          This is the address you sign in with, and it cannot be changed here — there is no
          self-serve route for it, and a box that looked editable and saved nothing would be worse
          than this line. Email{" "}
          <a
            href={`mailto:${PRIVACY_EMAIL}`}
            className="k-focus rounded-xs text-brand underline underline-offset-2 hover:no-underline"
          >
            {PRIVACY_EMAIL}
          </a>{" "}
          and a person will change it for you.
        </p>
        <p className="mt-3 text-[0.8125rem] text-ink-2">
          Member since <span className="k-num text-ink">{formatDate(user.createdAt)}</span>.
        </p>
      </Card>

      {/* SURFACED, NOT OMITTED. "Where do I turn the emails off?" is a question
          people come to a settings page with, and the answer here is a real
          one: there is nothing to turn off. lib/notifications/templates.ts is
          explicit that this product holds no consent record and has no
          unsubscribe mechanism, precisely because all four messages are
          triggered by the recipient's own account. Naming the four is more
          use than four switches that write nowhere. */}
      <EmptyState
        kind="unavailable"
        icon={<Mail className="size-6" aria-hidden />}
        title="No email preferences to set"
        body={
          <>
            Kodely sends four emails, each one triggered by something on your own account: a
            welcome, a warning when your credits run low, a note when a build fails, and a
            confirmation when a site goes live. There is no marketing list, no newsletter and no
            tracking pixel — so there is nothing here to opt out of, and no switch has been drawn
            that would pretend otherwise. The full record of what was sent to you is in your{" "}
            <Link
              href="/settings/security"
              className="k-focus rounded-xs text-brand underline underline-offset-2 hover:no-underline"
            >
              data export
            </Link>
            .
          </>
        }
      />
    </>
  );
}
