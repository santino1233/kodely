// ─────────────────────────────────────────────────────────────────────────────
// Pro foundations — pre-built app starters, as opposed to the marketing-site
// starter in lib/foundation.ts (singular).
//
// SCOPE, stated plainly: everything here is CLIENT-ONLY. Generated sites are
// static files served under `connect-src 'none'` (see the CSP in
// app/api/site/[slug]/[[...path]]/route.ts) with react and react-dom as the
// only runtime dependencies and no npm install per generation. There is no
// server a generated app can talk to, so there is no shared data, no login and
// no backup. A foundation that needs those is blocked on the backend decision
// on the board, not on anything in this directory.
//
// What that leaves is still a real product: a single-person app with genuine
// persistence, which is what a sole trader tracking clients actually needs.
// The rule this directory holds itself to is that the app must SAY SO — see
// the `cannot` list on each foundation, and the storage notice the kernel puts
// on every screen.
//
// NOT WIRED IN YET. Nothing imports this; the changes needed to reach it from
// a real generation are listed in docs/pro-foundations.md.
// ─────────────────────────────────────────────────────────────────────────────

import type { FileMap } from "../agent";
import { FOUNDATION_FILES } from "../foundation";
import type { Foundation } from "./types";
import { CLIENT_TRACKER } from "./client-tracker";

export type { Foundation, FoundationFile } from "./types";
export { toFileMap, kernelPaths, describeManifest } from "./types";

export const FOUNDATIONS: Record<string, Foundation> = {
  [CLIENT_TRACKER.id]: CLIENT_TRACKER,
};

export function getFoundation(id: string): Foundation | undefined {
  return FOUNDATIONS[id];
}

/**
 * Config files a Pro app inherits UNCHANGED from the marketing foundation.
 *
 * Deliberately taken by reference rather than copied: package.json here must
 * stay byte-identical to the one scripts/install-foundation.mjs installs, or
 * the shared node_modules symlink in lib/build-site.ts points at a tree that
 * does not match the project. Copying it would let the two drift silently.
 *
 * This is also why a Pro foundation adds NO dependency: react and react-dom
 * are the whole runtime, which is why the kernel hand-rolls its router, its
 * date formatting and its validation instead of installing three packages.
 */
const SHARED_CONFIG = ["package.json", "vite.config.ts", "tsconfig.json"] as const;

/** The complete FileMap a new Pro project starts from. */
export function foundationFiles(foundation: Foundation): FileMap {
  const files: FileMap = {};
  for (const path of SHARED_CONFIG) files[path] = FOUNDATION_FILES[path];
  for (const [path, file] of Object.entries(foundation.files)) files[path] = file.content;
  return files;
}

/** Total bytes of a foundation's own files — what a context dump would cost. */
export function foundationBytes(foundation: Foundation): number {
  let total = 0;
  for (const [path, file] of Object.entries(foundation.files)) {
    total += path.length + file.content.length;
  }
  return total;
}
