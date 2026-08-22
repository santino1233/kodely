"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu as MenuIcon, X } from "lucide-react";
import { Logo } from "@/components/marketing/Logo";
import { isActive, MOBILE_BAR, NAV } from "./nav";
import { SidebarFooter } from "./SidebarFooter";
import { UserMenu } from "./UserMenu";

/* Phone navigation is deliberately NOT the sidebar squeezed narrow. It is two
   pieces with different jobs:
     - a BOTTOM BAR of the four things people do one-handed, always visible,
       thumb-reachable, no tap required to discover;
     - a DRAWER holding the complete navigation for the rarer destinations.
   The bottom bar is what makes the product feel like an app rather than a
   desktop page on a small screen. */
export function MobileNav({
  user,
  balance,
  avgBuildCredits,
  canTopUp,
}: {
  user: { email: string; name: string | null };
  balance: number;
  avgBuildCredits: number;
  canTopUp: boolean;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Navigating must close the drawer, otherwise it stays open over the page
  // the customer just asked for and reads as a broken tap. Done on the links'
  // own onClick rather than an effect watching `pathname`: setting state from
  // an effect runs a second render pass for something the click already knew,
  // and it also fires on a back-navigation the customer did not make here.

  // A drawer that scrolls the page behind it is the classic mobile bug.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <header className="sticky top-0 z-30 flex h-[var(--topbar-h)] items-center gap-3 border-b border-hair bg-surface/85 px-4 backdrop-blur-md lg:hidden">
        <Link href="/dashboard" aria-label="Kodely home" className="k-focus rounded-md">
          <Logo markSize={20} className="text-sm" />
        </Link>
        <span className="k-num ml-auto rounded-full bg-surface-2 px-2.5 py-1 text-xs text-ink-2">
          {balance.toLocaleString()} credits
        </span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open navigation"
          aria-expanded={open}
          className="k-focus -mr-1 rounded-md p-2 text-ink-2 hover:bg-surface-2 hover:text-ink"
        >
          <MenuIcon className="size-5" />
        </button>
      </header>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/45 backdrop-blur-sm"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="absolute inset-y-0 right-0 flex w-[min(19rem,85vw)] flex-col border-l border-hair bg-surface shadow-e3"
            style={{ animation: "k-msg-in 0.26s var(--ease) both" }}
          >
            <div className="flex h-[var(--topbar-h)] items-center justify-between px-4">
              <Logo markSize={20} className="text-sm" />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close navigation"
                className="k-focus -mr-1 rounded-md p-2 text-ink-2 hover:bg-surface-2 hover:text-ink"
              >
                <X className="size-5" />
              </button>
            </div>
            <nav aria-label="All sections" className="flex-1 overflow-y-auto px-3 pb-4">
              {NAV.map((group) => (
                <div key={group.title} className="mb-5">
                  <p className="k-label mb-1.5 px-2">{group.title}</p>
                  <ul className="flex flex-col gap-0.5">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const active = isActive(item, pathname);
                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            aria-current={active ? "page" : undefined}
                            onClick={() => setOpen(false)}
                            className={[
                              "k-focus flex items-center gap-3 rounded-md px-2.5 py-2.5 text-sm font-medium",
                              active
                                ? "bg-brand-tint text-brand-ink dark:text-brand"
                                : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                            ].join(" ")}
                          >
                            <Icon className="size-4 shrink-0" strokeWidth={1.9} />
                            <span className="truncate">{item.label}</span>
                            {item.soon && (
                              <span className="ml-auto rounded-full bg-surface-3 px-1.5 py-0.5 text-[0.625rem] text-ink-3">
                                Soon
                              </span>
                            )}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </nav>
            {/* Same footer as the desktop rail, so the credits card, the
                theme switch and the bug/idea link are in the same place on
                both — one product, two widths. */}
            <SidebarFooter
              balance={balance}
              avgBuildCredits={avgBuildCredits}
              canTopUp={canTopUp}
              collapsed={false}
            />
            <UserMenu user={user} balance={balance} collapsed={false} />
          </div>
        </div>
      )}

      {/* Bottom bar. `pb-[env(safe-area-inset-bottom)]` keeps it clear of the
          iOS home indicator, which otherwise sits on top of the labels. */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-hair bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
      >
        {MOBILE_BAR.map((item) => {
          const Icon = item.icon;
          const active = isActive(item, pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={[
                "k-focus flex flex-col items-center gap-1 py-2.5 text-[0.625rem] font-medium",
                active ? "text-brand" : "text-ink-3",
              ].join(" ")}
            >
              <Icon className="size-5" strokeWidth={active ? 2.2 : 1.8} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
