"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeft, PanelLeftClose } from "lucide-react";
import { Logo, Mark } from "@/components/marketing/Logo";
import { isActive, NAV } from "./nav";
import type { NavItem } from "./nav";
import { SidebarFooter } from "./SidebarFooter";
import { UserMenu } from "./UserMenu";

/** Controlled by AppShell — see the note there for why the state is not
    owned here. */
export function Sidebar({
  collapsed,
  onToggle,
  user,
  balance,
  avgBuildCredits,
  canTopUp,
}: {
  collapsed: boolean;
  onToggle: () => void;
  user: { email: string; name: string | null };
  balance: number;
  avgBuildCredits: number;
  canTopUp: boolean;
}) {
  const pathname = usePathname();

  return (
    <aside
      // Reads the shell's custom property rather than branching on the prop:
      // one declaration, and the width interpolates instead of swapping.
      style={{ width: "var(--shell-sidebar)" }}
      className="fixed inset-y-0 left-0 z-40 hidden shrink-0 flex-col border-r border-hair bg-surface transition-[width] duration-[var(--t-2)] ease-[var(--ease)] lg:flex"
    >
      <div className="flex h-[var(--topbar-h)] items-center gap-2 px-3">
        <Link
          href="/dashboard"
          aria-label="Kodely home"
          className="k-focus flex min-w-0 items-center rounded-md px-1.5 py-1"
        >
          {/* Collapsed, only the mark. Both branches render the SAME <Mark>
              component (Logo is Mark + wordmark), so there is one source of
              truth for the brand shape and no second asset to keep in sync. */}
          {collapsed ? (
            <Mark size={22} />
          ) : (
            <Logo markSize={22} className="text-[0.9375rem]" />
          )}
        </Link>
        {!collapsed && (
          <button
            type="button"
            onClick={onToggle}
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
            // A bordered disc rather than a bare glyph: at the top corner of a
            // panel an unbordered icon reads as decoration, and people did not
            // find it.
            className="k-focus ml-auto grid size-7 shrink-0 place-items-center rounded-full border border-hair text-ink-3 transition-colors hover:border-line-mid hover:bg-surface-2 hover:text-ink"
          >
            <PanelLeftClose className="size-3.5" />
          </button>
        )}
      </div>

      {collapsed && (
        <button
          type="button"
          onClick={onToggle}
          aria-label="Expand sidebar"
          title="Expand sidebar"
          className="k-focus mx-auto mb-1 grid size-7 place-items-center rounded-full border border-hair text-ink-3 transition-colors hover:border-line-mid hover:bg-surface-2 hover:text-ink"
        >
          <PanelLeft className="size-3.5" />
        </button>
      )}

      <nav aria-label="Main" className="flex-1 overflow-y-auto px-2.5 pb-4">
        {NAV.map((group) => (
          <div key={group.title} className="mb-5">
            {/* The group heading disappears when collapsed but the grouping
                survives as spacing — the rhythm is what people navigate by
                once they know the product. */}
            {collapsed ? (
              <div className="mx-2 mb-2 h-px bg-hair" aria-hidden />
            ) : (
              <p className="k-label mb-1.5 px-2">{group.title}</p>
            )}
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => (
                <li key={item.href}>
                  <NavLink item={item} active={isActive(item, pathname)} collapsed={collapsed} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <SidebarFooter
        balance={balance}
        avgBuildCredits={avgBuildCredits}
        canTopUp={canTopUp}
        collapsed={collapsed}
      />
      <UserMenu user={user} collapsed={collapsed} />
    </aside>
  );
}

function NavLink({
  item,
  active,
  collapsed,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      // The title is the entire label when collapsed; without it the icon rail
      // is unusable for anyone who has not memorised the order.
      title={collapsed ? item.label : undefined}
      className={[
        // rounded-lg, not rounded-md: at this row height a softer corner is
        // what separates the Kodely rail from a stock admin sidebar, and it
        // matches the card radius the rest of the product uses.
        "k-focus group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[0.8125rem] font-medium",
        "transition-colors duration-[var(--t-1)]",
        collapsed ? "justify-center px-0" : "",
        active
          ? "bg-brand-tint text-brand-ink dark:text-brand"
          : "text-ink-2 hover:bg-surface-2 hover:text-ink",
      ].join(" ")}
    >
      {/* The active marker is a bar on the rail, not a filled pill alone —
          it survives being collapsed to icons, where a background tint on a
          square reads as a hover state rather than as "you are here". */}
      {active && (
        <span
          aria-hidden
          className="absolute top-1/2 -left-2.5 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand"
        />
      )}
      <Icon className="size-4 shrink-0" strokeWidth={active ? 2.25 : 1.9} />
      {!collapsed && (
        <>
          <span className="truncate">{item.label}</span>
          {item.soon && (
            <span className="ml-auto rounded-full bg-surface-3 px-1.5 py-0.5 text-[0.625rem] font-medium text-ink-3">
              Soon
            </span>
          )}
        </>
      )}
    </Link>
  );
}
