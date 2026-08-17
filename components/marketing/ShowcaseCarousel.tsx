const SITES = [
  { url: "roan-coffee", label: "Coffee shop", from: "from-amber-100", to: "to-amber-200", dark: "dark:from-amber-950 dark:to-amber-900" },
  { url: "harlan-law", label: "Law firm", from: "from-slate-100", to: "to-slate-200", dark: "dark:from-slate-900 dark:to-slate-800" },
  { url: "maren-lucas", label: "Photography", from: "from-stone-200", to: "to-stone-300", dark: "dark:from-stone-900 dark:to-stone-800" },
  { url: "flowtrack", label: "SaaS landing page", from: "from-blue-100", to: "to-blue-200", dark: "dark:from-blue-950 dark:to-blue-900" },
  { url: "mesa-verde", label: "Restaurant", from: "from-red-100", to: "to-orange-200", dark: "dark:from-red-950 dark:to-orange-900" },
  { url: "willow-co", label: "Hair salon", from: "from-rose-100", to: "to-rose-200", dark: "dark:from-rose-950 dark:to-rose-900" },
  { url: "northlane", label: "Agency", from: "from-indigo-100", to: "to-indigo-200", dark: "dark:from-indigo-950 dark:to-indigo-900" },
  { url: "founder-signal", label: "Podcast", from: "from-violet-100", to: "to-violet-200", dark: "dark:from-violet-950 dark:to-violet-900" },
  { url: "dana-reyes", label: "Personal site", from: "from-emerald-100", to: "to-emerald-200", dark: "dark:from-emerald-950 dark:to-emerald-900" },
  { url: "riverside-fund", label: "Nonprofit", from: "from-teal-100", to: "to-teal-200", dark: "dark:from-teal-950 dark:to-teal-900" },
];

function Card({ site }: { site: (typeof SITES)[number] }) {
  return (
    <div className="w-44 shrink-0 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-[var(--sh-s)] dark:border-neutral-800 dark:bg-neutral-950">
      <div className="flex items-center gap-1 border-b border-neutral-100 px-2.5 py-1.5 dark:border-neutral-900">
        <span className="h-1.5 w-1.5 rounded-full bg-neutral-300 dark:bg-neutral-700" />
        <span className="h-1.5 w-1.5 rounded-full bg-neutral-300 dark:bg-neutral-700" />
        <span className="h-1.5 w-1.5 rounded-full bg-neutral-300 dark:bg-neutral-700" />
        <span className="ml-1.5 truncate font-mono text-[9px] text-neutral-400 dark:text-neutral-600">
          {site.url}.kodely.site
        </span>
      </div>
      <div className={`flex h-16 items-center justify-center bg-gradient-to-br ${site.from} ${site.to} ${site.dark}`}>
        <span className="text-[11px] font-medium text-neutral-700 dark:text-neutral-300">{site.label}</span>
      </div>
    </div>
  );
}

/** A one-shot-fade-in, continuously scrolling row of example site categories —
 * an honest substitute for a "companies we work with" logo cloud, since
 * Kodely has no named customers to feature yet. Shows the range of real
 * SEO-content site types instead of fabricating logos. Pure CSS animation
 * (marquee keyframes in globals.css), auto-respects prefers-reduced-motion
 * via the existing global media query. */
export function ShowcaseCarousel() {
  const track = [...SITES, ...SITES];
  return (
    <div className="group relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
      <div className="flex w-max gap-4 [animation:marquee_38s_linear_infinite] group-hover:[animation-play-state:paused]">
        {track.map((site, i) => (
          <Card key={`${site.url}-${i}`} site={site} />
        ))}
      </div>
    </div>
  );
}
