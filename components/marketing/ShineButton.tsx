import type { ReactNode } from "react";

/** Wraps a solid CTA button/link in a static frame with a bright white
 * sheen that sweeps across only on hover (not a constant background loop —
 * user explicitly asked to match the hover-only pattern used on Nxeon,
 * not an always-on ambient animation). Purely decorative (aria-hidden,
 * pointer-events-none) so it never interferes with the click target
 * underneath. */
export function ShineButton({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={`group relative inline-block overflow-hidden rounded-lg ${className ?? ""}`}>
      {children}
      <span
        aria-hidden
        className="btn-shine pointer-events-none absolute inset-y-0 left-[-40%] w-1/3 -skew-x-12 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
        style={{
          background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.85), transparent)",
          filter: "blur(2px)",
        }}
      />
    </span>
  );
}
