import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getAdminUser } from "@/lib/auth";
import { MICROS_PER_CREDIT } from "@/lib/credits";
import { activationFunnel, greenBuildRate, followUpIntents, buildRatings } from "@/lib/events";
import { recordAdminAction, ADMIN_ACTIONS } from "@/lib/admin-audit";

export const dynamic = "force-dynamic";

function formatUsd(micros: number, decimals = 2): string {
  return `$${(micros / 1_000_000).toFixed(decimals)}`;
}

function truncate(text: string, max = 60): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function statusClass(status: string): string {
  if (status === "SUCCEEDED") return "text-emerald-600 dark:text-emerald-400";
  if (status === "FAILED") return "text-red-600 dark:text-red-400";
  return "text-black/40 dark:text-white/40";
}

export default async function AdminDashboardPage() {
  // Defense in depth — app/admin/layout.tsx is the primary gate. 404 rather
  // than redirect so a non-admin who somehow reaches this page doesn't learn
  // an admin panel exists at this path.
  const admin = await getAdminUser();
  if (!admin) notFound();

  // Recorded BEFORE the queries below run, because this page renders cost,
  // margin and the last 50 builds INCLUDING customer prompts. The read is the
  // thing being audited, so it has to be logged whether or not the render
  // afterwards succeeds.
  await recordAdminAction(admin, ADMIN_ACTIONS.dashboardViewed);

  const [totalBuilds, statusCounts, totals, recentBuilds, funnel, greenBuild, intents, ratings] =
    await Promise.all([
    db.build.count(),
    db.build.groupBy({ by: ["status"], _count: { _all: true } }),
    db.build.aggregate({
      _sum: { costMicros: true, creditsCharged: true },
    }),
    db.build.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        createdAt: true,
        status: true,
        model: true,
        inputTokens: true,
        outputTokens: true,
        costMicros: true,
        creditsCharged: true,
        prompt: true,
        repairAttempts: true,
      },
    }),
    activationFunnel(30),
    greenBuildRate(30),
    followUpIntents(30),
    buildRatings(30),
  ]);

  const succeeded = statusCounts.find((s) => s.status === "SUCCEEDED")?._count._all ?? 0;
  const failed = statusCounts.find((s) => s.status === "FAILED")?._count._all ?? 0;

  const totalCostMicros = totals._sum.costMicros ?? 0;
  const totalCreditsCharged = totals._sum.creditsCharged ?? 0;

  // NOT gross margin, and it used to be labelled as such — which was actively
  // misleading. creditsFor() is ceil(costMicros / MICROS_PER_CREDIT), so the
  // metered figure is DERIVED from the cost it is being compared against, and
  // it rendered ~0.5% while true retail margin is ~87-89%. Real margin comes
  // from what a customer PAYS per credit (lib/stripe.ts: $0.018 on the starter
  // pack) against the $0.002 cost basis — see /admin/analytics, which computes
  // revenue from actual `stripe:` ledger rows.
  //
  // UPDATED: this used to be pure rounding remainder, bounded at $0.0019 per
  // build. It is not any more. Under rule 4 of the anti-bill-shock contract
  // (lib/credits.ts) a repair pass is recorded at true cost and charged zero,
  // so this figure now goes GENUINELY NEGATIVE by the amount we absorbed.
  // A negative number here is the promise working, not a fault.
  const meteredMicros = totalCreditsCharged * MICROS_PER_CREDIT;
  const recoveryMicros = meteredMicros - totalCostMicros;

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <div className="text-lg font-semibold tracking-tight">kodely admin</div>
        <p className="text-sm text-black/60 dark:text-white/60">
          Generation cost &amp; margin dashboard
        </p>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
          <div className="text-xs text-black/50 dark:text-white/50">Total builds</div>
          <div className="mt-1 text-xl font-semibold">{totalBuilds}</div>
        </div>
        <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
          <div className="text-xs text-black/50 dark:text-white/50">Succeeded / Failed</div>
          <div className="mt-1 text-xl font-semibold">
            <span className="text-emerald-600 dark:text-emerald-400">{succeeded}</span>
            <span className="text-black/30 dark:text-white/30"> / </span>
            <span className="text-red-600 dark:text-red-400">{failed}</span>
          </div>
        </div>
        <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
          <div className="text-xs text-black/50 dark:text-white/50">Total real cost</div>
          <div className="mt-1 text-xl font-semibold">{formatUsd(totalCostMicros)}</div>
        </div>
        <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
          <div className="text-xs text-black/50 dark:text-white/50">Credits charged</div>
          <div className="mt-1 text-xl font-semibold">{totalCreditsCharged}</div>
        </div>
        <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
          <div className="text-xs text-black/50 dark:text-white/50">Meter recovery</div>
          <div
            className={`mt-1 text-xl font-semibold ${recoveryMicros < 0 ? "text-amber-600 dark:text-amber-500" : ""}`}
          >
            {formatUsd(recoveryMicros, 4)}
          </div>
          <p className="mt-1 text-[11px] leading-snug text-black/40 dark:text-white/40">
            Not margin. Metered charges minus real cost — negative means we absorbed a repair
            pass we didn&apos;t bill for.{" "}
            <a href="/admin/analytics" className="underline underline-offset-2">
              Real revenue
            </a>
          </p>
        </div>
      </div>

      <div className="mb-8 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-black/10 p-5 dark:border-white/10">
          <h2 className="text-sm font-medium">Activation funnel</h2>
          <p className="mt-0.5 text-xs text-black/50 dark:text-white/50">
            Distinct users, last 30 days. Publishing a site is the North Star.
          </p>

          {funnel[0].users === 0 ? (
            <p className="mt-4 text-sm text-black/50 dark:text-white/50">
              No events recorded yet — the stream starts collecting from this deploy onward.
            </p>
          ) : (
            <ul className="mt-4 space-y-2.5">
              {funnel.map((s) => {
                // Bar is relative to the TOP of the funnel, so the drop-off
                // between stages is the visual, not each row's own scale.
                const width = funnel[0].users === 0 ? 0 : (s.users / funnel[0].users) * 100;
                return (
                  <li key={s.event}>
                    <div className="flex items-baseline justify-between text-sm">
                      <span>{s.step}</span>
                      <span className="tabular-nums">
                        <span className="font-medium">{s.users}</span>
                        {s.pctOfPrevious !== null && (
                          <span className="ml-2 text-xs text-black/50 dark:text-white/50">
                            {s.pctOfPrevious}%
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                      <div
                        className="h-full rounded-full bg-black/70 dark:bg-white/70"
                        style={{ width: `${width}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-black/10 p-5 dark:border-white/10">
          <h2 className="text-sm font-medium">Green build, first try</h2>
          <p className="mt-0.5 text-xs text-black/50 dark:text-white/50">
            Share of successful builds that compiled with no repair pass, last 30 days.
          </p>

          {greenBuild.rate === null ? (
            <p className="mt-4 text-sm text-black/50 dark:text-white/50">
              No successful builds in the window yet.
            </p>
          ) : (
            <>
              <div className="mt-4 text-3xl font-semibold tabular-nums">{greenBuild.rate}%</div>
              <p className="mt-1 text-sm text-black/60 dark:text-white/60">
                {greenBuild.firstTry} of {greenBuild.succeeded} builds needed no repair.
              </p>
              <p className="mt-3 text-xs text-black/50 dark:text-white/50">
                This is the roadmap&apos;s gate on moving to backend work. A repair pass costs a
                second full generation, so this number is a cost lever as much as a quality one.
              </p>
            </>
          )}
        </div>
      </div>

      <div className="mb-8 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-black/10 p-5 dark:border-white/10">
          <h2 className="text-sm font-medium">What people ask for next</h2>
          <p className="mt-0.5 text-xs text-black/50 dark:text-white/50">
            Follow-up requests by intent, last 30 days. The top bucket is what the first
            generation gets wrong most often.
          </p>

          {intents.length === 0 ? (
            <p className="mt-4 text-sm text-black/50 dark:text-white/50">
              No follow-up edits recorded yet.
            </p>
          ) : (
            <>
              <ul className="mt-4 space-y-2">
                {intents.map((i) => (
                  <li key={i.intent} className="flex items-center gap-3 text-sm">
                    <span className="w-28 shrink-0 capitalize">{i.intent}</span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                      <span
                        className="block h-full rounded-full bg-black/70 dark:bg-white/70"
                        style={{ width: `${intents[0].count === 0 ? 0 : (i.count / intents[0].count) * 100}%` }}
                      />
                    </span>
                    <span className="w-16 shrink-0 text-right tabular-nums text-black/60 dark:text-white/60">
                      {i.count} · {i.pct}%
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-black/50 dark:text-white/50">
                Buckets come from a keyword heuristic (lib/feedback-intent.ts) — meaningful in
                aggregate, not per request. A rising &ldquo;other&rdquo; share means the rules have
                drifted from how people actually write.
              </p>
            </>
          )}
        </div>

        <div className="rounded-xl border border-black/10 p-5 dark:border-white/10">
          <h2 className="text-sm font-medium">Build satisfaction</h2>
          <p className="mt-0.5 text-xs text-black/50 dark:text-white/50">
            Thumbs up/down on finished builds, last 30 days.
          </p>

          {ratings.satisfaction === null ? (
            <p className="mt-4 text-sm text-black/50 dark:text-white/50">
              Nobody has rated a build yet.
            </p>
          ) : (
            <>
              <div className="mt-4 text-3xl font-semibold tabular-nums">{ratings.satisfaction}%</div>
              <p className="mt-1 text-sm text-black/60 dark:text-white/60">
                {ratings.up} up · {ratings.down} down · {ratings.rated} rated
              </p>
              <p className="mt-3 text-xs text-black/50 dark:text-white/50">
                Self-selected — people rate when they feel strongly, so read the trend rather than
                the absolute number.
              </p>
            </>
          )}
        </div>
      </div>

      <h1 className="mb-4 text-base font-medium">Recent builds</h1>

      {recentBuilds.length === 0 ? (
        <div className="rounded-xl border border-dashed border-black/15 p-10 text-center text-sm text-black/60 dark:border-white/15 dark:text-white/60">
          No builds yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-black/10 dark:border-white/10">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-black/10 text-xs text-black/50 dark:border-white/10 dark:text-white/50">
                <th className="px-4 py-2 font-medium">Created</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Model</th>
                <th className="px-4 py-2 font-medium">In tok</th>
                <th className="px-4 py-2 font-medium">Out tok</th>
                <th className="px-4 py-2 font-medium">Cost</th>
                <th className="px-4 py-2 font-medium">Credits</th>
                <th className="px-4 py-2 font-medium">Repairs</th>
                <th className="px-4 py-2 font-medium">Prompt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/10 dark:divide-white/10">
              {recentBuilds.map((b) => (
                <tr key={b.id}>
                  <td className="whitespace-nowrap px-4 py-2 text-black/70 dark:text-white/70">
                    {b.createdAt.toISOString().replace("T", " ").slice(0, 19)}
                  </td>
                  <td className={`px-4 py-2 font-medium ${statusClass(b.status)}`}>{b.status}</td>
                  <td className="px-4 py-2 text-black/70 dark:text-white/70">{b.model}</td>
                  <td className="px-4 py-2 text-black/70 dark:text-white/70">{b.inputTokens}</td>
                  <td className="px-4 py-2 text-black/70 dark:text-white/70">{b.outputTokens}</td>
                  <td className="px-4 py-2 text-black/70 dark:text-white/70">
                    {formatUsd(b.costMicros, 4)}
                  </td>
                  <td className="px-4 py-2 text-black/70 dark:text-white/70">{b.creditsCharged}</td>
                  <td
                    className={`px-4 py-2 ${b.repairAttempts > 0 ? "font-medium text-amber-600 dark:text-amber-500" : "text-black/70 dark:text-white/70"}`}
                  >
                    {b.repairAttempts}
                  </td>
                  <td className="max-w-xs px-4 py-2 text-black/60 dark:text-white/60">
                    {truncate(b.prompt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
