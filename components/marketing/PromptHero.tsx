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
      {/* The glow — a wide, soft ambient radial wash centered behind the
          composer (the Gemini-style "accent light" look), not a blur hugging
          the box's edges. Reuses the same radial-gradient(closest-side, …,
          transparent) + heavy-blur language as the page's own Aura background
          blobs, just centered on the box instead of tucked in a page corner.
          Two overlapping ellipses (pink + violet, the two ends of the brand
          gradient) breathe in opacity only — fixed size/position, never
          sweeping through a dim trough — so it never reads as vanishing. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 -z-10 -translate-x-1/2 -translate-y-1/2 rounded-full blur-[90px]"
        style={{
          width: "min(880px, 92vw)",
          height: "460px",
          background: "radial-gradient(closest-side, var(--glow), transparent)",
        }}
        initial={{ opacity: 0.55 }}
        animate={reduced ? { opacity: 0.6 } : { opacity: [0.45, 0.7, 0.45] }}
        transition={{ duration: 6, repeat: reduced ? 0 : Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 -z-10 -translate-x-1/2 -translate-y-1/2 rounded-full blur-[90px]"
        style={{
          width: "min(620px, 70vw)",
          height: "340px",
          background: "radial-gradient(closest-side, var(--glow-2), transparent)",
        }}
        initial={{ opacity: 0.4 }}
        animate={reduced ? { opacity: 0.45 } : { opacity: [0.3, 0.55, 0.3] }}
        transition={{ duration: 7, repeat: reduced ? 0 : Infinity, ease: "easeInOut", delay: 0.7 }}
      />
      {/* Focus adds a small extra lift on top of the resting glow — never
          drops below the resting level. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 -z-10 -translate-x-1/2 -translate-y-1/2 rounded-full blur-[90px]"
        style={{
          width: "min(880px, 92vw)",
          height: "460px",
          background: "radial-gradient(closest-side, var(--glow), transparent)",
        }}
        animate={{ opacity: focused ? 0.3 : 0 }}
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
