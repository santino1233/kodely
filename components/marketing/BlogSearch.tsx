"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, ArrowRight } from "lucide-react";
import { RevealGroup, RevealItem } from "./Reveal";
import { MotionLift } from "./FloatCard";

type Post = { slug: string; title: string; metaDescription: string; category: string };

export function BlogSearch({ posts }: { posts: Post[] }) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return posts;
    return posts.filter(
      (p) =>
        p.title.toLowerCase().includes(query) ||
        p.metaDescription.toLowerCase().includes(query) ||
        p.category.toLowerCase().includes(query),
    );
  }, [posts, q]);

  const byCategory = useMemo(() => {
    const map = new Map<string, Post[]>();
    for (const post of filtered) {
      const list = map.get(post.category) ?? [];
      list.push(post);
      map.set(post.category, list);
    }
    return map;
  }, [filtered]);

  return (
    <>
      <div className="relative mx-auto mb-14 max-w-md">
        <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400" />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search articles…"
          className="w-full rounded-full border border-neutral-200 bg-white/70 py-2.5 pl-11 pr-4 text-sm outline-none backdrop-blur-md transition-colors placeholder:text-neutral-400 focus:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-950/70 dark:placeholder:text-neutral-600 dark:focus:border-neutral-600"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-center text-sm text-neutral-500 dark:text-neutral-500">
          No articles match “{q}”.
        </p>
      ) : (
        Array.from(byCategory.entries()).map(([category, items]) => (
          <div key={category} className="mb-16">
            <h2 className="mb-5 flex items-center gap-2 text-sm font-medium uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--brand-gradient)" }} aria-hidden />
              {category}
            </h2>
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
    </>
  );
}
