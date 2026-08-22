"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// Cmd/Ctrl-K palette over the actions the editor already has. It invents no
// new capability — every entry is a button that exists somewhere in the
// header or the sidebar. The value is that the fastest path to any of them
// stops depending on knowing where it lives.
//
// Keyboard contract (this is the whole point of the feature, so it is
// deliberately explicit rather than left to the browser):
//  - focus moves into the filter input on open, and back to whatever had it
//    on close — synchronously, so a command that focuses something itself
//    (Focus prompt box) still wins the race.
//  - Tab is trapped inside the dialog; Escape closes it.
//  - Arrow keys move a virtual selection; the input keeps real focus and
//    aria-activedescendant points at the highlighted row, which is the
//    combobox pattern screen readers already understand.
//
// The component mounts only while open, so there is no open/closed state to
// reset — and the selection is stored as a command ID and resolved to an
// index during render, so a list that re-filters under the user cannot leave
// a stale index pointing at the wrong row.

export type Command = {
  id: string;
  label: string;
  /** Extra words that should match the filter but need not be shown. */
  keywords?: string;
  /** Right-aligned hint — a real key combination, or a state note. */
  hint?: string;
  disabled?: boolean;
  /** Why it is unavailable. Shown in place of the hint on a dimmed row. */
  disabledReason?: string;
  run: () => void;
};

export type CommandGroup = { heading: string; commands: Command[] };

function matches(cmd: Command, query: string): boolean {
  if (!query) return true;
  const haystack = `${cmd.label} ${cmd.keywords ?? ""}`.toLowerCase();
  // Every whitespace-separated term must appear somewhere — "pub site" finds
  // "Publish site" without needing the words adjacent.
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}

export default function CommandPalette({
  onClose,
  groups,
}: {
  /** Closes the palette. Restoring focus is the caller's job, because the
      caller is the only one that knows what had focus before it opened —
      and it must happen before `run`, so a command that moves focus wins. */
  onClose: (run?: () => void) => void;
  groups: CommandGroup[];
}) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Flattened, filtered, still carrying the heading each row sits under so the
  // list can render groups without a second pass over the source data.
  const rows = useMemo(() => {
    const out: { heading: string | null; cmd: Command }[] = [];
    for (const group of groups) {
      const hits = group.commands.filter((c) => matches(c, query));
      hits.forEach((cmd, i) => out.push({ heading: i === 0 ? group.heading : null, cmd }));
    }
    return out;
  }, [groups, query]);

  // Derived, never stored: if the highlighted command filtered itself out (or
  // just became unavailable), the highlight falls to the first row that can
  // actually run, so Enter is never a no-op.
  const firstEnabled = rows.findIndex((r) => !r.cmd.disabled);
  const held = rows.findIndex((r) => r.cmd.id === selectedId && !r.cmd.disabled);
  const selected = held >= 0 ? held : firstEnabled;

  function highlight(index: number) {
    setSelectedId(rows[index]?.cmd.id ?? null);
    listRef.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: "nearest" });
  }

  function move(delta: number) {
    if (rows.length === 0) return;
    const start = selected < 0 ? (delta > 0 ? -1 : rows.length) : selected;
    for (let step = 1; step <= rows.length; step++) {
      const next = (start + delta * step + rows.length * step) % rows.length;
      if (!rows[next].cmd.disabled) {
        highlight(next);
        return;
      }
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    // The same chord that opened it closes it, and closes it the proper way —
    // through onClose, so focus goes back where it came from.
    if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key === "Tab") {
      // Only the input and the close button are tabbable, so cycling between
      // them is the entire trap — focus can never reach the page behind.
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'input, button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      move(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      move(-1);
    } else if (e.key === "Home") {
      e.preventDefault();
      highlight(firstEnabled);
    } else if (e.key === "End") {
      e.preventDefault();
      for (let i = rows.length - 1; i >= 0; i--) {
        if (!rows[i].cmd.disabled) {
          highlight(i);
          break;
        }
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      const row = rows[selected];
      if (row && !row.cmd.disabled) onClose(row.cmd.run);
    }
  }

  // Last-resort Escape. Everything above binds the keyboard to the dialog
  // subtree, and the editor unbinds its own global shortcuts while the palette
  // is open — so IF focus ever ends up outside the dialog, Escape has nobody
  // listening at all and the modal cannot be dismissed from the keyboard.
  // That was verified in the browser by moving focus out and pressing Escape:
  // before this listener the palette stayed open, after it the palette closes.
  // An undismissable modal is a bad enough failure to be worth the second
  // lock even though the mousedown pin below should prevent getting there.
  // This fires only when the dialog's own handler didn't: that one calls
  // stopPropagation, which stops the native event before it reaches window —
  // also verified, by checking Escape from inside still closes exactly once.
  useEffect(() => {
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [onClose]);

  const activeId = selected >= 0 && rows[selected] ? `kodely-cmd-${rows[selected].cmd.id}` : undefined;

  return (
    <div
      // The same scrim `Modal` paints on its native ::backdrop, so the two
      // dialog surfaces in the product sit on the same ground.
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/45 backdrop-blur-sm p-4 pt-[12vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="kodely-cmd-title"
        onKeyDown={onKeyDown}
        // Keydown is handled here, on the dialog, so it only ever arrives if
        // focus is INSIDE the dialog. That makes "the input keeps focus" load
        // bearing rather than cosmetic, and it is also precisely what the
        // combobox pattern requires: aria-activedescendant only means anything
        // while the input itself holds real focus.
        //
        // So any mousedown not aimed at the input has its default — the focus
        // change — cancelled. Click still fires: rows still run, the Esc
        // button still closes; the caret simply never leaves the filter box.
        //
        // Measured, so as not to overclaim: Chrome here did NOT blur the
        // previously focused element when a plain non-focusable div was
        // clicked, so this is not repairing an observed break in that browser.
        // Where exactly focus lands after clicking non-focusable chrome is a
        // long-standing point of difference between engines, and the failure
        // it would cause here is severe and silent (Escape stops closing, Tab
        // leaves the overlay). Pinning focus makes the outcome the same
        // everywhere instead of depending on that. The window-level Escape
        // listener above is the second, independent lock.
        onMouseDown={(e) => {
          if (e.target !== inputRef.current) e.preventDefault();
        }}
        className="flex w-full max-w-lg flex-col overflow-hidden rounded-xl border border-line-mid bg-surface shadow-e3"
      >
        <h2 id="kodely-cmd-title" className="sr-only">
          Command palette
        </h2>

        <div className="flex items-center gap-2 border-b border-hair px-3 py-2.5">
          <svg
            viewBox="0 0 24 24"
            aria-hidden
            className="size-4 shrink-0 text-ink-3"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.6-3.6" />
          </svg>
          <label htmlFor="kodely-cmd-input" className="sr-only">
            Search commands
          </label>
          {/* Not the `Input` primitive: that one is a labelled field with its
              own wrapper, hint slot and focus ring, and this is the bare text
              row of a combobox whose focus treatment belongs to the dialog. */}
          <input
            id="kodely-cmd-input"
            ref={inputRef}
            // Mounted only while open, so this is the whole of "focus the
            // input when the palette opens" — no effect required.
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command…"
            autoComplete="off"
            spellCheck={false}
            role="combobox"
            aria-expanded="true"
            aria-controls="kodely-cmd-list"
            aria-activedescendant={activeId}
            aria-describedby="kodely-cmd-help"
            className="k-focus min-w-0 flex-1 rounded-sm bg-transparent px-1 py-0.5 text-sm text-ink outline-none placeholder:text-ink-3"
          />
          <button
            type="button"
            onClick={() => onClose()}
            aria-label="Close command palette"
            className="k-focus k-num shrink-0 rounded-sm border border-hair px-1.5 py-0.5 font-sans text-[10px] text-ink-3 hover:bg-surface-2 hover:text-ink"
          >
            Esc
          </button>
        </div>

        <div
          id="kodely-cmd-list"
          ref={listRef}
          role="listbox"
          aria-label="Commands"
          className="max-h-80 overflow-y-auto p-1.5"
        >
          {rows.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-ink-3">
              No command matches “{query}”.
            </p>
          ) : (
            rows.map((row, i) => (
              <div key={row.cmd.id}>
                {row.heading && (
                  <div role="presentation" className="k-label px-2 pt-2.5 pb-1">
                    {row.heading}
                  </div>
                )}
                <div
                  id={`kodely-cmd-${row.cmd.id}`}
                  data-index={i}
                  role="option"
                  aria-selected={i === selected}
                  aria-disabled={row.cmd.disabled || undefined}
                  onMouseMove={() => {
                    if (!row.cmd.disabled && selected !== i) setSelectedId(row.cmd.id);
                  }}
                  onClick={() => {
                    if (!row.cmd.disabled) onClose(row.cmd.run);
                  }}
                  className={`flex cursor-default items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm ${
                    row.cmd.disabled
                      ? "text-ink-3 opacity-70"
                      : i === selected
                        ? "bg-brand-tint text-brand-ink dark:text-brand"
                        : "text-ink-2"
                  }`}
                >
                  <span className="min-w-0 truncate">{row.cmd.label}</span>
                  <span className="shrink-0 text-[0.6875rem] text-ink-3">
                    {row.cmd.disabled ? row.cmd.disabledReason : row.cmd.hint}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        <p
          id="kodely-cmd-help"
          className="border-t border-hair px-3 py-2 text-[0.6875rem] text-ink-3"
        >
          ↑↓ to move · Enter to run · Esc to close
        </p>
      </div>
    </div>
  );
}
