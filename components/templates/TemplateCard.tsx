"use client";

import { ArrowRight, ChevronDown } from "lucide-react";
import { MotionLift } from "@/components/marketing/FloatCard";
import type { Template } from "@/lib/templates";

/**
 * One template in the gallery.
 *
 * The card is a plain <article>, not a giant button: the prompt is editable
 * before you build (a template is a starting point, and the bracketed
 * placeholders are exactly the bits worth replacing first), and a textarea
 * inside a button would be both invalid and unusable. The single primary
 * action is the button at the bottom.
 */
export function TemplateCard({
  template,
  prompt,
  onPromptChange,
  onStart,
  starting,
  busy,
}: {
  template: Template;
  /** The prompt as it stands — the template's own text, or my edit of it. */
  prompt: string;
  onPromptChange: (next: string) => void;
  onStart: () => void;
  /** This card is the one starting a build. */
  starting: boolean;
  /** Some card is starting a build, so every button is locked. */
  busy: boolean;
}) {
  // The first line of every starter prompt is written to stand alone as a
  // summary ("Build a website for [your cafe's name], …"), so it doubles as
  // the preview without needing a separate, driftable field.
  const previewLine = prompt.trim().split("\n")[0];
  const editId = `template-prompt-${template.id}`;

  return (
    <MotionLift lift={4} className="h-full">
      <article className="flex h-full flex-col rounded-2xl border border-black/10 bg-white/60 p-6 backdrop-blur-sm transition-shadow hover:shadow-lg dark:border-white/10 dark:bg-white/[0.02]">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400">
          {template.category}
        </p>
        <h3 className="mt-2 text-lg font-semibold leading-snug tracking-tight">{template.name}</h3>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
          {template.description}
        </p>

        <p className="mt-4 break-words rounded-xl border border-black/5 bg-black/[0.03] p-3 font-mono text-[11px] leading-relaxed text-neutral-600 dark:border-white/5 dark:bg-white/[0.04] dark:text-neutral-400">
          {previewLine}
        </p>

        <details className="group mt-3">
          {/* list-none hides the marker everywhere except Safari, which needs
              the ::-webkit-details-marker rule as well. */}
          <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 [&::-webkit-details-marker]:hidden rounded-md text-xs font-medium text-neutral-500 underline-offset-4 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] dark:text-neutral-400 dark:hover:text-white">
            <ChevronDown
              size={13}
              aria-hidden
              className="transition-transform group-open:rotate-180"
            />
            Read and edit the full prompt
          </summary>
          <div className="mt-3">
            <label htmlFor={editId} className="mb-1.5 block text-xs text-neutral-500 dark:text-neutral-400">
              Starter prompt — fill in the bracketed details before you build, or leave them for
              later
            </label>
            <textarea
              id={editId}
              value={prompt}
              onChange={(e) => onPromptChange(e.target.value)}
              rows={12}
              spellCheck={false}
              className="w-full resize-y rounded-xl border border-black/10 bg-white p-3 font-mono text-[11px] leading-relaxed text-neutral-700 outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)] dark:border-white/10 dark:bg-neutral-950 dark:text-neutral-300"
            />
          </div>
        </details>

        {/* mt-auto on the wrapper keeps every card's button on the same
            baseline whatever the description length, so the grid doesn't look
            ragged; the padding is the gap above it. */}
        <div className="mt-auto pt-5">
          <button
            type="button"
            onClick={onStart}
            disabled={busy || !prompt.trim()}
            className="group inline-flex w-full items-center justify-center gap-2 rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:pointer-events-none disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            {starting ? "Starting…" : "Use this template"}
            {!starting && (
              <ArrowRight
                size={14}
                aria-hidden
                className="transition-transform group-hover:translate-x-0.5"
              />
            )}
          </button>
        </div>
      </article>
    </MotionLift>
  );
}
