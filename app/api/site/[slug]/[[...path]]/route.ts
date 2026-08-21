import { db } from "@/lib/db";
import { applySeo, robotsTxt, siteBaseUrl, sitemapXml } from "@/lib/site-seo";

export const dynamic = "force-dynamic";

const MIME: Record<string, string> = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  map: "application/json",
  json: "application/json",
  svg: "image/svg+xml",
  txt: "text/plain; charset=utf-8",
  // xml is required for sitemap.xml — without it a sitemap served as
  // application/octet-stream is ignored by crawlers.
  xml: "application/xml; charset=utf-8",
  ico: "image/x-icon",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  woff2: "font/woff2",
};

// Locks generated pages down to nothing but themselves — matches the "no
// external requests" contract the builder is prompted with, so a page that
// somehow got a remote script past the agent still can't execute it.
const SANDBOX_CSP =
  "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; frame-ancestors 'self'";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string; path?: string[] }> },
) {
  const { slug, path } = await params;
  const filePath = path && path.length > 0 ? path.join("/") : "index.html";

  const project = await db.project.findUnique({ where: { slug } });
  if (!project || !project.publishedAt) {
    return new Response("Site not found.", { status: 404 });
  }

  const baseUrl = siteBaseUrl(req, slug);
  const seoHeaders = {
    "Content-Security-Policy": SANDBOX_CSP,
    "Cache-Control": "public, max-age=60",
  };

  // robots.txt and sitemap.xml are generated, not stored — they depend on the
  // visitor-facing host (which differs between the branded subdomain and the
  // staging path form), so a file baked at build time would be wrong on one of
  // them. A site that ships its own copy still wins: we only synthesise these
  // when the project has no such file.
  if (filePath === "robots.txt" || filePath === "sitemap.xml") {
    const own = await db.projectFile.findFirst({
      where: { projectId: project.id, path: filePath, published: true, kind: "build" },
    });
    if (!own) {
      if (filePath === "robots.txt") {
        return new Response(robotsTxt(baseUrl), {
          headers: { ...seoHeaders, "Content-Type": MIME.txt },
        });
      }
      const pages = await db.projectFile.findMany({
        where: { projectId: project.id, published: true, kind: "build", path: { endsWith: ".html" } },
        select: { path: true },
      });
      return new Response(
        sitemapXml(baseUrl, pages.map((p) => p.path), project.publishedAt ?? undefined),
        { headers: { ...seoHeaders, "Content-Type": MIME.xml } },
      );
    }
  }

  const file = await db.projectFile.findFirst({
    where: { projectId: project.id, path: filePath, published: true, kind: "build" },
  });
  if (!file) {
    return new Response("Not found.", { status: 404 });
  }

  const ext = filePath.split(".").pop() ?? "";

  // Backstop so no site can ship with the foundation's placeholder <title>.
  // Only fills gaps — anything the builder wrote itself is preserved.
  const body =
    ext === "html" ? applySeo(file.content, { projectName: project.name, baseUrl }) : file.content;

  return new Response(body, {
    headers: { ...seoHeaders, "Content-Type": MIME[ext] ?? "application/octet-stream" },
  });
}
