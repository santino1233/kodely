"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

type ToastTone = "ok" | "danger" | "info";
type Toast = { id: number; tone: ToastTone; message: string; action?: { label: string; onClick: () => void } };

const ToastContext = createContext<((t: Omit<Toast, "id">) => void) | null>(null);

/** Throws rather than no-oping if the provider is missing: a toast that
    silently fails to appear turns "your site was deleted" into no feedback at
    all, which is worse than a crash in development. */
export function useToast() {
  const push = useContext(ToastContext);
  if (!push) throw new Error("useToast must be used inside <ToastProvider>");
  return push;
}

const ICON: Record<ToastTone, ReactNode> = {
  ok: (
    <svg viewBox="0 0 24 24" className="size-4 text-ok" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m4 12.5 5 5L20 7" />
    </svg>
  ),
  danger: (
    <svg viewBox="0 0 24 24" className="size-4 text-danger" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M12 7v6M12 17v.01" />
      <circle cx="12" cy="12" r="9" strokeWidth="2" />
    </svg>
  ),
  info: (
    <svg viewBox="0 0 24 24" className="size-4 text-info" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M12 11v6M12 7v.01" />
      <circle cx="12" cy="12" r="9" strokeWidth="2" />
    </svg>
  ),
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = ++seq.current;
      setToasts((list) => [...list, { ...t, id }]);
      // Errors and toasts carrying an action stay put. An auto-dismissing
      // "Undo" is a control the customer can lose the race against.
      if (t.tone !== "danger" && t.action == null) {
        timers.current.set(id, setTimeout(() => dismiss(id), 4200));
      }
    },
    [dismiss],
  );

  // Clearing on unmount matters in the builder, which mounts and unmounts
  // panels while a build is in flight. The ref is read INSIDE the effect —
  // reading `.current` during render is what the refs lint rule forbids, and
  // it would also capture a stale map if the provider ever remounted.
  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        // polite, not assertive: a toast reports a completed action and should
        // wait for the screen reader to finish what it is saying.
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-4 sm:items-end"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="k-msg-in pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border border-line-mid bg-surface p-3 shadow-e3"
          >
            <span className="mt-0.5 shrink-0">{ICON[t.tone]}</span>
            <p className="flex-1 text-[0.8125rem] leading-snug text-ink">{t.message}</p>
            {t.action != null && (
              <button
                type="button"
                className="k-focus shrink-0 rounded-sm text-[0.8125rem] font-medium text-brand hover:underline"
                onClick={() => {
                  t.action?.onClick();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
            <button
              type="button"
              aria-label="Dismiss"
              className="k-focus -m-1 shrink-0 rounded-sm p-1 text-ink-3 hover:text-ink"
              onClick={() => dismiss(t.id)}
            >
              <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="m6 6 12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
