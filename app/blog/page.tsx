import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { Aura } from "@/components/marketing/Aura";
import { Reveal } from "@/components/marketing/Reveal";
import { BlogSearch } from "@/components/marketing/BlogSearch";
import { SkipLink } from "@/components/marketing/SkipLink";

export const dynamic = "force-dynamic";

// Already force-dynamic above, so reading the session here costs this route
// nothing it was not already paying — and it means the nav paints the right
// two links in the FIRST response rather than swapping them after hydration
// the way the statically prerendered pages have to.
export default async function BlogIndexPage() {
  const user = await getCurrentUser();
  const posts = await db.blogPost.findMany({
    orderBy: { publishedAt: "desc" },
    select: { slug: true, title: true, metaDescription: true, category: true },
  });

  return (
    <div className="relative min-h-screen bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-50">
      <SkipLink />
      <Aura />
      <MarketingNav signedIn={Boolean(user)} />

      {/* Matches the other public pages. Without a <main> the skip link has
          nowhere to land and the body sits outside any landmark. */}
      <main id="main-content" tabIndex={-1}>
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

      <section className="relative mx-auto max-w-6xl px-6 py-10">
        {posts.length === 0 ? (
          <p className="text-center text-sm text-neutral-500 dark:text-neutral-500">
            Nothing published yet — check back soon.
          </p>
        ) : (
          <BlogSearch posts={posts} />
        )}
      </section>
      </main>

      <MarketingFooter signedIn={Boolean(user)} />
    </div>
  );
}
