import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getBalance, averageBuildCredits, estimateCredits } from "@/lib/credits";
import { sameTree } from "./diff";
import Editor from "./Editor";

/** Same shape `filesSnapshot` is written in — see app/api/generate/route.ts. */
type Snapshot = { source?: Record<string, string>; build?: Record<string, string> };

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id } = await params;

  const project = await db.project.findFirst({
    where: { id, userId: user.id },
    include: {
      files: { where: { published: false, kind: "source" } },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!project) redirect("/dashboard");

  // Only builds whose snapshot SURVIVES are checkpoints. The filter is the same
  // one app/api/projects/[id]/builds/route.ts applies and for the same reason
  // (the retention job clears filesSnapshot on old builds); duplicated rather
  // than imported because a route module is not a shared-query home, and the
  // editor refetches through that route after every build anyway, so the two
  // lists have to agree. `take: 100` matches it too.
  const CHECKPOINTS = {
    where: {
      projectId: id,
      status: "SUCCEEDED",
      filesSnapshot: { not: Prisma.DbNull },
    },
    orderBy: { createdAt: "desc" },
  } as const;

  const [balance, avgBuildCredits, measuredBuilds, unreadSubmissions, checkpoints, latest] =
    await Promise.all([
      getBalance(user.id),
    averageBuildCredits(user.id),
    // averageBuildCredits() falls back to a global constant for someone with no
    // history, so on its own it cannot be described to the user as "your"
    // average. This count is the gate that decides whether it can — the same
    // gate app/dashboard/billing/page.tsx uses for its "Your average build" tile.
    db.build.count({
      where: { project: { userId: user.id }, status: "SUCCEEDED", creditsCharged: { gt: 0 } },
    }),
      // Same filter the submissions page uses for its own unread count, so the
      // badge and the page can never disagree about what "unread" means.
      db.formSubmission.count({ where: { projectId: id, readAt: null, spam: false } }),
      // The undo timeline, resolved here so the control can be labelled with
      // its real target on first paint instead of after a round trip.
      db.build.findMany({
        ...CHECKPOINTS,
        take: 100,
        select: { id: true, prompt: true, createdAt: true, filesWritten: true },
      }),
      // The newest checkpoint's snapshot, read ONLY to answer "does the draft
      // still match it". ~105 kB, the same order as the draft tree this page
      // already loads, and it never leaves the server — only the boolean below
      // is sent. The alternative was inferring it from updatedAt timestamps,
      // which cannot tell a manual SEO/Brand save apart from the build's own
      // write, and would make Undo's label a guess. Undo replaces the draft; a
      // guess is not good enough to describe that.
      db.build.findFirst({ ...CHECKPOINTS, select: { id: true, filesSnapshot: true } }),
    ]);

  const draftFiles = Object.fromEntries(project.files.map((f) => [f.path, f.content]));
  const draftDiffersFromLatest =
    latest?.filesSnapshot != null &&
    !sameTree((latest.filesSnapshot as Snapshot).source ?? {}, draftFiles);

  return (
    <Editor
      projectId={project.id}
      projectName={project.name}
      slug={project.slug}
      published={!!project.publishedAt}
      initialFiles={draftFiles}
      initialMessages={project.messages.map((m) => ({ role: m.role, content: m.content }))}
      initialBalance={balance}
      avgBuildCredits={avgBuildCredits}
      measuredBuilds={measuredBuilds}
      // Resolved here rather than in the client: lib/credits.ts reaches for
      // Prisma at module scope, so it can never be imported from Editor.tsx.
      estimates={{ create: estimateCredits("create"), edit: estimateCredits("edit") }}
      unreadSubmissions={unreadSubmissions}
      initialCheckpoints={checkpoints.map((b) => ({
        id: b.id,
        prompt: b.prompt,
        createdAt: b.createdAt.toISOString(),
        filesWritten: b.filesWritten,
      }))}
      draftDiffersFromLatest={draftDiffersFromLatest}
    />
  );
}
