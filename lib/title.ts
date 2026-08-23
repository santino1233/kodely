import Anthropic from "@anthropic-ai/sdk";
import { tmpdir } from "node:os";
import { ENGINE } from "./agent";
import { MODELS } from "./models";
import { withDeadline } from "./enhance";

// Real title summarization for a new project, instead of truncating the raw
// build prompt at a character count.
//
// Same job, same shape and same model as lib/enhance.ts's expansion call
// (MODELS.enhancer, i.e. Haiku 4.5): a few WORDS out here instead of a few
// hundred, cheap enough to run on every project creation without touching the
// credit ledger, and — like Enhance — this must never block or fail a build.
// Every caller is expected to catch a thrown error and fall back to the raw
// prompt (truncated), never to surface "your project couldn't be created"
// because a naming call timed out.

export const TITLE_SYSTEM = `You read a short brief describing a website someone wants built, and you name the PROJECT — not the page, the thing itself.

Reply with ONLY the name. No quotes, no punctuation wrapping it, no explanation, no trailing period, nothing else on the line.

Rules:
- 2 to 5 words, Title Case.
- If the brief states or clearly implies a real business, brand, product or person's name, use exactly that name (e.g. "a landing page for a coffee shop called Roan Coffee" -> "Roan Coffee"; "site for my client's studio, Soul Pilates, warm and calming" -> "Soul Pilates Studio").
- If NO name is given anywhere in the brief, do not invent one. Instead write a short, generic label for what the site is (e.g. "Coffee Shop Landing Page", "Wedding Invitation Site", "Portfolio Site").
- Never say "AI", "Generated", "New Project", "Untitled", or describe the request itself ("Website Request").
- Plain text only.`;

const TITLE_API_TIMEOUT_MS = 8_000;
const TITLE_SDK_TIMEOUT_MS = 20_000;

/** Longer briefs cost more without improving the name — a real name is stated
    in the first sentence or two, or it isn't stated at all. */
const MAX_INPUT_CHARS = 800;

// The metered path's client, constructed the same way lib/enhance.ts and
// lib/agent.ts do. Harmless when KODELY_ENGINE=sdk: nothing on that path ever
// calls it, and agent-sdk.ts strips ANTHROPIC_API_KEY from the environment
// before this module can be reached that way (see summarizeViaSdk below).
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function userTurn(prompt: string): string {
  return `Brief:\n\n${prompt.slice(0, MAX_INPUT_CHARS)}`;
}

/** Strips wrapping quotes the model sometimes adds despite the instruction not to. */
function clean(title: string): string {
  return title
    .trim()
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .replace(/[.!]+$/, "")
    .trim();
}

async function summarizeViaApi(prompt: string, signal?: AbortSignal): Promise<string> {
  const { controller, release } = withDeadline(TITLE_API_TIMEOUT_MS, signal);
  try {
    // No `thinking` / `output_config.effort`: Haiku 4.5 rejects effort, and
    // naming a few words is not a reasoning problem — mirrors lib/enhance.ts.
    const message = await anthropic.messages.create(
      {
        model: MODELS.enhancer,
        max_tokens: 40,
        system: TITLE_SYSTEM,
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

async function summarizeViaSdk(prompt: string, signal?: AbortSignal): Promise<string> {
  // Imported for its module-scope side effect, same reason lib/enhance.ts
  // does this: it strips ANTHROPIC_API_KEY from the environment so nothing
  // spawned here can quietly bill the metered key on an SDK-engine box.
  await import("./agent-sdk");
  const { query } = await import("@anthropic-ai/claude-agent-sdk");

  const { controller, release } = withDeadline(TITLE_SDK_TIMEOUT_MS, signal);
  let out = "";
  try {
    for await (const message of query({
      prompt: userTurn(prompt),
      options: {
        systemPrompt: TITLE_SYSTEM,
        model: MODELS.enhancer,
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

  if (controller.signal.aborted) throw new Error("Title summarization timed out.");
  return out.trim();
}

/**
 * Summarize `prompt` into a short, real project title.
 *
 * Throws on timeout, disconnect, refusal, or an empty answer — the caller is
 * expected to catch it and fall back to a plain truncation of the prompt, the
 * same way every lib/enhance.ts caller falls back to the user's own words.
 * This function never fabricates a business that wasn't described; see
 * TITLE_SYSTEM.
 */
export async function summarizeTitle(prompt: string, signal?: AbortSignal): Promise<string> {
  const raw = ENGINE === "sdk" ? await summarizeViaSdk(prompt, signal) : await summarizeViaApi(prompt, signal);
  const title = clean(raw).slice(0, 80);
  if (!title) throw new Error("The model returned an empty title.");
  return title;
}
