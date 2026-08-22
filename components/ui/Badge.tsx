import type { ReactNode } from "react";

export type Tone = "neutral" | "brand" | "ok" | "warn" | "danger" | "info";

const TONE: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-2 border-hair",
  brand: "bg-brand-tint text-brand-ink border-transparent dark:text-brand",
  ok: "bg-ok-tint text-ok border-transparent",
  warn: "bg-warn-tint text-warn border-transparent",
  danger: "bg-danger-tint text-danger border-transparent",
  info: "bg-info-tint text-info border-transparent",
};

const DOT: Record<Tone, string> = {
  neutral: "bg-ink-3",
  brand: "bg-brand",
  ok: "bg-ok",
  warn: "bg-warn",
  danger: "bg-danger",
  info: "bg-info",
};

/* Status has to survive being printed in greyscale and being looked at by
   someone who cannot separate the hues, so `dot` is not decoration — it is
   the second channel. Anything conveying live state should set it, and
   `pulse` marks the one state that is still changing. */
export function Badge({
  tone = "neutral",
  dot = false,
  pulse = false,
  children,
  className = "",
}: {
  tone?: Tone;
  dot?: boolean;
  pulse?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium whitespace-nowrap ${TONE[tone]} ${className}`}
    >
      {dot && (
        <span className="relative flex size-1.5">
          {pulse && (
            <span
              className={`absolute inline-flex size-full animate-ping rounded-full opacity-75 ${DOT[tone]}`}
            />
          )}
          <span className={`relative inline-flex size-1.5 rounded-full ${DOT[tone]}`} />
        </span>
      )}
      {children}
    </span>
  );
}
