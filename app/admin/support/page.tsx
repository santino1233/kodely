import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminUser } from "@/lib/auth";
import { ADMIN_ACTIONS, recordAdminAction } from "@/lib/admin-audit";
import {
  SUPPORT_STATUSES,
  SUPPORT_STATUS_INFO,
  categoryShort,
  countTicketsByStatus,
  isSupportStatus,
  isUnseenByStaff,
  listStaffTickets,
} from "@/lib/support";
import { Empty, Panel, StatTile, TableFrame, Th, formatDateTime, truncate } from "../users/ui";
import { buttonClass, controlClass } from "../feedback/ui";
import { StatusPill, UnseenPill } from "./ui";

export const dynamic = "force-dynamic";

// The ticket queue.
//
// WHY THIS IS ITS OWN SECTION AND NOT PART OF /admin/feedback. The two look
// adjacent — both are "customer signal" — but they are different objects with
// different obligations. /admin/feedback is derived entirely from `build.rated`
// events, states in its own subtitle that nothing on it writes to the stream,
// and is a page you READ to find a trend. This is a WORK QUEUE with a state
// machine, a per-thread page, and the one write in the panel whose output is
// published straight to a customer. Folding a queue into an analytics page
// would mean an operator's "is anything waiting?" and "what is the thumbs-down
// rate?" share a filter bar, and the first question is the urgent one.
//
// They link to each other in both directions instead, since "this customer
// rated a build badly" and "this customer wrote to us" are worth reading
// together.

/** Rows per page. Tickets are low volume; this is a guard, not pagination UX. */
const PAGE = 50;

function first(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

function href(params: { status: string; page: number }): string {
  const sp = new URLSearchParams();
  if (params.status) sp.set("status", params.status);
  if (params.page > 0) sp.set("page", String(params.page + 1));
  const qs = sp.toString();
  return qs ? `/admin/support?${qs}` : "/admin/support";
}

export default async function AdminSupportPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // Defense in depth — app/admin/layout.tsx is the primary gate, but a layout
  // is not an authorization boundary on its own. 404 rather than redirect, so
  // a non-admin who reaches this path learns nothing from it.
  const admin = await getAdminUser();
  if (!admin) notFound();

  const sp = await searchParams;
  // Validated against the closed vocabulary with hasOwnProperty (see
  // isSupportStatus). Anything else is simply "no filter".
  const statusRaw = first(sp.status);
  const status = isSupportStatus(statusRaw) ? statusRaw : undefined;

  const pageRaw = Number.parseInt(first(sp.page), 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 1 ? pageRaw - 1 : 0;

  // Recorded BEFORE anything is read, and awaited — see recordAdminAction in
  // lib/admin-audit.ts. This page lists customer emails next to the subjects
  // they wrote, so looking at it is an access to customer data.
  //
  // The filter goes in meta for the same reason /admin/audit records its own:
  // "who went looking for what" is the part of a read worth keeping. It is
  // validated against a closed set above, so nothing a hand-typed query string
  // carries can reach the log, and it holds no customer identifier.
  await recordAdminAction(admin, ADMIN_ACTIONS.ticketQueueViewed, {
    meta: { filteredByStatus: status ?? null, page: page + 1 },
  });

  const [counts, { rows, total }] = await Promise.all([
    countTicketsByStatus(),
    listStaffTickets({ status, skip: page * PAGE, take: PAGE }),
  ]);

  const open = counts.get("OPEN") ?? 0;
  const answered = counts.get("ANSWERED") ?? 0;
  const resolved = counts.get("RESOLVED") ?? 0;
  const allTickets = open + answered + resolved;

  // Counted over the page in hand, and labelled as such. "Unread" needs the
  // read marks, which are per row — claiming a number across the whole table
  // would mean a second query that says something different from the table
  // underneath it.
  const unseenHere = rows.filter(isUnseenByStaff).length;

  const shownFrom = total === 0 ? 0 : page * PAGE + 1;
  const shownTo = page * PAGE + rows.length;

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <Link
          href="/admin"
          className="rounded text-xs text-black/50 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/40 dark:text-white/50 dark:focus-visible:ring-white/40"
        >
          ← kodely admin
        </Link>
        <div className="mt-1 text-lg font-semibold tracking-tight">Support tickets</div>
        <p className="text-sm text-black/60 dark:text-white/60">
          What customers actually wrote to us, and the thread they are waiting on.{" "}
          <Link
            href="/admin/feedback"
            className="rounded underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/40 dark:focus-visible:ring-white/40"
          >
            Build ratings →
          </Link>{" "}
          <Link
            href="/admin/feedback/notes"
            className="rounded underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/40 dark:focus-visible:ring-white/40"
          >
            Operator notes →
          </Link>
        </p>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile
          label="Needs a reply"
          value={<span className={open > 0 ? "text-amber-600 dark:text-amber-500" : ""}>{open}</span>}
          tone={open > 0 ? "warn" : undefined}
          hint={open === 0 ? "nothing waiting" : "the customer wrote last"}
        />
        <StatTile label="Answered" value={answered} hint="waiting on the customer" />
        <StatTile label="Resolved" value={resolved} hint="closed by either side" />
        <StatTile
          label="Unread on this page"
          value={unseenHere}
          hint={`of ${rows.length} shown — nobody has opened these`}
        />
      </div>

      <form method="get" action="/admin/support" className="mb-6 flex flex-wrap items-center gap-2">
        <label htmlFor="status-filter" className="text-sm text-black/60 dark:text-white/60">
          Status
        </label>
        <select id="status-filter" name="status" defaultValue={status ?? ""} className={controlClass}>
          <option value="">All statuses</option>
          {SUPPORT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {SUPPORT_STATUS_INFO[s].staffLabel}
            </option>
          ))}
        </select>
        <button type="submit" className={buttonClass}>
          Filter
        </button>
        {status ? (
          <Link
            href="/admin/support"
            className="rounded text-sm text-black/50 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/40 dark:text-white/50 dark:focus-visible:ring-white/40"
          >
            Clear
          </Link>
        ) : null}
      </form>

      <Panel
        title="Tickets"
        subtitle={
          <>
            Newest activity first.{" "}
            {total === 0
              ? "Nothing matches."
              : `Showing ${shownFrom}–${shownTo} of ${total}${status ? ` with status ${SUPPORT_STATUS_INFO[status].staffLabel.toLowerCase()}` : ""}.`}{" "}
            Subjects are the customer&apos;s own words; the message bodies are on the thread, not
            here.
          </>
        }
      >
        {rows.length === 0 ? (
          <Empty>
            {allTickets === 0 ? (
              <>
                No tickets have been opened at all. Unlike the rating inbox, this is the whole
                table rather than a window — an empty queue here really does mean nobody has
                written.
              </>
            ) : status ? (
              <>No tickets with that status.</>
            ) : (
              <>Nothing on this page. Try the first one.</>
            )}
          </Empty>
        ) : (
          <TableFrame>
            <thead>
              <tr className="border-b border-black/10 text-xs text-black/50 dark:border-white/10 dark:text-white/50">
                <Th>Last activity</Th>
                <Th>Status</Th>
                <Th>Subject</Th>
                <Th>About</Th>
                <Th>Customer</Th>
                <Th>Site</Th>
                <Th align="right">Msgs</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/10 dark:divide-white/10">
              {rows.map((t) => (
                <tr key={t.id}>
                  <td className="whitespace-nowrap px-4 py-2 tabular-nums text-black/70 dark:text-white/70">
                    {formatDateTime(t.lastMessageAt)}
                  </td>
                  <td className="px-4 py-2">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <StatusPill status={t.status} />
                      {isUnseenByStaff(t) && <UnseenPill />}
                    </span>
                  </td>
                  <td className="max-w-[20rem] px-4 py-2">
                    <Link
                      href={`/admin/support/${t.id}`}
                      className="rounded underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/40 dark:focus-visible:ring-white/40"
                      title={t.subject}
                    >
                      {truncate(t.subject, 60)}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-black/70 dark:text-white/70">
                    {categoryShort(t.category)}
                  </td>
                  <td className="max-w-[14rem] px-4 py-2">
                    <Link
                      href={`/admin/users/${t.user.id}`}
                      className="rounded underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/40 dark:focus-visible:ring-white/40"
                      title={`${t.user.email} — open their account`}
                    >
                      {truncate(t.user.email, 28)}
                    </Link>
                  </td>
                  <td className="max-w-[12rem] px-4 py-2 text-black/70 dark:text-white/70">
                    {t.project ? (
                      truncate(t.project.name, 24)
                    ) : (
                      <span className="text-black/30 dark:text-white/30">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-black/70 dark:text-white/70">
                    {t.messageCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableFrame>
        )}

        {(page > 0 || shownTo < total) && (
          <div className="mt-4 flex items-center justify-between text-sm">
            {page > 0 ? (
              <Link
                href={href({ status: status ?? "", page: page - 1 })}
                className="rounded underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/40 dark:focus-visible:ring-white/40"
              >
                ← Newer
              </Link>
            ) : (
              <span />
            )}
            {shownTo < total ? (
              <Link
                href={href({ status: status ?? "", page: page + 1 })}
                className="rounded underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/40 dark:focus-visible:ring-white/40"
              >
                Older →
              </Link>
            ) : (
              <span />
            )}
          </div>
        )}
      </Panel>

      <p className="mt-6 text-xs text-black/50 dark:text-white/50">
        &ldquo;Unread&rdquo; means nobody has opened the thread since the customer last wrote on
        it — it is the read mark, not the status. A ticket can be answered and unread (they replied
        after your answer) or waiting and read (somebody looked and did not write back). Opening a
        thread clears it, and every open is recorded in the audit log.
      </p>
    </div>
  );
}
