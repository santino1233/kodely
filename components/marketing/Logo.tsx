"use client";

import { useId } from "react";
import { motion, useReducedMotion, type Variants } from "framer-motion";

const shapeVariants: Variants = {
  hidden: { opacity: 0, scale: 0.4 },
  shown: { opacity: 1, scale: 1 },
};

/** The Kodely "K" mark — five gradient shapes that assemble once on mount. */
export function Mark({ size = 26 }: { size?: number }) {
  const gradId = useId();
  const reduced = useReducedMotion();

  return (
    // Decorative: the mark always sits beside the "kodely" wordmark (or
    // inside the hero mock), so it carries no information of its own. Left
    // exposed it appeared in the accessibility tree as an unnamed graphic.
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F72570" />
          <stop offset="45%" stopColor="#FF6B67" />
          <stop offset="70%" stopColor="#FF9868" />
          <stop offset="100%" stopColor="#A33DFF" />
        </linearGradient>
      </defs>
      <motion.g
        initial={reduced ? "shown" : "hidden"}
        animate="shown"
        transition={{ staggerChildren: 0.08 }}
      >
        <motion.rect
          variants={shapeVariants}
          transition={{ duration: 0.5, ease: [0.2, 0.9, 0.2, 1] }}
          x="7"
          y="6"
          width="7.6"
          height="28"
          rx="3.8"
          fill={`url(#${gradId})`}
        />
        <motion.circle
          variants={shapeVariants}
          transition={{ duration: 0.5, ease: [0.2, 0.9, 0.2, 1] }}
          cx="27"
          cy="11"
          r="4.4"
          fill={`url(#${gradId})`}
        />
        <motion.rect
          variants={shapeVariants}
          transition={{ duration: 0.5, ease: [0.2, 0.9, 0.2, 1] }}
          x="18"
          y="17"
          width="15"
          height="7"
          rx="3.5"
          fill={`url(#${gradId})`}
          transform="rotate(-38 25.5 20.5)"
        />
        <motion.rect
          variants={shapeVariants}
          transition={{ duration: 0.5, ease: [0.2, 0.9, 0.2, 1] }}
          x="18"
          y="17"
          width="16"
          height="7"
          rx="3.5"
          fill={`url(#${gradId})`}
          transform="rotate(40 25.5 24)"
        />
        <motion.rect
          variants={shapeVariants}
          transition={{ duration: 0.5, ease: [0.2, 0.9, 0.2, 1] }}
          x="24"
          y="30"
          width="7"
          height="7"
          rx="2.3"
          fill={`url(#${gradId})`}
          transform="rotate(45 27.5 33.5)"
        />
      </motion.g>
    </svg>
  );
}

export function Logo({ className = "", markSize = 24 }: { className?: string; markSize?: number }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight ${className}`}>
      <Mark size={markSize} />
      <span className="brand-gradient-text">kodely</span>
    </span>
  );
}
