"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Button, IconButton } from "./Button";
import { Input } from "./Field";

/* Built on the native <dialog>, not a portal + div. showModal() gives the
   focus trap, the inert background, the top-layer stacking and Escape for
   free — all four of which are what hand-rolled modals get wrong, and all
   four of which are the accessible behaviour rather than the look. */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Guard both directions: calling showModal() on an already-open dialog
    // throws InvalidStateError, and close() on a closed one fires a spurious
    // cancel/close event that would call onClose in a loop.
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  const width = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl" }[size];

  return (
    <dialog
      ref={ref}
      // `cancel` is Escape. Prevented and routed through onClose so the parent
      // stays the single owner of `open` — otherwise the dialog closes itself
      // and React re-opens it on the next render.
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClose={onClose}
      // Clicking the backdrop targets the dialog element itself; clicking
      // anything inside targets a descendant. That distinction is the whole
      // click-outside implementation.
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={`m-auto w-[calc(100vw-2rem)] ${width} rounded-xl border border-line-mid bg-surface p-0 text-ink shadow-e3 backdrop:bg-black/45 backdrop:backdrop-blur-sm`}
    >
      <div className="flex items-start justify-between gap-4 px-5 pt-5">
        <div className="min-w-0">
          <h2 className="k-h2 text-ink">{title}</h2>
          {description != null && (
            <p className="mt-1 text-[0.8125rem] leading-relaxed text-ink-2">{description}</p>
          )}
        </div>
        <IconButton label="Close" size="sm" onClick={onClose}>
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </IconButton>
      </div>
      {children != null && <div className="px-5 py-4 text-sm text-ink-2">{children}</div>}
      {footer != null && (
        <div className="flex justify-end gap-2 border-t border-hair bg-surface-2/50 px-5 py-3.5">
          {footer}
        </div>
      )}
    </dialog>
  );
}

/** Confirmation for a destructive action. The label of the confirm button is
    the verb, never "OK" — the customer should be able to read the button
    alone and know what is about to happen.

    `requireText` restores the type-the-name gate. It exists because the old
    hand-rolled delete dialog had one for published sites and the first pass of
    this redesign dropped it: deleting a published site takes a live address
    offline immediately and the slug returns to the pool, so it is genuinely
    unrecoverable, and a two-click confirm is not enough friction for that.
    Use it ONLY where the consequence is irreversible AND public — asking
    someone to type a name to dismiss a draft is theatre, and theatre trains
    people to type without reading. */
export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel,
  busy = false,
  requireText,
  requireTextLabel,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  busy?: boolean;
  /** Exact string the customer must type before confirm enables. */
  requireText?: string;
  /** Defaults to naming what they are typing. */
  requireTextLabel?: string;
}) {
  const [typed, setTyped] = useState("");

  // Trim only — never lowercase. Matching case-insensitively would accept a
  // near-miss, and the whole point is that they read the name character by
  // character before the button lights up.
  const satisfied = requireText == null || typed.trim() === requireText;

  const close = () => {
    setTyped("");
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={onConfirm}
            loading={busy}
            disabled={!satisfied}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {body}
      {requireText != null && (
        <div className="mt-4">
          <Input
            label={requireTextLabel ?? `Type ${requireText} to confirm`}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
          />
        </div>
      )}
    </Modal>
  );
}
