import type { FileMap } from "./agent";

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

  "vite.config.ts": `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { outDir: "dist" },
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

  "index.html": `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Kodely Site</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,

  "src/main.tsx": `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
`,

  "src/index.css": `@import "tailwindcss";

:root {
  color-scheme: light dark;
}
`,

  "src/App.tsx": `import { Section } from "./components/ui/Section";
import { Button } from "./components/ui/Button";

export default function App() {
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
};
