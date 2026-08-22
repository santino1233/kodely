"use client";

import Link from "next/link";
import { useSignedIn } from "./useSignedIn";

/**
 * The footer's account link, which has exactly the same problem the nav's
 * did: it said "Sign in" to everyone.
 *
 * A separate one-link client component rather than making MarketingFooter
 * itself a client component — the footer is otherwise entirely static markup
 * and there is no reason to ship it, the social icons and the year to the
 * browser as a component tree just to swap five characters. It takes the
 * same optional server-supplied `signedIn` as MarketingNav and falls back to
 * the same hint cookie; see useSignedIn.
 */
export function AuthLink({ signedIn, className }: { signedIn?: boolean; className?: string }) {
  const isSignedIn = useSignedIn(signedIn);
  return (
    <Link href={isSignedIn ? "/dashboard" : "/login"} className={className}>
      {isSignedIn ? "Portal" : "Sign in"}
    </Link>
  );
}
