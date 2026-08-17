import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const MIME: Record<string, string> = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  json: "application/json",
  svg: "image/svg+xml",
  txt: "text/plain; charset=utf-8",
};

// Locks generated pages down to nothing but themselves — matches the "no
// external requests" contract the builder is prompted with, so a page that
// somehow got a remote script past the agent still can't execute it.
const SANDBOX_CSP =
  "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; frame-ancestors 'self'";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string; path?: string[] }> },
) {
  const { slug, path } = await params;
  const filePath = path && path.length > 0 ? path.join("/") : "index.html";

  const project = await db.project.findUnique({ where: { slug } });
  if (!project || !project.publishedAt) {
    return new Response("Site not found.", { status: 404 });
  }

  const file = await db.projectFile.findFirst({
    where: { projectId: project.id, path: filePath, published: true },
  });
  if (!file) {
    return new Response("Not found.", { status: 404 });
  }

  const ext = filePath.split(".").pop() ?? "";
  return new Response(file.content, {
    headers: {
      "Content-Type": MIME[ext] ?? "application/octet-stream",
      "Content-Security-Policy": SANDBOX_CSP,
      "Cache-Control": "public, max-age=60",
    },
  });
}
