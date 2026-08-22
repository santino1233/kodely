import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { listAssets, findAssets, type AssetMatch } from "./index";

// Bridges the asset catalogue to the SDK engine.
//
// The two engines reach assets by different routes, and that is deliberate
// rather than an inconsistency:
//
//  - The API engine (lib/agent.ts) has custom tools, so it gets a real
//    `find_assets` tool that returns matches over the wire.
//  - The SDK engine has a fixed toolset (Read/Write/Edit/Bash/Glob/Grep) and a
//    real working directory. Giving it a custom tool would mean an in-process
//    MCP server, whose `tool()` helper requires zod — which is only present as
//    a transitive dependency of the SDK, not a declared one. Depending on a
//    package that isn't in package.json is a silent breakage waiting for the
//    next install, so instead the catalogue is written to disk and the agent
//    uses the file tools it already has.
//
// The directory is dot-prefixed on purpose: readFileTree() in agent-sdk.ts
// skips any entry starting with ".", so the catalogue is invisible to the diff
// that turns the working directory back into project files. Rename it without
// the dot and every generated site gains 460-odd junk files.

const DIR = ".kodely-assets";

/**
 * Writes the catalogue into `workDir/.kodely-assets/`:
 *   INDEX.md          one line per asset — id, name, keywords
 *   <kind>/<name>.txt the paste-ready source for that asset
 *
 * Returns the number of assets written.
 */
export async function materializeAssets(workDir: string): Promise<number> {
  const root = path.join(workDir, DIR);
  // No kind filter — the whole catalogue.
  const all = listAssets(undefined, { limit: 1000 });

  const byKind = new Map<string, AssetMatch[]>();
  for (const a of all) {
    const list = byKind.get(a.kind) ?? [];
    list.push(a);
    byKind.set(a.kind, list);
  }

  await mkdir(root, { recursive: true });

  const lines: string[] = [
    "# Kodely asset catalogue",
    "",
    "Every asset here is safe to inline — no external requests, so nothing here",
    "can be blocked by the published site's CSP.",
    "",
    "To use one: find its id below (Grep this file), then Read the file named on",
    "that line and paste its contents into the component you are writing.",
    "",
  ];

  for (const [kind, assets] of [...byKind.entries()].sort()) {
    await mkdir(path.join(root, kind), { recursive: true });
    lines.push(`## ${kind} (${assets.length})`, "");

    for (const a of assets) {
      // The id is namespaced ("icon:phone"); the bit after the colon is the
      // filename. Sanitised because it ends up as a real path.
      const leaf = a.id.split(":").slice(1).join("-").replace(/[^A-Za-z0-9._-]/g, "-") || "asset";
      const rel = `${DIR}/${kind}/${leaf}.txt`;
      await writeFile(
        path.join(root, kind, `${leaf}.txt`),
        `${a.usage}\n\n${a.source}\n`,
        "utf8",
      );
      lines.push(`- \`${a.id}\` — ${a.name} — ${a.keywords.slice(0, 6).join(", ")} → \`${rel}\``);
    }
    lines.push("");
  }

  await writeFile(path.join(root, "INDEX.md"), lines.join("\n"), "utf8");
  return all.length;
}

/**
 * Result shape for the API engine's `find_assets` tool. Trimmed to what the
 * model needs to paste — the full AssetMatch carries alternative encodings
 * that would multiply the token cost of every search for no benefit.
 */
export function formatMatchesForTool(matches: AssetMatch[]): string {
  if (matches.length === 0) {
    return "No assets matched. Try a broader term, or use a CSS gradient / inline SVG of your own.";
  }
  return matches
    .map((m) => [`### ${m.id} — ${m.name}`, m.usage, "", m.source].join("\n"))
    .join("\n\n---\n\n");
}

export { findAssets };
