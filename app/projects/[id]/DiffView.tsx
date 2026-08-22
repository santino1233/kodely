"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { BuildDiff, FileDiff, Hunk } from "./diff";

// What one build changed, file by file and line by line.
//
// HONESTY NOTE, and it is the whole reason the copy in here is worded the way
// it is: by the time anyone can look at this screen the build has already
// written to the database and the preview is already showing the new site.
// This is NOT an approval gate. There is no state in which the change is
// pending. So the two controls are "Undo this build" — which restores the
// previous checkpoint, a new write, not a cancellation — and "Close", which
// does nothing at all because there is nothing to accept. Calling those
// "Approve" and "Reject" would describe a mechanism that does not exist.
//
// Accessibility:
//  - the +/- gutter marker is real text, not colour and not aria-hidden, so a
//    screen reader reads "plus <line>" and the add/remove distinction does not
//    live in the pixels alone. Line numbers ARE hidden, because reading two
//    numbers before every line makes the diff unlistenable.
//  - each file is a disclosure button with aria-expanded/aria-controls.
//  - no aria-live anywhere in this file. The editor already has exactly one
//    live region (the build progress line) and a second one competing with it
//    is a bug this file has been bitten by before.

/** Expand everything up front only while the whole diff is small enough to scan. */
const AUTO_EXPAND_LINES = 400;

function statusLabel(status: FileDiff["status"]): string {
  return status === "added" ? "Added" : status === "removed" ? "Removed" : "Changed";
}

function countLabel(file: FileDiff): string {
  if (file.status === "added") return `${file.added} line${file.added === 1 ? "" : "s"}`;
  if (file.status === "removed") return `${file.removed} line${file.removed === 1 ? "" : "s"}`;
  return `+${file.added} −${file.removed}`;
}

function FileCounts({ file }: { file: FileDiff }) {
  return (
    <span className="flex shrink-0 items-center gap-2 text-[0.75rem]">
      <span className="text-ink-3">{statusLabel(file.status)}</span>
      <span
        className={`k-num ${
          file.status === "removed"
            ? "text-danger"
            : file.status === "added"
              ? "text-ok"
              : "text-ink-2"
        }`}
      >
        {countLabel(file)}
      </span>
    </span>
  );
}

function HunkBlock({ hunk }: { hunk: Hunk }) {
  return (
    <div className="border-t border-hair">
      <div
        className="k-num bg-surface-2 px-3 py-1 font-mono text-[0.6875rem] text-ink-3"
        aria-hidden="true"
      >
        @@ −{hunk.aStart},{hunk.aCount} +{hunk.bStart},{hunk.bCount} @@
      </div>
      {/* k-scroll-x: a long source line scrolls inside its own box so the page
          body never scrolls sideways. */}
      <div className="k-scroll-x">
        {hunk.lines.map((line, i) => (
          <div
            key={i}
            className={`flex min-w-max font-mono text-[0.71rem] leading-[1.45] ${
              line.op === "add"
                ? "bg-ok-tint text-ok"
                : line.op === "remove"
                  ? "bg-danger-tint text-danger"
                  : "text-ink-2"
            }`}
          >
            <span
              aria-hidden="true"
              className="k-num w-10 shrink-0 pr-2 text-right text-ink-3 select-none"
            >
              {line.a ?? ""}
            </span>
            <span
              aria-hidden="true"
              className="k-num w-10 shrink-0 pr-2 text-right text-ink-3 select-none"
            >
              {line.b ?? ""}
            </span>
            {/* Read out loud. This is the only non-visual carrier of "added"
                vs "removed", so it must not be hidden from assistive tech. */}
            <span className="w-4 shrink-0 select-none">
              {line.op === "add" ? "+" : line.op === "remove" ? "−" : " "}
            </span>
            <span className="whitespace-pre pr-4">{line.text === "" ? " " : line.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DiffView({
  diff,
  onUndo,
  undoUnavailable,
  undoing,
  onClose,
}: {
  diff: BuildDiff;
  /** Restore the previous checkpoint. Null when that is not a truthful offer. */
  onUndo: (() => void) | null;
  /** Why undo is not offered, when it is not. Shown verbatim. */
  undoUnavailable: string | null;
  undoing: boolean;
  onClose: () => void;
}) {
  const total = diff.files.reduce(
    (sum, f) => sum + f.hunks.reduce((n, h) => n + h.lines.length, 0),
    0,
  );
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(total <= AUTO_EXPAND_LINES ? diff.files.map((f) => f.path) : []),
  );

  function toggle(path: string) {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  const added = diff.files.reduce((n, f) => n + f.added, 0);
  const removed = diff.files.reduce((n, f) => n + f.removed, 0);

  return (
    // The scroll container is the wrapper Editor.tsx puts this in, which also
    // owns the loading and error branches — one scroller for all three states.
    <div className="p-4 sm:p-6">
      <div className="mx-auto max-w-3xl">
        <h2 className="k-h1 text-ink">What this build changed</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{diff.build.prompt}</p>
        <p className="k-num mt-1 text-[0.75rem] text-ink-3">
          <time dateTime={diff.build.createdAt}>
            {new Date(diff.build.createdAt).toLocaleString()}
          </time>
          {diff.previous && (
            <>
              {" · compared against the checkpoint from "}
              <time dateTime={diff.previous.createdAt}>
                {new Date(diff.previous.createdAt).toLocaleString()}
              </time>
            </>
          )}
        </p>

        {/* The two states where "what changed" cannot be answered as a change
            set. Both show the whole tree; only one of them is normal. */}
        {diff.previousPruned && (
          <p className="mt-3 rounded-lg border border-warn/40 bg-warn-tint px-3 py-2 text-[0.75rem] leading-relaxed text-warn">
            The earlier checkpoint&rsquo;s files have been cleared to save storage, so there is
            nothing left to compare against. Everything below is the tree as it stood after this
            build, not the change this build made.
          </p>
        )}
        {!diff.previous && !diff.previousPruned && (
          <p className="mt-3 text-[0.75rem] leading-relaxed text-ink-3">
            This is the first checkpoint of the project, so every file counts as new.
          </p>
        )}

        <p className="k-num mt-3 text-[0.75rem] text-ink-3">
          {diff.files.length === 0
            ? "No file changed."
            : `${diff.files.length} file${diff.files.length === 1 ? "" : "s"} · +${added} −${removed} lines`}
        </p>

        {/* Says plainly what this screen is and is not. The board card asked for
            approve/reject before applying; there is no before. */}
        <div className="mt-3 rounded-lg border border-hair bg-surface p-3 shadow-e1">
          <Badge tone="ok" dot>
            Already applied
          </Badge>
          <p className="mt-2 text-[0.75rem] leading-relaxed text-ink-2">
            This build has already been applied — the draft and the preview are showing it now.
            Undoing does not cancel it and does not refund its credits; it writes the previous
            checkpoint back over the draft, which you can reverse again with Redo.
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <Button
              size="xs"
              onClick={() => onUndo?.()}
              disabled={onUndo === null}
              loading={undoing}
            >
              Undo this build
            </Button>
            <Button size="xs" variant="ghost" onClick={onClose}>
              Close
            </Button>
          </div>
          {onUndo === null && undoUnavailable && (
            <p className="mt-1.5 text-[0.6875rem] leading-relaxed text-ink-3">{undoUnavailable}</p>
          )}
        </div>

        <ul className="mt-4 space-y-2">
          {diff.files.map((file, i) => {
            const panelId = `kodely-diff-panel-${i}`;
            const expanded = open.has(file.path);
            return (
              <li
                key={file.path}
                className="overflow-hidden rounded-lg border border-hair bg-surface"
              >
                {/* A truncated file has nothing to disclose, so it gets a plain
                    heading rather than a dead disclosure button — aria-expanded
                    on something that can never expand is a lie to a screen
                    reader, and a disabled control invites a click that does
                    nothing. */}
                {file.truncated ? (
                  <div className="flex w-full items-center justify-between gap-3 px-3 py-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <span aria-hidden="true" className="w-3 shrink-0" />
                      <span className="truncate font-mono text-[0.75rem] text-ink">
                        {file.path}
                      </span>
                    </span>
                    <FileCounts file={file} />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => toggle(file.path)}
                    aria-expanded={expanded}
                    aria-controls={panelId}
                    className="k-focus flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors duration-[var(--t-1)] hover:bg-surface-2"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span aria-hidden="true" className="w-3 shrink-0 text-[0.75rem] text-ink-3">
                        {expanded ? "▾" : "▸"}
                      </span>
                      <span className="truncate font-mono text-[0.75rem] text-ink">
                        {file.path}
                      </span>
                    </span>
                    <FileCounts file={file} />
                  </button>
                )}

                {file.approximate && (
                  <p className="border-t border-hair px-3 py-1.5 text-[0.6875rem] leading-relaxed text-warn">
                    Too much of this file changed to match it line by line, so the changed block is
                    shown as removed-then-added rather than aligned.
                  </p>
                )}
                {file.truncated && (
                  <p className="border-t border-hair px-3 py-1.5 text-[0.6875rem] leading-relaxed text-ink-3">
                    Too large to show line by line. The counts above are exact; the full file is in
                    the Code view.
                  </p>
                )}

                {/* The panel element exists whether or not it is open, so
                    `aria-controls` above always resolves to a real id. Its
                    CONTENT is mounted only while expanded, which is what keeps
                    a large diff off the initial render. */}
                {!file.truncated && (
                  <div id={panelId} hidden={!expanded}>
                    {expanded && file.hunks.map((hunk, h) => <HunkBlock key={h} hunk={hunk} />)}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
