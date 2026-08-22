// Shared plumbing for the SEO content pipeline.
//
// Articles live as one JSON file per post under content/seo/. Body copy is an
// ARRAY of block-level HTML strings rather than one giant escaped string: it
// keeps diffs readable, keeps line length sane, and makes it obvious when a
// block was added or removed. `bodyHtml` — the column the DB actually stores —
// is derived here by joining those blocks, so there is exactly one definition
// of the transform and the validator and the seeder can never disagree.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const CONTENT_DIR = join(REPO_ROOT, "content", "seo");

/**
 * Minimal .env reader. Deliberately not a dependency: this pipeline must run
 * with nothing installed beyond what the app already has, and the only thing
 * it needs out of .env is DATABASE_URL.
 *
 * Never overwrites a variable that is already set, so `DATABASE_URL=... node
 * scripts/seo/seed.mjs` still points where the operator aimed it.
 */
export function loadEnv(file = join(REPO_ROOT, ".env")) {
  if (!existsSync(file)) return;
  for (const rawLine of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    let value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

/** The six columns of prisma's BlogPost that this pipeline owns. */
export const ARTICLE_FIELDS = [
  "slug",
  "title",
  "metaDescription",
  "category",
  "targetKeyword",
  "bodyHtml",
];

/**
 * Every article on disk, ordered by filename so output is stable run to run.
 * Throws on malformed JSON rather than silently skipping — a file that does
 * not parse is a bug to fix, not an article to omit.
 */
export function loadArticles(dir = CONTENT_DIR) {
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort();

  return files.map((name) => {
    const path = join(dir, name);
    let raw;
    try {
      raw = JSON.parse(readFileSync(path, "utf8"));
    } catch (error) {
      throw new Error(`${name}: not valid JSON — ${error.message}`);
    }
    const body = Array.isArray(raw.body) ? raw.body : [];
    return {
      file: name,
      expectedSlug: basename(name, ".json"),
      slug: raw.slug,
      title: raw.title,
      metaDescription: raw.metaDescription,
      category: raw.category,
      targetKeyword: raw.targetKeyword,
      body,
      bodyHtml: body.join("\n"),
    };
  });
}

/** The record shape the seeder writes, with nothing extra attached. */
export function toRow(article) {
  return {
    slug: article.slug,
    title: article.title,
    metaDescription: article.metaDescription,
    category: article.category,
    targetKeyword: article.targetKeyword,
    bodyHtml: article.bodyHtml,
  };
}
