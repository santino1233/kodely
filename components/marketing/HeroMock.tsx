"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion, type Variants } from "framer-motion";
import { Mark } from "./Logo";

const PROMPT_TEXT = "A creative studio portfolio, bold and modern, with a project gallery";

const PHASE_DURATIONS = { typing: 2600, building: 2400, live: 5200 } as const;
type Phase = "typing" | "building" | "live";
const NEXT_PHASE: Record<Phase, Phase> = { typing: "building", building: "live", live: "typing" };

// One fixed frame height, used for every phase — previously the frame
// animated its own height per phase, which shifted every section below it
// on the page (a visible jitter). Shorter phases just center within the
// same fixed space now, so the page around it never moves.
const FRAME_HEIGHT = 620;

const container: Variants = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.11, delayChildren: 0.1 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 12 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.2, 0.9, 0.2, 1] } },
};
const blockVariants: Variants = {
  hidden: { opacity: 0, scale: 0.85 },
  shown: { opacity: 1, scale: 1, transition: { duration: 0.4, ease: [0.2, 0.9, 0.2, 1] } },
};

function useTypewriter(text: string, active: boolean, msPerChar: number) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!active) {
      setCount(0);
      return;
    }
    const id = setInterval(() => {
      setCount((c) => (c >= text.length ? c : c + 1));
    }, msPerChar);
    return () => clearInterval(id);
  }, [active, text, msPerChar]);
  return text.slice(0, count);
}

function useEllipsis(active: boolean) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setN((v) => (v + 1) % 4), 400);
    return () => clearInterval(id);
  }, [active]);
  return ".".repeat(n);
}

const BLOCK_STYLE = {
  background: "color-mix(in srgb, var(--accent) 12%, transparent)",
  border: "1px solid color-mix(in srgb, var(--accent) 28%, transparent)",
};

// Real photography, not gradient placeholders — this is Kodely's own
// marketing chrome (not a customer-generated site), so it isn't bound by
// the no-external-requests CSP that applies to actual generated output.
const HERO_IMAGE = "https://picsum.photos/id/180/900/400";
const GALLERY_IMAGES = [
  "https://picsum.photos/id/685/400/400",
  "https://picsum.photos/id/519/400/400",
  "https://picsum.photos/id/704/400/400",
];

const STATS = [
  { value: "120+", label: "Projects" },
  { value: "40", label: "Clients" },
  { value: "8 yrs", label: "Experience" },
];

/** The one real hero object — a miniature browser frame that plays out the
 * actual product loop (type a prompt → watch it build → it's live at a real
 * URL) instead of showing a single static screenshot. Loops continuously;
 * respects prefers-reduced-motion by settling on the finished "live" frame. */
export function HeroMock() {
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState<Phase>(reduced ? "live" : "typing");
  const [liveCycle, setLiveCycle] = useState(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (reduced) return;
    timeoutRef.current = setTimeout(() => {
      setPhase((p) => {
        const next = NEXT_PHASE[p];
        if (next === "live") setLiveCycle((c) => c + 1);
        return next;
      });
    }, PHASE_DURATIONS[phase]);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [phase, reduced]);

  const typed = useTypewriter(PROMPT_TEXT, phase === "typing", 34);
  const dots = useEllipsis(phase === "building");

  return (
    <div className="mx-auto w-full max-w-2xl" style={{ perspective: "1800px" }}>
      <div className="group overflow-hidden rounded-2xl border border-black/10 bg-white shadow-[0_40px_80px_-32px_rgba(0,0,0,0.25)] transition-transform duration-500 [transform:rotateX(4deg)] hover:[transform:rotateX(0deg)] dark:border-white/10 dark:bg-neutral-900">
        <div className="flex items-center gap-2 border-b border-black/10 bg-black/[0.03] px-4 py-2.5 dark:border-white/10 dark:bg-white/[0.03]">
          <span className="h-2.5 w-2.5 rounded-full bg-black/15 dark:bg-white/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-black/15 dark:bg-white/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-black/15 dark:bg-white/15" />
          <div className="ml-3 flex-1 overflow-hidden rounded-md bg-black/[0.04] px-3 py-1 text-center font-mono text-[11px] text-black/40 dark:bg-white/[0.06] dark:text-white/40">
            <AnimatePresence mode="wait">
              {phase === "live" ? (
                <motion.span key="url" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  studio-nine.kodely.site
                </motion.span>
              ) : (
                <motion.span key="new" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  new-project.kodely.site
                </motion.span>
              )}
            </AnimatePresence>
          </div>
          <div className="hidden items-center gap-1.5 font-mono text-[10px] text-black/30 sm:flex dark:text-white/30">
            {phase === "live" ? (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                Generated by Kodely
              </>
            ) : (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-neutral-300 dark:bg-neutral-700" />
                {phase === "typing" ? "Waiting for prompt" : "Building"}
              </>
            )}
          </div>
        </div>

        <div
          className="relative overflow-hidden bg-[#fbf7f2] dark:bg-[#1c1512]"
          style={{ height: FRAME_HEIGHT }}
        >
          <AnimatePresence mode="wait">
            {phase === "typing" && (
              <motion.div
                key="typing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex h-full flex-col items-center justify-center gap-5 px-10 text-center"
              >
                <Mark size={30} />
                <div className="w-full max-w-sm rounded-xl border border-[#e4d9cc] bg-white px-4 py-3.5 text-left text-[13px] leading-relaxed text-[#2a1f1a] shadow-sm dark:border-white/10 dark:bg-[#241a15] dark:text-[#f2e9e2]">
                  {typed}
                  <motion.span
                    className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] bg-current align-middle"
                    animate={{ opacity: [1, 1, 0, 0] }}
                    transition={{ duration: 0.9, repeat: Infinity, times: [0, 0.5, 0.5, 1] }}
                  />
                </div>
                <p className="text-xs text-[#8a7362] dark:text-[#b39d8a]">Describe it, and Kodely builds it.</p>
              </motion.div>
            )}

            {phase === "building" && (
              <motion.div
                key="building"
                initial="hidden"
                animate="shown"
                exit={{ opacity: 0 }}
                variants={container}
                className="flex h-full flex-col items-center justify-center gap-6 px-10"
              >
                <motion.div variants={item} className="relative flex h-16 w-16 items-center justify-center">
                  <motion.span
                    aria-hidden
                    className="absolute inset-0 rounded-full"
                    style={{ background: "conic-gradient(from 0deg, transparent, var(--glow) 20%, transparent 45%)" }}
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2.2, repeat: Infinity, ease: "linear" }}
                  />
                  <div className="relative flex h-11 w-11 items-center justify-center rounded-full bg-[#fbf7f2] dark:bg-[#1c1512]">
                    <Mark size={26} />
                  </div>
                </motion.div>

                <motion.div variants={item} className="grid w-full max-w-[220px] grid-cols-3 gap-2">
                  <motion.div variants={blockVariants} className="col-span-3 h-6 rounded-md" style={BLOCK_STYLE} />
                  <motion.div variants={blockVariants} className="col-span-3 h-16 rounded-md" style={BLOCK_STYLE} />
                  <motion.div variants={blockVariants} className="h-10 rounded-md" style={BLOCK_STYLE} />
                  <motion.div variants={blockVariants} className="h-10 rounded-md" style={BLOCK_STYLE} />
                  <motion.div variants={blockVariants} className="h-10 rounded-md" style={BLOCK_STYLE} />
                </motion.div>

                <motion.p variants={item} className="font-mono text-xs text-[#8a7362] dark:text-[#b39d8a]">
                  Building your site{dots}
                </motion.p>
              </motion.div>
            )}

            {phase === "live" && (
              <motion.div
                key={`live-${liveCycle}`}
                initial="hidden"
                animate="shown"
                variants={container}
                className="flex h-full flex-col px-7 py-7 text-[#201c2b] dark:text-[#f1eef7]"
              >
                <motion.div variants={item} className="flex items-center justify-between">
                  <span className="text-sm font-semibold tracking-tight">Studio Nine</span>
                  <div className="flex gap-4 text-xs text-[#716b82] dark:text-[#b3aec2]">
                    <span>Work</span>
                    <span>Studio</span>
                    <span>Contact</span>
                  </div>
                </motion.div>

                <motion.div
                  variants={item}
                  className="relative mt-4 flex h-40 flex-col justify-end overflow-hidden rounded-xl p-4"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={HERO_IMAGE} alt="" className="absolute inset-0 h-full w-full object-cover" />
                  <div
                    aria-hidden
                    className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent"
                  />
                  <span className="relative text-[10px] font-medium uppercase tracking-[0.14em] text-white/80">
                    Selected work
                  </span>
                  <h3 className="relative mt-1 text-lg font-semibold leading-tight text-white sm:text-xl">
                    Design that moves people.
                  </h3>
                </motion.div>

                <motion.div variants={item} className="mt-3 grid grid-cols-3 gap-2">
                  {GALLERY_IMAGES.map((src) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={src} src={src} alt="" className="aspect-square rounded-lg object-cover" />
                  ))}
                </motion.div>

                <motion.div variants={item} className="mt-5 flex items-center justify-between px-2">
                  {STATS.map((s) => (
                    <div key={s.label} className="text-center">
                      <div className="text-sm font-semibold">{s.value}</div>
                      <div className="text-[10px] text-[#8a839a] dark:text-[#9d97ad]">{s.label}</div>
                    </div>
                  ))}
                </motion.div>

                <motion.div variants={item} className="mt-5 flex gap-3">
                  <span
                    className="rounded-lg px-4 py-2 text-xs font-medium text-white"
                    style={{ background: "linear-gradient(135deg, #6d5bd0, #a15bd0)" }}
                  >
                    View our work
                  </span>
                  <span className="rounded-lg border border-[#716b82]/25 px-4 py-2 text-xs font-medium text-[#4a4558] dark:text-[#d8d4e2]">
                    Get in touch
                  </span>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
