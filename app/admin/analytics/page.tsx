import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminUser } from "@/lib/auth";
import { MICROS_PER_CREDIT } from "@/lib/credits";
import { CREDIT_PACKS } from "@/lib/stripe";
import { EVENTS } from "@/lib/events";
import {
  costByWeek,
  creditLiability,
  eventCoverage,
  population,
  realisedRevenue,
  signupCohorts,
  WEEKS_BACK,
} from "./queries";
import {
  Bar,
  BarRow,
  Caveat,
  Empty,
  HeatCell,
  Panel,
  StatTile,
  TableFrame,
  Td,
  Th,
  formatCents,
  formatInt,
  formatUsd,
  pct,
  weekLabel,
} from "./ui";

export const dynamic = "force-dynamic";

/**
 * Metrics the board asked for that this codebase cannot honestly produce.
 *
 * This list is the most important thing on the page. Kodely sells one-time
 * credit packs (`mode: "payment"` in app/api/billing/checkout, CREDIT_PACKS in
 * lib/stripe.ts); there is no subscription model anywhere in the schema or the
 * code. Three of the five requested metrics are therefore not "hard to compute"
 * — they are undefined for this product, and a dashboard that showed them
 * anyway would be confidently wrong in a way nobody could catch by looking.
 */
const REFUSED = [
  {
    metric: "MRR / ARR",
    verdict: "Undefined",
    why: "There is no recurring revenue to annualise. Every payment is a one-time credit pack — no Stripe subscription, price, or renewal exists in the schema or the code. Averaging one-time purchases per month and calling the result MRR would invent a recurring stream that no customer has agreed to, and would keep reporting it in a month where nobody buys anything.",
  },
  {
    metric: "Churn",
    verdict: "Undefined",
    why: "Churn is the rate of cancelling a recurring commitment, and there is nothing here to cancel. Someone who bought credits and stopped building has not churned — they hold a paid-for balance they can spend any time, which is why it appears below as a liability rather than as a lost customer. The honest analogue is the cohort activity grid, which measures whether people came back to build.",
  },
  {
    metric: "CAC",
    verdict: "Uncomputable",
    why: "Nothing in this codebase records marketing spend, and nothing records acquisition attribution — the two acquisition events that would have carried a source were removed from lib/events.ts on 2026-08-22 because no beacon ever fired them. There is no number to divide, and no denominator to divide it by.",
  },
  {
    metric: "LTV",
    verdict: "Partial — realised only",
    why: "Realised revenue per user to date is computable and is shown below. A projected lifetime value is not: projecting it needs a repeat-purchase rate and a retention curve, and with the purchase history this database currently holds, any curve fitted to it would be a decoration.",
  },
] as const;

export default async function AdminAnalyticsPage() {
  // Defense in depth — app/admin/layout.tsx is the primary gate, but a layout
  // is not an authorization boundary on its own. 404 rather than redirect, so a
  // non-admin learns nothing about this path. Same idiom as every other page in
  // this section.
  if (!(await getAdminUser())) notFound();

  const declaredEvents = Object.values(EVENTS) as string[];

  const [revenue, weeks, liability, cohortData, coverage, pop] = await Promise.all([
    realisedRevenue(),
    costByWeek(),
    creditLiability(),
    signupCohorts(),
    eventCoverage(declaredEvents),
    population(),
  ]);

  // Costs are IMPUTED, not billed, whenever the SDK engine is selected: the
  // token counts are real but no money moves, because generation runs on a
  // Claude subscription rather than the metered API. See the header comment in
  // lib/agent-sdk.ts. This is read per request (the page is force-dynamic), so
  // flipping the env var is reflected without a rebuild.
  const engine = (process.env.KODELY_ENGINE ?? "api").toLowerCase();
  const imputed = engine === "sdk";
  const costWord = imputed ? "imputed cost" : "cost";

  const totalCostMicros = weeks.reduce((s, w) => s + w.costMicros, 0);
  const totalRecoveredMicros = weeks.reduce((s, w) => s + w.recoveredMicros, 0);
  const totalFreeCostMicros = weeks.reduce((s, w) => s + w.freeCostMicros, 0);
  const totalBuilds = weeks.reduce((s, w) => s + w.builds, 0);
  const meterDeltaMicros = totalRecoveredMicros - totalCostMicros;

  const maxWeekCost = Math.max(1, ...weeks.map((w) => Math.max(w.costMicros, w.recoveredMicros)));
  const maxWeekRevenue = Math.max(1, ...revenue.weeks.map((w) => w.cents));

  const ledgerDrift = liability.outstanding !== liability.outstandingFromDeltas;
  const retentionOffsets = Array.from({ length: Math.min(cohortData.maxOffset + 1, 8) }, (_, i) => i);

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <Link
          href="/admin"
          className="text-xs text-black/50 underline-offset-4 hover:underline dark:text-white/50"
        >
          ← kodely admin
        </Link>
        <div className="mt-1 text-lg font-semibold tracking-tight">Revenue &amp; retention</div>
        <p className="text-sm text-black/60 dark:text-white/60">
          Read-only. Realised money, committed credit obligations, and what each signup cohort
          actually did — plus an explicit list of the metrics this product cannot honestly report.
        </p>
      </div>

      {/* ── Headline figures ─────────────────────────────────────────── */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile
          label="Realised revenue"
          value={formatCents(revenue.totalCents)}
          hint={`${formatInt(revenue.totalPurchases)} purchase${revenue.totalPurchases === 1 ? "" : "s"}, gross of Stripe fees`}
          tone={revenue.totalCents === 0 ? "muted" : undefined}
        />
        <StatTile
          label="Paying users"
          value={formatInt(revenue.payingUsers)}
          hint={`${pct(revenue.payingUsers, pop.users)} of ${formatInt(pop.users)} signups`}
          tone={revenue.payingUsers === 0 ? "muted" : undefined}
        />
        <StatTile
          label="Revenue per signup"
          value={formatCents(pop.users > 0 ? revenue.totalCents / pop.users : 0)}
          hint="Realised to date. Not a projected LTV."
          tone={revenue.totalCents === 0 ? "muted" : undefined}
        />
        <StatTile
          label="Credit liability"
          value={formatInt(liability.outstanding)}
          hint={`${formatUsd(liability.micros)} of future model spend owed`}
        />
        <StatTile
          label="Deferred revenue"
          value={formatInt(liability.paidOutstanding)}
          hint="Purchased credits not yet spent"
          tone={liability.paidOutstanding === 0 ? "muted" : undefined}
        />
      </div>

      {/* ── The refusals ─────────────────────────────────────────────── */}
      <div className="mb-6">
        <Panel
          title="Not computed, and why"
          subtitle="Kodely sells one-time credit packs. There is no subscription anywhere in the schema or the code, so three of the five requested metrics are undefined rather than merely missing."
          footnote={
            <>
              If Kodely ever launches a subscription plan, MRR and churn become well-defined and
              belong here. Until then a number in these rows would be a decoration that survives
              scrutiny only because nobody checks it.
            </>
          }
        >
          <TableFrame>
            <thead>
              <tr className="border-b border-black/10 text-xs text-black/50 dark:border-white/10 dark:text-white/50">
                <Th>Metric</Th>
                <Th>Verdict</Th>
                <Th>Why</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/10 dark:divide-white/10">
              {REFUSED.map((r) => (
                <tr key={r.metric}>
                  <td className="whitespace-nowrap px-4 py-3 align-top font-medium">{r.metric}</td>
                  <td className="whitespace-nowrap px-4 py-3 align-top text-amber-700 dark:text-amber-400">
                    {r.verdict}
                  </td>
                  <td className="px-4 py-3 align-top text-black/70 dark:text-white/70">{r.why}</td>
                </tr>
              ))}
            </tbody>
          </TableFrame>
        </Panel>
      </div>

      {/* ── Revenue ──────────────────────────────────────────────────── */}
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Panel
          title="Realised revenue by week"
          subtitle="Paid credit packs, priced from CREDIT_PACKS. The ledger stores credits, not dollars — see the note below."
          footnote={
            <>
              The Stripe webhook writes a top-up as <code>delta = pack.credits</code> with{" "}
              <code>reason = &ldquo;stripe:&lt;session id&gt;&rdquo;</code>, so the only bridge from
              the ledger back to money is the credit count. That is unambiguous today because the
              three packs have distinct sizes ({CREDIT_PACKS.map((p) => formatInt(p.credits)).join(" / ")}
              ), and any row matching no pack is reported as unattributed rather than guessed at.
              Figures are gross list price: Stripe fees are recorded nowhere in this database, and a
              refund issued in the Stripe dashboard writes nothing here, so neither is deducted.
            </>
          }
        >
          {revenue.weeks.length === 0 ? (
            <Empty>
              No credit pack has ever been purchased. Realised revenue is{" "}
              <span className="tabular-nums">$0.00</span> — not missing data, an empty ledger: no
              row in <code>CreditLedger</code> has a <code>stripe:</code> reason.
            </Empty>
          ) : (
            <ul className="space-y-2.5">
              {revenue.weeks.map((w) => (
                <BarRow
                  key={w.week.getTime()}
                  label={<span className="tabular-nums">{weekLabel(w.week)}</span>}
                  value={w.cents}
                  max={maxWeekRevenue}
                  right={
                    <>
                      {formatCents(w.cents)}
                      <span className="ml-2 text-xs text-black/40 dark:text-white/40">
                        {w.purchases}×
                      </span>
                    </>
                  }
                />
              ))}
            </ul>
          )}

          {revenue.unattributedPurchases > 0 ? (
            <p className="mt-3 text-xs text-amber-700 dark:text-amber-400">
              {revenue.unattributedPurchases} purchase
              {revenue.unattributedPurchases === 1 ? "" : "s"} could not be priced: the credit
              delta matches no pack currently in CREDIT_PACKS. Counted, deliberately not valued.
            </p>
          ) : null}
        </Panel>

        <Panel
          title="What sells"
          subtitle="Lifetime purchases per pack, at list price."
          footnote="Per-credit price falls with pack size (1.80c / 1.60c / 1.50c) against a 0.20c cost basis, so pack mix moves gross margin. That comparison only becomes meaningful once packs actually sell."
        >
          {revenue.byPack.length === 0 ? (
            <Empty>Nothing sold yet, so there is no mix to compare.</Empty>
          ) : (
            <ul className="space-y-2.5">
              {revenue.byPack.map((p) => (
                <BarRow
                  key={p.id}
                  label={p.label}
                  value={p.cents}
                  max={Math.max(1, ...revenue.byPack.map((x) => x.cents))}
                  right={
                    <>
                      {formatCents(p.cents)}
                      <span className="ml-2 text-xs text-black/40 dark:text-white/40">
                        {p.purchases}×
                      </span>
                    </>
                  }
                />
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* ── The imputed-cost caveat, immediately above the cost figures ── */}
      {imputed ? (
        <div className="mb-4">
          <Caveat title="Every cost figure below is imputed, not billed">
            <p>
              <code>KODELY_ENGINE=sdk</code>, so generation runs on a Claude subscription rather
              than the metered API (see the header comment in <code>lib/agent-sdk.ts</code>). Token
              counts are real — they come from the SDK&apos;s own <code>modelUsage</code> — but they
              are priced against the API rate card to answer &ldquo;what would this have cost on
              metered billing?&rdquo;. <strong>No money moved.</strong> Treat these as a model of
              future unit economics, never as spend.
            </p>
            <p>
              The <code>Build</code> table records no engine, so builds produced under the metered
              API cannot be separated from these. The whole series is therefore marked imputed
              rather than only the rows that are — which overstates the caveat rather than
              understating it, the correct direction to be wrong in.
            </p>
          </Caveat>
        </div>
      ) : null}

      {/* ── Cost and meter recovery ──────────────────────────────────── */}
      <div className="mb-6">
        <Panel
          title={`Generation ${costWord} and meter recovery by week`}
          subtitle={`Last ${WEEKS_BACK} weeks. Solid bar is ${costWord}; the figure beside it is what the credit meter recovered.`}
          footnote={
            <>
              <strong>This is not gross margin.</strong> <code>MICROS_PER_CREDIT</code> is a cost
              basis, not a price — <code>creditsFor()</code> in lib/credits.ts is literally{" "}
              <code>ceil(costMicros / MICROS_PER_CREDIT)</code>, so{" "}
              <code>creditsCharged × MICROS_PER_CREDIT</code> minus cost can only ever return
              rounding noise. What it does measure, usefully, is whether the meter recovered the
              spend it metered. Real margin is realised when credits are <em>sold</em> (1.5–1.8c per
              credit against a 0.2c basis), which is the revenue panel above.{" "}
              <span className="whitespace-nowrap">Given away:</span> {formatUsd(totalFreeCostMicros, 4)}{" "}
              of {costWord} on builds charged zero credits — failed builds, which are never billed
              by design, plus runs with no telemetry.
            </>
          }
        >
          {weeks.length === 0 ? (
            <Empty>No builds in the last {WEEKS_BACK} weeks.</Empty>
          ) : (
            <TableFrame>
              <thead>
                <tr className="border-b border-black/10 text-xs text-black/50 dark:border-white/10 dark:text-white/50">
                  <Th>Week</Th>
                  <Th align="right">Builds</Th>
                  <Th align="right">OK / failed</Th>
                  <Th align="right">{imputed ? "Imputed cost" : "Cost"}</Th>
                  <Th align="right">Credits charged</Th>
                  <Th align="right" title="creditsCharged × MICROS_PER_CREDIT">
                    Recovered
                  </Th>
                  <Th align="right" title="Cost of builds charged zero credits">
                    Given away
                  </Th>
                  <Th>&nbsp;</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/10 dark:divide-white/10">
                {weeks.map((w) => (
                  <tr key={w.week.getTime()}>
                    <Td>{weekLabel(w.week)}</Td>
                    <Td align="right">{formatInt(w.builds)}</Td>
                    <Td align="right">
                      <span className="text-emerald-600 dark:text-emerald-400">{w.succeeded}</span>
                      <span className="text-black/30 dark:text-white/30"> / </span>
                      <span className="text-red-600 dark:text-red-400">{w.failed}</span>
                    </Td>
                    <Td align="right">{formatUsd(w.costMicros, 4)}</Td>
                    <Td align="right">{formatInt(w.creditsCharged)}</Td>
                    <Td align="right">{formatUsd(w.recoveredMicros, 4)}</Td>
                    <Td align="right">
                      {w.freeCostMicros > 0 ? (
                        <span className="text-amber-600 dark:text-amber-500">
                          {formatUsd(w.freeCostMicros, 4)}
                        </span>
                      ) : (
                        formatUsd(0, 4)
                      )}
                    </Td>
                    <td className="w-32 px-4 py-2">
                      <Bar value={w.costMicros} max={maxWeekCost} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-black/10 text-black/70 dark:border-white/10 dark:text-white/70">
                  <Th>Total</Th>
                  <Th align="right">{formatInt(totalBuilds)}</Th>
                  <Th align="right">&nbsp;</Th>
                  <Th align="right">{formatUsd(totalCostMicros, 4)}</Th>
                  <Th align="right">&nbsp;</Th>
                  <Th align="right">{formatUsd(totalRecoveredMicros, 4)}</Th>
                  <Th align="right">{formatUsd(totalFreeCostMicros, 4)}</Th>
                  <Th>
                    <span
                      className="text-xs font-normal text-black/50 dark:text-white/50"
                      title="Recovered minus cost. Expected to be small and non-negative — it is rounding plus unbilled failures."
                    >
                      meter {meterDeltaMicros >= 0 ? "+" : ""}
                      {formatUsd(meterDeltaMicros, 4)}
                    </span>
                  </Th>
                </tr>
              </tfoot>
            </TableFrame>
          )}
        </Panel>
      </div>

      {/* ── Credit liability ─────────────────────────────────────────── */}
      <div className="mb-6">
        <Panel
          title="Credit liability"
          subtitle="Unspent credits are an obligation: each one is a promise to fund real model spend later. Nothing else in the admin panel shows this."
          footnote={
            <>
              The total is authoritative — it is the sum of every user&apos;s newest{" "}
              <code>balanceAfter</code>, the same value <code>getBalance()</code> returns, computed
              in one <code>DISTINCT ON</code> pass. The free/paid split needs one assumption the
              ledger cannot supply on its own: it records a running balance, not lots, so it never
              says <em>which</em> credits a spend consumed. The split below assumes FIFO with grants
              consumed first, which is exact for the ordinary shape (signup grant, then purchases,
              then spend) and can only misclassify a user who bought credits before receiving a
              later free grant.
            </>
          }
        >
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatTile
              label="Outstanding credits"
              value={formatInt(liability.outstanding)}
              hint={`held by ${formatInt(liability.usersWithBalance)} user${liability.usersWithBalance === 1 ? "" : "s"}`}
            />
            <StatTile
              label="Committed model spend"
              value={formatUsd(liability.micros)}
              hint={`${formatInt(liability.outstanding)} × ${formatInt(MICROS_PER_CREDIT)} micros`}
            />
            <StatTile
              label="Free, unspent"
              value={formatInt(liability.freeOutstanding)}
              hint={`${formatUsd(liability.freeOutstanding * MICROS_PER_CREDIT)} — cost with no matching revenue`}
            />
            <StatTile
              label="Paid, unspent"
              value={formatInt(liability.paidOutstanding)}
              hint={`${formatUsd(liability.paidOutstanding * MICROS_PER_CREDIT)} — deferred revenue`}
              tone={liability.paidOutstanding === 0 ? "muted" : undefined}
            />
          </div>

          <ul className="mt-5 space-y-2.5">
            <BarRow
              label="Granted free"
              value={liability.granted}
              max={Math.max(1, liability.granted, liability.purchased, liability.spent)}
              right={formatInt(liability.granted)}
            />
            <BarRow
              label="Purchased"
              value={liability.purchased}
              max={Math.max(1, liability.granted, liability.purchased, liability.spent)}
              right={formatInt(liability.purchased)}
            />
            <BarRow
              label="Spent on builds"
              value={liability.spent}
              max={Math.max(1, liability.granted, liability.purchased, liability.spent)}
              right={formatInt(liability.spent)}
            />
          </ul>

          {ledgerDrift ? (
            <p className="mt-4 text-sm text-amber-700 dark:text-amber-400">
              Ledger drift: the newest <code>balanceAfter</code> rows sum to{" "}
              {formatInt(liability.outstanding)}, but every delta sums to{" "}
              {formatInt(liability.outstandingFromDeltas)}. The ledger is append-only and starts at
              zero, so these must agree — investigate before trusting the split above.
            </p>
          ) : (
            <p className="mt-4 text-xs text-black/50 dark:text-white/50">
              Cross-check passed: the newest <code>balanceAfter</code> rows and the sum of every
              delta both give {formatInt(liability.outstanding)}.
            </p>
          )}

          {liability.purchased === 0 && liability.spent > 0 ? (
            <p className="mt-3 text-sm text-black/70 dark:text-white/70">
              Every credit ever spent came from a free grant, so realised gross margin to date is
              negative by construction: {formatUsd(totalCostMicros)} of {costWord} against{" "}
              {formatCents(revenue.totalCents)} of revenue. That is the expected shape of a
              pre-revenue testing period, not a pricing failure — but it is the number, and
              averaging it into anything called MRR would hide it.
            </p>
          ) : null}
        </Panel>
      </div>

      {/* ── Cohorts ──────────────────────────────────────────────────── */}
      <div className="mb-6">
        <Panel
          title="Signup cohorts"
          subtitle={`Users grouped by the ISO week they signed up, and the share of each cohort that ever reached the next step. Last ${WEEKS_BACK} weeks.`}
          footnote={
            <>
              Sourced from <code>User</code>, <code>Project</code>, <code>Build</code> and{" "}
              <code>CreditLedger</code> — not from the <code>Event</code> stream, which only started
              collecting recently (see coverage below). Those tables have recorded every signup,
              project, build and purchase since day one, so the cohorts are complete where the event
              stream would have been mostly blank. Percentages are lifetime-to-date, so the newest
              cohort is still maturing and will only go up.
            </>
          }
        >
          {cohortData.cohorts.length === 0 ? (
            <Empty>No signups in the last {WEEKS_BACK} weeks.</Empty>
          ) : (
            <TableFrame>
              <thead>
                <tr className="border-b border-black/10 text-xs text-black/50 dark:border-white/10 dark:text-white/50">
                  <Th>Cohort week</Th>
                  <Th align="right">Signups</Th>
                  <Th align="right">Created a project</Th>
                  <Th align="right">First green build</Th>
                  <Th align="right">Published a site</Th>
                  <Th align="right">Purchased credits</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/10 dark:divide-white/10">
                {cohortData.cohorts.map((c) => (
                  <tr key={c.week.getTime()}>
                    <Td muted={false}>{weekLabel(c.week)}</Td>
                    <Td align="right" muted={false}>
                      {formatInt(c.users)}
                    </Td>
                    <Td align="right">
                      {pct(c.createdProject, c.users)}
                      <span className="ml-2 text-xs text-black/40 dark:text-white/40">
                        {c.createdProject}
                      </span>
                    </Td>
                    <Td align="right">
                      {pct(c.builtOk, c.users)}
                      <span className="ml-2 text-xs text-black/40 dark:text-white/40">
                        {c.builtOk}
                      </span>
                    </Td>
                    <Td align="right">
                      {pct(c.published, c.users)}
                      <span className="ml-2 text-xs text-black/40 dark:text-white/40">
                        {c.published}
                      </span>
                    </Td>
                    <Td align="right">
                      {c.purchased === 0 ? (
                        <span className="text-black/40 dark:text-white/40">
                          {pct(c.purchased, c.users)}
                        </span>
                      ) : (
                        pct(c.purchased, c.users)
                      )}
                      <span className="ml-2 text-xs text-black/40 dark:text-white/40">
                        {c.purchased}
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableFrame>
          )}
        </Panel>
      </div>

      <div className="mb-6">
        <Panel
          title="Still building, by weeks since signup"
          subtitle="Share of each cohort that ran at least one build in that week. W0 is the signup week itself."
          footnote={
            <>
              An attempt counts regardless of outcome — a failed build is still someone trying to
              use the product. This is the honest analogue of a retention curve for a product with
              nothing to cancel: it measures whether people came back, which is the question churn
              would have answered if churn applied here. A blank cell means that week has not
              happened yet for that cohort, not that nobody returned.
            </>
          }
        >
          {cohortData.cohorts.length === 0 ? (
            <Empty>No cohorts to chart yet.</Empty>
          ) : (
            <TableFrame>
              <thead>
                <tr className="border-b border-black/10 text-xs text-black/50 dark:border-white/10 dark:text-white/50">
                  <Th>Cohort week</Th>
                  <Th align="right">Signups</Th>
                  {retentionOffsets.map((o) => (
                    <Th key={o} align="right">
                      W{o}
                    </Th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-black/10 dark:divide-white/10">
                {cohortData.cohorts.map((c) => (
                  <tr key={c.week.getTime()}>
                    <Td muted={false}>{weekLabel(c.week)}</Td>
                    <Td align="right" muted={false}>
                      {formatInt(c.users)}
                    </Td>
                    {retentionOffsets.map((o) => (
                      <HeatCell key={o} value={c.retention.get(o)} denominator={c.users} />
                    ))}
                  </tr>
                ))}
              </tbody>
            </TableFrame>
          )}
        </Panel>
      </div>

      {/* ── Event stream coverage ────────────────────────────────────── */}
      <div className="mb-6">
        <Panel
          title="Event stream coverage"
          subtitle="A diagnostic, not a metric: can anything above be sourced from the Event table yet?"
          footnote={
            <>
              Every panel on this page is deliberately sourced from durable tables instead. When the
              stream has real coverage, event-sourced cohorts become possible and would be better —
              they can distinguish &ldquo;created a project&rdquo; from &ldquo;deleted it
              again&rdquo;, which <code>Project</code> alone cannot once a row is gone.
            </>
          }
        >
          {coverage.total === 0 ? (
            <Empty>
              The <code>Event</code> table is empty. Tracking is new — no analytics on this page
              depends on it.
            </Empty>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <StatTile label="Events recorded" value={formatInt(coverage.total)} />
                <StatTile
                  label="Names ever seen"
                  value={`${coverage.names.length} / ${declaredEvents.length}`}
                  hint="of the closed set in lib/events.ts"
                />
                <StatTile
                  label="Never fired"
                  value={formatInt(coverage.silent.length)}
                  tone={coverage.silent.length > 0 ? "warn" : undefined}
                  hint="declared but never recorded"
                />
              </div>

              <div className="mt-4">
                <TableFrame>
                  <thead>
                    <tr className="border-b border-black/10 text-xs text-black/50 dark:border-white/10 dark:text-white/50">
                      <Th>Event</Th>
                      <Th align="right">Count</Th>
                      <Th align="right">First seen</Th>
                      <Th align="right">Last seen</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/10 dark:divide-white/10">
                    {coverage.names.map((n) => (
                      <tr key={n.name}>
                        <Td muted={false}>
                          <code>{n.name}</code>
                        </Td>
                        <Td align="right">{formatInt(n.count)}</Td>
                        <Td align="right">{weekLabel(n.first)}</Td>
                        <Td align="right">{weekLabel(n.last)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </TableFrame>
              </div>

              {coverage.silent.length > 0 ? (
                <p className="mt-3 text-xs text-black/60 dark:text-white/60">
                  Never recorded:{" "}
                  <span className="text-black/50 dark:text-white/50">
                    {coverage.silent.join(", ")}
                  </span>
                  . Each is either a path nobody has taken yet or a{" "}
                  <code>track()</code> call that was never wired up — indistinguishable from here,
                  and worth checking before any funnel is built on one.
                </p>
              ) : null}
            </>
          )}
        </Panel>
      </div>

      <p className="text-xs text-black/50 dark:text-white/50">
        Weeks are ISO Mondays from Postgres <code>date_trunc</code> over stored UTC instants.
        Revenue comes from <code>CreditLedger</code> rows with a <code>stripe:</code> reason, priced
        via <code>CREDIT_PACKS</code>. Cost comes from <code>Build.costMicros</code>
        {imputed ? " and is imputed under KODELY_ENGINE=sdk" : ""}. Every series on this page is one
        grouped query — nothing loops over users or weeks.
      </p>
    </div>
  );
}
