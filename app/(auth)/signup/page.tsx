import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { SignupForm } from "./SignupForm";

// Per-request from here on, for the same reason and at the same cost as
// /login — see the note there.
export const dynamic = "force-dynamic";

/**
 * Same treatment as /login, and it matters slightly more here: /signup is
 * where PromptHero sends everyone who types into the homepage box, so a
 * signed-in visitor reaches it by the most ordinary route there is. Offering
 * them "create an account" — with a free-credits pitch for credits they
 * already have — is the version of this bug people would actually hit.
 *
 * /continue, not /dashboard, because that visitor may be arriving with a
 * prompt in sessionStorage that PromptHero just stashed. /continue turns it
 * into a project; /dashboard would throw it away.
 */
export default async function SignupPage() {
  if (await getCurrentUser()) redirect("/continue");
  return <SignupForm />;
}
