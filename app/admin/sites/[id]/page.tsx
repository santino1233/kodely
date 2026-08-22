import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getAdminUser } from "@/lib/auth";
import { ADMIN_ACTIONS, ADMIN_TARGET_TYPES, recordAdminAction } from "@/lib/admin-audit";
import { reviewFinding } from "../actions";
import {
  CacheCaveat,
  CacheCaveatLine,
  Empty,
  Notice,
  Panel,
  RULE_NOTES,
  SeverityBadge,
  StatTile,
  TableFrame,
  Th,
  buttonClass,
  evidenceText,
  formatDateTime,
  lookup,
  outcomeClass,
  outcomeLabel,
  severityRank,
  siteHost,
  truncate,
} from "../ui";

export const dynamic = "force-dynamic";

// Bounded read. Findings accumulate per publish ATTEMPT, so a project that has
// been republished a hundred times can hold a lot of rows even though each
// individual scan is capped (MAX_FINDINGS_PER_RULE in lib/moderation.ts). The
// table says so when it is showing a truncated view.
const FINDINGS_LIMIT = 300;
const AUDIT_LIMIT = 25;

function first(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

function metaSummary(meta: unknown): string {
  if (meta === null || typeof meta !== "object" || Array.isArray(meta)) return "";
  return Object.entries(meta as Record<string, unknown>)
    .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join("  ·  ");
}

export default async function AdminSiteDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // Defense in depth — see app/admin/page.tsx. The layout gate is the primary
  // one, but a layout must not be the sole authorization boundary.
  const admin = await getAdminUser();
  if (!admin) notFound();

  const { id } = await params;
  const flash = first((await searchParams).takedown);

  // Awaited, before the reads. This page shows one customer's site, the email
  // of the person who owns it, and quoted snippets of what they published —
  // recordAdminAction's contract is that the row lands first or the page does
  // not render. Target only; there is nothing to put in meta that the target id
  // does not already say.
  await recordAdminAction(admin, ADMIN_ACTIONS.siteViewed, {
    targetType: ADMIN_TARGET_TYPES.project,
    targetId: id,
  });

  const project = await db.project.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      slug: true,
      createdAt: true,
      updatedAt: true,
      publishedAt: true,
      user: { select: { id: true, email: true, name: true } },
    },
  });
  if (!project) notFound();

  const [findings, findingTotal, findingsEverywhere, fileGroups, buildAgg, audit] = await Promise.all([
    db.moderationFinding.findMany({
      where: { projectId: id },
      // Served straight off @@index([projectId, createdAt]). Re-sorted below by
      // review state and severity, which are not index-ordered.
      orderBy: { createdAt: "desc" },
      take: FINDINGS_LIMIT,
    }),
    db.moderationFinding.count({ where: { projectId: id } }),
    // Whole-table, so an empty findings list on THIS project can say which of
    // the two very different things it means: "this site scanned clean" only
    // makes sense once something, somewhere, has ever written a finding.
    db.moderationFinding.count(),
    // One grouped read covers all four file universes (draft/published ×
    // source/build) — see the ProjectFile comment in prisma/schema.prisma.
    db.projectFile.groupBy({
      by: ["published", "kind"],
      where: { projectId: id },
      _count: { _all: true },
    }),
    db.build.aggregate({
      where: { projectId: id },
      _count: { _all: true },
      _max: { createdAt: true },
    }),
    // Everything this panel has ever done to this project. The takedown writes
    // one of these in the same transaction as the unpublish, so this is the
    // only place a takedown is recorded as a takedown.
    db.adminAuditLog.findMany({
      where: { targetType: "project", targetId: id },
      orderBy: { createdAt: "desc" },
      take: AUDIT_LIMIT,
    }),
  ]);

  const servedFiles =
    fileGroups.find((g) => g.published && g.kind === "build")?._count._all ?? 0;
  const draftFiles = fileGroups.find((g) => !g.published && g.kind === "build")?._count._all ?? 0;
  const sourceFiles = fileGroups.find((g) => !g.published && g.kind === "source")?._count._all ?? 0;

  // Unreviewed first (this is a work queue), then worst severity, then newest.
  // `severity` is a free-text column, so ordering it in SQL would sort
  // alphabetically — "high, low, medium" — which is exactly backwards for the
  // middle two. The page-sized slice is already in memory, so sort it here.
  const sorted = [...findings].sort(
    (a, b) =>
      Number(a.reviewedAt !== null) - Number(b.reviewedAt !== null) ||
      severityRank(a.severity) - severityRank(b.severity) ||
      b.createdAt.getTime() - a.createdAt.getTime(),
  );

  const unreviewed = findings.filter((f) => f.reviewedAt === null).length;
  const high = findings.filter((f) => f.severity === "high").length;
  const blocked = findings.filter((f) => f.action === "blocked").length;
  const live = project.publishedAt !== null;
  const lastTakedown = audit.find((a) => a.action === "site.taken_down") ?? null;
  const host = siteHost(project.slug);

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <Link
          href="/admin/sites"
          className="text-xs text-black/50 underline-offset-4 hover:underline dark:text-white/50"
        >
          ← Published sites
        </Link>
        <div className="mt-1 font-mono text-lg font-semibold tracking-tight">{project.slug}</div>
        <p className="text-sm text-black/60 dark:text-white/60">
          {truncate(project.name, 60)} · owned by{" "}
          <Link
            href={`/admin/users/${project.user.id}`}
            className="underline-offset-4 hover:underline"
          >
            {project.user.email}
          </Link>{" "}
          · created {formatDateTime(project.createdAt)}
        </p>
        <p className="mt-1 font-mono text-xs text-black/40 dark:text-white/40">{project.id}</p>
      </div>

      {flash === "done" ? (
        <div className="mb-6 space-y-4">
          <Notice tone="good" title="Site taken down">
            <span className="font-mono text-xs">{host}</span> now returns 404 from the origin. The
            owner&apos;s project, draft tree and published files are all untouched — nothing was
            deleted.
          </Notice>
          {/* Right here, not "below": this notice is the moment someone decides
              what timestamp to put in a reply to an abuse report. */}
          <CacheCaveat />
        </div>
      ) : flash === "already" ? (
        <div className="mb-6">
          <Notice tone="warn" title="Nothing to do">
            This project was already offline when the takedown was submitted — most likely someone
            else got there first, or the owner never republished.
          </Notice>
        </div>
      ) : null}

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile
          label="Status"
          value={
            live ? (
              <span className="text-emerald-600 dark:text-emerald-400">Live</span>
            ) : (
              <span className="text-black/50 dark:text-white/50">Offline</span>
            )
          }
          hint={
            // The truthiness test, not `live`, so this narrows instead of
            // needing an `as Date` that would outlive whatever made it true.
            project.publishedAt
              ? `since ${formatDateTime(project.publishedAt)}`
              : lastTakedown
                ? `taken down ${formatDateTime(lastTakedown.createdAt)}`
                : "never published, or unpublished elsewhere"
          }
        />
        <StatTile label="Findings" value={findingTotal} hint="all publish attempts" />
        <StatTile
          label="Unreviewed"
          value={unreviewed}
          tone={unreviewed > 0 ? "warn" : undefined}
          hint={findingTotal > findings.length ? `of the ${findings.length} shown` : "on this page"}
        />
        <StatTile
          label="High severity"
          value={high}
          tone={high > 0 ? "bad" : undefined}
          hint={blocked > 0 ? `${blocked} blocked a publish` : "none blocked a publish"}
        />
        <StatTile label="Files served" value={servedFiles} hint={`${draftFiles} draft build files`} />
        <StatTile
          label="Builds"
          value={buildAgg._count._all}
          hint={
            buildAgg._max.createdAt ? `last ${formatDateTime(buildAgg._max.createdAt)}` : "never built"
          }
        />
      </div>

      <div className="mb-8 grid gap-4 lg:grid-cols-2">
        <Panel
          title="The live site"
          subtitle="Reviewing means looking at the page itself. This panel never renders site content."
        >
          <div className="font-mono text-sm">{host}</div>
          {live ? (
            <a
              href={`https://${host}`}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className={`mt-3 inline-block ${buttonClass()}`}
            >
              Open in a new tab ↗
            </a>
          ) : (
            <p className="mt-3 text-sm text-black/50 dark:text-white/50">
              Offline — this hostname currently 404s.
            </p>
          )}
          <p className="mt-3 text-xs text-black/50 dark:text-white/50">
            Only the public hostname is linked, never the internal{" "}
            <span className="font-mono">/api/site/{project.slug}</span> path. That route serves the
            customer&apos;s HTML under a{" "}
            <span className="font-mono">script-src &apos;self&apos; &apos;unsafe-inline&apos;</span>{" "}
            policy scoped to whatever origin answered — on a{" "}
            <span className="font-mono">*.kodely.site</span> subdomain that is an isolated origin, on
            the admin host it would not be.
          </p>
        </Panel>

        <Panel title="Owner" subtitle="Takedown affects the site, never the account or the work.">
          <div className="text-sm">
            <Link
              href={`/admin/users/${project.user.id}`}
              className="font-medium underline-offset-4 hover:underline"
            >
              {project.user.email}
            </Link>
            {project.user.name ? (
              <div className="text-xs text-black/50 dark:text-white/50">
                {truncate(project.user.name, 50)}
              </div>
            ) : null}
          </div>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-black/60 dark:text-white/60">
            <li>
              {sourceFiles} source file(s) and {draftFiles} draft build file(s) in their working
              tree — a takedown touches none of them.
            </li>
            <li>
              The {servedFiles} published file(s) also stay in the database. Taking the site down
              clears <span className="font-mono">publishedAt</span> and nothing else.
            </li>
            <li>Nothing here notifies the owner. If they should hear about it, email them.</li>
          </ul>
        </Panel>
      </div>

      <div className="mb-8">
        <Panel
          title="Moderation findings"
          subtitle={
            <>
              What <span className="font-mono">lib/moderation.ts</span> flagged when this project was
              published. Ruling on each one is what makes the per-rule false-positive rate
              measurable, which is the thing currently standing between a{" "}
              <span className="font-mono">medium</span> rule and being promoted to blocking.
              {findingTotal > findings.length
                ? ` Showing the most recent ${findings.length} of ${findingTotal}.`
                : ""}
            </>
          }
        >
          {sorted.length === 0 ? (
            <Empty>
              {findingsEverywhere === 0 ? (
                <>
                  No findings recorded for this project — which today means &ldquo;nothing has ever
                  written one&rdquo;, not &ldquo;this site scanned clean&rdquo;. The findings table
                  is empty across every project, so an empty list here says nothing about this site.
                </>
              ) : (
                <>
                  No findings recorded for this project. Findings do exist for other projects, so
                  this is the scanner having flagged nothing on the publishes it saw — but it is
                  still not a clean bill of health for anything published before the publish route
                  started writing to this table.
                </>
              )}
            </Empty>
          ) : (
            <TableFrame>
              <thead>
                <tr className="border-b border-black/10 text-xs text-black/50 dark:border-white/10 dark:text-white/50">
                  <Th>Severity</Th>
                  <Th>Rule</Th>
                  <Th>Where</Th>
                  <Th>Evidence</Th>
                  <Th>Review</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/10 dark:divide-white/10">
                {sorted.map((f) => (
                  <tr key={f.id} className="align-top">
                    <td className="whitespace-nowrap px-4 py-3">
                      <SeverityBadge severity={f.severity} />
                      <div className="mt-1 text-xs text-black/50 dark:text-white/50">
                        {f.action === "blocked" ? "blocked the publish" : "recorded"}
                      </div>
                    </td>
                    <td className="max-w-xs px-4 py-3">
                      <div className="font-mono text-xs font-medium">{f.rule}</div>
                      <div className="mt-1 text-xs text-black/55 dark:text-white/55">
                        {lookup(RULE_NOTES, f.rule) ?? "No description on file for this rule id."}
                      </div>
                    </td>
                    <td className="max-w-[12rem] px-4 py-3">
                      <div className="break-all font-mono text-xs text-black/70 dark:text-white/70">
                        {truncate(f.path, 46)}
                      </div>
                      <div className="mt-1 whitespace-nowrap text-xs tabular-nums text-black/40 dark:text-white/40">
                        {formatDateTime(f.createdAt)}
                      </div>
                    </td>
                    <td className="max-w-sm px-4 py-3">
                      {/* Truncated on purpose and never expandable — this is a
                          snippet of someone else's private work. */}
                      <code className="block break-all text-xs text-black/60 dark:text-white/60">
                        {evidenceText(f.evidence)}
                      </code>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className={`text-xs font-medium ${outcomeClass(f.outcome)}`}>
                        {outcomeLabel(f.outcome)}
                      </div>
                      {f.reviewedAt ? (
                        <div className="mt-0.5 text-xs text-black/40 dark:text-white/40">
                          {truncate(f.reviewedBy ?? "unknown", 28)}
                          <br />
                          <span className="tabular-nums">{formatDateTime(f.reviewedAt)}</span>
                        </div>
                      ) : null}
                      <form action={reviewFinding} className="mt-2 flex gap-1.5">
                        <input type="hidden" name="findingId" value={f.id} />
                        <button
                          type="submit"
                          name="outcome"
                          value="true_positive"
                          className="rounded-lg border border-black/10 px-2 py-1 text-xs hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
                        >
                          True
                        </button>
                        <button
                          type="submit"
                          name="outcome"
                          value="false_positive"
                          className="rounded-lg border border-black/10 px-2 py-1 text-xs hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
                        >
                          False
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableFrame>
          )}
        </Panel>
      </div>

      <div className="mb-8">
        {live ? (
          <div className="rounded-xl border border-red-500/40 bg-red-500/5 p-5">
            <h2 className="text-sm font-medium text-red-700 dark:text-red-400">Take this site offline</h2>
            <p className="mt-2 text-sm text-black/70 dark:text-white/70">
              Clears <span className="font-mono">publishedAt</span>, which is the single thing that
              makes <span className="font-mono">{host}</span> resolve. The owner keeps their project,
              their draft, their published files and their slug, and can republish it themselves at
              any time. There is a confirmation step on the next page.
            </p>
            <p className="mt-2 text-xs text-black/60 dark:text-white/60">
              <CacheCaveatLine />
            </p>
            <Link href={`/admin/sites/${project.id}/takedown`} className={`mt-4 inline-block ${buttonClass("bad")}`}>
              Take down…
            </Link>
          </div>
        ) : (
          <Notice title="This site is offline" tone="neutral">
            <span className="font-mono text-xs">{host}</span> returns 404 from the origin.{" "}
            {lastTakedown
              ? `Taken down by ${lastTakedown.actorEmail} on ${formatDateTime(lastTakedown.createdAt)}.`
              : "There is no takedown in the audit log for it, so it was never published or was unpublished by something outside this panel."}{" "}
            The owner can put it back by publishing again from their project page — which re-runs the
            secret scan and the moderation gate, so anything rated{" "}
            <span className="font-mono">high</span> will refuse the republish on its own.
            <span className="mt-2 block text-xs text-black/55 dark:text-white/55">
              <CacheCaveatLine />
              {lastTakedown
                ? " Reads of a cached copy within that window are not visible from here."
                : ""}
            </span>
          </Notice>
        )}
      </div>

      <Panel
        title="Admin actions on this project"
        subtitle={
          audit.length >= AUDIT_LIMIT
            ? `Most recent ${AUDIT_LIMIT} entries from AdminAuditLog, newest first.`
            : "Every entry AdminAuditLog holds for this project, newest first."
        }
      >
        {audit.length === 0 ? (
          <Empty>No admin action has ever been recorded against this project.</Empty>
        ) : (
          <ol className="space-y-1.5">
            {audit.map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline gap-x-3 text-sm">
                <span className="w-40 shrink-0 tabular-nums text-xs text-black/50 dark:text-white/50">
                  {formatDateTime(a.createdAt)}
                </span>
                <span className="font-medium">{a.action}</span>
                <span className="text-xs text-black/50 dark:text-white/50">
                  {truncate(a.actorEmail, 40)}
                </span>
                <span className="text-xs text-black/40 dark:text-white/40">
                  {truncate(metaSummary(a.meta), 90)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </div>
  );
}
