import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { TEMPLATE_CATEGORIES, TEMPLATES } from "@/lib/templates";
import { TemplateBriefs } from "./TemplateBriefs";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Templates",
};

/* The in-shell template browser.
   ──────────────────────────────
   `/templates` is the PUBLIC marketing gallery and is untouched by this page:
   it has its own nav, its own reveal animations, and it has to work for a
   signed-out visitor. This is the signed-in copy — same 22 prompts out of
   lib/templates.ts, but rendered in the product's surface and handing off to
   /dashboard/new instead of through the signup wall.

   TEMPLATES is a module constant, so there is nothing to await and nothing
   that can fail; the only reason this page is dynamic is the session read. */
export default async function PortalTemplatesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return <TemplateBriefs templates={TEMPLATES} categories={TEMPLATE_CATEGORIES} />;
}
