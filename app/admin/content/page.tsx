import Link from "next/link";
import { notFound } from "next/navigation";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getAdminUser } from "@/lib/auth";
import { validatePosts } from "./validation";
import { loadStaleGroups, sweepBody } from "./stale";
import {
  Empty,
  StatTile,
  TableFrame,
  Th,
  buttonClass,
  fieldClass,
  focusRing,
  formatDate,
  linkClass,
  truncate,
} from "./ui";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

// Every published post, and which of them say something that is no longer true.
//
// Until this page existed, the only way to see what is live on kodely.me was to
// query the production database by hand, and the only way to change it was to
// run a seed script on the box. 56 posts, some of them wrong. That is the
// problem this list solves, so it does two things a plain viewer would not:
//
//  - it FLAGS bodies matching the stale-claim detectors in
//    content/seo/corrections/ (see ./stale.ts), which is what turns "56 posts"
//    into "the four you need to look at";
//  - it shows each post's verdict from scripts/seo/validate.mjs, so a row that
//    would be refused on save says so before anyone opens it.
//
// It never changes anything. Correcting live prose is a per-sentence judgement
// — the first detector hit in the local database is the phrase "no export
// negotiation", which matches the export-claim pattern and means the opposite —
// and an automated pass over 56 live pages is how one wrong sentence becomes 56.

type SortKey = "updated" | "published" | "title" | "category";

const SORTS: Record<SortKey, { label: string; orderBy: Prisma.BlogPostOrderByWithRelationInput }> = {
  updated: { label: "Recently updated", orderBy: { updatedAt: "desc" } },
  published: { label: "Recently published", orderBy: { publishedAt: "desc" } },
  title: { label: "Title", orderBy: { title: "asc" } },
  category: { label: "Category", orderBy: { category: "asc" } },
};

function isSortKey(v: unknown): v is SortKey {
  // hasOwnProperty, not `in` — see the identical guard in app/admin/users.
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(SORTS, v);
}

function first(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

function href(params: {
  q: string;
  category: string;
  sort: SortKey;
  only: string;
  page: number;
}): string {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.category) sp.set("category", params.category);
  if (params.sort !== "updated") sp.set("sort", params.sort);
  if (params.only) sp.set("only", params.only);
  if (params.page > 1) sp.set("page", String(params.page));
  const qs = sp.toString();
  return qs ? `/admin/content?${qs}` : "/admin/content";
}

export default async function AdminContentPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // Defense in depth — app/admin/layout.tsx is the primary gate, but a layout
  // is not an authorization boundary on its own. 404 rather than redirect, so a
  // non-admin learns nothing about this path.
  if (!(await getAdminUser())) notFound();

  const sp = await searchParams;
  const q = first(sp.q).trim();
  const category = first(sp.category).trim();
  const sortRaw = first(sp.sort);
  const sort: SortKey = isSortKey(sortRaw) ? sortRaw : "updated";
  const onlyRaw = first(sp.only);
  const only = onlyRaw === "flagged" || onlyRaw === "invalid" ? onlyRaw : "";
  const pageRaw = Number.parseInt(first(sp.page), 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;

  // ── The whole corpus, once ────────────────────────────────────────────────
  // Both the stale sweep and the validator are corpus-wide by nature: a flag
  // count that only covered the visible 25 rows would understate exactly the
  // number this page exists to report, and four of the validator's checks
  // (duplicate slug, duplicate title, duplicate metaDescription, and whether an
  // internal /blog/… link resolves) are meaningless post-by-post. So every body
  // is read on every request. At 56 posts of a few kilobytes each on an
  // internal panel that is a few hundred kilobytes and some regex — cheap
  // enough to be worth the accuracy, and the reason to revisit it would be the
  // corpus growing by an order of magnitude, not this page feeling slow.
  const all = await db.blogPost.findMany({
    orderBy: { slug: "asc" },
    select: {
      slug: true,
      title: true,
      metaDescription: true,
      category: true,
      targetKeyword: true,
      bodyHtml: true,
    },
  });

  const groups = loadStaleGroups();
  const verdicts = validatePosts(all);

  const flags = new Map<string, string[]>();
  const perGroup = new Map<string, number>();
  for (const post of all) {
    const names = [...new Set(sweepBody(post.bodyHtml, groups).map((h) => h.group))];
    if (names.length === 0) continue;
    flags.set(post.slug, names);
    for (const n of names) perGroup.set(n, (perGroup.get(n) ?? 0) + 1);
  }

  const invalidSlugs = new Set(
    all.filter((p) => (verdicts.get(p.slug)?.problems.length ?? 0) > 0).map((p) => p.slug),
  );

  const categories = [...new Set(all.map((p) => p.category))].sort();

  // ── The visible page ──────────────────────────────────────────────────────
  // Search and category run in the database; the two "only" filters are
  // computed above and applied as a slug set, which keeps one source of truth
  // for what counts as flagged.
  const restrictTo =
    only === "flagged" ? [...flags.keys()] : only === "invalid" ? [...invalidSlugs] : null;

  const where: Prisma.BlogPostWhereInput = {
    ...(category ? { category } : {}),
    ...(restrictTo ? { slug: { in: restrictTo } } : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" as const } },
            { slug: { contains: q, mode: "insensitive" as const } },
            { bodyHtml: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [total, posts] = await Promise.all([
    db.blogPost.count({ where }),
    db.blogPost.findMany({
      where,
      // `slug` breaks ties so paging is stable when two rows share a timestamp
      // — same idiom as /admin/users.
      orderBy: [SORTS[sort].orderBy, { slug: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        slug: true,
        title: true,
        category: true,
        publishedAt: true,
        updatedAt: true,
      },
    }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const flaggedCount = flags.size;

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <Link href="/admin" className={`text-xs text-black/50 dark:text-white/50 ${linkClass}`}>
          ← kodely admin
        </Link>
        <div className="mt-1 text-lg font-semibold tracking-tight">Blog &amp; SEO content</div>
        <p className="text-sm text-black/60 dark:text-white/60">
          Every published post, searchable, with the passages that no longer match the product
          flagged for a human to read.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="Published posts" value={all.length} />
        <StatTile
          label="Flagged as stale"
          value={flaggedCount}
          tone={flaggedCount > 0 ? "warn" : undefined}
          hint={
            flaggedCount > 0
              ? "matched a detector — needs a human"
              : "no post matches a known-stale claim"
          }
        />
        <StatTile
          label="Failing validation"
          value={invalidSlugs.size}
          tone={invalidSlugs.size > 0 ? "bad" : undefined}
          hint="would be refused on save"
        />
        <StatTile label="Matching this view" value={total} hint={`page ${page} / ${pageCount}`} />
      </div>

      {perGroup.size > 0 ? (
        <div className="mb-6 rounded-xl border border-amber-600/40 p-4 text-sm dark:border-amber-500/40">
          <div className="text-xs font-medium uppercase tracking-wide text-amber-700 dark:text-amber-500">
            Stale-claim detectors that matched
          </div>
          <ul className="mt-2 space-y-1">
            {groups
              .filter((g) => perGroup.has(g.group))
              .map((g) => (
                <li key={g.group} className="text-xs text-black/70 dark:text-white/70">
                  <span className="font-mono font-medium">{g.group}</span>{" "}
                  <span className="tabular-nums">
                    — {perGroup.get(g.group)} post{perGroup.get(g.group) === 1 ? "" : "s"}
                  </span>
                  {g.gate ? (
                    <span className="text-amber-700 dark:text-amber-500">
                      {" "}
                      · only true after {g.gate}
                    </span>
                  ) : null}
                  <span className="text-black/45 dark:text-white/45"> · {g.source}</span>
                </li>
              ))}
          </ul>
          <p className="mt-2 text-xs text-black/55 dark:text-white/55">
            A detector finds candidate sentences; it does not decide. Open a post to read each match
            in context.
          </p>
        </div>
      ) : null}

      <form method="get" action="/admin/content" className="mb-6 flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="text-xs text-black/60 dark:text-white/60">Search</span>
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Title, slug or body text"
            className={`mt-1 w-64 ${fieldClass}`}
          />
        </label>
        <label className="block">
          <span className="text-xs text-black/60 dark:text-white/60">Category</span>
          <select name="category" defaultValue={category} className={`mt-1 ${fieldClass} w-44`}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-black/60 dark:text-white/60">Show</span>
          <select name="only" defaultValue={only} className={`mt-1 ${fieldClass} w-44`}>
            <option value="">Everything</option>
            <option value="flagged">Flagged as stale</option>
            <option value="invalid">Failing validation</option>
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-black/60 dark:text-white/60">Sort</span>
          <select name="sort" defaultValue={sort} className={`mt-1 ${fieldClass} w-48`}>
            {(Object.keys(SORTS) as SortKey[]).map((k) => (
              <option key={k} value={k}>
                {SORTS[k].label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={buttonClass}>
          Apply
        </button>
        {q || category || only || sort !== "updated" ? (
          <Link
            href="/admin/content"
            className={`px-1 py-2 text-sm text-black/50 dark:text-white/50 ${linkClass}`}
          >
            Clear
          </Link>
        ) : null}
      </form>

      {posts.length === 0 ? (
        <Empty>
          {q || category || only
            ? "No post matches this view."
            : "No posts in the database yet."}
        </Empty>
      ) : (
        <TableFrame>
          <thead>
            <tr className="border-b border-black/10 text-xs text-black/50 dark:border-white/10 dark:text-white/50">
              <Th>Title</Th>
              <Th>Category</Th>
              <Th>Published</Th>
              <Th>Updated</Th>
              <Th>Flags</Th>
              <Th align="right">Checks</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/10 dark:divide-white/10">
            {posts.map((p) => {
              const verdict = verdicts.get(p.slug);
              const names = flags.get(p.slug) ?? [];
              return (
                <tr key={p.slug}>
                  <td className="max-w-sm px-4 py-2.5 align-top">
                    <Link
                      href={`/admin/content/${p.slug}`}
                      className={`font-medium ${linkClass}`}
                    >
                      {truncate(p.title, 62)}
                    </Link>
                    <div className="font-mono text-xs text-black/45 dark:text-white/45">
                      /blog/{p.slug}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 align-top text-black/70 dark:text-white/70">
                    {p.category}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 align-top tabular-nums text-black/70 dark:text-white/70">
                    {formatDate(p.publishedAt)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 align-top tabular-nums text-black/70 dark:text-white/70">
                    {formatDate(p.updatedAt)}
                  </td>
                  <td className="px-4 py-2.5 align-top">
                    {names.length === 0 ? (
                      <span className="text-black/30 dark:text-white/30">—</span>
                    ) : (
                      <span className="flex flex-wrap gap-1">
                        {names.map((n) => (
                          <span
                            key={n}
                            className="rounded-full border border-amber-600/40 px-2 py-0.5 font-mono text-xs text-amber-700 dark:border-amber-500/40 dark:text-amber-500"
                          >
                            {n}
                          </span>
                        ))}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right align-top tabular-nums">
                    {verdict && verdict.problems.length > 0 ? (
                      <span className="text-red-600 dark:text-red-400">
                        {verdict.problems.length} problem
                        {verdict.problems.length === 1 ? "" : "s"}
                      </span>
                    ) : verdict && verdict.warnings.length > 0 ? (
                      <span className="text-amber-600 dark:text-amber-500">
                        {verdict.warnings.length} warning
                        {verdict.warnings.length === 1 ? "" : "s"}
                      </span>
                    ) : (
                      <span className="text-emerald-600 dark:text-emerald-400">ok</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableFrame>
      )}

      <div className="mt-4 flex items-center justify-between text-sm">
        <span className="text-black/50 dark:text-white/50">
          {total === 0
            ? "0 posts"
            : `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total}`}
        </span>
        <span className="flex gap-2">
          {page > 1 ? (
            <Link
              href={href({ q, category, sort, only, page: page - 1 })}
              className={`rounded-xl border border-black/10 px-3 py-1.5 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5 ${focusRing}`}
            >
              Previous
            </Link>
          ) : null}
          {page < pageCount ? (
            <Link
              href={href({ q, category, sort, only, page: page + 1 })}
              className={`rounded-xl border border-black/10 px-3 py-1.5 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5 ${focusRing}`}
            >
              Next
            </Link>
          ) : null}
        </span>
      </div>

      <p className="mt-6 text-xs leading-relaxed text-black/50 dark:text-white/50">
        Checks are <span className="font-mono">scripts/seo/validate.mjs</span> — the same rules the
        content pipeline runs, imported rather than re-implemented, so the panel and the pipeline
        cannot drift. Flags are the <span className="font-mono">detect</span> patterns from{" "}
        <span className="font-mono">content/seo/corrections/*.json</span>, read fresh on every
        request, with the same <span className="font-mono">ignore</span> windows{" "}
        <span className="font-mono">scripts/seo/correct-live.mjs</span> applies. Nothing on this
        page writes.
      </p>
    </div>
  );
}
