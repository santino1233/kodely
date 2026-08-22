"use client";

import { useSyncExternalStore } from "react";
import { readAuthHint } from "@/lib/auth-cookies";

/**
 * Whether the visitor looking at a marketing page is signed in.
 *
 * Two sources, in priority order, because the marketing site is not one kind
 * of page:
 *
 *   1. `fromServer` — passed down by the pages that are ALREADY rendered per
 *      request (/, /blog, /templates, /wizard, /status). Those pages call
 *      getCurrentUser(), so the answer is authoritative and it is already in
 *      the HTML: the correct nav is in the first paint and there is no flash.
 *
 *   2. The kodely_auth hint cookie — for the pages that are statically
 *      prerendered (/pricing, /contact, /legal/*, and the ISR blog posts).
 *      A prerendered page cannot read a cookie on the server by definition,
 *      so the swap happens in the browser, one paint late. That flash is the
 *      price of not forcing the entire SEO surface dynamic; see the note in
 *      MarketingNav.
 *
 * `fromServer` wins outright when present — including when it is `false`.
 * A page that asked the database and was told "signed out" must not be
 * overruled by a stale cookie.
 *
 * Deliberately built the same way ThemeToggle reads the theme class: this is
 * genuinely external state that React does not own and that is unknowable on
 * the server, which is exactly what useSyncExternalStore is for. The server
 * snapshot is `null` (not `false`), so the SSR pass and the hydration render
 * agree and there is no hydration mismatch to suppress.
 */
export function useSignedIn(fromServer?: boolean): boolean {
  const hinted = useSyncExternalStore<boolean | null>(
    subscribeToAuthHint,
    readHintFromDocument,
    hintUnknownOnServer,
  );
  return fromServer ?? hinted ?? false;
}

// document.cookie fires no event when it changes, so there is nothing to
// subscribe to directly. These three are the moments a stale answer actually
// becomes visible: coming back to a tab that was open while you signed out
// somewhere else (visibilitychange / focus), and a bfcache restore of a page
// rendered before the sign-out (pageshow). Between them they cover the
// realistic drift; a poll would cover the rest and is not worth a timer
// running on every marketing page for two nav links.
const HINT_EVENTS = ["pageshow", "visibilitychange", "focus"] as const;

function subscribeToAuthHint(onStoreChange: () => void) {
  for (const event of HINT_EVENTS) window.addEventListener(event, onStoreChange);
  return () => {
    for (const event of HINT_EVENTS) window.removeEventListener(event, onStoreChange);
  };
}

const readHintFromDocument = () => readAuthHint(document.cookie);
const hintUnknownOnServer = () => null;
