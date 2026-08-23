import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowDownRight,
  ArrowUpRight,
  Gauge,
  Hammer,
  Receipt,
  Rocket,
  Sparkles,
  Zap,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { billingEnabled } from "@/lib/stripe";
import { getSpendCapStatus, averageBuildCredits, getBalance, spentInWindow } from "@/lib/credits";
import { ButtonLink } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { InfoPopover } from "@/components/ui/InfoPopover";
import { PageHero } from "@/components/ui/PageHero";
import { db } from "@/lib/db";
import { SpendCapPanel } from "../billing/SpendCapPanel";
import { formatCredits, formatDay } from "../billing/ledger";
import { ActivityTable } from "./ActivityTable";
import {
  accountSpanDays,
  dailySpend,
  groupBuckets,
  ledgerTotals,
  monthToDate,
  mtdBuildKind,
  previousWindowSpend,
  recentActivity,
  siteUsage,
} from "./data";
import { RangeTabs } from "./RangeTabs";
import type { RangeKey } from "./RangeTabs";
import { SpendKindDonut } from "./SpendKindDonut";
import { UsageChart } from "./UsageChart";

export const dynamic = "force-dynamic";

// The "— Kodely" suffix comes from the title template on the (portal) layout.
export const metadata: Metadata = { title: "Usage" };

/* /dashboard/usage — what the credits went ON.
   ───────────────────────────────────────────────────────────────────────────
   This is a visual overhaul against a ChatGPT-generated reference screen —
   gradients, colour, a line chart instead of bars. The DATA underneath is
   unchanged from the previous pass, and the same four substitutions still
   apply, because the reference screen still shows things that are not true
   of this product:

     1. NO monthly allowance / reset date. The reference's hero card reads
        "75% of 1,000 credits · Resets in 18 days" — credits here never expire
        and nothing resets on a cycle. The hero's bar instead shows what
        FRACTION OF EVERYTHING YOU'VE EVER BEEN GIVEN OR BOUGHT is still
        unspent (balance ÷ totals.added) — a real, honest number in the same
        visual slot, not a subscription cycle standing in for one.
     2. NO donut over successful/failed/other builds — a failed build is
        charged zero (chargeForBuild is only reached on the SUCCEEDED path in
        app/api/generate/route.ts), so that shape would be one 100% slice and
        two empty ones wearing a three-category costume. SpendKindDonut keeps
        drawing each project's first charged build ("new sites") against every
        build after it ("edits") — a genuine category recovered from data
        that already exists — just with the gradient arcs the reference asks
        for.
     3. NO usage-alert toggles ("80% alert: On / 100% alert: On"). There is no
        notification system behind them — lib/notifications sends four fixed
        transactional emails and nothing configurable. SpendCapPanel (shared
        with /dashboard/billing, so the two pages can never disagree about the
        one real limit) still offers the one control that's real: the cap
        itself.
     4. NO "Upgrade plan" button — there is no subscription to upgrade. The
        bottom card offers "Buy credits" only, and only when Stripe is
        configured on this deployment.

   REMOVED FROM THIS PASS BY REQUEST: Build reliability, "Included at no
   additional credit cost", "What uses credits?", storage/bandwidth, and the
   "How Kodely credits work" strip. None of that was fabricated — it's simply
   not part of the page anymore. */

// Closed range table, looked up with hasOwnProperty so a query string of
// "constructor" or "__proto__" resolves to a miss rather than to something on
// Object.prototype.
const RANGES: Record<string, true> = { "30": true, "90": true, all: true };
const FIXED_DAYS: Record<string, number> = { "30": 30, "90": 90 };
const DEFAULT_RANGE: RangeKey = "30";

// Above this many days a daily bar is thinner than the gap beside it, so the
// chart groups into weeks instead. See groupBuckets in ./data.ts.
const WEEKLY_ABOVE_DAYS = 120;

const MONTH = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function pickRange(params: Record<string, string | string[] | undefined>): RangeKey {
  const raw = Object.prototype.hasOwnProperty.call(params, "range") ? params.range : undefined;
  // `?range=30&range=90` arrives as an array; there is no sane single answer to
  // that, so it falls through to the default rather than picking one at random.
  const key = typeof raw === "string" ? raw : DEFAULT_RANGE;
  if (Object.prototype.hasOwnProperty.call(RANGES, key)) return key as RangeKey;
  return DEFAULT_RANGE;
}

export default async function UsagePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const rangeKey = pickRange(await searchParams);

  const [cap, span] = await Promise.all([
    getSpendCapStatus(user.id),
    // "All time" has to be a real span, not an arbitrary large number of days.
    accountSpanDays(user.id),
  ]);

  // A null span means no ledger rows at all, which should not happen (the
  // signup grant writes one) but is not worth crashing over: fall back to the
  // default window and label it as such.
  const days =
    rangeKey === "all" ? Math.max(1, span ?? FIXED_DAYS[DEFAULT_RANGE]) : FIXED_DAYS[rangeKey];
  const rangeLabel =
    rangeKey === "all" && span !== null
      ? `the ${formatCredits(span)} days since your account opened`
      : `the last ${formatCredits(days)} days`;

  const [
    balance,
    spent,
    avgBuildCredits,
    measuredBuilds,
    sites,
    totals,
    dayBuckets,
    trend,
    mtd,
    mtdKind,
    activity,
  ] = await Promise.all([
    getBalance(user.id),
    // getSpendCapStatus skips the spend query when the user is uncapped; this
    // page needs the figure either way, and it must be the same query the cap
    // enforces so the two can't disagree.
    cap.cap === null ? spentInWindow(user.id) : Promise.resolve(cap.spent),
    averageBuildCredits(user.id),
    // averageBuildCredits falls back to a global constant when there is no
    // history. That constant is a fine default for "builds remaining" — the
    // rail and the /support card both use it that way — but it is NOT a
    // measurement of this person, so any tile claiming to describe THEIR builds
    // waits for this count.
    db.build.count({
      where: { project: { userId: user.id }, status: "SUCCEEDED", creditsCharged: { gt: 0 } },
    }),
    siteUsage(user.id),
    ledgerTotals(user.id),
    dailySpend(user.id, days),
    previousWindowSpend(user.id),
    monthToDate(user.id),
    mtdBuildKind(user.id),
    recentActivity(user.id, 6),
  ]);

  const buckets = groupBuckets(dayBuckets, days > WEEKLY_ABOVE_DAYS ? 7 : 1);

  const attributed = sites.reduce((sum, s) => sum + s.credits, 0);
  // Deleting a project cascades its builds away and SET NULLs the ledger's
  // buildId, so the charge outlives the thing it was for. That gap is real and
  // is shown as its own row rather than quietly rounding the percentages.
  const orphaned = Math.max(0, totals.spent - attributed);
  const largest = Math.max(attributed > 0 ? sites[0].credits : 0, orphaned, 1);
  // A real 1-credit site rounding to a flat "0%" reads as "this cost nothing",
  // which is the one thing it definitely did not do.
  const share = (credits: number) => {
    if (totals.spent <= 0 || credits <= 0) return "0%";
    const pct = (credits / totals.spent) * 100;
    return pct < 1 ? "<1%" : `${Math.round(pct)}%`;
  };

  // The same arithmetic the sidebar rail and the /support card do, so all three
  // answer "how much more can I build?" with the same number. No denominator is
  // invented anywhere: there is no allowance for the balance to be a fraction
  // of, which is exactly why none of the three draws a bar tied to it.
  const buildsLeft = avgBuildCredits > 0 ? Math.floor(balance / avgBuildCredits) : 0;

  // Only computed when the account lived through the whole earlier window, and
  // only expressed as a percentage when there is a non-zero base to divide by.
  const delta =
    trend.comparable && trend.previous > 0
      ? Math.round(((spent - trend.previous) / trend.previous) * 100)
      : null;

  // Three real states for the hero card. "Low" mirrors the create-flow's own
  // definition of tight (Composer.tsx): can't be sure of covering one more
  // average build. Both thresholds are about THIS account's own numbers, not
  // an arbitrary credit count.
  const zero = balance <= 0;
  const low = !zero && measuredBuilds > 0 && balance < avgBuildCredits;

  const canBuyCredits = billingEnabled();
  const hasAnyUsage = totals.spent > 0 || activity.length > 0;

  return (
    <>
      <PageHero
        className="mb-6"
        as="h1"
        icon={<Gauge className="size-5" aria-hidden />}
        title={
          <span className="inline-flex items-center gap-2">
            Usage &amp; Credits
            <Sparkles className="size-5 text-brand" aria-hidden />
          </span>
        }
        description="Track your AI usage, build activity, and remaining credits."
        action={
          <div className="flex items-center gap-2">
            <ButtonLink href="/dashboard/billing" variant="secondary" size="sm">
              Billing &amp; statements
            </ButtonLink>
            <InfoPopover label="About this page" align="end">
              This page reads directly from your credit ledger and build history — every figure is
              real, nothing here is a projection or an estimate framed as a fact.
            </InfoPopover>
          </div>
        }
      />

      {/* ── Where you stand ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <HeroCreditsCard
          balance={balance}
          buildsLeft={buildsLeft}
          measuredBuilds={measuredBuilds}
          avgBuildCredits={avgBuildCredits}
          totalEverAdded={totals.added}
          zero={zero}
          low={low}
          canBuyCredits={canBuyCredits}
        />

        <StatTile
          tone="pink"
          icon={<Receipt className="size-4" aria-hidden />}
          label="Credits spent"
          value={formatCredits(spent)}
          unit="credits"
          detail={
            <>
              {delta !== null && (
                <span className="mb-1 flex items-center gap-1 font-medium text-ink-2">
                  {delta >= 0 ? (
                    <ArrowUpRight className="size-3.5 shrink-0" aria-hidden />
                  ) : (
                    <ArrowDownRight className="size-3.5 shrink-0" aria-hidden />
                  )}
                  <span className="k-num">{Math.abs(delta)}%</span>
                  <span>vs the 30 days before</span>
                </span>
              )}
              Rolling 30 days, not a calendar month. There is no reset day.
              {delta === null && trend.comparable && trend.previous === 0
                ? " Nothing was spent in the 30 days before this one, so there is no change to quote."
                : ""}
            </>
          }
        />

        <StatTile
          tone="purple"
          icon={<Gauge className="size-4" aria-hidden />}
          label="Your average build"
          value={measuredBuilds > 0 ? formatCredits(avgBuildCredits) : "—"}
          unit={measuredBuilds > 0 ? "credits" : undefined}
          detail={
            measuredBuilds > 0
              ? `Per successful build — ${formatCredits(measuredBuilds)} charged so far.`
              : "Nothing measured yet. You haven't been charged for a build."
          }
        />

        <StatTile
          tone="peach"
          icon={<Hammer className="size-4" aria-hidden />}
          label="Builds this month"
          value={formatCredits(mtd.builds)}
          unit={mtd.builds === 1 ? "build" : "builds"}
          detail={`Since 1 ${MONTH.format(new Date(mtd.start))} (UTC) — a calendar count for orientation, nothing resets on the 1st.`}
        />

        <StatTile
          tone="ok"
          icon={<Rocket className="size-4" aria-hidden />}
          label="Builds you can afford"
          value={formatCredits(buildsLeft)}
          unit="more"
          info={
            <InfoPopover label="How this is calculated">
              Your credit balance divided by{" "}
              {measuredBuilds > 0 ? "your own measured average build cost" : "a typical Kodely build cost"}
              , rounded down. A bigger or more complex site costs more than a smaller one, so treat
              this as a rough guide, not a guarantee.
            </InfoPopover>
          }
          detail={
            measuredBuilds > 0
              ? "At your own measured average."
              : "Based on a typical Kodely build — you haven't had one charged yet."
          }
        />
      </div>

      {!hasAnyUsage ? (
        <EmptyState
          className="mt-4"
          kind="empty"
          title="Your usage will appear here"
          body="Once you build or update a website with Kodely AI, your credit activity, charts and breakdowns fill in on their own."
          action={
            <ButtonLink href="/dashboard/new" variant="primary" size="sm">
              Create a website
            </ButtonLink>
          }
        />
      ) : (
        <>
          {/* ── Credits over time + Usage this month ─────────────────────── */}
          <div className="mt-4 grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader
                title="Credits over time"
                description="Daily AI credits spent (UTC)."
                action={<RangeTabs value={rangeKey} allLabel={span === null ? "All time" : "All time"} />}
              />

              <UsageChart buckets={buckets} days={days} rangeLabel={rangeLabel} />

              <p className="mt-4 text-xs leading-relaxed text-ink-3">
                Only successful, metered builds are charged, so only those appear. This line steps
                across UTC calendar {days > WEEKLY_ABOVE_DAYS ? "weeks" : "days"}; the rolling
                30-day figure above can differ from a sum of these points by up to one{" "}
                {days > WEEKLY_ABOVE_DAYS ? "week" : "day"}&apos;s spend — neither is an estimate,
                they&apos;re just measured over different windows.
              </p>

              {delta !== null && delta <= -5 && (
                <div className="mt-4 flex flex-wrap items-center gap-2.5 rounded-lg border border-ok/30 bg-ok-tint px-4 py-3">
                  <Sparkles className="size-4 shrink-0 text-ok" aria-hidden />
                  <p className="text-sm text-ok">
                    You spent <span className="k-num font-medium">{Math.abs(delta)}%</span> less
                    than the 30 days before this one.
                  </p>
                </div>
              )}
            </Card>

            <Card>
              <CardHeader
                title="Usage this month"
                description={`1–${mtd.daysElapsed} ${MONTH.format(new Date(mtd.start))}, UTC.`}
              />
              <div className="mt-5">
                <SpendKindDonut createCredits={mtdKind.createCredits} editCredits={mtdKind.editCredits} />
              </div>
              <p className="mt-4 text-xs leading-relaxed text-ink-3">
                A month boundary is a convenient way to read this and nothing more — credits never
                expire and there is no monthly allowance behind them.
              </p>
            </Card>
          </div>

          {/* ── Recent activity + Spending cap ───────────────────────────── */}
          <div className="mt-4 grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader
                title="Recent credit activity"
                description="Your newest charges and credits."
              />
              <div className="mt-4">
                <ActivityTable rows={activity} />
              </div>
            </Card>

            <SpendCapPanel cap={cap.cap} spent={spent} />
          </div>

          {/* ── Per-website attribution ───────────────────────────────────── */}
          <Card className="mt-4">
            <CardHeader
              title="Where your credits went"
              description="See which websites are using the most AI credits."
            />

            {sites.length === 0 && orphaned === 0 ? (
              <EmptyState
                className="mt-5"
                kind="empty"
                title="Nothing charged yet"
                body="You haven't been charged for a build, so there is nothing to break down."
              />
            ) : (
              <>
                <ul className="mt-5 flex flex-col gap-4">
                  {sites.map((site, i) => (
                    <SiteRow
                      key={site.projectId}
                      name={
                        <Link
                          href={`/projects/${site.projectId}`}
                          className="k-focus rounded-sm font-medium break-words text-ink hover:text-brand"
                        >
                          {site.name}
                        </Link>
                      }
                      credits={site.credits}
                      max={largest}
                      share={share(site.credits)}
                      gradient={SITE_GRADIENTS[i % SITE_GRADIENTS.length]}
                      barLabel={`${site.name}: ${formatCredits(site.credits)} credits`}
                      footnote={
                        <>
                          <span className="k-num">{formatCredits(site.builds)}</span>{" "}
                          {site.builds === 1 ? "build" : "builds"} · last charged{" "}
                          <span className="k-num">{formatDay(site.lastAt)}</span>
                        </>
                      }
                    />
                  ))}

                  {orphaned > 0 && (
                    <SiteRow
                      name={
                        <span className="font-medium break-words text-ink-2">
                          Websites you&apos;ve deleted
                        </span>
                      }
                      credits={orphaned}
                      max={largest}
                      share={share(orphaned)}
                      gradient="linear-gradient(90deg, var(--border-strong), var(--border-strong))"
                      barLabel={`Deleted websites: ${formatCredits(orphaned)} credits`}
                      footnote="Their build records are gone, so these charges can no longer be pointed at a site — but the credits really were spent, so they stay on your statement."
                    />
                  )}
                </ul>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs leading-relaxed text-ink-3">
                    Shares are of <span className="k-num">{formatCredits(totals.spent)}</span>{" "}
                    credits spent in total, against{" "}
                    <span className="k-num">{formatCredits(totals.added)}</span> ever added.
                  </p>
                  <Link
                    href="/dashboard/websites"
                    className="k-focus shrink-0 rounded-sm text-xs font-medium text-brand hover:underline"
                  >
                    View all projects →
                  </Link>
                </div>
              </>
            )}
          </Card>
        </>
      )}

      {/* ── Buy credits — no "Upgrade plan": there is no plan ───────────── */}
      {canBuyCredits && (
        <Card className="relative mt-6 overflow-hidden">
          <div className="k-wash" aria-hidden />
          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <span
                aria-hidden
                className="grid size-11 shrink-0 place-items-center rounded-full text-white shadow-[0_6px_18px_-4px_var(--glow)]"
                style={{ background: "var(--brand-gradient)" }}
              >
                <Zap className="size-5" aria-hidden />
              </span>
              <div>
                <p className="k-h2 text-ink">Need more credits?</p>
                <p className="mt-1 text-sm text-ink-2">
                  Buy a credit pack to keep building — a single payment, nothing subscribes.
                </p>
              </div>
            </div>
            <ButtonLink href="/dashboard/billing" variant="primary" icon={<Zap className="size-4" aria-hidden />}>
              Buy credits
            </ButtonLink>
          </div>
        </Card>
      )}
    </>
  );
}

/** Gradients cycled across "Where your credits went" rows — purely decorative
    hue variety over a list of otherwise-equal items, drawn from the same
    chart palette as UsageChart/SpendKindDonut so the whole page reads as one
    family of colour rather than three different ideas of "brand". */
const SITE_GRADIENTS = [
  "linear-gradient(90deg, var(--brand), var(--brand-chart-2))",
  "linear-gradient(90deg, var(--brand-chart-2), var(--brand-chart-3))",
  "linear-gradient(90deg, var(--brand-chart-3), var(--brand))",
  "linear-gradient(90deg, var(--brand), var(--ok))",
];

/** The gradient hero card. Three real states: normal, low (can't be sure of
    covering one more average build), and zero. Low/zero use warm/danger
    TINTS rather than the brand gradient — that gradient means "things are
    fine" everywhere else it appears (this card's normal state, the sidebar,
    /support), and reusing it for a warning would blur that meaning right when
    clarity matters most.

    The bar in the normal state is NOT a monthly-allowance bar — there is no
    allowance. It reads balance ÷ everything ever added to this account, i.e.
    "how much of what you've bought or been given is still unspent" — a real
    ratio in the same visual slot a subscription-style card would put a fake
    one. */
function HeroCreditsCard({
  balance,
  buildsLeft,
  measuredBuilds,
  avgBuildCredits,
  totalEverAdded,
  zero,
  low,
  canBuyCredits,
}: {
  balance: number;
  buildsLeft: number;
  measuredBuilds: number;
  avgBuildCredits: number;
  totalEverAdded: number;
  zero: boolean;
  low: boolean;
  canBuyCredits: boolean;
}) {
  const warn = zero || low;
  const remainingFraction = totalEverAdded > 0 ? Math.max(0, Math.min(1, balance / totalEverAdded)) : null;

  return (
    <div
      className={
        warn
          ? "relative overflow-hidden rounded-xl border p-5 shadow-e2 " +
            (zero ? "border-danger/30 bg-danger-tint" : "border-warn/30 bg-warn-tint")
          : "btn-cta-gradient relative overflow-hidden rounded-xl p-5 text-white shadow-e2"
      }
    >
      {/* A couple of small decorative glimmers in the fine, unbroken state
          only — the "little star icons" from the reference. Aria-hidden and
          purely atmospheric, same as the entrance glow on the create page. */}
      {!warn && (
        <>
          <Sparkles
            aria-hidden
            className="pointer-events-none absolute top-3 right-3 size-4 opacity-70"
          />
          <Sparkles
            aria-hidden
            className="pointer-events-none absolute top-10 right-9 size-2.5 opacity-40"
          />
        </>
      )}
      <div className="flex items-start justify-between gap-2">
        <p
          className={
            "text-[0.6875rem] leading-none font-semibold tracking-[0.07em] uppercase " +
            (warn ? (zero ? "text-danger" : "text-warn") : "opacity-80")
          }
        >
          {zero ? "Out of credits" : low ? "Running low" : "Credits remaining"}
        </p>
        {warn && (
          <Zap className={`size-4 shrink-0 ${zero ? "text-danger" : "text-warn"}`} aria-hidden />
        )}
      </div>
      <p className="mt-3 flex items-baseline gap-1.5">
        <span
          className={`k-num text-2xl leading-none font-semibold tracking-tight ${warn ? "text-ink" : ""}`}
        >
          {formatCredits(balance)}
        </span>
        <span className={`text-[0.8125rem] ${warn ? "text-ink-2" : "opacity-90"}`}>credits</span>
      </p>

      {/* The real bar: balance as a share of everything ever added. Absent
          when nothing has ever been added (a state that should not happen —
          the signup grant always writes one — but is not worth crashing
          over). */}
      {remainingFraction !== null && (
        <div className="mt-3">
          <div className={`h-1.5 overflow-hidden rounded-full ${warn ? "bg-surface-3" : "bg-white/25"}`}>
            <div
              className="h-full rounded-full transition-[width] duration-[var(--t-3)]"
              style={{
                width: `${remainingFraction * 100}%`,
                background: warn ? "var(--ink-3)" : "white",
              }}
            />
          </div>
          <p className={`mt-1.5 text-[0.6875rem] ${warn ? "text-ink-3" : "opacity-80"}`}>
            <span className="k-num">{Math.round(remainingFraction * 100)}%</span> of the{" "}
            <span className="k-num">{formatCredits(totalEverAdded)}</span> credits you&apos;ve
            bought or been given.
          </p>
        </div>
      )}

      <p className={`mt-2 text-xs leading-relaxed ${warn ? "text-ink-2" : "opacity-95"}`}>
        {zero
          ? "The next build won't start until you add credits."
          : low
            ? "You may not have enough for another full build."
            : buildsLeft >= 1
              ? `About ${formatCredits(buildsLeft)} more ${buildsLeft === 1 ? "build" : "builds"}.`
              : "Not quite enough for a full build."}
      </p>
      <p className={`mt-1.5 text-[0.6875rem] leading-relaxed ${warn ? "text-ink-3" : "opacity-85"}`}>
        {measuredBuilds > 0
          ? `Measured from your own builds, averaging ${formatCredits(avgBuildCredits)} credits each.`
          : `Based on a typical build, about ${formatCredits(avgBuildCredits)} credits.`}{" "}
        Credits never expire and nothing renews.
      </p>

      {warn && canBuyCredits && (
        <div className="mt-3">
          <ButtonLink href="/dashboard/billing" variant={zero ? "danger" : "secondary"} size="xs">
            Buy credits
          </ButtonLink>
        </div>
      )}
    </div>
  );
}

// Four distinct icon-chip gradients for the top stat row — purely decorative
// hue variety (this is one row of equally-weighted facts, not a set of
// semantic states), so each pulls from the chart palette rather than the
// reserved --brand-gradient. "ok" is the one genuine semantic case (more
// credits you can still spend reads as a green fact), so it uses the real
// --ok token instead of a chart hue.
const STAT_TONES = {
  pink: "linear-gradient(135deg, var(--brand), var(--brand-hover))",
  purple: "linear-gradient(135deg, var(--brand-chart-2), #7a2be0)",
  peach: "linear-gradient(135deg, var(--brand-chart-3), var(--brand-chart-2))",
  ok: "linear-gradient(135deg, var(--ok), #0a6b45)",
} as const;

/** One of the plain stat cards in the top row. `info`, when given, is an
    InfoPopover — used only where the number needs a sentence of method
    explained, so it doesn't have to live in the card body permanently. */
function StatTile({
  icon,
  label,
  value,
  unit,
  detail,
  info,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  unit?: string;
  detail: ReactNode;
  info?: ReactNode;
  tone: keyof typeof STAT_TONES;
}) {
  return (
    <Card className="flex flex-col">
      <div className="mb-4 flex items-center justify-between">
        <span
          aria-hidden
          className="grid size-8 shrink-0 place-items-center rounded-md text-white shadow-[0_4px_12px_-4px_var(--glow)]"
          style={{ background: STAT_TONES[tone] }}
        >
          {icon}
        </span>
        {info}
      </div>
      <span className="k-label">{label}</span>
      <span className="mt-2 flex items-baseline gap-1.5">
        <span className="k-num text-2xl leading-none font-semibold tracking-tight text-ink">
          {value}
        </span>
        {unit != null && <span className="text-[0.8125rem] text-ink-3">{unit}</span>}
      </span>
      <span className="mt-2 text-xs text-ink-2">{detail}</span>
    </Card>
  );
}

/** One website's share of spend: the figure, a gradient bar against the
    largest single line, and the percentage of everything ever spent. Rows
    rather than a table because this column is a third of the page wide — a
    five-column table here would scroll sideways inside its own box on every
    screen. */
function SiteRow({
  name,
  credits,
  max,
  share,
  gradient,
  barLabel,
  footnote,
}: {
  name: ReactNode;
  credits: number;
  max: number;
  share: string;
  gradient: string;
  barLabel: string;
  footnote: ReactNode;
}) {
  const pct = Math.max(0, Math.min(100, (credits / max) * 100));
  return (
    <li>
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 text-sm">{name}</span>
        <span className="k-num shrink-0 text-sm font-medium whitespace-nowrap text-ink">
          {formatCredits(credits)}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div
          role="progressbar"
          aria-label={barLabel}
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3"
        >
          <div
            className="h-full rounded-full transition-[width] duration-[var(--t-3)]"
            style={{ width: `${pct}%`, background: gradient }}
          />
        </div>
        <span className="k-num w-9 shrink-0 text-right text-xs text-ink-3">{share}</span>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-ink-3">{footnote}</p>
    </li>
  );
}
