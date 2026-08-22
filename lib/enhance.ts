import Anthropic from "@anthropic-ai/sdk";
import { tmpdir } from "node:os";
import { ENGINE } from "./agent";
import { MODELS } from "./models";

// Auto-enhance: turn a rough one-liner into a fuller spec the user reviews and
// edits BEFORE any credits are spent.
//
// Two jobs, both about the same failure mode — "almost right, but not quite":
//   1. Beginners don't know what to describe. A one-line prompt produces a
//      generic page, they blame the tool, they churn.
//   2. Nobody should discover what was built by paying for it. The spec is
//      shown, editable, and entirely optional; the user can always ignore it
//      and build with exactly what they typed.
//
// Deliberately NOT billed and NOT recorded as a build. It costs a fraction of
// a cent on the cheap model (see MODELS.enhancer) and charging for it would
// undo the point — a preview you pay for is not a preview. lib/rate-limit.ts
// carries the abuse ceiling instead of the credit meter.

/** Longer than this and there is nothing left to expand — just build it. */
export const MAX_PROMPT_CHARS = 2000;

// The spec is instructions for lib/agent.ts, so its hard constraints have to
// be repeated here or Enhance becomes a liar: it would cheerfully promise a
// booking system, the builder would produce a decorative form, and the user
// would have paid to find that out. Everything the generator cannot do is
// therefore banned from the spec, not merely discouraged.
//
// The word ceiling is a product decision as much as a cost one: a spec nobody
// reads is worse than no spec, and this has to be reviewable in ~20 seconds.
export const ENHANCE_SYSTEM = `You expand a one-line website idea into a short, concrete brief that the person can read, edit, and hand straight back as their build prompt.

## What actually gets built
A single-page site: layout, sections, copy and visual style. That is the whole product. There is no backend of any kind.

NEVER describe, promise or imply any of the following. The generator cannot build them, and a brief that asks for them produces a site that is broken or dishonest:
- databases, saved records, stored submissions, search over real data
- user accounts, sign-in, member areas, dashboards, admin pages
- payments, checkout, carts, or bookings that reserve anything real
- server code, APIs, scheduled jobs, email sending, contact forms that deliver a message
- anything loaded from another site: CDN scripts, web fonts, remote images, stock photography, embedded maps, video embeds, analytics, social feeds, live prices

Published sites run under a strict Content Security Policy that blocks every external host. A form, a "Book now" button or a price table can exist as a VISUAL element on the page — describe it that way, and never as something that works.

Images are inline SVG, CSS gradients and shapes, or simple illustration. Type comes from the system font stack. Say so when it matters; do not ask for photographs or a specific web font.

## What to write
Plain text. No code, no markdown fences, no bullet characters beyond simple dashes. Under 220 words. Write in the same language the person used. Use exactly these five headings, in this order:

Audience — who the site is for, in one sentence.
Goal — the single thing a visitor should do or understand.
Tone and visual style — two or three concrete adjectives, plus the colour feel, the typographic feel, and how imagery is handled.
Sections — the page's sections in order, each with one line saying what it holds.
Key content — the actual headline wording, the nav and button labels, and any names or claims to use.

Rules:
- Be specific. Real headline wording, real section names, real labels — never "your headline here".
- Invent no facts about a real business: no addresses, phone numbers, prices, opening hours, testimonials or statistics. Where one is clearly needed, write a bracketed placeholder such as [your address] for the person to fill in.
- Keep every choice the person already made. Expand their idea; do not replace it.
- Output the brief and nothing else. No preamble, no sign-off, no questions back.`;

// The metered path's client, constructed the same way lib/agent.ts does.
// Harmless when KODELY_ENGINE=sdk: nothing on that path ever calls it.
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Hard ceilings, because the caller is a person staring at a spinner next to a
// button they could just press instead. The SDK path is far more generous: it
// spawns a Claude Code process, and cold start alone can eat several seconds.
const API_TIMEOUT_MS = 25_000;
const SDK_TIMEOUT_MS = 60_000;

/**
 * One AbortSignal that trips on whichever comes first: our own deadline, or
 * the client hanging up. AbortSignal.any would do this in one line but the
 * timer still has to be cleared, so the teardown callback is needed regardless.
 */
function withDeadline(ms: number, signal?: AbortSignal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  const onAbort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener("abort", onAbort, { once: true });
  return {
    controller,
    release() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    },
  };
}

function userTurn(prompt: string): string {
  return `Here is the rough idea, exactly as the person typed it:\n\n${prompt}`;
}

async function enhanceViaApi(prompt: string, signal?: AbortSignal): Promise<string> {
  const { controller, release } = withDeadline(API_TIMEOUT_MS, signal);
  try {
    // No `thinking` and no `output_config.effort` here on purpose: Haiku 4.5
    // rejects effort, and a 220-word brief is not a reasoning problem. If
    // KODELY_MODEL_ENHANCER is ever pointed at a bigger model, this stays
    // correct — it just leaves that model on its own defaults.
    const message = await anthropic.messages.create(
      {
        model: MODELS.enhancer,
        max_tokens: 1500,
        // No cache_control, unlike lib/agent.ts: this system prompt is well
        // under the ~1k-token minimum cacheable prefix, so a breakpoint here
        // would be silently ignored and only mislead the next reader.
        system: ENHANCE_SYSTEM,
        messages: [{ role: "user", content: userTurn(prompt) }],
      },
      { signal: controller.signal },
    );

    if (message.stop_reason === "refusal") {
      throw new Error("The request was declined.");
    }

    return message.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();
  } finally {
    release();
  }
}

async function enhanceViaSdk(prompt: string, signal?: AbortSignal): Promise<string> {
  // Imported for its module-scope side effect as much as for query():
  // lib/agent-sdk.ts strips ANTHROPIC_API_KEY from the environment so nothing
  // the SDK spawns can quietly bill the metered key on a box whose operator
  // asked for the subscription engine. Enhance can be the first SDK call a
  // process makes, so it must not skip that.
  await import("./agent-sdk");
  const { query } = await import("@anthropic-ai/claude-agent-sdk");

  const { controller, release } = withDeadline(SDK_TIMEOUT_MS, signal);
  let out = "";
  try {
    for await (const message of query({
      prompt: userTurn(prompt),
      options: {
        systemPrompt: ENHANCE_SYSTEM,
        model: MODELS.enhancer,
        // No tools at all — this is one prompt in, one paragraph out. Combined
        // with a temp cwd and no filesystem settings, the agent has nothing to
        // read: it cannot wander into this repo or pick up its CLAUDE.md.
        allowedTools: [],
        settingSources: [],
        cwd: tmpdir(),
        maxTurns: 1,
        permissionMode: "dontAsk",
        abortController: controller,
      },
    })) {
      if (message.type === "assistant" && message.message?.content) {
        for (const block of message.message.content) {
          if ("text" in block && block.text) out += block.text;
        }
      }
    }
  } finally {
    release();
  }

  if (controller.signal.aborted) throw new Error("Enhance timed out.");
  return out.trim();
}

/**
 * Expand `prompt` into a reviewable spec.
 *
 * Throws on timeout, disconnect, refusal, or an empty answer. Every caller is
 * expected to swallow that and carry on with the user's original prompt —
 * Enhance is a convenience, and a failed convenience must never stand between
 * someone and the build they came here for.
 */
export async function enhancePrompt(prompt: string, signal?: AbortSignal): Promise<string> {
  const spec = ENGINE === "sdk" ? await enhanceViaSdk(prompt, signal) : await enhanceViaApi(prompt, signal);
  if (!spec) throw new Error("The model returned an empty spec.");
  return spec;
}
