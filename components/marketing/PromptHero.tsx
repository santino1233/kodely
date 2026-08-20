"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, Paperclip, Mic, X, Gift } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { PENDING_PROMPT_KEY, PENDING_PROMPT_IMAGE_KEY } from "@/lib/pending-prompt";
import { SIGNUP_GRANT } from "@/lib/credits";

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
  const reduced = useReducedMotion();
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
      {/* The glow — a wide, soft ambient radial wash centered behind the
          composer (the Gemini-style "accent light" look), not a blur hugging
          the box's edges. Bumped noticeably brighter/larger than the last
          pass — at the previous intensity it was technically animating
          (confirmed via computed styles) but visually blended into the
          page's own ambient Aura background and read as "no glow" at rest.
          Two overlapping ellipses (pink + violet) drift/orbit around the box
          on slow, independently-timed loops — the two different durations
          keep it from ever looking like a single repeating loop. Opacity
          shifts up further on focus so clicking in visibly lifts it. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 -z-10 -translate-x-1/2 -translate-y-1/2 rounded-full blur-[80px]"
        style={{
          width: "min(1040px, 98vw)",
          height: "540px",
          background: "radial-gradient(closest-side, var(--glow), transparent)",
        }}
        initial={{ opacity: 0.7 }}
        animate={
          reduced
            ? { opacity: focused ? 0.95 : 0.8 }
            : {
                opacity: focused ? [0.75, 1, 0.75] : [0.6, 0.88, 0.6],
                x: [0, 40, -26, 0],
                y: [0, -30, 34, 0],
              }
        }
        transition={{ duration: 5, repeat: reduced ? 0 : Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 -z-10 -translate-x-1/2 -translate-y-1/2 rounded-full blur-[80px]"
        style={{
          width: "min(780px, 85vw)",
          height: "420px",
          background: "radial-gradient(closest-side, var(--glow-2), transparent)",
        }}
        initial={{ opacity: 0.55 }}
        animate={
          reduced
            ? { opacity: focused ? 0.8 : 0.6 }
            : {
                opacity: focused ? [0.55, 0.8, 0.55] : [0.42, 0.68, 0.42],
                x: [0, -32, 26, 0],
                y: [0, 28, -22, 0],
              }
        }
        transition={{ duration: 6.5, repeat: reduced ? 0 : Infinity, ease: "easeInOut", delay: 0.6 }}
      />

      {/* Free-credits badge — the first thing a visitor should register
          about pricing, before they've even typed anything. */}
      <div className="mb-4 flex justify-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200/70 bg-white/60 px-3.5 py-1.5 text-xs font-medium text-neutral-600 backdrop-blur-md dark:border-white/10 dark:bg-white/[0.05] dark:text-neutral-300">
          <Gift size={13} style={{ color: "var(--accent)" }} />
          Get {SIGNUP_GRANT} free credits — enough for a real site and a few edits
        </span>
      </div>

      {/* The glass composer. Stays translucent and neutral itself — the
          brand color comes entirely from the glow bleeding through from
          behind, which is what actually reads as "glass" rather than a
          tinted card. Heavy blur+saturate for the frosted, light-bending
          look; the rim is a hairline that just barely picks up warmth. */}
      <div
        className="relative overflow-hidden rounded-[1.75rem] bg-white/45 backdrop-blur-2xl backdrop-saturate-150 transition-shadow duration-300 dark:bg-white/[0.06]"
        style={{
          border: "1.5px solid color-mix(in srgb, white 75%, var(--accent) 25%)",
          boxShadow: focused
            ? "0 24px 70px -20px var(--glow), inset 0 1px 0 rgba(255,255,255,0.6)"
            : "var(--sh-s), inset 0 1px 0 rgba(255,255,255,0.5)",
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
