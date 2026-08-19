"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowUp } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { PENDING_PROMPT_KEY } from "@/lib/pending-prompt";

const SUGGESTIONS = [
  "A portfolio site for a freelance photographer",
  "A landing page for my SaaS product",
  "A website for a neighborhood coffee shop",
  "A booking page for my consulting practice",
];

export function PromptHero() {
  const router = useRouter();
  const reduced = useReducedMotion();
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);

  function submit() {
    const text = value.trim();
    if (!text) return;
    try {
      sessionStorage.setItem(PENDING_PROMPT_KEY, text);
    } catch {}
    router.push("/signup");
  }

  return (
    <div className="relative mx-auto w-full max-w-2xl">
      {/* The glow — a static-color brand gradient, breathing slowly. Not a
          color-cycling shimmer (that pattern was rejected earlier in this
          project) — just a calm pulse in scale/opacity, like Gemini's
          composer glow. Sized and saturated to actually read against a
          white background, not just dark mode. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -inset-16 -z-10 rounded-[3rem] blur-3xl"
        style={{ background: "var(--brand-gradient)" }}
        initial={{ opacity: 0.55, scale: 0.94 }}
        animate={
          reduced
            ? { opacity: 0.65, scale: 1 }
            : { opacity: [0.5, 0.75, 0.5], scale: [0.94, 1.02, 0.94] }
        }
        transition={{ duration: 5, repeat: reduced ? 0 : Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -inset-10 -z-10 rounded-[2.5rem] blur-2xl"
        style={{ background: "var(--brand-gradient)" }}
        animate={reduced ? { opacity: 0.35 } : { opacity: [0.3, 0.5, 0.3] }}
        transition={{ duration: 5, repeat: reduced ? 0 : Infinity, ease: "easeInOut", delay: 1.4 }}
      />
      {/* Focus intensifies the glow — the panel visibly "wakes up". */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -inset-6 -z-10 rounded-[2.25rem] blur-xl"
        style={{ background: "var(--brand-gradient)" }}
        animate={{ opacity: focused ? 0.6 : 0 }}
        transition={{ duration: 0.5 }}
      />

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
          placeholder="Describe the site you want to build…"
          className="w-full resize-none bg-transparent px-6 pb-14 pt-5 text-[15px] leading-relaxed text-neutral-900 outline-none placeholder:text-neutral-500 dark:text-white dark:placeholder:text-neutral-400"
        />
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
