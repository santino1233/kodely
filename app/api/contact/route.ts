import { CONTACT_TO, isMailConfigured, sendContactEmail } from "@/lib/mail";

// This endpoint is UNAUTHENTICATED (a contact form has to be), so it is the
// one route on the site any stranger can use to make the server send mail.
// That makes it a spam target, hence the honeypot + per-IP throttle below.

const MAX_PER_IP_PER_HOUR = 5;

// In-memory throttle. Deliberately not the DB-backed lib/rate-limit.ts, which
// keys on userId — there is no user here. Resets on deploy and is per-process,
// so it is a speed bump rather than a guarantee; that is the right weight for
// a contact form. If this ever needs to be real, move it to the DB.
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const cutoff = now - 3_600_000;
  const recent = (hits.get(ip) ?? []).filter((t) => t > cutoff);
  // Bound the map so a flood of unique IPs can't grow it without limit.
  if (hits.size > 5000) hits.clear();
  if (recent.length >= MAX_PER_IP_PER_HOUR) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  return false;
}

function clientIp(req: Request): string {
  // Behind Cloudflare -> host nginx -> VM nginx, so the socket address is
  // always a proxy. Trust the forwarded chain's first entry.
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || req.headers.get("cf-connecting-ip") || "unknown";
}

export async function POST(req: Request) {
  if (!isMailConfigured()) {
    return Response.json(
      { error: `Email isn't set up yet — reach us directly at ${CONTACT_TO}.` },
      { status: 503 },
    );
  }

  let body: { name?: unknown; email?: unknown; message?: unknown; company?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  // Honeypot: a field hidden from humans via CSS. Bots fill every input they
  // find, so a non-empty value means automation. Return 200 so the bot thinks
  // it succeeded and doesn't retry with a different shape.
  if (typeof body.company === "string" && body.company.trim() !== "") {
    return Response.json({ ok: true });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (!name || !email || !message) {
    return Response.json({ error: "Please fill in every field." }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: "That email address doesn't look right." }, { status: 400 });
  }
  if (message.length > 5000) {
    return Response.json({ error: "That message is too long (5000 characters max)." }, { status: 400 });
  }

  if (rateLimited(clientIp(req))) {
    return Response.json(
      { error: "Too many messages from this address. Try again later." },
      { status: 429 },
    );
  }

  try {
    await sendContactEmail({ name, email, message });
  } catch (err) {
    // Never surface SMTP internals (host, credentials, provider errors) to an
    // unauthenticated caller; log for the operator instead.
    console.error("[contact] send failed:", err);
    return Response.json(
      { error: `Couldn't send that. Email us directly at ${CONTACT_TO}.` },
      { status: 502 },
    );
  }

  return Response.json({ ok: true });
}
