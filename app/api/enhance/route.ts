import { getCurrentUser } from "@/lib/auth";
import { checkEnhanceRateLimit } from "@/lib/rate-limit";
import { enhancePrompt, MAX_PROMPT_CHARS } from "@/lib/enhance";
import { FLAGS, isEnabled } from "@/lib/flags";

export const dynamic = "force-dynamic";
// Well above lib/enhance.ts's own SDK_TIMEOUT_MS so the deadline that fires is
// ours, with a friendly message, rather than the platform's blank 504.
export const maxDuration = 90;

// Expand a rough prompt into a spec the user reviews and edits before
// building. Auth-gated like every other route that costs us money, but
// deliberately NOT credit-gated: this is the anti-bill-shock lever, and a
// preview of what you're about to buy cannot itself cost credits. See the
// header comment in lib/enhance.ts.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });

  // ── Feature gate ─────────────────────────────────────────────────────────
  // Straight after getCurrentUser, which is also the first point a subject id
  // exists — and this is the one flag on this route where the subject really
  // matters. Unlike the four kill switches, this gate is expected to be run at
  // a percentage, and bucketing on user.id is what keeps a given person on one
  // side of the split instead of watching the Enhance button work, then fail,
  // then work again.
  //
  // Before the rate limiter (which records a hit in memory on every call) and
  // before enhancePrompt's model call, so an off gate costs nothing and does
  // not eat into the user's hourly allowance for a feature they were refused.
  //
  // This flag FAILS OPEN — alone among the six wired here. An unreachable
  // FeatureFlag table resolves it to true rather than yanking a fully shipped,
  // credit-free feature from everyone over a blip in an unrelated table. The
  // reasoning is written out in lib/flags.ts; nothing on this route needs to
  // re-decide it.
  //
  // The wording echoes the catch below on purpose. Whatever the reason, the
  // user's own text is still in the box and Build was never blocked — Enhance
  // is a convenience, never a gate, and the message has to keep saying so.
  if (!(await isEnabled(FLAGS.promptEnhance, user.id))) {
    return Response.json(
      { error: "Enhance is switched off right now — you can still build with what you wrote." },
      { status: 503 },
    );
  }

  const body = (await req.json().catch(() => null)) as { prompt?: string } | null;
  const prompt = body?.prompt?.trim();

  if (!prompt) {
    return Response.json(
      { error: "Describe your site first — then Enhance can fill it out." },
      { status: 400 },
    );
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    return Response.json(
      { error: "That's already detailed enough to build — go ahead and build it." },
      { status: 400 },
    );
  }

  const rateLimit = checkEnhanceRateLimit(user.id);
  if (!rateLimit.allowed) {
    return Response.json(
      { error: "You've enhanced a lot of prompts just now — try again shortly." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }

  try {
    // req.signal aborts the model call if the tab closes or the user gives up
    // and hits Build instead — no reason to keep paying for an answer nobody
    // is waiting for.
    const spec = await enhancePrompt(prompt, req.signal);
    return Response.json({ spec });
  } catch (error) {
    // Timeout, refusal, empty answer, SDK not authenticated — the client's
    // response is identical, and it always points back at the thing that
    // still works. Enhance failing must never block a build.
    console.error("[kodely] enhance failed", error);
    return Response.json(
      { error: "Couldn't expand that just now — you can still build with what you wrote." },
      { status: 502 },
    );
  }
}
