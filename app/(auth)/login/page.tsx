import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

// Reading the session makes this route per-request, which /login was not
// before. That is the whole cost and it is paid on a page nobody indexes and
// nobody arrives at from search — unlike the marketing pages, where exactly
// this cost is the reason the nav resolves its two links from a cookie hint
// instead. See components/marketing/MarketingNav.
export const dynamic = "force-dynamic";

/**
 * A signed-in visitor who lands on /login — from a bookmark, from browser
 * autocomplete, from a link in an old email — was shown "Welcome back, sign
 * in to keep building" and a password field for the account they are already
 * inside. Now they are sent onward.
 *
 * To /continue rather than to /dashboard, and that is the whole subtlety.
 * The homepage prompt box stashes what someone typed in sessionStorage and
 * throws them at the auth wall (see PromptHero and lib/pending-prompt), and
 * /continue is the page that already knows how to pick that up and turn it
 * into a project — it is where the Google callback lands for the same
 * reason. Redirecting straight to /dashboard here would silently drop a
 * prompt someone had just written.
 *
 * The check is getCurrentUser(), not the hint cookie, ON PURPOSE. A hint can
 * be stale — a session revoked from another device still leaves one behind —
 * and a stale hint driving a redirect is a loop: /login bounces you to the
 * portal, the portal bounces you back to /login. Asking the database means
 * "signed in" here and "signed in" there are the same answer.
 */
export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/continue");
  return <LoginForm />;
}
