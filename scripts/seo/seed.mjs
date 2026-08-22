// Seeds content/seo/*.json into the BlogPost table.
//
//   node scripts/seo/seed.mjs --dry-run    what would change, writes nothing
//   node scripts/seo/seed.mjs              apply it
//
// Three properties this script is built around:
//
// 1. IDEMPOTENT. It diffs each article against the row already in the database
//    and skips anything byte-identical. Prisma's @updatedAt fires on every
//    `update` call regardless of whether values changed, so an unconditional
//    upsert would churn updatedAt on every deploy and make the column useless
//    as a signal of "when did this article actually change".
//
// 2. NON-DESTRUCTIVE. It only ever creates or updates rows whose slug appears
//    in content/seo/. Rows it does not own are reported as "not managed here"
//    and left completely alone — there is no delete path in this file at all.
//
// 3. VALIDATED FIRST. Nothing is written unless every article passes
//    scripts/seo/validate.mjs. bodyHtml goes into the page through
//    dangerouslySetInnerHTML, so malformed markup is not a cosmetic problem —
//    it breaks the layout of a live page.

import { PrismaClient } from "@prisma/client";
import { loadEnv, loadArticles, toRow, ARTICLE_FIELDS } from "./lib.mjs";
import { validateAll } from "./validate.mjs";

const DRY_RUN = process.argv.includes("--dry-run");

function fieldsThatDiffer(row, existing) {
  return ARTICLE_FIELDS.filter((field) => row[field] !== existing[field]);
}

function preview(text, max = 72) {
  const flat = String(text).replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

async function main() {
  loadEnv();
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set, and .env did not provide one.");
    process.exit(1);
  }

  const articles = loadArticles();
  if (articles.length === 0) {
    console.error("No articles found in content/seo/ — nothing to seed.");
    process.exit(1);
  }

  const invalid = validateAll(articles).filter((r) => r.problems.length > 0);
  if (invalid.length > 0) {
    console.error(`Refusing to seed: ${invalid.length} article(s) failed validation.\n`);
    for (const { article, problems } of invalid) {
      console.error(`  ${article.file}`);
      for (const p of problems) console.error(`    - ${p}`);
    }
    console.error("\nRun: node scripts/seo/validate.mjs");
    process.exit(1);
  }

  const db = new PrismaClient();
  const plan = { create: [], update: [], unchanged: [] };

  try {
    const existingRows = await db.blogPost.findMany({
      select: {
        slug: true,
        title: true,
        metaDescription: true,
        category: true,
        targetKeyword: true,
        bodyHtml: true,
      },
    });
    const existing = new Map(existingRows.map((r) => [r.slug, r]));

    for (const article of articles) {
      const row = toRow(article);
      const current = existing.get(row.slug);
      if (!current) {
        plan.create.push({ row });
      } else {
        const changed = fieldsThatDiffer(row, current);
        if (changed.length === 0) plan.unchanged.push({ row });
        else plan.update.push({ row, changed });
      }
    }

    const managed = new Set(articles.map((a) => a.slug));
    const foreign = existingRows.filter((r) => !managed.has(r.slug));

    // ── Report ────────────────────────────────────────────────────────────
    console.log(DRY_RUN ? "DRY RUN — nothing will be written.\n" : "Seeding BlogPost…\n");

    for (const { row } of plan.create) {
      console.log(`  create    ${row.slug}`);
      console.log(`            "${preview(row.title)}"  [${row.category}]`);
    }
    for (const { row, changed } of plan.update) {
      console.log(`  update    ${row.slug}  (${changed.join(", ")})`);
      for (const field of changed) {
        if (field === "bodyHtml") {
          const before = existing.get(row.slug).bodyHtml.length;
          console.log(`            bodyHtml: ${before} chars -> ${row.bodyHtml.length} chars`);
        } else {
          console.log(`            ${field}: "${preview(existing.get(row.slug)[field], 40)}"`);
          console.log(`            ${" ".repeat(field.length)}  -> "${preview(row[field], 40)}"`);
        }
      }
    }
    for (const { row } of plan.unchanged) {
      console.log(`  unchanged ${row.slug}`);
    }
    for (const row of foreign) {
      console.log(`  skip      ${row.slug}  (in the database, not managed by content/seo/)`);
    }

    // ── Apply ─────────────────────────────────────────────────────────────
    if (!DRY_RUN) {
      for (const { row } of plan.create) {
        // create-not-upsert on this branch is deliberate: if a row appeared
        // between the read above and here, that is a genuine race worth
        // surfacing rather than quietly overwriting someone else's write.
        await db.blogPost.create({ data: row });
      }
      for (const { row } of plan.update) {
        const { slug, ...data } = row;
        await db.blogPost.update({ where: { slug }, data });
      }
    }

    console.log(
      `\n${plan.create.length} created, ${plan.update.length} updated, ` +
        `${plan.unchanged.length} unchanged, ${foreign.length} left alone.`,
    );
    if (DRY_RUN && plan.create.length + plan.update.length > 0) {
      console.log("Re-run without --dry-run to apply.");
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
