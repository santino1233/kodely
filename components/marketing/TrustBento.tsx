"use client";

import { Check, Zap, ShieldCheck, Ban } from "lucide-react";
import { SIGNUP_GRANT } from "@/lib/credits";
import { CodeVisual, HostingVisual } from "./FeatureVisuals";

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

const FACTS = [
  // Never a literal — SIGNUP_GRANT in lib/credits.ts is the one source of
  // truth for the grant, so this line cannot drift away from what a new
  // account is actually given.
  { Icon: Zap, text: `${SIGNUP_GRANT} free credits on signup — enough to build a real site` },
  { Icon: Ban, text: "A build that fails to compile is never charged, no exceptions" },
  { Icon: ShieldCheck, text: "Every publish is scanned for exposed secrets before it goes live" },
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
 * generic badge-style claims — a real multi-file code sample, the literal
 * secret patterns the publish scanner checks, a live building→deployed
 * animation, and a closing row of concrete facts (no SOC2/uptime-SLA
 * language Kodely can't back yet, and no negative-framed comparison). */
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
        <h3 className="mt-3 text-lg font-semibold tracking-tight">Watch it go live.</h3>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
          Publishing puts your site on a real, HTTPS-secured *.kodely.site
          URL immediately — no manual deploy, no DNS to touch.
        </p>
        <div className="mt-5">
          <HostingVisual />
        </div>
      </BentoCard>

      <BentoCard className="md:col-span-6">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {FACTS.map(({ Icon, text }) => (
            <div key={text} className="flex items-start gap-3">
              <div
                className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                style={{ background: "color-mix(in srgb, var(--accent) 10%, transparent)" }}
              >
                <Icon size={15} style={{ color: "var(--accent)" }} />
              </div>
              <p className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">{text}</p>
            </div>
          ))}
        </div>
      </BentoCard>
    </div>
  );
}
