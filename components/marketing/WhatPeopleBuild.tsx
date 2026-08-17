"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

const EXAMPLES = [
  {
    url: "harlan-law",
    category: "Law firm",
    name: "Harlan & Cole",
    tagline: "Family law, personal injury, estate planning.",
    cta: "Request a consultation",
    bg: "from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950",
    ink: "text-slate-900 dark:text-slate-50",
    sub: "text-slate-500 dark:text-slate-400",
    accent: "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900",
  },
  {
    url: "flowtrack",
    category: "SaaS landing page",
    name: "FlowTrack",
    tagline: "Ship faster, together — project management for remote teams.",
    cta: "Start free trial",
    bg: "from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900",
    ink: "text-blue-950 dark:text-blue-50",
    sub: "text-blue-600 dark:text-blue-300",
    accent: "bg-blue-600 text-white",
  },
  {
    url: "mesa-verde",
    category: "Restaurant",
    name: "Mesa Verde",
    tagline: "Modern Mexican in Austin. Tacos worth the drive.",
    cta: "Reserve a table",
    bg: "from-orange-50 to-red-100 dark:from-orange-950 dark:to-red-950",
    ink: "text-red-950 dark:text-orange-50",
    sub: "text-orange-700 dark:text-orange-300",
    accent: "bg-red-700 text-white",
  },
  {
    url: "maren-lucas",
    category: "Photography",
    name: "Maren Lucas",
    tagline: "Wedding & portrait photography, Portland.",
    cta: "Book a session",
    bg: "from-stone-100 to-stone-200 dark:from-stone-900 dark:to-stone-950",
    ink: "text-stone-900 dark:text-stone-50",
    sub: "text-stone-500 dark:text-stone-400",
    accent: "bg-stone-900 dark:bg-stone-100 dark:text-stone-900",
  },
  {
    url: "northlane",
    category: "Agency",
    name: "Northlane Digital",
    tagline: "Performance-driven marketing — SEO, paid media, content.",
    cta: "See our work",
    bg: "from-indigo-50 to-indigo-100 dark:from-indigo-950 dark:to-indigo-900",
    ink: "text-indigo-950 dark:text-indigo-50",
    sub: "text-indigo-500 dark:text-indigo-300",
    accent: "bg-indigo-600 text-white",
  },
];

/** One browser-frame object that cycles through real example sites — an
 * honest, on-brand substitute for a "companies we work with" logo cloud
 * (no real customers to name yet) that still follows the site's own rule
 * of one hero object at a time, not a row of small skeleton chips. */
export function WhatPeopleBuild() {
  const reduced = useReducedMotion();
  const [i, setI] = useState(0);

  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => setI((v) => (v + 1) % EXAMPLES.length), 3400);
    return () => clearInterval(id);
  }, [reduced]);

  const ex = EXAMPLES[i];

  return (
    <div className="mx-auto w-full max-w-xl">
      <div className="overflow-hidden rounded-2xl border border-black/10 bg-white shadow-[var(--sh-s)] dark:border-white/10 dark:bg-neutral-900">
        <div className="flex items-center gap-2 border-b border-black/10 bg-black/[0.03] px-4 py-2.5 dark:border-white/10 dark:bg-white/[0.03]">
          <span className="h-2.5 w-2.5 rounded-full bg-black/15 dark:bg-white/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-black/15 dark:bg-white/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-black/15 dark:bg-white/15" />
          <div className="ml-3 flex-1 overflow-hidden rounded-md bg-black/[0.04] px-3 py-1 text-center font-mono text-[11px] text-black/40 dark:bg-white/[0.06] dark:text-white/40">
            <AnimatePresence mode="wait">
              <motion.span
                key={ex.url}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
              >
                {ex.url}.kodely.site
              </motion.span>
            </AnimatePresence>
          </div>
        </div>

        <div className={`relative h-52 overflow-hidden bg-gradient-to-br ${ex.bg}`}>
          <AnimatePresence mode="wait">
            <motion.div
              key={ex.url}
              initial={{ opacity: 0, y: reduced ? 0 : 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reduced ? 0 : -10 }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              className="flex h-full flex-col justify-center px-8"
            >
              <span className={`text-[11px] font-medium uppercase tracking-[0.14em] ${ex.sub}`}>
                {ex.category}
              </span>
              <h3 className={`mt-2 text-2xl font-semibold tracking-tight ${ex.ink}`}>{ex.name}</h3>
              <p className={`mt-2 max-w-sm text-sm leading-relaxed ${ex.sub}`}>{ex.tagline}</p>
              <span className={`mt-5 inline-block w-fit rounded-lg px-4 py-2 text-xs font-medium ${ex.accent}`}>
                {ex.cta}
              </span>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-center gap-1.5">
        {EXAMPLES.map((e, idx) => (
          <button
            key={e.url}
            type="button"
            onClick={() => setI(idx)}
            aria-label={`Show ${e.category} example`}
            className={`h-1.5 rounded-full transition-all ${
              idx === i ? "w-5 bg-neutral-900 dark:bg-white" : "w-1.5 bg-neutral-300 dark:bg-neutral-700"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
