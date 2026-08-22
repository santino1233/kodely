import type { ReactNode } from "react";

// Presentational helpers for the published-sites registry. Not a route — only
// page/layout/route filenames are routable — so this file is safe to sit inside
// app/admin/sites/.
//
// Deliberately a LOCAL copy of the vocabulary in app/admin/users/ui.tsx rather
// than an import from it: that subtree belongs to another surface, and a shared
// presentational module that either side can retune turns a styling change over
// there into a visual regression over here. The vocabulary is copied on purpose
// (rounded-xl hairline borders, text-sm, tabular-nums on every figure,
// monochrome except where a colour carries meaning) so the panels still read as
// one product.

/**
 * Membership test for the small string→config maps in this subtree.
 *
 * NOT the `in` operator. `in` walks the prototype chain, so `"toString" in
 * VIEWS` is true — a query string of `?view=toString` would pass a guard whose
 * entire job is to say "this is one of ours", and the caller would then read a
 * Function off the map and crash on `.label`. Both of those were live 500s from
 * `/admin/sites` before this. Same reasoning, and the same fix, as
 * `isAdminAction` in lib/admin-audit.ts.
 */
export function hasKey<T>(map: Record<string, T>, key: unknown): key is string {
  return typeof key === "string" && Object.prototype.hasOwnProperty.call(map, key);
}

/** Look a key up without inheriting anything from Object.prototype. */
export function lookup<T>(map: Record<string, T>, key: string): T | undefined {
  return hasKey(map, key) ? map[key] : undefined;
}

export function formatDateTime(d: Date): string {
  return d.toISOString().replace("T", " ").slice(0, 19);
}

export function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function truncate(text: string, max = 60): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/**
 * Every string rendered from a finding passes through here.
 *
 * `evidence` is a snippet of SOMEONE ELSE'S site — the whole point of this
 * panel is to review it without turning the admin into a content reader. The
 * scanner already caps a snippet at roughly 180 characters (EVIDENCE_RADIUS on
 * both sides of the match, lib/moderation.ts) but that is the scanner's
 * promise, not this page's, and the column is free text in the database. This
 * re-truncates hard and never offers the untruncated string anywhere — no
 * `title` tooltip, no expander. If a reviewer needs more than this, the answer
 * is to open the published site itself, not to read the file out of the panel.
 */
export const EVIDENCE_MAX = 150;

export function evidenceText(evidence: string): string {
  return truncate(evidence.replace(/\s+/g, " ").trim(), EVIDENCE_MAX);
}

// Same derivation as app/api/projects/[id]/publish/route.ts, so the hostname
// shown here is the one that route hands the customer.
const SITES_BASE = process.env.KODELY_SITES_BASE ?? "kodely.site";

/** The public hostname a published project answers on. */
export function siteHost(slug: string): string {
  return `${slug}.${SITES_BASE}`;
}

// ── Severity ───────────────────────────────────────────────────────────────
// Stored as free text ("high" | "medium" | "low"), so everything here has to
// survive a value that is none of those.

export type Severity = "high" | "medium" | "low";

const SEVERITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

/** Sort key. Unknown severities sort last rather than disappearing. */
export function severityRank(severity: string): number {
  // lookup(), not SEVERITY_ORDER[severity]: a row whose severity column read
  // "constructor" would otherwise yield a Function here and turn every
  // comparison in the sort into NaN.
  return lookup(SEVERITY_ORDER, severity) ?? 99;
}

export function severityClass(severity: string): string {
  if (severity === "high") return "text-red-600 dark:text-red-400";
  if (severity === "medium") return "text-amber-600 dark:text-amber-500";
  if (severity === "low") return "text-black/50 dark:text-white/50";
  return "text-black/40 dark:text-white/40";
}

export function SeverityBadge({ severity }: { severity: string }) {
  return (
    <span className={`text-xs font-medium uppercase tracking-wide ${severityClass(severity)}`}>
      {severity}
    </span>
  );
}

export function outcomeLabel(outcome: string | null): string {
  if (outcome === "true_positive") return "True positive";
  if (outcome === "false_positive") return "False positive";
  if (outcome === null) return "Unreviewed";
  return outcome;
}

export function outcomeClass(outcome: string | null): string {
  if (outcome === "true_positive") return "text-red-600 dark:text-red-400";
  if (outcome === "false_positive") return "text-emerald-600 dark:text-emerald-400";
  return "text-black/50 dark:text-white/50";
}

// ── What the rules actually mean ───────────────────────────────────────────
// ModerationFinding stores `rule` but NOT the `note` that lib/moderation.ts
// attaches to a live finding — so by the time a row is in the database, the one
// sentence that tells a reviewer what tripped is gone. This is that sentence,
// transcribed from the rule definitions in lib/moderation.ts.
//
// Keep in step with lib/moderation.ts. A rule that isn't listed here still
// renders (its id is shown raw) — it just loses the explanation, which is the
// right failure mode when a new rule ships before this map is updated.

export const RULE_NOTES: Record<string, string> = {
  "brand-impersonation-credential-form":
    "A password field on a page that asks the visitor to sign in to, or verify, someone else's branded account. Three signals had to line up: a real password input, a named brand, and second-person credential solicitation within ~120 characters of it.",
  "brand-mention-near-credential-form":
    "A third-party brand is named in a file that also has a password field, but with no credential solicitation nearby. Usually an integration list, a partner logo or an OAuth button — recorded for context, never blocking.",
  "credential-exfil-channel":
    "A password field submits to a known credential drop channel (Telegram bot, Discord webhook, off-origin .php collector, or a form relay wired directly to the password form). Those are drop sites, not form backends.",
  "credential-post-off-origin":
    "A file with a password field POSTs to an off-origin URL. Legitimate when that URL is the site owner's own backend, which the scanner cannot tell from a drop site — so it records rather than blocks.",
  "wallet-seed-phrase-capture":
    "An input field asks for a wallet seed / recovery phrase or private key. No legitimate site collects these. Downgraded to low when the surrounding copy reads as a warning not to share one.",
  "wallet-drainer-approval":
    "The page connects a browser wallet and then asks for an asset-delegation primitive (setApprovalForAll, unlimited allowance, off-chain Permit signature) — permission to move assets it does not own. That is a drainer, not a payment.",
  "wallet-connect-present":
    "The page connects a browser wallet. Unusual for a generated static site — the build foundation ships no web3 dependencies — but not abusive on its own.",
  "password-form-on-static-site":
    "A password input on a statically hosted site with no backend, so it cannot authenticate anyone. Mock login UIs and design demos are a real, legitimate thing people build. Context only.",
  "runtime-obfuscated-payload":
    "Code decodes a string and executes it at runtime (eval of atob, new Function of unescape, and friends). Minifiers never emit this shape; it is normally used to hide a destination URL.",
};

/**
 * Why a site was taken down, from a closed list. Free text is avoided on
 * purpose: AdminAuditLog.meta is documented as "small, non-PII context", and a
 * free-text box on a takedown form is exactly where someone would paste a
 * reporter's email address or a snippet of the offending page. The report
 * thread stays the place for the narrative.
 */
export const TAKEDOWN_REASONS: Record<string, string> = {
  abuse_report: "Inbound abuse report",
  moderation_finding: "Confirmed moderation finding",
  phishing: "Phishing / brand impersonation",
  malware: "Malware or wallet drainer",
  spam: "Spam / SEO farm",
  legal: "Legal or registrar request",
  other: "Other (see the report thread)",
};

// ── The cache caveat ───────────────────────────────────────────────────────
// app/api/site/[slug]/[[...path]] sends `Cache-Control: public, max-age=60` on
// every 200 it serves. Clearing publishedAt makes the ORIGIN answer 404 on the
// next request, but it does not reach into a cache that already has a copy, and
// nothing here issues a purge.
//
// This is the one place the panel could mislead someone into an untrue
// statement on an abuse report ("taken down at 14:02"), so it is stated
// wherever a takedown is offered, confirmed, or reported as done — not once on
// the confirmation page and nowhere else.
export const SITE_CACHE_MAX_AGE_SECONDS = 60;

/** One sentence, for a line that has already said the site is offline. */
export function CacheCaveatLine() {
  return (
    <>
      Not instant: the site route sends{" "}
      <span className="font-mono text-xs">
        Cache-Control: public, max-age={SITE_CACHE_MAX_AGE_SECONDS}
      </span>
      , so a browser or intermediary cache that already fetched a page can keep
      serving its copy for up to {SITE_CACHE_MAX_AGE_SECONDS} seconds, and an
      open tab keeps what it has until it is reloaded.
    </>
  );
}

/** The full version, for the takedown form and the post-takedown state. */
export function CacheCaveat() {
  return (
    <Notice tone="warn" title="Not instant — a cached copy can survive about a minute">
      <CacheCaveatLine /> Nothing in this panel purges a cache. For a live phishing page being
      actively driven by traffic, treat a takedown as effective within a minute rather than on the
      click — and say so if you are answering an abuse report with a timestamp.
    </Notice>
  );
}

// ── Layout primitives ──────────────────────────────────────────────────────

export function StatTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "warn" | "bad";
}) {
  const toneClass =
    tone === "bad"
      ? "text-red-600 dark:text-red-400"
      : tone === "warn"
        ? "text-amber-600 dark:text-amber-500"
        : "";
  return (
    <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
      <div className="text-xs text-black/50 dark:text-white/50">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${toneClass}`}>{value}</div>
      {hint ? <div className="mt-1 text-xs text-black/50 dark:text-white/50">{hint}</div> : null}
    </div>
  );
}

export function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-black/10 p-5 dark:border-white/10">
      <h2 className="text-sm font-medium">{title}</h2>
      {subtitle ? (
        <p className="mt-0.5 text-xs text-black/50 dark:text-white/50">{subtitle}</p>
      ) : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-black/15 p-10 text-center text-sm text-black/60 dark:border-white/15 dark:text-white/60">
      {children}
    </div>
  );
}

export function Notice({
  tone = "neutral",
  title,
  children,
}: {
  tone?: "neutral" | "warn" | "bad" | "good";
  title?: ReactNode;
  children: ReactNode;
}) {
  const frame =
    tone === "bad"
      ? "border-red-500/40 bg-red-500/5"
      : tone === "warn"
        ? "border-amber-500/40 bg-amber-500/5"
        : tone === "good"
          ? "border-emerald-500/40 bg-emerald-500/5"
          : "border-black/10 bg-black/[0.02] dark:border-white/10 dark:bg-white/[0.02]";
  const heading =
    tone === "bad"
      ? "text-red-700 dark:text-red-400"
      : tone === "warn"
        ? "text-amber-700 dark:text-amber-500"
        : tone === "good"
          ? "text-emerald-700 dark:text-emerald-400"
          : "";
  return (
    <div className={`rounded-xl border p-5 text-sm ${frame}`}>
      {title ? <h2 className={`text-sm font-medium ${heading}`}>{title}</h2> : null}
      <div className={`${title ? "mt-2 " : ""}text-black/70 dark:text-white/70`}>{children}</div>
    </div>
  );
}

export function TableFrame({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-black/10 dark:border-white/10">
      <table className="w-full text-left text-sm">{children}</table>
    </div>
  );
}

export function Th({
  children,
  align = "left",
}: {
  children: ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th className={`px-4 py-2 font-medium ${align === "right" ? "text-right" : ""}`}>{children}</th>
  );
}

/** Neutral outlined button/link surface. Destructive actions pass `tone="bad"`. */
export function buttonClass(tone: "neutral" | "bad" = "neutral"): string {
  return tone === "bad"
    ? "rounded-xl border border-red-500/40 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-500/10 dark:text-red-400"
    : "rounded-xl border border-black/10 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5";
}
