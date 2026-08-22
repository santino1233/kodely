import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { isMailConfigured, sendMail } from "@/lib/mail";
import { appUrl } from "@/lib/notifications/templates";
import { bareHost, siteHostAllowed } from "@/app/api/site/[slug]/site-host";

// =============================================================================
// FORM SUBMISSIONS FROM PUBLISHED GENERATED SITES
// =============================================================================
//
// The one deliberate hole in "generated sites have no backend". The generated
// page stays completely static — no fetch, no JSON, no client state, nothing
// that `connect-src 'none'` would have to be relaxed for. A plain
// `<form method="post" action="/__forms/contact">` navigates the browser, and
// only the POST TARGET is ours.
//
// WHY THE TARGET IS THE SITE'S OWN ORIGIN, NOT kodely.me
// ------------------------------------------------------
// The generated document is served with `form-action 'self'`, and `'self'`
// resolves to the DOCUMENT's origin — `https://<slug>.kodely.site` — not to
// ours. The obvious design (post to `https://kodely.me/api/forms/...`) is
// therefore cross-origin and would require widening that directive to name an
// external origin on every customer site on the platform.
//
// It is not needed, because `<slug>.kodely.site` is already us. proxy.ts
// rewrites every request on that host to `/api/site/<slug>/…`, so a form
// posting to its own origin at `/__forms/<name>` lands in the same Next route
// that served the page. Same origin, same app, same database — and
// `form-action 'self'` permits it unchanged. See the header comments in
// app/api/site/[slug]/[[...path]]/route.ts.
//
// WHAT IS UNTRUSTED HERE
// ----------------------
// Everything in the body. It is stored as JSON, rendered only by React (which
// escapes), only ever queried through Prisma's parameter binding, capped at
// write time, and escaped again on the way into the notification email —
// where nothing submitted may reach a header except one strictly-validated
// address (see replyToFor).

const SITES_BASE = (process.env.KODELY_SITES_BASE ?? "kodely.site").trim().toLowerCase();

/** First path segment of a submission URL: `/__forms/<formName>`. */
export const FORM_PATH_SEGMENT = "__forms";

// ── Hard caps ────────────────────────────────────────────────────────────────
//
// The body cap is the binding one: 12 × 5000 characters could not fit in 32 KB,
// so no combination of the per-field caps can produce a row larger than the
// body we were willing to read. Everything is checked BEFORE the write, and an
// over-cap request is refused rather than silently truncated — quietly dropping
// half of someone's enquiry is the same failure mode this whole feature exists
// to remove.

/** Bytes of request body ever read. Anything larger is refused unread. */
const MAX_BODY_BYTES = 32 * 1024;
/** Stored fields, excluding `_`-prefixed control fields. */
const MAX_FIELDS = 12;
const MAX_KEY_LENGTH = 64;
const MAX_VALUE_LENGTH = 5000;
/** A form name is part of a URL and is stored; keep it boring. */
const FORM_NAME_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;
/** Field names the builder may emit. Rejecting anything else keeps the stored
 *  JSON's key space to identifiers, so no key can collide with object
 *  internals or need escaping anywhere downstream. */
const FIELD_NAME_RE = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

// ── Rate limits ──────────────────────────────────────────────────────────────
//
// Three layers, cheapest first, because this endpoint is unauthenticated and
// reachable by anyone who can resolve a customer's subdomain:
//
//  1. an in-process burst limiter, keyed on the hashed IP, that costs no query
//     at all — it sheds a flood before the database is touched;
//  2. durable per-IP limits, counted from the rows this feature already writes
//     (the same shape as checkGenerateRateLimit in lib/rate-limit.ts);
//  3. durable per-project limits, which bound how much one site can be made to
//     store and how much mail one owner can be made to receive.
//
// Layers 2 and 3 count STORED submissions, so a refused request costs nothing
// and adds nothing — an attacker who trips a bucket writes no further rows.
// The honest consequence: a caller who is refused for some other reason (bad
// honeypot excepted — those are stored) can keep asking, and is bounded only
// by layer 1. That is a request-rate problem, not a storage problem, and layer
// 1 is a per-process speed bump rather than a guarantee. See RESIDUALS below.

const BURST_LIMIT = 8;
const BURST_WINDOW_MS = 5 * 60_000;

const IP_HOUR_LIMIT = 15;
const IP_DAY_LIMIT = 50;

const PROJECT_HOUR_LIMIT = 60;
const PROJECT_DAY_LIMIT = 300;

/** Above this many submissions to one project in an hour, stop emailing and
 *  let the owner read them in the app. A flood must not become an inbox flood. */
const EMAIL_MAX_PER_HOUR = 10;

/** A form filled in faster than this by something claiming to be a human is
 *  almost certainly not one. Advisory only — see `_t` in the markup contract. */
const MIN_FILL_MS = 2_000;

// ── IP handling ──────────────────────────────────────────────────────────────

/**
 * The client address, or the shared bucket for traffic that did not come
 * through the edge.
 *
 * Identical reasoning to clientIp() in lib/rate-limit.ts, which cannot be
 * imported (that file is not mine to change and does not export it): only
 * `cf-connecting-ip` is trustworthy here. Cloudflare sets it on every request,
 * overwriting whatever the client sent. `x-forwarded-for`'s first entry is
 * attacker-chosen — Cloudflare APPENDS rather than replaces — so keying on it
 * hands an attacker a fresh bucket per request and the limiter does nothing.
 * (app/api/contact/route.ts still does exactly that; this does not copy it.)
 *
 * No header ⇒ direct-to-origin or local dev ⇒ one shared, strict bucket.
 * Fails closed: such traffic is throttled collectively, never exempted.
 */
function clientIp(req: Request): string {
  return req.headers.get("cf-connecting-ip")?.trim().toLowerCase() || "no-edge";
}

/**
 * What actually gets stored. A raw visitor IP on a contact-form row is personal
 * data the site owner has no need for and we have no reason to hold; a salted
 * digest still supports rate limiting and abuse triage and is useless for
 * anything else. Stable across restarts on purpose — a per-process salt would
 * hand every address a fresh bucket on each deploy.
 */
const IP_SALT = process.env.FORM_IP_SALT ?? "kodely:form-submission:v1";
function hashIp(ip: string): string {
  return createHash("sha256").update(`${IP_SALT}:${ip}`).digest("hex");
}

// ── Layer 1: in-process burst limiter ────────────────────────────────────────

const burst = new Map<string, number[]>();
const BURST_MAX_KEYS = 20_000;

/**
 * Bound the map without ever letting a flood of unique keys wipe it.
 *
 * Deliberately NOT the wholesale `clear()` used by checkEnhanceRateLimit and
 * app/api/contact/route.ts: those guard authenticated or low-value paths, while
 * here a clear would be a documented way for an attacker to reset the counter
 * that is throttling them. Expired entries go first, then the least recently
 * active — an attacker's own bucket is the most recently active, so it is the
 * last thing evicted. Same reasoning as sweep() in lib/rate-limit.ts.
 */
function sweepBurst(now: number): void {
  if (burst.size <= BURST_MAX_KEYS) return;
  for (const [key, hits] of burst) {
    if (hits.length === 0 || hits[hits.length - 1] <= now - BURST_WINDOW_MS) burst.delete(key);
  }
  if (burst.size <= BURST_MAX_KEYS) return;
  const byLastSeen = [...burst.entries()].sort(
    (a, b) => a[1][a[1].length - 1] - b[1][b[1].length - 1],
  );
  for (const [key] of byLastSeen.slice(0, burst.size - BURST_MAX_KEYS)) burst.delete(key);
}

function burstLimited(ipHash: string): boolean {
  const now = Date.now();
  sweepBurst(now);
  const recent = (burst.get(ipHash) ?? []).filter((t) => t > now - BURST_WINDOW_MS);
  if (recent.length >= BURST_LIMIT) {
    burst.set(ipHash, recent);
    return true;
  }
  recent.push(now);
  burst.set(ipHash, recent);
  return false;
}

// ── Parsing ──────────────────────────────────────────────────────────────────

/**
 * Read at most `MAX_BODY_BYTES`, then stop.
 *
 * `await req.text()` would buffer whatever was sent, and Content-Length is a
 * claim by the caller, not a fact — so the length header is only used as a fast
 * pre-check and the stream is counted as it arrives. Returns null when the cap
 * is passed, and cancels the rest rather than draining it.
 */
async function readCapped(req: Request): Promise<string | null> {
  const declared = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return null;

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
      if (total > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(Buffer.from(next.value));
    }
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** Collapse control characters, normalise newlines, trim. Never HTML-escapes:
 *  escaping belongs at each output boundary, not in storage, or the stored
 *  value stops being what the visitor typed. */
function cleanValue(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();
}

type ParsedBody =
  | { ok: true; fields: Record<string, string>; control: Record<string, string> }
  | { ok: false; status: number; message: string };

function parseFields(raw: string): ParsedBody {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(raw);
  } catch {
    return { ok: false, status: 400, message: "That form could not be read." };
  }

  const fields: Record<string, string> = {};
  const control: Record<string, string> = {};
  const seen = new Set<string>();

  for (const key of params.keys()) {
    if (seen.has(key)) continue;
    seen.add(key);

    if (key.length > MAX_KEY_LENGTH) {
      return { ok: false, status: 400, message: "That form has an unexpected field." };
    }

    // `_`-prefixed names are control fields: the honeypot, the timing token,
    // the post-submit destination. They are never stored and never emailed,
    // which is also what keeps the honeypot's value out of the owner's inbox.
    if (key.startsWith("_")) {
      control[key] = cleanValue(params.get(key) ?? "").slice(0, 200);
      continue;
    }

    if (!FIELD_NAME_RE.test(key)) {
      return { ok: false, status: 400, message: "That form has an unexpected field." };
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
      return { ok: false, status: 400, message: "That form has too many fields." };
    }
    fields[key] = value;
  }

  if (Object.keys(fields).length === 0) {
    return { ok: false, status: 400, message: "Please fill in the form before sending it." };
  }
  return { ok: true, fields, control };
}

// ── Responses ────────────────────────────────────────────────────────────────
//
// A native form POST is a NAVIGATION: whatever comes back is what the visitor
// sees. So every reply here is a small, self-contained HTML page rather than
// JSON, and it echoes nothing that was submitted.

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Our own page, not the customer's, so it gets its own policy rather than
// SANDBOX_CSP: it needs nothing but inline styles and must never be framed.
const REPLY_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

function page(status: number, title: string, body: string, backHref: string): Response {
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
 * The reply for "this site does not exist, is not published, or you are asking
 * from a host that may not serve it".
 *
 * One response for all three on purpose, and byte-compatible in meaning with
 * the GET handler's 404: a caller probing for which slugs exist, or which are
 * published, learns nothing from the difference.
 */
function notFound(): Response {
  return new Response("Site not found.", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/**
 * Where "Back to the site" and `_next` point.
 *
 * On the branded subdomain the site is at `/`. On the staging path form
 * (staging.kodely.me/api/site/<slug>/ — see site-host.ts) it is one directory
 * deep, and a bare `/` would leave the customer's site entirely.
 */
function siteBase(host: string, slug: string): string {
  return bareHost(host) === `${slug}.${SITES_BASE}` ? "/" : `/api/site/${slug}/`;
}

/**
 * An optional post-submit destination, resolved against the site's own base.
 *
 * Only a path, never a URL: it must start with a single `/`, and `//evil.example`
 * (a protocol-relative URL, which is a cross-origin redirect wearing a path's
 * clothes) is rejected along with anything carrying a scheme or a backslash.
 * So this cannot become an open redirect, whatever the builder emits.
 */
function nextPath(control: Record<string, string>, base: string): string | null {
  const raw = control._next;
  if (!raw) return null;
  if (!/^\/[A-Za-z0-9\-._~!$&'()*+,;=:@%/?#]*$/.test(raw)) return null;
  if (raw.startsWith("//")) return null;
  return `${base}${raw.slice(1)}`;
}

// ── Notification email ───────────────────────────────────────────────────────
//
// Same rules as lib/notifications/templates.ts, and for the same reasons: plain
// text is the real message, the HTML alternative is built from the same values,
// nothing remote is referenced, and every interpolated value is escaped. The
// composer is local rather than imported because that module's Block/compose
// helpers are private to it and its EmailKind union has no member for this —
// adding one would mean editing a file that is not mine.

/** CR/LF can never reach a mail header. lib/mail.ts has a private headerSafe()
 *  for exactly this; it is not exported, so this is the same guard restated. */
function headerSafe(value: string, max = 200): string {
  return value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

/**
 * A Reply-To built from visitor input, or nothing.
 *
 * This is the single place where submitted content reaches a mail HEADER, so it
 * is the single place header injection could happen. The regex admits no CR, no
 * LF, no comma, no semicolon, no angle bracket and no quote, so a value that
 * passes cannot terminate the header or start another one — and the display
 * name is dropped entirely rather than sanitised, because a bare address needs
 * no quoting rules to be got right. Anything that does not match is simply not
 * used; the field still appears in the body, where it is only text.
 *
 * From is never the visitor: sending as their domain fails its SPF/DMARC. Same
 * reasoning as sendContactEmail() in lib/mail.ts, and sendMail() enforces it.
 */
const STRICT_EMAIL_RE = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

function replyToFor(fields: Record<string, string>): string | undefined {
  const candidate = fields.email ?? fields.Email ?? "";
  if (candidate.length > 200) return undefined;
  return STRICT_EMAIL_RE.test(candidate) ? candidate : undefined;
}

function submissionEmail(input: {
  projectName: string;
  projectId: string;
  formName: string;
  fields: Record<string, string>;
}): { subject: string; text: string; html: string } {
  const name = headerSafe(input.projectName, 80) || "your site";
  const inbox = `${appUrl()}/projects/${encodeURIComponent(input.projectId)}/submissions`;
  const entries = Object.entries(input.fields);

  const text = [
    `Someone filled in the "${headerSafe(input.formName, 32)}" form on ${name}.`,
    "",
    ...entries.map(([k, v]) => `${k}:\n${v}`),
    "",
    `All submissions: ${inbox}`,
    "",
    "--",
    "You're receiving this because it concerns your own Kodely account.",
    "We only send email about your account — never marketing.",
  ].join("\n");

  const rows = entries
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 12px 6px 0;vertical-align:top;font-size:13px;color:#6b7280;white-space:nowrap;">${escapeHtml(
          k,
        )}</td><td style="padding:6px 0;font-size:15px;line-height:1.6;color:#111111;white-space:pre-wrap;">${escapeHtml(
          v,
        )}</td></tr>`,
    )
    .join("");

  const html = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>New form submission</title></head>
  <body style="margin:0;padding:24px;background:#f6f7f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111111;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:28px;">
      <p style="margin:0 0 20px 0;font-size:14px;font-weight:600;letter-spacing:-0.01em;color:#111111;">kodely</p>
      <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;">Someone filled in the &quot;${escapeHtml(
        input.formName,
      )}&quot; form on ${escapeHtml(name)}.</p>
      <table style="width:100%;border-collapse:collapse;margin:0 0 20px 0;">${rows}</table>
      <p style="margin:0;"><a href="${escapeHtml(
        inbox,
      )}" style="display:inline-block;padding:10px 18px;background:#111111;color:#ffffff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600;">All submissions</a></p>
      <p style="margin:24px 0 0 0;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;line-height:1.5;color:#6b7280;">You&#39;re receiving this because it concerns your own Kodely account. We only send email about your account — never marketing.</p>
    </div>
  </body>
</html>
`;

  return { subject: `New ${headerSafe(input.formName, 32)} submission — ${name}`, text, html };
}

/**
 * Best effort, always. The submission is already committed before this is
 * called and nothing here can undo that: a dead SMTP server, a bad address or a
 * hung connection loses an email, never an enquiry. Same guarantee as
 * lib/notifications/send.ts, which is why this returns void and swallows.
 */
function notifyOwner(input: {
  to: string;
  projectName: string;
  projectId: string;
  formName: string;
  fields: Record<string, string>;
}): void {
  if (process.env.KODELY_NOTIFY_DISABLED === "1") return;
  if (!isMailConfigured()) return;

  const email = submissionEmail(input);
  const replyTo = replyToFor(input.fields);

  void sendMail({
    to: input.to,
    subject: headerSafe(email.subject, 200),
    ...(replyTo ? { replyTo } : {}),
    text: email.text,
    html: email.html,
  }).catch((err) => {
    // Never the body, never the visitor's address — just that it failed.
    console.error("[site-forms] notification send failed:", err);
  });
}

// ── The endpoint ─────────────────────────────────────────────────────────────

/**
 * Handle `POST /__forms/<formName>` from a published generated site.
 *
 * Called from app/api/site/[slug]/[[...path]]/route.ts, which is where the
 * subdomain rewrite lands. `path` is the already-split catch-all.
 */
export async function submitSiteForm(
  req: Request,
  slug: string,
  path: string[],
): Promise<Response> {
  const host = req.headers.get("host") ?? "";

  // Same gate as GET, and for the same reason: the proxy is explicit that it is
  // never the only check, and a POST that stores data is the last place to rely
  // on one. A wrong host is indistinguishable from a missing site.
  if (!siteHostAllowed(host, slug)) return notFound();

  if (path.length !== 2 || path[0] !== FORM_PATH_SEGMENT) return notFound();
  const formName = path[1].toLowerCase();
  if (!FORM_NAME_RE.test(formName)) return notFound();

  const base = siteBase(host, slug);

  // A browser always sends Origin on a cross-document POST, and for a form on
  // the site itself it is the site's own origin. Requiring it costs nothing and
  // turns away the simplest scripted floods and any other page trying to post
  // here on a visitor's behalf. It is FORGEABLE by anything that is not a
  // browser — this is a filter, not an authorisation check, and nothing below
  // depends on it being true.
  const origin = req.headers.get("origin");
  if (!origin) {
    return page(403, "That didn't send", "This form has to be submitted from the site itself.", base);
  }
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return page(403, "That didn't send", "This form has to be submitted from the site itself.", base);
  }
  if (!siteHostAllowed(originHost, slug)) {
    return page(403, "That didn't send", "This form has to be submitted from the site itself.", base);
  }

  // Only the encoding a plain HTML form produces. multipart exists for file
  // uploads, which this does not accept and must not be made to buffer; JSON
  // would mean a scripted caller, which `connect-src 'none'` already forbids
  // the page itself from being.
  const contentType = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (contentType !== "application/x-www-form-urlencoded") {
    return page(415, "That didn't send", "This form was submitted in a format we don't accept.", base);
  }

  const ipHash = hashIp(clientIp(req));

  // Layer 1, before anything touches the database.
  if (burstLimited(ipHash)) {
    return page(429, "Too many messages", "Please wait a few minutes and try again.", base);
  }

  const raw = await readCapped(req);
  if (raw === null) {
    return page(413, "That message is too long", "Please shorten it and try again.", base);
  }

  const parsed = parseFields(raw);
  if (!parsed.ok) return page(parsed.status, "That didn't send", parsed.message, base);
  const { fields, control } = parsed;

  const project = await db.project.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      publishedAt: true,
      user: { select: { email: true } },
    },
  });
  // PUBLISHED only. A draft site is not reachable on this host anyway, but the
  // storage decision is made here, not inferred from routing.
  if (!project || !project.publishedAt) return notFound();

  // Layers 2 and 3. Two bounded reads rather than four counts: the day window
  // contains the hour window, and `take` caps the work at one row past the
  // limit that would already have refused the request.
  const now = Date.now();
  const dayAgo = new Date(now - 24 * 60 * 60_000);
  const hourAgo = now - 60 * 60_000;
  const [ipRows, projectRows] = await Promise.all([
    db.formSubmission.findMany({
      where: { ipHash, createdAt: { gte: dayAgo } },
      select: { createdAt: true },
      orderBy: { createdAt: "desc" },
      take: IP_DAY_LIMIT + 1,
    }),
    db.formSubmission.findMany({
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
    return page(429, "Too many messages", "Please try again later.", base);
  }
  if (projectHour >= PROJECT_HOUR_LIMIT || projectRows.length >= PROJECT_DAY_LIMIT) {
    // Deliberately the same wording as the per-IP refusal: a visitor should not
    // be told that somebody else has filled this site's quota.
    return page(429, "Too many messages", "Please try again later.", base);
  }

  // Honeypot: a field no human can see, so anything in it is automation. The
  // row is KEPT and flagged rather than dropped — the schema's own comment asks
  // for that, so a false positive is recoverable and the rate is measurable —
  // and it still consumes quota, so flagging is not a cheap way to write rows.
  const trapped = (control._gotcha ?? "") !== "";

  // Timing, advisory: only ever a verdict when the token is present and sane.
  // The page is static and cached, so this can only be set by the tiny inline
  // script in the markup contract; a no-JS visitor sends nothing and is judged
  // on the honeypot alone.
  const startedAt = Number(control._t ?? "");
  const tooFast =
    Number.isFinite(startedAt) &&
    startedAt > now - 24 * 60 * 60_000 &&
    startedAt <= now &&
    now - startedAt < MIN_FILL_MS;

  const spam = trapped || tooFast;

  await db.formSubmission.create({
    data: { projectId: project.id, formName, fields, ipHash, spam },
  });

  // Email AFTER the write, and never awaited. Flagged submissions are stored
  // but not delivered, and a project already receiving a lot this hour stops
  // generating mail rather than turning a form flood into an inbox flood.
  if (!spam && project.user.email && projectHour < EMAIL_MAX_PER_HOUR) {
    notifyOwner({
      to: project.user.email,
      projectName: project.name,
      projectId: project.id,
      formName,
      fields,
    });
  }

  const target = nextPath(control, base);
  if (target) {
    // 303: the follow-up is a GET, so a refresh cannot resubmit.
    return new Response(null, {
      status: 303,
      headers: { Location: target, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
    });
  }

  // A spam-flagged submitter gets the ordinary reply: telling a bot it was
  // caught only teaches it to try another shape.
  return page(200, "Thanks — that's been sent", "We'll get back to you shortly.", base);
}

// ── RESIDUALS ────────────────────────────────────────────────────────────────
//
// Stated rather than hidden:
//
//  * A caller who can reach the origin IP directly, bypassing Cloudflare, can
//    forge `cf-connecting-ip` and get a fresh bucket per request. No
//    application code can detect that; the fix is an origin firewall limited to
//    Cloudflare's ranges. Same residual lib/rate-limit.ts documents.
//  * The in-process burst limiter is per-process and resets on deploy, so it
//    multiplies by the process count and is a speed bump, not a guarantee. The
//    durable limits behind it are what actually bound storage and mail.
//  * `Origin` is trivially forged by a non-browser client.
//  * Refused requests write nothing, so they are not counted by the durable
//    limits — an attacker can keep making requests that are refused, which
//    costs reads. The burst limiter is the only thing bounding that.
//  * The per-IP count has no dedicated index (the schema is fixed); it is a
//    bounded range scan of FormSubmission_createdAt_idx.
//  * Nothing here classifies CONTENT. A submission can be abusive text and pass
//    every check, exactly as lib/rate-limit.ts says of generated sites.
