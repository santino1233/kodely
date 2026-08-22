import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminUser } from "@/lib/auth";
import { ADMIN_ACTIONS, recordAdminAction } from "@/lib/admin-audit";
import { ASSET_PROVENANCE, PROVENANCE_GAP, PROVENANCE_REQUIREMENTS } from "@/lib/assets/provenance";
import type { IconWeight } from "@/lib/assets/icons";
import {
  ICON_WEIGHTS_ORDER,
  KIND_LABELS,
  buildRows,
  categoryFacets,
  filterRows,
  formatBytes,
  formatFacets,
  kindFacets,
  scanRepoMedia,
  totalBytes,
  type AssetRow,
  type Facet,
} from "./catalogue";
import {
  AssetPreview,
  Empty,
  Notice,
  Panel,
  StatTile,
  TableFrame,
  Tag,
  Th,
  buttonClass,
  fieldClass,
  linkClass,
  truncate,
} from "./ui";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 60;

// The asset library, as an operator sees it rather than as the build agent
// sees it. Three questions, in this order:
//
//   1. What can the agent actually reach for right now?
//   2. What is missing?
//   3. Where did each thing come from, and under what licence?
//
// (3) is why this page exists at all. docs/research/asset-sources.md §5 calls
// the sublicence question "the single biggest legal risk" in this area, and the
// prerequisite for answering it is a provenance record. The catalogue has none
// per asset — so the page says that, loudly, on every tab, rather than showing
// a blank column or guessing. See lib/assets/provenance.ts.
//
// ── WHY THE THREE TABS SPLIT THE WAY THEY DO ──────────────────────────────
// "Icons" holds the ENTIRE in-repo catalogue — icons, flags, gradients,
// dividers, backdrops, spot illustrations, the lot — because every one of them
// is inline SVG or CSS. "Images" and "Videos" hold raster photography and
// video, of which there is none. That looks lopsided and it is: it is the shape
// of the actual catalogue. Splitting gradients or backdrops into "Images" to
// balance the tabs would make an empty tab look populated and would hide the
// one fact this page most needs to convey — the agent cannot place a
// photograph, at all, today.

// ── Params ────────────────────────────────────────────────────────────────
// Every guard below is Object.prototype.hasOwnProperty.call, never `in`. `in`
// walks the prototype chain, so `?tab=toString` would pass a guard whose whole
// job is to say "this is one of ours" and the caller would then read a Function
// off the map. That exact shape was a live 500 on /admin/sites — see the note
// on hasKey in app/admin/sites/ui.tsx.

type Tab = "icons" | "images" | "videos";

const TABS: Record<Tab, { label: string; blurb: string }> = {
  icons: {
    label: "Icons",
    blurb:
      "Every asset in lib/assets — icons, flags, gradients, dividers, backdrops, spot illustrations and the rest. All of it inline SVG or CSS, all of it reachable by the build agent's find_assets tool today.",
  },
  images: {
    label: "Images",
    blurb:
      "Raster and photographic images the build agent can place in a generated site. There are none, and that is by construction rather than by omission.",
  },
  videos: {
    label: "Videos",
    blurb: "Video the build agent can place in a generated site. There is none, and no delivery path for any.",
  },
};

function has(map: object, key: unknown): key is string {
  return typeof key === "string" && Object.prototype.hasOwnProperty.call(map, key);
}

/** Narrow a raw param to a key of a closed map, or fall back. */
function pick<K extends string>(map: Record<K, unknown>, raw: string, fallback: K): K {
  return has(map, raw) ? (raw as K) : fallback;
}

/**
 * The same narrowing for the two facets whose option lists are DERIVED from the
 * catalogue rather than declared. A Record is built from the facet values first
 * precisely so the check stays hasOwnProperty rather than becoming an
 * `Array.includes` special case that reads differently from every other guard
 * on the page.
 */
function pickFacet(facets: Facet[], raw: string): string {
  const allowed: Record<string, true> = {};
  for (const f of facets) allowed[f.value] = true;
  return has(allowed, raw) ? raw : "";
}

function first(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

type Query = {
  tab: Tab;
  q: string;
  kind: string;
  category: string;
  style: string;
  weight: IconWeight;
  page: number;
};

function href(params: Query): string {
  const sp = new URLSearchParams();
  if (params.tab !== "icons") sp.set("tab", params.tab);
  if (params.q) sp.set("q", params.q);
  if (params.kind) sp.set("kind", params.kind);
  if (params.category) sp.set("category", params.category);
  if (params.style) sp.set("style", params.style);
  if (params.weight !== "regular") sp.set("weight", params.weight);
  if (params.page > 1) sp.set("page", String(params.page));
  const qs = sp.toString();
  return qs ? `/admin/assets?${qs}` : "/admin/assets";
}

// ── The licence audit, transcribed ────────────────────────────────────────
//
// docs/research/asset-sources.md is the source of truth; this is a summary of
// its verdict table for the two empty tabs. Transcribed rather than parsed out
// of the markdown at request time for two reasons: docs/ is not guaranteed to
// be present in a deployed build the way public/ is, and a table parser that
// silently returns nothing when the doc is reformatted would turn a legal
// summary into a blank panel. The review date is carried so a stale
// transcription is visible as a date, not as a wrong verdict.

const AUDIT_DOC = "docs/research/asset-sources.md";
const AUDIT_REVIEWED = "2026-08-22";

type Verdict = "conditions" | "avoid";

type SourceRow = { source: string; verdict: Verdict; note: string };

const IMAGE_SOURCES: SourceRow[] = [
  {
    source: "pixabay.com",
    verdict: "conditions",
    note: "Recommended primary (§4). Their API rules REQUIRE self-hosting — 'download them to your server first' — which is the architecture our CSP already forces. 100 req/60s, responses must be cached 24h, attribution is a soft request tied to showing search results (i.e. our UI, not the customer's footer).",
  },
  {
    source: "pexels.com",
    verdict: "conditions",
    note: "Recommended secondary (§4). Costs a prominent Pexels link in the builder UI, caps at 200 req/hr, and bulk pre-scraping is prohibited — on-demand fetch per build is the only compliant route.",
  },
  {
    source: "unsplash.com",
    verdict: "avoid",
    note: "The API mandates hotlinking the returned URLs, which img-src 'self' forbids outright, and requires Unsplash + photographer attribution on every display.",
  },
  {
    source: "vecteezy.com",
    verdict: "avoid",
    note: "'Using Content within software applications which allow a third party to generate on-demand designs is also not permitted.' That sentence describes Kodely.",
  },
  {
    source: "kaboompics.com",
    verdict: "avoid",
    note: "Friendliest licence reviewed, but the FAQ answers our exact question: putting the images in a website builder 'requires individual negotiations'. One owner, direct contact — nobody has asked yet.",
  },
  {
    source: "getillustrations.com",
    verdict: "avoid",
    note: "Free tier excludes client projects and requires a visible footer credit. Paid Standard would cover it, if bought.",
  },
];

const VIDEO_SOURCES: SourceRow[] = [
  {
    source: "pixabay.com",
    verdict: "conditions",
    note: "Same licence and API terms as its photos, and the same unresolved sublicence question (§5).",
  },
  {
    source: "dareful.com",
    verdict: "conditions",
    note: "CC BY 4.0 — irrevocable and it runs to downstream recipients, so the sublicence problem does not exist here. The cost is that the credit is a CONDITION of the licence and has to appear on the customer's site, not in our builder. A few hundred clips, no API.",
  },
  {
    source: "mixkit.co",
    verdict: "avoid",
    note: "The licence says 'sub-licensable'; the User Terms forbid making an Item 'available to any third party'. Internally contradictory, and ambiguity resolves against us.",
  },
  {
    source: "coverr.co",
    verdict: "avoid",
    note: "The only source that names the product category outright: content may not be offered as part of services including 'website builders'.",
  },
];

export default async function AdminAssetsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // Defense in depth — app/admin/layout.tsx is the primary gate, but a layout
  // is not an authorization boundary on its own (it does not re-render on every
  // navigation within the section). 404 rather than redirect, so a non-admin
  // learns nothing about this path. Same idiom as every other page here.
  const admin = await getAdminUser();
  if (!admin) notFound();

  const sp = await searchParams;
  const tab = pick(TABS, first(sp.tab), "icons");
  const weight = pick(ICON_WEIGHTS_ORDER, first(sp.weight), "regular");
  const q = first(sp.q).trim().slice(0, 120);
  const pageRaw = Number.parseInt(first(sp.page), 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;

  // BEFORE the work, and awaited — see recordAdminAction in lib/admin-audit.ts.
  //
  // Note this page holds NO customer data, which by the vocabulary's own rule
  // ("every read of a surface that exposes customer data") would put it in the
  // /admin/flags bucket, where reads are deliberately unrecorded. It is
  // recorded anyway because of what the page asserts rather than what it shows:
  // it is the surface an operator reads to answer "where did the artwork on
  // this customer's site come from", and the licence audit asks for an evidence
  // trail around exactly that question. `q` is NOT logged — the meta rule is
  // ids, counts and short enums only.
  await recordAdminAction(admin, ADMIN_ACTIONS.assetLibraryViewed, { meta: { tab, page } });

  const rows = buildRows(weight);
  const kinds = kindFacets(rows);
  const categories = categoryFacets(rows);
  const formats = formatFacets(rows);

  const allowedKinds: Record<string, true> = {};
  for (const k of kinds) allowedKinds[k.value] = true;
  const kind = has(allowedKinds, first(sp.kind)) ? first(sp.kind) : "";
  const category = pickFacet(categories, first(sp.category));
  const style = pickFacet(formats, first(sp.style));

  const query: Query = { tab, q, kind, category, style, weight, page };

  const media = await scanRepoMedia();

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <Link href="/admin" className={`text-xs text-black/50 dark:text-white/50 ${linkClass}`}>
          ← kodely admin
        </Link>
        <div className="mt-1 text-lg font-semibold tracking-tight">Asset library</div>
        <p className="text-sm text-black/60 dark:text-white/60">
          What the build agent can reach for, what it cannot, and where each thing came from.
          Everything here is read out of <span className="font-mono text-xs">lib/assets</span> at
          request time — this page stores nothing and fetches nothing.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile
          label="Icons &amp; vectors"
          value={rows.length}
          hint={`${formatBytes(totalBytes(rows))} of source across ${kinds.length} kinds`}
        />
        <StatTile
          label="Images"
          value={0}
          tone="warn"
          hint="no raster asset in the catalogue"
        />
        <StatTile label="Videos" value={0} tone="warn" hint="no video asset, and no delivery path" />
        <StatTile
          label="Assets with recorded provenance"
          value={0}
          tone="bad"
          hint={`0 of ${rows.length} carry a licence field`}
        />
      </div>

      {/* On every tab, not just the catalogue one. A licence caveat that only
          appears next to the assets it qualifies is a caveat someone can miss
          by landing on a different tab. */}
      <div className="mb-6">
        <Notice tone="bad" title="Provenance is not recorded per asset">
          <p>{PROVENANCE_GAP}</p>
          <p>
            Read the <span className="font-medium">Source &amp; licence</span> column below as
            &ldquo;the claim the file this asset lives in makes about all of its contents&rdquo;,
            never as &ldquo;the licence recorded for this asset&rdquo;. The four claims, and how
            well each is evidenced, are in the panel at the bottom of the Icons tab.
          </p>
        </Notice>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {(Object.keys(TABS) as Tab[]).map((t) => (
          <Link
            key={t}
            href={href({ ...query, tab: t, page: 1 })}
            aria-current={t === tab ? "page" : undefined}
            className={`rounded-xl border px-3 py-1.5 text-sm ${
              t === tab
                ? "border-black/40 font-medium dark:border-white/40"
                : "border-black/10 text-black/60 hover:bg-black/5 dark:border-white/10 dark:text-white/60 dark:hover:bg-white/5"
            }`}
          >
            {TABS[t].label}
            <span className="ml-2 tabular-nums text-black/40 dark:text-white/40">
              {t === "icons" ? rows.length : 0}
            </span>
          </Link>
        ))}
      </div>
      <p className="mb-6 text-xs text-black/50 dark:text-white/50">{TABS[tab].blurb}</p>

      {tab === "icons" ? (
        <IconsTab
          rows={rows}
          kinds={kinds}
          categories={categories}
          formats={formats}
          query={query}
        />
      ) : tab === "images" ? (
        <MediaTab
          what="image"
          sources={IMAGE_SOURCES}
          found={media.images}
          scanError={media.error}
          rows={rows}
          query={query}
        />
      ) : (
        <MediaTab
          what="video"
          sources={VIDEO_SOURCES}
          found={media.videos}
          scanError={media.error}
          rows={rows}
          query={query}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Icons tab — the catalogue that actually exists
// ---------------------------------------------------------------------------

function IconsTab({
  rows,
  kinds,
  categories,
  formats,
  query,
}: {
  rows: AssetRow[];
  kinds: Facet[];
  categories: Facet[];
  formats: Facet[];
  query: Query;
}) {
  const matched = filterRows(rows, {
    q: query.q,
    kind: query.kind,
    category: query.category,
    format: query.style,
  });
  const pageCount = Math.max(1, Math.ceil(matched.length / PAGE_SIZE));
  const page = Math.min(query.page, pageCount);
  const visible = matched.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const filtered = Boolean(query.q || query.kind || query.category || query.style);

  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="Matching this view" value={matched.length} hint={`page ${page} / ${pageCount}`} />
        <StatTile label="Source bytes shown" value={formatBytes(totalBytes(matched))} />
        <StatTile label="Kinds" value={kinds.length} hint="every AssetKind with at least one asset" />
        <StatTile
          label="Icon stroke weight"
          value={query.weight}
          hint="a render option, not a filter — it changes what the agent is handed, not what exists"
        />
      </div>

      <form method="get" action="/admin/assets" className="mb-6 flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="text-xs text-black/60 dark:text-white/60">Search</span>
          <input
            type="search"
            name="q"
            defaultValue={query.q}
            placeholder="Name, id or tag"
            className={`mt-1 w-56 ${fieldClass}`}
          />
        </label>
        <label className="block">
          <span className="text-xs text-black/60 dark:text-white/60">Kind</span>
          <select name="kind" defaultValue={query.kind} className={`mt-1 w-44 ${fieldClass}`}>
            <option value="">All kinds</option>
            {kinds.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label} ({k.count})
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-black/60 dark:text-white/60">Category</span>
          <select name="category" defaultValue={query.category} className={`mt-1 w-52 ${fieldClass}`}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label} ({c.count})
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-black/60 dark:text-white/60">Style</span>
          <select name="style" defaultValue={query.style} className={`mt-1 w-48 ${fieldClass}`}>
            <option value="">Any delivery form</option>
            {formats.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label} ({f.count})
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-black/60 dark:text-white/60">Icon weight</span>
          <select name="weight" defaultValue={query.weight} className={`mt-1 w-40 ${fieldClass}`}>
            {(Object.keys(ICON_WEIGHTS_ORDER) as IconWeight[]).map((w) => (
              <option key={w} value={w}>
                {ICON_WEIGHTS_ORDER[w]}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={buttonClass}>
          Apply
        </button>
        {filtered || query.weight !== "regular" ? (
          <Link
            href="/admin/assets"
            className={`px-1 py-2 text-sm text-black/50 dark:text-white/50 ${linkClass}`}
          >
            Clear
          </Link>
        ) : null}
      </form>

      <p className="mb-4 text-xs text-black/50 dark:text-white/50">
        Search here is a literal substring match over name, id and tags — deliberately not the
        agent&rsquo;s own search. <span className="font-mono">findAssets()</span> in{" "}
        <span className="font-mono">lib/assets/index.ts</span> is keyword-scored with synonym
        expansion and returns a ranked top-N, so it answers &ldquo;what would the model pick for
        this phrase&rdquo;; this box answers &ldquo;what is in here&rdquo;. Try the former at{" "}
        <span className="font-mono">GET /api/assets?q=…</span>.
      </p>

      {visible.length === 0 ? (
        <Empty>
          {filtered
            ? "No asset matches this view."
            : "The catalogue is empty, which should be impossible — lib/assets ships its data as source."}
        </Empty>
      ) : (
        <TableFrame>
          <thead>
            <tr className="border-b border-black/10 text-xs text-black/50 dark:border-white/10 dark:text-white/50">
              <Th>Preview</Th>
              <Th>Name / id</Th>
              <Th>Kind &amp; category</Th>
              <Th>Tags</Th>
              <Th>Style</Th>
              <Th align="right">Size</Th>
              <Th>Source &amp; licence</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/10 dark:divide-white/10">
            {visible.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2 align-top">
                  <AssetPreview preview={r.preview} label={`${r.name} preview`} />
                </td>
                <td className="max-w-[14rem] px-4 py-2 align-top">
                  <div className="font-medium">{truncate(r.name, 34)}</div>
                  <div className="font-mono text-xs text-black/45 dark:text-white/45">{r.id}</div>
                </td>
                <td className="px-4 py-2 align-top text-black/70 dark:text-white/70">
                  {KIND_LABELS[r.kind]}
                  {r.categoryLabel ? (
                    <div className="text-xs text-black/45 dark:text-white/45">
                      {r.categoryLabel}
                    </div>
                  ) : null}
                </td>
                <td className="max-w-[16rem] px-4 py-2 align-top">
                  <span className="flex flex-wrap gap-1">
                    {r.keywords.slice(0, 6).map((k) => (
                      <Tag key={k}>{k}</Tag>
                    ))}
                    {r.keywords.length > 6 ? (
                      <span className="text-[11px] text-black/35 dark:text-white/35">
                        +{r.keywords.length - 6}
                      </span>
                    ) : null}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-2 align-top text-xs text-black/70 dark:text-white/70">
                  {r.format}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-right align-top tabular-nums text-black/70 dark:text-white/70">
                  {formatBytes(r.bytes)}
                </td>
                <td className="max-w-[20rem] px-4 py-2 align-top">
                  <div className="text-black/70 dark:text-white/70">
                    {r.provenance.licenceShort}
                    {r.provenance.confidence === "inferred" ? (
                      <span className="ml-1 text-amber-600 dark:text-amber-500">· inferred</span>
                    ) : null}
                  </div>
                  <div className="font-mono text-xs text-black/45 dark:text-white/45">
                    {r.provenance.module}
                  </div>
                  {r.assetCaveats.map((c) => (
                    <div key={c} className="mt-1 text-xs text-amber-700 dark:text-amber-500">
                      {c}
                    </div>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </TableFrame>
      )}

      <div className="mt-4 flex items-center justify-between text-sm">
        <span className="text-black/50 dark:text-white/50">
          {matched.length === 0
            ? "0 assets"
            : `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, matched.length)} of ${matched.length}`}
        </span>
        <span className="flex gap-2">
          {page > 1 ? (
            <Link
              href={href({ ...query, page: page - 1 })}
              className="rounded-xl border border-black/10 px-3 py-1.5 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
            >
              Previous
            </Link>
          ) : null}
          {page < pageCount ? (
            <Link
              href={href({ ...query, page: page + 1 })}
              className="rounded-xl border border-black/10 px-3 py-1.5 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
            >
              Next
            </Link>
          ) : null}
        </span>
      </div>

      <div className="mt-8">
        <Panel
          title="Where these assets came from"
          subtitle={
            <>
              One row per source module, not per asset — because that is the granularity at which
              the claim is actually made. Each <span className="font-medium">claim</span> is
              transcribed from that file&rsquo;s header comment.
            </>
          }
        >
          <div className="space-y-4">
            {ASSET_PROVENANCE.map((p) => (
              <div
                key={p.id}
                className="rounded-xl border border-black/10 p-4 text-sm dark:border-white/10"
              >
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <span className="font-mono text-xs font-medium">{p.module}</span>
                  <span className="text-black/70 dark:text-white/70">{p.licenceShort}</span>
                  <span
                    className={`text-xs ${
                      p.confidence === "declared"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-amber-600 dark:text-amber-500"
                    }`}
                  >
                    {p.confidence === "declared"
                      ? "declared in the file header"
                      : "inferred — the header never states it"}
                  </span>
                </div>
                <div className="mt-1 text-black/70 dark:text-white/70">{p.origin}</div>
                <blockquote className="mt-2 border-l-2 border-black/15 pl-3 text-xs italic text-black/60 dark:border-white/15 dark:text-white/60">
                  {p.claim}
                </blockquote>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-black/55 dark:text-white/55">
                  {p.caveats.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-5 text-xs text-black/55 dark:text-white/55">
            <div className="font-medium text-black/70 dark:text-white/70">
              What has to exist before anything third-party is added here
            </div>
            <ul className="mt-1.5 list-disc space-y-1 pl-5">
              {PROVENANCE_REQUIREMENTS.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        </Panel>
      </div>

      <p className="mt-6 text-xs leading-relaxed text-black/50 dark:text-white/50">
        Every preview above is the real asset, rendered inline from the string in the repository —
        no network request is made by this page, for the same reason no generated site can make one
        (<span className="font-mono">img-src &apos;self&apos; data:</span>). Size is the UTF-8 length
        of the exact <span className="font-mono">source</span> the agent is handed for that asset at
        the selected icon weight — not of some other rendering of the same drawing. (The three icon
        weights happen to cost identical bytes: they differ only in a{" "}
        <span className="font-mono">stroke-width</span> value, and 1.25, 1.75 and 2.25 are all four
        characters. The weight changes the picture, not the budget.)
      </p>
    </>
  );
}

// ---------------------------------------------------------------------------
// Images / Videos — the empty tabs, and why they are empty
// ---------------------------------------------------------------------------

function MediaTab({
  what,
  sources,
  found,
  scanError,
  rows,
  query,
}: {
  what: "image" | "video";
  sources: SourceRow[];
  found: { path: string; bytes: number }[];
  scanError: string | null;
  rows: AssetRow[];
  query: Query;
}) {
  const standIns = rows.filter((r) =>
    ["gradient", "mesh", "texture", "backdrop", "illustration", "empty-state", "avatar"].includes(
      r.kind,
    ),
  ).length;

  return (
    <div className="space-y-6">
      <Notice tone="warn" title={`The catalogue holds no ${what} assets — zero, not "not yet indexed"`}>
        <p>
          <span className="font-mono text-xs">lib/assets/index.ts</span> says so in its own header,
          and gives the reason:{" "}
          {what === "image" ? (
            <>
              &ldquo;Photography. Not &lsquo;not yet&rsquo; — there is no host to serve it from, and
              a base64 raster would cost more in model context than the rest of a build.&rdquo;
            </>
          ) : (
            <>
              the same constraint that rules out photography rules out video, with the byte problem
              an order of magnitude worse.
            </>
          )}{" "}
          Generated sites run under{" "}
          <span className="font-mono text-xs">
            default-src &apos;self&apos;; img-src &apos;self&apos; data:; connect-src &apos;none&apos;
          </span>
          , so there is no external host to fetch from, and{" "}
          <span className="font-mono text-xs">docs/research/asset-sources.md</span> §7.2 records that
          the delivery path a real {what} would need — downloaded bytes becoming files in the built
          site, served by the existing site route — does not exist yet.
        </p>
        <p>
          No placeholder rows are shown below. An empty table here is the finding, and inventing
          thumbnails to fill it would hide the one thing an operator needs to know: the build agent
          cannot place a {what} today, under any prompt.
        </p>
      </Notice>

      <Panel
        title="What would fill this tab"
        subtitle={
          <>
            Transcribed from <span className="font-mono">{AUDIT_DOC}</span>, reviewed{" "}
            {AUDIT_REVIEWED}. Verdicts are that document&rsquo;s, not this page&rsquo;s — read it
            before acting on any of them.
          </>
        }
      >
        <TableFrame>
          <thead>
            <tr className="border-b border-black/10 text-xs text-black/50 dark:border-white/10 dark:text-white/50">
              <Th>Source</Th>
              <Th>Verdict</Th>
              <Th>Why</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/10 dark:divide-white/10">
            {sources.map((s) => (
              <tr key={s.source}>
                <td className="whitespace-nowrap px-4 py-2 align-top font-mono text-xs">
                  {s.source}
                </td>
                <td className="whitespace-nowrap px-4 py-2 align-top text-xs font-medium">
                  {s.verdict === "conditions" ? (
                    <span className="text-amber-700 dark:text-amber-500">USE WITH CONDITIONS</span>
                  ) : (
                    <span className="text-red-600 dark:text-red-400">AVOID</span>
                  )}
                </td>
                <td className="px-4 py-2 align-top text-xs text-black/70 dark:text-white/70">
                  {s.note}
                </td>
              </tr>
            ))}
          </tbody>
        </TableFrame>

        <div className="mt-4 text-xs leading-relaxed text-black/60 dark:text-white/60">
          <span className="font-medium text-black/75 dark:text-white/75">
            Two blockers sit in front of every &ldquo;use with conditions&rdquo; row.
          </span>{" "}
          (1) The sublicence question, §5: every one of these licences grants rights to the person
          who DOWNLOADS the file, and none of the recommended ones expressly grants the right to
          pass those rights to the customer whose site the file ends up on. Four of the four sources
          that addressed the question at all said no, or not without a deal. (2) There is no
          delivery path (§7.2) and no per-asset provenance record (§5, mitigation 2) — the second is
          the gap this page is reporting at the top.
        </div>
      </Panel>

      <Panel
        title={`Raster ${what === "image" ? "images" : "video"} that exist in this repository`}
        subtitle={
          <>
            A live scan of <span className="font-mono">public/</span> on each request, so this is
            evidence rather than an assertion. Files here are Kodely&rsquo;s own chrome; none of
            them is in the catalogue, and the build agent has no way to reference one.
          </>
        }
      >
        {scanError ? (
          <Notice tone="bad" title="The scan could not run">
            <p>
              <span className="font-mono text-xs">{scanError}</span> — treat the count as unknown,
              not as zero.
            </p>
          </Notice>
        ) : found.length === 0 ? (
          <Empty>
            No {what} file anywhere under <span className="font-mono">public/</span>.
          </Empty>
        ) : (
          <>
            <TableFrame>
              <thead>
                <tr className="border-b border-black/10 text-xs text-black/50 dark:border-white/10 dark:text-white/50">
                  <Th>Path</Th>
                  <Th align="right">Size</Th>
                  <Th>Recorded provenance</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/10 dark:divide-white/10">
                {found.map((f) => (
                  <tr key={f.path}>
                    <td className="px-4 py-2 font-mono text-xs">{f.path}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums text-black/70 dark:text-white/70">
                      {formatBytes(f.bytes)}
                    </td>
                    <td className="px-4 py-2 text-xs text-red-600 dark:text-red-400">
                      None — no source, author or licence is recorded anywhere for this file
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableFrame>
            <p className="mt-3 text-xs text-black/55 dark:text-white/55">
              These are marketing chrome for kodely.me itself, not customer output, so the sandbox
              CSP does not apply to them — but they are still {found.length} binary
              {found.length === 1 ? " file" : " files"} in the tree with no recorded origin, and the
              same provenance requirement applies the moment one is reused anywhere else.
            </p>
          </>
        )}
      </Panel>

      <Panel
        title="What the agent reaches for instead today"
        subtitle="Generated geometry, which has no licence, no host and no bytes over the wire."
      >
        <p className="text-sm text-black/70 dark:text-white/70">
          {standIns} assets in the catalogue exist specifically to stand in for photography: hero
          backdrops, spot illustrations, empty-state art, gradients, mesh backgrounds, grain
          textures and the deterministic initials avatar.{" "}
          <span className="font-mono text-xs">docs/research/asset-sources.md</span> §4 concludes
          that illustrations and textures should STAY generated — &ldquo;nothing on the reviewed
          list beats &lsquo;no licence at all&rsquo; for those two categories&rdquo;. Photography is
          the only category where a third-party source would actually add something.
        </p>
        {/* Clears q as well as the other facets: this is a "show me these"
            link, and inheriting a search the operator typed on another tab
            would silently return fewer stand-ins than the count beside it. */}
        <p className="mt-3 text-sm">
          <Link
            href={href({ ...query, tab: "icons", q: "", kind: "backdrop", category: "", style: "", page: 1 })}
            className={linkClass}
          >
            Browse the stand-ins →
          </Link>
        </p>
      </Panel>
    </div>
  );
}
