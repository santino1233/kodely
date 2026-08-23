"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut } from "lucide-react";

/** A directly visible sign-out control, sitting in SidebarFooter's icon row
    next to the theme toggle. UserMenu already has "Sign out" inside its
    dropdown, but a control that only appears after opening a menu isn't a
    sign-out BUTTON — this is the one that is. Both call the same route; there
    is only one way to actually sign out, just two ways to reach it. */
export function SignOutButton({ collapsed }: { collapsed: boolean }) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={signingOut}
      aria-label={signingOut ? "Signing out…" : "Sign out"}
      title="Sign out"
      className={[
        "k-focus grid shrink-0 place-items-center rounded-md text-ink-2",
        "transition-colors duration-[var(--t-1)] hover:bg-danger-tint hover:text-danger",
        "disabled:pointer-events-none disabled:opacity-50",
        collapsed ? "mx-auto size-8" : "size-8",
      ].join(" ")}
    >
      <LogOut className="size-4" />
    </button>
  );
}
