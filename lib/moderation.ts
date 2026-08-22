// Exists because *.kodely.site hosts whatever we generate on infrastructure we
// own — a phishing clone or a wallet drainer published here is OUR abuse report,
// OUR IP block, OUR upstream depeering. lib/rate-limit.ts caps VOLUME and says
// plainly that it is not moderation; this is the content-side counterpart.
//
// WHAT THIS IS
// A high-precision SIGNAL layer, not a classifier and not a verdict machine.
// It looks for a small number of concrete, mechanically checkable abuse
// patterns and reports them as structured findings with a severity. The caller
// decides policy. Every rule is written to be conservative: it fires only on a
// CONJUNCTION of signals (a credential-capture mechanism AND a targeting or
// exfiltration signal), because any one of those signals alone is common in
// perfectly legitimate generated sites.
//
// WHAT THIS IS NOT, and cannot become by adding more regexes:
//   • It does not read a page's meaning. A page that says "your account is
//     locked, call this number" in prose with no form will not trip anything.
//   • It cannot see rendered pixels, so a pixel-perfect visual clone built from
//     an inlined SVG/base64 logo with no brand text is invisible to it.
//   • It has no image/logo recognition and no domain-reputation feed.
//   • The brand list below is a hand-written list of the most-phished brands.
//     It is incomplete by construction and always will be. A page targeting a
//     regional bank not on the list will pass.
//   • Trivially evaded by an attacker who knows it exists (string splitting,
//     runtime-assembled markup, remote-loaded payloads). It is a floor against
//     the off-the-shelf phishing-kit and drainer-template traffic that makes up
//     the bulk of real free-hosting abuse, not a defence against a targeted
//     adversary.
// Treat a clean result as "nothing obvious", never as "reviewed and safe".
//
// The heuristics live behind ModerationProvider so a real classifier (a model
// call, a vendor API) can replace them without touching a single caller:
// moderateForPublish() is async today precisely so that swap is a no-op here.

import { db } from "./db";

export type ModerationSeverity = "high" | "medium" | "low";

export interface ModerationFinding {
  /** Stable machine id for the rule, e.g. "brand-impersonation-credential-form". */
  rule: ModerationRule;
  severity: ModerationSeverity;
  /** File the evidence came from. */
  path: string;
  /** Short, whitespace-collapsed snippet of the matched region. */
  evidence: string;
  /** One line a human reviewer (or the user) can act on. */
  note: string;
}

export interface ModerationResult {
  /** Which analyzer produced these findings — heuristics today, maybe a model later. */
  provider: string;
  findings: ModerationFinding[];
}

export type ModerationRule =
  | "brand-impersonation-credential-form"
  | "brand-mention-near-credential-form"
  | "credential-exfil-channel"
  | "credential-post-off-origin"
  | "wallet-seed-phrase-capture"
  | "wallet-drainer-approval"
  | "password-form-on-static-site"
  | "wallet-connect-present"
  | "runtime-obfuscated-payload";

export interface ModerationInput {
  path: string;
  content: string;
}

export interface ModerationProvider {
  readonly name: string;
  analyze(files: ModerationInput[]): Promise<ModerationFinding[]>;
}

/** Findings at or above this severity are the ones a caller should refuse on. */
export function blockingFindings(result: ModerationResult): ModerationFinding[] {
  return result.findings.filter((f) => f.severity === "high");
}

// ── Shared matchers ────────────────────────────────────────────────────────

const DATA_URI_RE = /data:[a-zA-Z0-9+.\-/]+;base64,[A-Za-z0-9+/=]+/g;

// Several rules below decide by PROXIMITY, and Tailwind utility strings are the
// single biggest thing standing between two pieces of related text in a
// generated site — one `className` easily runs 80 characters. Dropping those
// values makes the proximity windows measure something close to real text
// distance instead of markup volume, in both the .tsx source and the minified
// bundle. It also removes a small false-positive surface: utility class names
// are full of substrings that look like words.
const CLASS_ATTR_RE = /\b(?:className|class)\s*[:=]\s*(?:"[^"]*"|'[^']*'|`[^`]*`)/g;

// Skipped outright: sourcemaps duplicate the bundle (double-counting, no new
// signal) and stylesheets carry no markup or script to reason about.
const SKIP_EXTENSIONS = [".map", ".css"];

// Matches both authoring and compiled shapes. Published projects are Vite +
// React builds (lib/foundation.ts), so the same field appears as
// `type="password"` in src/*.tsx and as `type:"password"` inside the minified
// jsx() call in dist/assets/*.js. Every rule below has to survive that.
const PASSWORD_INPUT_RE = /type\s*[:=]\s*["'`]password["'`]/gi;

const INPUT_ELEMENT_RE = /<\s*(?:input|textarea)\b|["'`](?:input|textarea)["'`]\s*,/gi;

// Deliberately NOT bare "sign in" / "log in": those are ordinary nav labels on
// legitimate SaaS and e-commerce sites and were the single largest source of
// false positives while tuning this. What distinguishes a phishing page is
// second-person *solicitation* — it asks you to hand something over, usually
// with manufactured urgency.
const CREDENTIAL_SOLICITATION_RE = new RegExp(
  [
    /(?:sign|log)\s?in(?:to|\s+to)\s+(?:your|the)\b/.source,
    /enter\s+your\s+(?:password|credentials|pin|passcode)/.source,
    /(?:verify|confirm|validate)\s+your\s+(?:account|identity|password|login|details)/.source,
    /your\s+account\s+(?:has\s+been|was|will\s+be)\s+(?:suspended|locked|limited|disabled|closed)/.source,
    /unusual\s+(?:sign[-\s]?in|login|activity)/.source,
    /re-?enter\s+your\s+password/.source,
    /(?:your\s+)?session\s+(?:has\s+)?expired/.source,
    /update\s+your\s+(?:billing|payment|account)\s+(?:info|information|details)/.source,
    /(?:account|password)\s+recovery\s+required/.source,
  ].join("|"),
  "gi",
);

// A brand named in one of these positions is being credited, linked, or offered
// as an OAuth provider — not impersonated. "Sign in with Google" next to a
// password field is the most common LEGITIMATE login page on the internet and
// must never be treated as a Google clone.
const BENIGN_BRAND_CONTEXT_RE =
  /(?:with|via|using|through|powered\s+by|we\s+accept|accepts?|pay\s+(?:with|by)|follow\s+us\s+on|find\s+us\s+on|share\s+on|available\s+on|download\s+on|get\s+it\s+on|integrat\w*\s+with|connects?\s+(?:to|with)|sync\w*\s+with|import\s+from|works\s+with|listen\s+on|watch\s+on|streaming\s+on|now\s+on|(?:as\s+)?seen\s+on|up\s+on|order\s+(?:on|via)|alternative\s+to|switch\s+from|migrat\w*\s+from|unlike|better\s+than|instead\s+of|such\s+as|like)\s*$/i;

// The most-phished consumer brands. Each pattern is deliberately TIGHTER than
// the bare brand name, because bare names collide with legitimate copy in ways
// that matter: "apple" is on a coffee shop's menu, "meta" is in every <meta>
// tag, "chase" and "wise" are ordinary English words, "steam" is what a milk
// frother does. Where a bare name is unambiguous enough to stand alone it is
// still only one leg of a three-part conjunction (see the rule below).
const IMPERSONATION_TARGETS: { brand: string; re: RegExp }[] = [
  { brand: "Microsoft", re: /\bmicrosoft\s+(?:account|365|office|sign[-\s]?in)\b|\boffice\s?365\b|\boutlook\.com\b/gi },
  { brand: "Google", re: /\bgoogle\s+account\b|\bgmail\s+(?:account|sign[-\s]?in|login|password)\b|\baccounts\.google\.com\b/gi },
  { brand: "Apple", re: /\bapple\s?id\b|\bicloud\b|\bapple\s+account\b/gi },
  { brand: "Amazon", re: /\bamazon\s+(?:account|sign[-\s]?in|login)\b/gi },
  { brand: "PayPal", re: /\bpaypal\b/gi },
  { brand: "Netflix", re: /\bnetflix\b/gi },
  { brand: "Facebook", re: /\bfacebook\b/gi },
  { brand: "Instagram", re: /\binstagram\b/gi },
  { brand: "LinkedIn", re: /\blinkedin\b/gi },
  { brand: "WhatsApp", re: /\bwhatsapp\b/gi },
  { brand: "Dropbox", re: /\bdropbox\b/gi },
  { brand: "Adobe", re: /\badobe\s+(?:id|account|sign[-\s]?in)\b/gi },
  { brand: "DocuSign", re: /\bdocusign\b/gi },
  { brand: "Coinbase", re: /\bcoinbase\b/gi },
  { brand: "Binance", re: /\bbinance\b/gi },
  { brand: "Kraken", re: /\bkraken\s+(?:account|exchange|sign[-\s]?in)\b/gi },
  { brand: "MetaMask", re: /\bmetamask\b/gi },
  { brand: "Trust Wallet", re: /\btrust\s?wallet\b/gi },
  { brand: "Ledger", re: /\bledger\s+(?:live|wallet|nano)\b/gi },
  { brand: "Trezor", re: /\btrezor\b/gi },
  { brand: "Phantom Wallet", re: /\bphantom\s+wallet\b/gi },
  { brand: "Chase", re: /\bchase\s+bank\b|\bchase\.com\b/gi },
  { brand: "Wells Fargo", re: /\bwells\s+fargo\b/gi },
  { brand: "Bank of America", re: /\bbank\s+of\s+america\b/gi },
  { brand: "Citibank", re: /\bciti(?:bank)?\s+(?:account|online|sign[-\s]?in)\b/gi },
  { brand: "HSBC", re: /\bhsbc\b/gi },
  { brand: "Barclays", re: /\bbarclays\b/gi },
  { brand: "Revolut", re: /\brevolut\b/gi },
  { brand: "Venmo", re: /\bvenmo\b/gi },
  { brand: "Cash App", re: /\bcash\s?app\b/gi },
  { brand: "Zelle", re: /\bzelle\b/gi },
  { brand: "DHL", re: /\bdhl\b/gi },
  { brand: "FedEx", re: /\bfedex\b/gi },
  { brand: "USPS", re: /\busps\b/gi },
  { brand: "IRS", re: /\birs\.gov\b|\binternal\s+revenue\s+service\b/gi },
  { brand: "HMRC", re: /\bhmrc\b/gi },
  { brand: "Steam", re: /\bsteam\s+(?:account|guard|community)\b|\bsteamcommunity\b/gi },
  { brand: "Roblox", re: /\broblox\b/gi },
  { brand: "Discord", re: /\bdiscord\b(?!(?:app)?\.com\/api\/webhooks)/gi },
  { brand: "TikTok", re: /\btiktok\b/gi },
  { brand: "Spotify", re: /\bspotify\b/gi },
];

// Drop sites that ship inside off-the-shelf phishing kits. Every one of these
// only counts when the file also collects a password — the signal is a password
// going to a channel like this, not the channel existing.
//
// `nearPassword` splits them by how innocent the channel is on its own:
//   • false — a Telegram bot, a Discord webhook, or an off-origin .php collector
//     has no legitimate role anywhere in a generated static marketing site, so
//     anywhere in the same file is damning enough.
//   • true  — formsubmit.co and mailto: are the NORMAL way a static site wires
//     up a contact form. A site with a contact form in the footer and a members
//     login on another page would otherwise be blocked outright, which is
//     exactly the kind of false positive that makes a gate like this
//     unshippable. These have to be wired to the password form itself.
const EXFIL_CHANNELS: { name: string; re: RegExp; nearPassword: boolean }[] = [
  { name: "Telegram bot API", re: /api\.telegram\.org\/bot/gi, nearPassword: false },
  { name: "Discord webhook", re: /discord(?:app)?\.com\/api\/webhooks/gi, nearPassword: false },
  {
    name: "off-origin PHP collector",
    re: /(?:action\s*[:=]\s*|fetch\s*\(\s*|axios\.post\s*\(\s*|sendBeacon\s*\(\s*)["'`](?:https?:)?\/\/[^"'`\s]+\.php\b/gi,
    nearPassword: false,
  },
  { name: "formsubmit.co relay", re: /\bformsubmit\.co\b/gi, nearPassword: true },
  { name: "mailto: form action", re: /action\s*[:=]\s*["'`]mailto:[^"'`]{1,120}/gi, nearPassword: true },
];

// How far a "normally innocent" exfil channel may sit from a password field and
// still be read as the destination for it. One <form> of markup, roughly.
const SAME_FORM_RADIUS = 900;

const OFF_ORIGIN_POST_RE =
  /(?:action\s*[:=]\s*|fetch\s*\(\s*|axios\.post\s*\(\s*|navigator\.sendBeacon\s*\(\s*)["'`](https?:\/\/[^"'`\s]{4,160})/gi;

const SEED_PHRASE_RE =
  /\b(?:seed\s+phrase|recovery\s+phrase|secret\s+recovery\s+phrase|mnemonic(?:\s+phrase)?|(?:12|18|24)[-\s]word\s+(?:phrase|seed)|wallet\s+private\s+key|keystore\s+(?:file|json))\b/gi;

// Security-education copy ("never share your seed phrase with anyone") reads
// almost identically to a drainer's own form label. If the surrounding text is
// a warning, the finding is downgraded rather than dropped — still recorded.
const SEED_WARNING_RE = /\b(?:never|do\s*n[o']t|no\s+one|nobody|don't)\b[^.!?]{0,90}\b(?:share|enter|reveal|type|give|ask|store)\b/i;

const WALLET_CONNECT_RE =
  /window\.ethereum|eth_requestAccounts|@?walletconnect|window\.solana|window\.phantom|web3modal|BrowserProvider|Web3Provider|rainbowkit/gi;

// Asset-DELEGATION primitives, not payment primitives. A legitimate "donate
// ETH" button uses eth_sendTransaction with a fixed value — that is deliberately
// NOT in this list, because flagging it would punish an honest crypto site. What
// a drainer needs, and an honest site does not, is permission to move assets it
// does not own: an unlimited allowance, setApprovalForAll, or an offline Permit
// signature.
// A note on why the raw 4-byte selectors are here as well as the method names:
// the method name often does NOT survive the build. A drainer that hand-rolls
// its calldata leaves only `"0xa22cb465…"` in the minified bundle — verified
// against real `vite build` output, where a `/* setApprovalForAll */` comment
// next to that selector was stripped and the name-based pattern went silent.
// An 8-hex-digit selector literal is an exact string with no plausible
// accidental collision, and it is still only one leg of the conjunction.
const DRAINER_PRIMITIVES: { name: string; re: RegExp }[] = [
  { name: "setApprovalForAll", re: /\bsetApprovalForAll\b|0xa22cb465/g },
  { name: "increaseAllowance", re: /\bincreaseAllowance\b|0x39509351/g },
  { name: "unlimited ERC-20 allowance", re: /[fF]{60,}|\bMaxUint256\b|\bMAX_UINT256\b|2\s*\*\*\s*256/g },
  { name: "off-chain Permit signature", re: /eth_signTypedData(?:_v[34])?|\bsignTypedData\b/g },
  { name: "delegated transferFrom", re: /\btransferFrom\s*\(|0x23b872dd|0x42842e0e|0xf242432a|0x2eb2c2d6/g },
];

// eval-of-decoded-string. Minifiers produce dense code but never this shape;
// phishing kits and drainer templates ship it routinely to hide the drop URL.
const OBFUSCATED_PAYLOAD_RE =
  /\beval\s*\(\s*(?:atob|unescape|decodeURIComponent|String\.fromCharCode)|\bnew\s+Function\s*\(\s*(?:atob|unescape)|document\.write\s*\(\s*(?:unescape|atob)/gi;

// ── Engine ────────────────────────────────────────────────────────────────

const EVIDENCE_RADIUS = 60;
// Tuned against real `vite build` output, not guessed. Phishing copy names the
// brand INSIDE the solicitation ("Sign in to your Microsoft account", "Your
// PayPal account has been limited"), so the two land within a few dozen
// characters of each other once class attributes are stripped. A legitimate
// page that happens to contain both — a film blog with a member login in one
// section and "now streaming on Netflix" in another — keeps them hundreds of
// characters apart. 120 sits in that gap with room on both sides.
const BRAND_WINDOW_RADIUS = 120;
// Wider, because a label and its <input> can legitimately be separated by a
// wrapper element or two.
const INPUT_WINDOW_RADIUS = 220;
const MAX_FINDINGS_PER_RULE = 3;

function snippet(content: string, index: number, length: number): string {
  const start = Math.max(0, index - EVIDENCE_RADIUS);
  const end = Math.min(content.length, index + length + EVIDENCE_RADIUS);
  const raw = content.slice(start, end).replace(/\s+/g, " ").trim();
  return (start > 0 ? "…" : "") + raw + (end < content.length ? "…" : "");
}

function windowAround(content: string, index: number, length: number, radius: number): string {
  return content.slice(
    Math.max(0, index - radius),
    Math.min(content.length, index + length + radius),
  );
}

function test(re: RegExp, text: string): boolean {
  re.lastIndex = 0;
  return re.test(text);
}

function firstMatch(re: RegExp, text: string): RegExpExecArray | null {
  re.lastIndex = 0;
  return re.exec(text);
}

function scannable(file: ModerationInput): string | null {
  const lower = file.path.toLowerCase();
  if (SKIP_EXTENSIONS.some((ext) => lower.endsWith(ext))) return null;
  // Same reasoning as lib/secret-scan.ts: an inlined image or font is bytes,
  // not content, and base64 will happily contain any substring you like.
  return file.content.replace(DATA_URI_RE, "").replace(CLASS_ATTR_RE, "");
}

function runHeuristics(files: ModerationInput[]): ModerationFinding[] {
  const findings: ModerationFinding[] = [];
  const perRule = new Map<string, number>();
  const seen = new Set<string>();

  const add = (f: ModerationFinding) => {
    const key = `${f.rule} ${f.path} ${f.evidence}`;
    if (seen.has(key)) return;
    const count = perRule.get(f.rule) ?? 0;
    if (count >= MAX_FINDINGS_PER_RULE) return;
    seen.add(key);
    perRule.set(f.rule, count + 1);
    findings.push(f);
  };

  for (const file of files) {
    const content = scannable(file);
    if (content === null) continue;

    // Every password field's offset, not just the first: the "is this exfil
    // channel wired to the password form?" test needs all of them.
    const passwordFields: RegExpExecArray[] = [];
    PASSWORD_INPUT_RE.lastIndex = 0;
    let pm: RegExpExecArray | null;
    while ((pm = PASSWORD_INPUT_RE.exec(content)) !== null) passwordFields.push(pm);
    const hasPasswordInput = passwordFields.length > 0;
    const nearAPasswordField = (index: number) =>
      passwordFields.some((p) => Math.abs(p.index - index) <= SAME_FORM_RADIUS);
    const hasWalletConnect = test(WALLET_CONNECT_RE, content);

    // ── Rule: brand impersonation of a credential form ──────────────────
    // Three legs, all required, because each one alone is common and benign:
    //   1. the file actually collects a password (a link to a login page or an
    //      OAuth button does not),
    //   2. a third-party brand is named,
    //   3. within ~160 chars of that name, the page SOLICITS credentials in the
    //      second person.
    // Plus a negative check that the brand isn't merely being linked, credited,
    // or offered as an identity provider.
    if (hasPasswordInput) {
      for (const { brand, re } of IMPERSONATION_TARGETS) {
        re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(content)) !== null) {
          const before = content.slice(Math.max(0, m.index - 40), m.index);
          if (BENIGN_BRAND_CONTEXT_RE.test(before)) continue;

          const around = windowAround(content, m.index, m[0].length, BRAND_WINDOW_RADIUS);
          if (test(CREDENTIAL_SOLICITATION_RE, around)) {
            add({
              rule: "brand-impersonation-credential-form",
              severity: "high",
              path: file.path,
              evidence: snippet(content, m.index, m[0].length),
              note: `A password field sits on a page that asks the visitor to sign in to / verify a ${brand} account. Publishing a login page branded as someone else's service is not allowed.`,
            });
          } else {
            // Recorded, never blocking: a third-party brand next to a login
            // form is usually an integration list, a partner logo, or an OAuth
            // provider. Worth having in the record if the site is reported.
            add({
              rule: "brand-mention-near-credential-form",
              severity: "low",
              path: file.path,
              evidence: snippet(content, m.index, m[0].length),
              note: `${brand} is named in a file that also contains a password field. Usually benign (integration, partner, or OAuth button) — recorded for context only.`,
            });
          }
        }
      }
    }

    // ── Rule: credentials leaving via a known drop channel ───────────────
    if (hasPasswordInput) {
      for (const { name, re, nearPassword } of EXFIL_CHANNELS) {
        re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(content)) !== null) {
          // Not `continue`-on-first-miss: a site can use formsubmit.co twice,
          // once for a harmless contact form and once for the password form.
          if (nearPassword && !nearAPasswordField(m.index)) continue;
          add({
            rule: "credential-exfil-channel",
            severity: "high",
            path: file.path,
            evidence: snippet(content, m.index, m[0].length),
            note: `A password field is submitted to a ${name}. That is a credential drop site, not a form backend.`,
          });
          break;
        }
      }

      // ── Rule: credentials POSTed off-origin ────────────────────────────
      // Medium, not high: a real product's login page legitimately posts to its
      // own API on another host. We can't tell that apart from a drop site
      // without knowing the site's intended origin, so this records rather than
      // blocks.
      OFF_ORIGIN_POST_RE.lastIndex = 0;
      let om: RegExpExecArray | null;
      while ((om = OFF_ORIGIN_POST_RE.exec(content)) !== null) {
        add({
          rule: "credential-post-off-origin",
          severity: "medium",
          path: file.path,
          evidence: snippet(content, om.index, om[0].length),
          note: `A file containing a password field submits to an off-origin URL (${om[1].slice(0, 80)}). Legitimate if that is your own backend.`,
        });
      }

      // ── Rule: a password field at all ─────────────────────────────────
      // Informational. Published projects are static builds with no server, so
      // a password box here can never actually authenticate anyone — but mock
      // login UIs and design demos are a real, legitimate thing people build.
      add({
        rule: "password-form-on-static-site",
        severity: "low",
        path: file.path,
        evidence: snippet(content, passwordFields[0].index, passwordFields[0][0].length),
        note: "Password input on a statically hosted site (no backend). Recorded for context only.",
      });
    }

    // ── Rule: seed-phrase / private-key capture ─────────────────────────
    // A wallet's recovery phrase has exactly one legitimate destination: the
    // wallet. Any web form asking for one is a drainer. The only real
    // ambiguity is educational copy warning people NOT to enter it, which is
    // why the warning check exists.
    SEED_PHRASE_RE.lastIndex = 0;
    let sm: RegExpExecArray | null;
    while ((sm = SEED_PHRASE_RE.exec(content)) !== null) {
      const around = windowAround(content, sm.index, sm[0].length, INPUT_WINDOW_RADIUS);
      if (!test(INPUT_ELEMENT_RE, around)) continue; // prose about seed phrases, no form
      const isWarning = SEED_WARNING_RE.test(around);
      add({
        rule: "wallet-seed-phrase-capture",
        severity: isWarning ? "low" : "high",
        path: file.path,
        evidence: snippet(content, sm.index, sm[0].length),
        note: isWarning
          ? "Seed-phrase wording near an input, but the surrounding copy reads as a warning not to share one. Recorded, not blocking."
          : "An input field asks for a wallet seed / recovery phrase or private key. No legitimate site collects these.",
      });
    }

    // ── Rule: wallet-connect + asset-delegation primitive ───────────────
    if (hasWalletConnect) {
      let matchedPrimitive = false;
      for (const { name, re } of DRAINER_PRIMITIVES) {
        const m = firstMatch(re, content);
        if (!m) continue;
        matchedPrimitive = true;
        add({
          rule: "wallet-drainer-approval",
          severity: "high",
          path: file.path,
          evidence: snippet(content, m.index, m[0].length),
          note: `Page connects a wallet and then requests ${name} — permission to move assets it does not own. That is the shape of a drainer, not a payment.`,
        });
      }
      if (!matchedPrimitive) {
        const m = firstMatch(WALLET_CONNECT_RE, content);
        if (m) {
          add({
            rule: "wallet-connect-present",
            severity: "low",
            path: file.path,
            evidence: snippet(content, m.index, m[0].length),
            note: "Page connects a browser wallet. Unusual for a generated static site (the build foundation ships no web3 dependencies) but not abusive on its own.",
          });
        }
      }
    }

    // ── Rule: runtime-decoded executable payload ────────────────────────
    {
      const m = firstMatch(OBFUSCATED_PAYLOAD_RE, content);
      if (m) {
        add({
          rule: "runtime-obfuscated-payload",
          severity: "medium",
          path: file.path,
          evidence: snippet(content, m.index, m[0].length),
          note: "Code decodes a string and executes it at runtime. Minifiers do not emit this shape; it is normally used to hide a destination URL.",
        });
      }
    }
  }

  return findings;
}

/**
 * The current analyzer: pattern conjunctions over file text. Cheap, synchronous
 * in practice, and honest about its ceiling (see the header comment).
 */
export const heuristicProvider: ModerationProvider = {
  name: "heuristics-v1",
  analyze: async (files) => runHeuristics(files),
};

let activeProvider: ModerationProvider = heuristicProvider;

/**
 * Swap in a different analyzer — a model call, a vendor API, a shadow-mode
 * ensemble. Callers of moderateForPublish() do not change. Intended for tests
 * and for the eventual real classifier; there is no runtime config for it yet.
 */
export function setModerationProvider(provider: ModerationProvider): void {
  activeProvider = provider;
}

/**
 * Analyzes the files about to become publicly reachable and returns what it
 * found. Returns findings, NOT a verdict — the caller applies policy (today:
 * app/api/projects/[id]/publish/route.ts refuses on `high`, records the rest).
 *
 * Async on purpose even though the current provider is pure CPU: a real
 * classifier will be a network call, and this signature is the seam.
 */
export async function moderateForPublish(files: ModerationInput[]): Promise<ModerationResult> {
  const findings = await activeProvider.analyze(files);
  return { provider: activeProvider.name, findings };
}

// ── Recording ─────────────────────────────────────────────────────────────
//
// Persistence is a SEPARATE entry point from analysis, on purpose.
// moderateForPublish() still returns signals and never a verdict, the
// ModerationProvider seam still sees nothing but file text, and neither of them
// knows what "blocked" means — `action` is handed IN by the caller that applied
// the policy. Swapping the heuristics for a model call does not touch a line
// below, and nothing below can turn the analyzer into a policy engine.
//
// PRIVACY — read before widening anything here. Every row embeds `evidence`, a
// verbatim snippet of the customer's own page. That makes ModerationFinding
// personal data belonging to the project owner and DISCLOSABLE TO THEM in a
// data-subject access request (same standing as SupportNote: write nothing here
// we would not stand behind if it were handed back). So a row stores the least
// a reviewer can act on — one hard-truncated snippet, the file it came from,
// the rule id and the severity — and nothing else. No page bodies, no whole
// forms, no prompt text, no request or session context.

export type ModerationAction = "blocked" | "recorded";

// The scanner already builds snippets at EVIDENCE_RADIUS either side of a
// match, but the MATCH itself is unbounded for several rules (a 60+ character
// `ffff…` allowance literal, a 160-character off-origin URL), so "roughly 180
// characters" is a tendency, not a limit. This is the limit. app/admin/sites
// re-truncates to 150 for display; that is the panel protecting itself, not a
// reason to store more than a reviewer needs.
const STORED_EVIDENCE_MAX = 200;
const STORED_PATH_MAX = 300;

function clamp(value: string, max: number): string {
  const flat = value.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

type FindingRow = {
  projectId: string;
  rule: string;
  severity: ModerationSeverity;
  path: string;
  evidence: string;
  action: ModerationAction;
};

/** Identity of a finding for repeat-detection: same rule, same file, same text. */
function rowKey(r: { rule: string; path: string; evidence: string }): string {
  return `${r.rule} ${r.path} ${r.evidence}`;
}

// VOLUME. A publish attempt writes at most MAX_FINDINGS_PER_RULE per rule, but
// publishing is not a once-per-project event: a site with a mock login form
// trips `password-form-on-static-site` on every single republish, and someone
// iterating on a design republishes dozens of times an afternoon. Writing all
// of those breaks the two things this table exists for:
//
//   • the review queue — app/admin/sites "Needs review" filters on
//     `reviewedAt IS NULL`, so an operator who rules on a repeated finding
//     watches an identical unreviewed copy of it reappear on the next publish,
//     forever. The queue would never reach zero and would stop being read.
//   • the false-positive rate — the rule-accuracy panel counts ROWS. Let
//     republishes multiply them and the denominator measures how often people
//     hit publish, not how often a rule fires on distinct content. One user
//     iterating on one login page would dominate every rule's FP rate, and that
//     number is the whole reason this table is being populated.
//
// So a NON-BLOCKING finding is recorded once per (project, rule, file, snippet)
// and skipped when an identical row is already on file. Nothing is lost that a
// reviewer would use: the first occurrence keeps its timestamp, an actual
// content CHANGE moves the snippet and lands a new row, and the publish route
// still logs every occurrence to the console for operational breadcrumbs. What
// is given up is the count of how many times an unchanged page was republished,
// which no moderation question asks.
//
// BLOCKING findings are exempt and always written. A refused publish retried
// eleven times is itself the signal — that is someone iterating against the
// gate, not a static page being redeployed — and the volume is self-limiting
// because the publish never succeeds.
async function withoutRepeats(projectId: string, rows: FindingRow[]): Promise<FindingRow[]> {
  const repeatable = rows.filter((r) => r.action === "recorded");
  if (repeatable.length === 0) return rows;

  // Bounded by construction: at most MAX_FINDINGS_PER_RULE × the rule count, so
  // the OR list is tens of terms at worst, served off @@index([projectId, …]).
  const existing = await db.moderationFinding.findMany({
    where: {
      projectId,
      action: "recorded",
      OR: repeatable.map((r) => ({ rule: r.rule, path: r.path, evidence: r.evidence })),
    },
    select: { rule: true, path: true, evidence: true },
    distinct: ["rule", "path", "evidence"],
  });

  const seen = new Set(existing.map(rowKey));
  return rows.filter((r) => {
    if (r.action === "blocked") return true;
    const key = rowKey(r);
    if (seen.has(key)) return false;
    // Also guards the batch against itself: two findings whose snippets differ
    // only past STORED_EVIDENCE_MAX collapse to one row after clamping.
    seen.add(key);
    return true;
  });
}

/**
 * Writes one row per finding for a single publish attempt.
 *
 * `blocked` is the subset that actually refused the publish — pass what
 * blockingFindings() returned, straight through. Findings in it are stored with
 * `action: "blocked"`, everything else with `"recorded"`. This function does not
 * decide which is which; that is policy and it lives in the route.
 *
 * NEVER THROWS, never rejects. A publish must not fail — or succeed — because
 * of the bookkeeping about it. On a database error it logs and returns 0, and
 * the caller's outcome is exactly what it would have been before this existed.
 *
 * AWAITED BY THE CALLER, deliberately unlike track() in lib/events.ts. That
 * function is fire-and-forget because a dropped analytics event is a rounding
 * error in an aggregate. This is not analytics: it is the record of a
 * moderation decision about one specific site, the thing you reach for when
 * that site is reported, and — for a blocked publish — the ONLY evidence that
 * we refused something, since the refusal leaves no other trace. A floating
 * promise in a route handler is not guaranteed to run to completion once the
 * Response is returned, and the blocked path returns immediately after this
 * call, which is precisely when a dropped write would be most costly. The cost
 * of awaiting is one round trip on a user-initiated action that already runs
 * several queries and a transaction; the cost of losing the row is an abuse
 * report with nothing behind it and an FP rate that silently under-counts.
 */
export async function recordModerationFindings(input: {
  projectId: string;
  result: ModerationResult;
  blocked: readonly ModerationFinding[];
}): Promise<number> {
  const { projectId, result, blocked } = input;
  if (result.findings.length === 0) return 0;

  // Identity, not value: `blocked` is a filtered view of `result.findings`
  // (blockingFindings), so the objects are the same references.
  const blockedSet = new Set<ModerationFinding>(blocked);

  const rows: FindingRow[] = result.findings.map((f) => ({
    projectId,
    rule: f.rule,
    severity: f.severity,
    path: clamp(f.path, STORED_PATH_MAX),
    // `note` is deliberately not stored: it is generated from the rule id and
    // would be a second copy of static text on every row. app/admin/sites/ui.tsx
    // holds the reviewer-facing version keyed by rule.
    evidence: clamp(f.evidence, STORED_EVIDENCE_MAX),
    action: blockedSet.has(f) ? "blocked" : "recorded",
  }));

  try {
    const fresh = await withoutRepeats(projectId, rows);
    if (fresh.length === 0) return 0;
    await db.moderationFinding.createMany({ data: fresh });
    return fresh.length;
  } catch (err) {
    // Log and move on — see "NEVER THROWS" above.
    console.error(
      `[moderation] failed to record ${rows.length} finding(s) for project=${projectId}:`,
      err,
    );
    return 0;
  }
}
