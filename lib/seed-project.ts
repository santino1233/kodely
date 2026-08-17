import { db } from "./db";
import { FOUNDATION_FILES } from "./foundation";
import { buildSite } from "./build-site";

// ── Onboarding seed project ────────────────────────────────────────────────
// New signups land on an empty dashboard otherwise, which is a bad first
// impression for a tool whose entire pitch is "describe it, watch it build."
// This gives every new account one already-buildable project with a live
// preview from the very first screen, using the exact same Vite+React+TS+
// Tailwind foundation every project starts from (lib/foundation.ts) — not a
// special-cased demo, so there's nothing extra to keep in sync.
//
// This is free onboarding content, not a paid generation — it must never
// touch the credit ledger.

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return (base || "site") + "-" + Math.random().toString(36).slice(2, 7);
}

const WELCOME_MESSAGE =
  "This is your starting foundation — a real React app, ready to build on. Describe the site you want in the chat below, like \"a landing page for a coffee shop called Roan Coffee, warm and cozy\", and I'll build it for real.";

/**
 * Gives a brand-new account a real project with a working preview instead of
 * an empty dashboard. Free onboarding content — never charges credits.
 */
export async function createSeedProject(userId: string): Promise<string> {
  const project = await db.project.create({
    data: { userId, name: "My first site", slug: slugify("my-first-site") },
  });

  await db.projectFile.createMany({
    data: Object.entries(FOUNDATION_FILES).map(([path, content]) => ({
      projectId: project.id,
      path,
      content,
      published: false,
      kind: "source",
    })),
  });

  // Pre-build the foundation so the preview shows something real immediately
  // rather than "nothing built yet" on the very first screen a user sees.
  // If the build ever fails here (it shouldn't — it's the same fixed
  // foundation every time), just skip it silently: the preview falls back to
  // its own empty state, which is a fine floor, not worth failing signup over.
  try {
    const compiled = await buildSite(FOUNDATION_FILES);
    await db.projectFile.createMany({
      data: Object.entries(compiled).map(([path, content]) => ({
        projectId: project.id,
        path,
        content,
        published: false,
        kind: "build",
      })),
    });
  } catch (err) {
    console.error("[kodely] seed project pre-build failed (non-fatal)", err);
  }

  await db.message.create({
    data: { projectId: project.id, role: "assistant", content: WELCOME_MESSAGE },
  });

  return project.id;
}
