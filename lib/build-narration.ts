// Turns a raw agent tool call into a line worth showing a non-developer.
//
// Every line here is derived from a tool call that ACTUALLY HAPPENED. There is
// deliberately no timed script of plausible-sounding steps: fake progress that
// finishes before the real build does is worse than no progress at all, and
// people spot it immediately — it is the tell that a product is a demo.
//
// The audience is someone who described a barber shop and is watching a screen.
// "Writing src/components/Hero.tsx" means nothing to them; "Writing the hero
// section" does. Where a path has no honest plain-English reading, we fall back
// to the filename rather than inventing a friendly label for it.

/** Files whose purpose isn't guessable from the name. */
const KNOWN_PATHS: Record<string, string> = {
  "index.html": "the page title and link preview",
  "src/App.tsx": "the page layout",
  "src/index.css": "the styles",
  "src/main.tsx": "the app entry point",
  "package.json": "the project config",
  "vite.config.ts": "the build config",
  "tsconfig.json": "the TypeScript config",
};

/** "FeatureGrid" -> "feature grid", "FAQ" -> "FAQ", "CTASection" -> "CTA section" */
function humanizeComponentName(name: string): string {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[\s_-]+/)
    .filter(Boolean);

  // Lowercase per word, not across the whole string: an all-caps word is an
  // initialism (FAQ, CTA, SEO) and "cta section" reads like a typo.
  return words
    .map((w) => (/^[A-Z0-9]{2,}$/.test(w) ? w : w.toLowerCase()))
    .join(" ");
}

/** A human description of a project file, e.g. "the pricing section". */
export function describePath(path: string): string {
  const clean = path.replace(/^\.?\//, "");
  if (KNOWN_PATHS[clean]) return KNOWN_PATHS[clean];

  const match = clean.match(/^src\/components\/(?:ui\/)?(.+)\.(tsx|jsx|ts|js)$/);
  if (match) {
    const label = humanizeComponentName(match[1].split("/").pop() ?? match[1]);
    // "ui/Button" is a primitive, not a page section — calling it a "section"
    // would be a lie the user could see through in the preview.
    const noun = clean.includes("/ui/") ? "component" : "section";
    // Don't append a noun the name already ends with: "CTASection" must read
    // "the CTA section", never "the CTA section section".
    if (new RegExp(`\\b${noun}$`, "i").test(label)) return `the ${label}`;
    return `the ${label} ${noun}`;
  }

  if (clean.endsWith(".css")) return "the styles";
  return clean;
}

type ToolInput = Record<string, unknown>;

function pathFrom(input: ToolInput): string | null {
  const raw = input.file_path ?? input.path ?? input.filePath;
  if (typeof raw !== "string" || !raw) return null;

  const normalized = raw.replace(/\\/g, "/");

  // Already project-relative — the API engine passes these straight through,
  // and stripping them to a bare filename loses the src/components/ prefix
  // that describePath needs to recognise a section at all.
  const isAbsolute = normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized);
  if (!isAbsolute) return normalized.replace(/^\.\//, "");

  // The SDK works in a temp checkout and reports absolute paths; everything
  // downstream — and the user — only cares about the project-relative part.
  const srcIndex = normalized.lastIndexOf("/src/");
  if (srcIndex !== -1) return normalized.slice(srcIndex + 1);
  const parts = normalized.split("/");
  return parts[parts.length - 1] || null;
}

/**
 * A progress line for one tool call, or null when the call isn't worth
 * narrating. Returning null is the common case for inspection tools — a line
 * per Grep would bury the lines that matter.
 */
export function narrateTool(toolName: string, input: ToolInput): string | null {
  const path = pathFrom(input);

  switch (toolName) {
    case "Write":
    case "write_file":
      return path ? `Writing ${describePath(path)}` : "Writing a file";

    case "Edit":
      return path ? `Updating ${describePath(path)}` : "Making an edit";

    case "delete_file":
      return path ? `Removing ${describePath(path)}` : "Removing a file";

    case "Read":
    case "Glob":
    case "Grep":
      // Collapsed to one recurring line on purpose. The route dedupes
      // consecutive identical lines, so a run of twelve Reads shows once.
      return "Looking through the project";

    case "Bash":
      return "Running a command";

    default:
      return null;
  }
}
