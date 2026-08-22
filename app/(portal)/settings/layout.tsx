import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getCurrentUser } from "@/lib/auth";
import { Avatar } from "@/components/ui/Avatar";
import SettingsNav from "./SettingsNav";

// Every section reads the session. Explicit, for the same reason the portal
// layout is: nothing here can ever be statically rendered.
export const dynamic = "force-dynamic";

/* The Settings frame: identity, sub-navigation, and the column the sections
   render into. AppShell already supplies the page background, padding and the
   toast host, so this adds a heading and a width and nothing else.

   AUTH: this redirect is not the only gate. Every section below resolves the
   user itself, because a layout does not re-render on navigation within its
   own segment — the same rule app/(portal)/layout.tsx states for the portal. */
export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="mx-auto w-full max-w-3xl">
      <header className="mb-5 flex items-center gap-3">
        <Avatar name={user.name} email={user.email} size={44} />
        <div className="min-w-0">
          <h1 className="k-h1 text-ink">Settings</h1>
          <p className="truncate text-sm text-ink-2">{user.email}</p>
        </div>
      </header>

      <SettingsNav />

      <div className="mt-6 flex flex-col gap-5">{children}</div>
    </div>
  );
}
