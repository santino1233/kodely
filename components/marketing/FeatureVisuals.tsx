"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

const KW = "#a33dff";
const TAG = "var(--accent)";

// Three real files from one project, not a single toy snippet — the point
// is "this is a real, structured app" (props, a mapped list, conditional
// state), not "this is basic HTML with a sprinkle of JS". Still honestly
// frontend-only (React/TS/Tailwind) — no backend/API code implied.
const FILES = [
  {
    name: "Hero.tsx",
    lines: [
      { indent: 0, text: <><span style={{ color: KW }}>export function</span> <span style={{ color: TAG }}>Hero</span>({"{"} title, subtitle {"}"}: HeroProps) {"{"}</> },
      { indent: 1, text: <><span style={{ color: KW }}>return</span> (</> },
      { indent: 2, text: <>&lt;<span style={{ color: TAG }}>section</span> className=<span style={{ color: "#3ba55c" }}>&quot;py-24 text-center&quot;</span>&gt;</> },
      { indent: 3, text: <>&lt;<span style={{ color: TAG }}>h1</span>&gt;{"{"}title{"}"}&lt;/<span style={{ color: TAG }}>h1</span>&gt;</> },
      { indent: 3, text: <>&lt;<span style={{ color: TAG }}>p</span>&gt;{"{"}subtitle{"}"}&lt;/<span style={{ color: TAG }}>p</span>&gt;</> },
      { indent: 2, text: <>&lt;/<span style={{ color: TAG }}>section</span>&gt;</> },
      { indent: 1, text: ")" },
      { indent: 0, text: "}" },
    ],
  },
  {
    name: "ProductGrid.tsx",
    lines: [
      { indent: 0, text: <><span style={{ color: KW }}>export function</span> <span style={{ color: TAG }}>ProductGrid</span>({"{"} items {"}"}: {"{"} items: Product[] {"}"}) {"{"}</> },
      { indent: 1, text: <><span style={{ color: KW }}>return</span> (</> },
      { indent: 2, text: <>&lt;<span style={{ color: TAG }}>div</span> className=<span style={{ color: "#3ba55c" }}>&quot;grid grid-cols-3 gap-4&quot;</span>&gt;</> },
      { indent: 3, text: <>{"{"}items.map((p) =&gt; (</> },
      { indent: 4, text: <>&lt;<span style={{ color: TAG }}>ProductCard</span> key={"{"}p.id{"}"} {"{"}...p{"}"} /&gt;</> },
      { indent: 3, text: <>)){"}"}</> },
      { indent: 2, text: <>&lt;/<span style={{ color: TAG }}>div</span>&gt;</> },
      { indent: 1, text: ")" },
      { indent: 0, text: "}" },
    ],
  },
  {
    name: "Nav.tsx",
    lines: [
      { indent: 0, text: <><span style={{ color: KW }}>const</span> [open, setOpen] = useState(<span style={{ color: "#e0a030" }}>false</span>)</> },
      { indent: 0, text: "" },
      { indent: 0, text: <><span style={{ color: KW }}>return</span> (</> },
      { indent: 1, text: <>&lt;<span style={{ color: TAG }}>nav</span>&gt;</> },
      { indent: 2, text: <>{"{"}open && &lt;<span style={{ color: TAG }}>MobileMenu</span> /&gt;{"}"}</> },
      { indent: 2, text: <>&lt;<span style={{ color: TAG }}>MenuButton</span> onClick={"{"}() =&gt; setOpen(!open){"}"} /&gt;</> },
      { indent: 1, text: <>&lt;/<span style={{ color: TAG }}>nav</span>&gt;</> },
      { indent: 0, text: ")" },
    ],
  },
];

/** Code panel cycles through three real files from one project (not one
 * toy snippet) with a tab bar, each typing in on its own turn — reads as
 * "this is a structured app," the visual argument for "not just basic
 * HTML," while staying honest about being frontend-only. */
export function CodeVisual() {
  const reduced = useReducedMotion();
  const [active, setActive] = useState(0);
  // Picking a tab stops the carousel for good. Auto-advancing content that
  // the user is actively driving fights them (and WCAG 2.2.2 wants a way to
  // pause anything that moves on its own for more than five seconds) — a
  // deliberate click is the clearest possible "stop" signal.
  const [userPicked, setUserPicked] = useState(false);

  useEffect(() => {
    if (reduced || userPicked) return;
    const id = setInterval(() => setActive((a) => (a + 1) % FILES.length), 5200);
    return () => clearInterval(id);
  }, [reduced, userPicked]);

  const file = FILES[active];

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-[var(--sh-s)] dark:border-neutral-800 dark:bg-neutral-950">
      <div className="flex gap-1 border-b border-neutral-200 px-3 pt-2.5 dark:border-neutral-800">
        {FILES.map((f, i) => (
          <button
            key={f.name}
            type="button"
            onClick={() => {
              setActive(i);
              setUserPicked(true);
            }}
            // Which tab is showing was conveyed by background and text
            // colour only. aria-pressed states it for assistive tech.
            aria-pressed={i === active}
            // Contrast: the inactive tabs were neutral-400 / dark:neutral-600
            // — about 2.5:1, and these are interactive controls.
            className={`rounded-t-md px-3 py-1.5 font-mono text-[11px] transition-colors ${
              i === active
                ? "bg-neutral-100 text-neutral-900 dark:bg-neutral-900 dark:text-white"
                : "text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
            }`}
          >
            {f.name}
          </button>
        ))}
      </div>
      <div className="p-6 font-mono text-[13px] leading-[1.85] text-neutral-600 dark:text-neutral-400">
        <AnimatePresence mode="wait">
          <motion.div
            key={file.name}
            initial={reduced ? { opacity: 1 } : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            {file.lines.map((line, i) => (
              <motion.div
                key={i}
                initial={reduced ? { opacity: 1 } : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: reduced ? 0 : i * 0.14, duration: 0.25 }}
                style={{ paddingLeft: `${line.indent * 1.1}rem`, minHeight: "1em" }}
              >
                {line.text}
                {i === file.lines.length - 1 && (
                  // The blink is a framer-motion (JS) animation, so the
                  // global prefers-reduced-motion rule in globals.css — which
                  // only neutralises CSS animations — never touched it: this
                  // caret went on flashing forever for a user who asked for
                  // no motion. It now holds steady instead of disappearing,
                  // so the panel still reads as a code editor.
                  <motion.span
                    className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] bg-current align-middle"
                    animate={reduced ? { opacity: 1 } : { opacity: [1, 1, 0, 0] }}
                    transition={
                      reduced
                        ? { duration: 0 }
                        : { duration: 1, repeat: Infinity, times: [0, 0.5, 0.5, 1] }
                    }
                  />
                )}
              </motion.div>
            ))}
          </motion.div>
        </AnimatePresence>
        {/* Braced string, not a bare text node: JSX text starting with "//"
            is almost always a mis-typed comment, which is what
            react/jsx-no-comment-textnodes flags. Here the slashes really are
            content — this line imitates a code comment in the panel. */}
        {/* opacity-80, not the original opacity-50: at 50% this line landed
            at 2.4:1 against the panel in light mode (WCAG AA wants 4.5:1).
            80% keeps the dimmed "this is a comment" reading while clearing
            4.6:1 light / 5.6:1 dark. */}
        <div className="mt-2 opacity-80">{"// real .tsx, visible in the Code tab"}</div>
      </div>
    </div>
  );
}

const HOSTING_ROWS = [{ w: "w-2/5" }, { w: "w-4/5" }, { w: "w-3/5" }];

/** A mini browser frame that visibly goes from mid-build (gray skeleton
 * bars, neutral dot) to live (bars pick up real color, a green dot pulses
 * next to the *.kodely.site URL) — the "watch it actually happen" argument
 * for one-click hosting, not just a claim. */
export function HostingVisual() {
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState<"building" | "live">(reduced ? "live" : "building");

  useEffect(() => {
    if (reduced) return;
    const t = setTimeout(
      () => setPhase((p) => (p === "building" ? "live" : "building")),
      phase === "building" ? 1800 : 3600,
    );
    return () => clearTimeout(t);
  }, [phase, reduced]);

  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800">
      <div className="flex items-center gap-1.5 border-b border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-neutral-800 dark:bg-neutral-900">
        <span className="h-2 w-2 rounded-full bg-neutral-300 dark:bg-neutral-700" />
        <span className="h-2 w-2 rounded-full bg-neutral-300 dark:bg-neutral-700" />
        <span className="h-2 w-2 rounded-full bg-neutral-300 dark:bg-neutral-700" />
        {/* dark:text-neutral-500 was 4.2:1 on the dark URL bar; neutral-400
            clears AA at this 10px size. */}
        <div className="ml-2 flex-1 overflow-hidden rounded bg-white px-2 py-0.5 text-center font-mono text-[10px] text-neutral-500 dark:bg-neutral-950 dark:text-neutral-400">
          studio-nine<span style={{ color: "var(--accent)" }}>.kodely.site</span>
        </div>
        {phase === "live" ? (
          <span className="relative flex h-2 w-2">
            {/* Reduced motion pins this component on "live" forever, which
                meant this ping was the ONE thing still animating on the page
                — permanently — for a user who asked for no motion. (It's a
                framer-motion animation, so the CSS-only reduced-motion block
                in globals.css never reached it.) The solid dot below carries
                the "live" meaning on its own. */}
            {!reduced && (
              <motion.span
                aria-hidden
                className="absolute inline-flex h-full w-full rounded-full bg-emerald-500"
                animate={{ scale: [1, 2], opacity: [0.7, 0] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
              />
            )}
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
        ) : (
          <span className="h-2 w-2 rounded-full bg-neutral-300 dark:bg-neutral-700" />
        )}
      </div>
      <div className="flex h-28 flex-col justify-center gap-2.5 bg-[#fbf7f2] px-4 dark:bg-[#1c1512]">
        {HOSTING_ROWS.map((row, i) => (
          // Plain CSS transition, not framer-motion's `animate` — its color
          // interpolation can't cross a gradient value like --brand-gradient
          // (it silently no-ops and warns), so this used to never actually
          // turn into the gradient.
          <div
            key={i}
            className={`h-3 rounded transition-[background] duration-500 ${row.w}`}
            style={{
              background: phase === "live" ? "var(--brand-gradient)" : "rgba(120,100,90,0.18)",
              transitionDelay: phase === "live" ? `${i * 100}ms` : "0ms",
            }}
          />
        ))}
        <p className="mt-1 font-mono text-[10px] text-[#826b5a] dark:text-[#b39d8a]">
          {phase === "live" ? "Live · HTTPS" : "Publishing…"}
        </p>
      </div>
    </div>
  );
}
