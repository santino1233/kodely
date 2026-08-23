import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { describeReason, formatDay, formatTime, signedCredits } from "../billing/ledger";
import type { ActivityRow } from "./data";

/* A compact recent-activity card, not a second statement.
   ───────────────────────────────────────────────────────────────────────────
   No search box, no website/action/date-range filters, no pagination — a
   visual reference for this page asked for all four, but /dashboard/billing
   already has a real, paginated, correct statement over this exact table.
   Building a second filtered view here would be a second place a customer's
   own charge history could drift from the first. This shows the newest few
   and links to the real one. */
export function ActivityTable({ rows }: { rows: ActivityRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        kind="empty"
        title="Nothing yet"
        body="Your first charge or credit will show up here."
      />
    );
  }

  return (
    <div className="flex flex-col">
      <div className="k-scroll-x overflow-hidden rounded-lg border border-hair">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Your most recent credit charges and credits.</caption>
          <thead>
            <tr className="border-b border-hair">
              <th scope="col" className="k-label px-4 py-2.5 font-semibold">
                Date
              </th>
              <th scope="col" className="k-label px-4 py-2.5 font-semibold">
                Website / detail
              </th>
              <th scope="col" className="k-label px-4 py-2.5 font-semibold">
                Type
              </th>
              <th scope="col" className="k-label px-4 py-2.5 text-right font-semibold">
                Credits
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hair">
            {rows.map((row) => {
              const what = describeReason(row.reason, row.delta);
              const charge = row.delta < 0;
              return (
                <tr key={row.id} className="transition-colors duration-[var(--t-1)] hover:bg-surface-2">
                  <td className="k-num px-4 py-3 whitespace-nowrap text-ink-2">
                    {formatDay(row.createdAt)}
                    <span className="text-ink-3"> · {formatTime(row.createdAt)}</span>
                  </td>
                  <td className="max-w-0 px-4 py-3">
                    <p className="truncate font-medium text-ink">{what.label}</p>
                    <p className="mt-0.5 truncate text-xs text-ink-3">
                      {row.projectId ? (
                        <Link
                          href={`/projects/${row.projectId}`}
                          className="k-focus rounded-sm hover:text-brand"
                        >
                          {row.projectName}
                        </Link>
                      ) : (
                        (what.detail ?? "—")
                      )}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={charge ? "neutral" : "ok"}>{charge ? "Charged" : "Added"}</Badge>
                  </td>
                  <td
                    className={`k-num px-4 py-3 text-right font-semibold whitespace-nowrap ${
                      row.delta > 0 ? "text-ok" : "text-ink"
                    }`}
                  >
                    {signedCredits(row.delta)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Link
        href="/dashboard/billing"
        className="k-focus mt-3 self-start rounded-sm text-xs font-medium text-brand hover:underline"
      >
        View full statement →
      </Link>
    </div>
  );
}
