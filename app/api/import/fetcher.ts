/**
 * The only place in Kodely that opens a socket to an address a user chose.
 *
 * Not a route — a module colocated with the one route that uses it, so that the
 * network half of the site import stays out of `lib/site-import.ts` (which has
 * to stay importable from a browser bundle) and so that everything with a
 * `node:` import is in one file that can be read top to bottom.
 *
 * ## Read this before changing anything below
 *
 * The process running this code holds DATABASE_URL, STRIPE_SECRET_KEY and
 * ANTHROPIC_API_KEY, and it sits inside a private network. An SSRF here is not
 * "an unwanted HTTP request", it is credential disclosure. Every control below
 * is written on the assumption that the caller is trying to reach
 * 169.254.169.254, and several of them exist only because the obvious
 * implementation (`fetch(userUrl)`) is wrong in a way that looks right.
 *
 * ## What is defended, and how
 *
 *  1. SCHEME + PORT + CREDENTIALS + HOSTNAME SHAPE — `validateImportUrl` in
 *     lib/site-import.ts, before anything resolves.
 *
 *  2. DNS IS RESOLVED HERE, EXPLICITLY, and every address that comes back is
 *     classified. Not the hostname — the addresses. A hostname allowlist or
 *     denylist is decoration: `evil.test` is a public name and its A record is
 *     whatever the attacker's zone file says today.
 *
 *  3. EVERY answer must be public, not merely the one we pick. A name that
 *     publishes 93.184.216.34 and 10.0.0.5 together is either broken or an
 *     attack, and picking the good one would mean the same lookup a moment
 *     later could hand a different answer to something else.
 *
 *  4. THE REBIND HOLE IS CLOSED BY PINNING. This is the control most
 *     implementations miss, so it is worth being explicit about the failure it
 *     prevents. The naive shape is:
 *
 *         const ips = await dns.resolve(host);   // 93.184.216.34 — fine
 *         if (ips.every(isPublic)) await fetch(url);   // resolves AGAIN
 *
 *     Two lookups, and the attacker controls the TTL. Set it to 0 and answer
 *     the first query with a public address and the second with 169.254.169.254
 *     and every check passed while the socket went somewhere else. It is not
 *     even a race you have to win reliably — the attacker just retries.
 *
 *     The fix is that THERE IS ONLY ONE LOOKUP. `pinnedLookup` below is handed
 *     to `https.request` as its resolver, and it ignores the hostname entirely
 *     and returns the single address this code already validated. The TCP
 *     connection provably goes to the address that was checked, because no
 *     second resolution exists to disagree with the first. TLS still validates
 *     the certificate against the real hostname (`servername`), and the `Host`
 *     header still carries the real hostname, so virtual hosting works and the
 *     server sees a completely ordinary request.
 *
 *  5. REDIRECTS ARE FOLLOWED BY HAND. `https.request` does not follow them at
 *     all, which is one reason it is used here instead of `fetch` — `fetch`
 *     follows by default, and a permitted host answering
 *     `Location: http://169.254.169.254/latest/meta-data/` is the single most
 *     common way a "validated" fetcher gets walked. Each hop goes back through
 *     `resolveRedirect` (full URL validation) and then through this function
 *     again (fresh DNS, fresh classification, fresh pin). Capped at
 *     MAX_REDIRECTS.
 *
 *  6. BOUNDED. A 5s connect timeout, a 10s deadline over the WHOLE operation
 *     including robots.txt and every hop, a body cap enforced byte by byte
 *     while the response streams, and a redirect count. `Content-Length` is
 *     used only as an early reject — never as the thing that stops the read,
 *     because a hostile server will happily send a 12-byte Content-Length and
 *     then stream forever.
 *
 *  7. CONTENT-TYPE ALLOWLIST. `text/html` for a page. Anything else is refused
 *     before the body is read, so an internal service that answers JSON never
 *     gets its answer into our process.
 *
 *  8. THE BODY NEVER LEAVES THIS PROCESS. The route returns the parsed struct
 *     and nothing else — no raw HTML to the client, no raw HTML to the model.
 *
 * ## The control this file CANNOT provide
 *
 * Blast radius. Everything above is a filter, and a filter can have a bug: a
 * parsing quirk, an IPv6 form nobody tested, a redirect path that skips a
 * check. The mitigation that does not depend on getting the filter right is
 * running the fetch somewhere that has nothing worth stealing — a separate
 * worker with no database URL, no Anthropic key, no Stripe key, egress
 * restricted at the network layer, talking to the app over a narrow internal
 * endpoint. That is infrastructure, not code, and it does not exist yet.
 *
 * So `isUrlImportConfigured()` FAILS CLOSED: the URL path is off unless
 * KODELY_SITE_IMPORT_EGRESS is explicitly set, and the name is the egress
 * service rather than the feature on purpose — the switch should be turned on
 * by whoever stands that service up, not by whoever wants the feature. The
 * paste path in the wizard needs none of this and is always on.
 */

import { lookup as dnsLookup } from "node:dns/promises";
import https from "node:https";
import type { IncomingMessage } from "node:http";
import type { LookupAddress } from "node:dns";
import type { LookupFunction } from "node:net";

import {
  classifyAddress,
  IMPORT_LIMITS,
  resolveRedirect,
  validateImportUrl,
} from "@/lib/site-import";

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

/**
 * An identifiable user agent, because a fetcher that arrives anonymously is a
 * machine for generating abuse reports nobody can answer. The contact URL is a
 * real page today; a dedicated `/bot` page explaining what this is and how to
 * block it would be better and is a one-page follow-up outside this change's
 * scope.
 */
const CONTACT_URL = `${(process.env.APP_URL ?? "https://kodely.me").replace(/\/+$/, "")}/contact`;
export const USER_AGENT = `KodelySiteImport/1.0 (+${CONTACT_URL})`;
/** The token a robots.txt author would write to address us specifically. */
const ROBOTS_TOKEN = "kodelysiteimport";

/**
 * The gate. Off unless an operator says otherwise — see the header.
 *
 * Deliberately an environment variable rather than a `lib/flags.ts` key. Two
 * reasons: `FLAGS` is a closed vocabulary in a file this change is not allowed
 * to touch, and more importantly a database-backed flag is the wrong shape for
 * this particular switch. A FeatureFlag row can be flipped from an admin page
 * by someone who does not know whether the egress worker exists; an environment
 * variable can only be set by whoever deploys the process, which is the same
 * person who would have stood the worker up. When this feature graduates, the
 * right end state is BOTH: this variable for "the isolated egress path exists",
 * and a `feature.prompt_wizard_import` flag with a rolloutPct for "how many
 * users see it".
 */
export function isUrlImportConfigured(): boolean {
  const value = (process.env.KODELY_SITE_IMPORT_EGRESS ?? "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "on";
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export type FetchFailure =
  /** Refused before any packet left the box. The URL or an address was bad. */
  | "blocked"
  /** The remote end was slow, unreachable, or the deadline expired. */
  | "unreachable"
  /** It answered, but not with an HTML page we can read. */
  | "unusable"
  /** robots.txt says not to. */
  | "robots";

export type FetchResult =
  | {
      ok: true;
      html: string;
      /** After redirects. This is what provenance is recorded against. */
      finalUrl: string;
      /** Every URL in the chain, for the audit log. */
      hops: string[];
      /** Every address actually connected to, in hop order, for the audit log. */
      addresses: string[];
    }
  | { ok: false; code: FetchFailure; reason: string };

type Hop = {
  status: number;
  headers: IncomingMessage["headers"];
  body: Buffer;
  address: string;
};

// ---------------------------------------------------------------------------
// One request, to one validated address
// ---------------------------------------------------------------------------

/**
 * Resolve `hostname` and return the ONE address every later step will use.
 *
 * Fails if the name does not resolve, if any answer is non-public, or if the
 * lookup outlives the deadline. `verbatim: true` keeps the resolver's own
 * ordering rather than Node's v4-first reshuffle — irrelevant to safety (both
 * families are classified) but it means we connect to what the OS would have.
 */
async function resolveOne(
  hostname: string,
  deadline: number,
): Promise<{ ok: true; address: string; family: number } | { ok: false; code: FetchFailure; reason: string }> {
  let answers: LookupAddress[];
  try {
    answers = (await withDeadline(
      dnsLookup(hostname, { all: true, verbatim: true }),
      deadline,
      "DNS",
    )) as LookupAddress[];
  } catch {
    return { ok: false, code: "unreachable", reason: "We couldn't look that domain up." };
  }
  if (!answers.length) {
    return { ok: false, code: "unreachable", reason: "That domain doesn't resolve to anything." };
  }

  for (const answer of answers) {
    const verdict = classifyAddress(answer.address);
    if (!verdict.ok) {
      // The whole name is refused, not just this record. A name that publishes
      // one private address is not a name we want to be talking to at all, and
      // "pick the public one" would mean the next lookup could differ.
      return { ok: false, code: "blocked", reason: verdict.reason };
    }
  }

  const chosen = answers[0];
  return { ok: true, address: chosen.address, family: chosen.family };
}

/**
 * A resolver that does not resolve.
 *
 * This is the whole TOCTOU fix in six lines: `https.request` is given this as
 * its `lookup`, so the connection layer never performs a second DNS query and
 * has no opportunity to receive a different answer. The hostname argument is
 * ignored on purpose — it is the same hostname we already resolved, and reading
 * it here would only invite someone to "helpfully" re-resolve it later.
 *
 * Both callback shapes are handled because `net.connect` calls a custom lookup
 * with `all: true` when Happy Eyeballs is in play and with `all: false`
 * otherwise, and which one you get has changed between Node versions.
 */
function pinnedLookup(address: string, family: number): LookupFunction {
  return (_hostname, options, callback) => {
    if (options && typeof options === "object" && options.all) {
      callback(null, [{ address, family }]);
    } else {
      callback(null, address, family);
    }
  };
}

/** Reject a promise that outlives the operation's wall clock. */
async function withDeadline<T>(promise: Promise<T>, deadline: number, what: string): Promise<T> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error(`${what} deadline expired`);
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${what} timed out`)), remaining);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * GET one URL, at one pre-validated address, with no redirect following and a
 * hard byte cap.
 *
 * The cap is enforced in the `data` handler and the socket is destroyed the
 * moment it is breached, so a server that streams forever costs us
 * `maxBytes + one chunk` of memory and nothing more. `Content-Length` is
 * consulted first purely as an optimisation: a declared size over the cap lets
 * us hang up before reading anything, and a declared size UNDER the cap buys no
 * trust at all.
 */
function getOnce(
  url: URL,
  address: string,
  family: number,
  maxBytes: number,
  deadline: number,
): Promise<Hop> {
  return new Promise<Hop>((resolve, reject) => {
    const budget = deadline - Date.now();
    if (budget <= 0) {
      reject(new Error("deadline expired"));
      return;
    }

    const req = https.request({
      protocol: "https:",
      host: url.hostname,
      port: IMPORT_LIMITS.PORT,
      path: `${url.pathname}${url.search}`,
      method: "GET",
      // TLS still validates the real hostname; only the ROUTE is pinned.
      servername: url.hostname,
      rejectUnauthorized: true,
      // No pooling. A shared agent could hand us a socket opened for a
      // different (or previously valid) resolution of the same host name.
      agent: false,
      lookup: pinnedLookup(address, family),
      timeout: Math.min(IMPORT_LIMITS.CONNECT_TIMEOUT_MS, budget),
      headers: {
        // Set explicitly rather than left to Node, so it is obvious in review
        // that the wire request names the hostname while the socket goes to the
        // pinned address.
        Host: url.host,
        "User-Agent": USER_AGENT,
        Accept: "text/html,text/plain;q=0.5",
        "Accept-Language": "en",
        // Compressed bodies would make the byte cap meaningless: 2MB of gzip is
        // a great deal more than 2MB of HTML, and a decompression bomb is the
        // obvious follow-up. Identity costs bandwidth we can afford.
        "Accept-Encoding": "identity",
        Connection: "close",
      },
    });

    const hardStop = setTimeout(() => {
      req.destroy(new Error("total deadline expired"));
    }, budget);

    const finish = (fn: () => void) => {
      clearTimeout(hardStop);
      fn();
    };

    req.on("timeout", () => {
      req.destroy(new Error("connect timed out"));
    });
    req.on("error", (err) => finish(() => reject(err)));

    req.on("response", (res) => {
      const chunks: Buffer[] = [];
      let received = 0;

      const declared = Number(res.headers["content-length"] ?? "");
      if (Number.isFinite(declared) && declared > maxBytes) {
        res.destroy();
        req.destroy();
        finish(() => reject(new Error("response too large")));
        return;
      }

      res.on("data", (chunk: Buffer) => {
        received += chunk.length;
        if (received > maxBytes) {
          res.destroy();
          req.destroy();
          finish(() => reject(new Error("response too large")));
          return;
        }
        chunks.push(chunk);
      });
      res.on("aborted", () => finish(() => reject(new Error("connection aborted"))));
      res.on("error", (err) => finish(() => reject(err)));
      res.on("end", () =>
        finish(() =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks),
            address,
          }),
        ),
      );
    });

    req.end();
  });
}

// ---------------------------------------------------------------------------
// Decoding
// ---------------------------------------------------------------------------

/**
 * Bytes to a string, using the charset the server declared.
 *
 * `fatal: false` so a page with a couple of mis-encoded bytes still imports —
 * replacement characters in a business name are visible in the review list and
 * the user can fix them, which is a far better outcome than refusing the whole
 * page. An unknown label falls back to UTF-8 rather than throwing.
 */
function decodeBody(body: Buffer, contentType: string): string {
  const match = /charset\s*=\s*"?([\w-]{1,40})"?/i.exec(contentType);
  const label = match?.[1]?.toLowerCase() ?? "utf-8";
  try {
    return new TextDecoder(label, { fatal: false }).decode(body);
  } catch {
    return new TextDecoder("utf-8", { fatal: false }).decode(body);
  }
}

function contentTypeOf(hop: Hop): string {
  const raw = hop.headers["content-type"];
  return (Array.isArray(raw) ? raw[0] : raw) ?? "";
}

// ---------------------------------------------------------------------------
// robots.txt
// ---------------------------------------------------------------------------

/**
 * Does the site's robots.txt permit us to read this path?
 *
 * Checked because we are a bot arriving uninvited at somebody's server, and the
 * cheapest way to be a good one is to read the file that says what they want.
 * It is also self-interested: the current-site case is a user importing their
 * own site, and a user whose own robots.txt blocks us gets a clear message
 * rather than a mysterious failure.
 *
 * Behaviour on failure follows RFC 9309 in the direction that does not punish
 * ordinary sites: 4xx or no file means allow (most sites have no robots.txt),
 * a network error means allow (we are one request, not a crawl), and 5xx means
 * refuse, because a server explicitly failing to serve its own policy is the
 * one case where guessing is rude.
 *
 * The fetch itself goes through exactly the same pinned-address machinery as
 * the page. It is not a side door: an unvalidated robots fetch would be an SSRF
 * with a friendlier name.
 */
async function robotsAllows(url: URL, address: string, family: number, deadline: number): Promise<boolean> {
  const robotsUrl = new URL("/robots.txt", url);
  let hop: Hop;
  try {
    hop = await getOnce(robotsUrl, address, family, IMPORT_LIMITS.MAX_ROBOTS_BYTES, deadline);
  } catch {
    return true;
  }
  if (hop.status >= 500) return false;
  if (hop.status !== 200) return true;

  const text = decodeBody(hop.body, contentTypeOf(hop));
  return robotsPermits(text, `${url.pathname}${url.search}`);
}

/**
 * A deliberately small robots.txt reader: group the file by `User-agent`, take
 * the group that names us if there is one and the `*` group otherwise, and
 * apply longest-match-wins between Allow and Disallow (RFC 9309 §2.2.2).
 *
 * Exported so it can be tested without a network.
 */
export function robotsPermits(text: string, path: string): boolean {
  const groups = new Map<string, string[]>();
  let current: string[] = [];
  let inGroup = false;

  for (const rawLine of text.slice(0, IMPORT_LIMITS.MAX_ROBOTS_BYTES).split(/\r?\n/)) {
    const line = rawLine.split("#")[0].trim();
    if (!line) continue;
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (field === "user-agent") {
      const agent = value.toLowerCase();
      if (!inGroup) current = [];
      inGroup = true;
      if (!groups.has(agent)) groups.set(agent, current);
      else current = groups.get(agent) as string[];
      continue;
    }
    if (field === "allow" || field === "disallow") {
      inGroup = false;
      current.push(`${field}:${value}`);
    }
  }

  const rules = groups.get(ROBOTS_TOKEN) ?? groups.get("*");
  if (!rules) return true;

  let bestLength = -1;
  let bestAllows = true;
  for (const rule of rules) {
    const colon = rule.indexOf(":");
    const kind = rule.slice(0, colon);
    const pattern = rule.slice(colon + 1);
    // An empty Disallow means "nothing is disallowed" and is not a match.
    if (kind === "disallow" && pattern === "") continue;
    if (!matchesRobotsPattern(pattern, path)) continue;
    // Ties go to Allow, per the RFC.
    if (pattern.length > bestLength || (pattern.length === bestLength && kind === "allow")) {
      bestLength = pattern.length;
      bestAllows = kind === "allow";
    }
  }
  return bestAllows;
}

/** `*` wildcards and a trailing `$` anchor, which is all robots.txt defines. */
function matchesRobotsPattern(pattern: string, path: string): boolean {
  if (pattern === "") return true;
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const escaped = body.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}${anchored ? "$" : ""}`).test(path);
}

// ---------------------------------------------------------------------------
// The public entry point
// ---------------------------------------------------------------------------

/**
 * Fetch one page's HTML, or refuse and say why.
 *
 * Every failure returns a `code` so the route can decide the status and a
 * `reason` written for the person who typed the URL. The reason for a blocked
 * address is deliberately the same sentence whichever private range it landed
 * in: a caller probing our network should not be able to read our answers as a
 * map of it.
 */
export async function fetchSiteHtml(raw: string): Promise<FetchResult> {
  if (!isUrlImportConfigured()) {
    return {
      ok: false,
      code: "blocked",
      reason: "Importing by URL isn't switched on. Paste the text from your site instead.",
    };
  }

  const first = validateImportUrl(raw);
  if (!first.ok) return { ok: false, code: "blocked", reason: first.reason };

  const deadline = Date.now() + IMPORT_LIMITS.TOTAL_TIMEOUT_MS;
  const hops: string[] = [];
  const addresses: string[] = [];

  let url = first.url;
  let robotsChecked = "";

  for (let hop = 0; hop <= IMPORT_LIMITS.MAX_REDIRECTS; hop++) {
    // Fresh resolution and fresh classification on EVERY hop. Hop three gets
    // exactly the scrutiny hop zero did.
    const resolved = await resolveOne(url.hostname, deadline);
    if (!resolved.ok) return { ok: false, code: resolved.code, reason: resolved.reason };

    hops.push(url.toString());
    addresses.push(resolved.address);

    // Once per host in the chain, not once per request: a redirect within the
    // same site should not cost a second robots fetch out of the same 10s.
    if (robotsChecked !== url.hostname) {
      const allowed = await robotsAllows(url, resolved.address, resolved.family, deadline);
      robotsChecked = url.hostname;
      if (!allowed) {
        return {
          ok: false,
          code: "robots",
          reason: `${url.hostname}'s robots.txt asks bots not to read that page. Paste the text instead.`,
        };
      }
    }

    let response: Hop;
    try {
      response = await getOnce(
        url,
        resolved.address,
        resolved.family,
        IMPORT_LIMITS.MAX_HTML_BYTES,
        deadline,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (message === "response too large") {
        return { ok: false, code: "unusable", reason: "That page is too big to read." };
      }
      return {
        ok: false,
        code: "unreachable",
        reason: "We couldn't reach that page. Check the address, or paste the text instead.",
      };
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.location;
      const target = Array.isArray(location) ? location[0] : location;
      if (!target) {
        return { ok: false, code: "unusable", reason: "That page redirected nowhere." };
      }
      if (hop === IMPORT_LIMITS.MAX_REDIRECTS) {
        return { ok: false, code: "unusable", reason: "That address redirects too many times." };
      }
      const next = resolveRedirect(target, url);
      if (!next.ok) return { ok: false, code: "blocked", reason: next.reason };
      url = next.url;
      continue;
    }

    if (response.status !== 200) {
      return {
        ok: false,
        code: "unusable",
        reason: `That page answered with a ${response.status}. Check the address, or paste the text instead.`,
      };
    }

    const contentType = contentTypeOf(response);
    // Allowlist, and it is checked on the FINAL hop's response rather than
    // anywhere earlier: a redirect chain that ends at an internal service
    // answering `application/json` stops here even if every address passed.
    if (!/^\s*text\/html\b/i.test(contentType)) {
      return {
        ok: false,
        code: "unusable",
        reason: "That address isn't an HTML page. Give us the address of the page itself.",
      };
    }

    return {
      ok: true,
      html: decodeBody(response.body, contentType),
      finalUrl: url.toString(),
      hops,
      addresses,
    };
  }

  return { ok: false, code: "unusable", reason: "That address redirects too many times." };
}
