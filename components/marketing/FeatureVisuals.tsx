"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ShieldCheck, Check } from "lucide-react";

const CODE_LINES = [
  { indent: 0, text: <><span style={{ color: "#a33dff" }}>export default function</span>{" "}<span style={{ color: "var(--accent)" }}>Hero</span>() {"{"}</> },
  { indent: 1, text: <><span style={{ color: "#a33dff" }}>return</span> &lt;<span style={{ color: "var(--accent)" }}>section</span>&gt;</> },
  { indent: 2, text: "Small-batch coffee, roasted weekly." },
  { indent: 1, text: <>&lt;/<span style={{ color: "var(--accent)" }}>section</span>&gt;</> },
  { indent: 0, text: "}" },
];

/** Code panel "types" its lines in on a loop, cursor always blinking — the
 * visual argument for "real code, not a black box" is more convincing shown
 * as something actually being written than as static text. */
export function CodeVisual() {
  const reduced = useReducedMotion();
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => setCycle((c) => c + 1), 7000);
    return () => clearInterval(id);
  }, [reduced]);

  return (
    <div className="w-full rounded-2xl border border-neutral-200 bg-white p-6 font-mono text-[13px] leading-[1.9] text-neutral-600 shadow-[var(--sh-s)] dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-400">
      <div key={cycle}>
        {CODE_LINES.map((line, i) => (
          <motion.div
            key={i}
            initial={reduced ? { opacity: 1 } : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: reduced ? 0 : i * 0.35, duration: 0.3 }}
            style={{ paddingLeft: `${line.indent * 1.25}rem` }}
          >
            {line.text}
            {i === CODE_LINES.length - 1 && (
              <motion.span
                className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] bg-current align-middle"
                animate={{ opacity: [1, 1, 0, 0] }}
                transition={{ duration: 1, repeat: Infinity, times: [0, 0.5, 0.5, 1] }}
              />
            )}
          </motion.div>
        ))}
      </div>
      <div className="mt-2 opacity-50">// real .tsx, visible in the Code tab</div>
    </div>
  );
}

/** A slow rotating scan ring behind the shield, plus a checkmark badge that
 * pops in once the "pass" reaches the front — reads as active scanning
 * rather than a static trust badge. */
export function ShieldVisual() {
  const reduced = useReducedMotion();
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    if (reduced) {
      setScanned(true);
      return;
    }
    const id = setInterval(() => setScanned((s) => !s), 2600);
    return () => clearInterval(id);
  }, [reduced]);

  return (
    <div className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-[var(--sh-s)] dark:border-neutral-800 dark:bg-neutral-950">
      <motion.div
        aria-hidden
        className="absolute h-40 w-40 rounded-full"
        style={{
          background: "conic-gradient(from 0deg, transparent, var(--glow), transparent 40%)",
        }}
        animate={reduced ? undefined : { rotate: 360 }}
        transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
      />
      <div className="absolute h-24 w-24 rounded-full bg-white dark:bg-neutral-950" aria-hidden />
      <div className="relative">
        <ShieldCheck size={72} strokeWidth={1.4} style={{ color: "var(--accent)" }} />
        <AnimatePresence>
          {scanned && (
            <motion.span
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 20 }}
              className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full text-white"
              style={{ background: "var(--brand-gradient)" }}
            >
              <Check size={13} strokeWidth={3} />
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/** A deploy progress bar fills, then flips to the live/HTTPS badge, holds,
 * and resets — makes "one click, live immediately" something you watch
 * happen rather than read as a claim. */
export function HostingVisual() {
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState<"deploying" | "live">(reduced ? "live" : "deploying");

  useEffect(() => {
    if (reduced) return;
    let t: ReturnType<typeof setTimeout>;
    if (phase === "deploying") {
      t = setTimeout(() => setPhase("live"), 1600);
    } else {
      t = setTimeout(() => setPhase("deploying"), 3200);
    }
    return () => clearTimeout(t);
  }, [phase, reduced]);

  return (
    <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-4 rounded-2xl border border-neutral-200 bg-white shadow-[var(--sh-s)] dark:border-neutral-800 dark:bg-neutral-950">
      <div className="font-mono text-sm text-neutral-400 dark:text-neutral-600">
        roan-coffee<span style={{ color: "var(--accent)" }}>.kodely.site</span>
      </div>

      <div className="h-1.5 w-40 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-900">
        <motion.div
          className="h-full rounded-full"
          style={{ background: "var(--brand-gradient)" }}
          animate={{ width: phase === "deploying" ? "100%" : "0%" }}
          transition={{ duration: phase === "deploying" ? 1.5 : 0, ease: "easeInOut" }}
          initial={false}
        />
      </div>

      <AnimatePresence mode="wait">
        {phase === "live" ? (
          <motion.div
            key="live"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={{ type: "spring", stiffness: 380, damping: 22 }}
            className="inline-flex items-center gap-2 rounded-full border border-neutral-200 px-4 py-2 font-mono text-xs text-neutral-600 dark:border-neutral-800 dark:text-neutral-400"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
            Live · HTTPS
          </motion.div>
        ) : (
          <motion.div
            key="deploying"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="inline-flex items-center gap-2 rounded-full border border-neutral-200 px-4 py-2 font-mono text-xs text-neutral-400 dark:border-neutral-800 dark:text-neutral-600"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-neutral-300 dark:bg-neutral-700" />
            Publishing…
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
