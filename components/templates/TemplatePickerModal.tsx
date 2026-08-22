"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ImagePlus, LayoutGrid, List, RotateCcw, Sparkles, X } from "lucide-react";
import { TEMPLATES, TEMPLATE_CATEGORIES, getTemplate, type Template } from "@/lib/templates";
import { paletteCatalogue, type PaletteChoice } from "@/lib/brand-kit";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, SearchInput, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { Segmented } from "@/components/ui/Segmented";
import { TemplateCover } from "./TemplateCover";
import { PalettePicker } from "./PalettePicker";
import { assembleTemplatePrompt, fieldsFor, type IntakeField } from "./intake";
import { LOGO_ACCEPT, prepareLogo } from "./logo";

/**
 * Pick a template, answer the handful of questions that template actually
 * needs, and leave with a finished prompt.
 *
 * TWO STAGES, ONE MODAL
 * Stage 1 is the gallery: a category filter, a search that reads the prompt
 * body as well as the name, and a generated cover per template (see
 * ./TemplateCover.tsx — there is no image to use, and nothing in this product
 * takes screenshots). Stage 2 is the intake: the per-template questions derived
 * from that prompt's own bracketed placeholders (see ./intake.ts), an optional
 * logo, an optional palette, and the assembled prompt shown back as an editable
 * textarea before anything is committed.
 *
 * EVERYTHING IN STAGE 2 IS OPTIONAL
 * Someone who wants to just start can press the primary button the moment they
 * land on stage 2 and get the template's own hand-written prompt, unchanged.
 * That is not a degraded path — those 23 prompts already work on their own, and
 * an unanswered question simply leaves its bracket in place, which is precisely
 * what every one of them instructs the builder to do with a fact it has not
 * been told. No field is required, none is validated, and nothing is invented
 * to fill a gap.
 *
 * NOTHING IS LOST GOING BACKWARDS
 * Answers, the logo, the palette and any hand-edit of the prompt are held per
 * template id for the life of the component, so Back → change your mind →
 * forward returns to exactly what was typed. Closing the modal does not clear
 * them either; the parent owns `open`, and re-opening resumes.
 *
 * ACCESSIBILITY
 * `Modal` is a native `<dialog>`, so the focus trap, the inert background, the
 * top-layer stacking and Escape all come from the platform. What that does NOT
 * give is stage changes: the heading (`h2`, owned by Modal) is re-titled per
 * stage, each stage's sections are `h3`, and focus is moved explicitly — into
 * the intake panel on the way forward, back onto the card you came from on the
 * way back — with a `role="status"` line so the change is announced rather than
 * only seen.
 */

export type TemplatePickerResult = {
  templateId: string;
  /** The finished, editable build prompt with all answers substituted in. */
  prompt: string;
  /** Data URL, only if the customer uploaded one. */
  logoDataUrl?: string;
  /** Hex strings the customer chose, in the order they should be applied. */
  palette?: string[];
};

type Stage = "gallery" | "intake";
type View = "covers" | "list";
type LogoState = { dataUrl: string; name: string; bytes: number; format: "PNG" | "JPEG" };

const ALL = "All";
const PALETTES: PaletteChoice[] = paletteCatalogue();
/** One shared empty object, so an unanswered template does not produce a new
    identity on every render and invalidate the assembly memo. */
const NO_ANSWERS: Record<string, string> = {};

export function TemplatePickerModal({
  open,
  onClose,
  onComplete,
}: {
  open: boolean;
  onClose: () => void;
  onComplete: (result: TemplatePickerResult) => void;
}): React.ReactNode {
  const [stage, setStage] = useState<Stage>("gallery");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Gallery state, kept across a round trip into the intake so Back returns to
  // the same filtered view rather than to the top of an unfiltered list.
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>(ALL);
  const [view, setView] = useState<View>("covers");

  // Intake state. Keyed by template id: switching template must not carry a
  // restaurant's opening hours into a SaaS landing page.
  const [answersById, setAnswersById] = useState<Record<string, Record<string, string>>>({});
  const [editedById, setEditedById] = useState<Record<string, string>>({});
  const [paletteId, setPaletteId] = useState<string | null>(null);
  const [logo, setLogo] = useState<LogoState | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);

  const galleryRef = useRef<HTMLDivElement>(null);
  const intakeRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const template = selectedId != null ? (getTemplate(selectedId) ?? null) : null;

  const answers = useMemo(
    () => (selectedId != null ? (answersById[selectedId] ?? NO_ANSWERS) : NO_ANSWERS),
    [selectedId, answersById],
  );

  const palette = useMemo(
    () => (paletteId != null ? (PALETTES.find((p) => p.id === paletteId) ?? null) : null),
    [paletteId],
  );

  const generated = useMemo(
    () =>
      template != null
        ? assembleTemplatePrompt({ template, answers, palette, hasLogo: logo !== null })
        : "",
    [template, answers, palette, logo],
  );

  const edited = selectedId != null ? editedById[selectedId] : undefined;
  const promptText = edited ?? generated;
  const isEdited = edited !== undefined && edited !== generated;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return TEMPLATES.filter((t) => {
      if (category !== ALL && t.category !== category) return false;
      if (!q) return true;
      // The prompt body is searched too: someone looking for "timetable" or
      // "mailto" wants a template whose PROMPT says that, and neither the name
      // nor the description would find it.
      return (
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        t.prompt.toLowerCase().includes(q)
      );
    });
  }, [query, category]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of TEMPLATES) map.set(t.category, (map.get(t.category) ?? 0) + 1);
    return map;
  }, []);

  // Focus follows the stage. The native dialog autofocuses on open; this runs
  // after it, and on the way back it aims at the card that was chosen rather
  // than dumping the caret at the top of a 23-item list.
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => {
      if (stage === "intake") {
        intakeRef.current?.focus();
        return;
      }
      const card =
        selectedId != null
          ? galleryRef.current?.querySelector<HTMLElement>(`[data-template-id="${selectedId}"]`)
          : null;
      (card ?? galleryRef.current)?.focus();
    }, 0);
    return () => window.clearTimeout(id);
  }, [open, stage, selectedId]);

  const setAnswer = useCallback(
    (fieldId: string, value: string) => {
      if (selectedId == null) return;
      setAnswersById((prev) => ({
        ...prev,
        [selectedId]: { ...(prev[selectedId] ?? {}), [fieldId]: value },
      }));
    },
    [selectedId],
  );

  function choose(t: Template) {
    setSelectedId(t.id);
    setStage("intake");
  }

  async function pickLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Cleared immediately so choosing the same file twice still fires change.
    e.target.value = "";
    if (!file) return;
    setLogoError(null);
    const result = await prepareLogo(file);
    if (result.ok) {
      setLogo({
        dataUrl: result.dataUrl,
        name: result.name,
        bytes: result.bytes,
        format: result.format,
      });
    } else {
      setLogoError(result.error);
    }
  }

  function start() {
    if (template == null) return;
    const text = promptText.trim();
    if (!text) return;
    onComplete({
      templateId: template.id,
      prompt: text,
      ...(logo !== null ? { logoDataUrl: logo.dataUrl } : {}),
      ...(palette !== null
        ? { palette: [palette.palette.primary, palette.palette.secondary, palette.palette.accent] }
        : {}),
    });
    // Back to the gallery, so a second open starts where a second choice
    // starts rather than on the last intake form.
    setStage("gallery");
  }

  const fields = template != null ? fieldsFor(template.id) : [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={stage === "gallery" ? "Start from a template" : (template?.name ?? "Your template")}
      description={
        stage === "gallery"
          ? "Every template is a starting prompt, not a theme. Pick the one closest to what you are making — you get to edit every word before anything is built."
          : "Answer what you know and skip the rest. Anything left blank stays a bracketed placeholder in the prompt for you to fill in later."
      }
      footer={
        stage === "gallery" ? (
          <>
            <span className="mr-auto self-center text-xs text-ink-3">
              <span className="k-num">{visible.length}</span> of{" "}
              <span className="k-num">{TEMPLATES.length}</span> templates
            </span>
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="ghost"
              size="sm"
              icon={<ArrowLeft size={14} />}
              onClick={() => setStage("gallery")}
            >
              All templates
            </Button>
            <Button variant="primary" size="sm" onClick={start} icon={<Sparkles size={14} />}>
              Use this prompt
            </Button>
          </>
        )
      }
    >
      <p role="status" className="sr-only">
        {stage === "gallery"
          ? `Template gallery. Showing ${visible.length} of ${TEMPLATES.length} templates.`
          : `${template?.name ?? "Template"} selected. ${fields.length} optional questions, then your prompt.`}
      </p>

      {stage === "gallery" ? (
        <div ref={galleryRef} tabIndex={-1} className="outline-none">
          <h3 className="sr-only">Choose a template</h3>

          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-0 flex-1">
              <label htmlFor="template-picker-search" className="sr-only">
                Search templates by name, description or prompt
              </label>
              {/* No `k-focus` here: SearchInput puts `className` on its
                  wrapper, and the input itself already carries the shared
                  control focus ring from components/ui/Field.tsx. */}
              <SearchInput
                id="template-picker-search"
                placeholder="Search names, descriptions and prompts…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <Segmented
              name="template-picker-view"
              ariaLabel="Template layout"
              size="sm"
              value={view}
              onChange={setView}
              options={[
                { value: "covers", label: "Covers", iconOnly: true, icon: <LayoutGrid size={14} /> },
                { value: "list", label: "Compact list", iconOnly: true, icon: <List size={14} /> },
              ]}
            />
          </div>

          {/* A real radio group, not a row of aria-pressed buttons: the filter
              is single-select, so arrow-key navigation and the "3 of 8"
              announcement come for free. Same idiom as the public gallery. */}
          <fieldset className="mt-3">
            <legend className="k-label mb-2">Category</legend>
            <div className="flex flex-wrap gap-1.5">
              {[ALL, ...TEMPLATE_CATEGORIES].map((option) => (
                <label key={option} className="cursor-pointer">
                  <input
                    type="radio"
                    name="template-picker-category"
                    value={option}
                    checked={category === option}
                    onChange={() => setCategory(option)}
                    className="peer sr-only"
                  />
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-hair bg-surface px-2.5 py-1 text-xs text-ink-2 transition-colors duration-[var(--t-1)] hover:border-line-mid hover:text-ink peer-checked:border-transparent peer-checked:bg-brand-tint peer-checked:text-brand-ink peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--brand-ring)] dark:peer-checked:text-brand">
                    {option}
                    <span className="k-num opacity-60">
                      {option === ALL ? TEMPLATES.length : (counts.get(option) ?? 0)}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="mt-4 max-h-[52vh] overflow-y-auto pr-1">
            {visible.length === 0 ? (
              <EmptyState
                kind="no-results"
                title="No template matches that"
                body="Try a broader word, or clear the category filter. None of these is a theme — if nothing fits, close this and describe the site in your own words instead."
                action={
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setQuery("");
                      setCategory(ALL);
                    }}
                  >
                    Clear search and filter
                  </Button>
                }
              />
            ) : view === "covers" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {visible.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    data-template-id={t.id}
                    onClick={() => choose(t)}
                    className="k-focus flex flex-col overflow-hidden rounded-lg border border-hair bg-surface text-left shadow-e1 transition-[border-color,box-shadow,transform] duration-[var(--t-1)] hover:-translate-y-0.5 hover:border-line-mid hover:shadow-e2"
                  >
                    <TemplateCover templateId={t.id} className="h-28 w-full shrink-0" />
                    <span className="flex flex-1 flex-col gap-1.5 p-3">
                      <span className="k-h2 text-ink">{t.name}</span>
                      <span className="line-clamp-3 text-xs leading-relaxed text-ink-2">
                        {t.description}
                      </span>
                      <span className="mt-auto pt-1.5">
                        <Badge>{t.category}</Badge>
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {visible.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      data-template-id={t.id}
                      onClick={() => choose(t)}
                      className="k-focus flex w-full items-center gap-3 rounded-lg border border-hair bg-surface p-2 text-left transition-colors duration-[var(--t-1)] hover:border-line-mid hover:bg-surface-2"
                    >
                      <TemplateCover
                        templateId={t.id}
                        className="h-10 w-16 shrink-0 rounded-sm"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[0.8125rem] font-medium text-ink">
                          {t.name}
                        </span>
                        <span className="block truncate text-xs text-ink-3">{t.description}</span>
                      </span>
                      <Badge className="hidden sm:inline-flex">{t.category}</Badge>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : template == null ? (
        <EmptyState
          kind="unavailable"
          title="That template is no longer here"
          body="It may have been renamed since this opened. Go back and pick another — nothing you typed has been lost."
          action={
            <Button variant="secondary" size="sm" onClick={() => setStage("gallery")}>
              Back to the templates
            </Button>
          }
        />
      ) : (
        <div ref={intakeRef} tabIndex={-1} className="outline-none">
          <div className="max-h-[52vh] overflow-y-auto pr-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="brand">{template.category}</Badge>
              <p className="min-w-0 flex-1 text-xs leading-relaxed text-ink-3">
                {template.description}
              </p>
            </div>

            {fields.length > 0 && (
              <section className="mt-5">
                <h3 className="k-h2 text-ink">A few details</h3>
                <p className="mt-1 text-xs leading-relaxed text-ink-2">
                  All optional. Each answer replaces a placeholder already written into this
                  template&apos;s prompt — skip one and the bracket stays, which is exactly what
                  the prompt tells Kodely to do with a fact it has not been given.
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {fields.map((field) => (
                    <IntakeControl
                      key={field.id}
                      field={field}
                      value={answers[field.id] ?? ""}
                      onChange={(v) => setAnswer(field.id, v)}
                    />
                  ))}
                </div>
              </section>
            )}

            <section className="mt-6">
              <h3 className="k-h2 text-ink">Logo</h3>
              <p className="mt-1 text-xs leading-relaxed text-ink-2">
                Optional. PNG, JPEG or WebP only — it is resized in your browser and travels with
                the build as a reference image. Kodely redraws it as inline SVG or a type lockup,
                because a generated site cannot load a file from anywhere.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept={LOGO_ACCEPT}
                  className="sr-only"
                  onChange={pickLogo}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<ImagePlus size={14} />}
                  onClick={() => fileRef.current?.click()}
                >
                  {logo ? "Replace logo" : "Add a logo"}
                </Button>
                {logo && (
                  <span className="flex min-w-0 items-center gap-2 rounded-md border border-hair bg-surface-2 p-1.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={logo.dataUrl}
                      alt={`Logo preview: ${logo.name}`}
                      className="size-8 shrink-0 rounded-sm bg-surface object-contain"
                    />
                    <span className="min-w-0">
                      <span className="block max-w-40 truncate text-xs font-medium text-ink">
                        {logo.name}
                      </span>
                      <span className="k-num block text-[0.6875rem] text-ink-3">
                        {logo.format} · about {Math.max(1, Math.round(logo.bytes / 1024))} KB
                      </span>
                    </span>
                    <Button
                      variant="ghost"
                      size="xs"
                      icon={<X size={12} />}
                      onClick={() => {
                        setLogo(null);
                        setLogoError(null);
                      }}
                    >
                      Remove
                    </Button>
                  </span>
                )}
              </div>
              {logoError !== null && (
                <p role="alert" className="mt-2 text-xs leading-relaxed text-danger">
                  {logoError}
                </p>
              )}
            </section>

            <section className="mt-6">
              <h3 className="k-h2 text-ink">Colours</h3>
              <p className="mt-1 mb-3 text-xs leading-relaxed text-ink-2">
                Optional. These are real palettes from Kodely&apos;s asset catalogue, so the build
                gets these exact hexes rather than an interpretation of an adjective. Leave it on
                &ldquo;Let Kodely choose&rdquo; and the brief decides.
              </p>
              <PalettePicker value={paletteId} onChange={setPaletteId} />
            </section>

            <section className="mt-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="k-h2 text-ink">Your prompt</h3>
                {isEdited && (
                  <Button
                    variant="ghost"
                    size="xs"
                    icon={<RotateCcw size={12} />}
                    onClick={() =>
                      setEditedById((prev) => {
                        const next = { ...prev };
                        delete next[template.id];
                        return next;
                      })
                    }
                  >
                    Undo my edits
                  </Button>
                )}
              </div>
              <Textarea
                className="mt-2 min-h-56 font-mono text-xs leading-relaxed"
                aria-label="The prompt Kodely will build from"
                value={promptText}
                onChange={(e) =>
                  setEditedById((prev) => ({ ...prev, [template.id]: e.target.value }))
                }
                hint={
                  isEdited
                    ? "Edited by you, so the questions above no longer rewrite it. Undo your edits to go back to the generated version."
                    : "This is exactly what gets built. Change anything, including the sections."
                }
              />
            </section>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** One question. `long` answers still land inline in a sentence, so the
    textarea is two rows rather than an essay box. */
function IntakeControl({
  field,
  value,
  onChange,
}: {
  field: IntakeField;
  value: string;
  onChange: (value: string) => void;
}) {
  const shared = {
    label: field.label,
    hint: field.hint,
    placeholder: field.example,
    value,
  };
  return (
    <div className={field.wide ? "sm:col-span-2" : undefined}>
      {field.kind === "long" ? (
        <Textarea
          {...shared}
          rows={2}
          className="k-focus min-h-16"
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <Input
          {...shared}
          autoComplete="off"
          className="k-focus"
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}
