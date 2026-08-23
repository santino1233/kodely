"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Info } from "lucide-react";

/* A small explanation, kept OUT of the main flow until someone asks for it.
   Exists because several product pages had grown paragraph-long explanations
   sitting permanently in the page body ("Kodely's two billing rules, restated
   as arithmetic…") — accurate, but it made a scannable dashboard read like
   documentation. This moves that same accurate text behind one click instead
   of deleting it.

   Same interaction contract as Menu.tsx: click-outside and Escape both close
   it, and it is a real disclosure (aria-expanded + aria-controls), not a CSS
   :hover trick — a hover-only tooltip is unusable on touch and is gone the
   instant a cursor drifts, which is wrong for text someone is trying to read. */
export function InfoPopover({
  label,
  children,
  align = "start",
}: {
  /** Accessible name for the trigger, e.g. "How the spend cap works". */
  label: string;
  children: ReactNode;
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={id}
        aria-label={label}
        title={label}
        className="k-focus -m-1 grid size-6 shrink-0 place-items-center rounded-full text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
      >
        <Info className="size-3.5" aria-hidden />
      </button>
      {open && (
        <div
          id={id}
          role="dialog"
          aria-label={label}
          className={`k-msg-in absolute top-full z-30 mt-1.5 w-64 rounded-lg border border-line-mid bg-surface p-3 text-xs leading-relaxed text-ink-2 shadow-e3 ${
            align === "end" ? "right-0" : "left-0"
          }`}
        >
          {children}
        </div>
      )}
    </div>
  );
}
