import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getBalance } from "@/lib/credits";
import Editor from "./Editor";

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

  const balance = await getBalance(user.id);

  return (
    <Editor
      projectId={project.id}
      projectName={project.name}
      slug={project.slug}
      published={!!project.publishedAt}
      initialFiles={Object.fromEntries(project.files.map((f) => [f.path, f.content]))}
      initialMessages={project.messages.map((m) => ({ role: m.role, content: m.content }))}
      initialBalance={balance}
    />
  );
}
