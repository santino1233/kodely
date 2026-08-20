import { Scale, TrendingUp, UtensilsCrossed, Camera, Building2, Coffee } from "lucide-react";

// Illustrative example brands (the same fictional businesses used elsewhere
// on the site), styled as a logo row — Kodely has no real named customers
// yet, so this is deliberately an "example businesses" strip, not a claimed
// customer-logo wall.
const LOGOS = [
  { name: "Harlan & Cole", Icon: Scale, tracking: "tracking-tight" },
  { name: "FlowTrack", Icon: TrendingUp, tracking: "tracking-tight" },
  { name: "Mesa Verde", Icon: UtensilsCrossed, tracking: "tracking-wide" },
  { name: "Maren Lucas", Icon: Camera, tracking: "tracking-wide" },
  { name: "Northlane Digital", Icon: Building2, tracking: "tracking-tight" },
  { name: "Roan Coffee", Icon: Coffee, tracking: "tracking-wide" },
];

function LogoRow({ ariaHidden = false }: { ariaHidden?: boolean }) {
  return (
    <div className="flex shrink-0 items-center gap-14 pr-14" aria-hidden={ariaHidden}>
      {LOGOS.map(({ name, Icon, tracking }) => (
        <span
          key={name}
          className={`flex items-center gap-2.5 whitespace-nowrap text-lg font-semibold text-neutral-400 opacity-70 grayscale transition-all hover:opacity-100 hover:grayscale-0 dark:text-neutral-600 ${tracking}`}
        >
          <Icon size={20} strokeWidth={1.6} />
          {name}
        </span>
      ))}
    </div>
  );
}

/** Infinite sliding strip of illustrative example-business wordmarks — an
 * honest stand-in for a "companies we work with" logo cloud (see LogoCarousel
 * usage note in page.tsx). Two copies of the row placed back to back and
 * translated by exactly -50% gives a seamless loop with the existing
 * `marquee` keyframe. Fades at both edges so logos don't hard-clip. */
export function LogoCarousel() {
  return (
    <div
      className="relative mx-auto w-full max-w-5xl overflow-hidden"
      style={{
        maskImage: "linear-gradient(90deg, transparent, black 10%, black 90%, transparent)",
        WebkitMaskImage: "linear-gradient(90deg, transparent, black 10%, black 90%, transparent)",
      }}
    >
      <div className="flex w-max motion-safe:animate-[marquee_26s_linear_infinite]">
        <LogoRow />
        <LogoRow ariaHidden />
      </div>
    </div>
  );
}
