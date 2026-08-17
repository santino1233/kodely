// The one real hero object — a miniature browser frame showing an actual
// example of what Kodely generates, not an abstract graphic or skeleton
// blocks. Static/hand-built (not a live iframe) so the homepage stays fast
// and never depends on a real project existing.
export function HeroMock() {
  return (
    <div className="mx-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-black/10 bg-white shadow-[0_40px_80px_-32px_rgba(0,0,0,0.25)] dark:border-white/10 dark:bg-neutral-900">
      <div className="flex items-center gap-2 border-b border-black/10 bg-black/[0.03] px-4 py-2.5 dark:border-white/10 dark:bg-white/[0.03]">
        <span className="h-2.5 w-2.5 rounded-full bg-black/15 dark:bg-white/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-black/15 dark:bg-white/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-black/15 dark:bg-white/15" />
        <div className="ml-3 flex-1 rounded-md bg-black/[0.04] px-3 py-1 text-center font-mono text-[11px] text-black/40 dark:bg-white/[0.06] dark:text-white/40">
          roan-coffee.kodely.site
        </div>
      </div>

      <div className="bg-[#fbf7f2] px-7 py-8 text-[#2a1f1a] dark:bg-[#1c1512] dark:text-[#f2e9e2]">
        <div className="mb-8 flex items-center justify-between">
          <span className="text-sm font-semibold tracking-tight">Roan Coffee</span>
          <div className="flex gap-4 text-xs text-[#6b5347] dark:text-[#c9b3a5]">
            <span>Menu</span>
            <span>Visit</span>
          </div>
        </div>
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#b5602f]">
          Birch Street, Portland
        </p>
        <h3 className="mt-2 text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">
          Small-batch coffee,
          <br />
          roasted weekly.
        </h3>
        <div className="mt-6 flex gap-3">
          <span className="rounded-lg bg-[#b5602f] px-4 py-2 text-xs font-medium text-white">See the menu</span>
          <span className="rounded-lg border border-[#b5602f]/30 px-4 py-2 text-xs font-medium text-[#b5602f]">
            Get directions
          </span>
        </div>
      </div>
    </div>
  );
}
