import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { isMailConfigured, sendMail } from "@/lib/mail";
import { siteBaseUrl } from "@/lib/site-seo";
import { siteHostAllowed } from "@/app/api/site/[slug]/site-host";
import {
  STRICT_EMAIL_RE,
  clientIp,
  createBurstLimiter,
  escapeHtml,
  hashIp,
  htmlReply,
  nextPath,
  originAllowed,
  readCapped,
  siteBase,
  siteNotFound,
} from "@/lib/site-endpoint";

// =============================================================================
// VISITOR ACCOUNTS ON A PUBLISHED GENERATED SITE — MAGIC-LINK ONLY ("Phase 2")
// =============================================================================
//
// A real "sign in" capability for a generated site's OWN visitors — "log in
// to see your bookings", "create an account to track your orders" — built the
// same way every other backend-shaped hole in "generated sites have no
// backend" is built: a plain, same-origin `<form method="post">` and a plain
// `<a href>` magic link, never a fetch, never client state, never a CSP
// relaxation. See lib/site-forms.ts and lib/site-records.ts for the shared
// reasoning; it applies here unchanged.
//
// WHY MAGIC-LINK ONLY, FOREVER
// ----------------------------------------------------------------------------
// The builder model writes arbitrary markup for an arbitrary business. A
// password field is an invitation for it to also write (badly) the storage,
// hashing and comparison behind that field — the one class of security bug
// this whole platform cannot let a generated site's author reinvent. Removing
// the option removes the bug: there is no password COLUMN anywhere in this
// file's schema, no password check anywhere in this file's code, and nothing
// in lib/agent.ts ever tells the model that a password path exists. A visitor
// proves who they are by reading an email only they can read — nothing else.
//
// A COMPLETELY SEPARATE TRUST DOMAIN FROM lib/auth.ts
// ----------------------------------------------------------------------------
// lib/auth.ts is Kodely's OWN portal login, for customers signing into their
// Kodely dashboard at kodely.me. A visitor logging into a generated site at
// <slug>.kodely.site is a stranger to Kodely who happens to be looking at one
// customer's site. The two must never be confusable:
//   - dedicated tables (SiteVisitor / SiteLoginToken / SiteSession), never
//     User / Session;
//   - a dedicated, distinctly-named cookie (SITE_SESSION_COOKIE below), never
//     anything resembling SESSION_COOKIE from lib/auth-cookies.ts;
//   - dedicated salts for every hash, never reused across the two systems or
//     across lib/site-records.ts's own tokens;
//   - no `Domain` attribute on the cookie, exactly like lib/auth.ts's own
//     cookie — host-scoped to the exact site, never valid across subdomains.
// And identity is scoped PER PROJECT, not globally: the same email address on
// two different generated sites produces two unrelated SiteVisitor rows with
// no linkage between them (SiteVisitor's own unique constraint is
// `(projectId, email)`), which keeps this simple and avoids a real
// cross-site privacy/correlation problem — the site owner for project A has
// no way to learn that "the same person" also has an account on project B.
//
// SHARED MACHINERY
// ----------------------------------------------------------------------------
// Host/origin checks, body reading, field parsing, IP hashing, the burst
// limiter shape and the HTML-reply plumbing are the same lib/site-endpoint.ts
// helpers every other same-origin write here uses. This file adds only what
// is genuinely new: the token/session lifecycle, the cookie itself, and the
// two rate limiters this feature's own abuse shape calls for.

/** First path segment of every route this file answers: `/__auth/<action>`. */
export const AUTH_PATH_SEGMENT = "__auth";

/**
 * The visitor session cookie. Distinctly named from lib/auth-cookies.ts's
 * `kodely_session` (and its `kodely_auth` hint) so the two can never be
 * mistaken for each other in a browser devtools panel, a support ticket, or a
 * bug report. No `Domain` attribute is ever set on it (see setSessionCookie
 * below) — same host-scoping lib/auth.ts's own cookie already uses.
 */
export const SITE_SESSION_COOKIE = "kodely_site_session";

const SITE_SESSION_DAYS = 30;
const LOGIN_TOKEN_MINUTES = 15;

const LOGIN_TOKEN_BYTES = 32; // 256 bits — same as SiteRecord's edit token.
const SESSION_TOKEN_BYTES = 32;

/** Independent salts, one per hashed secret, matching this codebase's rule
 *  that no digest is ever comparable across two different secrets. */
const LOGIN_TOKEN_SALT = process.env.SITE_LOGIN_TOKEN_SALT ?? "kodely:site-auth:login-token:v1";
const SESSION_TOKEN_SALT = process.env.SITE_SESSION_TOKEN_SALT ?? "kodely:site-auth:session-token:v1";
/** Salt for the per-recipient rate-limit key — independent of every other
 *  email-address digest in the codebase (RECORD_CONFIRM_EMAIL_SALT included),
 *  for the same reason IP_SALT differs per feature. */
const EMAIL_SALT = process.env.SITE_AUTH_EMAIL_SALT ?? "kodely:site-auth:email:v1";
/** Salt for the generic per-IP flood guard, independent of every other
 *  ipHash in the codebase. */
const IP_SALT = process.env.SITE_AUTH_IP_SALT ?? "kodely:site-auth:ip:v1";

function newToken(bytes: number): string {
  return randomBytes(bytes).toString("hex");
}

function hashLoginToken(token: string): string {
  return createHash("sha256").update(`${LOGIN_TOKEN_SALT}:${token}`).digest("hex");
}

function hashSessionToken(token: string): string {
  return createHash("sha256").update(`${SESSION_TOKEN_SALT}:${token}`).digest("hex");
}

function hashRecipient(address: string): string {
  return createHash("sha256").update(`${EMAIL_SALT}:${address.trim().toLowerCase()}`).digest("hex");
}

/** Constant-time comparison of two hex digests — same discipline, and the
 *  same reasoning, as hashesMatch() in lib/site-records.ts: a secret an
 *  anonymous caller holds should never be checked with `===`. Restated here
 *  rather than imported because that function is not exported (kept private
 *  to its own file's token type on purpose), and this file's tokens are a
 *  different secret with a different salt regardless. */
function hashesMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  return bufA.length === bufB.length && bufA.length > 0 && timingSafeEqual(bufA, bufB);
}

// ── Rate limits ──────────────────────────────────────────────────────────────
//
// This endpoint is a STRONGER phishing/spam-relay vector than
// lib/site-records.ts's confirmation email: that one only fires as a
// byproduct of submitting a real record, while `/__auth/request` is a bare,
// unauthenticated "send me a login link to this address" trigger with no
// other purpose. So every limit here is at least as strict as the
// corresponding one there:
//
//   - a generic per-IP burst layer (site-records.ts's confirmation email has
//     none of its own — it inherits the create endpoint's — this endpoint
//     has to bring its own since a login request has no such parent flow);
//   - a per-project ceiling, HALF of confirmProjectBurst's 20/hour;
//   - a per-recipient-address ceiling, same as confirmRecipientBurst's
//     3/hour — already the tightest reasonable number for legitimate reuse.
//
// The per-recipient limiter is the one that actually matters for the
// harassment case (a stranger's address being repeatedly mailed a sign-in
// link it never asked for): keyed on nothing but the hashed address, so it
// catches an attacker spreading requests across many projects just as it
// catches one hammering a single project.
const IP_BURST_LIMIT = 5;
const IP_BURST_WINDOW_MS = 5 * 60_000;
const IP_BURST_MAX_KEYS = 20_000;
const ipBurst = createBurstLimiter({ limit: IP_BURST_LIMIT, windowMs: IP_BURST_WINDOW_MS, maxKeys: IP_BURST_MAX_KEYS });

const PROJECT_HOUR_LIMIT = 10;
const PROJECT_WINDOW_MS = 60 * 60_000;
const PROJECT_MAX_KEYS = 5_000;
const projectBurst = createBurstLimiter({ limit: PROJECT_HOUR_LIMIT, windowMs: PROJECT_WINDOW_MS, maxKeys: PROJECT_MAX_KEYS });

const RECIPIENT_HOUR_LIMIT = 3;
const RECIPIENT_WINDOW_MS = 60 * 60_000;
const RECIPIENT_MAX_KEYS = 20_000;
const recipientBurst = createBurstLimiter({
  limit: RECIPIENT_HOUR_LIMIT,
  windowMs: RECIPIENT_WINDOW_MS,
  maxKeys: RECIPIENT_MAX_KEYS,
});

/** A second, independent burst limiter for /__auth/verify — the token space
 *  (256 bits) already makes guessing computationally hopeless, but this is
 *  the same defense-in-depth lib/site-records.ts's manageBurst applies to its
 *  own token check: bound the REQUEST rate, not just trust the math. */
const VERIFY_BURST_LIMIT = 20;
const VERIFY_BURST_WINDOW_MS = 5 * 60_000;
const VERIFY_BURST_MAX_KEYS = 20_000;
const verifyBurst = createBurstLimiter({
  limit: VERIFY_BURST_LIMIT,
  windowMs: VERIFY_BURST_WINDOW_MS,
  maxKeys: VERIFY_BURST_MAX_KEYS,
});

const LOGOUT_BURST_LIMIT = 20;
const LOGOUT_BURST_WINDOW_MS = 5 * 60_000;
const LOGOUT_BURST_MAX_KEYS = 20_000;
const logoutBurst = createBurstLimiter({
  limit: LOGOUT_BURST_LIMIT,
  windowMs: LOGOUT_BURST_WINDOW_MS,
  maxKeys: LOGOUT_BURST_MAX_KEYS,
});

/** Bytes of request body ever read for a login request — one field, so far
 *  smaller than a form/record body cap is warranted. */
const MAX_BODY_BYTES = 4 * 1024;

// ── Cookie plumbing ──────────────────────────────────────────────────────────
//
// The site route handlers here work with the raw Fetch API Request/Response,
// not NextRequest/NextResponse, so cookies are read from the `Cookie` header
// and written via a hand-built `Set-Cookie` value — the same level the rest
// of this route already operates at (see lib/site-endpoint.ts's htmlReply,
// which sets headers directly rather than going through next/headers).

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

/**
 * `Set-Cookie` for a fresh site session. HttpOnly (never readable by the
 * generated page's own JS — there is no reason it ever should be, and
 * `script-src 'unsafe-inline'` in SANDBOX_CSP means the builder's own code
 * runs on this origin), Secure outside local dev, SameSite=Lax (a same-origin
 * form POST or a clicked email link both still carry it), and deliberately NO
 * `Domain` attribute — host-scoped to the exact site, matching lib/auth.ts's
 * own cookie and the instruction never to make this valid across subdomains.
 */
function setSessionCookie(headers: Headers, token: string, expiresAt: Date): void {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  headers.append(
    "Set-Cookie",
    `${SITE_SESSION_COOKIE}=${token}; Path=/; Expires=${expiresAt.toUTCString()}; HttpOnly; SameSite=Lax${secure}`,
  );
}

function clearSessionCookie(headers: Headers): void {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  headers.append(
    "Set-Cookie",
    `${SITE_SESSION_COOKIE}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax${secure}`,
  );
}

// ── The shared "who is this visitor" resolver ───────────────────────────────

export type ResolvedSiteVisitor = { id: string; email: string };

/**
 * The ONE place a site session cookie is ever read, hashed and looked up —
 * used by BOTH the GET route (to decide what `data-kodely-mine` renders) and
 * the record-creation path (to decide what `siteVisitorId` a new SiteRecord
 * gets stamped with). Factored out precisely so those two call sites cannot
 * drift on what "signed in" means: same cookie name, same hash, same
 * project-scoping.
 *
 * `projectId`-scoped lookup (not just "does this hash exist anywhere") is
 * what makes a session minted on one project's site unable to resolve a
 * visitor "for" a different project — SiteSession.projectId is denormalised
 * for exactly this single-column check.
 *
 * Returns null on anything short of "a live, non-expired session for this
 * exact project" — a missing cookie, a hash that matches nothing, an expired
 * row, or a hash that matches a DIFFERENT project's session all resolve the
 * same way: no visitor.
 */
export async function resolveSiteVisitor(req: Request, projectId: string): Promise<ResolvedSiteVisitor | null> {
  const token = readCookie(req, SITE_SESSION_COOKIE);
  if (!token) return null;

  const tokenHash = hashSessionToken(token);
  const session = await db.siteSession.findFirst({
    where: { tokenHash, projectId, expiresAt: { gt: new Date() } },
    select: { siteVisitor: { select: { id: true, email: true } } },
  });
  return session?.siteVisitor ?? null;
}

// ── The one anti-enumeration reply for /__auth/request ──────────────────────
//
// Every distinguishable outcome of a login request — new address, existing
// address, mail not configured, either rate limit tripped, even an address
// that never looked like an email at all — reaches this SAME reply. The
// difference between "we sent it" and "we didn't" is exactly the thing an
// attacker probing for registered addresses wants to learn, so nothing about
// this feature's behaviour is allowed to leak it through the response.
function loginRequestedReply(base: string): Response {
  return htmlReply(
    200,
    "Check your email",
    "If that email has an account here, or can have one, we've sent a sign-in link. It's valid for 15 minutes.",
    base,
  );
}

/** Same one-reply-for-every-failure-reason discipline as manageInvalidReply()
 *  in lib/site-records.ts: a caller guessing tokens learns nothing from the
 *  difference between "no such token", "already used" and "expired". */
function verifyInvalidReply(base: string): Response {
  return htmlReply(
    404,
    "That link isn't valid",
    "This sign-in link doesn't work any more. It may have been mistyped, already used, or it's expired — request a new one from the site.",
    base,
  );
}

// ── The magic-link email ─────────────────────────────────────────────────────
//
// Same discipline as lib/site-records.ts's manageLinkEmail(): fixed, minimal,
// non-reflective content (only the project name and the link itself are
// interpolated, both escaped), no Reply-To (this mail goes TO the visitor;
// nobody should reply to it), fire-and-forget with failures logged but never
// surfaced to the caller (surfacing them would itself be an enumeration leak
// — see loginRequestedReply above).

function headerSafe(value: string, max = 200): string {
  return value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function loginLinkEmail(input: { projectName: string; verifyHref: string }): {
  subject: string;
  text: string;
  html: string;
} {
  const name = headerSafe(input.projectName, 80) || "a Kodely site";
  const text = [
    `Someone (hopefully you) asked to sign in to ${name} with this email address.`,
    "",
    "Use this link to sign in — it works once, and expires in 15 minutes:",
    input.verifyHref,
    "",
    "If you didn't ask for this, you can ignore this message — no account was accessed and nothing else will happen.",
    "",
    "--",
    "This is an automated message from Kodely, the platform this site is built on.",
  ].join("\n");

  const html = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Your sign-in link</title></head>
  <body style="margin:0;padding:24px;background:#f6f7f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111111;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:28px;">
      <p style="margin:0 0 20px 0;font-size:14px;font-weight:600;letter-spacing:-0.01em;color:#111111;">kodely</p>
      <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;">Someone (hopefully you) asked to sign in to ${escapeHtml(
        name,
      )} with this email address.</p>
      <p style="margin:0 0 20px 0;"><a href="${escapeHtml(
        input.verifyHref,
      )}" style="display:inline-block;padding:10px 18px;background:#111111;color:#ffffff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600;">Sign in</a></p>
      <p style="margin:0 0 20px 0;padding:12px;background:#f6f7f8;border:1px solid #e5e7eb;border-radius:8px;font-size:13px;word-break:break-all;"><a href="${escapeHtml(
        input.verifyHref,
      )}" style="color:#111111;">${escapeHtml(input.verifyHref)}</a></p>
      <p style="margin:24px 0 0 0;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;line-height:1.5;color:#6b7280;">This link works once and expires in 15 minutes. If you didn&#39;t ask for this, you can ignore this message — no account was accessed and nothing else will happen. This is an automated message from Kodely, the platform this site is built on.</p>
    </div>
  </body>
</html>
`;

  return { subject: `Your sign-in link — ${name}`, text, html };
}

function sendLoginLinkEmail(input: { to: string; projectName: string; verifyHref: string }): void {
  const email = loginLinkEmail(input);
  void sendMail({
    to: input.to,
    subject: headerSafe(email.subject, 200),
    text: email.text,
    html: email.html,
  }).catch((err) => {
    console.error("[site-auth] login-link email send failed:", err);
  });
}

// ── The endpoints ────────────────────────────────────────────────────────────

/**
 * Handle `POST /__auth/request` — a visitor asking for a sign-in link.
 *
 * Dispatched from app/api/site/[slug]/[[...path]]/route.ts alongside
 * `/__forms/` and `/__records/`. Every code path below that gets past the
 * structural checks (host, path shape, origin, content type, body size)
 * returns the SAME reply, loginRequestedReply() — see its own comment for why.
 */
export async function requestSiteLogin(req: Request, slug: string, path: string[]): Promise<Response> {
  const host = req.headers.get("host") ?? "";
  if (!siteHostAllowed(host, slug)) return siteNotFound();
  if (path.length !== 2 || path[0] !== AUTH_PATH_SEGMENT || path[1] !== "request") return siteNotFound();

  const base = siteBase(host, slug);

  if (!originAllowed(req, slug)) {
    return htmlReply(403, "That didn't send", "This has to be submitted from the site itself.", base);
  }

  const contentType = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (contentType !== "application/x-www-form-urlencoded") {
    return htmlReply(415, "That didn't send", "This was submitted in a format we don't accept.", base);
  }

  const ipHash = hashIp(IP_SALT, clientIp(req));
  // Generic per-IP flood guard — not part of the anti-enumeration surface
  // (it says nothing about any particular address), so an ordinary 429 is
  // fine here, exactly like every other endpoint's layer-1 check.
  if (ipBurst.limited(ipHash)) {
    return htmlReply(429, "Too many requests", "Please wait a few minutes and try again.", base);
  }

  const raw = await readCapped(req, MAX_BODY_BYTES);
  if (raw === null) {
    return htmlReply(413, "That's too long", "Please shorten it and try again.", base);
  }

  const project = await db.project.findUnique({
    where: { slug },
    select: { id: true, name: true, publishedAt: true },
  });
  if (!project || !project.publishedAt) return siteNotFound();

  // From here on, EVERY outcome — good email, bad email, rate limited, mail
  // not configured — produces loginRequestedReply() and nothing else. Parsing
  // is deliberately permissive (parseFields() would reject an unexpected
  // field name or an empty body outright, which is itself a distinguishable
  // 400 reply) — a login request has exactly one field worth reading, so it
  // is read directly rather than through that stricter, form-shaped parser.
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(raw);
  } catch {
    return loginRequestedReply(base);
  }
  const email = (params.get("email") ?? "").trim().slice(0, 200);
  const nextRaw = (params.get("_next") ?? "").slice(0, 200);

  if (!STRICT_EMAIL_RE.test(email)) return loginRequestedReply(base);

  const recipientHash = hashRecipient(email);
  if (recipientBurst.limited(recipientHash)) return loginRequestedReply(base);
  if (projectBurst.limited(project.id)) return loginRequestedReply(base);

  if (process.env.KODELY_NOTIFY_DISABLED === "1" || !isMailConfigured()) {
    return loginRequestedReply(base);
  }

  // find-or-create is a plain upsert on the (projectId, email) unique
  // constraint — SiteVisitor carries nothing else worth racing over.
  const visitor = await db.siteVisitor.upsert({
    where: { projectId_email: { projectId: project.id, email } },
    create: { projectId: project.id, email },
    update: {},
    select: { id: true },
  });

  const rawToken = newToken(LOGIN_TOKEN_BYTES);
  await db.siteLoginToken.create({
    data: {
      siteVisitorId: visitor.id,
      tokenHash: hashLoginToken(rawToken),
      expiresAt: new Date(Date.now() + LOGIN_TOKEN_MINUTES * 60_000),
    },
  });

  // The verify link needs an ABSOLUTE URL (it is read from an email client,
  // not navigated to from the page itself), unlike every relative `base` used
  // elsewhere in this file — siteBaseUrl() is the same helper
  // lib/site-seo.ts's canonical/og:url machinery already uses for exactly
  // that reason.
  const verifyUrl = new URL(`${siteBaseUrl(req, slug)}/${AUTH_PATH_SEGMENT}/verify`);
  verifyUrl.searchParams.set("token", rawToken);
  // `next` carries the visitor's own intended destination through the email
  // round trip — validated again at verify time via nextPath(), exactly the
  // same "_next" control-field convention lib/site-records.ts already uses,
  // so a builder never has to learn a second redirect mechanism.
  if (nextRaw) verifyUrl.searchParams.set("next", nextRaw);

  sendLoginLinkEmail({ to: email, projectName: project.name, verifyHref: verifyUrl.toString() });

  return loginRequestedReply(base);
}

/**
 * Handle `GET /__auth/verify?token=<raw>[&next=<path>]` — the magic link
 * itself.
 */
export async function verifySiteLogin(req: Request, slug: string, path: string[]): Promise<Response> {
  const host = req.headers.get("host") ?? "";
  if (!siteHostAllowed(host, slug)) return siteNotFound();
  if (path.length !== 2 || path[0] !== AUTH_PATH_SEGMENT || path[1] !== "verify") return siteNotFound();

  const base = siteBase(host, slug);

  const ipHash = hashIp(IP_SALT, clientIp(req));
  if (verifyBurst.limited(ipHash)) {
    return htmlReply(429, "Too many requests", "Please wait a few minutes and try again.", base);
  }

  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  if (!token) return verifyInvalidReply(base);

  const project = await db.project.findUnique({ where: { slug }, select: { id: true, publishedAt: true } });
  if (!project || !project.publishedAt) return siteNotFound();

  const tokenHash = hashLoginToken(token);
  // Looked up by hash equality (there is no id in this URL to look a row up
  // by first, unlike the manage-link flow) — the DB index handles the exact
  // match, and hashesMatch() below is the same defensive re-comparison
  // lib/site-records.ts applies to every token it checks, so the guard is
  // never skipped just because this lookup shape differs from that one.
  const record = await db.siteLoginToken.findFirst({
    where: { tokenHash },
    select: {
      id: true,
      tokenHash: true,
      expiresAt: true,
      usedAt: true,
      siteVisitor: { select: { id: true, projectId: true } },
    },
  });
  if (
    !record ||
    !hashesMatch(hashLoginToken(token), record.tokenHash) ||
    record.usedAt !== null ||
    record.expiresAt < new Date() ||
    record.siteVisitor.projectId !== project.id
  ) {
    return verifyInvalidReply(base);
  }

  // One-time use: stamped in the SAME request that grants a session, so a
  // replayed link (or a concurrent second click) finds `usedAt` already set
  // and falls into the branch above instead of minting a second session.
  // Not wrapped in an explicit transaction with the session create below:
  // the worst race is two sessions minted from one still-valid token in a
  // narrow window, which is no worse than clicking "sign in" twice quickly
  // already is, and is bounded by verifyBurst regardless.
  await db.siteLoginToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });

  const rawSessionToken = newToken(SESSION_TOKEN_BYTES);
  const expiresAt = new Date(Date.now() + SITE_SESSION_DAYS * 24 * 60 * 60_000);
  await db.siteSession.create({
    data: {
      siteVisitorId: record.siteVisitor.id,
      projectId: project.id,
      tokenHash: hashSessionToken(rawSessionToken),
      expiresAt,
    },
  });

  // Same `_next` validation lib/site-endpoint.ts's nextPath() already applies
  // to every other redirect target in this codebase — a scheme, a
  // protocol-relative `//`, or anything not starting with a single `/` is
  // refused, so the `next` query param cannot become an open redirect.
  const nextRaw = url.searchParams.get("next");
  const target = nextRaw ? nextPath({ _next: nextRaw }, base) : null;

  const headers = new Headers({ Location: target ?? base, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
  setSessionCookie(headers, rawSessionToken, expiresAt);
  return new Response(null, { status: 303, headers });
}

/**
 * Handle `POST /__auth/logout` — same-origin, same CSRF-equivalent origin
 * check as every other POST here.
 */
export async function logoutSiteVisitor(req: Request, slug: string, path: string[]): Promise<Response> {
  const host = req.headers.get("host") ?? "";
  if (!siteHostAllowed(host, slug)) return siteNotFound();
  if (path.length !== 2 || path[0] !== AUTH_PATH_SEGMENT || path[1] !== "logout") return siteNotFound();

  const base = siteBase(host, slug);

  if (!originAllowed(req, slug)) {
    return htmlReply(403, "That didn't work", "This has to be submitted from the site itself.", base);
  }

  const ipHash = hashIp(IP_SALT, clientIp(req));
  if (logoutBurst.limited(ipHash)) {
    return htmlReply(429, "Too many requests", "Please wait a few minutes and try again.", base);
  }

  const project = await db.project.findUnique({ where: { slug }, select: { id: true, publishedAt: true } });
  if (!project || !project.publishedAt) return siteNotFound();

  const token = readCookie(req, SITE_SESSION_COOKIE);
  if (token) {
    // Scoped to this project too, same reasoning as resolveSiteVisitor(): a
    // logout on Site A must never be able to name a row that belongs to
    // Site B, even though the hash alone is already unique.
    await db.siteSession.deleteMany({ where: { tokenHash: hashSessionToken(token), projectId: project.id } });
  }

  const headers = new Headers({ Location: base, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
  clearSessionCookie(headers);
  return new Response(null, { status: 303, headers });
}
