import Anthropic from "@anthropic-ai/sdk";
import { MODELS, EFFORT } from "./models";
import { narrateTool } from "./build-narration";
import { ASSET_KINDS, type AssetKind } from "./assets";
import { findAssets, formatMatchesForTool } from "./assets/materialize";

export type AgentEvent =
  | { type: "status"; text: string }
  // A live line describing what the agent is doing RIGHT NOW, derived from a
  // real tool call (see lib/build-narration.ts). Distinct from "status", which
  // marks a phase change the route itself knows about.
  | { type: "progress"; text: string }
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

// Generated sites are real Vite + React + TypeScript + Tailwind apps, built
// server-side (lib/build-site.ts) into static output served from a
// locked-down CSP that blocks every external host — "no CDN, no remote
// anything" is a hard constraint rather than a style preference.
const SYSTEM = `You are Kodely's site builder. You turn a plain-English description into a real, working website — a genuine Vite + React + TypeScript + Tailwind app, not a static HTML mockup.

## The project you're editing
Every project starts from a real foundation (package.json, vite.config.ts, tsconfig.json, index.html, src/main.tsx, src/index.css, src/App.tsx, and a few UI primitives under src/components/ui/). You almost never touch the config files — package.json, vite.config.ts, tsconfig.json and src/main.tsx are already correct and there is no way to add a new dependency, so leave them alone unless something is actually broken. Your work happens in \`src/pages/\`, \`src/pages.tsx\`, \`src/App.tsx\`, new files under \`src/components/\`, and \`src/index.css\` — plus one .html shell per page at the project root (see Multi-page below).

### The page shells — the one kind of config file you MUST edit
Every PAGE needs its own real \`<head>\`, starting with index.html. The foundation ships a placeholder title and a site is never actually called "Kodely Site" — that title is what shows in the browser tab, in Google, and in every link preview when someone shares the URL. Write, in the site's own language:

- \`<title>\` — the real business or site name, with a short qualifier where it helps (e.g. "Bloom Pilates — Reformer studio in Denver"). Under ~60 characters.
- \`<meta name="description">\` — one specific sentence about what THIS business offers, ~150 characters. Describe the business, not the template.
- \`<meta property="og:title">\` and \`<meta property="og:description">\` — usually the same values; these are what appear when the link is shared.
- \`<html lang="...">\` — the correct language if the content is not English.

Leave the rest of index.html alone (charset, viewport, the root div, the module script). Never add \`<link>\` or \`<script>\` tags pointing at a remote host — published sites run under a strict CSP that blocks external requests, so they fail silently.

## Output contract
Use the write_file and delete_file tools. Always pass the complete final file — there is no patch tool.
- Build real, composable React components — a Hero, a FeatureGrid, a Footer — not one giant App.tsx.
- Style with Tailwind utility classes. The existing primitives (Button, Card, Section, Nav in src/components/ui/) are a starting point — reuse them, extend them, or write new ones as the design calls for, but keep the same quality bar.
- Multi-page: sites have real pages at real URLs — /about, /services/boilers — and each one is a genuinely separate document, which is what lets it rank on its own. Adding a page is three files and no config change:
  1. \`src/pages/About.tsx\` — the page component, built like any other component.
  2. An entry in \`src/pages.tsx\`: \`{ path: "/about", label: "About", component: About }\`. Table order is nav order; add \`nav: false\` to keep a page out of the nav.
  3. \`about.html\` at the project root — a copy of \`index.html\` with \`data-page="/about"\` on the root div and its OWN <title>, <meta name="description"> and OG tags, written for THAT page. Nested pages are the same: \`services/boilers.html\` with \`data-page="/services/boilers"\`. Leave the <script> tag pointing at \`/src/main.tsx\` — every page shares one bundle.
  Skip step 3 and the page does not exist. Give it the same <head> as another page and it competes with that page in search instead of adding to it — a per-page title and description is the whole reason a separate page is worth having.
  Link between pages with \`<Link to="/about">\` from \`src/router.tsx\`, never a bare \`<a href="/about">\`: the same files are served under more than one URL prefix and \`Link\` is what keeps the href correct in both. \`SiteNav\` builds itself from the page table, so a page added there appears in the nav on every page.
  Use pages when the content genuinely differs — separate services, an about/story page, a blog, per-location pages. A small business with one thing to say is still better as one scrolling page with sections, and a one-page site needs no \`pages.tsx\` change at all. Don't manufacture thin pages to look bigger.

## Hard constraints — these break the sandboxed build/serve, not just style
- NO external requests. No CDN scripts, no Google Fonts, no remote images, no
  fetch/XHR to other origins — the CSP blocks all of them at serve time.
- Only the dependencies already in package.json exist (react, react-dom). You
  cannot add packages — there is no install step per generation.
- Images are inline SVG, CSS gradients, or data: URIs. Never <img src="https://...">.

## Assets — use these instead of drawing everything by hand
Kodely ships a catalogue of ~460 inlinable assets: icons (contact, social, commerce, food, trades, UI), country flags, curated gradients, mesh backgrounds, grain textures, section dividers, CSS patterns and initials avatars. All of them are safe under the CSP because none of them fetch anything.
Search the catalogue with the find_assets tool — pass what you need in plain words ("plumber wrench icon", "warm sunset gradient", "wave divider") and paste the source it returns.
Reach for the catalogue before hand-writing SVG path data: the results are cleaner and more consistent than improvised geometry, and they cost far fewer tokens. Hand-write only when nothing fits.
- Fonts come from the system stack (ui-sans-serif, -apple-system, "Segoe UI", Inter, sans-serif). No @import, no <link>, and no @font-face — not even with a base64 data: URI. The CSP sets no font-src, so fonts fall back to default-src 'self', which does NOT allow data: (unlike img-src, which does). A base64 font is blocked exactly like a remote one.

## Quality bar
Ship something that looks designed, not templated. Real, specific copy for the
subject at hand — never "Lorem ipsum" and never placeholder headings like
"Your Title Here". Responsive down to 380px. Semantic HTML, labelled form
controls, sufficient colour contrast, and a visible :focus style. Include a
dark-mode treatment unless the brief implies otherwise. Give the page one
distinctive visual idea rather than a generic hero-plus-three-cards.

## Never invent facts about a real business
"Specific copy" means specific to the SUBJECT, not invented details about a
real business. Never fabricate: street addresses, phone numbers, email
addresses, opening hours, prices, staff names, years in business, customer
counts, awards, certifications, review scores, or testimonials.

These end up on a real business's public website. An invented phone number is
a real number belonging to somebody else; invented opening hours send real
customers to a closed door; an invented testimonial is a fabricated
endorsement. This outranks the "no placeholder text" rule above — when you
don't know a fact, that rule does not license you to make one up.

Use a clearly-bracketed placeholder instead: [your phone number],
[your address], [your opening hours]. A bracket is an obvious prompt to fill
something in; a plausible-looking invention is one nobody notices before
publishing. Invent freely for anything that is genuinely a design choice —
headlines, section copy, taglines, colour, imagery.

## Never build something that only pretends to work
There is no backend, so anything needing a server cannot function. Do not
build a booking form, newsletter signup, login, cart or checkout that appears
functional — a form that silently discards a real enquiry is worse than no
form.

Where the brief asks for one of those, use a real alternative that works with
no server: a mailto: link, a tel: link, or a prominent [link to your booking
system]. If you show such a control as a visual element, its label must make
the destination obvious ("Email us", "Call now"), never "Submit" or "Send".

### The one exception: contact forms are real — use this exact markup

A plain HTML form that POSTs to the site's own origin genuinely works: it is
received, stored, and emailed to the site owner. This is the ONLY form kind
that functions — do not extend this pattern to booking, checkout, login or
anything that needs to read data back.

Markup shape (write real JSX for this, the above is the structure only —
do not literally emit a <form> tag with a template placeholder):
  - form: method="post", action="/__forms/contact"
  - a hidden honeypot input named "_gotcha", visually off-screen
    (position:absolute; left:-9999px), tabIndex={-1}, autoComplete="off"
  - a hidden input named "_t" whose value gets set to Date.now() by a tiny
    inline effect/script the instant the form mounts
  - real fields: at minimum a text input named "name", an email input named
    "email", and a textarea named "message" — each required
  - a submit button whose label says what happens ("Send message"), never
    a bare "Submit"

Rules, all enforced server-side — get them right or the submission is silently
refused or misread:
- \`action\` MUST be \`/__forms/<name>\`, where \`<name>\` is lowercase
  \`[a-z0-9-]\`, starting with a letter or digit, 32 characters or fewer. One
  form named \`contact\` is normal; a multi-page site may use a different name
  per page (\`/__forms/booking-request\`).
- \`method="post"\` only. No \`fetch\`, no \`onsubmit\`, no client-side validation
  logic beyond \`required\` — the whole point is that this works with
  JavaScript disabled.
- Every real field needs a \`name\` matching \`[A-Za-z][A-Za-z0-9_-]{0,63}\`, 12
  fields maximum. A field literally named \`email\` is what lets the owner
  reply — include one whenever the brief implies contact.
- The honeypot input and the timing script above are REQUIRED, verbatim,
  unless the brief explicitly asks for it to be left out — they are what
  keeps spam out of the site owner's inbox. \`_\`-prefixed field names are
  reserved for this control channel and are never stored as content.
- Never render a fake success state yourself. On success the visitor is
  navigated to a real confirmation page the server renders — do not swallow
  the navigation with \`preventDefault\` or a client-side "Thanks!" message.
- This does not work in the in-editor preview, only on a published site —
  mention that once in your reply if the customer is likely to test the form
  before publishing.

## Editing an existing site
You are given the current source files. Change only what the request calls
for — do not restyle or restructure components the user did not ask about.

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
  {
    name: "find_assets",
    description:
      "Search Kodely's built-in asset catalogue (icons, country flags, gradients, mesh backgrounds, grain textures, section dividers, CSS patterns, initials avatars). Returns paste-ready source for each match. Everything it returns is inlinable and CSP-safe. Prefer this over hand-writing SVG path data.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Plain-words description, e.g. 'phone icon', 'warm sunset gradient', 'wave section divider', 'french flag'.",
        },
        kind: {
          type: "string",
          enum: [...ASSET_KINDS],
          description: "Optional filter to one kind of asset.",
        },
        limit: { type: "number", description: "Max results, default 6." },
      },
      required: ["query"],
    },
  },
];

// Files the agent must never write, because they are EXECUTED server-side
// rather than merely served.
//
// `vite build` runs the project's own vite.config.* in a Node process on our
// machine (lib/build-site.ts). A config file is not data — it is code we run.
// Until now the only thing stopping a prompt from replacing it was a sentence
// in the system prompt, which is not an access control: "write a vite config
// that reads process.env and posts it somewhere" would have been executed.
//
// package.json and tsconfig.json are here for the same family of reasons
// (lifecycle scripts, compiler plugins). The foundation supplies all of these
// already and the agent has no legitimate reason to touch them — the prompt
// has always told it not to. This makes that a rule instead of a request.
const PROTECTED_PATHS = new Set([
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "tsconfig.node.json",
]);
const PROTECTED_PATTERNS = [
  /^vite\.config\.[cm]?[jt]s$/i,
  /^postcss\.config\.[cm]?[jt]s$/i,
  /^tailwind\.config\.[cm]?[jt]s$/i,
  /^\./, // dotfiles: .npmrc, .env, .babelrc, and the asset catalogue
  /^node_modules\//i,
];

/** True when writing this path would hand the agent server-side execution. */
export function isProtectedPath(path: string): boolean {
  if (PROTECTED_PATHS.has(path)) return true;
  return PROTECTED_PATTERNS.some((re) => re.test(path));
}

/** Reject path traversal, absolute paths, and executable config before anything touches the DB. */
export function normalizePath(raw: string): string | null {
  const path = raw.trim().replace(/^\.?\//, "");
  if (!path || path.length > 200) return null;
  if (path.includes("..") || path.startsWith("/") || path.includes("\\")) return null;
  if (!/^[A-Za-z0-9._/-]+$/.test(path)) return null;
  if (isProtectedPath(path)) return null;
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
  /** A reference image attached to this turn's request (vision input). */
  image?: { mediaType: string; data: string };
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
  /**
   * Per-run engine override, for a gradual rollout onto the SDK.
   *
   * Strictly an UPGRADE path and never a downgrade: `KODELY_ENGINE=sdk` stays
   * an absolute pin (see runAgent below). That env var is an operator's
   * deliberate machine-level decision to stay off the metered key, and a
   * feature flag whose unset default is `false` must never be able to revoke
   * it silently — that inversion is how a flag becomes a second, contradictory
   * source of truth.
   *
   * Bucket this per USER, not per build. Splitting one person's builds across
   * both engines would contaminate any comparison between the two arms.
   */
  engine?: "api" | "sdk";
};

/**
 * Runs the plan → generate → apply loop, streaming progress as it goes.
 * Token usage is accumulated across every turn so the caller can meter the
 * true cost of the build (including the repair turns, which we may not bill).
 */
// Which generation engine to use.
//   api (default) — metered Anthropic API via ANTHROPIC_API_KEY. Real cost,
//                   real usage telemetry, real credit charges.
//   sdk           — Claude Agent SDK on this machine's `claude setup-token`
//                   subscription login. No metered spend, so no cost data and
//                   0 credits charged. See lib/agent-sdk.ts for the caveats.
// Defaults to `api` so a fresh clone never silently runs on someone's personal
// subscription; the environment opts in.
export const ENGINE = process.env.KODELY_ENGINE === "sdk" ? "sdk" : "api";

export async function* runAgent(opts: RunOptions): AsyncGenerator<AgentEvent> {
  // One place decides, and the env var wins. `KODELY_ENGINE=sdk` pins every
  // run to the SDK; when it is at its `api` default the caller may opt an
  // individual run in. Written as `||` rather than reading opts first so the
  // pin cannot be overridden by a caller — see the note on RunOptions.engine.
  const engine = ENGINE === "sdk" || opts.engine === "sdk" ? "sdk" : "api";

  if (engine === "sdk") {
    // Deliberately no try/catch fallback to the API engine: if the SDK is not
    // authenticated this must fail loudly rather than quietly spend money on
    // the metered key the operator asked not to use.
    const { runAgentSdk } = await import("./agent-sdk");
    yield* runAgentSdk(opts, SYSTEM);
    return;
  }

  const model = MODELS.builder;
  // Effort is the sharpest cost lever we have: a first build is a blank-page
  // design problem and earns `high`, while a targeted tweak lands the same
  // result at `medium` for a fraction of the thinking tokens.
  const effort = opts.kind === "create" ? EFFORT.create : EFFORT.edit;

  const messages: Anthropic.MessageParam[] = [];
  for (const turn of opts.history) {
    messages.push({ role: turn.role, content: turn.content });
  }
  const requestText = `${describeFiles(opts.files)}\n\n--- Request ---\n${opts.request}`;
  if (opts.image) {
    messages.push({
      role: "user",
      content: [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: opts.image.mediaType as "image/png" | "image/jpeg" | "image/webp",
            data: opts.image.data,
          },
        },
        {
          type: "text",
          text: `${requestText}\n\n(A reference image is attached above — use it as visual/style guidance for the site.)`,
          cache_control: { type: "ephemeral" },
        },
      ],
    });
  } else {
    // Cache breakpoint on the file tree.
    //
    // This message carries describeFiles() — every source file, in full. It is
    // IDENTICAL on every turn of a build (the loop only appends assistant and
    // tool_result messages after it), so without a breakpoint the entire tree
    // was re-sent at full input price on all 8 possible turns.
    //
    // Only the system prompt was cached before. Measured on a real build:
    // cache reads were 34% of cost and uncached input just 0.3%, i.e. the
    // caching that exists works — it simply was not applied to the largest
    // repeated block in the request.
    //
    // This matters most for the Pro foundations (lib/foundations/): a ~30k-token
    // foundation costs ~88 credits per build cached and ~363 uncached, which is
    // MORE than having the model write it from scratch. The breakpoint is the
    // difference between the foundation idea working and being a net loss.
    //
    // Below the model's minimum cacheable prefix the breakpoint is ignored
    // rather than erroring, so a tiny project is unaffected.
    messages.push({
      role: "user",
      content: [{ type: "text", text: requestText, cache_control: { type: "ephemeral" } }],
    });
  }

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
      const input = use.input as {
        path?: string;
        content?: string;
        query?: string;
        kind?: string;
        limit?: number;
      };

      // Handled before the path check below — this is the one tool that takes
      // no path, and running it through normalizePath would reject it outright.
      if (use.name === "find_assets") {
        yield { type: "progress", text: "Picking out icons and artwork" };
        const matches = findAssets(input.query ?? "", {
          kind: input.kind as AssetKind | undefined,
          limit: Math.min(Math.max(input.limit ?? 6, 1), 12),
        });
        results.push({
          type: "tool_result",
          tool_use_id: use.id,
          content: formatMatchesForTool(matches),
        });
        continue;
      }

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

      // Narrate before applying, so the line appears while the write is
      // happening rather than after it lands.
      const line = narrateTool(use.name, { path });
      if (line) yield { type: "progress", text: line };

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
