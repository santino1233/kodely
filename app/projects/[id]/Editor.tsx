"use client";

import { useRef, useState } from "react";
import Link from "next/link";

type Message = { role: string; content: string };
type BuildCheckpoint = { id: string; prompt: string; createdAt: string; filesWritten: number };

type Props = {
  projectId: string;
  projectName: string;
  slug: string;
  published: boolean;
  initialFiles: Record<string, string>;
  initialMessages: Message[];
  initialBalance: number;
};

const SITES_BASE = process.env.NEXT_PUBLIC_SITES_BASE ?? "kodely.site";

// Mirrors the publish route's own Host-based derivation (see the comment
// there) so the header's "live site" link always matches what publish
// actually returned, on staging or prod, without hardcoding either.
function liveSiteUrl(slug: string): string {
  if (typeof window === "undefined") return `https://${slug}.${SITES_BASE}`;
  const host = window.location.host;
  return host.includes("staging")
    ? `${window.location.origin}/api/site/${slug}`
    : `https://${slug}.${SITES_BASE}`;
}

export default function Editor(props: Props) {
  const [messages, setMessages] = useState<Message[]>(props.initialMessages);
  const [files, setFiles] = useState(props.initialFiles);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState(props.initialBalance);
  const [previewNonce, setPreviewNonce] = useState(0);
  const [published, setPublished] = useState(props.published);
  const [publishing, setPublishing] = useState(false);
  const [view, setView] = useState<"preview" | "code" | "history">("preview");
  const [builds, setBuilds] = useState<BuildCheckpoint[] | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const streamingReply = useRef("");

  async function openHistory() {
    setView("history");
    const res = await fetch(`/api/projects/${props.projectId}/builds`);
    const body = await res.json();
    setBuilds(body.builds ?? []);
  }

  async function restore(buildId: string) {
    if (!confirm("Restore this checkpoint? Your current draft will be replaced.")) return;
    setRestoring(buildId);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${props.projectId}/builds/${buildId}/restore`, {
        method: "POST",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Restore failed.");
      const res2 = await fetch(`/api/projects/${props.projectId}`);
      const body2 = await res2.json();
      const nextFiles: Record<string, string> = Object.fromEntries(
        (body2.project?.files ?? []).map((f: { path: string; content: string }) => [f.path, f.content]),
      );
      setFiles(nextFiles);
      setPreviewNonce((n) => n + 1);
      setView("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Restore failed.");
    } finally {
      setRestoring(null);
    }
  }

  // The foundation means source files are never empty — "first build" means
  // no chat history yet, matching the same signal the generate route uses.
  const isFirstBuild = messages.length === 0;

  async function send() {
    const text = prompt.trim();
    if (!text || busy) return;
    if (balance <= 0) {
      setError("You're out of credits. Top up to keep building.");
      return;
    }

    setBusy(true);
    setError(null);
    setStatus(isFirstBuild ? "Building your site…" : "Applying your changes…");
    setMessages((m) => [...m, { role: "user", content: text }]);
    setPrompt("");
    streamingReply.current = "";

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: props.projectId, prompt: text }),
      });

      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? "The build failed to start.");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let touchedFiles = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          if (!part.startsWith("data: ")) continue;
          const event = JSON.parse(part.slice(6));

          if (event.type === "text") {
            streamingReply.current += event.text;
          } else if (event.type === "file") {
            touchedFiles = true;
            setStatus(`${event.action === "write" ? "Writing" : "Removing"} ${event.path}`);
          } else if (event.type === "done") {
            setBalance(event.remaining);
            setStatus(null);
          } else if (event.type === "error") {
            throw new Error(event.message);
          }
        }
      }

      if (streamingReply.current.trim()) {
        setMessages((m) => [...m, { role: "assistant", content: streamingReply.current.trim() }]);
      }
      if (touchedFiles) {
        const res2 = await fetch(`/api/projects/${props.projectId}`);
        const body = await res2.json();
        const nextFiles: Record<string, string> = Object.fromEntries(
          (body.project?.files ?? []).map((f: { path: string; content: string }) => [f.path, f.content]),
        );
        setFiles(nextFiles);
        setPreviewNonce((n) => n + 1);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
      setStatus(null);
    }
  }

  async function publish() {
    setPublishing(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${props.projectId}/publish`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Publish failed.");
      setPublished(true);
      window.open(body.url, "_blank");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publish failed.");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-4 py-2.5 dark:border-white/10">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-sm text-black/50 hover:text-black dark:text-white/50 dark:hover:text-white">
            ←
          </Link>
          <span className="text-sm font-medium">{props.projectName}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 rounded-lg border border-black/10 p-0.5 text-xs dark:border-white/10">
            <button
              onClick={() => setView("preview")}
              className={`rounded-md px-2 py-1 ${view === "preview" ? "bg-black text-white dark:bg-white dark:text-black" : "text-black/60 dark:text-white/60"}`}
            >
              Preview
            </button>
            <button
              onClick={() => {
                setView("code");
                setActiveFile((f) => f ?? Object.keys(files)[0] ?? null);
              }}
              className={`rounded-md px-2 py-1 ${view === "code" ? "bg-black text-white dark:bg-white dark:text-black" : "text-black/60 dark:text-white/60"}`}
              disabled={isFirstBuild}
            >
              Code
            </button>
            <button
              onClick={openHistory}
              className={`rounded-md px-2 py-1 ${view === "history" ? "bg-black text-white dark:bg-white dark:text-black" : "text-black/60 dark:text-white/60"}`}
              disabled={isFirstBuild}
            >
              History
            </button>
          </div>
          <span className="text-xs text-black/50 dark:text-white/50">{balance} credits</span>
          {published && (
            <a
              href={liveSiteUrl(props.slug)}
              target="_blank"
              className="text-xs text-black/50 underline hover:text-black dark:text-white/50 dark:hover:text-white"
            >
              live site ↗
            </a>
          )}
          <button
            onClick={publish}
            disabled={publishing || isFirstBuild}
            className="rounded-lg bg-black px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40 dark:bg-white dark:text-black"
          >
            {publishing ? "Publishing…" : published ? "Republish" : "Publish"}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex w-96 shrink-0 flex-col border-r border-black/10 dark:border-white/10">
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 0 && (
              <p className="text-sm text-black/50 dark:text-white/50">
                Describe the site you want. Be specific — audience, purpose, tone.
              </p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "text-sm" : "text-sm text-black/70 dark:text-white/70"}>
                <div className="mb-0.5 text-xs font-medium text-black/40 dark:text-white/40">
                  {m.role === "user" ? "You" : "Kodely"}
                </div>
                <div className="whitespace-pre-wrap">{m.content}</div>
              </div>
            ))}
            {status && <div className="text-xs text-black/40 dark:text-white/40">{status}</div>}
            {error && <div className="text-xs text-red-600">{error}</div>}
          </div>
          <div className="border-t border-black/10 p-3 dark:border-white/10">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={isFirstBuild ? "e.g. A landing page for a coffee roastery in Portland" : "Describe a change…"}
              rows={3}
              className="w-full resize-none rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/40 dark:border-white/15 dark:focus:border-white/40"
            />
            <button
              onClick={send}
              disabled={busy || !prompt.trim()}
              className="mt-2 w-full rounded-lg bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-black"
            >
              {busy ? "Building…" : isFirstBuild ? "Build site" : "Apply change"}
            </button>
          </div>
        </div>

        <div className="min-w-0 flex-1 bg-black/[0.02] dark:bg-white/[0.02]">
          {view === "preview" && (
            <iframe
              key={previewNonce}
              src={`/api/preview/${props.projectId}?v=${previewNonce}`}
              sandbox="allow-scripts allow-forms"
              className="h-full w-full border-0 bg-white"
              title="Live preview"
            />
          )}

          {view === "code" && (
            <div className="flex h-full">
              <div className="w-48 shrink-0 overflow-y-auto border-r border-black/10 p-2 dark:border-white/10">
                {Object.keys(files).map((path) => (
                  <button
                    key={path}
                    onClick={() => setActiveFile(path)}
                    className={`block w-full truncate rounded-md px-2 py-1.5 text-left text-xs ${
                      activeFile === path
                        ? "bg-black/10 font-medium dark:bg-white/10"
                        : "text-black/60 hover:bg-black/5 dark:text-white/60 dark:hover:bg-white/5"
                    }`}
                  >
                    {path}
                  </button>
                ))}
              </div>
              <div className="min-w-0 flex-1 overflow-auto">
                {activeFile && files[activeFile] !== undefined ? (
                  <div className="relative">
                    <button
                      onClick={() => navigator.clipboard.writeText(files[activeFile])}
                      className="absolute right-3 top-3 rounded-md border border-black/15 bg-white px-2 py-1 text-xs dark:border-white/15 dark:bg-black"
                    >
                      Copy
                    </button>
                    <pre className="p-4 text-xs leading-relaxed">
                      <code>{files[activeFile]}</code>
                    </pre>
                  </div>
                ) : (
                  <p className="p-4 text-sm text-black/50 dark:text-white/50">Select a file.</p>
                )}
              </div>
            </div>
          )}

          {view === "history" && (
            <div className="h-full overflow-y-auto p-4">
              {builds === null ? (
                <p className="text-sm text-black/50 dark:text-white/50">Loading…</p>
              ) : builds.length === 0 ? (
                <p className="text-sm text-black/50 dark:text-white/50">No checkpoints yet.</p>
              ) : (
                <ul className="space-y-2">
                  {builds.map((b) => (
                    <li
                      key={b.id}
                      className="flex items-center justify-between rounded-lg border border-black/10 px-3 py-2 dark:border-white/10"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm">{b.prompt}</div>
                        <div className="text-xs text-black/40 dark:text-white/40">
                          {new Date(b.createdAt).toLocaleString()} · {b.filesWritten} file{b.filesWritten === 1 ? "" : "s"} touched
                        </div>
                      </div>
                      <button
                        onClick={() => restore(b.id)}
                        disabled={restoring === b.id}
                        className="ml-3 shrink-0 rounded-md border border-black/15 px-2 py-1 text-xs disabled:opacity-50 dark:border-white/15"
                      >
                        {restoring === b.id ? "Restoring…" : "Restore"}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
