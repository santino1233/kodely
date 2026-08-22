"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";

export type MenuItem =
  | { kind: "separator" }
  | { kind: "label"; label: string }
  | {
      kind: "item";
      label: string;
      icon?: ReactNode;
      href?: string;
      onSelect?: () => void;
      danger?: boolean;
      disabled?: boolean;
      /** Shown greyed with this sentence as the reason. Prefer this over
          silently hiding an action the customer is looking for. */
      unavailableReason?: string;
    };

/* Hand-rolled rather than a headless-UI dependency: the product ships no
   component library and adding one for a single dropdown is a poor trade.
   What it does implement, because these are the parts that are actually
   load-bearing and are what a hand-rolled menu usually skips:
     - Escape closes and returns focus to the trigger
     - ArrowUp/Down/Home/End move a roving focus
     - a pointerdown listener outside the menu closes it
     - aria-expanded / aria-haspopup / role=menu wiring
   It does NOT implement collision detection against the viewport; instead the
   caller picks a side, and `align` covers the two cases the product has. */
export function Menu({
  trigger,
  items,
  align = "end",
  className = "",
}: {
  trigger: (props: {
    ref: React.Ref<HTMLButtonElement>;
    onClick: () => void;
    "aria-expanded": boolean;
    "aria-haspopup": "menu";
    "aria-controls": string;
  }) => ReactNode;
  items: MenuItem[];
  align?: "start" | "end";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    // pointerdown, not click: a click listener fires after the target's own
    // handler, so clicking a second menu's trigger would open it and then this
    // would close nothing useful, leaving both states out of step.
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (listRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    // Move focus into the menu so the keyboard path works from the first press.
    listRef.current?.querySelector<HTMLElement>("[data-menu-item]")?.focus();
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const onListKeyDown = (e: React.KeyboardEvent) => {
    const focusable = Array.from(
      listRef.current?.querySelectorAll<HTMLElement>("[data-menu-item]:not([aria-disabled='true'])") ?? [],
    );
    if (focusable.length === 0) return;
    const i = focusable.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => {
      e.preventDefault();
      focusable[(n + focusable.length) % focusable.length]?.focus();
    };
    if (e.key === "ArrowDown") go(i + 1);
    else if (e.key === "ArrowUp") go(i - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(focusable.length - 1);
  };

  return (
    <div className={`relative ${className}`}>
      {trigger({
        ref: triggerRef,
        onClick: () => setOpen((v) => !v),
        "aria-expanded": open,
        "aria-haspopup": "menu",
        "aria-controls": id,
      })}
      {open && (
        <div
          ref={listRef}
          id={id}
          role="menu"
          onKeyDown={onListKeyDown}
          className={[
            "k-msg-in absolute z-50 mt-1.5 min-w-52 overflow-hidden rounded-lg border border-line-mid",
            "bg-surface p-1 shadow-e3",
            align === "end" ? "right-0" : "left-0",
          ].join(" ")}
        >
          {items.map((item, idx) => {
            if (item.kind === "separator") {
              return <div key={idx} role="separator" className="my-1 h-px bg-hair" />;
            }
            if (item.kind === "label") {
              return (
                <div key={idx} className="k-label px-2.5 pt-2 pb-1.5">
                  {item.label}
                </div>
              );
            }
            const blocked = item.disabled || item.unavailableReason != null;
            const cls = [
              "k-focus flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[0.8125rem]",
              blocked
                ? "cursor-not-allowed text-ink-3"
                : item.danger
                  ? "text-danger hover:bg-danger-tint"
                  : "text-ink hover:bg-surface-2",
            ].join(" ");
            const body = (
              <>
                {item.icon != null && <span className="shrink-0 text-ink-3">{item.icon}</span>}
                <span className="flex-1 truncate">{item.label}</span>
                {item.unavailableReason != null && (
                  <span className="shrink-0 text-[0.6875rem] text-ink-3">
                    {item.unavailableReason}
                  </span>
                )}
              </>
            );
            if (item.href != null && !blocked) {
              return (
                <Link
                  key={idx}
                  href={item.href}
                  role="menuitem"
                  data-menu-item
                  className={cls}
                  onClick={() => setOpen(false)}
                >
                  {body}
                </Link>
              );
            }
            return (
              <button
                key={idx}
                type="button"
                role="menuitem"
                data-menu-item
                aria-disabled={blocked || undefined}
                className={cls}
                onClick={() => {
                  if (blocked) return;
                  setOpen(false);
                  item.onSelect?.();
                }}
              >
                {body}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
