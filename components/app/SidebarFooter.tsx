"use client";

import Link from "next/link";
import { Bug, Lightbulb, Moon, Sun, Zap } from "lucide-react";
import { Menu } from "@/components/ui/Menu";

/* The bottom of the rail, above the account row. Three things live here
   because all three are "about the product rather than about your sites":
   how much you can still build, switching the theme, and telling us something
   is wrong.

   The credits card is the ONE place in the whole product where the brand
   gradient is used as a large fill. It earns that because the number on it is
   the thing that governs what the customer can do next — and because the
   original design direction called for exactly this card. Everywhere else the
   gradient is reserved for the primary button. */
export function SidebarFooter({
  balance,
  avgBuildCredits,
  canTopUp,
  collapsed,
}: {
  balance: number;
  /** Their own measured average, or the global fallback. Used only to phrase
      the balance as builds, which is what people actually plan in. */
  avgBuildCredits: number;
  canTopUp: boolean;
  collapsed: boolean;
}) {
  // No progress bar and no percentage: there is no allowance for this to be a
  // fraction OF. Credits are bought in packs and never expire, so a bar would
  // have to invent a denominator — which is the single most tempting lie on
  // this screen. The number and what it buys is the whole truth.
  const builds = avgBuildCredits > 0 ? Math.floor(balance / avgBuildCredits) : 0;

  const report = (
    <Menu
      align="start"
      className={collapsed ? "" : "flex-1"}
      items={[
        { kind: "label", label: "Tell us something" },
        {
          kind: "item",
          label: "Report a bug",
          href: "/support?topic=bug",
          icon: <Bug className="size-3.5" />,
        },
        {
          kind: "item",
          label: "Request a feature",
          href: "/support?topic=feature",
          icon: <Lightbulb className="size-3.5" />,
        },
      ]}
      trigger={(props) => (
        <button
          {...props}
          type="button"
          title="Report a bug or request a feature"
          className={[
            "k-focus flex items-center gap-2 rounded-md py-1.5 text-[0.75rem] font-medium text-ink-2",
            "transition-colors duration-[var(--t-1)] hover:bg-surface-2 hover:text-ink",
            collapsed ? "w-full justify-center px-0" : "w-full px-2",
          ].join(" ")}
        >
          <Bug className="size-3.5 shrink-0" />
          {!collapsed && <span>Bug or idea</span>}
        </button>
      )}
    />
  );

  return (
    <div className="flex flex-col gap-1.5 px-2.5 pb-2">
      {collapsed ? (
        // Collapsed, the card would be an unreadable gradient square. The
        // balance still has to be reachable, so it becomes a link to Usage
        // with the number as its title.
        <Link
          href="/dashboard/usage"
          title={`${balance.toLocaleString()} credits`}
          aria-label={`${balance.toLocaleString()} credits remaining`}
          className="k-focus mx-auto grid size-9 place-items-center rounded-md text-white btn-cta-gradient"
        >
          <Zap className="size-4" />
        </Link>
      ) : (
        <Link
          href="/dashboard/usage"
          className="k-focus group relative block overflow-hidden rounded-lg p-3 text-white btn-cta-gradient shadow-e2"
        >
          <span className="flex items-baseline gap-1.5">
            <span className="k-num text-xl leading-none font-semibold">
              {balance.toLocaleString()}
            </span>
            <span className="text-[0.6875rem] opacity-90">credits</span>
          </span>
          <span className="mt-1 block text-[0.6875rem] leading-snug opacity-90">
            {balance <= 0
              ? "Out of credits — top up to build"
              : builds >= 1
                ? `About ${builds} more ${builds === 1 ? "build" : "builds"}`
                : "Not quite enough for a full build"}
          </span>
          {canTopUp && (
            <span className="mt-2 inline-block rounded-full bg-white/20 px-2 py-0.5 text-[0.625rem] font-medium">
              Top up
            </span>
          )}
        </Link>
      )}

      <div className={collapsed ? "flex flex-col gap-1" : "flex items-center gap-1"}>
        {report}
        <ThemeButton collapsed={collapsed} />
      </div>
    </div>
  );
}

function ThemeButton({ collapsed }: { collapsed: boolean }) {
  // Reads and writes the live <html> class, which the no-flash script in
  // app/layout.tsx set before React ran. Both glyphs are rendered and one is
  // hidden by CSS: the correct single icon is unknowable during SSR, and
  // rendering nothing until hydration makes the row jump.
  const toggle = () => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    document.documentElement.classList.toggle("light", !next);
    try {
      localStorage.setItem("kodely-theme", next ? "dark" : "light");
    } catch {}
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Switch between light and dark theme"
      title="Switch theme"
      className={[
        "k-focus grid shrink-0 place-items-center rounded-md text-ink-2",
        "transition-colors duration-[var(--t-1)] hover:bg-surface-2 hover:text-ink",
        collapsed ? "mx-auto size-8" : "size-8",
      ].join(" ")}
    >
      <Sun className="size-4 dark:hidden" />
      <Moon className="hidden size-4 dark:block" />
    </button>
  );
}
