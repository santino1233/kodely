import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { db } from "@/lib/db";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { Aura } from "@/components/marketing/Aura";
import { Reveal, RevealGroup, RevealItem } from "@/components/marketing/Reveal";
import { MotionLift } from "@/components/marketing/FloatCard";

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
    <div className="relative min-h-screen bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-50">
      <Aura />
      <MarketingNav />

      <section className="relative">
        <div className="relative mx-auto max-w-4xl px-6 pb-8 pt-40 text-center sm:pt-52">
          <Reveal>
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
              The <span className="brand-gradient-text">Kodely</span> blog
            </h1>
          </Reveal>
          <Reveal delay={0.08}>
            <p className="mx-auto mt-5 max-w-xl text-lg text-neutral-600 dark:text-neutral-400">
              Guides, comparisons, and ideas for building a real site with AI.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="relative mx-auto max-w-5xl px-6 py-10">
        {posts.length === 0 ? (
          <p className="text-center text-sm text-neutral-500 dark:text-neutral-500">
            Nothing published yet — check back soon.
          </p>
        ) : (
          Array.from(byCategory.entries()).map(([category, items]) => (
            <div key={category} className="mb-16">
              <Reveal>
                <h2 className="mb-5 flex items-center gap-2 text-sm font-medium uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: "var(--brand-gradient)" }}
                    aria-hidden
                  />
                  {category}
                </h2>
              </Reveal>
              <RevealGroup className="grid gap-5 sm:grid-cols-2" stagger={0.06}>
                {items.map((post) => (
                  <RevealItem key={post.slug}>
                    <MotionLift lift={4} className="h-full">
                      <Link
                        href={`/blog/${post.slug}`}
                        className="group flex h-full flex-col rounded-2xl border border-neutral-200 p-6 transition-shadow hover:shadow-lg dark:border-neutral-800"
                      >
                        <h3 className="text-lg font-semibold leading-snug tracking-tight">{post.title}</h3>
                        <p className="mt-2 flex-1 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                          {post.metaDescription}
                        </p>
                        <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-neutral-900 dark:text-white">
                          Read article
                          <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
                        </span>
                      </Link>
                    </MotionLift>
                  </RevealItem>
                ))}
              </RevealGroup>
            </div>
          ))
        )}
      </section>

      <MarketingFooter />
    </div>
  );
}
