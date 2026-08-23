import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { isMailConfigured, sendMail } from "@/lib/mail";
import { resolveSiteVisitor } from "@/lib/site-auth";
import { siteHostAllowed } from "@/app/api/site/[slug]/site-host";
import {
  PATH_IDENTIFIER_RE,
  REPLY_CSP,
  STRICT_EMAIL_RE,
  clientIp,
  createBurstLimiter,
  escapeHtml,
  hashIp,
  htmlReply,
  isLikelySpam,
  nextPath,
  originAllowed,
  parseFields,
  readCapped,
  siteBase,
  siteNotFound,
} from "@/lib/site-endpoint";

// =============================================================================
// GENERIC RECORDS WRITTEN BACK BY PUBLISHED GENERATED SITES ("Phase 0")
// =============================================================================
//
// The storage/write primitive behind letting generated sites eventually have
// real, safe backend-backed features (bookings, client portals, simple data)
// — WITHOUT ever letting the AI write or run arbitrary server code. This file
// is the generic foundation only: it knows nothing about what a "booking" or
// a "listing" or a CRM row looks like, and it must stay that way. `kind` is
// an arbitrary short identifier the generated site invents (it is validated
// as a URL-safe token, not checked against a list of known kinds), and
// `fields` is an arbitrary JSON payload under the same write-time discipline
// FormSubmission has always used. No booking-specific validation, no
// conflict-checking, no availability logic belongs here — that is separate,
// later work built ON TOP of this primitive, not inside it.
//
// Same shape as lib/site-forms.ts's `/__forms/<name>`, generalised to
// `/__records/<kind>`, and for the same reason: the generated page stays
// completely static — no fetch, no JSON, no client state — and a plain
// `<form method="post" action="/__records/booking">` navigates the browser to
// the site's OWN origin, which `form-action 'self'` already permits without
// any CSP change. See the header comments in lib/site-forms.ts and in
// app/api/site/[slug]/[[...path]]/route.ts for the full reasoning; it applies
// here unchanged.
//
// Host/origin checks, body reading, field parsing, IP hashing, the burst
// limiter shape and the HTML-reply plumbing are shared with lib/site-forms.ts
// via lib/site-endpoint.ts. Only what is specific to a generic record —
// which model gets written, the `kind` allow-list check, this endpoint's
// wording — lives here. There is no email notification for this path: that
// is form-specific product behaviour, not part of the generic primitive.

/** First path segment of a record URL: `/__records/<kind>`. */
export const RECORD_PATH_SEGMENT = "__records";

// ── Hard caps ────────────────────────────────────────────────────────────────
//
// Identical reasoning to lib/site-forms.ts's MAX_BODY_BYTES: the body cap is
// the binding one, so no combination of the per-field caps in
// lib/site-endpoint.ts can produce a row larger than the body we were willing
// to read.

/** Bytes of request body ever read. Anything larger is refused unread. */
const MAX_BODY_BYTES = 32 * 1024;

/** A record `kind` is part of a URL and is stored; keep it boring. Same
 *  regex discipline as FORM_NAME_RE — deliberately NOT a fixed list of known
 *  kinds ("booking", "listing", ...): those were illustrative examples only,
 *  and a generated site may invent any kind it needs (a CRM row, a client
 *  record, anything) as long as the token itself is URL-safe. */
const RECORD_KIND_RE = PATH_IDENTIFIER_RE;

// ── Rate limits ──────────────────────────────────────────────────────────────
//
// Same three layers as lib/site-forms.ts, same numbers: this endpoint has the
// identical abuse profile — unauthenticated, reachable by anyone who can
// resolve a customer's subdomain, and the cost of an accepted write is the
// same one row. Nothing about "a record" rather than "a form submission"
// changes what a reasonable ceiling is, so there is no reason to diverge
// from the numbers lib/site-forms.ts already settled on.

const BURST_LIMIT = 8;
const BURST_WINDOW_MS = 5 * 60_000;
const BURST_MAX_KEYS = 20_000;
const burst = createBurstLimiter({ limit: BURST_LIMIT, windowMs: BURST_WINDOW_MS, maxKeys: BURST_MAX_KEYS });

const IP_HOUR_LIMIT = 15;
const IP_DAY_LIMIT = 50;

const PROJECT_HOUR_LIMIT = 60;
const PROJECT_DAY_LIMIT = 300;

/** A record written faster than this by something claiming to be a human is
 *  almost certainly not one. Advisory only — see `_t` in the markup contract
 *  lib/site-forms.ts documents; the same contract applies to a record form. */
const MIN_FILL_MS = 2_000;

/** Salt is record-specific so a site record's ipHash and a form submission's
 *  ipHash are never comparable to each other, even for the same visitor. */
const IP_SALT = process.env.RECORD_IP_SALT ?? "kodely:site-record:v1";

// ── The "manage this" link (Phase 1: update/cancel without an account) ─────
//
// The same shape real-world "manage your booking" or "view your order" email
// links use: a random, unguessable token, handed to the submitter exactly
// once, that stands in for a login. Nothing about it is a session — it is a
// bearer credential for ONE record, and it is only ever compared as a hash,
// the same way FormSubmission/SiteRecord.ipHash is a salted digest rather
// than the raw address.

/** First path segment shared with RECORD_PATH_SEGMENT — a manage URL is
 *  `/__records/<kind>/<id>`, one path segment longer than a create URL. */
const RECORD_ID_RE = /^[a-z0-9]{1,40}$/i; // cuid()'s actual shape, generously bounded

/** Bytes of raw randomness in a token. 256 bits — brute-forcing it by
 *  guessing is not a realistic attack regardless of how many attempts a rate
 *  limiter lets through. */
const EDIT_TOKEN_BYTES = 32;

/** Separate salt from IP_SALT and from FormSubmission's — a token hash must
 *  never be comparable across features or across secrets, same reasoning as
 *  every other salted digest in this codebase. */
const EDIT_TOKEN_SALT = process.env.RECORD_EDIT_TOKEN_SALT ?? "kodely:site-record:edit-token:v1";

function newEditToken(): string {
  return randomBytes(EDIT_TOKEN_BYTES).toString("hex");
}

function hashEditToken(token: string): string {
  return createHash("sha256").update(`${EDIT_TOKEN_SALT}:${token}`).digest("hex");
}

/** Constant-time comparison of two hex SHA-256 digests. A record's edit token
 *  is the ONLY secret an anonymous visitor holds anywhere in this feature, so
 *  the comparison that gates it should not leak timing — cheap to do right,
 *  and `===` on attacker-influenced secrets is a habit worth not forming. */
function hashesMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  return bufA.length === bufB.length && bufA.length > 0 && timingSafeEqual(bufA, bufB);
}

/** A second, independent burst limiter for the manage endpoint. Separate
 *  instance from `burst` below (create) for the same reason IP_SALT differs
 *  from FormSubmission's: a flood of update/cancel guesses must not spend a
 *  visitor's create-endpoint budget, and vice-versa. The limit is smaller —
 *  legitimate use of this endpoint is "an occasional edit or a cancel", not a
 *  stream of writes — and it is what actually bounds token-guessing, since
 *  the token space itself already makes guessing computationally hopeless. */
const MANAGE_BURST_LIMIT = 20;
const MANAGE_BURST_WINDOW_MS = 5 * 60_000;
const MANAGE_BURST_MAX_KEYS = 20_000;
const manageBurst = createBurstLimiter({
  limit: MANAGE_BURST_LIMIT,
  windowMs: MANAGE_BURST_WINDOW_MS,
  maxKeys: MANAGE_BURST_MAX_KEYS,
});

/** A plausible email address among the submitted fields, or undefined — the
 *  exact same check lib/site-forms.ts uses for its Reply-To header, reused
 *  (not re-invented looser) via the shared STRICT_EMAIL_RE. Only used here to
 *  decide whether the confirmation page's extra "you can find this again"
 *  line applies; the address itself is never stored or sent anywhere by this
 *  file. */
function hasPlausibleEmail(fields: Record<string, string>): boolean {
  const candidate = fields.email ?? fields.Email ?? "";
  return candidate.length <= 200 && STRICT_EMAIL_RE.test(candidate);
}

// ── The visitor confirmation email ──────────────────────────────────────────
//
// Distinct abuse surface from lib/site-forms.ts's notifyOwner(): that email
// goes to a known, trusted address already on file (the project owner). This
// one goes to WHATEVER ADDRESS A STRANGER TYPED INTO A PUBLIC FORM — so
// without care, this endpoint becomes a way to make Kodely's mail server
// send email to any address an attacker picks (a spam-relay / harassment
// vector: "why do I keep getting emails from a Kodely site I never visited").
//
// Three things keep that from being real:
//  1. Two independent, in-process burst limiters (see confirmProjectBurst and
//     confirmRecipientBurst below) — one per project, one per exact recipient
//     address, both reusing lib/site-endpoint.ts's createBurstLimiter rather
//     than inventing new machinery. The per-recipient one is what actually
//     stops a single victim address from being targeted repeatedly, even by
//     an attacker spreading requests across many projects or staying well
//     under the project's own create-rate limit — it is keyed on nothing but
//     the (hashed) address, not on projectId+address.
//  2. Fixed, minimal, non-reflective content: the email states which
//     published site, which record `kind`, and the manage link — never the
//     record's other submitted field values, so it cannot be turned into
//     phishing bait carrying attacker-chosen text.
//  3. No Reply-To. Unlike notifyOwner() (which sets Reply-To to the VISITOR's
//     address so the OWNER can reply), this mail goes TO the visitor; there
//     is nobody who should reply to it, so From/Reply-To stay exactly what
//     sendMail() already enforces.

/** CR/LF can never reach a mail header. lib/mail.ts has a private headerSafe()
 *  for exactly this; lib/site-forms.ts restates it locally for the same
 *  reason this file does — it is not exported. */
function headerSafe(value: string, max = 200): string {
  return value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

/** Per-project ceiling on how many manage-link emails this feature will send
 *  in an hour. Deliberately lower than PROJECT_HOUR_LIMIT (60) above: most
 *  records never carry a plausible email at all, so a project's normal,
 *  legitimate traffic sits far under this, while a script trying to turn
 *  record creation into a mail bomb is capped hard. */
const CONFIRM_PROJECT_HOUR_LIMIT = 20;
const CONFIRM_PROJECT_WINDOW_MS = 60 * 60_000;
const CONFIRM_PROJECT_MAX_KEYS = 5_000;
const confirmProjectBurst = createBurstLimiter({
  limit: CONFIRM_PROJECT_HOUR_LIMIT,
  windowMs: CONFIRM_PROJECT_WINDOW_MS,
  maxKeys: CONFIRM_PROJECT_MAX_KEYS,
});

/** Per-exact-recipient ceiling, independent of project. This is the one that
 *  matters for the harassment case: three emails to the same address per
 *  hour is enough for legitimate repeat use (a person books more than once)
 *  but stops an attacker from making one victim's inbox the target, whether
 *  they hit one project's form repeatedly or spread requests across many
 *  projects. Keyed on a hash of the address, never the raw address, matching
 *  every other digest in this file. */
const CONFIRM_RECIPIENT_HOUR_LIMIT = 3;
const CONFIRM_RECIPIENT_WINDOW_MS = 60 * 60_000;
const CONFIRM_RECIPIENT_MAX_KEYS = 20_000;
const confirmRecipientBurst = createBurstLimiter({
  limit: CONFIRM_RECIPIENT_HOUR_LIMIT,
  windowMs: CONFIRM_RECIPIENT_WINDOW_MS,
  maxKeys: CONFIRM_RECIPIENT_MAX_KEYS,
});

/** Own salt, independent of IP_SALT/EDIT_TOKEN_SALT — a recipient-address
 *  digest must never be comparable to any other digest in this file. */
const CONFIRM_EMAIL_SALT = process.env.RECORD_CONFIRM_EMAIL_SALT ?? "kodely:site-record:confirm-email:v1";

function hashRecipient(address: string): string {
  return createHash("sha256").update(`${CONFIRM_EMAIL_SALT}:${address.trim().toLowerCase()}`).digest("hex");
}

/**
 * Fixed, minimal, non-reflective content — see the header comment above for
 * why. `projectName` and `kind` are the only interpolated values and both go
 * through the same escapeHtml/headerSafe discipline lib/site-forms.ts uses;
 * `manageHref` is OUR OWN URL (see recordSavedReply's comment on the same
 * point), never visitor-supplied text.
 */
function manageLinkEmail(input: {
  projectName: string;
  kind: string;
  manageHref: string;
}): { subject: string; text: string; html: string } {
  const name = headerSafe(input.projectName, 80) || "a Kodely site";
  const kind = headerSafe(input.kind, 32) || "record";

  const text = [
    `You (or someone using this email address) submitted a "${kind}" on ${name}.`,
    "",
    "A manage link was created so you can update or cancel it later:",
    input.manageHref,
    "",
    "If you weren't expecting this, you can ignore this message — no account was created and nothing else will happen.",
    "",
    "--",
    "This is an automated message from Kodely, the platform this site is built on.",
  ].join("\n");

  const html = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Your manage link</title></head>
  <body style="margin:0;padding:24px;background:#f6f7f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111111;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:28px;">
      <p style="margin:0 0 20px 0;font-size:14px;font-weight:600;letter-spacing:-0.01em;color:#111111;">kodely</p>
      <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;">You (or someone using this email address) submitted a &quot;${escapeHtml(
        kind,
      )}&quot; on ${escapeHtml(name)}.</p>
      <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;">A manage link was created so you can update or cancel it later:</p>
      <p style="margin:0 0 20px 0;padding:12px;background:#f6f7f8;border:1px solid #e5e7eb;border-radius:8px;font-size:13px;word-break:break-all;"><a href="${escapeHtml(
        input.manageHref,
      )}" style="color:#111111;">${escapeHtml(input.manageHref)}</a></p>
      <p style="margin:24px 0 0 0;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;line-height:1.5;color:#6b7280;">If you weren&#39;t expecting this, you can ignore this message — no account was created and nothing else will happen. This is an automated message from Kodely, the platform this site is built on.</p>
    </div>
  </body>
</html>
`;

  return { subject: `Your ${kind} link — ${name}`, text, html };
}

/**
 * Best effort, always — same guarantee as lib/site-forms.ts's notifyOwner():
 * fire-and-forget, never awaited by the request handler, logged (never the
 * recipient address or field values) on failure. Callers must already have
 * checked isMailConfigured() and both rate limits before calling this; it
 * does not re-check them, so it never silently decides not to send once
 * invoked.
 */
function sendManageLinkEmail(input: { to: string; projectName: string; kind: string; manageHref: string }): void {
  const email = manageLinkEmail(input);
  void sendMail({
    to: input.to,
    subject: headerSafe(email.subject, 200),
    // No Reply-To: this mail goes TO the visitor, not from them — see the
    // header comment above. From stays Kodely's own address, exactly as
    // sendMail() already enforces for every caller.
    text: email.text,
    html: email.html,
  }).catch((err) => {
    console.error("[site-records] manage-link email send failed:", err);
  });
}

/**
 * The confirmation page shown after a successful create — the ONE place the
 * raw edit token is ever exposed, and it is shown exactly once. Same visual
 * language as htmlReply, but this is not htmlReply: it needs a real `<a>` to
 * a URL we built (not a caller-supplied "body" string), so it stays a
 * separate small template rather than overloading that function's contract.
 *
 * `manageHref` is OUR OWN URL — base + a path segment + a hex kind + a cuid +
 * a hex token — never visitor-supplied, so it is safe to place directly into
 * both an href and displayed text once escaped. escapeHtml is still applied,
 * consistent with "never trust anything going into HTML from any source",
 * even though nothing here can actually break out.
 *
 * `emailStatus` must reflect what actually happened, never what we hoped
 * would happen — "sent" only when sendManageLinkEmail() was actually called,
 * "not-sent" when a plausible address was present but the email was skipped
 * (mail not configured, or either rate limit hit), and "none" when the
 * submission carried nothing that looked like an address at all.
 */
function recordSavedReply(
  base: string,
  manageHref: string,
  emailStatus: "sent" | "not-sent" | "none",
): Response {
  const emailNote =
    emailStatus === "sent"
      ? `<p style="margin:0 0 20px 0;font-size:13px;line-height:1.6;color:#6b7280;">We've also emailed this link to the address you gave us — keep this copy too, just in case.</p>`
      : emailStatus === "not-sent"
        ? `<p style="margin:0 0 20px 0;font-size:13px;line-height:1.6;color:#6b7280;">We couldn't email this link to the address you gave us, so keep this copy — it's the only way to get back to it.</p>`
        : "";
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="robots" content="noindex">
    <title>Thanks — that's saved</title>
  </head>
  <body style="margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#f6f7f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111111;">
    <main style="max-width:460px;text-align:center;">
      <h1 style="margin:0 0 12px 0;font-size:20px;font-weight:600;letter-spacing:-0.01em;">Thanks — that's saved</h1>
      <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#4b5563;">We'll take it from here. To change or cancel this later, use this link — anyone who has it can use it, so keep it as you would a password:</p>
      <p style="margin:0 0 20px 0;padding:12px;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;font-size:13px;word-break:break-all;"><a href="${escapeHtml(manageHref)}" style="color:#111111;">${escapeHtml(manageHref)}</a></p>
      ${emailNote}
      <a href="${escapeHtml(base)}" style="display:inline-block;padding:10px 18px;background:#111111;color:#ffffff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600;">Back to the site</a>
    </main>
  </body>
</html>
`;
  return new Response(html, {
    status: 200,
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
 * The manage page itself — reached by following the link recordSavedReply()
 * handed out. A plain, same-origin HTML form (no JS) that can replace the
 * record's fields or cancel it, generic over whatever field names that
 * record actually has. Never distinguishes "wrong token" from "not found"
 * from "wrong kind" — see manageInvalidReply below — so it never confirms
 * that a given id exists to someone without the token.
 */
function manageFormPage(opts: {
  base: string;
  kind: string;
  id: string;
  token: string;
  fields: [string, string][];
  cancelled: boolean;
}): Response {
  const action = `${opts.base}${RECORD_PATH_SEGMENT}/${encodeURIComponent(opts.kind)}/${encodeURIComponent(opts.id)}`;
  const fieldRows = opts.fields
    .map(
      ([k, v]) =>
        `<label style="display:block;text-align:left;margin:0 0 14px 0;">
          <span style="display:block;font-size:12px;color:#6b7280;margin:0 0 4px 0;">${escapeHtml(k)}</span>
          <input name="${escapeHtml(k)}" value="${escapeHtml(v)}" style="width:100%;box-sizing:border-box;padding:9px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:15px;font-family:inherit;">
        </label>`,
    )
    .join("\n");
  const body = opts.cancelled
    ? `<p style="margin:0 0 20px 0;font-size:15px;line-height:1.6;color:#4b5563;">This has already been cancelled. There is nothing more to do here.</p>`
    : `<form method="post" action="${escapeHtml(action)}" style="text-align:left;">
        <input type="hidden" name="_token" value="${escapeHtml(opts.token)}">
        ${fieldRows}
        <div style="display:flex;gap:10px;margin-top:6px;">
          <button type="submit" name="_action" value="update" style="flex:1;padding:10px 18px;background:#111111;color:#ffffff;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer;">Save changes</button>
          <button type="submit" name="_action" value="cancel" style="padding:10px 18px;background:#ffffff;color:#b91c1c;border:1px solid #e5e7eb;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer;">Cancel this</button>
        </div>
      </form>`;
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="robots" content="noindex">
    <title>Manage your ${escapeHtml(opts.kind)}</title>
  </head>
  <body style="margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#f6f7f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111111;">
    <main style="max-width:420px;width:100%;text-align:center;">
      <h1 style="margin:0 0 16px 0;font-size:20px;font-weight:600;letter-spacing:-0.01em;">Manage your ${escapeHtml(opts.kind)}</h1>
      ${body}
      <p style="margin:20px 0 0 0;"><a href="${escapeHtml(opts.base)}" style="color:#6b7280;font-size:13px;">Back to the site</a></p>
    </main>
  </body>
</html>
`;
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": REPLY_CSP,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Cache-Control": "no-store",
    },
  });
}

/** The one reply for "this link does not work", whatever the actual reason —
 *  the id does not exist, the token does not match, or the kind in the URL
 *  does not match the record's real kind. Same anti-enumeration discipline
 *  siteNotFound() already uses: a caller probing ids or guessing tokens gets
 *  byte-identical replies for every way of being wrong. */
function manageInvalidReply(base: string): Response {
  return htmlReply(
    404,
    "That link isn't valid",
    "This link doesn't work any more. It may have been mistyped, or already used.",
    base,
  );
}

/** `fields` as stored is Json — narrow it back to the string map every write
 *  path here actually produces, defensively, the same way the owner
 *  dashboard's page.tsx does before handing it to a client component. */
function stringFields(raw: unknown): [string, string][] {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return [];
  return Object.entries(raw as Record<string, unknown>)
    .slice(0, 24)
    .map(([k, v]): [string, string] => [String(k).slice(0, 64), v === null ? "" : String(v).slice(0, 5000)]);
}

/**
 * Just the `_`-prefixed control fields out of a raw urlencoded body, with none
 * of parseFields()'s "at least one real field" requirement — for `_action=cancel`,
 * which legitimately has no real fields to submit. Same per-field cap
 * (200 chars) parseFields applies to control fields, for the same reason:
 * these are read but never stored, yet still deserve a bound.
 */
function controlFieldsOnly(raw: string): Record<string, string> {
  const control: Record<string, string> = {};
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(raw);
  } catch {
    return control;
  }
  for (const key of params.keys()) {
    if (key.startsWith("_") && !(key in control)) {
      control[key] = (params.get(key) ?? "").slice(0, 200);
    }
  }
  return control;
}

// ── The endpoint ─────────────────────────────────────────────────────────────

/**
 * Handle `POST /__records/<kind>` from a published generated site.
 *
 * Called from app/api/site/[slug]/[[...path]]/route.ts, which is where the
 * subdomain rewrite lands. `path` is the already-split catch-all.
 */
export async function submitSiteRecord(
  req: Request,
  slug: string,
  path: string[],
): Promise<Response> {
  const host = req.headers.get("host") ?? "";

  // Same gate as GET, and for the same reason: the proxy is explicit that it
  // is never the only check, and a POST that stores data is the last place to
  // rely on one. A wrong host is indistinguishable from a missing site.
  if (!siteHostAllowed(host, slug)) return siteNotFound();

  if (path.length !== 2 || path[0] !== RECORD_PATH_SEGMENT) return siteNotFound();
  const kind = path[1].toLowerCase();
  if (!RECORD_KIND_RE.test(kind)) return siteNotFound();

  const base = siteBase(host, slug);

  if (!originAllowed(req, slug)) {
    return htmlReply(403, "That didn't save", "This has to be submitted from the site itself.", base);
  }

  // Only the encoding a plain HTML form produces. multipart exists for file
  // uploads, which this does not accept and must not be made to buffer; JSON
  // would mean a scripted caller, which `connect-src 'none'` already forbids
  // the page itself from being.
  const contentType = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (contentType !== "application/x-www-form-urlencoded") {
    return htmlReply(415, "That didn't save", "This was submitted in a format we don't accept.", base);
  }

  const ipHash = hashIp(IP_SALT, clientIp(req));

  // Layer 1, before anything touches the database.
  if (burst.limited(ipHash)) {
    return htmlReply(429, "Too many requests", "Please wait a few minutes and try again.", base);
  }

  const raw = await readCapped(req, MAX_BODY_BYTES);
  if (raw === null) {
    return htmlReply(413, "That's too long", "Please shorten it and try again.", base);
  }

  const parsed = parseFields(raw);
  if (!parsed.ok) return htmlReply(parsed.status, "That didn't save", parsed.message, base);
  const { fields, control } = parsed;

  const project = await db.project.findUnique({
    where: { slug },
    select: { id: true, name: true, publishedAt: true },
  });
  // PUBLISHED only. A draft site is not reachable on this host anyway, but the
  // storage decision is made here, not inferred from routing.
  if (!project || !project.publishedAt) return siteNotFound();

  // Layers 2 and 3. Two bounded reads rather than four counts: the day window
  // contains the hour window, and `take` caps the work at one row past the
  // limit that would already have refused the request. Deliberately NOT
  // scoped by `kind` — the quota protects the project's storage as a whole,
  // the same way lib/site-forms.ts's per-project quota is not scoped by
  // formName.
  const now = Date.now();
  const dayAgo = new Date(now - 24 * 60 * 60_000);
  const hourAgo = now - 60 * 60_000;
  const [ipRows, projectRows] = await Promise.all([
    db.siteRecord.findMany({
      where: { ipHash, createdAt: { gte: dayAgo } },
      select: { createdAt: true },
      orderBy: { createdAt: "desc" },
      take: IP_DAY_LIMIT + 1,
    }),
    db.siteRecord.findMany({
      where: { projectId: project.id, createdAt: { gte: dayAgo } },
      select: { createdAt: true },
      orderBy: { createdAt: "desc" },
      take: PROJECT_DAY_LIMIT + 1,
    }),
  ]);
  const inHour = (rows: { createdAt: Date }[]) =>
    rows.filter((r) => r.createdAt.getTime() > hourAgo).length;
  const ipHour = inHour(ipRows);
  const projectHour = inHour(projectRows);

  if (ipHour >= IP_HOUR_LIMIT || ipRows.length >= IP_DAY_LIMIT) {
    return htmlReply(429, "Too many requests", "Please try again later.", base);
  }
  if (projectHour >= PROJECT_HOUR_LIMIT || projectRows.length >= PROJECT_DAY_LIMIT) {
    // Deliberately the same wording as the per-IP refusal: a visitor should
    // not be told that somebody else has filled this site's quota.
    return htmlReply(429, "Too many requests", "Please try again later.", base);
  }

  // Honeypot + timing: the row is KEPT and flagged rather than dropped, same
  // reasoning as FormSubmission.spam — a false positive stays recoverable and
  // the rate stays measurable — and it still consumes quota, so flagging is
  // not a cheap way to write rows.
  const spam = isLikelySpam(control, now, MIN_FILL_MS);

  // Generated unconditionally (even for a flagged submission) so a false
  // positive is still recoverable through the ordinary manage link once the
  // owner notices — the row already carries that same reasoning for `spam`
  // itself. Only the RAW token is ever handled here; what is stored is its
  // hash, exactly like ipHash stores a digest of the address rather than the
  // address.
  const editToken = newEditToken();
  // Stamped ONLY when a valid SiteSession cookie was present on THIS
  // same-origin POST — resolveSiteVisitor() (lib/site-auth.ts) is the exact
  // same cookie/hash/lookup the GET route uses for `data-kodely-mine`, so the
  // two can never disagree about who "signed in" means. An anonymous
  // submission (no cookie, or a stale/expired one) stamps null, unchanged
  // from before this feature existed — the edit-token manage link above
  // keeps working exactly the same regardless of which case this is.
  const visitor = await resolveSiteVisitor(req, project.id);
  const record = await db.siteRecord.create({
    data: {
      projectId: project.id,
      kind,
      fields,
      ipHash,
      spam,
      editTokenHash: hashEditToken(editToken),
      siteVisitorId: visitor?.id ?? null,
    },
    select: { id: true },
  });

  const target = nextPath(control, base);
  if (target) {
    // 303: the follow-up is a GET, so a refresh cannot resubmit.
    //
    // A `_next` redirect takes the visitor straight to a page the BUILDER
    // wrote, which has no way to display our token — so the manage link is
    // simply not shown for this submission. The row (and its token hash)
    // still exists; a `_next` form is a deliberate trade-off the site made
    // between a custom confirmation and this feature's manage link, not a
    // bug in either.
    return new Response(null, {
      status: 303,
      headers: { Location: target, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
    });
  }

  // A spam-flagged submitter gets the ordinary reply, with no manage link:
  // telling a bot it was caught (or handing it a working manage link for the
  // row it just wrote) only teaches it to try another shape.
  if (spam) {
    return htmlReply(200, "Thanks — that's saved", "We'll take it from here.", base);
  }

  const manageHref = `${base}${RECORD_PATH_SEGMENT}/${encodeURIComponent(kind)}/${encodeURIComponent(record.id)}?token=${editToken}`;

  // The confirmation email: fixed content, two independent rate limits, never
  // awaited, never claimed to the visitor unless it actually happened. See
  // the header comment above sendManageLinkEmail() for the full reasoning.
  let emailStatus: "sent" | "not-sent" | "none" = "none";
  if (hasPlausibleEmail(fields)) {
    const recipient = (fields.email ?? fields.Email ?? "").trim();
    if (process.env.KODELY_NOTIFY_DISABLED === "1" || !isMailConfigured()) {
      emailStatus = "not-sent";
    } else {
      // Recipient limiter first: if this exact address is already at its
      // cap, we must not spend the project's budget on an email we are not
      // going to send.
      const recipientLimited = confirmRecipientBurst.limited(hashRecipient(recipient));
      const projectLimited = !recipientLimited && confirmProjectBurst.limited(project.id);
      if (recipientLimited || projectLimited) {
        emailStatus = "not-sent";
      } else {
        sendManageLinkEmail({ to: recipient, projectName: project.name, kind, manageHref });
        emailStatus = "sent";
      }
    }
  }

  return recordSavedReply(base, manageHref, emailStatus);
}

// ── The manage endpoint: `/__records/<kind>/<id>` ───────────────────────────
//
// Reached two ways, both same-origin and both dispatched from
// app/api/site/[slug]/[[...path]]/route.ts:
//   GET  — the manage link itself. Shows a form pre-filled with the record's
//          current fields, or "already cancelled", or the one generic
//          invalid-link message.
//   POST — that form's target. `_token` plus `_action` (`update` or
//          `cancel`) decide what happens; everything else is a field to
//          store, under the exact same validation discipline as create.
//
// Neither ever distinguishes WHY a link failed (wrong token, wrong kind, no
// such id) — see manageInvalidReply — so the failure mode leaks nothing an
// attacker without the token didn't already know.

function parseManagePath(path: string[]): { kind: string; id: string } | null {
  if (path.length !== 3 || path[0] !== RECORD_PATH_SEGMENT) return null;
  const kind = path[1].toLowerCase();
  const id = path[2];
  if (!RECORD_KIND_RE.test(kind) || !RECORD_ID_RE.test(id)) return null;
  return { kind, id };
}

/**
 * Handle `GET /__records/<kind>/<id>?token=<...>` — the manage link a
 * submitter was handed once, in recordSavedReply().
 */
export async function viewSiteRecord(req: Request, slug: string, path: string[]): Promise<Response> {
  const host = req.headers.get("host") ?? "";
  if (!siteHostAllowed(host, slug)) return siteNotFound();

  const parsed = parseManagePath(path);
  if (!parsed) return siteNotFound();
  const { kind, id } = parsed;
  const base = siteBase(host, slug);

  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!token) return manageInvalidReply(base);

  const project = await db.project.findUnique({ where: { slug }, select: { id: true, publishedAt: true } });
  if (!project || !project.publishedAt) return siteNotFound();

  const record = await db.siteRecord.findFirst({
    where: { id, projectId: project.id },
    select: { kind: true, fields: true, status: true, editTokenHash: true },
  });
  if (!record || !record.editTokenHash || record.kind !== kind) return manageInvalidReply(base);
  if (!hashesMatch(hashEditToken(token), record.editTokenHash)) return manageInvalidReply(base);

  return manageFormPage({
    base,
    kind,
    id,
    token,
    fields: stringFields(record.fields),
    cancelled: record.status === "cancelled",
  });
}

/**
 * Handle `POST /__records/<kind>/<id>` — the manage form's target.
 */
export async function submitSiteRecordUpdate(req: Request, slug: string, path: string[]): Promise<Response> {
  const host = req.headers.get("host") ?? "";
  if (!siteHostAllowed(host, slug)) return siteNotFound();

  const parsed = parseManagePath(path);
  if (!parsed) return siteNotFound();
  const { kind, id } = parsed;
  const base = siteBase(host, slug);

  if (!originAllowed(req, slug)) {
    return htmlReply(403, "That didn't save", "This has to be submitted from the site itself.", base);
  }

  const contentType = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (contentType !== "application/x-www-form-urlencoded") {
    return htmlReply(415, "That didn't save", "This was submitted in a format we don't accept.", base);
  }

  const ipHash = hashIp(IP_SALT, clientIp(req));
  if (manageBurst.limited(ipHash)) {
    return htmlReply(429, "Too many requests", "Please wait a few minutes and try again.", base);
  }

  const raw = await readCapped(req, MAX_BODY_BYTES);
  if (raw === null) {
    return htmlReply(413, "That's too long", "Please shorten it and try again.", base);
  }

  const parsedBody = parseFields(raw);
  // A cancel action has nothing meaningful to validate as "fields" — an empty
  // body is fine for `_action=cancel` even though parseFields() would refuse
  // it for a create or an update (it requires at least one real field).
  // Recover just the control fields ourselves in that case, rather than
  // rejecting a legitimate cancel outright.
  const control = parsedBody.ok ? parsedBody.control : controlFieldsOnly(raw);

  const token = control._token ?? "";
  const action = control._action;
  if (action !== "update" && action !== "cancel") {
    return htmlReply(400, "That didn't save", "That request was missing something required.", base);
  }

  const project = await db.project.findUnique({ where: { slug }, select: { id: true, publishedAt: true } });
  if (!project || !project.publishedAt) return siteNotFound();

  const record = await db.siteRecord.findFirst({
    where: { id, projectId: project.id },
    select: { kind: true, editTokenHash: true, siteVisitorId: true },
  });
  if (!record || record.kind !== kind) return manageInvalidReply(base);

  // Step 7's "you're logged in, just click cancel/update" path: a record
  // linked to a visitor (siteVisitorId set at creation — see
  // submitSiteRecord() above) can be managed by that SAME visitor's live
  // session WITHOUT the `_token` at all. resolveSiteVisitor() is the exact
  // same cookie/hash/lookup used everywhere else this codebase asks "who is
  // signed in", so this can never grant access to anyone but the visitor who
  // actually created the record.
  //
  // Every other case — no linked visitor (an anonymous submission), or a
  // linked visitor who isn't currently signed in — falls through to the
  // ORIGINAL token check below, completely unchanged: this is additive, not
  // a replacement of the anonymous manage-link flow.
  const visitor = await resolveSiteVisitor(req, project.id);
  const ownedBySession = record.siteVisitorId !== null && visitor !== null && visitor.id === record.siteVisitorId;

  if (!ownedBySession) {
    if (!token || !record.editTokenHash || !hashesMatch(hashEditToken(token), record.editTokenHash)) {
      return manageInvalidReply(base);
    }
  }

  if (action === "cancel") {
    // Status change only — never a hard delete. Matches the schema comment:
    // status exists precisely so history is not destroyed.
    await db.siteRecord.update({ where: { id }, data: { status: "cancelled" } });
    return htmlReply(200, "Cancelled", "That's been cancelled.", base);
  }

  // action === "update": replace the stored fields wholesale, same
  // validation discipline as create (parseFields already ran above).
  if (!parsedBody.ok) {
    return htmlReply(parsedBody.status, "That didn't save", parsedBody.message, base);
  }
  await db.siteRecord.update({ where: { id }, data: { fields: parsedBody.fields } });
  return htmlReply(200, "Saved", "Your changes have been saved.", base);
}

// ── RESIDUALS ────────────────────────────────────────────────────────────────
//
// Identical to the ones lib/site-forms.ts documents, restated because this is
// a separate unauthenticated write surface with the same shape of exposure:
//
//  * A caller who can reach the origin IP directly, bypassing Cloudflare, can
//    forge `cf-connecting-ip` and get a fresh bucket per request. No
//    application code can detect that; the fix is an origin firewall limited
//    to Cloudflare's ranges.
//  * The in-process burst limiter is per-process and resets on deploy, so it
//    multiplies by the process count and is a speed bump, not a guarantee.
//    The durable limits behind it are what actually bound storage.
//  * `Origin` is trivially forged by a non-browser client.
//  * Refused requests write nothing, so they are not counted by the durable
//    limits — an attacker can keep making requests that are refused, which
//    costs reads. The burst limiter is the only thing bounding that.
//  * The per-IP count has no dedicated index; it is a bounded range scan of
//    SiteRecord_projectId_kind_createdAt_idx (or a full-table scan for the
//    ipHash query specifically, same residual FormSubmission already has).
//  * Nothing here classifies CONTENT. A record can be abusive text and pass
//    every check, exactly as lib/rate-limit.ts says of generated sites.
