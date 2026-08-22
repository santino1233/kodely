import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getAdminUser } from "@/lib/auth";
import { validateDraft } from "../validation";
import { loadStaleGroups, sweepBody } from "../stale";
import {
  formatDateTime,
  linkClass,
  VerdictList,
  wordCount,
} from "../ui";
import { PostEditor } from "./PostEditor";

export const dynamic = "force-dynamic";

/**
 * Edit one published post.
 *
 * The slug is NOT editable. It is the live URL, it is what every internal
 * /blog/… link in the other 55 posts points at, and it is what
 * scripts/seo/correct-live.mjs addresses rows by. Renaming it from a CMS would
 * break all three at once and there is no redirect layer to catch it — so this
 * page shows the slug and refuses to be the place it changes.
 */
export default async function AdminContentPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  // Defense in depth — app/admin/layout.tsx is the primary gate, but a layout
  // is not an authorization boundary on its own. 404 rather than redirect, so a
  // non-admin learns nothing about this path. The Server Action in ../actions.ts
  // re-checks independently, because it is reachable without this page.
  if (!(await getAdminUser())) notFound();

  const { slug } = await params;

  const [post, others] = await Promise.all([
    db.blogPost.findUnique({ where: { slug } }),
    db.blogPost.findMany({
      where: { slug: { not: slug } },
      orderBy: { slug: "asc" },
      select: {
        slug: true,
        title: true,
        metaDescription: true,
        category: true,
        targetKeyword: true,
        bodyHtml: true,
      },
    }),
  ]);
  if (!post) notFound();

  const categories = [...new Set([post.category, ...others.map((o) => o.category)])].sort();

  // The verdict on the row AS PUBLISHED. Shown before anything is typed,
  // because a post that already fails is the honest explanation for a save the
  // panel is about to refuse — and, on a corpus seeded by a script, the first
  // anyone would hear of it.
  const stored = validateDraft(post, others);

  const groups = loadStaleGroups();
  const hits = sweepBody(post.bodyHtml, groups);
  const groupsHit = [...new Set(hits.map((h) => h.group))];
  const groupInfo = new Map(groups.map((g) => [g.group, g]));

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <div className="mb-8">
        <Link
          href="/admin/content"
          className={`text-xs text-black/50 dark:text-white/50 ${linkClass}`}
        >
          ← all posts
        </Link>
        <h1 className="mt-1 text-lg font-semibold tracking-tight">{post.title}</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          <span className="font-mono text-xs">/blog/{post.slug}</span> · {post.category} ·{" "}
          {wordCount(post.bodyHtml)} words · updated {formatDateTime(post.updatedAt)} · published{" "}
          {formatDateTime(post.publishedAt)}
        </p>
        <p className="mt-1 text-xs text-black/50 dark:text-white/50">
          <a
            href={`/blog/${post.slug}`}
            target="_blank"
            rel="noreferrer"
            className={linkClass}
          >
            Open the live page
          </a>{" "}
          · the slug is the live URL and is not editable here.
        </p>
      </div>

      {hits.length > 0 ? (
        <section className="mb-8 rounded-xl border border-amber-600/40 p-5 dark:border-amber-500/40">
          <h2 className="text-sm font-medium text-amber-700 dark:text-amber-500">
            {hits.length} passage{hits.length === 1 ? "" : "s"} matching a known-stale claim
          </h2>
          <p className="mt-0.5 text-xs text-black/60 dark:text-white/60">
            Matched, not judged. These are the detectors from{" "}
            <span className="font-mono">content/seo/corrections/</span>; a detector cannot tell an
            assertion from a denial of it, so read each one in context and decide. Nothing here
            edits anything.
          </p>

          {groupsHit.map((name) => {
            const info = groupInfo.get(name);
            const ofGroup = hits.filter((h) => h.group === name);
            return (
              <div key={name} className="mt-4 border-t border-black/10 pt-4 dark:border-white/10">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-mono text-xs font-medium">{name}</span>
                  <span className="text-xs text-black/50 dark:text-white/50">
                    {ofGroup.length} match{ofGroup.length === 1 ? "" : "es"} · {info?.source}
                  </span>
                  {info?.gate ? (
                    <span className="rounded-full border border-amber-600/40 px-2 py-0.5 text-xs text-amber-700 dark:border-amber-500/40 dark:text-amber-500">
                      only true after: {info.gate}
                    </span>
                  ) : null}
                </div>
                {info?.why ? (
                  <p className="mt-1.5 text-xs leading-relaxed text-black/60 dark:text-white/60">
                    {info.why}
                  </p>
                ) : null}
                {info?.gateWhy ? (
                  <p className="mt-1.5 text-xs leading-relaxed text-amber-700 dark:text-amber-500">
                    {info.gateWhy}
                  </p>
                ) : null}
                <ul className="mt-3 space-y-2">
                  {ofGroup.map((h, i) => (
                    <li
                      key={`${name}-${i}`}
                      className="rounded-xl border border-black/10 px-3 py-2 text-xs leading-relaxed dark:border-white/10"
                    >
                      <span className="text-black/45 dark:text-white/45">…{h.before}</span>
                      <mark className="bg-amber-200/70 px-0.5 font-medium text-black dark:bg-amber-500/30 dark:text-white">
                        {h.hit}
                      </mark>
                      <span className="text-black/45 dark:text-white/45">{h.after}…</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </section>
      ) : null}

      {stored.problems.length > 0 || stored.warnings.length > 0 ? (
        <section className="mb-8 rounded-xl border border-black/10 p-5 dark:border-white/10">
          <h2 className="text-sm font-medium">What is published right now</h2>
          <p className="mt-0.5 text-xs text-black/60 dark:text-white/60">
            The stored row, before any edit. Problems here must be fixed as part of the next save —
            the validator runs against the whole draft, not the diff.
          </p>
          <div className="mt-4">
            <VerdictList problems={stored.problems} warnings={stored.warnings} />
          </div>
        </section>
      ) : null}

      <PostEditor
        slug={post.slug}
        categories={categories}
        published={{
          title: post.title,
          metaDescription: post.metaDescription,
          category: post.category,
          targetKeyword: post.targetKeyword,
          bodyHtml: post.bodyHtml,
        }}
      />

      <p className="mt-8 text-xs leading-relaxed text-black/50 dark:text-white/50">
        Saving re-runs <span className="font-mono">scripts/seo/validate.mjs</span> on the server
        against the submitted fields and writes only if it finds no problems —{" "}
        <span className="font-mono">bodyHtml</span> reaches the public page through
        <span className="font-mono"> dangerouslySetInnerHTML</span> with no sanitiser and no
        wrapper, so an invalid body is a broken live page rather than a broken form. A successful
        save revalidates <span className="font-mono">/blog</span> and this post, which are otherwise
        cached for an hour.
      </p>
    </div>
  );
}
