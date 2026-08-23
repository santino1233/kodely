import { db } from "./db";

// Validation and live-availability checking for a CUSTOMER-CHOSEN subdomain
// (Project.slug — becomes <slug>.kodely.site, see prisma/schema.prisma).
//
// This is deliberately separate from the slugify()-with-random-suffix helper
// duplicated across app/api/projects/route.ts, app/api/projects/[id]/route.ts
// and lib/seed-project.ts. That helper derives a slug FROM a name the system
// picked, and a random suffix is exactly right there — collisions must be
// vanishingly rare with zero user interaction. This module is the opposite
// case: the CUSTOMER is typing an exact address they want, on purpose, so
// there is no suffix to fall back on — a taken slug is refused outright and
// they choose a different one. Two different jobs; sharing one function
// between them would either strip the customer's edit box of a suffix they
// didn't ask for, or start silently randomizing addresses nobody has a
// problem with.

/** DNS-label-ish bounds. 63 is the real DNS label limit; 3 keeps addresses
    from being a single keystroke away from every other short one. */
export const SLUG_MIN = 3;
export const SLUG_MAX = 63;

// Names that would be confusing or actively unsafe as a customer subdomain —
// mostly infra-shaped words a support conversation would otherwise trip over
// ("wait, is my site on www.kodely.site?"), plus the platform's own name.
// <slug>.kodely.site is a distinct domain from the app's own (kodely.me), so
// none of these actually collide with a real route today — this is a
// deliberate reservation, not a bug workaround.
const RESERVED_SLUGS = new Set([
  "www",
  "api",
  "app",
  "admin",
  "mail",
  "email",
  "ftp",
  "ssh",
  "staging",
  "status",
  "support",
  "help",
  "blog",
  "docs",
  "dashboard",
  "billing",
  "assets",
  "static",
  "cdn",
  "kodely",
]);

/** Lowercase, trim. Does not otherwise alter what the customer typed — format
    errors should be shown, not silently rewritten. */
export function normalizeSlug(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Format check only — no I/O. Lowercase alphanumeric and single hyphens,
 * never leading/trailing or doubled, within DNS label bounds.
 */
export function slugFormatError(slug: string): string | null {
  if (slug.length < SLUG_MIN) return `Must be at least ${SLUG_MIN} characters.`;
  if (slug.length > SLUG_MAX) return `Must be ${SLUG_MAX} characters or fewer.`;
  if (!/^[a-z0-9-]+$/.test(slug)) return "Only lowercase letters, numbers, and hyphens.";
  if (slug.startsWith("-") || slug.endsWith("-")) return "Can't start or end with a hyphen.";
  if (slug.includes("--")) return "Can't have two hyphens in a row.";
  if (RESERVED_SLUGS.has(slug)) return "That address is reserved.";
  return null;
}

export type SlugCheck = { available: boolean; reason: string | null };

/**
 * The real availability check: format, reservation, THEN a live query against
 * the DB unique constraint that actually governs it — `excludeProjectId` so a
 * project checking its own current slug reads as available rather than
 * "taken" by itself.
 *
 * This is the live-typing check. It is NOT the source of truth for the save —
 * see the PUT handler in app/api/projects/[id]/slug/route.ts, which re-checks
 * against the database at save time and treats the unique constraint itself,
 * not this function, as the final word. Two people can pass this check for
 * the same slug seconds apart; only one of them can win the save.
 */
export async function checkSlugAvailability(
  rawSlug: string,
  excludeProjectId?: string,
): Promise<SlugCheck> {
  const slug = normalizeSlug(rawSlug);
  const formatError = slugFormatError(slug);
  if (formatError) return { available: false, reason: formatError };

  const existing = await db.project.findUnique({ where: { slug }, select: { id: true } });
  if (existing && existing.id !== excludeProjectId) {
    return { available: false, reason: "That address is already taken." };
  }
  return { available: true, reason: null };
}
