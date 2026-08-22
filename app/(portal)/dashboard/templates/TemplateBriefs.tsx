"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Check, ChevronDown, Copy, FileText } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, SectionHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { SearchInput } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import type { Template, TemplateCategory } from "@/lib/templates";

const ALL = "All";

/** Rough but real: whitespace-separated tokens in the brief. Shown so the
    "these are long, written briefs" claim is backed by a number rather than
    an adjective. */
function wordCount(text: string): number {
  return text.trim().split(/\s+/).length;
}

export function TemplateBriefs({
  templates,
  categories,
}: {
  templates: Template[];
  categories: readonly TemplateCategory[];
}) {
  const toast = useToast();
  const [category, setCategory] = useState<string>(ALL);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

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
      // The prompt is searched too — it is the actual content here, and
      // someone hunting for "dark mode" or "price list" should find the
      // briefs that ask for one.
      return (
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        t.prompt.toLowerCase().includes(q)
      );
    });
  }, [templates, category, query]);

  async function copyBrief(t: Template) {
    try {
      await navigator.clipboard.writeText(t.prompt);
      setCopied(t.id);
      window.setTimeout(() => setCopied((id) => (id === t.id ? null : id)), 1600);
    } catch {
      toast({
        tone: "danger",
        message: "This browser wouldn't let Kodely reach the clipboard. Open the brief and copy it by hand.",
      });
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <SectionHeader as="h1"
        title="Templates"
        description="Starting points for the box on Create Website — every one of them is a brief you can rewrite."
        action={
          <ButtonLink href="/dashboard/new" variant="primary">
            Write my own
          </ButtonLink>
        }
      />

      {/* What these actually are, said first. There is no template file tree,
          no starting HTML and no screenshot anywhere in this product: every
          project begins from the same foundation regardless of which card was
          clicked. Presenting these as visual themes with previews would be
          inventing a feature. */}
      <Card className="mb-6">
        <div className="flex gap-3">
          <FileText size={18} className="mt-0.5 shrink-0 text-brand" />
          <div>
            <h2 className="k-h2 text-ink">These are briefs, not themes</h2>
            <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-ink-2">
              Every Kodely site is written from scratch for you, so there is no theme to pick and
              no layout locked in behind these cards. What a template gives you is the hard part:
              a few hundred words written the way someone who knows this product would write them
              — the audience, the tone, the sections in order, and bracketed placeholders for the
              facts only you know.
            </p>
            <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-2">
              You edit it before you build, and two people starting from the same brief will end
              up with two different-looking sites.
            </p>
          </div>
        </div>
      </Card>

      <div className="mb-4 flex flex-col gap-3">
        <SearchInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search briefs — try “price list”, “dark mode”, “photographer”"
          aria-label="Search templates"
          className="max-w-md"
        />

        <div role="group" aria-label="Filter by category" className="flex flex-wrap gap-1.5">
          <FilterChip
            label={ALL}
            count={templates.length}
            active={category === ALL}
            onClick={() => setCategory(ALL)}
          />
          {categories.map((c) => (
            <FilterChip
              key={c}
              label={c}
              count={counts.get(c) ?? 0}
              active={category === c}
              onClick={() => setCategory(c)}
            />
          ))}
        </div>
      </div>

      <p className="mb-4 text-xs text-ink-3">
        <span className="k-num">{visible.length}</span> of{" "}
        <span className="k-num">{templates.length}</span> briefs
      </p>

      {visible.length === 0 ? (
        <EmptyState
          kind="no-results"
          title="No brief matches that"
          body="Try a broader search, or clear the category filter. If none of them fit, the box on Create Website takes anything you write."
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setQuery("");
                setCategory(ALL);
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {visible.map((t) => {
            const expanded = open === t.id;
            return (
              <li key={t.id}>
                <Card className="flex h-full flex-col">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="k-h2 text-ink">{t.name}</h3>
                    <Badge tone="neutral">{t.category}</Badge>
                  </div>

                  <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-2">
                    {t.description}
                  </p>

                  <div className="mt-3">
                    <button
                      type="button"
                      aria-expanded={expanded}
                      aria-controls={`brief-${t.id}`}
                      onClick={() => setOpen(expanded ? null : t.id)}
                      className="k-focus inline-flex items-center gap-1.5 rounded-xs text-xs font-medium text-brand-ink transition-colors duration-[var(--t-1)] hover:text-brand dark:text-brand"
                    >
                      <ChevronDown
                        size={14}
                        className={`transition-transform duration-[var(--t-2)] ${expanded ? "rotate-180" : ""}`}
                      />
                      {expanded ? "Hide the brief" : "Read the full brief"}
                      <span className="k-num font-normal text-ink-3">
                        ({wordCount(t.prompt)} words)
                      </span>
                    </button>

                    {expanded && (
                      <pre
                        id={`brief-${t.id}`}
                        className="k-scroll-x k-msg-in mt-2 max-h-72 overflow-y-auto rounded-lg border border-hair bg-inset p-3 font-sans text-xs leading-relaxed whitespace-pre-wrap text-ink-2"
                      >
                        {t.prompt}
                      </pre>
                    )}
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-hair pt-4">
                    <ButtonLink
                      href={`/dashboard/new?template=${t.id}`}
                      variant="secondary"
                      size="sm"
                      iconRight={<ArrowRight size={14} />}
                    >
                      Use this brief
                    </ButtonLink>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={copied === t.id ? <Check size={14} /> : <Copy size={14} />}
                      onClick={() => void copyBrief(t)}
                    >
                      {copied === t.id ? "Copied" : "Copy"}
                    </Button>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={[
        "k-focus inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium",
        "transition-[background,color,border-color] duration-[var(--t-1)]",
        active
          ? "border-transparent bg-brand-tint-2 text-brand-ink dark:text-brand"
          : "border-hair bg-surface text-ink-2 hover:border-line-mid hover:text-ink",
      ].join(" ")}
    >
      {label}
      <span className={`k-num ${active ? "opacity-70" : "text-ink-3"}`}>{count}</span>
    </button>
  );
}
