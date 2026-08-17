"use client";

import { motion, useScroll, useSpring } from "framer-motion";

/** Thin brand-gradient bar tracking real scroll progress — not a loop. */
export function ArticleProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 200, damping: 40, restDelta: 0.001 });

  return (
    <motion.div
      className="fixed inset-x-0 top-0 z-50 h-[3px] origin-left"
      style={{ background: "var(--brand-gradient)", scaleX }}
    />
  );
}
