import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Globe } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { ButtonLink } from "@/components/ui/Button";
import { SectionHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import WebsitesBrowser from "./WebsitesBrowser";
import { BUILD_STALE_MINUTES, loadWebsites, readWebsiteParams } from "./data";

export const dynamic = "force-dynamic";

// The "— Kodely" suffix comes from the title template on the (portal) layout.
export const metadata: Metadata = { title: "My Websites" };

/* /dashboard/websites — the management page.
 *
 * Server half: authorise, load, and decode the query string. Everything
 * interactive is in WebsitesBrowser. */
export default async function WebsitesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  // The (portal) layout already gates this, but a layout does not re-render on
  // every navigation within its own segment — every page under it resolves the
  // user itself. Same reasoning as app/admin/layout.tsx.
  if (!user) redirect("/login");

  const [sites, rawParams] = await Promise.all([loadWebsites(user.id), searchParams]);
  const initial = readWebsiteParams(rawParams);

  return (
    <>
      <SectionHeader as="h1"
        title="My Websites"
        description="Every site you've built. Covers are generated from each site's own colours — Kodely doesn't capture screenshots."
        // The page's single action, and its single `primary`. It replaced a
        // pair — this button plus a secondary "New site" that made a blank
        // project — which were two routes to the same job.
        action={
          <ButtonLink href="/dashboard/new" variant="primary" size="sm">
            Create Website
          </ButtonLink>
        }
      />

      {sites.length === 0 ? (
        /* No action here: "Create Website" is in the header directly above and
           is the one primary this page is allowed. */
        <EmptyState
          kind="empty"
          icon={<Globe className="size-8" aria-hidden />}
          title="No sites yet"
          body="Press Create Website above and describe what you want. Kodely builds a real React site for it, and your first one takes a couple of minutes."
        />
      ) : (
        <WebsitesBrowser sites={sites} initial={initial} staleMinutes={BUILD_STALE_MINUTES} />
      )}

      {/* The "About this page" list that used to sit here has gone. Three of
          its four facts were already stated where they are actually needed:
          "covers are generated, not screenshots" is in the SectionHeader
          description above, custom domains get a full unavailable panel on
          /dashboard/domains, and delete-is-permanent is said in the delete
          confirmation itself. The fourth — the "Building" staleness rule — was
          the only one with nowhere else to live, so it moved into
          WebsitesBrowser next to the status filter it explains. */}
    </>
  );
}
