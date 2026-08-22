import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { estimateCredits, getBalance, getSpendCapStatus } from "@/lib/credits";
import { billingEnabled } from "@/lib/stripe";
import { getTemplate } from "@/lib/templates";
import { CreateFlow } from "./CreateFlow";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Create a website",
};

/* The prompt moment, inside the shell.
   ────────────────────────────────────
   Deliberately not laid out as a dashboard page: no stat row, no section
   headers, no cards full of numbers. One heading, one box, and the honest
   price of pressing the button. Everything the customer might reach for
   instead — a written brief, the wizard, a reference image — is a quiet
   control under the box rather than a competing panel beside it.

   `?template=<id>` pre-fills the box from lib/templates.ts. The text is
   ordinary editable content once it lands there; nothing about the project
   that gets built is different because a template was used. */
export default async function CreateWebsitePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const templateId = typeof params.template === "string" ? params.template : null;
  const template = templateId !== null ? getTemplate(templateId) : undefined;

  const [balance, cap] = await Promise.all([getBalance(user.id), getSpendCapStatus(user.id)]);

  return (
    <CreateFlow
      initialPrompt={template?.prompt ?? ""}
      templateName={template?.name ?? null}
      credits={{
        balance,
        estimate: estimateCredits("create"),
        cap: {
          cap: cap.cap,
          spent: cap.spent,
          // `remaining` is Infinity when uncapped, which does not survive the
          // server/client boundary as a number worth rendering.
          remaining: Number.isFinite(cap.remaining) ? cap.remaining : null,
          reached: cap.reached,
        },
      }}
      // Offering "Top up" when Stripe is not configured would be a dead end.
      // The billing page is worth reaching either way — it is the credit
      // ledger, which is exactly what someone short of credits wants to read.
      canTopUp={billingEnabled()}
    />
  );
}
