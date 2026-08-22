import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import SubmissionList, { type SubmissionRow } from "./SubmissionList";

export const dynamic = "force-dynamic";

/** Newest page of submissions. Enough for every real inbox; see the note below. */
const PAGE_SIZE = 200;

/**
 * Everything a published site's forms have collected.
 *
 * The values here are UNTRUSTED PUBLIC INPUT — anyone who can load the site can
 * put anything in them. They are rendered as React children and never as HTML:
 * there is no dangerouslySetInnerHTML anywhere on this page or in
 * SubmissionList, so a submission containing markup is displayed as the text it
 * is. That is the whole defence and it must stay that way.
 */
export default async function SubmissionsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id } = await params;

  const project = await db.project.findFirst({
    where: { id, userId: user.id },
    select: { id: true, name: true, slug: true, publishedAt: true },
  });
  if (!project) redirect("/dashboard");

  const [rows, total, unread] = await Promise.all([
    db.formSubmission.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      select: {
        id: true,
        formName: true,
        fields: true,
        createdAt: true,
        readAt: true,
        spam: true,
      },
    }),
    db.formSubmission.count({ where: { projectId: project.id } }),
    db.formSubmission.count({ where: { projectId: project.id, readAt: null, spam: false } }),
  ]);

  // `fields` is Json, so its runtime shape is whatever was written — normalise
  // to string pairs HERE rather than trusting the column, and cap what is
  // handed to the client. The write path already caps this; a second cap on
  // read costs nothing and means an old or hand-edited row cannot blow up the
  // page.
  const submissions: SubmissionRow[] = rows.map((r) => {
    const raw = r.fields;
    const pairs: [string, string][] =
      raw !== null && typeof raw === "object" && !Array.isArray(raw)
        ? Object.entries(raw)
            .slice(0, 24)
            .map(([k, v]) => [String(k).slice(0, 64), v === null ? "" : String(v).slice(0, 5000)])
        : [];
    return {
      id: r.id,
      formName: r.formName,
      fields: pairs,
      createdAt: r.createdAt.toISOString(),
      read: r.readAt !== null,
      spam: r.spam,
    };
  });

  return (
    // This route is inside the builder's layout, which is bare on purpose — so
    // the page carries its own canvas and its own way back, the same as the
    // editor's header does.
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
        <h1 className="k-h1 mt-3 text-ink">Form submissions</h1>
        <p className="k-num mt-1 text-sm text-ink-2">
          {total === 0
            ? "Nothing yet."
            : `${total} total${unread > 0 ? ` · ${unread} unread` : ""}${
                total > PAGE_SIZE ? ` · showing the latest ${PAGE_SIZE}` : ""
              }`}
        </p>

        {!project.publishedAt && (
          <p className="mt-6 rounded-lg border border-hair bg-surface p-4 text-sm leading-relaxed text-ink-2">
            This site isn&apos;t published, so its forms can&apos;t receive anything. Submissions
            are only accepted for a live site.
          </p>
        )}

        {total === 0 ? (
          <EmptyState
            className="mt-6"
            kind="empty"
            title="No submissions yet"
            body="When someone fills in a form on your published site, it lands here — and we email you."
          />
        ) : (
          <div className="mt-6">
            <SubmissionList projectId={project.id} initial={submissions} />
          </div>
        )}
      </div>
    </div>
  );
}
