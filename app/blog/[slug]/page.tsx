import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";

export const dynamic = "force-static";
export const revalidate = 3600;

async function getPost(slug: string) {
  return db.blogPost.findUnique({ where: { slug } });
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

  return (
    <div className="min-h-screen bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-50">
      <MarketingNav />

      <article className="mx-auto max-w-3xl px-6 pb-24 pt-12 sm:pt-16">
        <Link
          href="/blog"
          className="text-sm text-neutral-500 hover:text-neutral-900 dark:text-neutral-500 dark:hover:text-white"
        >
          ← All articles
        </Link>
        <h1 className="mt-5 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
          {post.title}
        </h1>
        <div
          className="article-body mt-10"
          dangerouslySetInnerHTML={{ __html: post.bodyHtml }}
        />
      </article>

      <MarketingFooter />
    </div>
  );
}
