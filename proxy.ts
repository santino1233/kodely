import { NextRequest, NextResponse } from "next/server";
import { siteHostAllowed } from "@/app/api/site/[slug]/site-host";
import {
  AUTH_HINT_COOKIE,
  AUTH_HINT_MAX_AGE_SECONDS,
  AUTH_HINT_VALUE,
  SESSION_COOKIE,
  authHintAction,
} from "@/lib/auth-cookies";

const SITES_BASE = process.env.KODELY_SITES_BASE ?? "kodely.site";

// The hostname the admin panel answers on, e.g. "ops-7f3k2q.kodely.me".
// When set, /admin is reachable ONLY there and 404s on every other host.
// When unset (local dev), /admin behaves as it always did.
//
// This is obscurity, not authorization. Subdomains are not secret: every TLS
// certificate is published to public Certificate Transparency logs, so anyone
// can search crt.sh for kodely.me and enumerate this name minutes after the
// cert is issued. It raises the cost of drive-by scanning and nothing more.
// The real gate is the role check in app/admin/layout.tsx and app/admin/page.tsx,
// which stays regardless — Next's own proxy docs are explicit that a proxy must
// not be the sole authorization boundary, since Server Functions and route
// handlers can bypass matcher coverage.
const ADMIN_HOST = process.env.KODELY_ADMIN_HOST?.trim().toLowerCase();

// Rewritten to when /admin is requested off the admin host. No route exists
// here, so Next renders its ordinary not-found page with a 404 — byte-for-byte
// what a genuinely nonexistent path returns. A hand-written 404 body would be
// distinguishable from a real miss and would advertise that something is here.
const NOWHERE = "/_kodely_nonexistent";

// A request to <slug>.kodely.site is rewritten to the internal site-serving
// API. Everything on the apex app domain (kodely.me / staging.kodely.me)
// passes through untouched.
export function proxy(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  const bareHost = host.split(":")[0].toLowerCase();
  const { pathname } = req.nextUrl;

  if (bareHost.endsWith(`.${SITES_BASE}`)) {
    const slug = bareHost.slice(0, -(SITES_BASE.length + 1));
    if (slug && slug !== "www") {
      const url = req.nextUrl.clone();
      url.pathname = `/api/site/${slug}${pathname === "/" ? "" : pathname}`;
      return NextResponse.rewrite(url);
    }
  }

  // The rewrite above is internal — Next does not re-enter this function for it
  // — so anything still carrying /api/site/… here asked for that path from the
  // outside. On the sites domain and on staging that is legitimate; on the app's
  // own domain it means someone is trying to serve a customer's HTML as
  // first-party content on kodely.me. Same NOWHERE rewrite as /admin: an
  // ordinary Next 404, indistinguishable from a path that never existed, and it
  // costs no database round trip. The route handler repeats the check itself.
  if (pathname.startsWith("/api/site/")) {
    const slug = pathname.split("/")[3] ?? "";
    if (!siteHostAllowed(host, slug)) {
      const url = req.nextUrl.clone();
      url.pathname = NOWHERE;
      return NextResponse.rewrite(url);
    }
  }

  if (ADMIN_HOST) {
    const onAdminHost = bareHost === ADMIN_HOST;

    if (pathname === "/admin" || pathname.startsWith("/admin/")) {
      if (!onAdminHost) {
        const url = req.nextUrl.clone();
        url.pathname = NOWHERE;
        return NextResponse.rewrite(url);
      }
    } else if (onAdminHost && pathname === "/") {
      // Landing on the admin host goes straight to the panel rather than the
      // marketing site. Everything else on this host still resolves normally —
      // /login and /api/auth/* have to work here, because the session cookie
      // sets no `domain` and is therefore host-only: a session created on
      // kodely.me is never sent to this host. Signing in happens here or the
      // panel is unreachable.
      const url = req.nextUrl.clone();
      url.pathname = "/admin";
      return NextResponse.rewrite(url);
    }
  }

  return withAuthHint(req, NextResponse.next());
}

// ── The auth hint, repaired ─────────────────────────────────────────────────
//
// lib/auth.ts writes kodely_auth beside the session cookie on sign-in and
// deletes it on sign-out, which covers everything that happens from here on.
// This is the part that covers everything that already happened:
//
//   * Sessions created BEFORE this shipped have a session cookie and no hint.
//     Without a backfill they would show "Sign in" on the static marketing
//     pages until their next sign-in — up to thirty days of the feature
//     looking broken to exactly the people who use the product most.
//   * A hint whose session cookie is gone is the dangerous direction, and it
//     is reachable without any sign-out at all: clear one cookie in devtools,
//     let a session lapse in a browser that kept the hint, restore an old
//     profile. That is a nav offering "Portal" to a signed-out visitor, so it
//     is cleared here on the very next request rather than waiting for
//     anything to notice.
//
// What this CANNOT see is whether the session is still valid — there is no
// database here, only the presence of an opaque cookie. A session revoked
// from another device leaves a hint that still says "1" until this browser's
// own cookie expires, so that visitor sees "Portal" and gets bounced to
// /login by the portal layout. That is the accepted floor of a hint: it is a
// hint, and every real gate is still getCurrentUser().
//
// Only the two rows where the cookies DISAGREE touch the response (see
// authHintAction). An anonymous visitor — every crawler, every cold visit to
// a cached blog post — carries neither cookie and gets no Set-Cookie header
// at all, which is what makes this safe to run in front of the statically
// prerendered pages.
function withAuthHint(req: NextRequest, res: NextResponse) {
  // API routes are skipped on purpose: /api/auth/login and /api/auth/logout
  // are the two requests where the cookies are SUPPOSED to disagree — the
  // session is being created or destroyed by the response itself — and a
  // proxy writing its own Set-Cookie for the same name on the way out is a
  // race with no upside.
  if (req.nextUrl.pathname.startsWith("/api/")) return res;

  const action = authHintAction(
    Boolean(req.cookies.get(SESSION_COOKIE)),
    req.cookies.get(AUTH_HINT_COOKIE)?.value === AUTH_HINT_VALUE,
  );

  if (action === "set") {
    res.cookies.set(AUTH_HINT_COOKIE, AUTH_HINT_VALUE, {
      httpOnly: false,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      // The real expiry is unknowable here, so this is the SESSION_DAYS
      // ceiling. Over-shooting is harmless in the one direction that matters:
      // when the session cookie lapses first, the "clear" row above removes
      // the leftover hint on the next request.
      maxAge: AUTH_HINT_MAX_AGE_SECONDS,
    });
  } else if (action === "clear") {
    res.cookies.delete(AUTH_HINT_COOKIE);
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
