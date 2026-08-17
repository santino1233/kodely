import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const MIME: Record<string, string> = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  map: "application/json",
  json: "application/json",
  svg: "image/svg+xml",
  txt: "text/plain; charset=utf-8",
};

const SANDBOX_CSP =
  "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; frame-ancestors 'self'";

// Serves the DRAFT tree for the live in-editor preview. Owner-only — this is
// unpublished work, not a public site.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; path?: string[] }> },
) {
  const user = await getCurrentUser();
  if (!user) return new Response("Not signed in.", { status: 401 });

  const { id, path } = await params;
  const project = await db.project.findFirst({ where: { id, userId: user.id } });
  if (!project) return new Response("Not found.", { status: 404 });

  const filePath = path && path.length > 0 ? path.join("/") : "index.html";
  const file = await db.projectFile.findFirst({
    where: { projectId: id, path: filePath, published: false, kind: "build" },
  });
  if (!file) {
    return new Response(
      filePath === "index.html"
        ? "<!doctype html><html><body style='font:14px sans-serif;color:#888;display:grid;place-items:center;height:100vh'>Nothing built yet — describe what you want on the left.</body></html>"
        : "Not found.",
      { status: filePath === "index.html" ? 200 : 404, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  const ext = filePath.split(".").pop() ?? "";
  return new Response(file.content, {
    headers: {
      "Content-Type": MIME[ext] ?? "application/octet-stream",
      "Content-Security-Policy": SANDBOX_CSP,
      "Cache-Control": "no-store",
    },
  });
}
