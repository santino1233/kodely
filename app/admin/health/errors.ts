// Failure clustering for Build.error.
//
// Build.error is a free-text string written by three different layers (the
// generate route, lib/build-site.ts, and whatever the SDK or the Anthropic
// client threw), truncated to 1000 chars. Listing those raw answers nothing:
// "is generation broken right now" is a question about FAMILIES, not strings.
// Six rows reading "Not logged in · Please run /login" are one incident, and
// the panel has to say so.
//
// The families below were derived from the error text actually present in this
// database plus every string the code can produce:
//
//   - "Claude Code returned an error result: Not logged in · Please run /login"
//   - "Claude Code returned an error result: Failed to authenticate.
//      API Error: 401 OAuth access token is invalid."
//   - "Error: EPERM: operation not permitted, symlink
//      'C:\home\kodely\kodely-foundation\node_modules' -> '...\kodely-build-*'"
//   - "EBUSY: resource busy or locked, rmdir '...\kodely-personal-*'"
//   - "Build timed out."                       (lib/build-site.ts, 60s vite bound)
//   - "Build failed:\n<vite stderr>"           (lib/build-site.ts)
//   - "Build could not start: <spawn error>"   (lib/build-site.ts)
//   - "Generation ended without producing output." (app/api/generate/route.ts)
//   - "Client disconnected."                       (app/api/generate/route.ts)
//   - "KODELY_ENGINE=sdk but no subscription credentials were found. …"
//     (lib/agent-sdk.ts)
//
// Adding a family is a deliberate edit, the same discipline as EVENTS in
// lib/events.ts. A growing "Other" share is the signal that these rules have
// drifted from what the system actually emits — which is why Other is shown
// with its own callout rather than quietly absorbing everything.

/**
 * Who has to act. This is the difference between "the box is broken" and "the
 * model is bad", and it is the single most useful thing the clustering adds:
 * a config family on top means no amount of prompt work will help.
 */
export type Blame = "config" | "environment" | "generation" | "client" | "unknown";

export type FamilyId =
  | "sdk_auth"
  | "api_auth"
  | "rate_limit"
  | "timeout"
  | "filesystem"
  | "foundation"
  | "compile"
  | "no_output"
  | "client_gone"
  | "other";

export type ErrorFamily = {
  id: FamilyId;
  label: string;
  blame: Blame;
  /** What to check. Names env VARS and files — never a value, never a secret. */
  hint: string;
  /** `null` for the catch-all, which is matched by exhaustion rather than by pattern. */
  test: RegExp | null;
};

/**
 * PRECEDENCE ORDER — first match wins, so the specific patterns come before
 * the broad ones. In particular `sdk_auth` is tested before `api_auth`,
 * because an OAuth 401 from the subscription engine also contains "401" and
 * would otherwise be filed as a metered-key problem, sending the operator to
 * the wrong env var.
 */
export const FAMILIES: ErrorFamily[] = [
  {
    id: "sdk_auth",
    label: "SDK subscription auth",
    blame: "config",
    hint: "The Claude Agent SDK engine is not logged in on the machine that runs generations. Run `claude setup-token` as that user, or set CLAUDE_CODE_OAUTH_TOKEN. Mirrors assertSdkCredentials() in lib/agent-sdk.ts. Nothing reaches the model, so these fail in seconds and cost nothing.",
    test: /not logged in|please run \/login|oauth access token|failed to authenticate|setup-token|CLAUDE_CODE_OAUTH_TOKEN|no subscription credentials/i,
  },
  {
    id: "api_auth",
    label: "Anthropic API key rejected",
    blame: "config",
    hint: "The metered key is missing, revoked or wrong. Check ANTHROPIC_API_KEY on the app host.",
    test: /authentication_error|invalid x-api-key|ANTHROPIC_API_KEY|permission_error|\b401\b|\b403\b/i,
  },
  {
    id: "rate_limit",
    label: "Rate limited / overloaded",
    blame: "environment",
    hint: "Upstream capacity, not our code. Transient — but a sustained share here means concurrency needs a ceiling.",
    test: /\b429\b|\b529\b|rate.?limit|overloaded_error|too many requests/i,
  },
  {
    id: "timeout",
    label: "Timed out",
    blame: "environment",
    hint: "lib/build-site.ts bounds the vite step at 60s and kills it with SIGTERM. A cluster here means the compile step, not the model, is the bottleneck.",
    test: /build timed out|\bSIGTERM\b|\bETIMEDOUT\b|timed? ?out/i,
  },
  {
    id: "filesystem",
    label: "Filesystem / sandbox",
    blame: "environment",
    hint: "The build sandbox could not be created or torn down — EPERM on symlink is the Windows privilege case lib/build-site.ts works around with a junction; EBUSY on rmdir is a file still held open. Host-specific, and never the user's fault.",
    test: /\bEPERM\b|\bEBUSY\b|\bEACCES\b|\bENOTEMPTY\b|\bEXDEV\b|\bEMFILE\b|\bENOSPC\b|operation not permitted|resource busy or locked/i,
  },
  {
    id: "foundation",
    label: "Foundation tree missing",
    blame: "config",
    hint: "The shared pre-installed node_modules could not be found, so vite had nothing to run against. Check KODELY_FOUNDATION_DIR and re-run scripts/install-foundation.mjs. This surfaces as a misleading \u201cCannot find module\u201d and has bitten twice.",
    test: /cannot find module|MODULE_NOT_FOUND|build could not start|\bENOENT\b[^\n]*node_modules|no such file or directory[^\n]*node_modules/i,
  },
  {
    id: "compile",
    label: "Generated code did not compile",
    blame: "generation",
    hint: "The model wrote a site vite could not build. This is the only family a better prompt or model actually fixes — and the one a repair pass is for.",
    test: /build failed:|\bvite\b|esbuild|rollup|transform failed|error TS\d+|could not resolve|failed to resolve import|unexpected token|parse error|is not exported by/i,
  },
  {
    id: "no_output",
    label: "Agent produced no files",
    blame: "generation",
    hint: "The run finished without writing anything — historically caused by the prompt naming a tool the engine does not expose (see the SDK tool-contract note in lib/agent-sdk.ts).",
    test: /generation ended without producing output|produced no (files|output)/i,
  },
  {
    id: "client_gone",
    label: "Client disconnected",
    blame: "client",
    hint: "The browser went away mid-stream. Not a defect — but a rising share can mean the build is slow enough that people give up.",
    test: /client disconnected/i,
  },
  {
    id: "other",
    label: "Other / unclassified",
    blame: "unknown",
    hint: "No rule matched. A rising share here means these families have drifted from what the system now emits — read the samples and add a rule in app/admin/health/errors.ts.",
    test: null,
  },
];

const BY_ID = new Map<FamilyId, ErrorFamily>(FAMILIES.map((f) => [f.id, f]));

export function family(id: FamilyId): ErrorFamily {
  // Non-null by construction: FamilyId is exactly the set of ids in FAMILIES.
  return BY_ID.get(id) ?? FAMILIES[FAMILIES.length - 1];
}

/** First matching family wins. A null/blank error is still a failure — file it as Other. */
export function classifyError(raw: string | null | undefined): FamilyId {
  const text = (raw ?? "").trim();
  if (!text) return "other";
  for (const f of FAMILIES) {
    if (f.test && f.test.test(text)) return f.id;
  }
  return "other";
}

export const BLAME_LABEL: Record<Blame, string> = {
  config: "our config",
  environment: "the host",
  generation: "the model",
  client: "the visitor",
  unknown: "unknown",
};
