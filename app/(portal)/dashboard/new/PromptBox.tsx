"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowUp, Mic, Plus } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { ATTACHMENT_ACCEPT } from "./attachment";

/**
 * The homepage prompt box, on the Create page.
 *
 * ## Why this is a COPY of components/marketing/PromptHero.tsx, not an import
 *
 * PromptHero is a marketing component and it carries marketing concerns that
 * are wrong — not merely unnecessary — on a page reached only by a signed-in
 * customer:
 *
 *   - it stashes the prompt in sessionStorage and pushes /signup (the auth
 *     wall). Here there is nothing to stash and nobody to sign up.
 *   - it renders a "get N free credits" rewards pill. The signed-in customer
 *     has a real balance, stated honestly below the box by CreditNote.
 *   - it probes /api/auth/me to decide whether to offer Enhance. Here the
 *     answer is always yes, so the probe is a round trip for nothing.
 *   - it links out to /wizard and offers a paperclip reference-image picker;
 *     this page opens the wizard IN PLACE and has no reference-image path.
 *
 * Importing it would mean adding props to another owner's file to switch all
 * of that off. So the parts the owner asked to keep — the glass treatment, the
 * two-layer rotating glow ring, and the Web Speech voice-to-text — are copied
 * verbatim below, comments included.
 *
 * ## The pair must stay recognisably identical
 *
 * If you change the glow geometry, the SPIN_SQUARE arithmetic, the composer's
 * border/shadow treatment, or the speech plumbing HERE, go and look at
 * components/marketing/PromptHero.tsx, and vice versa. They are two copies of
 * one design on purpose; they are not allowed to drift into two designs.
 * `.glow-clip-a/-b` and `.glow-spin-a/-b` in app/globals.css are genuinely
 * shared — that file explains the technique and what was tried and rejected.
 */

// The rotating gradient inside each glow clip MUST be a square that is
// larger than the clip's diagonal, or it stops covering the clip partway
// through its own rotation and the ring visibly vanishes and returns on a
// loop. (An `inset-[-50%]` made it 2x the clip in BOTH axes — e.g.
// 1372x296 for a wide composer. Rotated 90deg that occupies 296x1372: only
// 296px wide, far short of the ~686px the clip needs covered. Hence "the
// glow keeps disappearing.")
//
// 200% width + aspectRatio 1 gives a square of side 2*clipWidth, which
// always exceeds the diagonal. Centering uses margins rather than a
// translate because `transform` is owned by the rotation keyframes and a
// transform in the animation would override any translate set here —
// percentage margins (all sides, per spec) resolve against the containing
// block's WIDTH, so -100% on both axes lands the square's center exactly
// on the clip's center.
const SPIN_SQUARE: React.CSSProperties = {
  position: "absolute",
  left: "50%",
  top: "50%",
  width: "200%",
  aspectRatio: "1",
  marginLeft: "-100%",
  marginTop: "-100%",
};

// The Web Speech API has no types in TypeScript's DOM lib, so this is a
// minimal hand-written shim covering exactly the surface used below —
// narrower than the real spec on purpose, so it can't quietly drift into
// asserting support for members this component never touches.
type SpeechRecognitionAlternativeLike = { readonly transcript: string };
type SpeechRecognitionResultLike = {
  readonly length: number;
  readonly [index: number]: SpeechRecognitionAlternativeLike;
};
type SpeechRecognitionEventLike = {
  readonly results: {
    readonly length: number;
    readonly [index: number]: SpeechRecognitionResultLike;
  };
};
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

// Narrowed locally rather than via `declare global`: augmenting Window would
// collide with the (differently-shaped) definitions any future TS DOM lib
// ships for this API.
type SpeechCapableWindow = {
  SpeechRecognition?: SpeechRecognitionCtor;
  webkitSpeechRecognition?: SpeechRecognitionCtor;
};

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as SpeechCapableWindow;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// Feature detection is *external* state: it is unknowable while rendering on
// the server, and rendering the mic button in the server HTML would be a
// hydration mismatch. useSyncExternalStore is the sanctioned way to express
// that — getServerSnapshot() feeds both SSR and the hydration render, and
// React re-reads getSnapshot() only once hydration has finished. Support
// never changes within a page's life, so subscribe is a no-op.
const NEVER_CHANGES = () => () => {};
const readSpeechSupported = () => getSpeechRecognition() !== null;
const speechUnsupportedOnServer = () => false;

export function PromptBox({
  value,
  onChange,
  onSubmit,
  canSubmit,
  onAttachFile,
  children,
}: {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  /** False while the box is empty, or while a build would be refused outright. */
  canSubmit: boolean;
  /**
   * A file arrived via the "+" picker, a paste, or a drop onto the box.
   * `extraIgnored` is the count of additional files dropped alongside it that
   * were never looked at — the pipeline only ever attaches one, so the
   * caller can tell the customer the rest were ignored rather than silently
   * dropping them with no explanation. PromptBox does no validation of its
   * own (file type, size, re-encoding): that all lives with the state this
   * feeds, same as it already did for the wizard/template hand-off.
   */
  onAttachFile: (file: File, extraIgnored?: number) => void;
  /** Rendered inside the box, above the textarea — the template badge and the
      attached-image row. Inside rather than above so the glow still hugs the
      one box the customer is looking at. */
  children?: React.ReactNode;
}) {
  const reduced = useReducedMotion();
  const [focused, setFocused] = useState(false);
  const [listening, setListening] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const dragDepth = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const speechSupported = useSyncExternalStore(
    NEVER_CHANGES,
    readSpeechSupported,
    speechUnsupportedOnServer,
  );
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const baseValueRef = useRef("");

  function toggleListening() {
    const Ctor = getSpeechRecognition();
    if (!Ctor) return;

    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    baseValueRef.current = value ? value.trim() + " " : "";

    rec.onresult = (e: SpeechRecognitionEventLike) => {
      let transcript = "";
      for (let i = 0; i < e.results.length; i++) transcript += e.results[i][0].transcript;
      onChange((baseValueRef.current + transcript).trimStart());
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);

    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  }

  useEffect(() => () => recognitionRef.current?.stop(), []);

  // Counted rather than a plain boolean: dragging over a CHILD element (the
  // textarea, the badge row) fires dragleave on the parent before dragenter
  // on the child lands, and a boolean flips the drop-target state off for one
  // frame every time the pointer crosses an inner boundary — a visible
  // flicker for the whole time the pointer is over the box. The counter only
  // reaches zero once the pointer has actually left every nested element.
  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    dragDepth.current += 1;
    setDragOver(true);
  }
  function handleDragOver(e: React.DragEvent) {
    // Required even though it does nothing else: a dragover with no handler
    // (or one that doesn't preventDefault) tells the browser this element is
    // not a valid drop target, and the drop event never fires at all.
    e.preventDefault();
  }
  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragOver(false);
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    dragDepth.current = 0;
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) onAttachFile(files[0], files.length - 1);
  }

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const item = Array.from(e.clipboardData.items).find(
      (it) =>
        it.kind === "file" &&
        (it.type.startsWith("image/") ||
          it.type.startsWith("video/") ||
          it.type === "application/pdf"),
    );
    if (!item) return; // no attachable file on the clipboard — let normal text paste happen
    const file = item.getAsFile();
    if (!file) return;
    // Stops the browser from ALSO inserting a filename or a broken inline
    // image placeholder into the textarea alongside the real attachment.
    e.preventDefault();
    onAttachFile(file);
  }

  function handlePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Cleared unconditionally so picking the SAME file twice in a row still
    // fires this handler the second time — the browser only emits `change`
    // on a value transition, and an unchanged `value` would silently no-op.
    e.target.value = "";
    if (file) onAttachFile(file);
  }

  return (
    // This wrapper is sized to exactly the composer box — the glow layers
    // below position with -inset-N relative to IT, so the glow hugs just the
    // box and never the heading or the chips around it.
    <div className="relative">
      {/* The glow — a Gemini-style "chasing light" ring, built with only plain
          `transform: rotate()` + `overflow: hidden` clipping: no @property, no
          CSS masking (both dropped after they didn't visibly work even in a
          fresh, verified non-cached browser). Two layers: a thin bright one
          and a soft blurred halo.

          The blur lives on the CLIP element, not on the rotating child. That
          ordering matters: filters apply AFTER the element (and its
          overflow:hidden clipping) is rendered, so the blur softens the clip's
          hard outer cutoff and lets the light bleed beyond the clip's bounds —
          a real falloff. With the blur on the child instead, the clip's crisp
          edge survives and the result reads as a chunky solid border.

          Opacity is fixed, not keyed off `focused` — an earlier version dimmed
          on blur, which read as "disappearing". The composer's own border
          below is the right place for a focus affordance; this ring stays
          constant. The entrance fade and the ambient pulse are the
          glow-fade-in and glow-pulse keyframes on the outer clipper, so the
          global prefers-reduced-motion rule in globals.css already covers
          them — nothing here animates outside CSS.

          NO NEGATIVE Z-INDEX HERE. `-z-10` drops these layers behind the
          nearest opaque background and they are then invisible forever. The
          layers sit at the default level and the composer is lifted above them
          with z-10, which needs no stacking-context trickery to hold. */}
      <div
        aria-hidden
        className="glow-clip-a pointer-events-none absolute -inset-[3px] overflow-hidden rounded-[1.9rem] blur-[5px]"
      >
        <div
          className="glow-spin-a"
          style={{
            ...SPIN_SQUARE,
            // Stops are pushed into distinct quadrants so the colour visibly
            // travels around the box as this rotates — closely-spaced hues
            // just blur into one flat pink.
            background:
              "conic-gradient(#f72570 0deg, #a33dff 90deg, #ff9868 180deg, #ff6b67 270deg, #f72570 360deg)",
          }}
        />
      </div>
      <div
        aria-hidden
        className="glow-clip-b pointer-events-none absolute -inset-[14px] overflow-hidden rounded-[2.4rem] blur-[22px]"
      >
        <div
          className="glow-spin-b"
          style={{
            ...SPIN_SQUARE,
            background:
              "conic-gradient(from 180deg, #a33dff 0deg, #f72570 90deg, #ff9868 180deg, #ff6b67 270deg, #a33dff 360deg)",
          }}
        />
      </div>

      {/* The glass composer. Opaque enough that the animated ring behind it
          reads as a halo around the box, not a wash bleeding through onto the
          text — earlier versions were translucent enough that the strong glow
          showed straight through onto the placeholder. Still picks up a faint
          frosted quality from backdrop-blur, just not at the cost of
          legibility. */}
      <div
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className="relative z-10 overflow-hidden rounded-[1.75rem] bg-white/95 backdrop-blur-2xl backdrop-saturate-150 transition-colors duration-300 dark:bg-neutral-950/95"
        style={{
          // No focus-driven glow here — the animated ring behind the box is the
          // only glow, and a second one on focus fought with it. Focus is still
          // signalled (it must be, for keyboard users) but with a quiet border
          // shift, plus the textarea's own inside outline below. Dragging a
          // file over the box outranks both: it is the clearest sign of the
          // three that something is about to happen.
          border: `1.5px solid ${
            dragOver
              ? "var(--brand)"
              : focused
                ? "color-mix(in srgb, white 45%, var(--accent) 55%)"
                : "color-mix(in srgb, white 75%, var(--accent) 25%)"
          }`,
          boxShadow: "var(--sh-s), inset 0 1px 0 rgba(255,255,255,0.5)",
        }}
      >
        {children}

        {/* The visible drop-target state the drag-and-drop requirement asks
            for. Sits above everything else in the box but never intercepts
            the drop itself — the box element it's layered over already owns
            the drag handlers, and a pointer-events-none child never steals
            dragenter/dragleave from its parent. */}
        {dragOver && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-[1.75rem] bg-brand-tint/90 backdrop-blur-sm"
          >
            <p className="k-label text-brand-ink">Drop file to attach</p>
          </div>
        )}

        {/* The placeholder was the only label, and it disappears on the first
            keystroke. A visible one would change the design, so this is a
            sr-only label tied to the field by id. */}
        <label htmlFor="create-prompt-input" className="sr-only">
          Describe the website you want to create
        </label>
        <textarea
          id="create-prompt-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onPaste={handlePaste}
          onKeyDown={(e) => {
            // Cmd/Ctrl+Enter builds; plain Enter makes a newline. The homepage
            // box sends on plain Enter because what it sends is a one-liner and
            // costs nothing. Here Enter starts a build that spends the
            // customer's credits, and a brief worth building is several
            // paragraphs — so this keeps the portal composer's existing rule
            // rather than the marketing one. It is the one deliberate
            // behavioural difference between the two boxes.
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canSubmit) {
              e.preventDefault();
              onSubmit();
            }
          }}
          rows={6}
          placeholder={
            listening ? "Listening…" : "Describe the website you want to create…"
          }
          // A focus-visible outline is drawn INSIDE (negative offset) because
          // the composer clips overflow, so `k-focus`'s outward ring would be
          // cut off. Same 2px width and the same brand ring variable, so the
          // product still has one focus appearance. Mouse clicks are
          // unaffected: focus-visible, not focus.
          className="w-full resize-none rounded-[1.6rem] bg-transparent px-6 pb-14 pt-5 text-[15px] leading-relaxed text-neutral-900 outline-none placeholder:text-neutral-500 focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-[var(--brand-ring)] dark:text-white dark:placeholder:text-neutral-400"
        />

        <div className="absolute bottom-3 left-3 flex items-center gap-1">
          {/* The "+" IS the attach affordance for this page — there is no
              second, separately-labelled "attach reference image" button
              alongside it. Hidden input + a real button wrapping it, rather
              than a bare <input type="file">, because a file input cannot be
              styled to match the rest of this hand-rolled control row. */}
          <input
            ref={fileInputRef}
            type="file"
            accept={ATTACHMENT_ACCEPT}
            tabIndex={-1}
            aria-hidden
            className="sr-only"
            onChange={handlePicked}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Attach a reference file"
            className="k-focus flex h-9 w-9 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-black/5 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <Plus size={16} strokeWidth={2} />
          </button>

          {/* Rendered only once the client has confirmed the Web Speech API
              exists — see the useSyncExternalStore note above. Absent (not
              disabled) everywhere it would not work, which is the honest
              treatment for a capability the browser simply does not have. */}
          {speechSupported && (
            <button
              type="button"
              onClick={toggleListening}
              aria-label={listening ? "Stop voice input" : "Start voice input"}
              className={`k-focus relative flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
                listening
                  ? "text-white"
                  : "text-neutral-500 hover:bg-black/5 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-white"
              }`}
              style={listening ? { background: "var(--brand-gradient)" } : undefined}
            >
              {/* Skipped under reduced motion — it's a framer-motion (JS)
                  animation, so the CSS-only reduced-motion rule in globals.css
                  doesn't reach it. The button's solid gradient fill still shows
                  that recording is on. */}
              {listening && !reduced && (
                <motion.span
                  aria-hidden
                  className="absolute inset-0 rounded-full"
                  style={{ background: "var(--brand-gradient)" }}
                  animate={{ opacity: [0.5, 0, 0.5], scale: [1, 1.6, 1] }}
                  transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                />
              )}
              <Mic size={16} strokeWidth={2} className="relative" />
            </button>
          )}
        </div>

        {/* The one brand-gradient fill on this view — the primary action. */}
        <motion.button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit}
          aria-label="Build my site"
          whileHover={canSubmit ? { scale: 1.06 } : undefined}
          whileTap={canSubmit ? { scale: 0.94 } : undefined}
          className="k-focus absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full text-white shadow-[0_6px_18px_-4px_var(--glow)] transition-opacity disabled:opacity-30"
          style={{ background: "var(--brand-gradient)" }}
        >
          <ArrowUp size={16} strokeWidth={2.5} />
        </motion.button>
      </div>
    </div>
  );
}
