import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";

const db = new PrismaClient();
const posts = JSON.parse(readFileSync("./seo-batch4.json", "utf8"));

for (const p of posts) {
  await db.blogPost.upsert({
    where: { slug: p.slug },
    create: {
      slug: p.slug,
      title: p.title,
      metaDescription: p.metaDescription,
      category: p.category,
      targetKeyword: p.targetKeyword,
      bodyHtml: p.bodyHtml,
    },
    update: {
      title: p.title,
      metaDescription: p.metaDescription,
      category: p.category,
      targetKeyword: p.targetKeyword,
      bodyHtml: p.bodyHtml,
    },
  });
  console.log("inserted:", p.slug);
}

console.log(`\n${posts.length} posts upserted.`);
await db.$disconnect();
