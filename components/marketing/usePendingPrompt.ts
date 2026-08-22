"use client";

import { useSyncExternalStore } from "react";
import { PENDING_PROMPT_KEY } from "@/lib/pending-prompt";

// sessionStorage is external state that the server cannot see, so the
// "picking up where you left off" panel MUST NOT be in the server HTML —
// rendering it there would be a hydration mismatch. That is why the old code
// read it from an effect; useSyncExternalStore expresses the same guarantee
// without the post-paint cascading render the lint rule flags:
//
//   * getServerSnapshot() (null) is what React uses for the SSR pass AND for
//     the hydration render, so server and first client render agree.
//   * getSnapshot() is only consulted once hydration has committed.
//
// The value is a string (or null), so React's Object.is comparison is stable
// and this can't loop.
const NEVER_CHANGES = () => () => {};

function readPendingPrompt() {
  try {
    return sessionStorage.getItem(PENDING_PROMPT_KEY);
  } catch {
    // Private-mode / blocked storage — same swallow as the original code.
    return null;
  }
}

const noPendingPromptOnServer = () => null;

/** The prompt typed on the home page before signing in, if there is one. */
export function usePendingPrompt() {
  return useSyncExternalStore<string | null>(
    NEVER_CHANGES,
    readPendingPrompt,
    noPendingPromptOnServer,
  );
}
