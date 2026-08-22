import nodemailer from "nodemailer";

// Transactional mail for Kodely. Sends through the EXISTING Nxeon mail
// server (kodely.me's MX is mail.nxeon.cloud and its SPF already includes
// nxeon.cloud) rather than adding a third-party sender — no new vendor, no
// new cost, and no new domain-reputation setup, since mail leaving that host
// for kodely.me already passes SPF.
//
// Follows the same "inert until configured" shape as lib/stripe.ts: with no
// SMTP_* env vars set, isMailConfigured() is false and callers return a clean
// 503 instead of throwing. That keeps a fresh clone / local instance working
// without mail credentials, and makes "not configured" a visible state rather
// than a runtime crash.

const HOST = process.env.SMTP_HOST;
const PORT = Number(process.env.SMTP_PORT ?? 587);
const USER = process.env.SMTP_USER;
const PASS = process.env.SMTP_PASS;

// Envelope sender. MUST be a domain the sending server is allowed to send
// for, or SPF/DMARC will fail — this is not the visitor's address (see the
// Reply-To note in sendContactEmail).
const FROM = process.env.MAIL_FROM ?? "Kodely <noreply@kodely.me>";
export const CONTACT_TO = process.env.CONTACT_TO ?? "hello@kodely.me";

export function isMailConfigured(): boolean {
  return Boolean(HOST && USER && PASS);
}

let cached: nodemailer.Transporter | null = null;

function transporter(): nodemailer.Transporter {
  if (!isMailConfigured()) throw new Error("SMTP is not configured");
  if (!cached) {
    cached = nodemailer.createTransport({
      host: HOST,
      port: PORT,
      // 465 is implicit TLS; 587 starts plaintext and upgrades via STARTTLS.
      secure: PORT === 465,
      auth: { user: USER, pass: PASS },
    });
  }
  return cached;
}

// Strip CR/LF before any user-supplied value reaches a mail HEADER. Without
// this a visitor could put "\r\nBcc: victim@example.com" in the name field
// and turn this form into an open relay (classic SMTP header injection).
// Body content doesn't need this — only headers.
function headerSafe(value: string, max = 200): string {
  return value.replace(/[\r\n]+/g, " ").trim().slice(0, max);
}

/**
 * Send a transactional message through the one configured transport.
 *
 * Exists so lib/notifications/ doesn't have to rebuild a transporter from the
 * same env vars — two independent copies of the secure/port logic would drift,
 * and the connection pool would be duplicated for no reason. `from` is always
 * ours: the envelope sender must be a domain this server is allowed to send
 * for, or SPF/DMARC fails. Callers may override every other field.
 */
export async function sendMail(msg: nodemailer.SendMailOptions): Promise<void> {
  // `from` LAST so it always wins. Spreading it first would let a caller
  // override the envelope sender, which is the one field that must stay ours.
  await transporter().sendMail({ ...msg, from: FROM });
}

export async function sendContactEmail(input: {
  name: string;
  email: string;
  message: string;
}): Promise<void> {
  const name = headerSafe(input.name, 120);
  const email = headerSafe(input.email, 200);
  const message = input.message.slice(0, 5000);

  await transporter().sendMail({
    from: FROM,
    to: CONTACT_TO,
    // Reply-To carries the visitor's address, NOT From. Sending as the
    // visitor's own domain would fail that domain's SPF/DMARC and get the
    // mail junked or rejected — but replying in a mail client still goes
    // straight to them, which is the behaviour actually wanted here.
    replyTo: `${name} <${email}>`,
    subject: `Kodely contact — ${name || email}`,
    text: `From: ${name} <${email}>\n\n${message}\n`,
  });
}
