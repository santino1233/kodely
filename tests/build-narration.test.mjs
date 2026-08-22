// lib/build-narration.ts — the progress lines a non-developer reads while a
// build runs. Every assertion here is about what a human sees, because the
// failure mode is not a crash, it is a line that reads like a machine wrote it.

import test from "node:test";
import assert from "node:assert/strict";

import { describePath, narrateTool } from "../lib/build-narration.ts";

// ── describePath: the noun-duplication regression ──────────────────────────

test('describePath: "CTASection.tsx" is not narrated as "the cta section section"', () => {
  // THE REGRESSION, both halves of it in one line: the initialism must survive
  // lowercasing, and the trailing noun must not be appended twice.
  assert.equal(describePath("src/components/CTASection.tsx"), "the CTA section");
});

test("describePath: a name already ending in its noun never doubles it", () => {
  for (const name of ["CTASection", "HeroSection", "PricingSection", "FAQSection"]) {
    const label = describePath(`src/components/${name}.tsx`);
    assert.ok(!/section section/i.test(label), `${name} narrated as "${label}"`);
    assert.ok(label.endsWith("section"), `${name} narrated as "${label}"`);
  }
});

test("describePath: a ui/ primitive is a component, and never doubles either", () => {
  assert.equal(describePath("src/components/ui/Button.tsx"), "the button component");
  assert.equal(describePath("src/components/ui/Card.tsx"), "the card component");
  // A primitive is not a page section — calling it one is a lie the user can
  // see through in the preview.
  assert.ok(!describePath("src/components/ui/Button.tsx").includes("section"));
  assert.ok(!/component component/i.test(describePath("src/components/ui/Section.tsx")));
});

// ── describePath: initialisms ──────────────────────────────────────────────

test("describePath: initialisms keep their case", () => {
  assert.equal(describePath("src/components/FAQ.tsx"), "the FAQ section");
  assert.equal(describePath("src/components/FAQSection.tsx"), "the FAQ section");
  assert.equal(describePath("src/components/SEOHead.tsx"), "the SEO head section");
});

test("describePath: ordinary CamelCase is split and lowercased", () => {
  assert.equal(describePath("src/components/FeatureGrid.tsx"), "the feature grid section");
  assert.equal(describePath("src/components/Hero.tsx"), "the hero section");
  assert.equal(describePath("src/components/Nav_Bar.tsx"), "the nav bar section");
});

test("describePath: jsx/ts/js extensions are recognised too", () => {
  assert.equal(describePath("src/components/Hero.jsx"), "the hero section");
  assert.equal(describePath("src/components/Hero.ts"), "the hero section");
  assert.equal(describePath("src/components/Hero.js"), "the hero section");
});

test("describePath: a nested component is named by its own file", () => {
  assert.equal(describePath("src/components/marketing/PricingSection.tsx"), "the pricing section");
});

// ── describePath: known paths and fallbacks ────────────────────────────────

test("describePath: known files get their plain-English purpose", () => {
  assert.equal(describePath("index.html"), "the page title and link preview");
  assert.equal(describePath("src/App.tsx"), "the page layout");
  assert.equal(describePath("src/index.css"), "the styles");
  assert.equal(describePath("package.json"), "the project config");
  assert.equal(describePath("vite.config.ts"), "the build config");
});

test("describePath: a leading ./ or / does not defeat the known-path table", () => {
  assert.equal(describePath("./src/App.tsx"), "the page layout");
  assert.equal(describePath("/src/App.tsx"), "the page layout");
  assert.equal(describePath("./index.html"), "the page title and link preview");
});

test("describePath: any stylesheet reads as the styles", () => {
  assert.equal(describePath("src/styles/theme.css"), "the styles");
  assert.equal(describePath("src/components/Hero.css"), "the styles");
});

test("describePath: an unguessable file falls back to its path, never invents a label", () => {
  // Better a bare filename than a friendly-sounding fiction.
  assert.equal(describePath("README.md"), "README.md");
  assert.equal(describePath("src/lib/analytics.ts"), "src/lib/analytics.ts");
});

// ── narrateTool: path extraction ───────────────────────────────────────────

test("narrateTool: an SDK absolute path is reduced to the project-relative part", () => {
  assert.equal(
    narrateTool("Write", { file_path: "/tmp/kodely-build-a1b2/src/components/Hero.tsx" }),
    "Writing the hero section",
  );
});

test("narrateTool: a Windows absolute path is handled the same way", () => {
  assert.equal(
    narrateTool("Write", { file_path: "C:\\work\\checkout\\src\\components\\CTASection.tsx" }),
    "Writing the CTA section",
  );
});

test("narrateTool: an already-relative path keeps its src/components/ prefix", () => {
  // Stripping this to a bare filename loses the prefix describePath needs to
  // recognise a section at all — the API engine passes these straight through.
  assert.equal(narrateTool("Edit", { path: "src/components/CTASection.tsx" }), "Updating the CTA section");
  assert.equal(narrateTool("Edit", { path: "./src/components/Hero.tsx" }), "Updating the hero section");
});

test("narrateTool: an absolute path with no src/ falls back to the filename", () => {
  assert.equal(narrateTool("Write", { file_path: "/tmp/checkout/package.json" }), "Writing the project config");
});

test("narrateTool: the deepest src/ wins for a nested checkout", () => {
  assert.equal(
    narrateTool("Write", { file_path: "/srv/src/apps/build/src/components/Hero.tsx" }),
    "Writing the hero section",
  );
});

test("narrateTool: file_path, path and filePath are all accepted", () => {
  for (const key of ["file_path", "path", "filePath"]) {
    assert.equal(narrateTool("Write", { [key]: "src/components/Hero.tsx" }), "Writing the hero section");
  }
});

// ── narrateTool: the tool vocabulary ───────────────────────────────────────

test("narrateTool: write / edit / delete each have their own verb", () => {
  const p = { file_path: "src/components/Hero.tsx" };
  assert.equal(narrateTool("Write", p), "Writing the hero section");
  assert.equal(narrateTool("write_file", p), "Writing the hero section");
  assert.equal(narrateTool("Edit", p), "Updating the hero section");
  assert.equal(narrateTool("delete_file", p), "Removing the hero section");
});

test("narrateTool: inspection tools collapse to one recurring line", () => {
  for (const tool of ["Read", "Glob", "Grep"]) {
    assert.equal(narrateTool(tool, { file_path: "src/components/Hero.tsx" }), "Looking through the project");
  }
  assert.equal(narrateTool("Bash", { command: "npm run build" }), "Running a command");
});

test("narrateTool: an unknown tool is not narrated at all", () => {
  // Returning null is the point — a line per unrecognised call would bury the
  // lines that matter.
  assert.equal(narrateTool("Task", {}), null);
  assert.equal(narrateTool("WebFetch", { url: "https://example.com" }), null);
  assert.equal(narrateTool("", {}), null);
});

test("narrateTool: a file tool with no usable path still says something honest", () => {
  assert.equal(narrateTool("Write", {}), "Writing a file");
  assert.equal(narrateTool("Edit", { file_path: "" }), "Making an edit");
  assert.equal(narrateTool("delete_file", { file_path: 42 }), "Removing a file");
});

test("narrateTool: never leaks a raw component filename to the user", () => {
  const line = narrateTool("Write", { file_path: "/tmp/x/src/components/TestimonialCarousel.tsx" });
  assert.ok(!line.includes(".tsx"), `narration leaked a filename: ${line}`);
  assert.ok(!line.includes("/"), `narration leaked a path: ${line}`);
});
