import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import {
  BRAND_CSS_PATH,
  BRAND_FILE_KIND,
  BRAND_FILE_PATH,
  BRAND_LOGO_COMPONENT_PATH,
  brandLogoComponent,
  brandPromptFragment,
  brandSourceEdits,
  buildBrandKit,
  LOGO_LIMITS,
  logoTokenEstimate,
  paletteCatalogue,
  parseStoredBrandKit,
  removeBrandTheme,
  type BrandKit,
} from "@/lib/brand-kit";

export const dynamic = "force-dynamic";

/**
 * A project's brand kit: the customer's own logo, palette and business name.
 *
 * WHERE IT IS STORED, AND WHY THERE IS NO NEW TABLE
 * prisma/schema.prisma has no BrandKit model and is not allowed to gain one.
 * It does have ProjectFile, whose `content` is a plain String and whose `kind`
 * is a plain String currently holding only "source" and "build". This route
 * writes a third kind, "brand" — one row per project at path "brand.json".
 *
 * That value is invisible to every existing query (checked, not assumed):
 *   generate, export, restore, code view   -> kind: "source"
 *   preview, publish, public site serving  -> kind: "build"
 * and visible to exactly the two that should see it:
 *   duplicate (POST /api/projects/[id])    -> every draft file, any kind
 *   delete                                 -> ON DELETE CASCADE
 * so a copied project keeps its brand and a deleted one takes it with it.
 *
 * WHAT A SAVE ALSO TOUCHES
 * A kit that only sits in a row does nothing. A save additionally rewrites two
 * DRAFT SOURCE files, following the same pattern as the SEO route
 * (app/api/projects/[id]/seo):
 *   src/index.css                       — the @theme block, spliced between
 *                                         markers so the builder's own CSS in
 *                                         that file survives.
 *   src/components/brand/BrandLogo.tsx  — the logo compiled into a component.
 *
 * It does NOT touch draft `kind: "build"` rows and never touches published
 * ones. The build tree is compiled Tailwind output; @theme only means anything
 * when Tailwind next runs. So the honest contract, which the UI states, is:
 * the brand kit takes effect on the next build. Rewriting compiled CSS to fake
 * an instant preview would produce a preview that differs from what publishing
 * actually ships.
 *
 * WHAT THIS ROUTE DOES NOT DO
 * It does not inject brandPromptFragment() into the builder's request —
 * app/api/generate/route.ts owns that and is outside this change. The fragment
 * is exported and ready; see the note at the bottom of this file.
 */

/** Shape returned to the client on every verb, so the UI never re-fetches to refresh. */
function payload(kit: BrandKit | null, warnings: string[] = []) {
  return {
    kit,
    warnings,
    // The picker's whole vocabulary comes from lib/assets/patterns.ts. Serving
    // it from here rather than importing it client-side keeps the 30 presets
    // (and the rest of that module) out of the browser bundle.
    palettes: paletteCatalogue(),
    /** What this logo adds to the model's context on every turn of every build. */
    logoTokens: logoTokenEstimate(kit?.logo ?? null),
    /**
     * The exact text the builder will be given. Shown in the panel on purpose:
     * the promise this feature makes is that the customer's colours reach the
     * model as hex values and a catalogue id rather than as adjectives, and
     * that is a promise you can only verify by reading it.
     */
    promptFragment: kit ? brandPromptFragment(kit) : null,
    /** Where a save lands, so the panel can tell the truth about it. */
    writes: [BRAND_CSS_PATH, BRAND_LOGO_COMPONENT_PATH],
    /**
     * Served rather than imported client-side. The panel needs the caps to
     * downscale a raster logo before uploading it, and importing the constant
     * would drag lib/brand-kit — and through it the whole asset catalogue —
     * into the browser bundle for four numbers.
     */
    limits: LOGO_LIMITS,
  };
}

/** Ownership scoped in the SAME query as the id — see the note on PATCH in ../route.ts. */
async function ownedProject(id: string, userId: string) {
  return db.project.findFirst({ where: { id, userId }, select: { id: true, name: true } });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser().catch(() => null);
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;

  const project = await ownedProject(id, user.id);
  if (!project) return Response.json({ error: "Project not found." }, { status: 404 });

  const row = await db.projectFile.findFirst({
    where: { projectId: id, path: BRAND_FILE_PATH, kind: BRAND_FILE_KIND, published: false },
    select: { content: true },
  });

  // A malformed row reads as "no kit yet" rather than a 500: the brand kit is
  // a convenience, and a corrupt one must not lock the user out of setting a
  // new one. The next PUT overwrites it.
  return Response.json(payload(row ? parseStoredBrandKit(row.content) : null));
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser().catch(() => null);
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;

  const body = (await req.json().catch(() => null)) as unknown;

  // Validation and SVG SANITISING happen here, server-side, before anything is
  // stored. The client does none of it: an uploaded SVG is executable markup
  // that ends up inlined on *.kodely.site, so a client-side check is decoration.
  const built = buildBrandKit(body);
  if (!built.ok) return Response.json({ error: built.reason }, { status: 400 });

  const project = await ownedProject(id, user.id);
  if (!project) return Response.json({ error: "Project not found." }, { status: 404 });

  const css = await db.projectFile.findFirst({
    where: { projectId: id, path: BRAND_CSS_PATH, kind: "source", published: false },
    select: { id: true, content: true },
  });
  const logoFile = await db.projectFile.findFirst({
    where: { projectId: id, path: BRAND_LOGO_COMPONENT_PATH, kind: "source", published: false },
    select: { id: true },
  });

  // No src/index.css means the project has no source tree yet (a brand-new
  // project always has one — see lib/seed-project.ts — so this is the "deleted
  // everything" case). Store the kit anyway rather than refusing: the next
  // build will read it. Only the file writes are skipped.
  const edits = css ? brandSourceEdits(built.kit, css.content) : [];

  await db.$transaction([
    db.projectFile.upsert({
      where: {
        projectId_path_published_kind: {
          projectId: id,
          path: BRAND_FILE_PATH,
          published: false,
          kind: BRAND_FILE_KIND,
        },
      },
      update: { content: JSON.stringify(built.kit) },
      create: {
        projectId: id,
        path: BRAND_FILE_PATH,
        content: JSON.stringify(built.kit),
        published: false,
        kind: BRAND_FILE_KIND,
      },
    }),
    ...(css
      ? [
          db.projectFile.update({
            where: { id: css.id },
            data: { content: edits[0].content },
          }),
          logoFile
            ? db.projectFile.update({
                where: { id: logoFile.id },
                data: { content: edits[1].content },
              })
            : db.projectFile.create({
                data: {
                  projectId: id,
                  path: BRAND_LOGO_COMPONENT_PATH,
                  content: edits[1].content,
                  published: false,
                  kind: "source",
                },
              }),
        ]
      : []),
  ]);

  const warnings = [...built.warnings];
  if (!css) {
    warnings.push(
      "This project has no source files yet, so only the brand kit itself was saved. It will be applied on the first build.",
    );
  }

  return Response.json(payload(built.kit, warnings));
}

/**
 * Clear the kit.
 *
 * BrandLogo.tsx is deliberately NOT deleted when something still imports it.
 * Once a generation has written `import { BrandLogo } from "./components/brand/BrandLogo"`,
 * removing the file turns "clear my logo" into a TypeScript error and a failed
 * build on the customer's own site. When it is still referenced it is rewritten
 * to a plain wordmark using the project's name; only an unreferenced file is
 * actually removed.
 *
 * The @theme block is always removed — losing it makes `bg-brand-500` resolve
 * to nothing, which is an unstyled element, never a build failure.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser().catch(() => null);
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;

  const project = await ownedProject(id, user.id);
  if (!project) return Response.json({ error: "Project not found." }, { status: 404 });

  const sources = await db.projectFile.findMany({
    where: { projectId: id, kind: "source", published: false },
    select: { id: true, path: true, content: true },
  });
  const css = sources.find((f) => f.path === BRAND_CSS_PATH);
  const logoFile = sources.find((f) => f.path === BRAND_LOGO_COMPONENT_PATH);
  const referenced = sources.some(
    (f) => f.path !== BRAND_LOGO_COMPONENT_PATH && f.content.includes("brand/BrandLogo"),
  );

  const ops: Prisma.PrismaPromise<unknown>[] = [
    db.projectFile.deleteMany({
      where: { projectId: id, path: BRAND_FILE_PATH, kind: BRAND_FILE_KIND, published: false },
    }),
  ];
  if (css) {
    const next = removeBrandTheme(css.content);
    if (next !== css.content) {
      ops.push(db.projectFile.update({ where: { id: css.id }, data: { content: next } }));
    }
  }
  if (logoFile) {
    ops.push(
      referenced
        ? db.projectFile.update({
            where: { id: logoFile.id },
            data: {
              content: brandLogoComponent({
                version: 1,
                businessName: project.name,
                palette: {
                  presetId: null,
                  primary: "#111827",
                  secondary: "#374151",
                  accent: "#374151",
                  ink: "#0b1120",
                  surface: "#ffffff",
                },
                logo: null,
                updatedAt: new Date().toISOString(),
              }),
            },
          })
        : db.projectFile.delete({ where: { id: logoFile.id } }),
    );
  }

  await db.$transaction(ops);
  return Response.json(payload(null));
}

// ---------------------------------------------------------------------------
// THE ONE LINE THIS FEATURE NEEDS OUTSIDE ITS OWN SCOPE
//
// app/api/generate/route.ts currently has, inside the streamed handler:
//
//     let request = prompt;                               (~line 196)
//
// For a brand kit to reach the builder, that becomes:
//
//     const brandRow = await db.projectFile.findFirst({
//       where: { projectId: project.id, path: "brand.json", kind: "brand", published: false },
//       select: { content: true },
//     });
//     const brand = brandRow ? parseStoredBrandKit(brandRow.content) : null;
//     let request = brand ? `${brandPromptFragment(brand)}\n\n${prompt}` : prompt;
//
// with `import { brandPromptFragment, parseStoredBrandKit } from "@/lib/brand-kit";`
// at the top. Nothing else in that file changes — the fragment rides in the
// user turn, ahead of the request, and the repair loop reassigns `request` on
// later attempts, which is correct: a repair pass is about a compile error, not
// about the brand.
//
// Both symbols are exported for exactly this. Until that line lands, the kit
// still reaches the site through src/index.css and BrandLogo.tsx — the builder
// simply is not TOLD about it, so it may not reach for the utilities.
// ---------------------------------------------------------------------------
