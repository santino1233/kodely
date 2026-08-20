"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion, type Variants } from "framer-motion";
import { Check } from "lucide-react";
import { Mark } from "./Logo";

const PROMPT_TEXT = "A boutique pilates studio with online class booking";

const PHASE_DURATIONS = { typing: 2600, building: 2400, live: 5400 } as const;
type Phase = "typing" | "building" | "live";
const NEXT_PHASE: Record<Phase, Phase> = { typing: "building", building: "live", live: "typing" };

// A real booking flow plays out during the "live" phase, not just a static
// page — the demo is meant to look like a working app, not a brochure.
type BookingStep = "browse" | "clicking" | "confirmed";
const BOOKING_DURATIONS: Record<BookingStep, number> = { browse: 1700, clicking: 600, confirmed: 2800 };
const NEXT_BOOKING: Record<BookingStep, BookingStep> = { browse: "clicking", clicking: "confirmed", confirmed: "browse" };
const BOOKING_TARGET_INDEX = 0;

// One fixed frame height, used for every phase — previously the frame
// animated its own height per phase, which shifted every section below it
// on the page (a visible jitter). Shorter phases just center within the
// same fixed space now, so the page around it never moves. Sized to the
// live phase's actual content (measured ~363px) plus a little breathing
// room — the old 620px value was sized for the earlier Studio Nine demo's
// taller content and left a large dead-space gap under this one.
const FRAME_HEIGHT = 410;

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

// A real reformer-pilates studio photo, self-hosted under /public (not
// hotlinked) — this is Kodely's own marketing chrome (not a customer-
// generated site), so it isn't bound by the no-external-requests CSP that
// applies to actual generated output.
const HERO_IMAGE = "/marketing/bloom-pilates-hero.jpg";

const CLASSES = [
  { time: "9:00 AM", name: "Reformer Flow", initial: "M", color: "#a15bd0", meta: "3 spots left" },
  { time: "11:30 AM", name: "Mat Pilates", initial: "J", color: "#e0729a", meta: "6 spots left" },
  { time: "1:00 PM", name: "Power Pilates", initial: "S", color: "#3d9970", meta: "2 spots left" },
];

/** The one real hero object — a miniature browser frame that plays out the
 * actual product loop (type a prompt → watch it build → it's live at a real
 * URL) instead of showing a single static screenshot. Loops continuously;
 * respects prefers-reduced-motion by settling on the finished "live" frame. */
export function HeroMock() {
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState<Phase>(reduced ? "live" : "typing");
  const [liveCycle, setLiveCycle] = useState(0);
  const [bookingStep, setBookingStep] = useState<BookingStep>("browse");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bookingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Resets to "browse" every time the live phase is (re-)entered, then
  // steps itself through click -> confirm while that phase is showing.
  useEffect(() => {
    setBookingStep("browse");
  }, [liveCycle]);

  useEffect(() => {
    if (phase !== "live" || reduced) return;
    bookingTimeoutRef.current = setTimeout(() => {
      setBookingStep((s) => NEXT_BOOKING[s]);
    }, BOOKING_DURATIONS[bookingStep]);
    return () => {
      if (bookingTimeoutRef.current) clearTimeout(bookingTimeoutRef.current);
    };
  }, [bookingStep, phase, reduced]);

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
                  bloom-pilates.kodely.site
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
                className="relative flex h-full flex-col px-6 py-6 text-[#201c2b] dark:text-[#f1eef7]"
              >
                <motion.div variants={item} className="flex items-center justify-between">
                  <span className="text-sm font-semibold tracking-tight">Bloom Pilates</span>
                  <div className="flex gap-4 text-xs text-[#716b82] dark:text-[#b3aec2]">
                    <span>Classes</span>
                    <span>Instructors</span>
                    <span>Membership</span>
                  </div>
                </motion.div>

                <motion.div
                  variants={item}
                  className="relative mt-4 flex h-32 flex-col justify-end overflow-hidden rounded-xl p-4"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={HERO_IMAGE} alt="" className="absolute inset-0 h-full w-full object-cover" />
                  <div
                    aria-hidden
                    className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent"
                  />
                  <span className="relative text-[10px] font-medium uppercase tracking-[0.14em] text-white/80">
                    Book a class
                  </span>
                  <h3 className="relative mt-1 text-lg font-semibold leading-tight text-white sm:text-xl">
                    Strength. Balance. You.
                  </h3>
                </motion.div>

                <motion.div variants={item} className="mt-4 space-y-2">
                  {CLASSES.map((c, i) => {
                    const isTarget = i === BOOKING_TARGET_INDEX;
                    const booked = isTarget && bookingStep === "confirmed";
                    const selecting = isTarget && bookingStep === "clicking";
                    return (
                      <motion.div
                        key={c.name}
                        animate={{ scale: selecting ? 1.015 : 1 }}
                        transition={{ duration: 0.2 }}
                        className="flex items-center gap-3 rounded-xl border px-3 py-2.5"
                        style={{
                          borderColor: booked
                            ? "rgba(16,185,129,0.4)"
                            : "color-mix(in srgb, currentColor 10%, transparent)",
                          background: booked
                            ? "rgba(16,185,129,0.06)"
                            : "color-mix(in srgb, currentColor 3%, transparent)",
                        }}
                      >
                        <div
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                          style={{ background: c.color }}
                        >
                          {c.initial}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px] font-medium">{c.name}</div>
                          <div className="text-[11px] text-[#8a839a] dark:text-[#9d97ad]">{c.time}</div>
                        </div>
                        <AnimatePresence mode="wait">
                          {booked ? (
                            <motion.span
                              key="booked"
                              initial={{ opacity: 0, scale: 0.7 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400"
                            >
                              <Check size={11} strokeWidth={3} /> Booked
                            </motion.span>
                          ) : (
                            <motion.button
                              key="book"
                              type="button"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              className="shrink-0 rounded-full px-3 py-1 text-[11px] font-medium text-white"
                              style={{ background: "var(--brand-gradient)" }}
                            >
                              Book
                            </motion.button>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    );
                  })}
                </motion.div>

                {!reduced && (
                  <motion.div
                    aria-hidden
                    className="pointer-events-none absolute left-6 top-[13.5rem] z-10 h-4 w-4 rounded-full border-2 border-white shadow-[0_2px_8px_rgba(0,0,0,0.3)]"
                    style={{ background: "var(--accent)" }}
                    animate={{
                      x: bookingStep === "browse" ? 0 : 500,
                      y: bookingStep === "browse" ? 0 : 4,
                      opacity: bookingStep === "confirmed" ? 0 : 1,
                      scale: bookingStep === "clicking" ? [1, 0.65, 1] : 1,
                    }}
                    transition={{ duration: 0.55, ease: "easeInOut" }}
                  />
                )}

                <AnimatePresence>
                  {bookingStep === "confirmed" && (
                    <motion.div
                      initial={{ opacity: 0, y: -16 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -16 }}
                      className="absolute left-1/2 top-3 z-20 -translate-x-1/2 whitespace-nowrap rounded-full px-4 py-2 text-xs font-medium text-white shadow-lg"
                      style={{ background: "var(--brand-gradient)" }}
                    >
                      You&apos;re booked — Reformer Flow, Tue 9:00 AM
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
