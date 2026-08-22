"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

// The draft SOURCE tree, read-only.
//
// Read-only is not an omission: nothing in the product writes an arbitrary file
// back. /api/projects/[id] has no file-write method, the agent is the only
// thing that calls onWrite, and the two manual editors (Brand, SEO) each own a
// specific, validated slice of specific files. An editable textarea here would
// be a control with nowhere to save to.

export default function CodePanel({
  files,
  activeFile,
  onSelect,
  onDownload,
  downloading,
}: {
  files: Record<string, string>;
  activeFile: string | null;
  onSelect: (path: string) => void;
  onDownload: () => void;
  downloading: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const paths = Object.keys(files).sort();
  const content = activeFile != null ? files[activeFile] : undefined;

  async function copy() {
    if (content === undefined) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access can be refused outright (permissions, insecure
      // context). Silently leaving the label alone is the honest outcome —
      // claiming "Copied" when nothing was copied is the failure that matters.
    }
  }

  return (
    <div className="flex h-full min-h-0 bg-canvas">
      <div className="flex w-44 shrink-0 flex-col border-r border-hair bg-surface sm:w-56">
        <p className="k-label px-3 pt-3 pb-2">Draft source</p>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {paths.map((path) => (
            <button
              key={path}
              type="button"
              onClick={() => onSelect(path)}
              aria-current={activeFile === path || undefined}
              className={[
                "k-focus block w-full truncate rounded-md px-2 py-1.5 text-left font-mono text-[0.6875rem]",
                "transition-colors duration-[var(--t-1)]",
                activeFile === path
                  ? "bg-brand-tint font-medium text-brand-ink dark:text-brand"
                  : "text-ink-2 hover:bg-surface-2 hover:text-ink",
              ].join(" ")}
            >
              {path}
            </button>
          ))}
        </div>
        <div className="border-t border-hair p-2">
          <Button size="xs" block onClick={onDownload} loading={downloading}>
            Download .zip
          </Button>
        </div>
      </div>

      <div className="relative min-w-0 flex-1 overflow-y-auto bg-inset">
        {content !== undefined && activeFile != null ? (
          <>
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-hair bg-surface/95 px-3 py-2 backdrop-blur-sm">
              <span className="truncate font-mono text-[0.75rem] text-ink-2">{activeFile}</span>
              <Button size="xs" variant="ghost" className="border border-hair" onClick={copy}>
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            {/* k-scroll-x, so a long line scrolls inside its own box and the
                page body never scrolls sideways. */}
            <pre className="k-scroll-x p-4 text-[0.6875rem] leading-relaxed text-ink-2">
              <code>{content}</code>
            </pre>
          </>
        ) : (
          <div className="grid h-full place-items-center p-6">
            <EmptyState
              kind="empty"
              title="Pick a file"
              body="These are the source files Kodely writes. They’re read-only here — ask for a change in the chat and Kodely edits them."
            />
          </div>
        )}
      </div>
    </div>
  );
}
