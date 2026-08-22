// Bootstraps the app's real TypeScript modules into a plain Node script.
//
// The eval harness deliberately calls the SAME code path production uses —
// `runAgent` from lib/agent.ts and `buildSite` from lib/build-site.ts — rather
// than a reimplementation, because a scoreboard that measures a copy of the
// generator measures nothing. Getting those .ts modules loadable from a .mjs
// script under bare Node (no bundler, no ts-node, no new dependencies) needs
// three fixes, all of them here:
//
//   1. Node 22.6+/24 strips TypeScript types natively, but its ESM resolver
//      still demands full specifiers. lib/agent.ts imports "./models" with no
//      extension, which Node cannot resolve on its own.
//   2. Route handlers use the "@/..." tsconfig path alias, which only a
//      bundler understands.
//   3. buildSite reads KODELY_FOUNDATION_DIR from the environment and silently
//      falls back to a Linux path ("/home/kodely/kodely-foundation") when it is
//      missing — which surfaces as a misleading "Cannot find module" from vite
//      rather than "your env is not loaded". Next.js loads .env for you; a bare
//      node script does not, so we parse it here.
//
// The resolve hook is scoped to files inside the repo and outside
// node_modules, so it can never interfere with how dependencies (many of them
// CommonJS) resolve their own imports.

import { registerHooks } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

/** Repo root: this file lives at <root>/scripts/eval/loader.mjs. */
export const ROOT = path.resolve(import.meta.dirname, "..", "..");

const ROOT_POSIX = ROOT.replace(/\\/g, "/");
const CANDIDATE_EXTENSIONS = [".ts", ".tsx", ".mts", ".js", ".mjs", "/index.ts", "/index.tsx"];

let hooksRegistered = false;
let envLoaded = false;

/**
 * Minimal .env parser. Deliberately not dotenv: the constraint for this harness
 * is Node built-ins only, and the file is a handful of plain KEY=VALUE lines.
 * Existing process.env values win, so `KODELY_ENGINE=api node run.mjs` still
 * overrides the file.
 */
export function loadEnv({ quiet = false } = {}) {
  if (envLoaded) return;
  envLoaded = true;

  const envPath = path.join(ROOT, ".env");
  if (!existsSync(envPath)) {
    if (!quiet) console.warn(`[eval] no .env at ${envPath} — relying on the ambient environment`);
  } else {
    for (const rawLine of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
        (value.startsWith("'") && value.endsWith("'") && value.length > 1)
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  }

  // The failure this guard exists for: without it, every single build in the
  // suite fails with a vite "Cannot find module" that points nowhere near the
  // real cause. Fail loudly and early instead of 28 times, confusingly.
  const foundation = process.env.KODELY_FOUNDATION_DIR;
  if (!foundation) {
    throw new Error(
      "KODELY_FOUNDATION_DIR is not set. buildSite would fall back to the Linux " +
        "default path and every build would fail. Set it in .env (it points at the " +
        "checkout produced by scripts/install-foundation.mjs).",
    );
  }
  if (!existsSync(path.join(foundation, "node_modules"))) {
    throw new Error(
      `KODELY_FOUNDATION_DIR=${foundation} has no node_modules. ` +
        "Run `node scripts/install-foundation.mjs` first — buildSite symlinks that tree " +
        "instead of running npm install per generation.",
    );
  }
}

function isProjectSource(parentURL) {
  if (!parentURL || !parentURL.startsWith("file:")) return false;
  const p = fileURLToPath(parentURL).replace(/\\/g, "/");
  return p.startsWith(ROOT_POSIX) && !p.includes("/node_modules/");
}

/** Teach Node's resolver about extensionless imports and the "@/" alias. */
export function registerTsResolution() {
  if (hooksRegistered) return;
  hooksRegistered = true;

  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (!isProjectSource(context.parentURL)) return nextResolve(specifier, context);

      const parentDir = path.dirname(fileURLToPath(context.parentURL));
      let spec = specifier;

      if (spec.startsWith("@/")) {
        const abs = path.join(ROOT, spec.slice(2));
        spec = "./" + path.relative(parentDir, abs).replace(/\\/g, "/");
      }

      if (!spec.startsWith("./") && !spec.startsWith("../")) {
        return nextResolve(specifier, context);
      }

      const abs = path.resolve(parentDir, spec);
      if (path.extname(abs) && existsSync(abs)) return nextResolve(spec, context);

      for (const ext of CANDIDATE_EXTENSIONS) {
        if (existsSync(abs + ext)) return nextResolve(pathToFileURL(abs + ext).href, context);
      }
      return nextResolve(spec, context);
    },
  });
}

/** Node's own type-stripping and typeless-package warnings are just noise here. */
export function quietNodeWarnings() {
  process.removeAllListeners("warning");
  process.on("warning", (warning) => {
    const name = warning.name ?? "";
    const code = /** @type {{ code?: string }} */ (warning).code ?? "";
    if (code === "MODULE_TYPELESS_PACKAGE_JSON") return;
    if (name === "ExperimentalWarning") return;
    console.warn(warning.stack ?? String(warning));
  });
}

const importFromRoot = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);

/**
 * Loads the production generation modules. Note what is NOT loaded: lib/db.ts,
 * lib/credits.ts and lib/events.ts all instantiate Prisma at module scope, and
 * the harness must never touch the application database. costMicros is
 * therefore re-derived from lib/models.ts's rate card in score.mjs rather than
 * imported from lib/credits.ts.
 */
export async function loadKodely({ quiet = false } = {}) {
  quietNodeWarnings();
  loadEnv({ quiet });
  registerTsResolution();

  const [agent, buildSiteMod, foundation, models] = await Promise.all([
    importFromRoot("lib/agent.ts"),
    importFromRoot("lib/build-site.ts"),
    importFromRoot("lib/foundation.ts"),
    importFromRoot("lib/models.ts"),
  ]);

  return {
    runAgent: agent.runAgent,
    normalizePath: agent.normalizePath,
    ENGINE: agent.ENGINE,
    buildSite: buildSiteMod.buildSite,
    BuildError: buildSiteMod.BuildError,
    FOUNDATION_FILES: foundation.FOUNDATION_FILES,
    MODELS: models.MODELS,
    EFFORT: models.EFFORT,
    MODEL_RATES: models.MODEL_RATES,
  };
}
