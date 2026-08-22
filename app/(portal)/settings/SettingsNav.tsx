"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CreditCard, ShieldCheck, UserRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/* WHY REAL ROUTES AND NOT A CLIENT TAB COMPONENT
   ─────────────────────────────────────────────
   Each section is a Server Component with its own queries, and they are not
   cheap ones: Security counts and lists sessions and computes the deletion
   preview (eleven counts across nine tables), Credits aggregates 30 days of
   the ledger. A single page with client-side tabs would run all of that on
   every visit to Settings, to render one panel.

   Three more things fall out of using the router rather than useState:
   a section is linkable and survives a reload (the Discord OAuth callback
   redirects to /settings with an outcome in the query string, and it has to
   land somewhere specific); Back does what it looks like it does; and the
   only client JavaScript on the Account tab is the name field itself.

   This component is a Client Component solely to read the pathname for the
   active state — it holds no state of its own. */

type Tab = { href: string; label: string; icon: LucideIcon; exact?: boolean };

const TABS: Tab[] = [
  { href: "/settings", label: "Account", icon: UserRound, exact: true },
  { href: "/settings/credits", label: "Credits", icon: CreditCard },
  { href: "/settings/security", label: "Security", icon: ShieldCheck },
];

export default function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Settings sections" className="k-scroll-x -mx-1 px-1">
      <ul className="flex min-w-max items-center gap-1 border-b border-hair pb-px">
        {TABS.map((tab) => {
          const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
          const Icon = tab.icon;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={[
                  "k-focus relative -mb-px inline-flex items-center gap-2 rounded-t-md px-3 py-2.5 text-sm font-medium",
                  "border-b-2 transition-colors duration-[var(--t-1)]",
                  active
                    ? "border-brand text-ink"
                    : "border-transparent text-ink-2 hover:border-line-mid hover:text-ink",
                ].join(" ")}
              >
                <Icon className="size-4" aria-hidden />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
