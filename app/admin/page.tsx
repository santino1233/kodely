import { db } from "@/lib/db";
import { MICROS_PER_CREDIT } from "@/lib/credits";

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
  const [totalBuilds, statusCounts, totals, recentBuilds] = await Promise.all([
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
      },
    }),
  ]);

  const succeeded = statusCounts.find((s) => s.status === "SUCCEEDED")?._count._all ?? 0;
  const failed = statusCounts.find((s) => s.status === "FAILED")?._count._all ?? 0;

  const totalCostMicros = totals._sum.costMicros ?? 0;
  const totalCreditsCharged = totals._sum.creditsCharged ?? 0;
  const totalRevenueMicros = totalCreditsCharged * MICROS_PER_CREDIT;
  const marginMicros = totalRevenueMicros - totalCostMicros;
  const marginPct = totalRevenueMicros > 0 ? (marginMicros / totalRevenueMicros) * 100 : 0;

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
          <div className="text-xs text-black/50 dark:text-white/50">Gross margin</div>
          <div className="mt-1 text-xl font-semibold">
            {formatUsd(marginMicros)}{" "}
            <span className="text-sm font-normal text-black/50 dark:text-white/50">
              ({marginPct.toFixed(1)}%)
            </span>
          </div>
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
