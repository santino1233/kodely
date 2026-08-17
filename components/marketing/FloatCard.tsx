"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";

/**
 * The one deliberate infinite loop on the site: a slow, tiny idle float
 * (6s, 10px) on the hero object, so it reads as "alive" rather than static
 * — not a shimmer or color cycle, just gentle physical motion.
 */
export function FloatCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      <motion.div
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

/** Wraps an interactive element (button, card) with calm hover/tap lift. */
export function MotionLift({
  children,
  className,
  lift = 3,
}: {
  children: ReactNode;
  className?: string;
  lift?: number;
}) {
  return (
    <motion.div
      className={className}
      whileHover={{ y: -lift }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 400, damping: 28 }}
    >
      {children}
    </motion.div>
  );
}
