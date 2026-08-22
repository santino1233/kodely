import { SIGNUP_GRANT, estimateCredits, MICROS_PER_CREDIT } from "@/lib/credits";
import { creditState, runwaySentence, type CreditState } from "./credit-state";

// Transactional email bodies for Kodely.
//
// Rules this file exists to enforce:
//
// 1. PLAIN TEXT IS THE REAL EMAIL. Every message is composed as a list of
//    blocks and rendered to text first; the HTML alternative is generated from
//    the SAME blocks, so the two can never drift apart or say different things.
// 2. NO REMOTE ANYTHING. No images, no tracking pixel, no web fonts, no
//    external CSS. Every style is inlined, and the mail makes zero network
//    requests when opened — so opening it tells us nothing and leaks nothing.
// 3. NOTHING SENSITIVE IN THE BODY. No credentials, tokens, session ids,
//    prompt text, generated file contents, or build error strings. Build
//    errors in particular can quote the user's own source; they belong in the
//    app, behind auth, not in an inbox that may be shared or forwarded.
// 4. GENUINELY TRANSACTIONAL. Every one of these is triggered by the sender's
//    own account state (their signup, their balance, their build, their
//    publish). There is no consent record and no unsubscribe mechanism in this
//    product, so nothing here may be promotional or re-engagement-shaped.

export type EmailKind =
  | "welcome"
  | "low_credits"
  | "build_failed"
  | "site_published"
  | "support_reply";

export type Email = { subject: string; text: string; html: string };

export function appUrl(): string {
  // Same variable and default as app/api/billing/checkout/route.ts.
  return (process.env.APP_URL ?? "https://kodely.me").replace(/\/+$/, "");
}

// ── Block rendering ───────────────────────────────────────────────────────

type Block =
  | { kind: "p"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "cta"; label: string; href: string }
  | { kind: "link"; label: string; href: string }
  | { kind: "note"; text: string };

const p = (text: string): Block => ({ kind: "p", text });
const ul = (items: string[]): Block => ({ kind: "ul", items });
const cta = (label: string, href: string): Block => ({ kind: "cta", label, href });
const link = (label: string, href: string): Block => ({ kind: "link", label, href });
const note = (text: string): Block => ({ kind: "note", text });

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Blocks only ever carry plain text, and every value is escaped on the way
 * into the HTML, so a project name of `<script>` is inert — user-supplied
 * strings reach these templates (project names) and must never become markup.
 */
function safeText(value: string, max = 200): string {
  return value.replace(/[\u0000-\u001F\u007F]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

/** Only ever used on URLs we build ourselves; a bad one is dropped, not sent. */
function safeUrl(value: string): string {
  return /^https?:\/\/[^\s"'<>]+$/.test(value) ? value : appUrl();
}

function wrap(text: string, width = 72): string {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if (line === "") line = word;
    else if (line.length + 1 + word.length <= width) line += ` ${word}`;
    else {
      out.push(line);
      line = word;
    }
  }
  if (line !== "") out.push(line);
  return out.join("\n");
}

const FOOTER =
  "You're receiving this because it concerns your own Kodely account. " +
  "We only send email about your account — never marketing.";

function renderText(blocks: Block[]): string {
  const parts: string[] = [];
  for (const b of blocks) {
    if (b.kind === "p") parts.push(wrap(b.text));
    else if (b.kind === "note") parts.push(wrap(b.text));
    else if (b.kind === "ul") parts.push(b.items.map((i) => wrap(`- ${i}`, 70)).join("\n"));
    else parts.push(`${b.label}: ${b.href}`);
  }
  parts.push("--");
  parts.push(wrap(FOOTER));
  return `${parts.join("\n\n")}\n`;
}

// Inline styles only — every mail client strips <style> blocks somewhere.
const S = {
  body: "margin:0;padding:24px;background:#f6f7f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111111;",
  card: "max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:28px;",
  p: "margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#111111;",
  li: "margin:0 0 8px 0;font-size:15px;line-height:1.6;color:#111111;",
  ul: "margin:0 0 16px 0;padding-left:20px;",
  cta: "display:inline-block;margin:4px 0 20px 0;padding:10px 18px;background:#111111;color:#ffffff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600;",
  link: "margin:0 0 16px 0;font-size:15px;line-height:1.6;",
  note: "margin:0 0 16px 0;font-size:14px;line-height:1.6;color:#4b5563;",
  footer: "margin:24px 0 0 0;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;line-height:1.5;color:#6b7280;",
  wordmark: "margin:0 0 20px 0;font-size:14px;font-weight:600;letter-spacing:-0.01em;color:#111111;",
};

function renderHtml(subject: string, blocks: Block[]): string {
  const body = blocks
    .map((b) => {
      if (b.kind === "p") return `<p style="${S.p}">${escapeHtml(b.text)}</p>`;
      if (b.kind === "note") return `<p style="${S.note}">${escapeHtml(b.text)}</p>`;
      if (b.kind === "ul")
        return `<ul style="${S.ul}">${b.items
          .map((i) => `<li style="${S.li}">${escapeHtml(i)}</li>`)
          .join("")}</ul>`;
      if (b.kind === "cta")
        return `<p style="margin:0;"><a href="${escapeHtml(b.href)}" style="${S.cta}">${escapeHtml(
          b.label,
        )}</a></p>`;
      return `<p style="${S.link}"><a href="${escapeHtml(b.href)}" style="color:#111111;">${escapeHtml(
        b.href,
      )}</a></p>`;
    })
    .join("\n      ");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="${S.body}">
    <div style="${S.card}">
      <p style="${S.wordmark}">kodely</p>
      ${body}
      <p style="${S.footer}">${escapeHtml(FOOTER)}</p>
    </div>
  </body>
</html>
`;
}

function compose(subject: string, blocks: Block[]): Email {
  return { subject, text: renderText(blocks), html: renderHtml(subject, blocks) };
}

/** "you" when we have no name — never a raw email address in the greeting. */
function greetingName(name: string | null | undefined): string {
  const clean = safeText(name ?? "", 40);
  return clean === "" ? "" : clean;
}

// ── 1. Welcome ────────────────────────────────────────────────────────────

export function welcomeEmail(input: { name?: string | null }): Email {
  const who = greetingName(input.name);
  const create = estimateCredits("create");
  const dollarsPerCredit = MICROS_PER_CREDIT / 1_000_000;
  const creditsPerDollar = Math.round(1 / dollarsPerCredit);

  return compose(
    "Welcome to Kodely — here's how it works",
    [
      p(who ? `Hi ${who} — welcome to Kodely.` : "Welcome to Kodely."),
      p(
        "Describe the site you want in plain English and Kodely builds it: a real, " +
          "compiled site you can preview, keep editing by asking for changes, and " +
          "publish to a live URL.",
      ),
      p("Things people build first:"),
      ul([
        "A one-page site for a business, service or trade",
        "A portfolio or personal page",
        "A launch or waitlist page for something you're working on",
      ]),
      p(
        `About credits: one credit is a fixed amount of real model spend — ${creditsPerDollar} ` +
          `credits is $1 of underlying cost. Nothing is a mystery unit, and nothing is a ` +
          `flat guess: you're charged from the tokens a build actually used, after it ` +
          `succeeds. A build that fails is never charged.`,
      ),
      p(
        `A first build usually runs somewhere between ${create.low} and ${create.high} ` +
          `credits, and follow-up edits cost less. Your account starts with ` +
          `${SIGNUP_GRANT} credits — enough for a first site and a few rounds of edits.`,
      ),
      cta("Start building", `${appUrl()}/dashboard`),
      note(
        "You can also set your own spending cap in Settings, so a busy afternoon " +
          "can never turn into a surprise.",
      ),
    ],
  );
}

// ── 2. Low credits ────────────────────────────────────────────────────────

export function lowCreditsEmail(input: {
  balance: number;
  avgBuildCredits: number;
  canTopUp: boolean;
  /**
   * True when avgBuildCredits came from this user's own build history rather
   * than the global fallback in lib/credits.ts. The copy says "your builds
   * have averaged", which must not be said to someone who has never had a
   * build charged.
   */
  measured: boolean;
  /** Pre-computed state, when the caller already has it. */
  state?: CreditState;
}): Email {
  const state = input.state ?? creditState(input.balance, input.avgBuildCredits);

  const subject = state.empty
    ? "You're out of Kodely credits"
    : `You're low on Kodely credits — ${state.balance} left`;

  const blocks: Block[] = [
    p(
      state.empty
        ? "Your Kodely balance has reached zero, so the next build won't start until you top up."
        : `Heads up: your Kodely balance is down to ${state.balance} credits. ${runwaySentence(state)}`,
    ),
    p(
      input.measured
        ? `That's measured from your own builds — yours have cost about ` +
          `${state.avgBuildCredits} credits each — and it's the same number the credit ` +
          `meter in the app uses. Bigger changes cost more, small edits cost less.`
        : `That's based on a typical Kodely build (about ${state.avgBuildCredits} ` +
          `credits). Once you've run a few, it uses your own measured average instead ` +
          `— the same number the credit meter in the app shows.`,
    ),
  ];

  if (input.canTopUp) {
    blocks.push(
      p("You can top up whenever you like — credits don't expire and there's no subscription."),
      cta("Top up credits", `${appUrl()}/pricing`),
    );
  } else {
    blocks.push(
      p(
        "Top-ups aren't switched on for this account yet — reply to this email and " +
          "we'll sort it out.",
      ),
      link("Your dashboard", `${appUrl()}/dashboard`),
    );
  }

  blocks.push(
    note(
      "You only get this when your balance drops to a new level — never on a " +
        "schedule, and at most twice between top-ups.",
    ),
  );

  return compose(subject, blocks);
}

// ── 3. Build failed ───────────────────────────────────────────────────────

export function buildFailedEmail(input: { projectName: string; projectId: string }): Email {
  const name = safeText(input.projectName, 80) || "your project";
  const projectUrl = safeUrl(`${appUrl()}/projects/${encodeURIComponent(input.projectId)}`);

  return compose("That build didn't finish — you weren't charged", [
    p(`A build in "${name}" didn't finish.`),
    p(
      "You were not charged for it. Failed builds are always free on Kodely — " +
        "credits only come off after a build succeeds, and no credits left your " +
        "balance for this one.",
    ),
    p("What usually works next:"),
    ul([
      "Just ask again — a lot of failures are transient and the same request succeeds on a second run.",
      "Break a big request into smaller steps: one section or one change at a time.",
      "Be specific about what should change and what should stay as it is.",
    ]),
    cta("Open the project", projectUrl),
    note(
      "The exact error is on the build in the app — we keep it there rather than " +
        "in email, since it can quote your own project's code. If it keeps failing, " +
        "reply to this email and we'll look at it.",
    ),
  ]);
}

// ── 4. Site published ─────────────────────────────────────────────────────

export function sitePublishedEmail(input: {
  projectName: string;
  projectId: string;
  siteUrl: string;
}): Email {
  const name = safeText(input.projectName, 80) || "Your site";
  const siteUrl = safeUrl(input.siteUrl);
  const projectUrl = safeUrl(`${appUrl()}/projects/${encodeURIComponent(input.projectId)}`);

  return compose("Your site is live", [
    p(`"${name}" is published and live at:`),
    link("Your site", siteUrl),
    p("What's worth doing next:"),
    ul([
      "Open it on a phone as well as a laptop — that's how most visitors will see it.",
      "Send the link to one person who'll tell you the truth about it.",
      "Keep editing: changes stay in your draft until you hit Publish again, so the live site never changes under a visitor mid-edit.",
    ]),
    cta("Back to the project", projectUrl),
  ]);
}

// ── 5. Support reply ──────────────────────────────────────────────────────

/**
 * Somebody answered their ticket.
 *
 * WHY THIS PASSES RULE 4, SPELLED OUT because it is the first template in this
 * file that is not triggered by a machine noticing something. It is still
 * strictly transactional: it exists only because THIS person opened THIS
 * ticket and asked for an answer, it is sent once per reply and never on a
 * schedule, and nobody who has not written to us can ever receive one. The
 * product has no consent record and no unsubscribe mechanism — that is stated
 * at the top of this file and it is the reason nothing promotional may be sent
 * — and a reply to a question you asked is the clearest case there is of mail
 * you do not need to have consented to, because you initiated it. The opt-out
 * is real and needs no plumbing: don't open a ticket, or resolve it.
 *
 * THE REPLY TEXT IS NOT IN HERE, on purpose, the same way buildFailedEmail
 * keeps the build error in the app. An answer routinely quotes the account
 * state it is about — a balance, a charge, what is in a file — and mail is
 * forwarded, quoted and left open on shared screens. The subject line is the
 * customer's own words, so the mail is still identifiable at a glance without
 * the thread being copied into an inbox we do not control.
 */
export function supportReplyEmail(input: { subject: string; ticketId: string }): Email {
  const subject = safeText(input.subject, 80) || "your ticket";
  const threadUrl = safeUrl(`${appUrl()}/support/${encodeURIComponent(input.ticketId)}`);

  return compose(`We replied about "${subject}"`, [
    p(`Someone has answered your support ticket, "${subject}".`),
    p(
      "The reply is on the ticket itself rather than in this email — answers often " +
        "quote your account, and this inbox is not the safest place for that. " +
        "Opening the thread is also how you reply back.",
    ),
    cta("Read the reply", threadUrl),
    note(
      "You are getting this because you opened this ticket. Replying on the thread " +
        "reopens it; marking it resolved ends it.",
    ),
  ]);
}
