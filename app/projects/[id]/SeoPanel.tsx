"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Field";

// Search & social metadata, visible and editable WITHOUT paying for a build.
//
// Where these values actually live: there is no seo column anywhere. The head
// of the project's own `index.html` IS the storage (see lib/foundation.ts for
// the scaffold the agent is handed, and the head-writing instructions in the
// SYSTEM prompt in lib/agent.ts). So this panel reads the draft SOURCE
// index.html the editor already holds, and a save has to rewrite that same
// file — which is why the endpoint contract below is what it is.
//
// Three separate copies of index.html exist per project, and they are NOT
// interchangeable:
//   draft  + kind "source"  — what the agent edits and what this panel reads.
//   draft  + kind "build"   — the compiled output the in-editor preview serves.
//   published + kind "build" — what visitors get; only the publish route writes it.
// A save must touch the first two and must never touch the third: going live
// stays an explicit act. That is stated again on the endpoint contract below.
//
// What lib/site-seo.ts does on top of this, at serve time and for published
// sites only, is a BACKSTOP for gaps — it never overrides a value that is
// present. The "What visitors see" column mirrors those rules exactly so the
// panel can never show something different from what is actually served.

/** lib/site-seo.ts's own placeholder constant. Not exported there; mirrored. */
const PLACEHOLDER_TITLE = "Kodely Site";

// Guidance, not limits. Straight out of the SYSTEM prompt the builder is given
// (lib/agent.ts): title under ~60 characters, description ~150. Going over is
// allowed — search engines truncate, they do not reject — so this only ever
// changes a colour and a number, never disables the save.
const TITLE_TARGET = 60;
const DESC_TARGET = 150;

export type SeoTags = {
  title: string;
  description: string;
  ogTitle: string;
  ogDescription: string;
  /** Read-only here: it is an asset reference, not copy. */
  ogImage: string;
};

const EMPTY: SeoTags = { title: "", description: "", ogTitle: "", ogDescription: "", ogImage: "" };

/**
 * Read the head with the browser's own HTML parser rather than regexes:
 * attribute order, quoting style and entities (&amp;, &#39;) are all things
 * the builder writes freely and all things a regex would show back to the
 * user raw. This runs client-side only — the panel is never server-rendered,
 * since it mounts only once the user switches to this view.
 */
function parseHead(html: string | undefined): SeoTags {
  if (!html || typeof DOMParser === "undefined") return EMPTY;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const content = (selector: string) =>
    doc.querySelector(selector)?.getAttribute("content")?.trim() ?? "";
  return {
    title: doc.querySelector("title")?.textContent?.trim() ?? "",
    description: content('meta[name="description"]'),
    ogTitle: content('meta[property="og:title"]'),
    ogDescription: content('meta[property="og:description"]'),
    ogImage: content('meta[property="og:image"]'),
  };
}

/**
 * What a visitor and a crawler actually get for a PUBLISHED site, gaps
 * included. Mirrors applySeo() in lib/site-seo.ts line for line.
 *
 * One rule here is easy to get wrong and is deliberately preserved: an empty
 * og:description does NOT inherit the page description. applySeo computes one
 * generic string from the title and uses it for both, so leaving og:description
 * blank while writing a real description gets you the generic line in every
 * link preview. Showing that plainly is the point of this column.
 */
function servedValues(tags: SeoTags, projectName: string) {
  const title =
    !tags.title || tags.title === PLACEHOLDER_TITLE ? projectName : tags.title;
  const generated = `${title} — built with Kodely.`;
  return {
    title,
    titleIsFallback: !tags.title || tags.title === PLACEHOLDER_TITLE,
    description: tags.description || generated,
    descriptionIsFallback: !tags.description,
    ogTitle: tags.ogTitle || title,
    ogTitleIsFallback: !tags.ogTitle,
    ogDescription: tags.ogDescription || generated,
    ogDescriptionIsFallback: !tags.ogDescription,
  };
}

function sameTags(a: SeoTags, b: SeoTags): boolean {
  return (
    a.title === b.title &&
    a.description === b.description &&
    a.ogTitle === b.ogTitle &&
    a.ogDescription === b.ogDescription
  );
}

export default function SeoPanel({
  projectId,
  projectName,
  published,
  liveUrl,
  html,
  onSaved,
}: {
  projectId: string;
  projectName: string;
  published: boolean;
  /** Public URL, when the site is live. Used for the canonical/og:url note. */
  liveUrl: string | null;
  /** Draft source index.html, straight from the editor's file map. */
  html: string | undefined;
  /** Re-read the project's files after a successful save. */
  onSaved: () => void | Promise<void>;
}) {
  // PUT /api/projects/<id>/seo. This panel used to probe the route with an
  // OPTIONS request on mount and render a "saving isn't wired up yet" strip if
  // it 404'd, because for a while the route genuinely did not exist. It does
  // now — app/api/projects/[id]/seo/route.ts exports PUT — so the probe was a
  // round trip on every panel open whose only outcome was a claim that had
  // become false. A failure still surfaces, but as the error it actually is.
  const endpoint = `/api/projects/${projectId}/seo`;
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const current = useMemo(() => parseHead(html), [html]);
  const [draft, setDraft] = useState<SeoTags>(current);
  const baseline = useRef(current);

  // Adopt new file contents (a finished build, or our own save landing) only
  // when the user has nothing unsaved in the boxes. Silently replacing text
  // someone is halfway through typing is worse than showing a stale value.
  useEffect(() => {
    setDraft((d) => (sameTags(d, baseline.current) ? current : d));
    baseline.current = current;
  }, [current]);

  const dirty = !sameTags(draft, current);
  const served = servedValues(draft, projectName);

  async function save() {
    if (saving || !dirty) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draft.title,
          description: draft.description,
          ogTitle: draft.ogTitle,
          ogDescription: draft.ogDescription,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? "Couldn't save these.");
      setSavedAt(Date.now());
      await onSaved();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Couldn't save these.");
    } finally {
      setSaving(false);
    }
  }

  // The character count lives in the field's HINT rather than beside its label,
  // which is what wires it into aria-describedby — the over-length warning
  // reaches a screen reader instead of being a colour on a number. Going over
  // is guidance, never a block: it recolours and adds a sentence, and Save
  // stays enabled.
  const field = (
    key: "title" | "description" | "ogTitle" | "ogDescription",
    label: string,
    hint: string,
    target: number,
    multiline: boolean,
  ) => {
    const value = draft[key];
    const over = value.length > target;
    const shared = {
      id: `kodely-seo-${key}`,
      label,
      value,
      hint: (
        <>
          {hint}{" "}
          <span className={`k-num ${over ? "font-medium text-warn" : ""}`}>
            {value.length}/{target}
          </span>
          {over && ` — over ~${target} characters, so search results will trim it.`}
        </>
      ),
    };
    const set = (next: string) => setDraft((d) => ({ ...d, [key]: next }));
    return multiline ? (
      <Textarea
        key={key}
        {...shared}
        rows={3}
        className="resize-none"
        onChange={(e) => set(e.target.value)}
      />
    ) : (
      <Input key={key} {...shared} type="text" onChange={(e) => set(e.target.value)} />
    );
  };

  return (
    <div className="h-full overflow-y-auto bg-canvas p-4 sm:p-6">
      <div className="mx-auto max-w-2xl">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="k-h1 text-ink">Search &amp; social</h2>
          <Badge tone="ok">No credits</Badge>
        </div>
        <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-ink-2">
          The tab title, the search-result snippet and the link preview, read from your{" "}
          <code className="rounded-xs bg-surface-2 px-1 py-0.5 font-mono text-[0.8125rem]">
            index.html
          </code>
          . Editing them here changes them directly — no build, no credits. A later build can
          rewrite them again, since the builder writes the head too.
        </p>

        {html === undefined ? (
          <p className="mt-4 rounded-lg border border-hair bg-surface px-3 py-2 text-[0.75rem] leading-relaxed text-ink-2">
            This project has no index.html yet, so there is nothing to edit.
          </p>
        ) : (
          <>
            <div className="mt-5 space-y-4">
              {field(
                "title",
                "Page title",
                "Shown in the browser tab and as the headline of a search result.",
                TITLE_TARGET,
                false,
              )}
              {field(
                "description",
                "Meta description",
                "The grey snippet under the headline in search results.",
                DESC_TARGET,
                true,
              )}
              {field(
                "ogTitle",
                "Share title (og:title)",
                "The bold line when someone pastes your link into a chat or a post.",
                TITLE_TARGET,
                false,
              )}
              {field(
                "ogDescription",
                "Share description (og:description)",
                "The smaller line under it. Left blank, it does NOT copy your meta description — a generic one is used instead.",
                DESC_TARGET,
                true,
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {/* The one gradient in the builder belongs to the composer's send
                  button, so this stays secondary even though it is the action
                  of this panel. */}
              <Button size="sm" variant="secondary" onClick={() => void save()} disabled={!dirty} loading={saving}>
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDraft(current)}
                disabled={!dirty || saving}
              >
                Reset
              </Button>
              {/* One status region for this panel, and it never carries a
                  string that is announced anywhere else on the screen. */}
              <p role="status" className="text-[0.75rem] text-ink-3">
                {saveError
                  ? ""
                  : savedAt !== null && !dirty
                    ? "Saved to your draft."
                    : dirty
                      ? "Unsaved changes."
                      : ""}
              </p>
            </div>

            {saveError && (
              <p role="alert" className="mt-2 text-[0.75rem] text-danger">
                {saveError}
              </p>
            )}

            <h3 className="k-h2 mt-6 text-ink">What a visitor sees</h3>
            <p className="mt-1 max-w-prose text-[0.75rem] leading-relaxed text-ink-3">
              Anything you leave blank is filled in on the published site by Kodely&rsquo;s backstop,
              so a site is never served with an empty head. These are the values it would use.
            </p>
            <dl className="mt-2 divide-y divide-hair rounded-lg border border-hair bg-surface text-[0.75rem]">
              <Served label="Title" value={served.title} fallback={served.titleIsFallback} />
              <Served
                label="Description"
                value={served.description}
                fallback={served.descriptionIsFallback}
              />
              <Served label="og:title" value={served.ogTitle} fallback={served.ogTitleIsFallback} />
              <Served
                label="og:description"
                value={served.ogDescription}
                fallback={served.ogDescriptionIsFallback}
              />
              {current.ogImage && <Served label="og:image" value={current.ogImage} fallback={false} />}
            </dl>

            <h3 className="k-h2 mt-6 text-ink">Handled for you</h3>
            <ul className="mt-2 max-w-prose space-y-1 text-[0.75rem] leading-relaxed text-ink-2">
              <li>
                <code>canonical</code> and <code>og:url</code> — set to{" "}
                {liveUrl ? <span className="break-all">{liveUrl}</span> : "your site's address"} when
                a page is served.
              </li>
              <li>
                <code>og:type</code> and <code>twitter:card</code> — filled in if the page has none.
              </li>
              <li>
                <code>og:image</code> — a relative path is rewritten to a full URL, because crawlers
                reject relative ones.
              </li>
              <li>
                <code>robots.txt</code> and <code>sitemap.xml</code> — generated for every published
                site from its own pages.
              </li>
            </ul>

            <p className="mt-4 max-w-prose text-[0.75rem] leading-relaxed text-ink-3">
              {published
                ? "Saving updates your draft and the preview. Your live site keeps its current tags until you republish."
                : "Saving updates your draft. These go live the first time you publish."}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Served({
  label,
  value,
  fallback,
}: {
  label: string;
  value: string;
  fallback: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 px-3 py-2 sm:flex-row sm:gap-3">
      <dt className="shrink-0 font-mono text-ink-3 sm:w-28">{label}</dt>
      <dd className="min-w-0 break-words text-ink">
        {value}
        {fallback && (
          <span className="ml-1.5 align-middle">
            <Badge tone="neutral">filled in for you</Badge>
          </span>
        )}
      </dd>
    </div>
  );
}
