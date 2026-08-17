import Anthropic from "@anthropic-ai/sdk";
import { MODELS, EFFORT } from "./models";

export type AgentEvent =
  | { type: "status"; text: string }
  | { type: "text"; text: string }
  | { type: "file"; path: string; action: "write" | "delete" }
  | {
      type: "usage";
      model: string;
      inputTokens: number;
      outputTokens: number;
      cacheReadTokens: number;
      cacheWriteTokens: number;
    };

export type FileMap = Record<string, string>;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Generated sites run inside a locked-down iframe with a CSP that blocks every
// external host, so "no CDN, no remote anything" is a hard constraint rather
// than a style preference — a page that reaches out simply renders broken.
const SYSTEM = `You are Kodely's site builder. You turn a plain-English description into a real, working website.

## Output contract
You build a self-contained static site using the write_file and delete_file tools.
- \`index.html\` is the entry point and must always exist.
- Additional files are fine: \`styles.css\`, \`app.js\`, further \`.html\` pages.
- Link between pages with relative hrefs (\`about.html\`), never absolute paths.

## Hard constraints — a page that breaks these renders blank for the user
- NO external requests of any kind. No CDN scripts, no Google Fonts, no remote
  images, no fetch/XHR to other origins. The sandbox blocks all of them.
- No build step. Plain HTML, CSS and vanilla JS that a browser runs as-is.
- Images are inline SVG, CSS gradients, or data: URIs. Never an <img src="https://...">.
- Fonts come from the system stack (e.g. ui-sans-serif, -apple-system, "Segoe UI", Inter, sans-serif).

## Quality bar
Ship something that looks designed, not templated. Real, specific copy for the
subject at hand — never "Lorem ipsum" and never placeholder headings like
"Your Title Here". Responsive down to 380px. Semantic HTML, labelled form
controls, sufficient colour contrast, and a visible :focus style. Include a
dark-mode block via prefers-color-scheme unless the brief implies otherwise.
Give the page one distinctive visual idea rather than a generic hero-plus-three-cards.

## Editing an existing site
You are given the current files. Change only what the request calls for, and
rewrite whole files with write_file (there is no patch tool). Do not restyle
or restructure parts the user did not ask about.

## Working style
Write the files first, then finish with two or three sentences telling the user
what you built and what they might want to change next. Do not narrate each file
as you write it, and do not paste code into your reply — the user sees a live
preview of the result.`;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "write_file",
    description:
      "Create a file or replace its entire contents. Always pass the complete final file, never a fragment or a diff.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Project-relative path, e.g. 'index.html' or 'styles.css'. No leading slash.",
        },
        content: { type: "string", description: "The complete contents of the file." },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "delete_file",
    description: "Delete a file that is no longer part of the site.",
    input_schema: {
      type: "object",
      properties: { path: { type: "string", description: "Project-relative path to delete." } },
      required: ["path"],
    },
  },
];

/** Reject path traversal and absolute paths before anything touches the DB. */
export function normalizePath(raw: string): string | null {
  const path = raw.trim().replace(/^\.?\//, "");
  if (!path || path.length > 200) return null;
  if (path.includes("..") || path.startsWith("/") || path.includes("\\")) return null;
  if (!/^[A-Za-z0-9._/-]+$/.test(path)) return null;
  return path;
}

function describeFiles(files: FileMap): string {
  const paths = Object.keys(files);
  if (paths.length === 0) return "The project is empty — this is the first build.";
  return [
    "Current files in the project:",
    ...paths.map((p) => `\n--- ${p} ---\n${files[p]}`),
  ].join("\n");
}

type RunOptions = {
  /** Prior turns, oldest first. */
  history: { role: "user" | "assistant"; content: string }[];
  request: string;
  files: FileMap;
  /** First build of a site vs a follow-up tweak — drives how hard we think. */
  kind: "create" | "edit";
  /** Applies the write; returning false rejects it (e.g. bad path). */
  onWrite: (path: string, content: string) => Promise<boolean>;
  onDelete: (path: string) => Promise<boolean>;
  /**
   * Aborted when the client disconnects (tab closed, network drop). Actually
   * cancels the in-flight Anthropic request instead of letting it run to
   * completion for nobody — a disconnect shouldn't mean paying full price for
   * a generation no one will ever see the result of.
   */
  signal?: AbortSignal;
};

/**
 * Runs the plan → generate → apply loop, streaming progress as it goes.
 * Token usage is accumulated across every turn so the caller can meter the
 * true cost of the build (including the repair turns, which we may not bill).
 */
export async function* runAgent(opts: RunOptions): AsyncGenerator<AgentEvent> {
  const model = MODELS.builder;
  // Effort is the sharpest cost lever we have: a first build is a blank-page
  // design problem and earns `high`, while a targeted tweak lands the same
  // result at `medium` for a fraction of the thinking tokens.
  const effort = opts.kind === "create" ? EFFORT.create : EFFORT.edit;

  const messages: Anthropic.MessageParam[] = [];
  for (const turn of opts.history) {
    messages.push({ role: turn.role, content: turn.content });
  }
  messages.push({
    role: "user",
    content: `${describeFiles(opts.files)}\n\n--- Request ---\n${opts.request}`,
  });

  const totals = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };

  // Bounded so a confused model can never bill the user for an endless loop.
  const MAX_TURNS = 8;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    if (opts.signal?.aborted) return;

    const stream = anthropic.messages.stream(
      {
        model,
        max_tokens: 32_000,
        thinking: { type: "adaptive" },
        output_config: { effort },
        system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
        tools: TOOLS,
        messages,
      },
      { signal: opts.signal },
    );

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield { type: "text", text: event.delta.text };
      }
    }

    const message = await stream.finalMessage();
    totals.inputTokens += message.usage.input_tokens ?? 0;
    totals.outputTokens += message.usage.output_tokens ?? 0;
    totals.cacheReadTokens += message.usage.cache_read_input_tokens ?? 0;
    totals.cacheWriteTokens += message.usage.cache_creation_input_tokens ?? 0;

    if (message.stop_reason === "refusal") {
      throw new Error(
        "The request was declined. Try describing the site you want in different terms.",
      );
    }

    const toolUses = message.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );

    if (toolUses.length === 0) {
      yield { type: "usage", model, ...totals };
      return;
    }

    messages.push({ role: "assistant", content: message.content });

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const use of toolUses) {
      const input = use.input as { path?: string; content?: string };
      const path = normalizePath(input.path ?? "");

      if (!path) {
        results.push({
          type: "tool_result",
          tool_use_id: use.id,
          content: `Rejected: '${input.path}' is not a valid project-relative path.`,
          is_error: true,
        });
        continue;
      }

      if (use.name === "write_file") {
        const ok = await opts.onWrite(path, input.content ?? "");
        if (ok) yield { type: "file", path, action: "write" };
        results.push({
          type: "tool_result",
          tool_use_id: use.id,
          content: ok ? `Wrote ${path}.` : `Could not write ${path}.`,
          is_error: !ok,
        });
      } else if (use.name === "delete_file") {
        const ok = await opts.onDelete(path);
        if (ok) yield { type: "file", path, action: "delete" };
        results.push({
          type: "tool_result",
          tool_use_id: use.id,
          content: ok ? `Deleted ${path}.` : `${path} did not exist.`,
          is_error: false,
        });
      } else {
        results.push({
          type: "tool_result",
          tool_use_id: use.id,
          content: `Unknown tool ${use.name}.`,
          is_error: true,
        });
      }
    }

    messages.push({ role: "user", content: results });
  }

  yield { type: "usage", model, ...totals };
}
