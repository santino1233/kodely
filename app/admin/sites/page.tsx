import Link from "next/link";
import { notFound } from "next/navigation";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getAdminUser } from "@/lib/auth";
import { ADMIN_ACTIONS, recordAdminAction } from "@/lib/admin-audit";
import {
  CacheCaveatLine,
  Empty,
  Panel,
  StatTile,
  TableFrame,
  Th,
  formatDate,
  formatDateTime,
  hasKey,
  severityClass,
  truncate,
} from "./ui";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

// ── Caps ──────────────────────────────────────────────────────────────────
// Two of the views filter Project by an id set assembled from another table.
// Both sets are small by nature — a flagged site is the exception, a taken-down
// site more so — but "small by nature" is not a bound, and an unbounded IN ()
// list is how a page like this dies quietly a year from now. Each cap is
// surfaced in the UI when it actually bites, rather than silently truncating.
const FLAGGED_SITE_CAP = 2000;
const TAKEN_DOWN_CAP = 2000;

type View = "live" | "flagged" | "down";

const VIEWS: Record<View, { label: string; blurb: string }> = {
  live: {
    label: "Live",
    blurb: "Every project with publishedAt set — the sites currently resolving on *.kodely.site.",
  },
  flagged: {
    label: "Needs review",
    blurb: "Live sites carrying at least one moderation finding nobody has ruled on yet.",
  },
  down: {
    label: "Taken down",
    blurb:
      "Projects an operator took offline from this panel and which are still offline. Read out of AdminAuditLog — publishedAt alone cannot tell a takedown from a site that was never published.",
  },
};

// hasKey rather than `v in VIEWS` — see the note on hasKey in ./ui. `"toString"
// in VIEWS` is true, and `VIEWS.toString.label` is undefined, which was a live
// 500 on `/admin/sites?view=toString`.
function isView(v: unknown): v is View {
  return hasKey(VIEWS, v);
}

type SortKey = "recent" | "oldest" | "slug" | "updated";

/**
 * DATABASE-NATIVE sorts only, for the same reason app/admin/users/page.tsx
 * gives: finding count, file count and last build are all rolled up per PAGE
 * from other tables, so offering "sort by findings" would sort 25 arbitrary
 * rows and look like it had sorted the registry. The "Needs review" view is the
 * honest version of that request — it filters in the database instead.
 */
const SORTS: Record<SortKey, { label: string; orderBy: Prisma.ProjectOrderByWithRelationInput }> = {
  recent: { label: "Newest publish", orderBy: { publishedAt: "desc" } },
  oldest: { label: "Oldest publish", orderBy: { publishedAt: "asc" } },
  updated: { label: "Recently changed", orderBy: { updatedAt: "desc" } },
  slug: { label: "Slug", orderBy: { slug: "asc" } },
};

/** Same guard, same reason: `?sort=constructor` reached Prisma as
 * `orderBy: [undefined, …]` and threw. */
function isSortKey(v: unknown): v is SortKey {
  return hasKey(SORTS, v);
}

function first(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

function href(params: { q: string; view: View; sort: SortKey; page: number }): string {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.view !== "live") sp.set("view", params.view);
  if (params.sort !== "recent") sp.set("sort", params.sort);
  if (params.page > 1) sp.set("page", String(params.page));
  const qs = sp.toString();
  return qs ? `/admin/sites?${qs}` : "/admin/sites";
}

// ── Per-page rollups ──────────────────────────────────────────────────────
// Everything below is keyed by projectId and fetched for the CURRENT PAGE ONLY,
// in a fixed number of queries regardless of how many sites are on it. No query
// ever runs inside a loop over rows.

type FindingRollupRow = {
  projectId: string;
  total: number;
  high: number;
  medium: number;
  low: number;
  blocked: number;
  unreviewed: number;
  falsePositive: number;
  lastFindingAt: Date | null;
};

type RuleAccuracyRow = {
  rule: string;
  total: number;
  sites: number;
  high: number;
  medium: number;
  low: number;
  blocked: number;
  reviewed: number;
  truePositive: number;
  falsePositive: number;
};

type Rollup = {
  findings: FindingRollupRow | null;
  files: number;
  builds: number;
  lastBuildAt: Date | null;
  takenDownAt: Date | null;
};

export default async function AdminSitesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // Defense in depth — app/admin/layout.tsx is the primary gate, but a layout
  // is not an authorization boundary on its own (it does not re-render on every
  // navigation within the section). 404 rather than redirect, so a non-admin
  // learns nothing about this path. Same idiom as every other page here.
  const admin = await getAdminUser();
  if (!admin) notFound();

  const sp = await searchParams;
  const q = first(sp.q).trim();
  const viewRaw = first(sp.view);
  const view: View = isView(viewRaw) ? viewRaw : "live";
  const sortRaw = first(sp.sort);
  const sort: SortKey = isSortKey(sortRaw) ? sortRaw : "recent";
  const pageRaw = Number.parseInt(first(sp.page), 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;

  // BEFORE the reads, and awaited — see recordAdminAction in lib/admin-audit.ts.
  // This page lists other people's sites and the email of everyone who owns
  // one, so there must be no window in which an admin has that and the log does
  // not have the row.
  //
  // `page` only. NOT `q`: a search on this page is almost always a slug or a
  // customer's email address, and copying those into an append-only table is
  // how an accountability record turns into a second store of customer data.
  await recordAdminAction(admin, ADMIN_ACTIONS.siteListViewed, { meta: { page } });

  // ── Whole-table figures, and the id sets the two filtered views need ─────
  // ModerationFinding has no relation to Project (see prisma/schema.prisma), so
  // "which sites are flagged" cannot be a join in the Project query — it is one
  // grouped read of the findings table, done once here, not once per row.
  const [liveCount, findingTotal, unreviewedTotal, flaggedGroups, takenDownRows] =
    await Promise.all([
      db.project.count({ where: { publishedAt: { not: null } } }),
      db.moderationFinding.count(),
      db.moderationFinding.count({ where: { reviewedAt: null } }),
      db.moderationFinding.groupBy({
        by: ["projectId"],
        where: { reviewedAt: null },
        orderBy: { projectId: "asc" },
        take: FLAGGED_SITE_CAP,
      }),
      // Takedown is not a column — clearing publishedAt is indistinguishable
      // from "never published". The audit row written alongside it is the only
      // record that a takedown happened, so this view reads from there.
      db.$queryRaw<{ targetId: string; takenDownAt: Date }[]>`
        SELECT a."targetId", MAX(a."createdAt") AS "takenDownAt"
        FROM "AdminAuditLog" a
        WHERE a."action" = 'site.taken_down' AND a."targetType" = 'project'
          AND a."targetId" IS NOT NULL
        GROUP BY a."targetId"
        ORDER BY MAX(a."createdAt") DESC
        LIMIT ${TAKEN_DOWN_CAP}`,
    ]);

  const flaggedIds = flaggedGroups.map((g) => g.projectId);
  const takenDownAt = new Map(takenDownRows.map((r) => [r.targetId, r.takenDownAt]));

  // Search is by the two things an abuse report actually gives you: the
  // subdomain, or the person who owns it. Raw project id is accepted too, for
  // pasting straight out of a log line.
  const search: Prisma.ProjectWhereInput[] = q
    ? [
        {
          OR: [
            { slug: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
            { user: { email: { contains: q, mode: "insensitive" } } },
            { id: q },
          ],
        },
      ]
    : [];

  const scope: Prisma.ProjectWhereInput =
    view === "down"
      ? { publishedAt: null, id: { in: [...takenDownAt.keys()] } }
      : view === "flagged"
        ? { publishedAt: { not: null }, id: { in: flaggedIds } }
        : { publishedAt: { not: null } };

  const where: Prisma.ProjectWhereInput = { ...scope, AND: search };

  // publishedAt is null in the "Taken down" view, so ordering by it there would
  // be ordering by nothing. Project.updatedAt is bumped by the takedown write
  // itself (@updatedAt), which makes it the closest database-native stand-in for
  // takedown recency; the exact audit timestamp is shown per row.
  const orderBy: Prisma.ProjectOrderByWithRelationInput[] =
    view === "down"
      ? [{ updatedAt: "desc" }, { id: "asc" }]
      : // `id` breaks ties so pagination is stable when timestamps collide.
        [SORTS[sort].orderBy, { id: "asc" }];

  const [total, flaggedLive, projects] = await Promise.all([
    db.project.count({ where }),
    // The tile has to count the same thing the "Needs review" VIEW filters on,
    // or the two disagree and one of them is wrong. flaggedIds comes from the
    // findings table, which has no relation to Project — so it also contains
    // projects that were never published, were taken down, or have since been
    // deleted (nothing cascades findings away). Intersecting with `publishedAt`
    // here is one extra count for the page, not one per row.
    db.project.count({ where: { publishedAt: { not: null }, id: { in: flaggedIds } } }),
    db.project.findMany({
      where,
      orderBy,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        name: true,
        slug: true,
        createdAt: true,
        updatedAt: true,
        publishedAt: true,
        // A relation select, not a per-row lookup — Prisma resolves this for the
        // whole page in one additional statement.
        user: { select: { id: true, email: true } },
      },
    }),
  ]);

  const ids = projects.map((p) => p.id);

  // Three grouped reads for the page, in parallel. Not three per row.
  const [findingRows, buildRows, fileRows, ruleRows] = await Promise.all([
    ids.length
      ? db.$queryRaw<FindingRollupRow[]>`
          SELECT f."projectId",
                 COUNT(*)::int AS "total",
                 COUNT(*) FILTER (WHERE f."severity" = 'high')::int AS "high",
                 COUNT(*) FILTER (WHERE f."severity" = 'medium')::int AS "medium",
                 COUNT(*) FILTER (WHERE f."severity" = 'low')::int AS "low",
                 COUNT(*) FILTER (WHERE f."action" = 'blocked')::int AS "blocked",
                 COUNT(*) FILTER (WHERE f."reviewedAt" IS NULL)::int AS "unreviewed",
                 COUNT(*) FILTER (WHERE f."outcome" = 'false_positive')::int AS "falsePositive",
                 MAX(f."createdAt") AS "lastFindingAt"
          FROM "ModerationFinding" f
          WHERE f."projectId" IN (${Prisma.join(ids)})
          GROUP BY f."projectId"`
      : Promise.resolve([]),
    ids.length
      ? db.build.groupBy({
          by: ["projectId"],
          where: { projectId: { in: ids } },
          _count: { _all: true },
          _max: { createdAt: true },
        })
      : Promise.resolve([]),
    // The file count that matters on this page is what is actually SERVED:
    // published build output. Draft rows and the Vite source tree are neither
    // reachable at the subdomain nor relevant to a takedown decision.
    ids.length
      ? db.projectFile.groupBy({
          by: ["projectId"],
          where: { projectId: { in: ids }, published: true, kind: "build" },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    // Whole-table, not per-page: this panel is about how good the RULES are,
    // which is not a property of whichever 25 sites you are looking at.
    db.$queryRaw<RuleAccuracyRow[]>`
      SELECT f."rule",
             COUNT(*)::int AS "total",
             COUNT(DISTINCT f."projectId")::int AS "sites",
             COUNT(*) FILTER (WHERE f."severity" = 'high')::int AS "high",
             COUNT(*) FILTER (WHERE f."severity" = 'medium')::int AS "medium",
             COUNT(*) FILTER (WHERE f."severity" = 'low')::int AS "low",
             COUNT(*) FILTER (WHERE f."action" = 'blocked')::int AS "blocked",
             COUNT(*) FILTER (WHERE f."reviewedAt" IS NOT NULL)::int AS "reviewed",
             COUNT(*) FILTER (WHERE f."outcome" = 'true_positive')::int AS "truePositive",
             COUNT(*) FILTER (WHERE f."outcome" = 'false_positive')::int AS "falsePositive"
      FROM "ModerationFinding" f
      GROUP BY f."rule"
      ORDER BY COUNT(*) DESC`,
  ]);

  const rollups = new Map<string, Rollup>(
    ids.map((id) => [
      id,
      { findings: null, files: 0, builds: 0, lastBuildAt: null, takenDownAt: takenDownAt.get(id) ?? null },
    ]),
  );
  for (const r of findingRows) {
    const p = rollups.get(r.projectId);
    if (p) p.findings = r;
  }
  for (const r of buildRows) {
    const p = rollups.get(r.projectId);
    if (!p) continue;
    p.builds = r._count._all;
    p.lastBuildAt = r._max.createdAt;
  }
  for (const r of fileRows) {
    const p = rollups.get(r.projectId);
    if (p) p.files = r._count._all;
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const flaggedCapped = flaggedIds.length >= FLAGGED_SITE_CAP;
  const takenDownCapped = takenDownAt.size >= TAKEN_DOWN_CAP;

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <Link
          href="/admin"
          className="text-xs text-black/50 underline-offset-4 hover:underline dark:text-white/50"
        >
          ← kodely admin
        </Link>
        <div className="mt-1 text-lg font-semibold tracking-tight">Published sites</div>
        <p className="text-sm text-black/60 dark:text-white/60">
          Everything currently reachable on <span className="font-mono text-xs">*.kodely.site</span>,
          what the abuse scanner flagged on it, and the one lever that takes it offline.
        </p>
      </div>

      {findingTotal === 0 ? (
        <div className="mb-6 rounded-xl border border-amber-500/40 bg-amber-500/5 p-5 text-sm">
          <h2 className="text-sm font-medium text-amber-700 dark:text-amber-500">
            The findings table is empty — that is not the same as &ldquo;no abuse&rdquo;
          </h2>
          <p className="mt-2 text-black/70 dark:text-white/70">
            Nothing has ever written a <span className="font-mono text-xs">ModerationFinding</span>{" "}
            row. <span className="font-mono text-xs">lib/moderation.ts</span> runs on every publish
            and <span className="font-mono text-xs">app/api/projects/[id]/publish/route.ts</span>{" "}
            still only <span className="font-mono text-xs">console.warn</span>s the sub-blocking
            findings, so they exist in the logs and nowhere else. Read an empty findings column below
            as <em>&ldquo;never recorded&rdquo;</em>, never as <em>&ldquo;came back clean&rdquo;</em>
            . Blocking (<span className="font-mono text-xs">high</span>) findings never reach this
            table at all, by construction: the publish is refused, so the site was never live.
          </p>
        </div>
      ) : null}

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-5">
        <StatTile label="Live sites" value={liveCount} hint="publishedAt is set" />
        <StatTile
          label="Sites needing review"
          value={flaggedLive}
          tone={flaggedLive > 0 ? "warn" : undefined}
          hint={flaggedCapped ? `capped at ${FLAGGED_SITE_CAP}` : "live, ≥1 unruled finding"}
        />
        <StatTile label="Findings recorded" value={findingTotal} />
        <StatTile
          label="Unreviewed findings"
          value={unreviewedTotal}
          tone={unreviewedTotal > 0 ? "warn" : undefined}
        />
        <StatTile
          label="Taken down"
          value={takenDownAt.size}
          hint={takenDownCapped ? `capped at ${TAKEN_DOWN_CAP}` : "from the audit log"}
        />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {(Object.keys(VIEWS) as View[]).map((v) => (
          <Link
            key={v}
            href={href({ q, view: v, sort, page: 1 })}
            aria-current={v === view ? "page" : undefined}
            className={`rounded-xl border px-3 py-1.5 text-sm ${
              v === view
                ? "border-black/40 font-medium dark:border-white/40"
                : "border-black/10 text-black/60 hover:bg-black/5 dark:border-white/10 dark:text-white/60 dark:hover:bg-white/5"
            }`}
          >
            {VIEWS[v].label}
          </Link>
        ))}
      </div>
      <p className="mb-6 text-xs text-black/50 dark:text-white/50">{VIEWS[view].blurb}</p>

      <form method="get" action="/admin/sites" className="mb-6 flex flex-wrap items-center gap-2">
        {view !== "live" ? <input type="hidden" name="view" value={view} /> : null}
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search slug, owner email or project id"
          aria-label="Search published sites"
          className="w-full max-w-sm rounded-xl border border-black/10 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-black/40 focus:border-black/30 dark:border-white/10 dark:placeholder:text-white/40 dark:focus:border-white/30"
        />
        <select
          name="sort"
          defaultValue={sort}
          aria-label="Sort sites"
          disabled={view === "down"}
          className="rounded-xl border border-black/10 bg-transparent px-3 py-2 text-sm outline-none disabled:opacity-40 dark:border-white/10"
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
            href={href({ q: "", view, sort, page: 1 })}
            className="text-sm text-black/50 underline-offset-4 hover:underline dark:text-white/50"
          >
            Clear
          </Link>
        ) : null}
      </form>

      {projects.length === 0 ? (
        <Empty>
          {q
            ? `No ${VIEWS[view].label.toLowerCase()} site matches “${truncate(q, 40)}”.`
            : view === "flagged"
              ? findingTotal === 0
                ? "Nothing is waiting on a review. With the findings table still unpopulated, this view will stay empty even if sites are being flagged at publish time."
                : "Nothing is waiting on a review — every finding on a live site has been ruled on."
              : view === "down"
                ? "No site has been taken down from this panel."
                : "No project has ever been published."}
        </Empty>
      ) : (
        <TableFrame>
          <thead>
            <tr className="border-b border-black/10 text-xs text-black/50 dark:border-white/10 dark:text-white/50">
              <Th>Slug</Th>
              <Th>Owner</Th>
              <Th>{view === "down" ? "Taken down" : "Published"}</Th>
              <Th>Last build</Th>
              <Th align="right">Files</Th>
              <Th>Findings</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/10 dark:divide-white/10">
            {projects.map((p) => {
              const r = rollups.get(p.id);
              const f = r?.findings ?? null;
              return (
                <tr key={p.id}>
                  <td className="max-w-xs px-4 py-2">
                    <Link
                      href={`/admin/sites/${p.id}`}
                      className="font-mono text-xs font-medium underline-offset-4 hover:underline"
                    >
                      {truncate(p.slug, 40)}
                    </Link>
                    <div className="text-xs text-black/50 dark:text-white/50">
                      {truncate(p.name, 40)}
                    </div>
                  </td>
                  <td className="max-w-[14rem] px-4 py-2">
                    <Link
                      href={`/admin/users/${p.user.id}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {truncate(p.user.email, 34)}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 tabular-nums">
                    {view === "down" ? (
                      r?.takenDownAt ? (
                        <span className="text-black/70 dark:text-white/70">
                          {formatDateTime(r.takenDownAt)}
                        </span>
                      ) : (
                        <span className="text-black/40 dark:text-white/40">—</span>
                      )
                    ) : p.publishedAt ? (
                      <span className="text-emerald-600 dark:text-emerald-400">
                        {formatDate(p.publishedAt)}
                      </span>
                    ) : (
                      <span className="text-black/40 dark:text-white/40">draft</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 tabular-nums text-black/70 dark:text-white/70">
                    {r?.lastBuildAt ? (
                      <>
                        {formatDate(r.lastBuildAt)}
                        <span className="ml-2 text-xs text-black/40 dark:text-white/40">
                          {r.builds} total
                        </span>
                      </>
                    ) : (
                      <span className="text-black/40 dark:text-white/40">never</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-black/70 dark:text-white/70">
                    {r?.files ?? 0}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2">
                    {f === null ? (
                      <span className="text-black/30 dark:text-white/30">none recorded</span>
                    ) : (
                      <span className="tabular-nums">
                        {f.high > 0 ? (
                          <span className={`mr-2 font-medium ${severityClass("high")}`}>
                            {f.high} high
                          </span>
                        ) : null}
                        {f.medium > 0 ? (
                          <span className={`mr-2 ${severityClass("medium")}`}>{f.medium} med</span>
                        ) : null}
                        {f.low > 0 ? (
                          <span className={`mr-2 ${severityClass("low")}`}>{f.low} low</span>
                        ) : null}
                        {f.unreviewed > 0 ? (
                          <span className="text-xs font-medium text-amber-600 dark:text-amber-500">
                            {f.unreviewed} unreviewed
                          </span>
                        ) : (
                          <span className="text-xs text-emerald-600 dark:text-emerald-400">
                            all reviewed
                          </span>
                        )}
                      </span>
                    )}
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
            ? "0 sites"
            : `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total}`}
        </span>
        <span className="flex gap-2">
          {page > 1 ? (
            <Link
              href={href({ q, view, sort, page: page - 1 })}
              className="rounded-xl border border-black/10 px-3 py-1.5 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
            >
              Previous
            </Link>
          ) : null}
          {page < pageCount ? (
            <Link
              href={href({ q, view, sort, page: page + 1 })}
              className="rounded-xl border border-black/10 px-3 py-1.5 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
            >
              Next
            </Link>
          ) : null}
        </span>
      </div>

      <div className="mt-8">
        <Panel
          title="Rule accuracy"
          subtitle={
            <>
              Every finding ever recorded, grouped by rule — not just this page. The false-positive
              column is the number that decides whether a <span className="font-mono">medium</span>{" "}
              rule can be promoted to blocking, and it only moves when someone rules on findings in
              the site detail pages.
            </>
          }
        >
          {ruleRows.length === 0 ? (
            <Empty>
              No findings have been recorded, so no rule has an accuracy yet. Until the publish route
              writes to this table, the false-positive rate stays unmeasurable and no rule can be
              promoted on evidence.
            </Empty>
          ) : (
            <TableFrame>
              <thead>
                <tr className="border-b border-black/10 text-xs text-black/50 dark:border-white/10 dark:text-white/50">
                  <Th>Rule</Th>
                  <Th align="right">Findings</Th>
                  <Th align="right">Sites</Th>
                  <Th>Severity mix</Th>
                  <Th align="right">Reviewed</Th>
                  <Th align="right">FP rate</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/10 dark:divide-white/10">
                {ruleRows.map((r) => {
                  const fpRate = r.reviewed === 0 ? null : (r.falsePositive / r.reviewed) * 100;
                  return (
                    <tr key={r.rule}>
                      <td className="max-w-sm px-4 py-2 font-mono text-xs">{r.rule}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-black/70 dark:text-white/70">
                        {r.total}
                        {r.blocked > 0 ? (
                          <span className="ml-2 text-xs text-red-600 dark:text-red-400">
                            {r.blocked} blocked
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-black/70 dark:text-white/70">
                        {r.sites}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-xs tabular-nums">
                        {r.high > 0 ? (
                          <span className={`mr-2 ${severityClass("high")}`}>{r.high} high</span>
                        ) : null}
                        {r.medium > 0 ? (
                          <span className={`mr-2 ${severityClass("medium")}`}>{r.medium} med</span>
                        ) : null}
                        {r.low > 0 ? (
                          <span className={severityClass("low")}>{r.low} low</span>
                        ) : null}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-black/70 dark:text-white/70">
                        {r.reviewed} / {r.total}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {fpRate === null ? (
                          <span className="text-black/30 dark:text-white/30">—</span>
                        ) : (
                          <span
                            className={
                              fpRate >= 20
                                ? "font-medium text-amber-600 dark:text-amber-500"
                                : "text-black/70 dark:text-white/70"
                            }
                            title={`${r.falsePositive} false positive of ${r.reviewed} reviewed`}
                          >
                            {fpRate.toFixed(0)}%
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </TableFrame>
          )}
        </Panel>
      </div>

      <p className="mt-6 text-xs text-black/50 dark:text-white/50">
        A site is live when, and only when, <span className="font-mono">Project.publishedAt</span> is
        set — <span className="font-mono">app/api/site/[slug]</span> 404s every path without it, and{" "}
        <span className="font-mono">proxy.ts</span> holds no state of its own. Files counts the
        published build output that is actually served, not the draft tree or the Vite sources. Site
        content itself is never rendered in this panel; the hostname on each detail page is the way
        to look at a site.{" "}
        {liveCount > 0 && findingTotal === 0
          ? `All ${liveCount} live site(s) show no findings because nothing writes them yet — see the note above.`
          : null}
      </p>

      {/* Stated on the registry too, not only behind the takedown button — this
          is the page someone reads while writing "taken down at 14:02" into a
          reply to an abuse report. */}
      <p className="mt-2 text-xs text-black/50 dark:text-white/50">
        <CacheCaveatLine />
      </p>
    </div>
  );
}
