import { db } from "@/lib/db";
import { isMailConfigured, sendMail } from "@/lib/mail";
import { appUrl } from "@/lib/notifications/templates";
import { siteHostAllowed } from "@/app/api/site/[slug]/site-host";
import {
  PATH_IDENTIFIER_RE,
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
//
// SHARED MACHINERY
// ----------------
// Host/origin checks, body reading, field parsing, IP hashing, the burst
// limiter shape and the HTML-reply plumbing are identical to
// lib/site-records.ts's needs and live in lib/site-endpoint.ts. Only what is
// genuinely specific to a form submission — the model written, the
// notification email, this endpoint's exact wording — stays here.

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
/** A form name is part of a URL and is stored; keep it boring. */
const FORM_NAME_RE = PATH_IDENTIFIER_RE;

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
const BURST_MAX_KEYS = 20_000;
const burst = createBurstLimiter({ limit: BURST_LIMIT, windowMs: BURST_WINDOW_MS, maxKeys: BURST_MAX_KEYS });

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

/** Salt is form-specific so a form submission's ipHash and a site record's
 *  ipHash are never comparable to each other, even for the same visitor. */
const IP_SALT = process.env.FORM_IP_SALT ?? "kodely:form-submission:v1";

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
 *
 * STRICT_EMAIL_RE itself now lives in lib/site-endpoint.ts — lib/site-records.ts
 * needs the identical "is this plausibly an email" check for its own reply
 * page, and a second regex here would only be able to drift from this one.
 */
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
  if (!siteHostAllowed(host, slug)) return siteNotFound();

  if (path.length !== 2 || path[0] !== FORM_PATH_SEGMENT) return siteNotFound();
  const formName = path[1].toLowerCase();
  if (!FORM_NAME_RE.test(formName)) return siteNotFound();

  const base = siteBase(host, slug);

  if (!originAllowed(req, slug)) {
    return htmlReply(403, "That didn't send", "This form has to be submitted from the site itself.", base);
  }

  // Only the encoding a plain HTML form produces. multipart exists for file
  // uploads, which this does not accept and must not be made to buffer; JSON
  // would mean a scripted caller, which `connect-src 'none'` already forbids
  // the page itself from being.
  const contentType = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (contentType !== "application/x-www-form-urlencoded") {
    return htmlReply(415, "That didn't send", "This form was submitted in a format we don't accept.", base);
  }

  const ipHash = hashIp(IP_SALT, clientIp(req));

  // Layer 1, before anything touches the database.
  if (burst.limited(ipHash)) {
    return htmlReply(429, "Too many messages", "Please wait a few minutes and try again.", base);
  }

  const raw = await readCapped(req, MAX_BODY_BYTES);
  if (raw === null) {
    return htmlReply(413, "That message is too long", "Please shorten it and try again.", base);
  }

  const parsed = parseFields(raw);
  if (!parsed.ok) return htmlReply(parsed.status, "That didn't send", parsed.message, base);
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
  if (!project || !project.publishedAt) return siteNotFound();

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
    return htmlReply(429, "Too many messages", "Please try again later.", base);
  }
  if (projectHour >= PROJECT_HOUR_LIMIT || projectRows.length >= PROJECT_DAY_LIMIT) {
    // Deliberately the same wording as the per-IP refusal: a visitor should not
    // be told that somebody else has filled this site's quota.
    return htmlReply(429, "Too many messages", "Please try again later.", base);
  }

  // Honeypot + timing: the row is KEPT and flagged rather than dropped — the
  // schema's own comment asks for that, so a false positive is recoverable and
  // the rate is measurable — and it still consumes quota, so flagging is not a
  // cheap way to write rows.
  const spam = isLikelySpam(control, now, MIN_FILL_MS);

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
  return htmlReply(200, "Thanks — that's been sent", "We'll get back to you shortly.", base);
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
