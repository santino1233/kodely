import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Clock } from "lucide-react";
import { db } from "@/lib/db";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { Aura } from "@/components/marketing/Aura";
import { ArticleProgress } from "@/components/marketing/ArticleProgress";
import { Reveal } from "@/components/marketing/Reveal";
import { MotionLift } from "@/components/marketing/FloatCard";
import { ShineButton } from "@/components/marketing/ShineButton";

export const dynamic = "force-static";
export const revalidate = 3600;

async function getPost(slug: string) {
  return db.blogPost.findUnique({ where: { slug } });
}

function readingTime(html: string) {
  const words = html.replace(/<[^>]+>/g, " ").trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) return {};
  return {
    title: post.title,
    description: post.metaDescription,
  };
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();

  const related = await db.blogPost.findMany({
    where: { category: post.category, slug: { not: post.slug } },
    orderBy: { publishedAt: "desc" },
    select: { slug: true, title: true },
    take: 2,
  });

  const minutes = readingTime(post.bodyHtml);
  const published = post.publishedAt.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="relative min-h-screen bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-50">
      <Aura />
      <ArticleProgress />
      <MarketingNav />

      <article className="relative mx-auto max-w-3xl px-6 pb-24 pt-36 sm:pt-44">
        <Reveal>
          <Link
            href="/blog"
            className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900 dark:text-neutral-500 dark:hover:text-white"
          >
            <ArrowLeft size={14} /> All articles
          </Link>
        </Reveal>

        {/* Liquid-glass article panel — frosted card floating over the page's
            ambient Aura blobs (which bleed through the translucent fill),
            with a soft specular highlight in the top-left corner, the same
            "iOS 26 liquid glass" language used on the homepage's PromptHero. */}
        <Reveal delay={0.06}>
          <div
            className="relative mt-6 overflow-hidden rounded-[2rem] border border-white/60 bg-white/55 p-8 shadow-[var(--sh-s)] backdrop-blur-2xl backdrop-saturate-150 sm:p-12 dark:border-white/10 dark:bg-white/[0.05]"
          >
            <div
              aria-hidden
              className="pointer-events-none absolute -left-24 -top-24 h-64 w-64 rounded-full opacity-60"
              style={{ background: "radial-gradient(closest-side, var(--glow), transparent)" }}
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -bottom-32 -right-16 h-72 w-72 rounded-full opacity-50"
              style={{ background: "radial-gradient(closest-side, var(--glow-2), transparent)" }}
            />

            <div className="relative">
              <div className="flex flex-wrap items-center gap-3 text-xs font-medium uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200/70 bg-white/60 px-3 py-1 backdrop-blur-md dark:border-white/10 dark:bg-white/[0.06]">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: "var(--brand-gradient)" }}
                    aria-hidden
                  />
                  {post.category}
                </span>
                <span className="inline-flex items-center gap-1.5 normal-case tracking-normal text-neutral-500 dark:text-neutral-500">
                  <Clock size={13} /> {minutes} min read
                </span>
                <span className="normal-case tracking-normal text-neutral-400 dark:text-neutral-600">{published}</span>
              </div>

              <h1 className="mt-5 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">{post.title}</h1>

              <div className="article-body mt-10" dangerouslySetInnerHTML={{ __html: post.bodyHtml }} />
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="relative mt-10 overflow-hidden rounded-[1.75rem] border border-white/60 bg-white/55 p-8 text-center shadow-[var(--sh-s)] backdrop-blur-2xl backdrop-saturate-150 dark:border-white/10 dark:bg-white/[0.05]">
            <div
              aria-hidden
              className="pointer-events-none absolute left-1/2 top-1/2 -z-0 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-70 blur-[70px]"
              style={{ width: "70%", height: "160%", background: "radial-gradient(closest-side, var(--glow), transparent)" }}
            />
            <div className="relative">
              <h2 className="text-xl font-semibold tracking-tight">Ready to build your own site?</h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-neutral-600 dark:text-neutral-400">
                750 free credits, no card required — describe it and watch a real
                React app come together.
              </p>
              <ShineButton className="mt-5">
                <Link
                  href="/signup"
                  className="inline-block rounded-lg px-6 py-2.5 text-sm font-medium text-white"
                  style={{ background: "var(--brand-gradient)" }}
                >
                  Start building — free
                </Link>
              </ShineButton>
            </div>
          </div>
        </Reveal>

        {related.length > 0 && (
          <Reveal delay={0.12}>
            <div className="mt-14">
              <h3 className="text-sm font-medium uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400">
                Related reading
              </h3>
              <div className="mt-4 space-y-3">
                {related.map((r) => (
                  <MotionLift key={r.slug} lift={3}>
                    <Link
                      href={`/blog/${r.slug}`}
                      className="group flex items-center justify-between gap-3 rounded-2xl border border-white/60 bg-white/50 px-5 py-3.5 text-sm font-medium backdrop-blur-xl transition-colors hover:border-neutral-300 dark:border-white/10 dark:bg-white/[0.04] dark:hover:border-neutral-700"
                    >
                      {r.title}
                      <ArrowRight size={14} className="shrink-0 text-neutral-400 transition-transform group-hover:translate-x-1" />
                    </Link>
                  </MotionLift>
                ))}
              </div>
            </div>
          </Reveal>
        )}
      </article>

      <MarketingFooter />
    </div>
  );
}
