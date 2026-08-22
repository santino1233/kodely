import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getCurrentUser } from "@/lib/auth";
import { averageBuildCredits, getBalance } from "@/lib/credits";
import { billingEnabled } from "@/lib/stripe";
import { AppShell } from "@/components/app/AppShell";

// Every page in the group reads the session, so none of it can ever be
// statically rendered. Being explicit keeps that intentional rather than
// incidental.
export const dynamic = "force-dynamic";

/* ONE title convention for the whole portal. Before this, two pages set
   "X — Kodely" by hand, two set a bare "X", and the remaining seven set no
   metadata at all — so /dashboard/billing rendered the MARKETING homepage's
   "Kodely — AI Website Builder" in the browser tab. Putting the template on
   the group layout means a page declares only its own noun and cannot get the
   suffix wrong. Next requires `default` whenever `template` is set; it is what
   a portal page with no title of its own falls back to. */
export const metadata: Metadata = {
  title: { default: "Kodely", template: "%s — Kodely" },
};

/* The signed-in product shell: /dashboard/*, /settings, /support.
   Deliberately NOT wrapping /templates, /wizard, /pricing or /blog — those are
   public marketing pages with their own nav, and a signed-out visitor must
   still be able to read them. The portal has its own in-shell copies of the
   template gallery and the prompt entry for signed-in customers.

   The builder (/projects/[id]) is also outside this group on purpose: it is
   full-bleed chat + preview and a 248px rail would take a fifth of the
   customer's site preview to show navigation they are not using while
   building. It carries its own back-to-dashboard affordance instead.

   AUTH: this redirect is the primary gate, but every page below ALSO resolves
   the user itself. A layout does not re-render on every navigation within its
   own segment, and route handlers never sit under it at all — the same reason
   app/admin/layout.tsx says so in its own comment. */
export default async function PortalLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Three cheap reads, all needed by the rail's credits card, which is on
  // every screen. averageBuildCredits() falls back to a global constant for
  // someone with no history, which is fine here — the card only uses it to
  // phrase the balance as "about N builds", never to claim it is *your*
  // average. Pages that make that stronger claim gate it on a build count.
  const [balance, avgBuildCredits, jar] = await Promise.all([
    getBalance(user.id),
    averageBuildCredits(user.id),
    cookies(),
  ]);

  return (
    <AppShell
      initialCollapsed={jar.get("kodely-sidebar")?.value === "1"}
      user={{ email: user.email, name: user.name }}
      balance={balance}
      avgBuildCredits={avgBuildCredits}
      canTopUp={billingEnabled()}
    >
      {children}
    </AppShell>
  );
}
