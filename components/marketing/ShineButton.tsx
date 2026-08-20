import type { ReactNode } from "react";

/** Wraps a solid CTA button/link in a static frame with a bright white
 * sheen that sweeps left-to-right on a slow loop with a pause between
 * passes — replaces the cursor-follow "magnetic" hover on the two primary
 * CTAs (nav "Get started", final "Start building" ) with an always-on
 * ambient glow instead of a hover-only movement effect. Purely decorative
 * (aria-hidden, pointer-events-none) so it never interferes with the
 * click target underneath. */
export function ShineButton({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={`relative inline-block overflow-hidden rounded-lg ${className ?? ""}`}>
      {children}
      <span
        aria-hidden
        className="btn-shine pointer-events-none absolute inset-y-0 w-1/3 -skew-x-12"
        style={{
          background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.85), transparent)",
          filter: "blur(2px)",
        }}
      />
    </span>
  );
}
