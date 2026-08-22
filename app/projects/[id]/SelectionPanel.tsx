"use client";

import { Button } from "@/components/ui/Button";
import { type SelectedElement, type SelectionMove } from "./preview-agent";

// What the editor shows about the element you clicked in the preview, and the
// controls for moving that selection around.
//
// Everything rendered here came out of the preview iframe, which runs
// GENERATED code. It is rendered as React children and never as HTML, and the
// agent already clamps every string it sends. Treat it as untrusted text.
//
// Movement is driven from here as well as inside the frame, because the frame
// only sees arrow keys while it has focus. These buttons keep the whole
// feature reachable from the editor's own tab order.

const MOVES: { dir: SelectionMove; label: string; title: string }[] = [
  { dir: "up", label: "Parent", title: "Select the element that contains this one" },
  { dir: "down", label: "Child", title: "Select the first element inside this one" },
  { dir: "prev", label: "Previous", title: "Select the previous sibling element" },
  { dir: "next", label: "Next", title: "Select the next sibling element" },
];

export default function SelectionPanel({
  selection,
  selectMode,
  ready,
  onMove,
  onClear,
  onUseInPrompt,
}: {
  selection: SelectedElement | null;
  selectMode: boolean;
  /** The preview has answered the handshake, so selection can actually work. */
  ready: boolean;
  onMove: (dir: SelectionMove) => void;
  onClear: () => void;
  onUseInPrompt: () => void;
}) {
  if (!ready && !selection) return null;

  if (!selection) {
    // Only shown while picking. With nothing selected there is nothing to say
    // that the toggle button hasn't already said.
    if (!selectMode) return null;
    return (
      <div className="mb-2 rounded-lg border border-hair bg-surface-2 px-3 py-2 text-[0.75rem] leading-relaxed text-ink-2">
        Click an element in the preview, or press Enter then use the arrow keys inside it.
      </div>
    );
  }

  const where = selection.section
    ? `Section ${selection.section.index} of ${selection.section.total}${
        selection.section.heading
          ? ` — ${selection.section.heading}`
          : selection.section.id
            ? ` — #${selection.section.id}`
            : ""
      }`
    : null;

  return (
    <div className="mb-2 rounded-lg border border-line-mid bg-surface p-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="k-label">Selected element</h2>
        <button
          type="button"
          onClick={onClear}
          className="k-focus rounded-xs px-1 text-[0.6875rem] text-ink-3 underline underline-offset-2 hover:text-ink"
        >
          Clear
        </button>
      </div>

      {/* One polite region for the whole summary. The build progress line is
          the only other live region on this screen and it cannot be active at
          the same time — the preview is veiled while a build runs and the
          Select toggle is disabled, so nothing can be selected then. */}
      <div aria-live="polite" className="mt-1.5">
        <p className="font-mono text-[0.75rem] text-ink">
          &lt;{selection.tag}&gt;
          {selection.id ? <span className="text-ink-3">#{selection.id}</span> : null}
        </p>
        {selection.text ? (
          <p className="mt-0.5 line-clamp-2 text-[0.75rem] text-ink-2">
            {selection.textIsOwn ? (
              <>“{selection.text}”</>
            ) : (
              // The words belong to elements inside this one, so they are
              // shown as context and not as something this element says.
              <>
                <span className="text-ink-3">Contains: </span>
                {selection.text}
              </>
            )}
          </p>
        ) : selection.alt ? (
          <p className="mt-0.5 text-[0.75rem] text-ink-2">Image — alt “{selection.alt}”</p>
        ) : selection.imgSrc ? (
          <p className="mt-0.5 text-[0.75rem] text-ink-2">Image</p>
        ) : (
          <p className="mt-0.5 text-[0.75rem] text-ink-3">No text content</p>
        )}
        {where && <p className="mt-0.5 text-[0.75rem] text-ink-3">{where}</p>}
        <p
          className="mt-0.5 truncate font-mono text-[0.6875rem] text-ink-3"
          title={selection.path}
        >
          {selection.path}
        </p>
        <p className="k-num mt-0.5 text-[0.6875rem] text-ink-3">
          {selection.rect.w}×{selection.rect.h} px
        </p>
      </div>

      <div role="group" aria-label="Move the selection" className="mt-2 flex flex-wrap gap-1">
        {MOVES.map((m) => (
          <Button
            key={m.dir}
            size="xs"
            variant="ghost"
            className="border border-hair"
            onClick={() => onMove(m.dir)}
            title={m.title}
          >
            {m.label}
          </Button>
        ))}
      </div>

      <Button size="xs" block variant="soft" className="mt-2" onClick={onUseInPrompt}>
        Describe a change to this
      </Button>
      {/* Says exactly what the button does. It does not edit anything by
          itself — the change still goes through a normal build. */}
      <p className="mt-1 text-[0.6875rem] leading-relaxed text-ink-3">
        Puts a reference to this element in the prompt box so you don’t have to describe where it
        is.
      </p>
    </div>
  );
}
