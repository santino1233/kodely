import Link from "next/link";
import { db } from "@/lib/db";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";

export const dynamic = "force-dynamic";

export default async function BlogIndexPage() {
  const posts = await db.blogPost.findMany({
    orderBy: { publishedAt: "desc" },
    select: { slug: true, title: true, metaDescription: true, category: true },
  });

  const byCategory = new Map<string, typeof posts>();
  for (const post of posts) {
    const list = byCategory.get(post.category) ?? [];
    list.push(post);
    byCategory.set(post.category, list);
  }

  return (
    <div className="min-h-screen bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-50">
      <MarketingNav />

      <section className="mx-auto max-w-4xl px-6 pb-8 pt-16 text-center sm:pt-24">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          The <span className="brand-gradient-text">Kodely</span> blog
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-neutral-600 dark:text-neutral-400">
          Guides, comparisons, and ideas for building a real site with AI.
        </p>
      </section>

      <section className="mx-auto max-w-4xl px-6 py-10">
        {posts.length === 0 ? (
          <p className="text-center text-sm text-neutral-500 dark:text-neutral-500">
            Nothing published yet — check back soon.
          </p>
        ) : (
          Array.from(byCategory.entries()).map(([category, items]) => (
            <div key={category} className="mb-14">
              <h2 className="mb-5 text-sm font-medium uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400">
                {category}
              </h2>
              <div className="space-y-6">
                {items.map((post) => (
                  <Link key={post.slug} href={`/blog/${post.slug}`} className="block group">
                    <h3 className="text-lg font-semibold tracking-tight group-hover:underline">
                      {post.title}
                    </h3>
                    <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                      {post.metaDescription}
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          ))
        )}
      </section>

      <MarketingFooter />
    </div>
  );
}
