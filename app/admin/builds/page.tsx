import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminUser } from "@/lib/auth";
import { ADMIN_ACTIONS, recordAdminAction } from "@/lib/admin-audit";
import { family } from "../health/errors";
import {
  DEFAULT_FILTERS,
  LOW_DATA_BUILDS,
  MODEL_NONE,
  PAGE_SIZE,
  REPAIR_FILTERS,
  REPAIR_KEYS,
  STATUS_FILTERS,
  STATUS_KEYS,
  buildsHref,
  isFamilyId,
  isRepairKey,
  isStatusKey,
  loadBuildList,
  type BuildFilters,
} from "./data";
import {
  Dash,
  Empty,
  FamilyBadge,
  Notice,
  RatingMark,
  StatTile,
  TableFrame,
  Th,
  formatDateTime,
  formatDuration,
  formatUsd,
  modelLabel,
  oneLine,
  statusClass,
  truncate,
} from "./ui";

export const dynamic = "force-dynamic";

function first(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

const selectClass =
  "rounded-xl border border-black/10 bg-transparent px-3 py-2 text-sm outline-none dark:border-white/10";

export default async function AdminBuildsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // Defense in depth — app/admin/layout.tsx is the primary gate, but a layout
  // is not an authorization boundary on its own: it does not re-render on every
  // navigation within the section. 404 rather than redirect, so a non-admin
  // learns nothing about this path.
  const admin = await getAdminUser();
  if (!admin) notFound();

  const sp = await searchParams;
  const statusRaw = first(sp.status);
  const repairRaw = first(sp.repair);
  const familyRaw = first(sp.family);
  const pageRaw = Number.parseInt(first(sp.page), 10);

  // Every guard below is hasOwnProperty, never `in`. `in` walks the prototype
  // chain, so `?status=constructor` would pass a check whose entire job is to
  // say the value is one of ours, and reach Prisma as an undefined where clause
  // — a reachable 500 that has already happened three times in this codebase.
  const filters: BuildFilters = {
    ...DEFAULT_FILTERS,
    status: isStatusKey(statusRaw) ? statusRaw : "all",
    repair: isRepairKey(repairRaw) ? repairRaw : "all",
    family: isFamilyId(familyRaw) ? familyRaw : null,
    model: first(sp.model).trim(),
    projectId: first(sp.project).trim(),
    q: first(sp.q).trim(),
    page: Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1,
  };

  // Awaited BEFORE any customer data is read, so there is no window in which an
  // admin has the prompts and the log does not have the row.
  //
  // `dashboard.viewed` is the closest name lib/admin-audit.ts owns: it is
  // defined as "Cost, margin, and 50 recent builds including customer prompts",
  // which is this surface with a different pagination. It is NOT the right
  // name — `build_list.viewed` is — but that vocabulary is closed, this file
  // may not edit it, and inventing a name by string literal would defeat the
  // point of a closed set. `view` in meta keeps the two readable apart in the
  // log until the real names land; see the report accompanying this change.
  //
  // meta records WHETHER a search happened, never the term. On this page the
  // term is a substring of a customer's prompt — an audit log that quietly
  // accumulates customer content is a second data-protection problem wearing
  // the clothes of a solution. The rule is stated at the top of
  // lib/admin-audit.ts.
  await recordAdminAction(admin, ADMIN_ACTIONS.buildListViewed, {
    meta: {
      page: filters.page,
      searched: Boolean(filters.q),
      status: filters.status,
      repair: filters.repair,
      family: filters.family ?? "any",
      scopedToProject: Boolean(filters.projectId),
    },
  });

  const list = await loadBuildList(filters);

  // The family filter implies FAILED — a family only exists for a failure — so
  // the status control has to show what is actually in force.
  const shownStatus = filters.family ? "failed" : filters.status;
  const familyOffered = shownStatus === "all" || shownStatus === "failed";

  const succeeded = list.rows.filter((r) => r.status === "SUCCEEDED").length;
  const failed = list.rows.filter((r) => r.status === "FAILED").length;
  const repaired = list.rows.filter((r) => r.repairAttempts > 0).length;
  const dominant = list.families[0] ?? null;
  const filtered =
    shownStatus !== "all" ||
    filters.repair !== "all" ||
    Boolean(filters.model) ||
    Boolean(filters.family) ||
    Boolean(filters.projectId) ||
    Boolean(filters.q);

  const from = list.total === 0 ? 0 : (list.page - 1) * PAGE_SIZE + 1;
  const to = Math.min(list.page * PAGE_SIZE, list.total);

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <Link
          href="/admin"
          className="text-xs text-black/50 underline-offset-4 hover:underline dark:text-white/50"
        >
          ← kodely admin
        </Link>
        <div className="mt-1 text-lg font-semibold tracking-tight">Builds</div>
        <p className="text-sm text-black/60 dark:text-white/60">
          Read-only. Every generation this system has run — the view that answers &ldquo;why did
          this one go wrong&rdquo;. Prompts are truncated here; the full text is on a build&apos;s
          own page.
        </p>
      </div>

      {list.totalAllTime < LOW_DATA_BUILDS ? (
        <div className="mb-6">
          <Notice>
            <span className="font-medium">Low data.</span> This database holds{" "}
            <span className="tabular-nums">{list.totalAllTime}</span> build
            {list.totalAllTime === 1 ? "" : "s"} in total
            {dominant ? (
              <>
                , and <span className="tabular-nums">{dominant.count}</span> of{" "}
                <span className="tabular-nums">{list.classified}</span> classified failure
                {list.classified === 1 ? "" : "s"} land in{" "}
                <span className="font-medium">{family(dominant.id).label}</span> — blame:{" "}
                {family(dominant.id).blame}
              </>
            ) : null}
            . Treat every share, rate and comparison on these pages as an anecdote about specific
            rows, not a measurement. A run of identical config failures is one incident, not a
            trend.
          </Notice>
        </div>
      ) : null}

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile
          label="Builds matching"
          value={list.total}
          hint={
            list.totalIsFloor
              ? `at least — scan capped at ${list.classified}`
              : filtered
                ? `${list.totalAllTime} in total`
                : "no filters"
          }
        />
        <StatTile
          label="On this page"
          value={
            <>
              <span className="text-emerald-600 dark:text-emerald-400">{succeeded}</span>
              <span className="text-black/30 dark:text-white/30"> / </span>
              <span className="text-red-600 dark:text-red-400">{failed}</span>
            </>
          }
          hint={`${list.rows.length} row${list.rows.length === 1 ? "" : "s"} · succeeded / failed`}
        />
        <StatTile
          label="Needed a repair"
          value={repaired}
          tone={repaired > 0 ? "warn" : undefined}
          hint="on this page"
        />
        <StatTile label="Page" value={`${list.page} / ${list.pageCount}`} />
      </div>

      <form method="get" action="/admin/builds" className="mb-6 flex flex-wrap items-center gap-2">
        <input
          type="search"
          name="q"
          defaultValue={filters.q}
          placeholder="Search prompt text"
          aria-label="Search build prompts"
          className="w-full max-w-xs rounded-xl border border-black/10 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-black/40 focus:border-black/30 dark:border-white/10 dark:placeholder:text-white/40 dark:focus:border-white/30"
        />
        <select name="status" defaultValue={shownStatus} aria-label="Filter by status" className={selectClass}>
          {STATUS_KEYS.map((k) => (
            <option key={k} value={k}>
              {STATUS_FILTERS[k].label}
            </option>
          ))}
        </select>
        <select name="model" defaultValue={filters.model} aria-label="Filter by model" className={selectClass}>
          <option value="">Any model</option>
          {list.models.map((m) => (
            <option key={m || MODEL_NONE} value={m || MODEL_NONE}>
              {modelLabel(m)}
            </option>
          ))}
        </select>
        <select
          name="family"
          defaultValue={filters.family ?? ""}
          aria-label="Filter by error family"
          disabled={!familyOffered}
          className={`${selectClass} disabled:opacity-40`}
        >
          <option value="">Any error family</option>
          {list.families.map((f) => (
            <option key={f.id} value={f.id}>
              {family(f.id).label} ({f.count})
            </option>
          ))}
        </select>
        <select name="repair" defaultValue={filters.repair} aria-label="Filter by repair" className={selectClass}>
          {REPAIR_KEYS.map((k) => (
            <option key={k} value={k}>
              {REPAIR_FILTERS[k].label}
            </option>
          ))}
        </select>
        {filters.projectId ? <input type="hidden" name="project" value={filters.projectId} /> : null}
        <button
          type="submit"
          className="rounded-xl border border-black/10 px-3 py-2 text-sm font-medium hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
        >
          Apply
        </button>
        {filtered ? (
          <Link
            href="/admin/builds"
            className="text-sm text-black/50 underline-offset-4 hover:underline dark:text-white/50"
          >
            Clear
          </Link>
        ) : null}
      </form>

      {filters.projectId ? (
        <p className="mb-4 text-xs text-black/50 dark:text-white/50">
          Scoped to project <span className="font-mono">{truncate(filters.projectId, 30)}</span>.{" "}
          <Link href={buildsHref({ ...filters, projectId: "", page: 1 })} className="underline underline-offset-2">
            Show every project
          </Link>
        </p>
      ) : null}

      {filters.family ? (
        <p className="mb-4 text-xs text-black/50 dark:text-white/50">
          Filtering by error family classifies {list.classified} failure
          {list.classified === 1 ? "" : "s"} in TypeScript (the rules in app/admin/health/errors.ts
          are regexes, not SQL), so status is pinned to Failed
          {list.totalIsFloor
            ? ` and the count is a floor — the scan stopped at ${list.classified} rows.`
            : "."}
        </p>
      ) : null}

      {list.rows.length === 0 ? (
        <Empty>
          {filtered
            ? "No builds match these filters."
            : "No builds yet. Nothing has been generated on this instance."}
        </Empty>
      ) : (
        <TableFrame>
          <thead>
            <tr className="border-b border-black/10 text-xs text-black/50 dark:border-white/10 dark:text-white/50">
              <Th>Started</Th>
              <Th>Status</Th>
              <Th>Project</Th>
              <Th>Owner</Th>
              <Th>Model</Th>
              <Th align="right">Took</Th>
              <Th align="right">Rep</Th>
              <Th align="right">Tokens</Th>
              <Th align="right">Cost</Th>
              <Th align="right">Cr</Th>
              <Th>Rated</Th>
              <Th>Prompt / error</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/10 dark:divide-white/10">
            {list.rows.map((b) => (
              <tr key={b.id}>
                <td className="whitespace-nowrap px-4 py-2 tabular-nums">
                  <Link
                    href={`/admin/builds/${b.id}`}
                    className="underline-offset-4 hover:underline"
                  >
                    {formatDateTime(b.createdAt)}
                  </Link>
                </td>
                <td className={`px-4 py-2 font-medium ${statusClass(b.status)}`}>{b.status}</td>
                <td className="max-w-[9rem] px-4 py-2 text-black/70 dark:text-white/70">
                  <Link
                    href={`/admin/sites/${b.project.id}`}
                    className="underline-offset-4 hover:underline"
                  >
                    {truncate(b.project.name, 22)}
                  </Link>
                </td>
                <td className="max-w-[11rem] px-4 py-2 text-black/70 dark:text-white/70">
                  <Link
                    href={`/admin/users/${b.project.user.id}`}
                    className="underline-offset-4 hover:underline"
                  >
                    {truncate(b.project.user.email, 26)}
                  </Link>
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-black/70 dark:text-white/70">
                  {b.model ? (
                    truncate(b.model, 26)
                  ) : (
                    <span className="text-black/30 dark:text-white/30">not stamped</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums text-black/70 dark:text-white/70">
                  {formatDuration(b.createdAt, b.endedAt)}
                </td>
                <td
                  className={`px-4 py-2 text-right tabular-nums ${
                    b.repairAttempts > 0
                      ? "font-medium text-amber-600 dark:text-amber-500"
                      : "text-black/70 dark:text-white/70"
                  }`}
                >
                  {b.repairAttempts}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums text-black/70 dark:text-white/70">
                  {b.inputTokens + b.outputTokens === 0 ? (
                    <Dash />
                  ) : (
                    <span title={`${b.inputTokens} in / ${b.outputTokens} out`}>
                      {b.inputTokens + b.outputTokens}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-black/70 dark:text-white/70">
                  {formatUsd(b.costMicros, 4)}
                </td>
                <td
                  className={`px-4 py-2 text-right tabular-nums ${
                    b.status !== "SUCCEEDED" && b.creditsCharged > 0
                      ? "font-medium text-amber-600 dark:text-amber-500"
                      : "text-black/70 dark:text-white/70"
                  }`}
                >
                  {b.creditsCharged}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-xs">
                  {b.ratings.length === 0 ? <Dash /> : <RatingMark rating={b.ratings[0].rating} />}
                </td>
                <td className="max-w-sm px-4 py-2 text-black/60 dark:text-white/60">
                  {oneLine(b.prompt, 70)}
                  {b.familyId ? (
                    <div className="mt-1">
                      <FamilyBadge id={b.familyId} showBlame={false} />
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </TableFrame>
      )}

      <div className="mt-4 flex items-center justify-between text-sm">
        <span className="text-black/50 dark:text-white/50">
          {list.total === 0
            ? "0 builds"
            : `${from}–${to} of ${list.totalIsFloor ? `at least ${list.total}` : list.total}`}
        </span>
        <span className="flex gap-2">
          {list.page > 1 ? (
            <Link
              href={buildsHref({ ...filters, status: shownStatus, page: list.page - 1 })}
              className="rounded-xl border border-black/10 px-3 py-1.5 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
            >
              Previous
            </Link>
          ) : null}
          {list.page < list.pageCount ? (
            <Link
              href={buildsHref({ ...filters, status: shownStatus, page: list.page + 1 })}
              className="rounded-xl border border-black/10 px-3 py-1.5 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
            >
              Next
            </Link>
          ) : null}
        </span>
      </div>

      <p className="mt-6 text-xs text-black/50 dark:text-white/50">
        Error families come from app/admin/health/errors.ts — the same classifier /admin/health
        clusters by, imported rather than re-implemented. Cost is real model spend; credits are what
        the customer was charged, and a failed build charged anything but zero is a fault (shown in
        amber). This page never renders the contents of a build&apos;s file snapshot.
      </p>
    </div>
  );
}
