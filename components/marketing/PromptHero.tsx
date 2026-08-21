"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, Paperclip, Mic, X, Gift } from "lucide-react";
import { motion } from "framer-motion";
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

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((e: any) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  return (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition ?? null;
}

export function PromptHero() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const baseValueRef = useRef("");

  useEffect(() => {
    setSpeechSupported(getSpeechRecognition() !== null);
  }, []);

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

    rec.onresult = (e: any) => {
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

        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={2}
          placeholder={listening ? "Listening…" : "Describe the site you want to build…"}
          className="w-full resize-none bg-transparent px-6 pb-14 pt-5 text-[15px] leading-relaxed text-neutral-900 outline-none placeholder:text-neutral-500 dark:text-white dark:placeholder:text-neutral-400"
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
              {listening && (
                <motion.span
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
    </div>
  );
}
