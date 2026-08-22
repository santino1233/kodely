import type { FileMap } from "../agent";

/**
 * One file in a Pro foundation.
 *
 * The `purpose` and `exports` fields are not documentation for us — they are
 * what the model is meant to see INSTEAD of `content`. describeFiles() in
 * lib/agent.ts inlines every byte of every file into the request on every
 * turn, which is affordable for the nine-file marketing foundation and is not
 * affordable for a 25-file app kernel. See docs/pro-foundations.md for the
 * arithmetic; see the board card "Replace the whole-tree file dump with a
 * manifest plus a read_file tool" for the change that makes it real.
 */
export type FoundationFile = {
  /** One line: what this file is for. Goes in the manifest. */
  purpose: string;
  /** Comma-separated exported symbols, for kernel files. */
  exports?: string;
  /** True when a generation is expected to rewrite this file. */
  editable: boolean;
  content: string;
};

export type Foundation = {
  id: string;
  /** Shown wherever a user picks a foundation. */
  name: string;
  summary: string;
  /**
   * What this foundation genuinely cannot do. Not marketing hedging — these
   * strings are the honest half of the pitch and belong in the picker UI and
   * in the app-generation system prompt, so neither the buyer nor the model
   * is left to assume otherwise.
   */
  cannot: string[];
  /** Files this foundation adds on top of the shared config in lib/foundation.ts. */
  files: Record<string, FoundationFile>;
};

/** The plain FileMap a project is seeded with, for buildSite and the DB. */
export function toFileMap(foundation: Foundation): FileMap {
  const files: FileMap = {};
  for (const [path, file] of Object.entries(foundation.files)) files[path] = file.content;
  return files;
}

/** Paths the model is NOT expected to touch. */
export function kernelPaths(foundation: Foundation): string[] {
  return Object.entries(foundation.files)
    .filter(([, file]) => !file.editable)
    .map(([path]) => path);
}

/**
 * The manifest: what the model should be told the project contains, without
 * being handed the contents. Roughly 4% of the size of the same files inlined.
 */
export function describeManifest(foundation: Foundation): string {
  const lines: string[] = [
    `Foundation: ${foundation.name} — ${foundation.summary}`,
    "",
    "This foundation cannot:",
    ...foundation.cannot.map((line) => `  - ${line}`),
    "",
    "Files you are expected to edit:",
  ];

  const entries = Object.entries(foundation.files);
  for (const [path, file] of entries.filter(([, f]) => f.editable)) {
    lines.push(`  ${path} (${file.content.length}B) — ${file.purpose}`);
  }

  lines.push(
    "",
    "Pre-built kernel. Do not rewrite these; read one with read_file only if you",
    "need its exact signatures:",
  );
  for (const [path, file] of entries.filter(([, f]) => !f.editable)) {
    lines.push(
      `  ${path} (${file.content.length}B) — ${file.purpose}` +
        (file.exports ? `\n      exports: ${file.exports}` : ""),
    );
  }

  return lines.join("\n");
}
