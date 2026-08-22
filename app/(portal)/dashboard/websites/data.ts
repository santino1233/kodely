import { db } from "@/lib/db";
import { BRAND_FILE_KIND, BRAND_FILE_PATH, parseStoredBrandKit } from "@/lib/brand-kit";
import type { WebsiteCardProject, WebsiteCover } from "@/components/app/WebsiteCard";

/* Everything both /dashboard and /dashboard/websites need to describe a site,
   in ONE place, because the two pages render the same card and must never
   disagree about what a site's state is.

   This module is deliberately server-only-ish (it imports lib/db) but carries
   no "use client" directive and exports plain functions, so a Server Component
   can call it. WebsiteCard is the client half and only ever receives the plain
   objects produced here — no Date, no Prisma model, nothing that would have to
   be re-derived in the browser. */

/**
 * How long a `Build.status = "RUNNING"` row is still believed.
 *
 * There is no cleanup for an abandoned build: the generate route streams over
 * SSE, and a dropped connection, a crashed process or a redeploy leaves the row
 * RUNNING forever. Rendering that as "Building…" would mean a site that claims
 * to be working on something for the rest of its life.
 *
 * The cut-off is not a guess. app/api/generate/route.ts sets
 * `export const maxDuration = 300` — the platform itself kills the request at
 * five minutes, so no build can legitimately still be running after that. This
 * is double it, which leaves room for clock skew and a slow final write while
 * still collapsing an abandoned row to "not building" within ten minutes.
 */
export const BUILD_STALE_MS = 10 * 60 * 1000;

/** Minutes, for the sentence the UI shows about the rule above. */
export const BUILD_STALE_MINUTES = BUILD_STALE_MS / 60_000;

/** Matches the constant in app/api/projects/[id]/publish/route.ts. */
const SITES_BASE = process.env.KODELY_SITES_BASE ?? "kodely.site";

// ── Dates ──────────────────────────────────────────────────────────────────
// Formatted on the SERVER and passed down as strings. A client component that
// formatted these itself would either disagree with the server HTML at
// hydration (relative times move) or depend on the visitor's locale, which
// differs from the server's. One string, computed once, is neither.

const ABSOLUTE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export function formatDate(value: Date): string {
  return ABSOLUTE.format(value);
}

/**
 * A cut-off `n` days back.
 *
 * Lives here rather than inline in a page because `react-hooks/purity`
 * (correctly) refuses `Date.now()` inside a component body: a render must be
 * idempotent, and a clock read is the canonical thing that is not. Reading the
 * clock inside a plain function the component calls is the same value with the
 * rule satisfied honestly rather than suppressed.
 */
export function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

/** "3 minutes ago" … then absolute once it stops being a useful relative. */
export function formatRelative(value: Date, now: number = Date.now()): string {
  const seconds = Math.round((now - value.getTime()) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} ${days === 1 ? "day" : "days"} ago`;
  return ABSOLUTE.format(value);
}

// ── Generated covers ───────────────────────────────────────────────────────
//
// NOTHING IN THIS PRODUCT CAPTURES A SCREENSHOT. There is no thumbnail column,
// no headless browser, no image storage. So a card cannot show what a site
// looks like, and must not pretend to.
//
// What it CAN show is the site's own identity. If the project has a brand kit
// (lib/brand-kit.ts, stored as a ProjectFile with kind "brand") those are the
// real colours the generated site is painted with, and the cover is genuinely
// derived from the thing it represents. Without one, the cover falls back to a
// palette chosen deterministically from the slug — stable forever, distinct
// between neighbours in a grid, and obviously a generated mark rather than a
// picture of a page.

/** Fallback covers. Curated pairs, not random hues, so a grid stays coherent. */
const COVER_PALETTES: readonly (readonly [string, string])[] = [
  ["#f72570", "#a33dff"],
  ["#0ea5e9", "#2563eb"],
  ["#14b8a6", "#0e7490"],
  ["#f97316", "#dc2626"],
  ["#6366f1", "#a855f7"],
  ["#22d3ee", "#7c3aed"],
  ["#84cc16", "#0d8f5b"],
  ["#fb7185", "#f59e0b"],
];

/** FNV-1a. Small, dependency-free, and stable across processes and deploys. */
function hash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function coverFor(
  slug: string,
  brand: { primary: string; secondary: string } | null,
): WebsiteCover {
  if (brand) return { from: brand.primary, to: brand.secondary, source: "brand" };
  const [from, to] = COVER_PALETTES[hash(slug) % COVER_PALETTES.length];
  return { from, to, source: "slug" };
}

/** One or two letters from the site's own name. Same rule as Avatar. */
export function monogramFor(name: string): string {
  const parts = name.trim().split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

// ── Loading ────────────────────────────────────────────────────────────────

/**
 * Every site the customer owns, in the exact shape the card renders.
 *
 * Four reads, one round of parallelism, all scoped to project ids this user
 * owns (the first query is the authorization boundary; the rest filter by its
 * output). None of them is per-card — an N+1 over a site list is how a
 * dashboard becomes slow the moment someone is actually using the product.
 */
export async function loadWebsites(
  userId: string,
  opts: { take?: number } = {},
): Promise<WebsiteCardProject[]> {
  const projects = await db.project.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    ...(opts.take != null ? { take: opts.take } : {}),
    select: { id: true, name: true, slug: true, publishedAt: true, updatedAt: true, createdAt: true },
  });
  if (projects.length === 0) return [];

  const ids = projects.map((p) => p.id);

  const [brandRows, buildableRows, runningRows] = await Promise.all([
    db.projectFile.findMany({
      where: { projectId: { in: ids }, kind: BRAND_FILE_KIND, path: BRAND_FILE_PATH },
      select: { projectId: true, content: true },
    }),
    // A publish copies the DRAFT `kind: "build"` tree onto the published rows
    // (app/api/projects/[id]/publish/route.ts). No such rows means the publish
    // call would 400 — so the menu greys the action instead of offering it.
    db.projectFile.findMany({
      where: { projectId: { in: ids }, published: false, kind: "build" },
      select: { projectId: true },
      distinct: ["projectId"],
    }),
    // Only builds young enough to still be believable. See BUILD_STALE_MS.
    db.build.findMany({
      where: {
        projectId: { in: ids },
        status: "RUNNING",
        createdAt: { gte: new Date(Date.now() - BUILD_STALE_MS) },
      },
      select: { projectId: true },
      distinct: ["projectId"],
    }),
  ]);

  const brands = new Map<string, { primary: string; secondary: string }>();
  for (const row of brandRows) {
    const kit = parseStoredBrandKit(row.content);
    if (kit) brands.set(row.projectId, { primary: kit.palette.primary, secondary: kit.palette.secondary });
  }
  const publishable = new Set(buildableRows.map((r) => r.projectId));
  const building = new Set(runningRows.map((r) => r.projectId));

  const now = Date.now();
  return projects.map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    liveUrl: `https://${p.slug}.${SITES_BASE}`,
    liveLabel: `${p.slug}.${SITES_BASE}`,
    published: p.publishedAt !== null,
    building: building.has(p.id),
    publishable: publishable.has(p.id),
    monogram: monogramFor(p.name),
    cover: coverFor(p.slug, brands.get(p.id) ?? null),
    updatedAt: p.updatedAt.getTime(),
    updatedIso: p.updatedAt.toISOString(),
    updatedLabel: formatRelative(p.updatedAt, now),
    createdAt: p.createdAt.getTime(),
    createdIso: p.createdAt.toISOString(),
    createdLabel: formatDate(p.createdAt),
  }));
}

// ── Search params ──────────────────────────────────────────────────────────

export type ViewMode = "grid" | "list";
export type SortKey = "updated" | "created" | "name";

/**
 * The filters that can actually match something.
 *
 * "Archived" is absent and stays absent: there is no soft-delete column on
 * Project, and app/api/projects/[id]/route.ts states outright that delete is
 * irreversible with no archive. A filter that can never return a row is worse
 * than no filter, because it teaches the customer that their sites vanished.
 *
 * "Building" IS offered, but only under the staleness rule in BUILD_STALE_MS —
 * without it, one crashed SSE connection leaves a site filed under "Building"
 * permanently.
 */
export type StatusFilter = "all" | "published" | "draft" | "building";

const VIEWS: Record<ViewMode, true> = { grid: true, list: true };
const SORTS: Record<SortKey, true> = { updated: true, created: true, name: true };
const STATUSES: Record<StatusFilter, true> = {
  all: true,
  published: true,
  draft: true,
  building: true,
};

export type WebsiteParams = { view: ViewMode; sort: SortKey; status: StatusFilter; q: string };

/** First value of a possibly-repeated query parameter, or null. */
function first(raw: string | string[] | undefined): string | null {
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw) && typeof raw[0] === "string") return raw[0];
  return null;
}

/**
 * `hasOwnProperty.call`, never `in`. `in` walks the prototype chain, so
 * `?view=constructor` or `?sort=toString` would pass a membership test against
 * an object literal and then index it to a function.
 */
function pick<T extends string>(table: Record<string, true>, raw: string | string[] | undefined, fallback: T): T {
  const value = first(raw);
  if (value === null) return fallback;
  return Object.prototype.hasOwnProperty.call(table, value) ? (value as T) : fallback;
}

const QUERY_MAX = 80;

export function readWebsiteParams(
  searchParams: Record<string, string | string[] | undefined>,
): WebsiteParams {
  const read = (key: string): string | string[] | undefined =>
    Object.prototype.hasOwnProperty.call(searchParams, key) ? searchParams[key] : undefined;

  return {
    view: pick<ViewMode>(VIEWS, read("view"), "grid"),
    sort: pick<SortKey>(SORTS, read("sort"), "updated"),
    status: pick<StatusFilter>(STATUSES, read("status"), "all"),
    q: (first(read("q")) ?? "").slice(0, QUERY_MAX),
  };
}
