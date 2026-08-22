"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import {
  PENDING_PROMPT_KEY,
  PENDING_PROMPT_IMAGE_KEY,
  destinationAfterAuth,
} from "@/lib/pending-prompt";
import { TEMPLATE_CATEGORIES, type Template } from "@/lib/templates";
import { RevealGroup, RevealItem } from "@/components/marketing/Reveal";
import { TemplateCard } from "./TemplateCard";

const ALL = "All";

/**
 * The browsable gallery.
 *
 * Hand-off: this deliberately reuses the SAME pending-prompt mechanism the
 * home-page composer uses (lib/pending-prompt.ts), rather than inventing a
 * second route into a build:
 *
 *   signed out — stash the prompt under PENDING_PROMPT_KEY and send them to
 *     /signup. The signup and login pages already show it back ("picking up
 *     where you left off"), and their submit handlers already call
 *     destinationAfterAuth(), which creates the project. Google OAuth lands
 *     on /continue, which does the same.
 *   signed in — call destinationAfterAuth() directly. It reads the same key,
 *     POSTs /api/projects and returns /projects/<id>.
 *
 * Either way the project's Editor picks the prompt up on mount and fires the
 * first build automatically, so a template click really is one click.
 */
export function TemplateGallery({
  templates,
  signedIn,
}: {
  templates: Template[];
  signedIn: boolean;
}) {
  const router = useRouter();
  const [category, setCategory] = useState<string>(ALL);
  const [query, setQuery] = useState("");
  /** Only the prompts I've actually edited; everything else falls through. */
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [starting, setStarting] = useState<string | null>(null);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of templates) map.set(t.category, (map.get(t.category) ?? 0) + 1);
    return map;
  }, [templates]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return templates.filter((t) => {
      if (category !== ALL && t.category !== category) return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        t.prompt.toLowerCase().includes(q)
      );
    });
  }, [templates, category, query]);

  async function start(template: Template) {
    if (starting) return;
    const text = (edits[template.id] ?? template.prompt).trim();
    if (!text) return;

    setStarting(template.id);
    try {
      sessionStorage.setItem(PENDING_PROMPT_KEY, text);
      // A reference image attached on the home page earlier in this session
      // would otherwise ride along into a build that never asked for one.
      sessionStorage.removeItem(PENDING_PROMPT_IMAGE_KEY);
    } catch {}

    if (!signedIn) {
      router.push("/signup");
      return;
    }

    // Returns "/dashboard" if project creation fails (including a session
    // that expired since this page rendered) — the prompt stays in
    // sessionStorage either way, so nothing typed is lost. Deliberately not
    // resetting `starting` afterwards: every branch navigates away, and
    // leaving the button locked prevents a double-click creating two projects.
    const dest = await destinationAfterAuth();
    router.push(dest);
    router.refresh();
  }

  const startingTemplate = templates.find((t) => t.id === starting) ?? null;

  return (
    <>
      <div className="mb-10 flex flex-col items-center gap-6">
        <div className="relative w-full max-w-md">
          <label htmlFor="template-search" className="sr-only">
            Search templates
          </label>
          <Search
            size={16}
            aria-hidden
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500 dark:text-neutral-400"
          />
          <input
            id="template-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search templates…"
            className="w-full rounded-full border border-neutral-200 bg-white/70 py-2.5 pl-11 pr-4 text-sm outline-none backdrop-blur-md transition-colors placeholder:text-neutral-500 focus:border-neutral-400 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)] dark:border-neutral-800 dark:bg-neutral-950/70 dark:placeholder:text-neutral-400 dark:focus:border-neutral-600"
          />
        </div>

        {/* A real radio group, not a row of aria-pressed buttons: the filter
            is single-select, so arrow-key navigation and the "3 of 8"
            announcement come for free, and each chip has a real <label>. */}
        <fieldset className="w-full">
          <legend className="mx-auto mb-3 block text-center text-xs font-medium uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400">
            Filter by category
          </legend>
          <div className="flex flex-wrap justify-center gap-2">
            {[ALL, ...TEMPLATE_CATEGORIES].map((option) => {
              const count = option === ALL ? templates.length : (counts.get(option) ?? 0);
              return (
                <label key={option} className="cursor-pointer">
                  <input
                    type="radio"
                    name="template-category"
                    value={option}
                    checked={category === option}
                    onChange={() => setCategory(option)}
                    className="peer sr-only"
                  />
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white/50 px-3.5 py-1.5 text-xs text-neutral-600 backdrop-blur-md transition-colors hover:border-neutral-300 hover:text-neutral-900 peer-checked:border-neutral-900 peer-checked:bg-neutral-900 peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--accent)] dark:border-white/10 dark:bg-white/[0.04] dark:text-neutral-400 dark:hover:text-white dark:peer-checked:border-white dark:peer-checked:bg-white dark:peer-checked:text-neutral-900">
                    {option}
                    <span className="opacity-60">{count}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      </div>

      {/* Both the result count and the "starting…" state are spoken, so a
          screen-reader user hears the filter working and knows the click did
          something before the navigation happens. */}
      <p role="status" className="sr-only">
        {startingTemplate
          ? `Starting a new project from the ${startingTemplate.name} template.`
          : `Showing ${visible.length} of ${templates.length} templates.`}
      </p>

      <p aria-hidden className="mb-6 text-center text-xs text-neutral-500 dark:text-neutral-400">
        Showing {visible.length} of {templates.length}
      </p>

      {visible.length === 0 ? (
        <p className="py-10 text-center text-sm text-neutral-500 dark:text-neutral-400">
          No templates match that search. Try a different word, or clear the filter — every
          template is just a starting prompt you can edit.
        </p>
      ) : (
        <RevealGroup className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" stagger={0.05}>
          {visible.map((template) => (
            <RevealItem key={template.id} className="h-full">
              <TemplateCard
                template={template}
                prompt={edits[template.id] ?? template.prompt}
                onPromptChange={(next) =>
                  setEdits((prev) => ({ ...prev, [template.id]: next }))
                }
                onStart={() => start(template)}
                starting={starting === template.id}
                busy={starting !== null}
              />
            </RevealItem>
          ))}
        </RevealGroup>
      )}
    </>
  );
}
