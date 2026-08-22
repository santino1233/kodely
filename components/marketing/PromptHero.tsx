"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowUp, Paperclip, Mic, X, Gift, Sparkles } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { PENDING_PROMPT_KEY, PENDING_PROMPT_IMAGE_KEY } from "@/lib/pending-prompt";
import { SIGNUP_GRANT } from "@/lib/credits";

// The rotating gradient inside each glow clip MUST be a square that is
// larger than the clip's diagonal, or it stops covering the clip partway
// through its own rotation and the ring visibly vanishes and returns on a
// loop. (The previous `inset-[-50%]` made it 2x the clip in BOTH axes —
// e.g. 1372x296 for this wide composer. Rotated 90deg that occupies
// 296x1372: only 296px wide, far short of the ~686px the clip needs
// covered. Hence "the glow keeps disappearing.")
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

const SUGGESTIONS = [
  "A portfolio site for a freelance photographer",
  "A landing page for my SaaS product",
  "A website for a neighborhood coffee shop",
  "A booking page for my consulting practice",
];

// Downscale + re-encode client-side so a phone photo doesn't blow past
// sessionStorage's per-origin quota (or the tokens it costs Claude to look
// at it) — a reference image only needs to be legible, not full-resolution.
async function downscaleImage(file: File, maxDim = 1400, quality = 0.82): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unsupported");
  ctx.drawImage(bitmap, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}

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

export function PromptHero() {
  const router = useRouter();
  const reduced = useReducedMotion();
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const speechSupported = useSyncExternalStore(
    NEVER_CHANGES,
    readSpeechSupported,
    speechUnsupportedOnServer,
  );
  const [enhanceSupported, setEnhanceSupported] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  // The prompt as typed, kept only while an enhanced spec is on screen — this
  // is what "Revert" restores, and its presence is what tells the composer it
  // is currently showing a spec rather than a one-liner.
  const [enhancedFrom, setEnhancedFrom] = useState<string | null>(null);
  const [enhanceError, setEnhanceError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const baseValueRef = useRef("");

  // /api/enhance is auth-gated, and most people meeting this hero are signed
  // out — so the button appears only once we know it would work, the same way
  // the mic waits on feature detection above. Failing closed is the point:
  // an affordance that 401s on click is worse than no affordance.
  useEffect(() => {
    let alive = true;
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((body) => {
        if (alive && body?.user) setEnhanceSupported(true);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  async function enhance() {
    const text = value.trim();
    if (!text || enhancing) return;

    setEnhancing(true);
    setEnhanceError(null);
    try {
      const res = await fetch("/api/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Always the ORIGINAL one-liner, never a spec we already produced —
        // enhancing an enhancement compounds invention instead of adding
        // detail, and the round trip would drift further from what was asked.
        body: JSON.stringify({ prompt: enhancedFrom ?? text }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.spec) throw new Error(body?.error ?? "Couldn't expand that.");
      setEnhancedFrom(enhancedFrom ?? text);
      setValue(body.spec);
    } catch (err) {
      // Nothing is destroyed on failure: `value` still holds what they typed,
      // and the build button beside this was never disabled.
      setEnhanceError(err instanceof Error ? err.message : "Couldn't expand that.");
    } finally {
      setEnhancing(false);
    }
  }

  function revert() {
    if (enhancedFrom === null) return;
    setValue(enhancedFrom);
    setEnhancedFrom(null);
    setEnhanceError(null);
  }

  function submit() {
    const text = value.trim();
    if (!text) return;
    try {
      sessionStorage.setItem(PENDING_PROMPT_KEY, text);
      if (image) sessionStorage.setItem(PENDING_PROMPT_IMAGE_KEY, image);
      else sessionStorage.removeItem(PENDING_PROMPT_IMAGE_KEY);
    } catch {}
    router.push("/signup");
  }

  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !file.type.startsWith("image/")) return;
    try {
      setImage(await downscaleImage(file));
    } catch {}
  }

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
      setValue((baseValueRef.current + transcript).trimStart());
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);

    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  }

  useEffect(() => () => recognitionRef.current?.stop(), []);

  return (
    <div className="relative mx-auto w-full max-w-2xl">
      {/* Free-credits badge — the first thing a visitor should register
          about pricing, before they've even typed anything. Sits above the
          glow/composer group entirely (not inside its relative wrapper) so
          the glow below hugs just the box, not the badge too. */}
      <div className="mb-4 flex justify-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200/70 bg-white/60 px-3.5 py-1.5 text-xs font-medium text-neutral-600 backdrop-blur-md dark:border-white/10 dark:bg-white/[0.05] dark:text-neutral-300">
          <Gift size={13} style={{ color: "var(--accent)" }} />
          Get {SIGNUP_GRANT} free credits — enough for a real site and a few edits
        </span>
      </div>

      {/* This inner wrapper is sized to exactly the composer box — the glow
          layers below position with -inset-N relative to IT specifically,
          not the outer component (which also holds the badge and suggestion
          chips), so the glow hugs just the box, never the whole component. */}
      <div className="relative">
      {/* The glow — a Gemini-style "chasing light" ring, rebuilt with only
          plain `transform: rotate()` + `overflow: hidden` clipping — no
          @property, no CSS masking (dropped after those didn't visibly
          work even in a fresh, verified non-cached browser). Two layers:
          a thin bright one (-inset-[7px]) and a soft blurred halo
          (-inset-[22px]). Deliberately NOT the page's big ambient .aura
          blobs (Aura.tsx), a separate, much larger, static effect.

          The blur lives on the CLIP element, not on the rotating child.
          That ordering matters: filters apply AFTER the element (and its
          overflow:hidden clipping) is rendered, so the blur softens the
          clip's hard outer cutoff and lets the light bleed beyond the
          clip's bounds — a real falloff. With the blur on the child
          instead, the clip's crisp edge survives and the result reads as
          a chunky solid border rather than a glow.

          Each layer's blur radius therefore wants to be comparable to or
          larger than its own inset, so the band never looks like a hard
          stripe. Opacities are deliberately well under 1 (see
          glow-fade-in-a/-b) — at full strength the brand colors read as a
          saturated ring instead of ambient light.

          Each layer is a STATIC outer clipper (glow-clip-*, overflow:
          hidden, never transforms) containing one OVERSIZED inner
          rotator (glow-spin-*, ~2x the clipper's size via inset:-50%,
          centered). Only the inner rotator spins — being oversized, its
          corners sweeping outside a same-sized box (the original "wide
          rectangle rotated as a rigid body swings outside its footprint"
          bug) never matters, since the static outer box clips them away
          at every angle. The opaque composer sitting on top (z-10) covers
          the rotator's entire interior on its own, leaving only the outer
          few px visible as a ring — no masking needed for that either.

          Opacity is fixed, not keyed off `focused` — an earlier version
          dimmed on blur, which read as "disappearing." The composer's own
          border/shadow below is the right place for a focus affordance;
          this ambient ring stays constant.

          Entrance: fade+scale in once via the glow-fade-in-a/-b keyframes
          on the outer clipper (globals.css) — plain CSS, not a
          framer-motion `whileInView`.

          NO NEGATIVE Z-INDEX HERE — this was the "it appears for a moment
          on load, then is gone for good" bug. PromptHero is wrapped in
          <Reveal>, which animates opacity 0 -> 1. An element with opacity
          BETWEEN 0 and 1 establishes a stacking context, which kept these
          layers painting above the page background while the reveal ran.
          The moment opacity reached exactly 1 that stacking context was
          destroyed, and `-z-10` dropped the layers behind the root page
          div's opaque bg-white / dark:bg-neutral-950 — invisible, forever.
          Instead the layers now sit at the default level (painting above
          the page background) and the composer is lifted above THEM with
          z-10, which needs no stacking-context trickery to hold. */}
      <div aria-hidden className="glow-clip-a pointer-events-none absolute -inset-[3px] overflow-hidden rounded-[1.9rem] blur-[5px]">
        <div
          className="glow-spin-a"
          style={{
            ...SPIN_SQUARE,
            // Stops are pushed into distinct quadrants (rather than the
            // near-adjacent pink/coral/orange run they used to be) so the
            // colour visibly travels around the box as this rotates —
            // closely-spaced hues just blur into one flat pink.
            background:
              "conic-gradient(#f72570 0deg, #a33dff 90deg, #ff9868 180deg, #ff6b67 270deg, #f72570 360deg)",
          }}
        />
      </div>
      <div aria-hidden className="glow-clip-b pointer-events-none absolute -inset-[14px] overflow-hidden rounded-[2.4rem] blur-[22px]">
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
          (see above) reads as a halo around the box, not a wash bleeding
          through onto the text — earlier versions were translucent enough
          that the strong glow behind showed straight through onto the
          placeholder/input text. Still picks up a faint frosted quality from
          backdrop-blur, just not at the cost of legibility. */}
      <div
        className="relative z-10 overflow-hidden rounded-[1.75rem] bg-white/95 backdrop-blur-2xl backdrop-saturate-150 transition-colors duration-300 dark:bg-neutral-950/95"
        style={{
          // No focus-driven glow here — the animated ring behind the box is
          // the only glow, and a second one on focus fought with it. Focus
          // is still signalled (it must be, for keyboard users) but with a
          // quiet border shift instead.
          border: `1.5px solid ${
            focused
              ? "color-mix(in srgb, white 45%, var(--accent) 55%)"
              : "color-mix(in srgb, white 75%, var(--accent) 25%)"
          }`,
          boxShadow: "var(--sh-s), inset 0 1px 0 rgba(255,255,255,0.5)",
        }}
      >
        {image && (
          <div className="flex items-center gap-2 px-6 pt-4">
            <div className="relative h-12 w-12 overflow-hidden rounded-lg border border-black/10 dark:border-white/10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image} alt="Attached reference" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => setImage(null)}
                aria-label="Remove attached image"
                className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/60 text-white"
              >
                <X size={10} strokeWidth={3} />
              </button>
            </div>
            <span className="text-xs text-neutral-500 dark:text-neutral-400">Reference image attached</span>
          </div>
        )}

        {/* The spec is not a modal or a preview pane — it lands straight in the
            composer's own textarea, which is already editable and already the
            thing the send button reads. So "accept" is just pressing send,
            "edit" is typing, and "discard" is Revert. No new pattern, and no
            state where the user is stuck looking at something they can't
            change. */}
        {enhancedFrom !== null && (
          <div className="flex items-center justify-between gap-2 px-6 pt-4">
            <span className="inline-flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
              <Sparkles size={13} style={{ color: "var(--accent)" }} />
              Expanded spec — edit anything before you build
            </span>
            <button
              type="button"
              onClick={revert}
              className="text-xs text-neutral-500 underline underline-offset-2 transition-colors hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
            >
              Revert
            </button>
          </div>
        )}

        {/* role="alert" so a failed Enhance is spoken rather than appearing
            silently above a textarea the user is looking away from. */}
        {enhanceError && (
          <p role="alert" className="px-6 pt-4 text-xs text-neutral-500 dark:text-neutral-400">
            {enhanceError}
          </p>
        )}

        {/* The placeholder was the only label, and it disappears on the first
            keystroke. A visible one would change the design, so this is a
            sr-only label tied to the field by id. */}
        <label htmlFor="prompt-hero-input" className="sr-only">
          Describe the site you want to build
        </label>
        <textarea
          id="prompt-hero-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            // Enter sends a one-liner, but while a spec is on screen this box
            // is a multi-line editor — there, Enter has to make a newline or
            // the first paragraph break the user types starts a build of a
            // half-edited spec. The send button still works either way.
            if (e.key === "Enter" && !e.shiftKey && enhancedFrom === null) {
              e.preventDefault();
              submit();
            }
          }}
          // A ~200-word spec in a two-row box is unreviewable, and an
          // unreviewed spec defeats the whole feature — grow to fit it.
          rows={enhancedFrom !== null ? 12 : 2}
          placeholder={listening ? "Listening…" : "Describe the site you want to build…"}
          // `outline-none` left the composer's own border shift as the only
          // focus signal, and that shift (a 25% -> 55% accent tint of white)
          // is about 1.5:1 against its own unfocused state — under the 3:1
          // WCAG 2.4.11 asks of a focus indicator. A focus-visible outline is
          // drawn INSIDE (negative offset) because the composer clips
          // overflow, and the matching radius keeps it hugging the rounded
          // box. Mouse clicks are unaffected: focus-visible, not focus.
          className="w-full resize-none rounded-[1.6rem] bg-transparent px-6 pb-14 pt-5 text-[15px] leading-relaxed text-neutral-900 outline-none placeholder:text-neutral-500 focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-[var(--accent)] dark:text-white dark:placeholder:text-neutral-400"
        />

        <div className="absolute bottom-3 left-3 flex items-center gap-1">
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onPickImage} />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Attach an image"
            className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-black/5 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <Paperclip size={16} strokeWidth={2} />
          </button>
          {speechSupported && (
            <button
              type="button"
              onClick={toggleListening}
              aria-label={listening ? "Stop voice input" : "Start voice input"}
              className={`relative flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
                listening
                  ? "text-white"
                  : "text-neutral-500 hover:bg-black/5 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-white"
              }`}
              style={listening ? { background: "var(--brand-gradient)" } : undefined}
            >
              {/* Skipped under reduced motion — it's a framer-motion (JS)
                  animation, so the CSS-only reduced-motion rule in
                  globals.css doesn't reach it. The button's solid gradient
                  fill still shows that recording is on. */}
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
          {enhanceSupported && (
            <button
              type="button"
              onClick={enhance}
              disabled={enhancing || !value.trim()}
              aria-label="Expand this into a fuller spec you can edit"
              className="flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-neutral-500 transition-colors hover:bg-black/5 hover:text-neutral-900 disabled:pointer-events-none disabled:opacity-40 dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-white"
            >
              <Sparkles size={14} strokeWidth={2} />
              {enhancing ? "Enhancing…" : "Enhance"}
            </button>
          )}
        </div>

        <motion.button
          type="button"
          onClick={submit}
          disabled={!value.trim()}
          aria-label="Start building"
          whileHover={value.trim() ? { scale: 1.06 } : undefined}
          whileTap={value.trim() ? { scale: 0.94 } : undefined}
          className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full text-white shadow-[0_6px_18px_-4px_var(--glow)] transition-opacity disabled:opacity-30"
          style={{ background: "var(--brand-gradient)" }}
        >
          <ArrowUp size={16} strokeWidth={2.5} />
        </motion.button>
      </div>

      </div>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setValue(s)}
            className="rounded-full border border-neutral-200/70 bg-white/50 px-3.5 py-1.5 text-xs text-neutral-600 backdrop-blur-md transition-colors hover:border-neutral-300 hover:text-neutral-900 dark:border-white/10 dark:bg-white/[0.04] dark:text-neutral-400 dark:hover:text-white"
          >
            {s}
          </button>
        ))}
      </div>

      {/* The side door to /wizard. That page existed with nothing linking to
          it, so it was reachable only by typing the URL.
          Deliberately a quiet line BELOW the composer rather than a button
          beside it: the raw box stays the default, and the plan is explicit
          that the wizard is a side door and never a gate. */}
      <p className="mt-4 text-center text-xs text-neutral-500 dark:text-neutral-400">
        Not sure what to write?{" "}
        <Link
          href="/wizard"
          className="underline underline-offset-4 transition-colors hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] dark:hover:text-white"
        >
          Answer two questions instead
        </Link>
      </p>
    </div>
  );
}
