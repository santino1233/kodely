import { NextRequest, NextResponse } from "next/server";

const SITES_BASE = process.env.KODELY_SITES_BASE ?? "kodely.site";

// A request to <slug>.kodely.site is rewritten to the internal site-serving
// API. Everything on the apex app domain (kodely.me / staging.kodely.me)
// passes through untouched.
export function middleware(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  const bareHost = host.split(":")[0];

  if (bareHost.endsWith(`.${SITES_BASE}`)) {
    const slug = bareHost.slice(0, -(SITES_BASE.length + 1));
    if (slug && slug !== "www") {
      const url = req.nextUrl.clone();
      url.pathname = `/api/site/${slug}${req.nextUrl.pathname === "/" ? "" : req.nextUrl.pathname}`;
      return NextResponse.rewrite(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
