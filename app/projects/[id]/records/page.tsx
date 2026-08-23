import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import RecordList, { type RecordRow } from "./RecordList";

export const dynamic = "force-dynamic";

/** Newest page of records. Enough for every real inbox; see the note below. */
const PAGE_SIZE = 200;

/**
 * Everything a published site has written back through `/__records/<kind>`
 * (lib/site-records.ts) — the generic storage primitive behind future
 * backend-backed site features.
 *
 * `kind` is whatever string a generated site chose (a booking, a listing, a
 * CRM row, anything) — never a fixed enum, so this page groups and filters by
 * whatever kinds actually exist for THIS project rather than a hardcoded
 * list. `fields` is UNTRUSTED PUBLIC INPUT — anyone who can load the site can
 * put anything in it. It is rendered as React children and never as HTML:
 * there is no dangerouslySetInnerHTML anywhere on this page or in RecordList,
 * so a record containing markup is displayed as the text it is. That is the
 * whole defence and it must stay that way.
 */
export default async function RecordsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id } = await params;

  const project = await db.project.findFirst({
    where: { id, userId: user.id },
    select: { id: true, name: true, slug: true, publishedAt: true },
  });
  if (!project) redirect("/dashboard");

  const [rows, total, kindCounts] = await Promise.all([
    db.siteRecord.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      select: {
        id: true,
        kind: true,
        status: true,
        fields: true,
        createdAt: true,
        spam: true,
      },
    }),
    db.siteRecord.count({ where: { projectId: project.id } }),
    // Every kind this project has ever collected, not just the ones on this
    // page — a kind that only appears past PAGE_SIZE must still get a tab.
    db.siteRecord.groupBy({
      by: ["kind"],
      where: { projectId: project.id },
      _count: { _all: true },
      orderBy: { kind: "asc" },
    }),
  ]);

  // `fields` is Json, so its runtime shape is whatever was written — normalise
  // to string pairs HERE rather than trusting the column, and cap what is
  // handed to the client. The write path already caps this; a second cap on
  // read costs nothing and means an old or hand-edited row cannot blow up the
  // page.
  const records: RecordRow[] = rows.map((r) => {
    const raw = r.fields;
    const pairs: [string, string][] =
      raw !== null && typeof raw === "object" && !Array.isArray(raw)
        ? Object.entries(raw)
            .slice(0, 24)
            .map(([k, v]) => [String(k).slice(0, 64), v === null ? "" : String(v).slice(0, 5000)])
        : [];
    return {
      id: r.id,
      kind: r.kind,
      status: r.status,
      fields: pairs,
      createdAt: r.createdAt.toISOString(),
      spam: r.spam,
    };
  });

  const kinds = kindCounts.map((k) => k.kind);

  return (
    // This route is inside the builder's layout, which is bare on purpose — so
    // the page carries its own canvas and its own way back, the same as the
    // editor's header and the submissions page do.
    <div className="min-h-dvh bg-canvas">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
        <ButtonLink
          href={`/projects/${project.id}`}
          size="sm"
          variant="ghost"
          className="-ml-3"
          icon={
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 5 8 12l7 7" />
            </svg>
          }
        >
          {project.name}
        </ButtonLink>
        <h1 className="k-h1 mt-3 text-ink">Site records</h1>
        <p className="k-num mt-1 text-sm text-ink-2">
          {total === 0
            ? "Nothing yet."
            : `${total} total${total > PAGE_SIZE ? ` · showing the latest ${PAGE_SIZE}` : ""}`}
        </p>

        {!project.publishedAt && (
          <p className="mt-6 rounded-lg border border-hair bg-surface p-4 text-sm leading-relaxed text-ink-2">
            This site isn&apos;t published, so it can&apos;t record anything yet. Records are only
            accepted for a live site.
          </p>
        )}

        {total === 0 ? (
          <EmptyState
            className="mt-6"
            kind="empty"
            title="No records yet"
            body="When your published site writes data back through /__records/<kind>, it lands here — grouped by whatever kind it used."
          />
        ) : (
          <div className="mt-6">
            <RecordList projectId={project.id} kinds={kinds} initial={records} />
          </div>
        )}
      </div>
    </div>
  );
}
