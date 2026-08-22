import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowDownRight,
  ArrowUpRight,
  Code2,
  Eye,
  Gauge,
  Hammer,
  History,
  Receipt,
  Rocket,
  Sparkles,
  UploadCloud,
  Wrench,
  XCircle,
  Zap,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSpendCapStatus, averageBuildCredits, getBalance, spentInWindow } from "@/lib/credits";
import { ButtonLink } from "@/components/ui/Button";
import { Card, CardHeader, SectionHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Progress } from "@/components/ui/Progress";
import { Stat } from "@/components/ui/Stat";
import { SpendCapPanel } from "../billing/SpendCapPanel";
import { formatCredits, formatDay } from "../billing/ledger";
import {
  accountSpanDays,
  dailySpend,
  groupBuckets,
  ledgerTotals,
  monthToDate,
  mtdBuildKind,
  notCharged,
  previousWindowSpend,
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
   The brief for this screen asked for storage, bandwidth, a plan allowance and
   a reset date. None of the four exist (docs/design-system.md, "What does not
   exist"), so none of the four are drawn here. What IS real turns out to be
   more useful anyway: every credit ever charged is a successful build, every
   build belongs to a website, and both facts are already in the database.

   Every figure on this page is in CREDITS. Build.costMicros is real model
   spend — the cost side of the retail prices in lib/stripe.ts — and it is used
   only inside the arithmetic in ./data.ts, never rendered as money.

   WHAT A VISUAL REFERENCE FOR THIS PAGE SHOWED, and what stands in its place:
     1. "75% of 1,000 monthly credits" / "resets in 18 days" — there is no
        allowance to be a percentage of and no reset date. In that exact slot,
        the gradient card instead shows the customer's own SPEND CAP when one
        is set (a real number, a real rolling-30-day bar against it) and a
        plain sentence when it isn't. Uncapped is not hidden behind a fake bar.
     2. A donut splitting spend across successful, failed and "other" builds —
        impossible here, since a failed build is charged zero (chargeForBuild
        is only reached on the SUCCEEDED path in app/api/generate/route.ts),
        which would draw one 100% slice and two empty ones. SpendKindDonut.tsx
        draws the real split instead: each project's first charged build
        ("new sites") against every build after it ("edits") — a genuine
        category recovered from data that already exists, not invented to
        fill the shape.
     3. A "you're using less than last month!" banner, shown unconditionally —
        here it only renders when `spendingLess` is true, i.e. spend really is
        down by a real margin against a real comparable prior window. Spend
        going up is exactly as likely as it going down, and a banner that
        would still be praising an increase is worse than no banner.
     4. Six "what's free" tiles naming things Kodely does not have (custom
        domains, team invites) — the tiles below name six things that ARE
        free and real: editing, previewing, publishing, version history, a
        failed build, and a repaired one. */

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
    waived,
    dayBuckets,
    trend,
    mtd,
    mtdKind,
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
    notCharged(user.id),
    dailySpend(user.id, days),
    previousWindowSpend(user.id),
    monthToDate(user.id),
    mtdBuildKind(user.id),
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
  // of, which is exactly why none of the three draws a bar.
  const buildsLeft = avgBuildCredits > 0 ? Math.floor(balance / avgBuildCredits) : 0;

  // Only computed when the account lived through the whole earlier window, and
  // only expressed as a percentage when there is a non-zero base to divide by.
  const delta =
    trend.comparable && trend.previous > 0
      ? Math.round(((spent - trend.previous) / trend.previous) * 100)
      : null;

  // A congratulatory banner, ONLY when there is something real to congratulate.
  // A visual reference for this page showed one unconditionally ("great job
  // optimizing your builds!") — that is not available here: it would have to
  // be true, and spend going up is exactly as likely as it going down. Below
  // a token threshold the change is noise, not a trend, so nothing is shown
  // rather than praising a 1% wobble.
  const spendingLess = delta !== null && delta <= -5;

  return (
    <>
      <SectionHeader
        as="h1"
        title="Usage & Credits"
        description="Track your AI credits usage and build activity."
        action={
          <ButtonLink href="/dashboard/billing" variant="secondary" size="sm">
            Billing &amp; statements
          </ButtonLink>
        }
      />

      {/* ── Where you stand ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {/* The one gradient fill this page contributes, and the reason the
            gradient rule in docs/design-system.md now names four places. No
            bar, no percentage, no reset: credits are bought in packs and never
            expire, so a denominator would have to be invented. The number and
            what it buys is the whole truth available — the same sentence the
            rail beside this page is already showing. */}
        <div className="btn-cta-gradient relative overflow-hidden rounded-xl p-5 text-white shadow-e2">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[0.6875rem] leading-none font-semibold tracking-[0.07em] uppercase opacity-80">
              Credits left
            </p>
            <Zap className="size-4 shrink-0 opacity-80" aria-hidden />
          </div>
          <p className="mt-3 flex items-baseline gap-1.5">
            <span className="k-num text-2xl leading-none font-semibold tracking-tight">
              {formatCredits(balance)}
            </span>
            <span className="text-[0.8125rem] opacity-90">credits</span>
          </p>
          <p className="mt-2 text-xs leading-relaxed opacity-95">
            {balance <= 0
              ? "Out of credits — the next build won't start until you top up."
              : buildsLeft >= 1
                ? `About ${formatCredits(buildsLeft)} more ${buildsLeft === 1 ? "build" : "builds"}.`
                : "Not quite enough for a full build."}
          </p>
          <p className="mt-1.5 text-[0.6875rem] leading-relaxed opacity-85">
            {measuredBuilds > 0
              ? `Measured from your own builds, averaging ${formatCredits(avgBuildCredits)} credits each.`
              : `Based on a typical build, about ${formatCredits(avgBuildCredits)} credits.`}{" "}
            Credits never expire and nothing renews.
          </p>

          {/* A bar in this exact slot ONLY when there is something real for it
              to measure. A visual reference showed one unconditionally
              ("75% of 1,000 monthly credits") — there is no monthly
              allowance to be a percentage of, so that number cannot exist
              here. What genuinely fills this shape is the customer's OWN
              spend cap, when they have set one: a real ceiling, a real
              rolling-30-day spend against it. Uncapped, the bar is omitted
              rather than faked — see the plain sentence below instead. */}
          {cap.cap !== null ? (
            <div className="mt-3 border-t border-white/20 pt-3">
              <div className="flex items-baseline justify-between text-[0.6875rem] opacity-90">
                <span>Your spend cap</span>
                <span className="k-num">
                  {formatCredits(spent)} / {formatCredits(cap.cap)}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/25">
                <div
                  className="h-full rounded-full bg-white"
                  style={{ width: `${Math.min(100, (spent / cap.cap) * 100)}%` }}
                />
              </div>
              <p className="mt-1.5 text-[0.625rem] opacity-80">
                Rolling 30 days, not a monthly reset —{" "}
                <a href="/settings/credits" className="underline underline-offset-2">
                  edit your cap
                </a>
                .
              </p>
            </div>
          ) : (
            <p className="mt-3 border-t border-white/20 pt-3 text-[0.625rem] leading-relaxed opacity-80">
              No spend cap set —{" "}
              <a href="/settings/credits" className="underline underline-offset-2">
                add one
              </a>{" "}
              to put a ceiling on a long session.
            </p>
          )}
        </div>

        <StatTile
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
              A rolling window measured to the hour, not a calendar month. There is no reset day.
              {delta === null && trend.comparable && trend.previous === 0
                ? " Nothing was spent in the 30 days before this one, so there is no change to quote."
                : ""}
            </>
          }
        />

        <StatTile
          icon={<Gauge className="size-4" aria-hidden />}
          label="Your average build"
          value={measuredBuilds > 0 ? formatCredits(avgBuildCredits) : "—"}
          unit={measuredBuilds > 0 ? "credits" : undefined}
          detail={
            measuredBuilds > 0
              ? `Measured across your recent builds — ${formatCredits(measuredBuilds)} charged so far.`
              : "Nothing measured yet. You haven't been charged for a build."
          }
        />

        <StatTile
          icon={<Hammer className="size-4" aria-hidden />}
          label="Builds this month"
          value={formatCredits(mtd.builds)}
          unit={mtd.builds === 1 ? "build" : "builds"}
          detail={`Charged builds since 1 ${MONTH.format(new Date(mtd.start))} (UTC). A calendar count for orientation — nothing resets on the 1st.`}
        />

        <StatTile
          icon={<Rocket className="size-4" aria-hidden />}
          label="Builds you can afford"
          value={formatCredits(buildsLeft)}
          unit="more"
          detail={
            measuredBuilds > 0
              ? "At your own measured average. A bigger site costs more than a smaller one."
              : "Based on a typical Kodely build, not on you — you haven't had one charged yet, so there is nothing of your own to measure."
          }
        />
      </div>

      {/* ── The two-column body ─────────────────────────────────────────── */}
      <div className="mt-4 grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card>
            <CardHeader
              title="Credits over time"
              description="Only successful, metered builds are charged, so only those appear."
              action={
                <RangeTabs
                  value={rangeKey}
                  allLabel={span === null ? "All time" : `All time`}
                />
              }
            />

            <UsageChart buckets={buckets} days={days} rangeLabel={rangeLabel} />

            <p className="mt-4 text-xs leading-relaxed text-ink-3">
              These bars are UTC calendar {days > WEEKLY_ABOVE_DAYS ? "weeks" : "days"}; the
              &ldquo;credits spent&rdquo; figure above is a rolling window measured to the hour.
              The two totals can differ by up to one{" "}
              {days > WEEKLY_ABOVE_DAYS ? "week" : "day"}&apos;s spend, and that is the reason —
              neither is an estimate.
            </p>

            {/* Only appears when it is true. See `spendingLess` above — this
                is the one place a visual reference for this page showed an
                unconditional "great job!" banner. */}
            {spendingLess && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ok/30 bg-ok-tint px-4 py-3">
                <p className="flex items-start gap-2 text-sm text-ok">
                  <Sparkles className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>
                    You spent <span className="k-num font-medium">{Math.abs(delta ?? 0)}%</span>{" "}
                    less than the 30 days before this one.
                  </span>
                </p>
              </div>
            )}
          </Card>

          {/* Same left-column slot a visual reference for this page put its
              spending cap in — moved here from below the grid so the two
              match. */}
          <SpendCapPanel cap={cap.cap} spent={spent} />
        </div>

        <div className="flex flex-col gap-4">
          {/* ── This calendar month — a real donut, not a fabricated one ─── */}
          <Card>
            <CardHeader
              title="Usage this month"
              description={`1–${mtd.daysElapsed} ${MONTH.format(new Date(mtd.start))}, UTC.`}
            />
            <div className="mt-5">
              <SpendKindDonut
                createCredits={mtdKind.createCredits}
                editCredits={mtdKind.editCredits}
              />
            </div>
            <p className="mt-4 text-xs leading-relaxed text-ink-3">
              A month boundary is a convenient way to read this and nothing more. Nothing resets
              on the 1st: credits never expire and there is no monthly allowance.
            </p>
          </Card>

          {/* ── Per-website attribution ─────────────────────────────────── */}
          <Card>
            <CardHeader
              title="Where your credits went"
              description="Every charge on this account is one successful site build, grouped by the website it built."
            />

            {sites.length === 0 && orphaned === 0 ? (
              <EmptyState
                className="mt-5"
                kind="empty"
                title="Nothing charged yet"
                body="You haven't been charged for a build, so there is nothing to break down. Build something and this fills in on its own."
                action={
                  <ButtonLink href="/dashboard/new" variant="secondary" size="sm">
                    Create a website
                  </ButtonLink>
                }
              />
            ) : (
              <>
                <ul className="mt-5 flex flex-col gap-4">
                  {sites.map((site) => (
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
                      tone="brand"
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
                      tone="neutral"
                      barLabel={`Deleted websites: ${formatCredits(orphaned)} credits`}
                      footnote="Their build records are gone, so these charges can no longer be pointed at a site — but the credits really were spent, so they stay on your statement."
                    />
                  )}
                </ul>

                <p className="mt-4 text-xs leading-relaxed text-ink-3">
                  Shares are of <span className="k-num">{formatCredits(totals.spent)}</span> credits
                  spent in total, against <span className="k-num">{formatCredits(totals.added)}</span>{" "}
                  ever added (welcome credits, top-ups and rewards combined).
                </p>
              </>
            )}
          </Card>
        </div>
      </div>

      {/* ── The bills that never arrived ────────────────────────────────── */}
      <section className="mt-6">
        <SectionHeader
          title="What isn't charged"
          description="Six real things, in the same six-tile shape a visual reference for this page used — theirs named a couple of features Kodely doesn't have (custom domains, team invites); these are the ones that are actually true and actually free."
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <WaivedTile
            icon={<Code2 className="size-4" aria-hidden />}
            label="Editing code"
            value="Free"
            detail="Manual edits in the editor — brand, SEO, anything you change by hand — never touch your credit balance."
          />
          <WaivedTile
            icon={<Eye className="size-4" aria-hidden />}
            label="Previewing your site"
            value="Free"
            detail="The live preview in the builder runs as often as you like, before you publish anything."
          />
          <WaivedTile
            icon={<UploadCloud className="size-4" aria-hidden />}
            label="Publishing your site"
            value="Free"
            detail="Going live is a separate action from asking the AI to build — it never charges credits on its own."
          />
          <WaivedTile
            icon={<History className="size-4" aria-hidden />}
            label="Version history"
            value="Free"
            detail="Viewing or restoring an earlier build costs nothing — undo is not a second build."
          />
          <WaivedTile
            icon={<XCircle className="size-4" aria-hidden />}
            label="Builds that failed"
            value={formatCredits(waived.failedBuilds)}
            detail="Recorded at their true cost and charged zero credits. A build you can't use is never a build you pay for."
          />
          <WaivedTile
            icon={<Wrench className="size-4" aria-hidden />}
            label="Builds we repaired"
            value={formatCredits(waived.repairedBuilds)}
            detail={`Didn't compile first time. You were charged for your original attempt only — ${formatCredits(waived.repairWaivedCredits)} credits absorbed on repairs so far.`}
          />
        </div>
      </section>

      {/* ── Say plainly what is not measured ────────────────────────────── */}
      <div className="mt-4">
        <EmptyState
          kind="unavailable"
          title="Storage and bandwidth aren't measured"
          body="Nothing in Kodely records how much disk your sites take up or how much traffic they serve, so there is no honest number to put here. Credits are the only thing this account meters — and there is no plan, allowance or renewal date behind them either."
        />
      </div>
    </>
  );
}

/** One of the four plain stat cards in the top row. The icon chip is
    decorative — it carries no status, which is why it is brand tint rather
    than an `ok`/`warn` tint that would imply one. */
function StatTile({
  icon,
  label,
  value,
  unit,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  unit?: string;
  detail: ReactNode;
}) {
  return (
    <Card className="flex flex-col">
      <span
        aria-hidden
        className="mb-4 grid size-8 shrink-0 place-items-center rounded-md bg-brand-tint text-brand-ink dark:text-brand"
      >
        {icon}
      </span>
      <Stat label={label} value={value} unit={unit} detail={detail} />
    </Card>
  );
}

/** One tile in the bottom "what isn't charged" strip. */
function WaivedTile({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: ReactNode;
}) {
  return (
    <Card className="flex items-start gap-3">
      <span
        aria-hidden
        className="grid size-9 shrink-0 place-items-center rounded-md bg-surface-2 text-ink-2"
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <Stat label={label} value={value} detail={detail} />
      </div>
    </Card>
  );
}

/** One website's share of spend: the figure, a bar against the largest single
    line, and the percentage of everything ever spent. Rows rather than a table
    because this column is a third of the page wide — a five-column table here
    would scroll sideways inside its own box on every screen. */
function SiteRow({
  name,
  credits,
  max,
  share,
  tone,
  barLabel,
  footnote,
}: {
  name: ReactNode;
  credits: number;
  max: number;
  share: string;
  tone: "brand" | "neutral";
  barLabel: string;
  footnote: ReactNode;
}) {
  return (
    <li>
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 text-sm">{name}</span>
        <span className="k-num shrink-0 text-sm font-medium whitespace-nowrap text-ink">
          {formatCredits(credits)}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Progress className="flex-1" size="sm" tone={tone} value={credits} max={max} label={barLabel} />
        <span className="k-num w-9 shrink-0 text-right text-xs text-ink-3">{share}</span>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-ink-3">{footnote}</p>
    </li>
  );
}
