import { getCurrentUser } from "@/lib/auth";
import {
  extractFacts,
  extractReferenceStyle,
  factCount,
  hasReference,
  validateImportUrl,
} from "@/lib/site-import";
import { fetchSiteHtml, isUrlImportConfigured } from "../fetcher";
import { checkImportRateLimit, noteBlockedTarget } from "../limits";

/**
 * Read one page the user named, and answer with a small typed struct.
 *
 * ## What this route does NOT do
 *
 * It never returns the page. Not the HTML, not the text, not a snippet — only
 * the parsed struct from lib/site-import.ts. That is the difference between a
 * feature and an open proxy: with the body withheld, an attacker who found a
 * hole in the address checks still only learns whatever survives into
 * `SiteFacts`, and the error messages are written so that a refusal does not
 * distinguish one private range from another.
 *
 * It also makes no model call, here or anywhere downstream. Extraction is
 * regexes and JSON-LD. A model asked to pull opening hours out of a page will
 * produce opening hours whether or not the page has any.
 *
 * ## Why it is authenticated
 *
 * The wizard is mostly used signed out and every other step of it works with no
 * server round trip at all — that is a stated principle and the paste path
 * honours it. This one cannot. "Rate limit it per user" has no meaning without
 * a user, and an anonymous endpoint that fetches arbitrary URLs from inside our
 * network is an open proxy with a speed bump. So the URL field is only rendered
 * for signed-in users (an affordance that 401s on click is worse than no
 * affordance) and everyone else gets the paste box, which needs nothing from
 * this route.
 */

export const dynamic = "force-dynamic";
// Comfortably above IMPORT_LIMITS.TOTAL_TIMEOUT_MS, so the deadline that fires
// is ours with a readable message rather than the platform's blank 504.
export const maxDuration = 30;

type Body = {
  url?: unknown;
  kind?: unknown;
  /** Required for kind:"current". See the ownership note below. */
  owned?: unknown;
};

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });

  // Before the rate limiter, so a switched-off feature does not eat into
  // anyone's hourly allowance for something they were never going to get.
  if (!isUrlImportConfigured()) {
    return Response.json(
      {
        error:
          "Importing by URL isn't switched on yet. Paste the text from your site instead — it works just as well.",
      },
      { status: 503 },
    );
  }

  const body = (await req.json().catch(() => null)) as Body | null;
  const kind = body?.kind === "reference" ? "reference" : body?.kind === "current" ? "current" : null;
  if (!kind) return Response.json({ error: "Invalid request." }, { status: 400 });

  // Validated here as well as inside the fetcher, so a malformed address costs
  // a string parse rather than a rate-limit hit.
  const check = validateImportUrl(body?.url);
  if (!check.ok) return Response.json({ error: check.reason }, { status: 400 });

  /**
   * OWNERSHIP. We cannot verify that a site belongs to the person importing it.
   * A DNS TXT record or a meta-tag challenge would verify it and would also
   * kill the conversion this feature exists to improve, so the honest design is
   * an explicit assertion the user makes, recorded with the URL and the time.
   * It is required only for the current-site path: a reference site is
   * explicitly somebody else's, which is why nothing but colour and layout is
   * taken from one.
   */
  if (kind === "current" && body?.owned !== true) {
    return Response.json(
      { error: "Confirm the site is yours before importing details from it." },
      { status: 400 },
    );
  }

  // Keyed on the hostname the user asked for, not the one a redirect lands on:
  // the per-host rule exists to stop us hammering a target, and the target is
  // whatever gets pointed at, chain or no chain.
  const limit = checkImportRateLimit(user.id, check.url.hostname);
  if (!limit.allowed) {
    return Response.json(
      { error: "You've imported a lot of pages just now — try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const result = await fetchSiteHtml(check.url.toString());

  if (!result.ok) {
    if (result.code === "blocked") noteBlockedTarget();
    // A blocked address is logged loudly. It is either an attack on us or a bug
    // in the validators, and both are things somebody has to see.
    console[result.code === "blocked" ? "error" : "info"](
      `[kodely] site-import refused user=${user.id} kind=${kind} url=${check.url.toString()} code=${result.code}`,
    );
    const status = result.code === "blocked" ? 400 : result.code === "robots" ? 403 : 502;
    return Response.json({ error: result.reason }, { status });
  }

  /**
   * THE AUDIT LINE. Not bureaucracy: this is what makes an abuse report
   * answerable. Somebody's server operator writes in to ask why Kodely fetched
   * their site, and without the user, the URL chain and the addresses actually
   * connected to, there is no way to investigate — and a fetcher whose
   * complaints cannot be investigated is a fetcher that gets the whole domain
   * blocklisted. The resolved addresses are in here for the same reason they
   * are validated: they are what actually happened, as opposed to what the
   * hostname suggested.
   *
   * `console` rather than a table because prisma/schema.prisma is out of scope
   * for this change. A durable `SiteImport` row is the right home and is the
   * first follow-up: it is also where the ownership assertion belongs, since a
   * log line rotates away and a legal assertion should not.
   */
  console.info(
    `[kodely] site-import ok user=${user.id} kind=${kind} owned=${kind === "current"} ` +
      `at=${new Date().toISOString()} hops=${result.hops.join(">")} addresses=${result.addresses.join(",")}`,
  );

  if (kind === "current") {
    const facts = extractFacts(result.html, result.finalUrl);
    if (factCount(facts) === 0) {
      return Response.json(
        {
          error:
            "We read that page but couldn't find anything we could use. Paste the details from it instead.",
        },
        { status: 422 },
      );
    }
    return Response.json({ facts });
  }

  const reference = extractReferenceStyle(result.html, result.finalUrl);
  if (!hasReference(reference)) {
    return Response.json(
      {
        error:
          "We read that page but couldn't pick up its colours or layout — most of it is probably in an external stylesheet. Try a screenshot-led description instead.",
      },
      { status: 422 },
    );
  }
  return Response.json({ reference });
}
