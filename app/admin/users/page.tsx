import Link from "next/link";
import { notFound } from "next/navigation";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getAdminUser } from "@/lib/auth";
import { recordAdminAction, ADMIN_ACTIONS } from "@/lib/admin-audit";
import {
  Empty,
  StatTile,
  TableFrame,
  Th,
  formatDate,
  formatUsd,
  truncate,
} from "./ui";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

type SortKey = "recent" | "oldest" | "email" | "projects";

/**
 * Only DATABASE-NATIVE sorts are offered. Balance, lifetime spend and build
 * count are all derived from other tables and are computed per PAGE (see
 * below) — sorting the page by one of them would silently sort 25 arbitrary
 * rows rather than the whole table, which is worse than not offering it.
 */
const SORTS: Record<SortKey, { label: string; orderBy: Prisma.UserOrderByWithRelationInput }> = {
  recent: { label: "Newest", orderBy: { createdAt: "desc" } },
  oldest: { label: "Oldest", orderBy: { createdAt: "asc" } },
  email: { label: "Email", orderBy: { email: "asc" } },
  projects: { label: "Projects", orderBy: { projects: { _count: "desc" } } },
};

function isSortKey(v: unknown): v is SortKey {
  // hasOwnProperty, not `in` — `in` walks the prototype chain, so
  // ?sort=constructor passed this guard and reached Prisma as an undefined
  // orderBy, producing a reachable 500.
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(SORTS, v);
}

function first(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

function href(params: { q: string; sort: SortKey; page: number }): string {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.sort !== "recent") sp.set("sort", params.sort);
  if (params.page > 1) sp.set("page", String(params.page));
  const qs = sp.toString();
  return qs ? `/admin/users?${qs}` : "/admin/users";
}

// ── Per-page rollups ──────────────────────────────────────────────────────
// Everything below is keyed by userId and fetched for the CURRENT PAGE ONLY,
// in a fixed number of queries (6) regardless of how many users are on it.
// No query ever runs inside a loop over users.

type BalanceRow = { userId: string; balanceAfter: number };

type BuildRollupRow = {
  userId: string;
  builds: number;
  succeeded: number;
  failed: number;
  costMicros: bigint;
  creditsCharged: bigint;
  lastBuildAt: Date | null;
};

type Rollup = {
  balance: number;
  netDelta: number;
  spent: number;
  builds: number;
  succeeded: number;
  failed: number;
  costMicros: number;
  creditsCharged: number;
  lastBuildAt: Date | null;
};

const EMPTY_ROLLUP: Rollup = {
  balance: 0,
  netDelta: 0,
  spent: 0,
  builds: 0,
  succeeded: 0,
  failed: 0,
  costMicros: 0,
  creditsCharged: 0,
  lastBuildAt: null,
};

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // Defense in depth — app/admin/layout.tsx is the primary gate, but a layout
  // is not an authorization boundary on its own (it does not re-render on
  // every navigation within the section). Same idiom as app/admin/page.tsx:
  // 404 rather than redirect, so a non-admin learns nothing about this path.
  const admin = await getAdminUser();
  if (!admin) notFound();

  const sp = await searchParams;
  const q = first(sp.q).trim();
  const sortRaw = first(sp.sort);
  const sort: SortKey = isSortKey(sortRaw) ? sortRaw : "recent";
  const pageRaw = Number.parseInt(first(sp.page), 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;

  // Recorded before the customer data is queried below. `meta` records WHETHER
  // a search happened, never the term: on this page the term is almost always a
  // customer's email address, and an audit log that quietly accumulates those
  // is a second data-protection problem wearing the clothes of a solution —
  // the rule is stated at the top of lib/admin-audit.ts.
  await recordAdminAction(admin, ADMIN_ACTIONS.userListViewed, {
    meta: { page, searched: Boolean(q) },
  });

  // Search by email, by display name, or by pasting a raw user id straight out
  // of a log line or a support ticket.
  const where: Prisma.UserWhereInput = q
    ? {
        OR: [
          { email: { contains: q, mode: "insensitive" } },
          { name: { contains: q, mode: "insensitive" } },
          { id: q },
        ],
      }
    : {};

  const [total, users] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
      where,
      // `id` breaks ties so pagination is stable when timestamps collide.
      orderBy: [SORTS[sort].orderBy, { id: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        spendCapCredits: true,
        _count: { select: { projects: true } },
      },
    }),
  ]);

  const ids = users.map((u) => u.id);

  // ── Balance for many users, without one query each ────────────────────
  // lib/credits.ts `getBalance` reads `balanceAfter` off the user's NEWEST
  // ledger row. Postgres does that for a whole set of users in one pass with
  // DISTINCT ON: sort by (userId, createdAt DESC, id DESC) and keep the first
  // row per userId. `id` is the tiebreak so two rows written inside the same
  // millisecond still resolve deterministically to the same row Prisma's
  // findFirst would have picked.
  const balanceRows = ids.length
    ? await db.$queryRaw<BalanceRow[]>`
        SELECT DISTINCT ON (l."userId") l."userId", l."balanceAfter"
        FROM "CreditLedger" l
        WHERE l."userId" IN (${Prisma.join(ids)})
        ORDER BY l."userId", l."createdAt" DESC, l."id" DESC`
    : [];

  // Build has no userId — it hangs off Project — so the per-user build
  // rollup is one grouped join rather than a per-user count.
  const buildRows = ids.length
    ? await db.$queryRaw<BuildRollupRow[]>`
        SELECT p."userId",
               COUNT(*)::int AS "builds",
               COUNT(*) FILTER (WHERE b."status" = 'SUCCEEDED')::int AS "succeeded",
               COUNT(*) FILTER (WHERE b."status" = 'FAILED')::int AS "failed",
               COALESCE(SUM(b."costMicros"), 0)::bigint AS "costMicros",
               COALESCE(SUM(b."creditsCharged"), 0)::bigint AS "creditsCharged",
               MAX(b."createdAt") AS "lastBuildAt"
        FROM "Build" b
        JOIN "Project" p ON p."id" = b."projectId"
        WHERE p."userId" IN (${Prisma.join(ids)})
        GROUP BY p."userId"`
    : [];

  const [spentRows, netRows] = ids.length
    ? await Promise.all([
        db.creditLedger.groupBy({
          by: ["userId"],
          where: { userId: { in: ids }, delta: { lt: 0 } },
          _sum: { delta: true },
        }),
        // The ledger is append-only and starts at zero, so the sum of every
        // delta MUST equal the newest row's balanceAfter. Cheap to check here
        // (one grouped query for the page) and the only way to notice a
        // ledger that has drifted before a customer does.
        db.creditLedger.groupBy({
          by: ["userId"],
          where: { userId: { in: ids } },
          _sum: { delta: true },
        }),
      ])
    : [[], []];

  const rollups = new Map<string, Rollup>(ids.map((id) => [id, { ...EMPTY_ROLLUP }]));
  for (const r of balanceRows) {
    const u = rollups.get(r.userId);
    if (u) u.balance = r.balanceAfter;
  }
  for (const r of buildRows) {
    const u = rollups.get(r.userId);
    if (!u) continue;
    u.builds = Number(r.builds);
    u.succeeded = Number(r.succeeded);
    u.failed = Number(r.failed);
    u.costMicros = Number(r.costMicros);
    u.creditsCharged = Number(r.creditsCharged);
    u.lastBuildAt = r.lastBuildAt;
  }
  // `userId` is nullable on CreditLedger — erasure detaches rows rather than
  // deleting them (see prisma/schema.prisma). Both queries above filter
  // `userId: { in: ids }`, so a null can never actually appear here; the guard
  // exists because TypeScript cannot see through a Prisma `where`, and a `!`
  // would silently become wrong if either filter ever changed.
  for (const r of spentRows) {
    const u = r.userId === null ? undefined : rollups.get(r.userId);
    // Deltas are negative for spend; show it as a positive number.
    if (u) u.spent = Math.abs(r._sum.delta ?? 0);
  }
  for (const r of netRows) {
    const u = r.userId === null ? undefined : rollups.get(r.userId);
    if (u) u.netDelta = r._sum.delta ?? 0;
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const drifted = [...rollups.values()].filter((r) => r.balance !== r.netDelta).length;

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <Link
          href="/admin"
          className="text-xs text-black/50 underline-offset-4 hover:underline dark:text-white/50"
        >
          ← kodely admin
        </Link>
        <div className="mt-1 text-lg font-semibold tracking-tight">Users</div>
        <p className="text-sm text-black/60 dark:text-white/60">
          Read-only. Per-customer credits, builds and cost — the view that answers a billing
          email.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="Users matching" value={total} />
        <StatTile label="On this page" value={users.length} />
        <StatTile label="Page" value={`${page} / ${pageCount}`} />
        <StatTile
          label="Ledger drift"
          value={drifted}
          tone={drifted > 0 ? "warn" : undefined}
          hint="balanceAfter vs sum of deltas, this page"
        />
      </div>

      <form method="get" action="/admin/users" className="mb-6 flex flex-wrap items-center gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search email, name or user id"
          aria-label="Search users"
          className="w-full max-w-sm rounded-xl border border-black/10 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-black/40 focus:border-black/30 dark:border-white/10 dark:placeholder:text-white/40 dark:focus:border-white/30"
        />
        <select
          name="sort"
          defaultValue={sort}
          aria-label="Sort users"
          className="rounded-xl border border-black/10 bg-transparent px-3 py-2 text-sm outline-none dark:border-white/10"
        >
          {(Object.keys(SORTS) as SortKey[]).map((k) => (
            <option key={k} value={k}>
              {SORTS[k].label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-xl border border-black/10 px-3 py-2 text-sm font-medium hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
        >
          Search
        </button>
        {q ? (
          <Link
            href="/admin/users"
            className="text-sm text-black/50 underline-offset-4 hover:underline dark:text-white/50"
          >
            Clear
          </Link>
        ) : null}
      </form>

      {users.length === 0 ? (
        <Empty>{q ? `No users match “${truncate(q, 40)}”.` : "No users yet."}</Empty>
      ) : (
        <TableFrame>
          <thead>
            <tr className="border-b border-black/10 text-xs text-black/50 dark:border-white/10 dark:text-white/50">
              <Th>Email</Th>
              <Th>Signed up</Th>
              <Th>Role</Th>
              <Th align="right">Projects</Th>
              <Th align="right">Builds</Th>
              <Th align="right">Balance</Th>
              <Th align="right">Spent</Th>
              <Th align="right">Cost</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/10 dark:divide-white/10">
            {users.map((u) => {
              const r = rollups.get(u.id) ?? EMPTY_ROLLUP;
              const drift = r.balance !== r.netDelta;
              return (
                <tr key={u.id}>
                  <td className="max-w-xs px-4 py-2">
                    <Link
                      href={`/admin/users/${u.id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {truncate(u.email, 44)}
                    </Link>
                    {u.name ? (
                      <div className="text-xs text-black/50 dark:text-white/50">
                        {truncate(u.name, 44)}
                      </div>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 tabular-nums text-black/70 dark:text-white/70">
                    {formatDate(u.createdAt)}
                  </td>
                  <td className="px-4 py-2 text-black/70 dark:text-white/70">
                    {u.role === "ADMIN" ? (
                      <span className="font-medium">ADMIN</span>
                    ) : (
                      <span className="text-black/50 dark:text-white/50">{u.role}</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-black/70 dark:text-white/70">
                    {u._count.projects}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums text-black/70 dark:text-white/70">
                    {r.builds}
                    {r.builds > 0 ? (
                      <span className="ml-2 text-xs">
                        <span className="text-emerald-600 dark:text-emerald-400">{r.succeeded}</span>
                        <span className="text-black/30 dark:text-white/30"> / </span>
                        <span className="text-red-600 dark:text-red-400">{r.failed}</span>
                      </span>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">
                    <span className={r.balance === 0 ? "text-red-600 dark:text-red-400" : ""}>
                      {r.balance}
                    </span>
                    {drift ? (
                      <span
                        className="ml-1 text-amber-600 dark:text-amber-500"
                        title={`Ledger drift: newest balanceAfter is ${r.balance} but deltas sum to ${r.netDelta}`}
                      >
                        !
                      </span>
                    ) : null}
                    {u.spendCapCredits !== null ? (
                      <div className="text-xs text-black/50 dark:text-white/50">
                        cap {u.spendCapCredits}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-black/70 dark:text-white/70">
                    {r.spent}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-black/70 dark:text-white/70">
                    {formatUsd(r.costMicros, 4)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableFrame>
      )}

      <div className="mt-4 flex items-center justify-between text-sm">
        <span className="text-black/50 dark:text-white/50">
          {total === 0
            ? "0 users"
            : `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total}`}
        </span>
        <span className="flex gap-2">
          {page > 1 ? (
            <Link
              href={href({ q, sort, page: page - 1 })}
              className="rounded-xl border border-black/10 px-3 py-1.5 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
            >
              Previous
            </Link>
          ) : null}
          {page < pageCount ? (
            <Link
              href={href({ q, sort, page: page + 1 })}
              className="rounded-xl border border-black/10 px-3 py-1.5 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
            >
              Next
            </Link>
          ) : null}
        </span>
      </div>

      <p className="mt-6 text-xs text-black/50 dark:text-white/50">
        Balance is the newest ledger row&apos;s balanceAfter, matching lib/credits.ts. Spent is the
        sum of negative deltas. Cost is real model spend across every build on the user&apos;s
        projects, charged or not — failed builds cost us money and are never billed.
      </p>
    </div>
  );
}
