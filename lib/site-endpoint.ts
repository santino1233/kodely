import { createHash } from "node:crypto";
import { bareHost, siteHostAllowed } from "@/app/api/site/[slug]/site-host";

// =============================================================================
// SHARED MACHINERY FOR "A PUBLISHED SITE POSTS SOMETHING BACK TO KODELY"
// =============================================================================
//
// Both lib/site-forms.ts (`POST /__forms/<name>`) and lib/site-records.ts
// (`POST /__records/<kind>`) are the same shape of hole in "generated sites
// have no backend": a same-origin `<form method="post">` navigation, landing
// on this app's own database, guarded by the same host/origin checks, the
// same body caps, and the same three-layer rate limiter. This file is ONLY
// the part that is genuinely identical between them - parsing field bodies,
// hashing IPs, bounding an in-process counter, building the HTML reply a
// browser navigation expects. Anything that differs (which model gets
// written, what the reply says, the exact rate-limit numbers) stays in the
// two callers.

const SITES_BASE = (process.env.KODELY_SITES_BASE ?? "kodely.site").trim().toLowerCase();

// -- Identifiers used in a URL path segment ----------------------------------
//
// A form name and a record kind are both "a short, boring, URL-safe word the
// builder chose", validated the same way for the same reason: it is stored
// and it is part of a public path, so it must never need escaping anywhere.
export const PATH_IDENTIFIER_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;

// -- Field bodies -------------------------------------------------------------
//
// The cap discipline from FormSubmission's original design, unchanged:
// stored fields are capped in count, key length and value length, and the
// combination cannot exceed what MAX_BODY_BYTES already refused to read past.
export const MAX_FIELDS = 12;
export const MAX_KEY_LENGTH = 64;
export const MAX_VALUE_LENGTH = 5000;
/** Field names the builder may emit. Rejecting anything else keeps the stored
 *  JSON's key space to identifiers, so no key can collide with object
 *  internals or need escaping anywhere downstream. */
export const FIELD_NAME_RE = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

// Control characters to strip from a submitted value, expressed via char
// codes rather than a \u escape literal in source so nothing downstream can
// mistake this for text that needs its own escaping: C0 controls other than
// the newline already normalised below, plus DEL.
const CONTROL_CHARS_RE = new RegExp(
  "[" +
    String.fromCharCode(0) +
    "-" +
    String.fromCharCode(8) +
    String.fromCharCode(11) +
    String.fromCharCode(12) +
    String.fromCharCode(14) +
    "-" +
    String.fromCharCode(31) +
    String.fromCharCode(127) +
    "]",
  "g",
);

/** Collapse control characters, normalise newlines, trim. Never HTML-escapes:
 *  escaping belongs at each output boundary, not in storage, or the stored
 *  value stops being what the visitor typed. */
export function cleanValue(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL_CHARS_RE, "")
    .trim();
}

export type ParsedBody =
  | { ok: true; fields: Record<string, string>; control: Record<string, string> }
  | { ok: false; status: number; message: string };

/**
 * Parse an `application/x-www-form-urlencoded` body into stored fields and
 * `_`-prefixed control fields (the honeypot, the timing token, the post-submit
 * destination), applying the same caps FormSubmission has always used.
 */
export function parseFields(raw: string): ParsedBody {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(raw);
  } catch {
    return { ok: false, status: 400, message: "That could not be read." };
  }

  const fields: Record<string, string> = {};
  const control: Record<string, string> = {};
  const seen = new Set<string>();

  for (const key of params.keys()) {
    if (seen.has(key)) continue;
    seen.add(key);

    if (key.length > MAX_KEY_LENGTH) {
      return { ok: false, status: 400, message: "That had an unexpected field." };
    }

    // `_`-prefixed names are control fields: never stored, never emailed.
    if (key.startsWith("_")) {
      control[key] = cleanValue(params.get(key) ?? "").slice(0, 200);
      continue;
    }

    if (!FIELD_NAME_RE.test(key)) {
      return { ok: false, status: 400, message: "That had an unexpected field." };
    }

    // Repeated names (a checkbox group) collapse to one field, not many.
    const value = cleanValue(params.getAll(key).join(", "));
    if (value.length > MAX_VALUE_LENGTH) {
      return {
        ok: false,
        status: 413,
        message: `One of those answers is too long (${MAX_VALUE_LENGTH} characters max).`,
      };
    }
    if (value === "") continue;

    if (Object.keys(fields).length >= MAX_FIELDS) {
      return { ok: false, status: 400, message: "That had too many fields." };
    }
    fields[key] = value;
  }

  if (Object.keys(fields).length === 0) {
    return { ok: false, status: 400, message: "Please fill something in before sending it." };
  }
  return { ok: true, fields, control };
}

// -- Body reading -------------------------------------------------------------

/**
 * Read at most `maxBytes`, then stop.
 *
 * `await req.text()` would buffer whatever was sent, and Content-Length is a
 * claim by the caller, not a fact - so the length header is only used as a
 * fast pre-check and the stream is counted as it arrives. Returns null when
 * the cap is passed, and cancels the rest rather than draining it.
 */
export async function readCapped(req: Request, maxBytes: number): Promise<string | null> {
  const declared = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) return null;

  const body = req.body;
  if (!body) return "";

  const reader = body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  let done = false;
  while (!done) {
    const next = await reader.read();
    done = next.done;
    if (next.value) {
      total += next.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(Buffer.from(next.value));
    }
  }
  return Buffer.concat(chunks).toString("utf8");
}

// -- IP handling ---------------------------------------------------------------

/**
 * The client address, or the shared bucket for traffic that did not come
 * through the edge.
 *
 * Only `cf-connecting-ip` is trustworthy here. Cloudflare sets it on every
 * request, overwriting whatever the client sent. `x-forwarded-for`'s first
 * entry is attacker-chosen - Cloudflare APPENDS rather than replaces - so
 * keying on it hands an attacker a fresh bucket per request.
 *
 * No header => direct-to-origin or local dev => one shared, strict bucket.
 * Fails closed: such traffic is throttled collectively, never exempted.
 */
export function clientIp(req: Request): string {
  return req.headers.get("cf-connecting-ip")?.trim().toLowerCase() || "no-edge";
}

/**
 * What actually gets stored against a row. A raw visitor IP is personal data
 * the site owner has no need for; a salted digest still supports rate
 * limiting and abuse triage and is useless for anything else. Stable across
 * restarts on purpose - a per-process salt would hand every address a fresh
 * bucket on each deploy. Each caller supplies its own salt so the two
 * features' digests are not interchangeable with each other.
 */
export function hashIp(salt: string, ip: string): string {
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

// -- Layer 1: in-process burst limiter ------------------------------------------

export type BurstLimiter = { limited(key: string): boolean };

/**
 * A bounded, in-process, sliding-window limiter. Each caller gets its own
 * instance (its own Map, its own limit/window/key cap) so the two features
 * cannot exhaust or reset each other's buckets.
 *
 * The map is bounded without ever letting a flood of unique keys wipe it:
 * expired entries go first, then the least recently active - an attacker's
 * own bucket is the most recently active, so it is the last thing evicted.
 * Deliberately NOT a wholesale `clear()`: that would be a documented way for
 * an attacker to reset the counter that is throttling them.
 */
export function createBurstLimiter(opts: {
  limit: number;
  windowMs: number;
  maxKeys: number;
}): BurstLimiter {
  const hits = new Map<string, number[]>();

  function sweep(now: number): void {
    if (hits.size <= opts.maxKeys) return;
    for (const [key, arr] of hits) {
      if (arr.length === 0 || arr[arr.length - 1] <= now - opts.windowMs) hits.delete(key);
    }
    if (hits.size <= opts.maxKeys) return;
    const byLastSeen = [...hits.entries()].sort(
      (a, b) => a[1][a[1].length - 1] - b[1][b[1].length - 1],
    );
    for (const [key] of byLastSeen.slice(0, hits.size - opts.maxKeys)) hits.delete(key);
  }

  return {
    limited(key: string): boolean {
      const now = Date.now();
      sweep(now);
      const recent = (hits.get(key) ?? []).filter((t) => t > now - opts.windowMs);
      if (recent.length >= opts.limit) {
        hits.set(key, recent);
        return true;
      }
      recent.push(now);
      hits.set(key, recent);
      return false;
    },
  };
}

// -- Spam signal -----------------------------------------------------------------

/**
 * Honeypot + timing verdict, shared because the contract is the same
 * wherever a control-field pair (`_gotcha`, `_t`) can appear: a field no
 * human can see is automation if filled in, and a submission completed
 * faster than `minFillMs` after the token's timestamp is very likely a
 * script. Advisory only - see the markup contract in lib/site-forms.ts.
 */
export function isLikelySpam(control: Record<string, string>, now: number, minFillMs: number): boolean {
  const trapped = (control._gotcha ?? "") !== "";
  const startedAt = Number(control._t ?? "");
  const tooFast =
    Number.isFinite(startedAt) &&
    startedAt > now - 24 * 60 * 60_000 &&
    startedAt <= now &&
    now - startedAt < minFillMs;
  return trapped || tooFast;
}

// -- Host / origin checks ---------------------------------------------------------

/**
 * Where "Back to the site" and a `_next` redirect point.
 *
 * On the branded subdomain the site is at `/`. On the staging path form
 * (staging.kodely.me/api/site/<slug>/ - see site-host.ts) it is one directory
 * deep, and a bare `/` would leave the customer's site entirely.
 */
export function siteBase(host: string, slug: string): string {
  return bareHost(host) === `${slug}.${SITES_BASE}` ? "/" : `/api/site/${slug}/`;
}

/**
 * A browser always sends Origin on a cross-document POST, and for a form on
 * the site itself it is the site's own origin. Requiring it costs nothing and
 * turns away the simplest scripted floods and any other page trying to post
 * here on a visitor's behalf. It is FORGEABLE by anything that is not a
 * browser - this is a filter, not an authorisation check.
 */
export function originAllowed(req: Request, slug: string): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  return siteHostAllowed(originHost, slug);
}

/**
 * An optional post-submit destination, resolved against the site's own base.
 *
 * Only a path, never a URL: it must start with a single `/`, and
 * `//evil.example` (a protocol-relative URL, which is a cross-origin redirect
 * wearing a path's clothes) is rejected along with anything carrying a scheme
 * or a backslash. So this cannot become an open redirect, whatever the
 * builder emits.
 */
export function nextPath(control: Record<string, string>, base: string): string | null {
  const raw = control._next;
  if (!raw) return null;
  if (!/^\/[A-Za-z0-9\-._~!$&'()*+,;=:@%/?#]*$/.test(raw)) return null;
  if (raw.startsWith("//")) return null;
  return `${base}${raw.slice(1)}`;
}

// -- HTML replies -------------------------------------------------------------
//
// A native form POST is a NAVIGATION: whatever comes back is what the visitor
// sees. So every reply here is a small, self-contained HTML page rather than
// JSON, and it echoes nothing that was submitted.

// -- Shared email-shaped-value check -----------------------------------------
//
// The one regex both features use whenever a submitted field needs to be
// treated as a real address rather than arbitrary text — lib/site-forms.ts's
// Reply-To header and lib/site-records.ts's "you can also find this link
// again" hint. Exported so there is exactly one definition rather than two
// independently-maintained copies drifting apart: a looser copy in one file
// would silently change what counts as "plausible" there, and a header-safe
// regex, of all things, is not a place to duplicate by hand.
//
// No CR, no LF, no comma, no semicolon, no angle bracket and no quote, so a
// value that passes cannot terminate a mail header or start another one — see
// replyToFor in lib/site-forms.ts for the full reasoning.
export const STRICT_EMAIL_RE =
  /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Our own page, not the customer's, so it gets its own policy rather than the
// site's SANDBOX_CSP: it needs nothing but inline styles and must never be
// framed.
//
// form-action 'self' rather than 'none': lib/site-records.ts's confirmation
// page (recordSavedReply) is the one reply that legitimately carries a real
// form of its own (the manage-this-record page a visitor reaches from that
// reply's link posts back to this same origin) — see REPLY_CSP's export.
// Every OTHER reply built with htmlReply() has no form on it at all, so
// widening this from 'none' costs those replies nothing.
export const REPLY_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

export function htmlReply(status: number, title: string, body: string, backHref: string): Response {
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="robots" content="noindex">
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#f6f7f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111111;">
    <main style="max-width:420px;text-align:center;">
      <h1 style="margin:0 0 12px 0;font-size:20px;font-weight:600;letter-spacing:-0.01em;">${escapeHtml(title)}</h1>
      <p style="margin:0 0 20px 0;font-size:15px;line-height:1.6;color:#4b5563;">${escapeHtml(body)}</p>
      <a href="${escapeHtml(backHref)}" style="display:inline-block;padding:10px 18px;background:#111111;color:#ffffff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600;">Back to the site</a>
    </main>
  </body>
</html>
`;
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": REPLY_CSP,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Cache-Control": "no-store",
    },
  });
}

/**
 * The reply for "this site does not exist, is not published, or you are
 * asking from a host that may not serve it".
 *
 * One response for all three on purpose, and byte-compatible in meaning with
 * the GET handler's 404: a caller probing for which slugs exist, or which are
 * published, learns nothing from the difference.
 */
export function siteNotFound(): Response {
  return new Response("Site not found.", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
