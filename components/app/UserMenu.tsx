"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CreditCard, LogOut, Moon, Settings, Sun } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Menu } from "@/components/ui/Menu";

/* The bottom of the sidebar, directly under SidebarFooter's gradient credits
   card. This row used to repeat the balance a second time right underneath
   that card ("Name" / "1,234 credits") — the same number twice in a row read
   as a mistake, not as emphasis. This row's job is account identity (who's
   signed in, settings, sign out); the credits card above it already owns the
   balance. */
export function UserMenu({
  user,
  collapsed,
}: {
  user: { email: string; name: string | null };
  collapsed: boolean;
}) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  const signOut = async () => {
    setSigningOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  // Read off the live <html> class rather than React state — the no-flash
  // script in app/layout.tsx owns the theme and set it before React ran.
  const toggleTheme = () => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    document.documentElement.classList.toggle("light", !next);
    try {
      localStorage.setItem("kodely-theme", next ? "dark" : "light");
    } catch {}
  };

  const display = user.name?.trim() || user.email.split("@")[0];

  return (
    <div className="border-t border-hair p-2.5">
      <Menu
        align="start"
        className="w-full"
        items={[
          { kind: "label", label: user.email },
          {
            kind: "item",
            label: "Settings",
            href: "/settings",
            icon: <Settings className="size-3.5" />,
          },
          {
            kind: "item",
            label: "Billing & credits",
            href: "/dashboard/billing",
            icon: <CreditCard className="size-3.5" />,
          },
          { kind: "separator" },
          {
            kind: "item",
            label: "Switch theme",
            onSelect: toggleTheme,
            // Both glyphs, dimmed/undimmed by the theme itself in CSS: the
            // correct single icon is unknowable during SSR, and rendering
            // nothing until hydration makes the row jump.
            icon: (
              <span className="relative block size-3.5">
                <Sun className="absolute inset-0 size-3.5 dark:hidden" />
                <Moon className="absolute inset-0 hidden size-3.5 dark:block" />
              </span>
            ),
          },
          { kind: "separator" },
          {
            kind: "item",
            label: signingOut ? "Signing out…" : "Sign out",
            onSelect: signOut,
            danger: true,
            disabled: signingOut,
            icon: <LogOut className="size-3.5" />,
          },
        ]}
        trigger={(props) => (
          <button
            {...props}
            type="button"
            title={collapsed ? display : undefined}
            className={[
              "k-focus flex w-full items-center gap-2.5 rounded-md p-1.5 text-left",
              "transition-colors duration-[var(--t-1)] hover:bg-surface-2",
              collapsed ? "justify-center" : "",
            ].join(" ")}
          >
            <Avatar name={user.name} email={user.email} size={28} />
            {!collapsed && (
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.8125rem] font-medium text-ink">
                  {display}
                </span>
                <span className="block truncate text-[0.6875rem] text-ink-2">{user.email}</span>
              </span>
            )}
          </button>
        )}
      />
    </div>
  );
}
