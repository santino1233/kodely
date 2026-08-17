"use client";

import { useEffect, useRef } from "react";
import { motion, useMotionValue, useTransform, type MotionValue } from "framer-motion";

const WORDS = ["Describe it.", "Generate it.", "Ship it."];

function Word({ progress, index, total }: { progress: MotionValue<number>; index: number; total: number }) {
  const seg = 1 / total;
  const start = index * seg;
  const mid = start + seg / 2;
  const end = start + seg;

  const opacity = useTransform(progress, [start, mid, end], [0, 1, 0]);
  const y = useTransform(progress, [start, mid, end], [28, 0, -28]);
  const blur = useTransform(progress, [start, mid, end], ["blur(8px)", "blur(0px)", "blur(8px)"]);

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center text-center"
      style={{ opacity, y, filter: blur }}
    >
      <span className="text-[clamp(2.6rem,10vw,7.5rem)] font-semibold tracking-tight">
        {WORDS[index].replace(".", "")}
        <span style={{ color: "var(--accent)" }}>.</span>
      </span>
    </motion.div>
  );
}

/** Scroll-pinned cross-fade through the three steps — signature motion
 * from the approved reference design. Drives progress from a manual
 * scroll listener (rather than framer's target-based useScroll, which
 * doesn't re-measure reliably against a Next.js-hydrated ref) — purely
 * illustrative, no numbers or factual claims, so safe to animate freely. */
export function PinnedStatement() {
  const ref = useRef<HTMLDivElement>(null);
  const progress = useMotionValue(0);

  useEffect(() => {
    let raf = 0;
    function update() {
      raf = 0;
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      const p = total > 0 ? (-rect.top) / total : 0;
      progress.set(Math.min(1, Math.max(0, p)));
    }
    function onScroll() {
      if (!raf) raf = requestAnimationFrame(update);
    }
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [progress]);

  return (
    <section ref={ref} className="relative" style={{ height: "300vh" }}>
      <div className="sticky top-0 h-screen overflow-hidden">
        {WORDS.map((_, i) => (
          <Word key={i} progress={progress} index={i} total={WORDS.length} />
        ))}
      </div>
    </section>
  );
}
