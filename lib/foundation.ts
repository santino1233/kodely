import type { FileMap } from "./agent";
import { FONT_FILES } from "./foundation-fonts";

// The starter every new project begins from — a real Vite + React + TS +
// Tailwind app, not a blank page. The agent edits these files; it never
// chooses or installs dependencies itself (see lib/build-site.ts) — package.json
// here is the ONLY dependency set that will ever exist, which is what keeps
// the server-side build safe to run without per-generation `npm install`.
export const FOUNDATION_FILES: FileMap = {
  "package.json": JSON.stringify(
    {
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
    },
    null,
    2,
  ),

  // MULTI-PAGE lives here, and it has to, because this file is the one place
  // the agent cannot reach: vite.config.* is on isProtectedPath in lib/agent.ts
  // (a config file is code we execute server-side, not data we serve). So the
  // build cannot take a list of pages from the model — it DISCOVERS them, by
  // scanning the project for .html files and making each one a Rollup entry.
  // Adding a page is then "write about.html", with no config edit anywhere.
  //
  // Every shell points at the SAME /src/main.tsx on purpose. One shared entry
  // module means Rollup emits ONE js chunk that all pages reference, rather
  // than a chunk per page plus a shared chunk pulled in by a bare `import`.
  // That matters twice over: navigating between pages reuses an already-cached
  // bundle, and the editor's preview (app/projects/[id]/preview-agent.ts) can
  // still inline the whole thing into a srcdoc document, which it cannot do
  // with a chunk that imports a sibling by relative URL.
  "vite.config.ts": `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readdirSync } from "node:fs";
import { resolve, relative } from "node:path";

// Never entries, and never worth walking into.
const SKIP = new Set(["node_modules", "dist", "src", "public"]);

/** Every .html file under the project root, as { "about": "/abs/about.html" }. */
function htmlEntries(dir: string, root: string, depth = 0): Record<string, string> {
  const out: Record<string, string> = {};
  if (depth > 4) return out; // a site is not nested deeper than this
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || SKIP.has(entry.name)) continue;
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) Object.assign(out, htmlEntries(full, root, depth + 1));
    else if (entry.name.toLowerCase().endsWith(".html")) {
      const name = relative(root, full).replace(/\\\\/g, "/").replace(/\\.html$/i, "");
      out[name] = full;
    }
  }
  return out;
}

// build-site.ts spawns vite with cwd set to the project, so this is the root.
const root = process.cwd();
const found = htmlEntries(root, root);
const input = Object.keys(found).length ? found : { index: resolve(root, "index.html") };

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { outDir: "dist", rollupOptions: { input } },
});
`,

  "tsconfig.json": JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        useDefineForClassFields: true,
        lib: ["ES2022", "DOM", "DOM.Iterable"],
        module: "ESNext",
        skipLibCheck: true,
        moduleResolution: "bundler",
        allowImportingTsExtensions: true,
        resolveJsonModule: true,
        isolatedModules: true,
        noEmit: true,
        jsx: "react-jsx",
        strict: true,
      },
      include: ["src"],
    },
    null,
    2,
  ),

  // The builder is instructed to rewrite the title/description/OG tags below
  // for every new site (see lib/agent.ts). If it doesn't, lib/site-seo.ts
  // substitutes the project name at serve time — a published site must never
  // show "Kodely Site" in a browser tab, a search result, or a link preview.
  //
  // This file is also the TEMPLATE FOR EVERY OTHER PAGE. A second page is a
  // copy of it with its own <head> and its own data-page: that is what makes
  // /about a real, separately-indexable document rather than a state of the
  // home page. `data-page` is how the document tells the bundle which page it
  // is — never sniffed from location.pathname, which differs between
  // <slug>.kodely.site/about, /api/site/<slug>/about on staging, and
  // about:srcdoc in the editor preview.
  "index.html": `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Kodely Site</title>
    <meta name="description" content="" />
    <meta property="og:title" content="" />
    <meta property="og:description" content="" />
    <meta property="og:type" content="website" />
    <meta name="twitter:card" content="summary_large_image" />
  </head>
  <body>
    <div id="root" data-page="/"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,

  "src/main.tsx": `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

const root = document.getElementById("root")!;

createRoot(root).render(
  <StrictMode>
    <App page={root.dataset.page ?? "/"} />
  </StrictMode>,
);
`,

  "src/index.css": `@import "tailwindcss";

:root {
  color-scheme: light dark;
}
`,

  // THE ROUTING PRIMITIVE. There is no router package and there never will be
  // — lib/build-site.ts symlinks one shared, pre-installed dependency tree and
  // never runs `npm install`, so react and react-dom are the whole universe.
  // This is ~40 lines of hand-rolled resolution instead, and it does less than
  // a router on purpose: navigation between pages is an ordinary <a href>, a
  // real document load of a real URL. No pushState, no history interception,
  // nothing that has to be re-implemented correctly for the back button.
  "src/router.tsx": `import type { AnchorHTMLAttributes, ComponentType } from "react";
import { PAGES } from "./pages";

export type PageDef = {
  /** Root-relative address: "/" for the home page, "/about", "/services/boilers". */
  path: string;
  /** Text for the nav link. */
  label: string;
  component: ComponentType;
  /** false to keep it out of the nav (a legal page, a landing page). */
  nav?: boolean;
};

const home = (): PageDef => PAGES.find((p) => p.path === "/") ?? PAGES[0];

/** Normalise "about", "/about/", "/about" to "/about"; anything empty to "/". */
function tidy(path: string): string {
  const p = path.trim().replace(/^\\/+/, "").replace(/\\/+$/, "");
  return p ? \`/\${p}\` : "/";
}

/** The page this document declares via data-page on #root. */
export function resolvePage(path: string): PageDef {
  const want = tidy(path).toLowerCase();
  return PAGES.find((p) => tidy(p.path).toLowerCase() === want) ?? home();
}

/** Which page is on screen, for active-link styling. */
export function currentPath(): string {
  if (typeof document === "undefined") return "/";
  return tidy(document.getElementById("root")?.dataset.page ?? "/");
}

// WHERE THE SITE IS MOUNTED. A published site sits at the root of
// <slug>.kodely.site, but the same files are also served under
// /api/site/<slug>/ on staging, so a hardcoded href="/about" is wrong half the
// time. The prefix is whatever precedes this document's own declared path in
// the URL bar, which is exact rather than guessed — and "" when there is no
// real URL at all (the editor preview runs from about:srcdoc).
let prefix: string | null = null;

function mountPrefix(): string {
  if (prefix !== null) return prefix;
  prefix = "";
  if (typeof location === "undefined" || !location.pathname.startsWith("/")) return prefix;
  let here = location.pathname.replace(/\\.html?$/i, "").replace(/(^|\\/)index$/i, "$1");
  here = here.replace(/\\/+$/, "");
  const own = currentPath() === "/" ? "" : currentPath();
  if (own && here.toLowerCase().endsWith(own.toLowerCase())) here = here.slice(0, -own.length);
  prefix = here.replace(/\\/+$/, "");
  return prefix;
}

/** The href a page should be linked by, valid wherever the site is mounted. */
export function href(path: string): string {
  const p = tidy(path);
  const base = mountPrefix();
  if (!base) return p;
  return p === "/" ? \`\${base}/\` : \`\${base}\${p}\`;
}

/** Pages that belong in the nav, in table order. */
export function navPages(): PageDef[] {
  return PAGES.filter((p) => p.nav !== false);
}

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { to: string };

/** An internal link. Use this instead of a bare <a href> for site pages. */
export function Link({ to, ...props }: LinkProps) {
  const target = tidy(to);
  return (
    <a
      href={href(target)}
      aria-current={target.toLowerCase() === currentPath().toLowerCase() ? "page" : undefined}
      {...props}
    />
  );
}
`,

  // THE PAGE TABLE — the one file that has to change when a page is added, and
  // the thing the nav and the router both read. Kept apart from router.tsx so
  // the mechanism stays untouched while the list of pages grows.
  "src/pages.tsx": `import type { PageDef } from "./router";
import Home from "./pages/Home";

// Adding a page takes three steps and no config change:
//
//   1. src/pages/About.tsx — the page component.
//   2. An entry below, in the order it should appear in the nav.
//   3. about.html at the project root — a copy of index.html with its OWN
//      <title>, <meta name="description"> and OG tags, and data-page="/about"
//      on the root div. That file is why /about is a separate document a
//      search engine can rank on its own; without it the page is unreachable.
//
// Nested pages work the same way: services/boilers.html with
// data-page="/services/boilers".
export const PAGES: PageDef[] = [
  { path: "/", label: "Home", component: Home },
];
`,

  // The shell every page renders inside: chrome that is shared (nav, footer)
  // wraps the one page component the document asked for.
  "src/App.tsx": `import { resolvePage } from "./router";
import { SiteNav } from "./components/SiteNav";

export default function App({ page }: { page: string }) {
  const Page = resolvePage(page).component;

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <SiteNav />
      <main>
        <Page />
      </main>
    </div>
  );
}
`,

  "src/pages/Home.tsx": `import { Section } from "../components/ui/Section";
import { Button } from "../components/ui/Button";

export default function Home() {
  return (
    <Section>
      <h1 className="text-4xl font-bold tracking-tight text-neutral-900">Welcome</h1>
      <p className="mt-4 text-lg text-neutral-600">
        Describe what you want built, and I'll take it from here.
      </p>
      <Button className="mt-6">Get started</Button>
    </Section>
  );
}
`,

  // Site-level composition rather than a primitive: it reads the page table, so
  // a page added there appears in the nav on every page without a second edit.
  // Restyle it freely — the only part that must survive is that the links come
  // from navPages() and go through <Link>.
  "src/components/SiteNav.tsx": `import { Nav } from "./ui/Nav";
import { Link, navPages } from "../router";

export function SiteNav() {
  const pages = navPages();
  if (pages.length < 2) return null; // a one-page site does not need a nav

  return (
    <Nav>
      <div className="mx-auto flex max-w-5xl items-center gap-6 px-6 py-4 text-sm">
        {pages.map((page) => (
          <Link
            key={page.path}
            to={page.path}
            className="rounded text-neutral-600 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 aria-[current=page]:font-semibold aria-[current=page]:text-neutral-900"
          >
            {page.label}
          </Link>
        ))}
      </div>
    </Nav>
  );
}
`,

  "src/components/ui/Button.tsx": `import { forwardRef, type ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost";

const variants: Record<Variant, string> = {
  primary: "bg-neutral-900 text-white hover:bg-neutral-800",
  secondary: "bg-neutral-100 text-neutral-900 hover:bg-neutral-200",
  ghost: "text-neutral-900 hover:bg-neutral-100",
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant };

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = "primary", className = "", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={\`inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-medium transition-colors \${variants[variant]} \${className}\`}
      {...props}
    />
  );
});
`,

  "src/components/ui/Card.tsx": `import type { HTMLAttributes } from "react";

export function Card({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={\`rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm \${className}\`}
      {...props}
    />
  );
}
`,

  "src/components/ui/Section.tsx": `import type { HTMLAttributes } from "react";

export function Section({ className = "", ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={\`mx-auto max-w-5xl px-6 py-16 \${className}\`} {...props} />;
}
`,

  "src/components/ui/Nav.tsx": `import type { HTMLAttributes } from "react";

export function Nav({ className = "", ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <nav
      className={\`sticky top-0 z-10 border-b border-neutral-200 bg-white/80 backdrop-blur \${className}\`}
      {...props}
    />
  );
}
`,

  // Self-hosted webfonts (see lib/foundation-fonts.ts) — seeded into EVERY
  // project's public/fonts/ so Vite's verbatim public/ copy (confirmed against
  // this project's own vite.config.ts: no publicDir override, so the default
  // "copy public/ into outDir" behaviour applies) puts a real .woff2 file at a
  // same-origin path in every build's served output, whether or not a given
  // site ends up using it. The agent never writes these files itself — it only
  // references whichever family it picks via @font-face (see lib/agent.ts's
  // font-rule paragraph); nothing here is generated per-request.
  ...FONT_FILES,
};
