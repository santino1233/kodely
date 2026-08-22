import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminUser } from "@/lib/auth";
import { Empty, StatTile, TableFrame, Th, formatDateTime, truncate } from "../users/ui";
import {
  ADMIN_ACTIONS,
  ADMIN_SURFACE_LABELS,
  adminActionDescriptors,
  adminActionsBySurface,
  countAdminActions,
  describeAdminAction,
  isAdminAction,
  listAdminActions,
  listAdminActors,
  pendingAdminActions,
  recordAdminAction,
  type AdminAction,
  type AdminAuditEntry,
} from "@/lib/admin-audit";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

/**
 * A page number arrives as text from the URL, and `(page - 1) * PAGE_SIZE` is
 * handed to Prisma as `skip`. Past roughly 1e20 that product stops being a
 * value the query engine will accept and the request 500s — verified against
 * this database with `?page=100000000000000000000`. Overshooting the end of
 * the log is a thing people do by editing the URL, and it should show the
 * "past the end" empty state, not an error page. 50M rows deep is well past
 * any real log and nowhere near the limit.
 */
const MAX_PAGE = 1_000_000;

// Presentation comes from app/admin/users/ui.tsx, which /admin/sites,
// /admin/feedback and /admin/flags all already import — it is the panel's de
// facto shared module despite its address, and matching the idiom exactly
// matters more here than avoiding one awkward import path.

function first(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

/**
 * Meta is flat by construction (see AdminAuditMeta), so one line of key=value
 * is the whole story — no need for the recursive renderer a nested payload
 * would demand.
 */
function metaSummary(meta: unknown): string {
  if (meta === null || typeof meta !== "object" || Array.isArray(meta)) return "";
  return Object.entries(meta as Record<string, unknown>)
    .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join("  ·  ");
}

function href(params: { actor: string; action: string; page: number }): string {
  const sp = new URLSearchParams();
  if (params.actor) sp.set("actor", params.actor);
  if (params.action) sp.set("action", params.action);
  if (params.page > 1) sp.set("page", String(params.page));
  const qs = sp.toString();
  return qs ? `/admin/audit?${qs}` : "/admin/audit";
}

/**
 * Where each kind of target lives in the panel. A row whose type has no page —
 * or a type written before this map knew about it — renders as plain text
 * rather than a dead link, which is the whole reason this is a lookup and not
 * a template string.
 */
const TARGET_HREF: Record<string, (id: string) => string> = {
  user: (id) => `/admin/users/${id}`,
  project: (id) => `/admin/sites/${id}`,
  // Flags are keyed, not id'd, and /admin/flags is a single page.
  flag: () => "/admin/flags",
};

function Target({ entry }: { entry: AdminAuditEntry }) {
  if (!entry.targetType || !entry.targetId) {
    return <span className="text-black/30 dark:text-white/30">—</span>;
  }
  const to = TARGET_HREF[entry.targetType];
  const label = `${entry.targetType} · ${truncate(entry.targetId, 14)}`;
  if (!to) {
    return (
      <span className="font-mono text-xs text-black/60 dark:text-white/60" title={entry.targetId}>
        {label}
      </span>
    );
  }
  return (
    <Link
      href={to(entry.targetId)}
      className="font-mono text-xs underline-offset-4 hover:underline"
      title={entry.targetId}
    >
      {label}
    </Link>
  );
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // Defense in depth — app/admin/layout.tsx is the primary gate, but Next's own
  // guidance is that a layout must not be the sole authorization boundary: it
  // does not re-render on every navigation within the section. 404 rather than
  // redirect, matching app/admin/page.tsx, so a non-admin learns nothing about
  // this path. Doubly so here — this page names the other admin routes.
  const actor = await getAdminUser();
  if (!actor) notFound();

  const sp = await searchParams;
  const actorFilter = first(sp.actor).trim();
  const actionRaw = first(sp.action).trim();
  const actionFilter: AdminAction | undefined = isAdminAction(actionRaw) ? actionRaw : undefined;
  const pageRaw = Number.parseInt(first(sp.page), 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.min(pageRaw, MAX_PAGE) : 1;

  // Recorded BEFORE the log is read, and awaited — see recordAdminAction. The
  // consequence is visible right here: this page load is the top row of its own
  // first page. That is the property being bought, not a rendering bug, and the
  // footnote below says so to whoever notices it.
  //
  // The filters go in meta because "who went looking for what" is the part of a
  // log read worth keeping. `actor` is an admin's user id, not a customer's,
  // and nothing here carries a customer identifier.
  await recordAdminAction(actor, ADMIN_ACTIONS.auditLogViewed, {
    meta: {
      page,
      filteredByActor: Boolean(actorFilter),
      filteredByAction: actionFilter ?? null,
    },
  });

  const [{ entries, total }, actors, actionCounts] = await Promise.all([
    listAdminActions({
      actorId: actorFilter || undefined,
      action: actionFilter,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    listAdminActors(),
    countAdminActions(),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const vocabulary = adminActionDescriptors();
  // Grouped by panel area so the filter reads as the panel's own structure
  // rather than fifteen dotted strings you have to already know.
  const vocabularyBySurface = adminActionsBySurface();
  // Surfaces that record nothing. Read off the vocabulary, NOT off row counts:
  // site.taken_down has a real emitter and will sit at zero for months.
  const pending = pendingAdminActions();
  const filtered = Boolean(actorFilter) || Boolean(actionFilter);
  // An actorId that has never written a row still filters — it just matches
  // nothing. Without this the <select> would silently snap back to "All
  // admins" while the table showed an empty filtered result, which reads as a
  // bug in the log rather than an answer about that admin.
  const unknownActor = Boolean(actorFilter) && !actors.some((a) => a.actorId === actorFilter);

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <Link
          href="/admin"
          className="text-xs text-black/50 underline-offset-4 hover:underline dark:text-white/50"
        >
          ← kodely admin
        </Link>
        <div className="mt-1 text-lg font-semibold tracking-tight">Audit log</div>
        <p className="text-sm text-black/60 dark:text-white/60">
          Append-only. Every recorded admin action, newest first — the answer to &ldquo;who looked
          at this account&rdquo;.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile
          label={filtered ? "Entries matching" : "Entries"}
          value={total}
          hint={filtered ? "of the whole log" : undefined}
        />
        <StatTile
          label="Admins in log"
          value={actors.length}
          hint={actors.length === 0 ? "nothing recorded yet" : undefined}
        />
        <StatTile label="Page" value={`${page} / ${pageCount}`} />
        <StatTile
          label="Surfaces not logging"
          value={`${pending.length} / ${vocabulary.length}`}
          tone={pending.length > 0 ? "warn" : undefined}
          hint={
            pending.length > 0
              ? "admin actions with nowhere emitting them"
              : "every admin action has an emitter"
          }
        />
      </div>

      <form method="get" action="/admin/audit" className="mb-6 flex flex-wrap items-center gap-2">
        <select
          name="actor"
          defaultValue={actorFilter}
          aria-label="Filter by admin"
          className="rounded-xl border border-black/10 bg-transparent px-3 py-2 text-sm outline-none dark:border-white/10"
        >
          <option value="">All admins</option>
          {unknownActor ? (
            <option value={actorFilter}>{truncate(actorFilter, 40)} (0)</option>
          ) : null}
          {actors.map((a) => (
            <option key={a.actorId} value={a.actorId}>
              {truncate(a.actorEmail, 40)} ({a.actions})
            </option>
          ))}
        </select>
        <select
          name="action"
          defaultValue={actionFilter ?? ""}
          aria-label="Filter by action"
          className="rounded-xl border border-black/10 bg-transparent px-3 py-2 text-sm outline-none dark:border-white/10"
        >
          <option value="">All actions</option>
          {vocabularyBySurface.map((group) => (
            <optgroup key={group.surface} label={group.label}>
              {group.actions.map((d) => (
                <option key={d.action} value={d.action}>
                  {d.label} ({actionCounts.get(d.action) ?? 0})
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-xl border border-black/10 px-3 py-2 text-sm font-medium hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
        >
          Filter
        </button>
        {filtered ? (
          <Link
            href="/admin/audit"
            className="text-sm text-black/50 underline-offset-4 hover:underline dark:text-white/50"
          >
            Clear
          </Link>
        ) : null}
      </form>

      {entries.length === 0 ? (
        <Empty>
          {page > pageCount ? (
            <>
              Page {page} is past the end of this log.{" "}
              <Link
                href={href({ actor: actorFilter, action: actionFilter ?? "", page: 1 })}
                className="underline underline-offset-4"
              >
                Back to the first page
              </Link>
              .
            </>
          ) : filtered ? (
            "No entries match this filter."
          ) : (
            "Nothing recorded yet — the log starts from this deploy onward."
          )}
        </Empty>
      ) : (
        <TableFrame>
          <thead>
            <tr className="border-b border-black/10 text-xs text-black/50 dark:border-white/10 dark:text-white/50">
              <Th>When</Th>
              <Th>Admin</Th>
              <Th>Action</Th>
              <Th>Target</Th>
              <Th>Context</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/10 dark:divide-white/10">
            {entries.map((e) => {
              // The stored string is a plain column; the vocabulary is what
              // turns it into a sentence. null means a row written by
              // something that bypassed lib/admin-audit.ts.
              const info = describeAdminAction(e.action);
              const summary = metaSummary(e.meta);
              return (
                <tr key={e.id}>
                  <td className="whitespace-nowrap px-4 py-2 tabular-nums text-black/70 dark:text-white/70">
                    {formatDateTime(e.createdAt)}
                  </td>
                  <td className="max-w-xs px-4 py-2">
                    <Link
                      href={href({ actor: e.actorId, action: actionFilter ?? "", page: 1 })}
                      className="underline-offset-4 hover:underline"
                      title={e.actorId}
                    >
                      {truncate(e.actorEmail, 34)}
                    </Link>
                  </td>
                  <td className="px-4 py-2">
                    <div className="font-medium">{info ? info.label : e.action}</div>
                    <div className="text-xs text-black/50 dark:text-white/50">
                      {info ? (
                        <>
                          <span className="font-mono">{e.action}</span>
                          {/* Reads are most of the log; marking the writes is
                              what makes "something changed" scannable. */}
                          {info.kind === "write" ? (
                            <span className="ml-2 rounded border border-black/15 px-1 py-px text-[10px] uppercase tracking-wide text-black/60 dark:border-white/15 dark:text-white/60">
                              write
                            </span>
                          ) : null}
                        </>
                      ) : (
                        // Still shown — an audit log never hides a row it does
                        // not recognise.
                        <span className="text-amber-600 dark:text-amber-500">
                          not in the vocabulary
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2">
                    <Target entry={e} />
                  </td>
                  <td className="max-w-sm px-4 py-2 text-xs text-black/60 dark:text-white/60">
                    {summary ? (
                      truncate(summary, 90)
                    ) : (
                      <span className="text-black/30 dark:text-white/30">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableFrame>
      )}

      <div className="mt-4 flex items-center justify-between text-sm">
        <span className="tabular-nums text-black/50 dark:text-white/50">
          {/* Counted from what was actually returned, so a page past the end
              reads "0 of 137" rather than inventing a range. */}
          {entries.length === 0
            ? `0 of ${total}`
            : `${(page - 1) * PAGE_SIZE + 1}–${(page - 1) * PAGE_SIZE + entries.length} of ${total}`}
        </span>
        <span className="flex gap-2">
          {page > 1 ? (
            <Link
              href={href({ actor: actorFilter, action: actionFilter ?? "", page: page - 1 })}
              className="rounded-xl border border-black/10 px-3 py-1.5 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
            >
              Previous
            </Link>
          ) : null}
          {page < pageCount ? (
            <Link
              href={href({ actor: actorFilter, action: actionFilter ?? "", page: page + 1 })}
              className="rounded-xl border border-black/10 px-3 py-1.5 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
            >
              Next
            </Link>
          ) : null}
        </span>
      </div>

      {pending.length > 0 ? (
        <div className="mt-8 rounded-xl border border-amber-500/40 bg-amber-500/5 p-5 text-sm">
          <h2 className="text-sm font-medium text-amber-700 dark:text-amber-500">
            Surfaces not yet recording
          </h2>
          <p className="mt-2 text-black/70 dark:text-white/70">
            These actions are named in lib/admin-audit.ts, but nothing emits them. Each is an admin
            surface that reads customer data or changes state and leaves no trace. Until this list
            is empty, the log below is a partial answer, and absence of a row here is not evidence
            that nobody looked.
          </p>
          {/* Writes first — see pendingAdminActions. State changing with no
              record of who changed it is a worse hole than an unlogged read. */}
          <ul className="mt-3 space-y-2 text-black/70 dark:text-white/70">
            {pending.map((p) => (
              <li key={p.action}>
                <span className="font-medium">{p.label}</span>{" "}
                <span className="text-xs uppercase tracking-wide text-black/50 dark:text-white/50">
                  {p.kind}
                </span>
                <div className="text-xs text-black/50 dark:text-white/50">
                  <span className="font-mono">{p.action}</span> ·{" "}
                  {ADMIN_SURFACE_LABELS[p.surface]} · {p.note}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="mt-6 text-xs text-black/50 dark:text-white/50">
        Rows are written before the data they record is read, and never updated or deleted — so
        opening this page appends its own entry at the top. Context is deliberately thin: ids,
        counts and flags only, never a customer email, a search string or any prompt text. An audit
        log that accumulated copies of customer data would be a second problem, not a safeguard.
      </p>
    </div>
  );
}
