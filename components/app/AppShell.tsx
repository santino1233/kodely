"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { ToastProvider } from "@/components/ui/Toast";
import { MobileNav } from "./MobileNav";
import { Sidebar } from "./Sidebar";

/* Collapse is persisted in a COOKIE, and its initial value is read on the
   server in app/(portal)/layout.tsx. localStorage is only readable after
   hydration, which would render a collapsed sidebar at full width and snap it
   narrow on every page load — the one animation nobody asked for. */
const COOKIE = "kodely-sidebar";
const YEAR = 60 * 60 * 24 * 365;

/* The frame every portal page renders inside. Pages supply content only — no
   page owns its own navigation, header chrome or toast host, which is what
   let the old portal drift into several unrelated header treatments.

   Collapse state lives HERE rather than inside Sidebar, because the main
   column's left offset has to move with the rail. When it lived in the
   sidebar the rail animated and the content stayed put, leaving a widening
   gap for the duration of the transition. */
export function AppShell({
  children,
  initialCollapsed,
  user,
  balance,
  avgBuildCredits,
  canTopUp,
}: {
  children: ReactNode;
  initialCollapsed: boolean;
  user: { email: string; name: string | null };
  balance: number;
  /** Their measured average build cost, used to phrase the balance as builds. */
  avgBuildCredits: number;
  /** billingEnabled(). False hides the top-up affordance rather than offering
      a button whose checkout call would come back 503. */
  canTopUp: boolean;
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${COOKIE}=${next ? "1" : "0"};path=/;max-age=${YEAR};samesite=lax`;
  };

  return (
    <ToastProvider>
      <div className="k-shell min-h-dvh bg-canvas" data-collapsed={collapsed}>
        <Sidebar
          collapsed={collapsed}
          onToggle={toggle}
          user={user}
          balance={balance}
          avgBuildCredits={avgBuildCredits}
          canTopUp={canTopUp}
        />
        <MobileNav
          user={user}
          balance={balance}
          avgBuildCredits={avgBuildCredits}
          canTopUp={canTopUp}
        />
        {/* Both the rail's width and this offset read --shell-sidebar, so they
            animate off one value and cannot tear mid-transition. */}
        <div className="transition-[padding] duration-[var(--t-2)] ease-[var(--ease)] lg:pl-[var(--shell-sidebar)]">
          {/* pb-24 on small screens keeps the last row clear of the fixed
              bottom bar; without it the final card is permanently half-hidden
              and reads as a rendering bug. */}
          <main className="mx-auto w-full max-w-[1400px] px-4 pt-6 pb-24 sm:px-6 lg:px-8 lg:pt-8 lg:pb-14">
            {children}
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
