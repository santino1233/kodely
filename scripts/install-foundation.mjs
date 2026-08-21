// One-time setup: installs the foundation's dependencies into a shared
// location every project build reuses via a symlink (see lib/build-site.ts).
// This is the ONLY npm install that ever runs for site generation — keep this
// package.json byte-identical to the one in lib/foundation.ts.
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const FOUNDATION_DIR = process.env.KODELY_FOUNDATION_DIR ?? "/home/kodely/kodely-foundation";

const PACKAGE_JSON = {
  name: "kodely-site",
  private: true,
  version: "0.0.0",
  type: "module",
  scripts: { build: "vite build" },
  dependencies: {
    react: "^19.2.8",
    "react-dom": "^19.2.8",
  },
  devDependencies: {
    "@tailwindcss/vite": "^4.3.3",
    "@vitejs/plugin-react": "^6.0.5",
    tailwindcss: "^4.3.3",
    typescript: "^7.0.2",
    vite: "^8.2.1",
  },
};

await mkdir(FOUNDATION_DIR, { recursive: true });
await writeFile(`${FOUNDATION_DIR}/package.json`, JSON.stringify(PACKAGE_JSON, null, 2));

console.log(`Installing foundation dependencies into ${FOUNDATION_DIR} ...`);
// npm is npm.cmd on Windows, and since CVE-2024-27980 Node refuses to spawn
// a .cmd without a shell (EINVAL). Both args here are constants — nothing
// user-supplied reaches the shell — so shell:true is safe.
const isWindows = process.platform === "win32";
execFileSync(isWindows ? "npm.cmd" : "npm", ["install"], {
  cwd: FOUNDATION_DIR,
  stdio: "inherit",
  shell: isWindows,
});
console.log("Done.");
