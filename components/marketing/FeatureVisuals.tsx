"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

const CODE_LINES = [
  { indent: 0, text: <><span style={{ color: "#a33dff" }}>export default function</span>{" "}<span style={{ color: "var(--accent)" }}>Hero</span>() {"{"}</> },
  { indent: 1, text: <><span style={{ color: "#a33dff" }}>return</span> &lt;<span style={{ color: "var(--accent)" }}>section</span>&gt;</> },
  { indent: 2, text: "Design that moves people." },
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
