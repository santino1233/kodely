import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Mail, UserRound } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { Card, CardHeader } from "@/components/ui/Card";
import { PageHero } from "@/components/ui/PageHero";
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
      {/* This tab's own hero — the layout above already renders the page-level
          "Settings" h1, so this is deliberately `as="h2"` and matches the
          same tab icon SettingsNav uses (UserRound) rather than a second
          icon language for the same three tabs. */}
      <PageHero
        as="h2"
        icon={<UserRound className="size-5" aria-hidden />}
        title="Account"
      />

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
    </>
  );
}
