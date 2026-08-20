import type { ReactNode } from "react";

/** Matches Nxeon's real "btn-deploy" hover treatment (see globals.css there):
 * a slight lift, a one-shot shimmer sweep, and — for buttons whose
 * background is the brand gradient — the gradient itself shifting position
 * on hover (see the .btn-cta-gradient class, applied separately on the
 * gradient buttons themselves). Hover-only, not a constant background loop. */
export function ShineButton({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`group relative inline-block overflow-hidden rounded-lg transition-transform duration-200 ease-out hover:-translate-y-px ${className ?? ""}`}
    >
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
