import { query, type ModelUsage } from "@anthropic-ai/claude-agent-sdk";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AgentEvent, FileMap } from "./agent";

// Alternative generation engine, selected with KODELY_ENGINE=sdk.
//
// Instead of calling the metered Anthropic API with ANTHROPIC_API_KEY, this
// drives the Claude Agent SDK, which authenticates with the subscription that
// `claude setup-token` logged in on THIS MACHINE. Nothing is metered, so
// nothing is billed per build — the point of running it during the testing
// period.
//
// Two things to keep in view while this is switched on:
//
// 1. COSTS RECORDED HERE ARE IMPUTED, NOT BILLED. The token counts are real —
//    taken from the SDK's own modelUsage — but they are priced against the API
//    rate card to answer "what would this build have cost on metered billing?".
//    No money moves. That keeps the credit meter, the ledger and the margin
//    dashboard behaving exactly as they will on metered billing (so they can be
//    tested now), but /admin figures are a model, not a statement. See
//    meterUsage() below.
//
// 2. A Claude subscription is licensed for individual use. Running a private
//    testing period on it is one thing; serving real customers' generations
//    from it is another. Switch KODELY_ENGINE back to `api` before opening up.
//
// There is deliberately NO fallback to the API engine on failure: if the SDK
// is not authenticated this throws, rather than quietly spending money on the
// metered key that the operator asked not to use.

// The shared SYSTEM prompt is written for the API engine, which exposes
// custom `write_file` / `delete_file` tools. The SDK exposes its own
// Read/Write/Edit/Bash/Glob/Grep instead, so that sentence is not just
// useless here — it actively breaks generation: the agent announces it is
// building, reaches for a tool that does not exist, and the run ends having
// written nothing. (That is exactly what happened the first time this engine
// ran in prod.)
const API_TOOL_CONTRACT =
  "Use the write_file and delete_file tools. Always pass the complete final file — there is no patch tool.";

const SDK_TOOL_CONTRACT = [
  "You are editing a real checkout on disk in the working directory.",
  "- Use Write to create or replace a file, passing the complete final contents.",
  "- Use Edit for a targeted change to an existing file.",
  "- Use Read, Glob and Grep to inspect what is already there before changing it.",
  "- Delete a file with Bash (`rm`).",
  "There is no write_file or delete_file tool — those belong to a different engine.",
].join("\n");

/**
 * Adapt the shared prompt to the SDK's toolset.
 *
 * Throws if the expected sentence is missing rather than silently sending a
 * prompt that names tools the agent does not have — a silent mismatch here is
 * invisible until a generation quietly produces zero files.
 */
export function adaptPromptForSdk(system: string): string {
  if (!system.includes(API_TOOL_CONTRACT)) {
    throw new Error(
      "agent-sdk: the API tool-contract sentence was not found in SYSTEM. " +
        "It was probably reworded in lib/agent.ts — update API_TOOL_CONTRACT to match, " +
        "or the SDK engine will instruct the agent to call tools it does not have.",
    );
  }
  return system.replace(API_TOOL_CONTRACT, SDK_TOOL_CONTRACT);
}

// Hide the metered key from the SDK and everything it spawns.
//
// This runs at module load, and this module is only imported when
// KODELY_ENGINE=sdk (see lib/agent.ts), so nothing in this process wants the
// API key anyway. Doing it once here — rather than passing a constructed
// `env` to query() — matters: an explicit env REPLACES the child's
// environment, and under Next.js `process.env` is a proxy that does not
// enumerate the full OS environment. Rebuilding it from Object.entries()
// therefore dropped USERPROFILE/APPDATA, and the spawned Claude Code could no
// longer find ~/.claude/.credentials.json — it failed with "Not logged in"
// even on a machine that was logged in. Deleting one key and letting the
// child inherit normally avoids that entirely.
if (process.env.ANTHROPIC_API_KEY) delete process.env.ANTHROPIC_API_KEY;

function assertSdkCredentials(): void {
  // Two valid ways to authenticate, and a dev machine usually uses the second:
  //   1. CLAUDE_CODE_OAUTH_TOKEN — headless servers (the VM).
  //   2. ~/.claude/.credentials.json — written by an interactive
  //      `claude setup-token` login, which is what a workstation already has.
  // Requiring (1) unconditionally broke local development, where (2) is
  // present and perfectly sufficient.
  const home = process.env.HOME ?? process.env.USERPROFILE;
  const hasCredentialsFile =
    !!home && existsSync(path.join(home, ".claude", ".credentials.json"));

  if (!process.env.CLAUDE_CODE_OAUTH_TOKEN && !hasCredentialsFile) {
    throw new Error(
      "KODELY_ENGINE=sdk but no subscription credentials were found. " +
        "Either run `claude setup-token` as this user, or set " +
        "CLAUDE_CODE_OAUTH_TOKEN in the environment.",
    );
  }
}

/**
 * Map a raw model id from the SDK onto a key in MODEL_RATES.
 *
 * The SDK reports concrete ids ("claude-sonnet-5-20250929"), while the rate
 * card is keyed by family. Anything unrecognised is returned unchanged so
 * costMicros() falls through to its deliberately conservative `default` rate
 * — an unknown model should over-estimate, never under-bill.
 */
function toRateKey(model: string): string {
  const m = model.toLowerCase();
  if (m.includes("opus")) return "claude-opus-5";
  if (m.includes("sonnet")) return "claude-sonnet-5";
  if (m.includes("haiku")) return "claude-haiku-4-5";
  return model;
}

/**
 * Turn an SDK result into the usage event the charging path expects.
 *
 * IMPORTANT — what this cost means. On the subscription there is no metered
 * per-build charge, so this is an IMPUTED cost: the real tokens this build
 * consumed, priced at the API rate card. It is what the build WOULD have cost
 * on metered billing, not money that left an account.
 *
 * That is deliberately more useful than reporting zeros. Zeroed usage made
 * every SDK build cost exactly 1 credit (the floor) and flatlined the
 * cost/margin dashboard — which is the instrument for the board's "riskiest
 * assumption #1", whether infra can beat credit economics. With real token
 * counts the credit meter, the ledger and the margin view all behave exactly
 * as they will on metered billing, which is what makes them testable now.
 *
 * `modelUsage` is the field the SDK documents as correct for token accounting:
 * it spans the main loop plus subagents and internal calls, where `usage`
 * covers only the main loop. It is cumulative per query() call, so it is read
 * once from the final result rather than summed across results.
 */
function meterUsage(message: { modelUsage?: Record<string, ModelUsage> }): {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
} {
  const usage = message.modelUsage ?? {};
  const totals = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

  // The charging path takes ONE model string plus summed tokens, so attribute
  // the build to whichever model produced the most output tokens — output
  // dominates cost on every rate in the card. In practice Claude Code runs one
  // model for the main loop, so this is usually exact; when a cheap auxiliary
  // model also ran, its tokens are still counted, just priced at the main
  // model's rate. That errs toward over-billing, never under.
  let dominant = "";
  let mostOutput = -1;

  for (const [model, u] of Object.entries(usage)) {
    totals.inputTokens += u.inputTokens ?? 0;
    totals.outputTokens += u.outputTokens ?? 0;
    totals.cacheReadTokens += u.cacheReadInputTokens ?? 0;
    totals.cacheWriteTokens += u.cacheCreationInputTokens ?? 0;
    if ((u.outputTokens ?? 0) > mostOutput) {
      mostOutput = u.outputTokens ?? 0;
      dominant = u.canonicalModel ?? model;
    }
  }

  return {
    // No usage at all (a crashed or startup-error result) keeps the old
    // self-explaining tag, so a 1-credit build is visibly "no telemetry"
    // rather than looking like a genuinely free one.
    model: dominant ? toRateKey(dominant) : "claude-agent-sdk-subscription",
    ...totals,
  };
}

/** Reject path traversal and absolute paths before anything touches the DB. */
function safeRelPath(raw: string): string | null {
  const p = raw.trim().replace(/^\.?\//, "");
  if (!p || p.length > 200) return null;
  if (p.includes("..") || p.startsWith("/") || p.includes("\\")) return null;
  if (!/^[A-Za-z0-9._/-]+$/.test(p)) return null;
  return p;
}

async function writeFileMap(dir: string, files: FileMap) {
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, content, "utf8");
  }
}

async function readFileTree(dir: string, prefix = ""): Promise<FileMap> {
  const { readdir } = await import("node:fs/promises");
  const out: FileMap = {};
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name === "node_modules" || e.name === ".git" || e.name.startsWith(".")) continue;
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) Object.assign(out, await readFileTree(full, rel));
    else out[rel] = await readFile(full, "utf8");
  }
  return out;
}

type SdkOptions = {
  history: { role: "user" | "assistant"; content: string }[];
  request: string;
  files: FileMap;
  kind: "create" | "edit";
  image?: { mediaType: string; data: string };
  onWrite: (path: string, content: string) => Promise<boolean>;
  onDelete: (path: string) => Promise<boolean>;
  signal?: AbortSignal;
};

export async function* runAgentSdk(
  opts: SdkOptions,
  systemPrompt: string,
): AsyncGenerator<AgentEvent> {
  // The SDK edits a real directory rather than calling tools over the wire,
  // so the project is materialised to a temp dir and diffed afterwards.
  assertSdkCredentials();
  const workDir = await mkdtemp(path.join(tmpdir(), "kodely-sdk-"));

  try {
    await writeFileMap(workDir, opts.files);

    let imageNote = "";
    if (opts.image) {
      const ext = opts.image.mediaType.split("/")[1] ?? "png";
      await writeFile(path.join(workDir, `.reference.${ext}`), Buffer.from(opts.image.data, "base64"));
      imageNote = `\n\nA reference image was attached to this request — Read the file .reference.${ext} in this directory to see it, then use it as visual/style guidance.`;
    }

    const historyText = opts.history.length
      ? `## Prior conversation on this project\n${opts.history
          .map((h) => `${h.role === "user" ? "User" : "You"}: ${h.content}`)
          .join("\n\n")}\n\n`
      : "";

    yield {
      type: "status",
      text: opts.kind === "create" ? "Building your site…" : "Applying your changes…",
    };

    for await (const message of query({
      prompt: `${historyText}## Current request\n${opts.request}${imageNote}`,
      options: {
        cwd: workDir,
        systemPrompt: adaptPromptForSdk(systemPrompt),
        allowedTools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
        permissionMode: "acceptEdits",
      },
    })) {
      if (opts.signal?.aborted) break;

      if (message.type === "assistant" && message.message?.content) {
        for (const block of message.message.content) {
          if ("text" in block && block.text) yield { type: "text", text: block.text };
        }
      } else if (message.type === "result") {
        yield { type: "usage", ...meterUsage(message) };
      }
    }

    if (opts.signal?.aborted) return;

    // Diff the directory back into write/delete events so the caller persists
    // exactly what the API engine would have produced.
    const after = await readFileTree(workDir);

    for (const [p, content] of Object.entries(after)) {
      if (p.startsWith(".reference.")) continue;
      const rel = safeRelPath(p);
      if (!rel) continue;
      if (opts.files[p] === content) continue; // unchanged
      if (await opts.onWrite(rel, content)) yield { type: "file", path: rel, action: "write" };
    }
    for (const p of Object.keys(opts.files)) {
      if (p in after) continue;
      const rel = safeRelPath(p);
      if (!rel) continue;
      if (await opts.onDelete(rel)) yield { type: "file", path: rel, action: "delete" };
    }
  } finally {
    // On Windows a just-exited child can hold the dir briefly (EBUSY); retry,
    // and never let cleanup failure mask a successful generation.
    try {
      await rm(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {}
  }
}
