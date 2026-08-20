"use client";

import { motion } from "framer-motion";
import { Check, ArrowRight, MessageSquare, Code2, ShieldCheck, Globe2 } from "lucide-react";
import { CodeVisual } from "./FeatureVisuals";

// The literal categories lib/secret-scan.ts checks for, kept in sync by
// hand — real checks, not a decorative list, so this card can't drift into
// overclaiming what the scanner actually does.
const SCAN_CHECKS = [
  "AWS access key IDs",
  "API key / secret / token / password assignments",
  "OpenAI- and Anthropic-style secret keys",
  "Stripe secret keys",
  "Google API keys",
  "PEM private keys and JWTs",
];

const PIPELINE = [
  { label: "Prompt", Icon: MessageSquare },
  { label: "Generate", Icon: Code2 },
  { label: "Scan", Icon: ShieldCheck },
  { label: "Deploy", Icon: Globe2 },
];

function BentoCard({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-2xl border border-neutral-200 bg-white p-6 shadow-[var(--sh-s)] dark:border-neutral-800 dark:bg-neutral-950 ${className ?? ""}`}
    >
      {children}
    </div>
  );
}

function CardKicker({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-xs font-medium uppercase tracking-[0.14em]" style={{ color: "var(--accent)" }}>
      {children}
    </span>
  );
}

/** Replaces the old even 3-tile "Transparency / Trust / Hosting" layout with
 * an asymmetric bento grid carrying real, checkable content instead of
 * generic badge-style claims — Kodely is too new for SOC2/uptime-SLA
 * language, so the honesty card leans into that directly rather than
 * papering over it. */
export function TrustBento() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-6 md:grid-rows-2">
      <BentoCard className="md:col-span-4 md:row-span-2">
        <CardKicker>Transparency</CardKicker>
        <h3 className="mt-3 text-2xl font-semibold tracking-tight">Real code, not a black box.</h3>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
          Kodely writes actual React and TypeScript components. Open the Code
          tab on any project at any time and read exactly what was generated,
          line by line — nothing about it is hidden or obfuscated.
        </p>
        <div className="mt-6">
          <CodeVisual />
        </div>
      </BentoCard>

      <BentoCard className="md:col-span-2">
        <CardKicker>Trust</CardKicker>
        <h3 className="mt-3 text-lg font-semibold tracking-tight">What we actually scan for.</h3>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
          Every publish runs a scan for these patterns before anything goes
          live, so a slipped credential never reaches the public internet:
        </p>
        <ul className="mt-4 space-y-2">
          {SCAN_CHECKS.map((check) => (
            <li key={check} className="flex items-start gap-2 text-xs text-neutral-700 dark:text-neutral-300">
              <Check size={13} strokeWidth={2.75} className="mt-0.5 shrink-0" style={{ color: "var(--accent)" }} />
              {check}
            </li>
          ))}
        </ul>
      </BentoCard>

      <BentoCard className="md:col-span-2">
        <CardKicker>Hosting</CardKicker>
        <h3 className="mt-3 text-lg font-semibold tracking-tight">How a build actually happens.</h3>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
          One request, four real steps — no manual deploy, no DNS to touch.
        </p>
        <div className="mt-5 flex items-center justify-between">
          {PIPELINE.map((step, i) => (
            <div key={step.label} className="flex items-center">
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-full border"
                  style={{
                    borderColor: "color-mix(in srgb, var(--accent) 30%, transparent)",
                    background: "color-mix(in srgb, var(--accent) 8%, transparent)",
                  }}
                >
                  <step.Icon size={15} style={{ color: "var(--accent)" }} />
                </div>
                <span className="text-[10px] font-medium text-neutral-500 dark:text-neutral-400">{step.label}</span>
              </div>
              {i < PIPELINE.length - 1 && (
                <motion.div
                  aria-hidden
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 2, repeat: Infinity, delay: i * 0.4, ease: "easeInOut" }}
                >
                  <ArrowRight size={13} className="mx-1 text-neutral-300 dark:text-neutral-700" />
                </motion.div>
              )}
            </div>
          ))}
        </div>
      </BentoCard>

      <BentoCard className="md:col-span-6">
        <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
          <div className="shrink-0">
            <CardKicker>Honesty</CardKicker>
            <h3 className="mt-3 max-w-xs text-lg font-semibold tracking-tight">
              We&apos;re new. Here&apos;s exactly what that means.
            </h3>
          </div>
          <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.1em] text-neutral-400 dark:text-neutral-600">
                Not yet true
              </p>
              <ul className="mt-2 space-y-1.5 text-sm text-neutral-600 dark:text-neutral-400">
                <li>No SOC 2 report</li>
                <li>No published uptime SLA</li>
                <li>No enterprise support tier</li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.1em] text-neutral-400 dark:text-neutral-600">
                Already true
              </p>
              <ul className="mt-2 space-y-1.5 text-sm text-neutral-900 dark:text-white">
                <li>Every build is inspectable, not a guess</li>
                <li>Every publish is scanned first, every time</li>
                <li>A failed build is never charged</li>
              </ul>
            </div>
          </div>
        </div>
      </BentoCard>
    </div>
  );
}
