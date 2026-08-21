import { spawn } from "node:child_process";
import { mkdtemp, writeFile, mkdir, rm, readdir, readFile, stat, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import type { FileMap } from "./agent";

// Where the foundation's dependencies are installed ONCE (see
// scripts/install-foundation.mjs) — every build reuses this via a symlink
// instead of running `npm install` per generation. The agent never chooses
// or adds dependencies (see lib/foundation.ts), so this is always installing
// exactly the same known-safe package.json, never anything request-controlled.
const FOUNDATION_DIR = process.env.KODELY_FOUNDATION_DIR ?? "/home/kodely/kodely-foundation";

const BUILD_TIMEOUT_MS = 60_000;

export class BuildError extends Error {}

/**
 * Compiles a project's source files into static output via `vite build`,
 * in a throwaway directory, bounded by a timeout. Never runs `npm install`
 * — the node_modules symlink points at the one shared, pre-installed
 * foundation tree, so this only ever executes vite/esbuild against files
 * we already trust the shape of, never arbitrary installed code.
 */
export async function buildSite(sourceFiles: FileMap): Promise<FileMap> {
  const workDir = await mkdtemp(join(tmpdir(), "kodely-build-"));

  try {
    for (const [path, content] of Object.entries(sourceFiles)) {
      const fullPath = join(workDir, path);
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, content, "utf8");
    }

    // "junction" on Windows, "dir" elsewhere. A Windows directory symlink
    // needs SeCreateSymbolicLinkPrivilege (admin, or Developer Mode) and
    // otherwise fails with EPERM, which blocked every local build on a dev
    // machine. An NTFS junction is equivalent for this purpose and needs no
    // elevation; it only works for absolute local paths, which is what this
    // is. No behaviour change on Linux.
    await symlink(
      join(FOUNDATION_DIR, "node_modules"),
      join(workDir, "node_modules"),
      process.platform === "win32" ? "junction" : "dir",
    );

    // Invoke Vite's JS entrypoint with this process's own node binary rather
    // than the `.bin/vite` shim: the shim is extensionless on POSIX but a
    // .CMD on Windows, and Node refuses to spawn .cmd without a shell. Going
    // straight to the entrypoint is a single code path on both platforms and
    // avoids shell quoting entirely.
    await runBounded(
      process.execPath,
      [join("node_modules", "vite", "bin", "vite.js"), "build"],
      workDir,
    );

    return await readDistTree(join(workDir, "dist"));
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

function runBounded(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      timeout: BUILD_TIMEOUT_MS,
      env: { ...process.env, NODE_ENV: "production" },
    });

    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => reject(new BuildError(`Build could not start: ${err.message}`)));

    child.on("close", (code, signal) => {
      if (signal === "SIGTERM") {
        reject(new BuildError("Build timed out."));
      } else if (code !== 0) {
        reject(new BuildError(`Build failed:\n${stderr.slice(-2000)}`));
      } else {
        resolve();
      }
    });
  });
}

const TEXT_EXTENSIONS = new Set([".html", ".js", ".css", ".json", ".svg", ".txt", ".map"]);

async function readDistTree(dir: string): Promise<FileMap> {
  const files: FileMap = {};

  async function walk(current: string, prefix: string) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(current, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(full, rel);
      } else {
        const ext = entry.name.slice(entry.name.lastIndexOf("."));
        if (!TEXT_EXTENSIONS.has(ext)) continue; // no binary assets — matches the inline-SVG/data-URI-only contract
        const size = (await stat(full)).size;
        if (size > 2_000_000) continue; // guard against something huge slipping through
        files[rel] = await readFile(full, "utf8");
      }
    }
  }

  await walk(dir, "");
  return files;
}
