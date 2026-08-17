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

          <div className="mt-5 flex flex-wrap items-center gap-3 text-xs font-medium uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 px-3 py-1 dark:border-neutral-800">
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
        </Reveal>

        <Reveal delay={0.08}>
          <div className="article-body mt-10" dangerouslySetInnerHTML={{ __html: post.bodyHtml }} />
        </Reveal>

        <Reveal delay={0.1}>
          <div className="relative mt-16 overflow-hidden rounded-2xl border border-neutral-200 p-8 text-center dark:border-neutral-800">
            <div
              className="absolute inset-x-0 top-0 h-px opacity-60"
              style={{ background: "var(--brand-gradient)" }}
              aria-hidden
            />
            <h2 className="text-xl font-semibold tracking-tight">Ready to build your own site?</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-neutral-600 dark:text-neutral-400">
              750 free credits, no card required — describe it and watch a real
              React app come together.
            </p>
            <MotionLift lift={2} className="mt-5 inline-block">
              <Link
                href="/signup"
                className="inline-block rounded-lg bg-neutral-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
              >
                Start building — free
              </Link>
            </MotionLift>
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
                  <Link
                    key={r.slug}
                    href={`/blog/${r.slug}`}
                    className="group flex items-center justify-between gap-3 rounded-xl border border-neutral-200 px-5 py-3.5 text-sm font-medium transition-colors hover:border-neutral-300 dark:border-neutral-800 dark:hover:border-neutral-700"
                  >
                    {r.title}
                    <ArrowRight size={14} className="shrink-0 text-neutral-400 transition-transform group-hover:translate-x-1" />
                  </Link>
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
