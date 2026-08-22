"use server";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { diffTrees, type BuildDiffResult } from "./diff";

// Reading a build's diff.
//
// A Server Action rather than a route, deliberately: the only consumer is
// Editor.tsx, the payload is a computed view of data the editor already owns,
// and adding a public GET endpoint would mean inventing an API surface for one
// component. (It is also the only option that stays inside this directory.)
//
// SECURITY. A Server Action is a POST against the page and is reachable by
// anyone who can send the request — rendering the button only for the owner is
// not an authorization boundary. So this re-checks the session itself and scopes
// every read by `project.userId`, exactly as the sibling REST routes do. A
// build id belonging to someone else's project must be indistinguishable from
// one that does not exist, which is why both fall out of the same query and
// share one message.
//
// SIZE. `filesSnapshot` is roughly 105 kB per build (lib/retention.ts), and this
// reads two of them — but only the diff crosses back to the browser, and
// diff.ts bounds that. The snapshots themselves never leave the server.

type Snapshot = { source?: Record<string, string>; build?: Record<string, string> };

/**
 * The file-level changes one successful build made, against the newest earlier
 * checkpoint whose snapshot still exists.
 *
 * Compares the SOURCE tree, not the compiled build output: source is what the
 * Code view shows, what the agent edits, and what the user means by "my files".
 * The compiled tree would diff on every build regardless of whether anything
 * meaningful changed.
 *
 * Never throws for an expected condition — a thrown Server Action surfaces to
 * the client as an opaque "an error occurred", which is useless for the two
 * conditions that actually happen here (a pruned snapshot, a stale build id).
 */
export async function loadBuildDiff(
  projectId: string,
  buildId: string,
): Promise<BuildDiffResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const build = await db.build.findFirst({
    where: { id: buildId, projectId, status: "SUCCEEDED", project: { userId: user.id } },
    select: {
      id: true,
      prompt: true,
      createdAt: true,
      filesWritten: true,
      filesSnapshot: true,
    },
  });
  if (!build) return { ok: false, error: "That build could not be found." };
  if (!build.filesSnapshot) {
    // The row survives, the snapshot does not. Distinct from "not found", and
    // the difference matters to the user: nothing is broken and nothing is
    // lost from the live draft — an old checkpoint was simply reclaimed.
    return {
      ok: false,
      error:
        "The file snapshot for this build has been cleared to save storage, so its changes can no longer be shown.",
    };
  }

  // The newest earlier build whose snapshot survives. Ordering by createdAt
  // mirrors the checkpoint list (app/api/projects/[id]/builds/route.ts) so the
  // "previous" here is the same row the History panel shows directly above.
  const previous = await db.build.findFirst({
    where: {
      projectId,
      status: "SUCCEEDED",
      createdAt: { lt: build.createdAt },
      filesSnapshot: { not: Prisma.DbNull },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, prompt: true, createdAt: true, filesSnapshot: true },
  });

  // Was there an earlier build at all? Only asked when `previous` came back
  // empty, so the common path pays nothing for it. This is what separates "the
  // first build of this project" from "the earlier checkpoint was pruned" —
  // two situations that produce an identical-looking whole-tree diff and must
  // not be described to the user in the same words.
  const previousPruned =
    previous === null &&
    (await db.build.count({
      where: { projectId, status: "SUCCEEDED", createdAt: { lt: build.createdAt } },
    })) > 0;

  const after = (build.filesSnapshot as Snapshot).source ?? {};
  const before = previous ? ((previous.filesSnapshot as Snapshot).source ?? {}) : {};

  return {
    ok: true,
    diff: {
      build: {
        id: build.id,
        prompt: build.prompt,
        createdAt: build.createdAt.toISOString(),
        filesWritten: build.filesWritten,
      },
      previous: previous
        ? {
            id: previous.id,
            prompt: previous.prompt,
            createdAt: previous.createdAt.toISOString(),
          }
        : null,
      previousPruned,
      files: diffTrees(before, after),
    },
  };
}
