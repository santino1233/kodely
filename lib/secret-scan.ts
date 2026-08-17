// Exists because /api/site/[slug]/... serves published files to the public internet with no auth — a secret pasted or echoed into generated content becomes public and permanent the moment it's published, so this scans draft files as the last gate before that happens.

const DATA_URI_RE = /data:[a-zA-Z0-9+.\-/]+;base64,[A-Za-z0-9+/=]+/g;

function redact(value: string): string {
  return value.length <= 6 ? `${value}…` : `${value.slice(0, 6)}…`;
}

interface SecretPattern {
  kind: string;
  regex: RegExp;
}

const PATTERNS: SecretPattern[] = [
  { kind: "AWS access key ID", regex: /AKIA[0-9A-Z]{16}/g },
  {
    kind: "API key/secret assignment",
    regex: /(?:api[_-]?key|secret|token|password|passwd|pwd)\s*[:=]\s*['"]([A-Za-z0-9_-]{20,})['"]/gi,
  },
  { kind: "OpenAI/Anthropic-style secret key", regex: /sk-(?:live-|test-)?[A-Za-z0-9]{20,}/g },
  { kind: "Stripe secret key", regex: /sk_(?:live|test)_[A-Za-z0-9]{20,}/g },
  { kind: "Google API key", regex: /AIza[0-9A-Za-z_-]{35}/g },
  { kind: "Private key (PEM)", regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { kind: "JWT", regex: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
];

export function scanForSecrets(
  files: { path: string; content: string }[],
): { path: string; match: string; kind: string }[] {
  const findings: { path: string; match: string; kind: string }[] = [];

  for (const file of files) {
    // Strip data: URIs before scanning so a long base64 image/font blob can't
    // coincidentally trip a pattern — those bytes are assets, not credentials.
    const scannable = file.content.replace(DATA_URI_RE, "");

    for (const { kind, regex } of PATTERNS) {
      regex.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = regex.exec(scannable)) !== null) {
        const value = m[1] ?? m[0];
        findings.push({ path: file.path, match: redact(value), kind });
      }
    }
  }

  return findings;
}
