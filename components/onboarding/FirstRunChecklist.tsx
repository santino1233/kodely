import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { MICROS_PER_CREDIT, SIGNUP_GRANT } from "@/lib/credits";
import { TEMPLATES } from "@/lib/templates";
import FirstRunPanel from "./FirstRunPanel";

// ── First-run experience (state) ───────────────────────────────────────────
//
// Renders itself. One import and one <FirstRunChecklist /> on the dashboard is
// the whole integration — it fetches its own data so the page it lives on does
// not have to grow props for it.
//
// The steps mirror the activation funnel in lib/events.ts exactly
// (project.created → build.succeeded → project.published), and each one is
// answered from the database rather than from a stored "onboarding step"
// column. Two reasons that matters:
//
//   1. It cannot lie. Someone who published from a second device, or whose
//      first build succeeded in another tab, sees the truth on next load. A
//      progress column would drift the first time anything happened outside
//      this component.
//   2. It cannot nag. The panel disappears the moment a project is published
//      — permanently, with no flag to write and none to reset — because
//      "published" is a fact that already exists in the schema. Reaching the
//      North Star is the exit condition.
//
// Anyone who wants it gone sooner uses the dismiss button, which is a
// localStorage preference owned by FirstRunPanel (see the note there).

export default async function FirstRunChecklist() {
  const user = await getCurrentUser();
  // The dashboard already redirects signed-out visitors; this is just so the
  // component is safe to drop anywhere without assuming that.
  if (!user) return null;

  const [publishedCount, hasProjectCount, succeededBuilds, openProject] = await Promise.all([
    db.project.count({ where: { userId: user.id, publishedAt: { not: null } } }),
    db.project.count({ where: { userId: user.id } }),
    db.build.count({ where: { project: { userId: user.id }, status: "SUCCEEDED" } }),
    db.project.findFirst({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true },
    }),
  ]);

  // Past the funnel. Nothing further to guide them through, so this never
  // renders again for this account.
  if (publishedCount > 0) return null;

  return (
    <FirstRunPanel
      hasProject={hasProjectCount > 0}
      hasBuild={succeededBuilds > 0}
      openProject={openProject}
      grant={SIGNUP_GRANT}
      // 1e6 micro-dollars = $1, so this is credits-per-dollar without a second
      // constant that could disagree with lib/credits.ts.
      creditsPerDollar={Math.round(1_000_000 / MICROS_PER_CREDIT)}
      templateCount={TEMPLATES.length}
    />
  );
}
