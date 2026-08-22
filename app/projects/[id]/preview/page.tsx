import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import StandalonePreview from "./StandalonePreview";

export const dynamic = "force-dynamic";

// "Open in a new tab", for a DRAFT.
//
// This route exists because the obvious target does not work. /api/preview/<id>
// /index.html renders fine inside the editor's iframe only because the editor
// fetches its assets itself and inlines them (see preview-agent.ts). Opened as
// a top-level tab it would ask the browser to load the <script src="/assets/…">
// that Vite emitted — an absolute path, resolved against the APP origin, where
// there is no /assets route. The page would load and then render nothing.
//
// A blob: URL of the assembled document was considered and rejected outright: a
// blob inherits the creating page's origin, which would put generated customer
// JavaScript on the app's own origin with access to same-origin fetches. The
// whole reason the editor's iframe omits `allow-same-origin` is to prevent
// exactly that. A data: URL is a non-starter too — top-level navigation to
// data: is blocked in every current browser.
//
// So: a real page, owner-only like the API it reads, that assembles the same
// self-contained document and hands it to the same kind of sandboxed frame.
// The published site needs none of this and is linked to directly.
export default async function ProjectPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id } = await params;

  const project = await db.project.findFirst({
    where: { id, userId: user.id },
    select: { id: true, name: true },
  });
  if (!project) redirect("/dashboard");

  return <StandalonePreview projectId={project.id} projectName={project.name} />;
}
