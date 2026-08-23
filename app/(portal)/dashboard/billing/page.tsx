import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Receipt } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  MICROS_PER_CREDIT,
  averageBuildCredits,
  estimateCredits,
  getBalance,
  getSpendCapStatus,
  spentInWindow,
} from "@/lib/credits";
import { CREDIT_PACKS, billingEnabled } from "@/lib/stripe";
import { ButtonLink, buttonClass } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHero } from "@/components/ui/PageHero";
import TopUpButton from "../TopUpButton";
import { SpendCapPanel } from "./SpendCapPanel";
import {
  describeReason,
  formatCredits,
  formatDay,
  formatTime,
  formatUsdCents,
  signedCredits,
} from "./ledger";

export const dynamic = "force-dynamic";

// The "— Kodely" suffix comes from the title template on the (portal) layout.
// This page previously inherited the MARKETING homepage title, so the tab for
// a customer's credit statement read "Kodely — AI Website Builder".
export const metadata: Metadata = { title: "Billing & credits" };

/* /dashboard/billing — the customer's own view of the ledger.
   ───────────────────────────────────────────────────────────────────────────
   READ-ONLY, end to end: this page never writes to CreditLedger, never grants
   or deducts, and the only money action it offers is the checkout owned by
   TopUpButton. The ledger is append-only and auditable by design (see
   prisma/schema.prisma and lib/credits.ts) — it was simply never shown to the
   person it is about.

   WHAT THIS PAGE REFUSES TO DRAW, because none of it exists:
     · a plan, a price per month, or a renewal date — checkout is one-off
       `payment` mode for credit packs (lib/stripe.ts), and nothing subscribes;
     · a saved payment method — only User.stripeCustomerId is stored and it is
       never read back from Stripe;
     · invoice history — no Stripe invoice is ever fetched. The statement below
       is the only history that exists, and it is a better one;
     · a credit reset date — credits never expire and the cap window rolls.
   The last card says all of that out loud rather than leaving the customer to
   wonder where their plan went. */

const PAGE_SIZE = 25;

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const cap = await getSpendCapStatus(user.id);

  const [balance, spent, avgBuildCredits, measuredBuilds, totalEntries] = await Promise.all([
    getBalance(user.id),
    // getSpendCapStatus skips the spend query when uncapped; this page needs it
    // either way. Same shape as app/(portal)/settings/page.tsx so both report
    // the number the cap actually enforces.
    cap.cap === null ? spentInWindow(user.id) : Promise.resolve(cap.spent),
    averageBuildCredits(user.id),
    // averageBuildCredits falls back to a global constant when a user has no
    // history. That constant is a reasonable default for "builds remaining" but
    // it is NOT a measurement of this person, so the tile below only shows an
    // average when this count says there is one.
    db.build.count({
      where: { project: { userId: user.id }, status: "SUCCEEDED", creditsCharged: { gt: 0 } },
    }),
    db.creditLedger.count({ where: { userId: user.id } }),
  ]);

  const pageCount = Math.max(1, Math.ceil(totalEntries / PAGE_SIZE));

  // hasOwnProperty rather than `in`: `?page=…` is attacker-controlled and a
  // prototype key ("constructor") must read as absent, not as a function.
  const params = await searchParams;
  const rawPage = Object.prototype.hasOwnProperty.call(params, "page") ? params.page : undefined;
  const requested = Number(typeof rawPage === "string" ? rawPage : Number.NaN);
  const page =
    Number.isInteger(requested) && requested >= 1 ? Math.min(requested, pageCount) : 1;

  const entries = await db.creditLedger.findMany({
    where: { userId: user.id },
    // Same ordering as getBalance in lib/credits.ts, with `id` as a stable
    // tiebreak — so the top row on page 1 IS the row that defines the balance.
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      createdAt: true,
      delta: true,
      reason: true,
      balanceAfter: true,
      build: {
        // repairAttempts + costMicros + creditsCharged are here for one reason,
        // spelled out in the chargeForBuild comment in lib/credits.ts: the
        // reason string stays exactly "build" even when rule 4 waived a repair,
        // so the waiver has to be read off the build row instead. Nothing here
        // is rendered as money — see the note where the row is drawn.
        select: {
          repairAttempts: true,
          costMicros: true,
          creditsCharged: true,
          project: { select: { id: true, name: true } },
        },
      },
    },
  });

  const canTopUp = billingEnabled();
  const create = estimateCredits("create");
  const edit = estimateCredits("edit");

  const firstIndex = totalEntries === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastIndex = (page - 1) * PAGE_SIZE + entries.length;

  return (
    <>
      <PageHero
        className="mb-6"
        icon={<Receipt className="size-5" aria-hidden />}
        title="Billing & credits"
        description={`${user.email} — billed per build, never per month.`}
        action={
          <ButtonLink href="/dashboard/usage" variant="secondary" size="sm">
            Usage breakdown
          </ButtonLink>
        }
      />

      {/* ── Two columns, same shape as the reference layout ─────────────────
          LEFT (wide): the two things a customer comes to this page to DO —
          add credits, and read the statement. That is where "Current Plan"
          and "Billing History" sat in the reference; the honest equivalents
          of both belong in the same visual slot, not demoted to a stacked
          afterthought.
          RIGHT (narrow): the account FACTS — balance, spend, cap, cost
          ranges — mirroring where "Your Subscription" and "Usage Summary"
          sat. Collapses to a single column below lg, right side first, so
          the account snapshot is what a phone sees before the tables. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:order-1 lg:col-span-2">
          {/* ── Adding credits ─────────────────────────────────────────── */}
          {/* The page's one ambient k-wash — the same treatment the
              dashboard home gives its welcome panel — because this is the
              hero moment on THIS page, the same visual weight a reference
              layout gave its "Current Plan" card. Content wrapped in its own
              `relative` div so it sits above the wash rather than under it. */}
          <Card className="relative overflow-hidden">
            <div className="k-wash" aria-hidden />
            <div className="relative">
              <CardHeader
                title="Add credits"
                description="One-off packs. A single payment each time — nothing subscribes, nothing renews, and no card is stored on your Kodely account."
              />

              {canTopUp ? (
              <>
                {/* Packs come from the server's own CREDIT_PACKS table so this
                    page cannot drift from what checkout will actually charge. */}
                <div className="k-scroll-x mt-5 rounded-lg border border-hair">
                  <table className="w-full min-w-xl text-left text-sm">
                    <caption className="sr-only">
                      The three credit packs, their prices and their price per credit.
                    </caption>
                    <thead>
                      <tr className="border-b border-hair">
                        <th scope="col" className="k-label px-4 py-2.5 font-semibold">
                          Pack
                        </th>
                        <th scope="col" className="k-label px-4 py-2.5 text-right font-semibold">
                          Credits
                        </th>
                        <th scope="col" className="k-label px-4 py-2.5 text-right font-semibold">
                          Price
                        </th>
                        <th scope="col" className="k-label px-4 py-2.5 text-right font-semibold">
                          Per credit
                        </th>
                        <th scope="col" className="k-label px-4 py-2.5 text-right font-semibold">
                          Your builds
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-hair">
                      {CREDIT_PACKS.map((pack) => (
                        <tr key={pack.id}>
                          <th scope="row" className="px-4 py-3 text-left font-medium text-ink">
                            {pack.label}
                          </th>
                          <td className="k-num px-4 py-3 text-right whitespace-nowrap text-ink">
                            {formatCredits(pack.credits)}
                          </td>
                          <td className="k-num px-4 py-3 text-right whitespace-nowrap text-ink">
                            {formatUsdCents(pack.priceUsdCents)}
                          </td>
                          <td className="k-num px-4 py-3 text-right whitespace-nowrap text-ink-2">
                            ${(pack.priceUsdCents / 100 / pack.credits).toFixed(3)}
                          </td>
                          <td className="k-num px-4 py-3 text-right whitespace-nowrap text-ink-2">
                            {measuredBuilds > 0
                              ? `about ${formatCredits(Math.floor(pack.credits / avgBuildCredits))}`
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <p className="mt-3 text-xs leading-relaxed text-ink-3">
                  {measuredBuilds > 0
                    ? "The last column is that pack divided by your own measured average build, rounded down. It is a guide, not an entitlement — a bigger site costs more than a smaller one."
                    : "The last column stays empty until you have been charged for a build. We would rather show nothing than divide by a number that isn't about you."}
                </p>

                <div className="mt-5 border-t border-hair pt-5">
                  <TopUpButton packs={CREDIT_PACKS.map((p) => ({ id: p.id, label: p.label }))} />
                </div>
              </>
              ) : (
                // Stripe is not configured on this deployment. Everything
                // else on this page still works — the statement below is
                // complete and unaffected.
                <div className="mt-4">
                  <TopUpButton enabled={false} />
                </div>
              )}
            </div>
          </Card>

          {/* ── The statement ──────────────────────────────────────────── */}
          <Card>
            <CardHeader
              title="Credit statement"
              description="Newest first. Every row is one entry in an append-only record — nothing here is ever edited or removed — and the balance column is your balance immediately after that entry."
            />

            {entries.length === 0 ? (
              <EmptyState
                className="mt-5"
                kind="empty"
                title="No credit activity yet"
                body="Nothing has been added to or taken from this account. Your welcome credits and every build you are charged for will appear here."
              />
            ) : (
              <div className="k-scroll-x mt-5 rounded-lg border border-hair">
                <table className="w-full min-w-xl text-left text-sm">
                  <caption className="sr-only">
                    Your credit entries, newest first, page {page} of {pageCount}
                  </caption>
                  <thead>
                    <tr className="border-b border-hair">
                      <th scope="col" className="k-label px-4 py-2.5 font-semibold">
                        When (UTC)
                      </th>
                      <th scope="col" className="k-label px-4 py-2.5 font-semibold">
                        What for
                      </th>
                      <th scope="col" className="k-label px-4 py-2.5 text-right font-semibold">
                        Change
                      </th>
                      <th scope="col" className="k-label px-4 py-2.5 text-right font-semibold">
                        Balance
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hair">
                    {entries.map((entry) => {
                      const what = describeReason(entry.reason, entry.delta);
                      const build = entry.build;
                      const project = build?.project ?? null;
                      // Deleting a project cascades its builds away and sets
                      // CreditLedger.buildId to NULL — the charge row stays
                      // (lib/retention.ts, NEVER_PRUNED). Say so rather than
                      // leaving a charge with nothing attached to it.
                      const secondary =
                        project === null && entry.reason === "build"
                          ? "The site this was for has since been deleted."
                          : what.detail;
                      // Rule 4 of the anti-bill-shock contract, read back off
                      // the build itself. Stated in credits, never in
                      // dollars: costMicros is our model spend, and the point
                      // here is what the CUSTOMER did not pay, not what we
                      // did.
                      const repaired =
                        build != null &&
                        build.repairAttempts > 0 &&
                        build.costMicros > build.creditsCharged * MICROS_PER_CREDIT;

                      return (
                        <tr key={entry.id}>
                          <td className="k-num px-4 py-3 align-top whitespace-nowrap text-ink-2">
                            {formatDay(entry.createdAt)}
                            <span className="block text-xs text-ink-3">
                              {formatTime(entry.createdAt)}
                            </span>
                          </td>
                          <td className="px-4 py-3 align-top">
                            <span className="block break-words text-ink">{what.label}</span>
                            {project ? (
                              <Link
                                href={`/projects/${project.id}`}
                                className="k-focus mt-0.5 block rounded-sm text-xs break-words text-ink-2 hover:text-brand"
                              >
                                {project.name}
                              </Link>
                            ) : secondary ? (
                              <span className="mt-0.5 block text-xs break-words text-ink-3">
                                {secondary}
                              </span>
                            ) : null}
                            {repaired && (
                              <span className="mt-0.5 block text-xs break-words text-ok">
                                Needed a repair pass — you weren&apos;t charged for it.
                              </span>
                            )}
                          </td>
                          <td
                            className={`k-num px-4 py-3 text-right align-top font-medium whitespace-nowrap ${
                              entry.delta > 0
                                ? "text-ok"
                                : entry.delta < 0
                                  ? "text-danger"
                                  : "text-ink-3"
                            }`}
                          >
                            {signedCredits(entry.delta)}
                          </td>
                          <td className="k-num px-4 py-3 text-right align-top whitespace-nowrap text-ink-2">
                            {formatCredits(entry.balanceAfter)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {totalEntries > 0 && (
              <nav
                aria-label="Credit statement pages"
                className="mt-4 flex flex-wrap items-center justify-between gap-3"
              >
                <p className="text-xs text-ink-3">
                  Showing <span className="k-num">{firstIndex}</span>–
                  <span className="k-num">{lastIndex}</span> of{" "}
                  <span className="k-num">{formatCredits(totalEntries)}</span>
                </p>
                <div className="flex items-center gap-2">
                  <PageLink page={page - 1} disabled={page <= 1} rel="prev">
                    ← Newer
                  </PageLink>
                  <PageLink page={page + 1} disabled={page >= pageCount} rel="next">
                    Older →
                  </PageLink>
                </div>
              </nav>
            )}

            <p className="mt-4 text-xs leading-relaxed text-ink-3">
              A build only reaches this statement if it succeeded and had measured model cost. A
              build that fails is recorded with its true cost and charged nothing, so it never
              appears here.
            </p>
          </Card>
        </div>

        <div className="flex flex-col gap-4 lg:order-2">
          {/* ── Where you stand ────────────────────────────────────────── */}
          <Card>
            <CardHeader title="Your account" />
            <div className="mt-4 flex flex-col divide-y divide-hair">
              <FactRow
                label="Credits left"
                value={`${formatCredits(balance)} credits`}
                detail={
                  balance === 0
                    ? "You're out of credits. Nothing expired — this is simply what's left."
                    : "Credits never expire and nothing renews."
                }
              />
              <FactRow
                label="Used · last 30 days"
                value={`${formatCredits(spent)} credits`}
                detail="A rolling window, not a calendar month. There is no reset day."
              />
              <FactRow
                label="Your average build"
                value={measuredBuilds > 0 ? `${formatCredits(avgBuildCredits)} credits` : "—"}
                detail={
                  measuredBuilds > 0
                    ? `Measured across ${formatCredits(measuredBuilds)} charged builds.`
                    : "Nothing measured yet — you haven't been charged for a build."
                }
              />
              <FactRow
                label="Statement entries"
                value={formatCredits(totalEntries)}
                detail="Every credit that has ever moved on this account."
              />
            </div>
          </Card>

          {/* ── The one real control over spend ────────────────────────── */}
          <SpendCapPanel cap={cap.cap} spent={spent} />

          {/* ── What a build costs ─────────────────────────────────────── */}
          <Card>
            <CardHeader
              title="What a build costs"
              description="Metered after a build succeeds — never a flat guess up front."
            />
            <p className="mt-4 text-sm leading-relaxed text-ink-2">
              If a build doesn&apos;t compile, Kodely repairs it and tries again for free: you&apos;re
              charged for your original attempt only.
            </p>

            <dl className="mt-5 flex flex-col gap-3">
              <RangeRow term="Building a new site" low={create.low} high={create.high} />
              <RangeRow term="Making an edit" low={edit.low} high={edit.high} />
            </dl>

            <p className="mt-4 text-xs leading-relaxed text-ink-3">
              Wide brackets, not predictions — drawn from only two builds measured end to end
              (<span className="k-num">144</span> and <span className="k-num">472</span> credits).
              The numbers in your statement are the ones actually about you.
            </p>
          </Card>

          {/* ── The things a billing page usually has, and this one does
              not — kept in the RIGHT column, the same slot the reference's
              "Your Subscription" panel occupied, so the honest refusal sits
              exactly where the fabricated version would have. ───────────── */}
          <EmptyState
            kind="unavailable"
            title="No plan, invoice or saved card"
            body="No subscription, no tier, no renewal date, nothing to downgrade. Payments are single charges for credit packs — no Stripe invoices to list, and your card stays with Stripe. The statement is the complete record."
          />
        </div>
      </div>
    </>
  );
}

/** One fact in the "Your account" panel — a label/value pair with a
    supporting line, stacked rather than in a stat grid because this column
    is one third of the page wide at most; a StatRow here would wrap badly. */
function FactRow({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-ink-2">{label}</span>
        <span className="k-num text-sm font-semibold text-ink">{value}</span>
      </div>
      <p className="text-xs leading-relaxed text-ink-3">{detail}</p>
    </div>
  );
}

function RangeRow({ term, low, high }: { term: string; low: number; high: number }) {
  return (
    <div className="rounded-lg border border-hair bg-surface-2 p-4">
      <dt className="k-label">{term}</dt>
      <dd className="mt-2 text-sm text-ink">
        somewhere between <span className="k-num font-medium">{formatCredits(low)}</span> and{" "}
        <span className="k-num font-medium">{formatCredits(high)}</span> credits
      </dd>
    </div>
  );
}

function PageLink({
  page,
  disabled,
  rel,
  children,
}: {
  page: number;
  disabled: boolean;
  rel: "prev" | "next";
  children: ReactNode;
}) {
  if (disabled) {
    // A span, not a disabled link: there is nothing to navigate to, so there is
    // nothing that should take focus or be announced as a control.
    return (
      <span
        aria-hidden
        className={buttonClass({ variant: "ghost", size: "xs", className: "opacity-40" })}
      >
        {children}
      </span>
    );
  }

  return (
    <ButtonLink
      href={page <= 1 ? "/dashboard/billing" : `/dashboard/billing?page=${page}`}
      rel={rel}
      aria-label={rel === "prev" ? "Newer entries" : "Older entries"}
      variant="secondary"
      size="xs"
    >
      {children}
    </ButtonLink>
  );
}
