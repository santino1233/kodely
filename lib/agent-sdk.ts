import { query } from "@anthropic-ai/claude-agent-sdk";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
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
// 1. USAGE IS REPORTED AS ZERO, honestly — there is no metered spend to
//    report. credits.ts therefore charges 0 credits per build, and /admin's
//    cost/margin dashboard reads zero across the board. That dashboard is the
//    instrument for "riskiest assumption #1" (can infra beat credit
//    economics), so while this engine is active that question cannot be
//    answered. Builds are tagged `claude-agent-sdk-subscription` so the zeros
//    are obviously explained rather than looking like a bug.
//
// 2. A Claude subscription is licensed for individual use. Running a private
//    testing period on it is one thing; serving real customers' generations
//    from it is another. Switch KODELY_ENGINE back to `api` before opening up.
//
// There is deliberately NO fallback to the API engine on failure: if the SDK
// is not authenticated this throws, rather than quietly spending money on the
// metered key that the operator asked not to use.

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
        systemPrompt,
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
        yield {
          type: "usage",
          // Tagged so zero-cost builds are self-explaining in /admin rather
          // than looking like broken telemetry.
          model: "claude-agent-sdk-subscription",
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        };
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
