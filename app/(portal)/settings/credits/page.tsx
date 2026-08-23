import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { CreditCard } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getSpendCapStatus, spentInWindow } from "@/lib/credits";
import {
  MIN_ACCOUNT_AGE_HOURS,
  rewardStatuses,
  UNVERIFIED_HOLD_HOURS,
} from "@/app/api/rewards/_lib";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PageHero } from "@/components/ui/PageHero";
import { Progress, toneForUsage } from "@/components/ui/Progress";
import RewardsCard from "@/components/rewards/RewardsCard";
import SpendCapForm from "../SpendCapForm";

export const dynamic = "force-dynamic";

// The "— Kodely" suffix comes from the title template on the (portal) layout.
export const metadata: Metadata = { title: "Credits · Settings" };

/* CREDITS — the two things about money that live in Settings.
   The credit ledger itself, top-ups and purchase history are /dashboard/billing
   and stay there; this page is only the things you SET rather than read. */
export default async function SettingsCreditsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [cap, rewards, params] = await Promise.all([
    getSpendCapStatus(user.id),
    // Returns [] when no reward platform is configured, so the card renders
    // nothing at all rather than this page needing to know about env vars.
    rewardStatuses(user),
    searchParams,
  ]);

  // getSpendCapStatus skips the spend query when uncapped (there is nothing to
  // compare against), but this page shows recent spend either way.
  const spent = cap.cap === null ? await spentInWindow(user.id) : cap.spent;

  // Set by the Discord OAuth callback on its way back here, via /settings.
  const notice = params.reward;

  return (
    <>
      {/* Own hero for this tab — same reasoning and same tab icon (CreditCard)
          as the Account tab's PageHero; the layout's h1 stays "Settings". */}
      <PageHero
        as="h2"
        icon={<CreditCard className="size-5" aria-hidden />}
        title="Credits"
      />

      <Card>
        <CardHeader
          title="Spending cap"
          description="Stop builds once you have spent this many credits in any 30-day period. Your cap, your call — we will never raise it for you."
          action={
            cap.reached ? (
              <Badge tone="danger" dot>
                Cap reached
              </Badge>
            ) : cap.cap !== null ? (
              <Badge tone="ok" dot>
                Cap on
              </Badge>
            ) : (
              // `dot` on all three states of this badge, not just the two that
              // are switched on: the dot is the second status channel, so the
              // "off" state needs it as much as the others.
              <Badge tone="neutral" dot>
                No cap
              </Badge>
            )
          }
        />

        <div className="mt-5 rounded-lg border border-hair bg-surface-2 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <span className="k-label">Spent in the last 30 days</span>
            <span className="text-sm text-ink-2">
              <span className="k-num font-semibold text-ink">{spent.toLocaleString()}</span>
              {cap.cap !== null && (
                <>
                  {" of "}
                  <span className="k-num font-semibold text-ink">{cap.cap.toLocaleString()}</span>
                </>
              )}{" "}
              credits
            </span>
          </div>
          {cap.cap !== null && (
            <Progress
              className="mt-3"
              value={spent}
              max={cap.cap}
              tone={toneForUsage(spent / cap.cap)}
              label="Credits spent against your cap"
            />
          )}
          <p className="mt-3 text-xs leading-relaxed text-ink-3">
            A rolling 30 days, not a calendar month — there is no reset day, and credits themselves
            never expire. Everything you have spent, line by line, is in{" "}
            <Link
              href="/dashboard/billing"
              className="k-focus rounded-xs text-brand underline underline-offset-2 hover:no-underline"
            >
              Billing
            </Link>
            .
          </p>
        </div>

        <SpendCapForm initialCap={cap.cap} spent={spent} />
      </Card>

      {/* Renders nothing when no reward platform is configured. Not an empty
          state — no state. */}
      <RewardsCard
        rewards={rewards}
        holdHours={UNVERIFIED_HOLD_HOURS}
        unlockHours={MIN_ACCOUNT_AGE_HOURS}
        notice={typeof notice === "string" ? notice : undefined}
      />
    </>
  );
}
