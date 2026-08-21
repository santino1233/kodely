// Seeds realistic, fully-working test projects WITHOUT calling the Anthropic
// API — the source content below is hand-written (free), and buildSite()
// (a local `vite build` against the pre-installed foundation deps) compiles
// it into real build output, exactly like a real generation would produce.
// This is for exercising the editor/preview/publish/checkpoint UI at volume
// without spending credits on the AI generation step itself.
import { db } from "../lib/db";
import { FOUNDATION_FILES } from "../lib/foundation";
import { buildSite } from "../lib/build-site";
import type { FileMap } from "../lib/agent";

const TARGET_USER_ID = process.argv[2];
if (!TARGET_USER_ID) {
  console.error("Usage: npx tsx scripts/seed-test-sites.ts <userId>");
  process.exit(1);
}

function slugify(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return (base || "site") + "-" + Math.random().toString(36).slice(2, 7);
}

const NAV = `import type { HTMLAttributes } from "react";

export function Nav({ className = "", ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <nav
      className={\`sticky top-0 z-10 border-b border-neutral-200 bg-white/80 backdrop-blur \${className}\`}
      {...props}
    />
  );
}
`;

type Site = { name: string; app: string };

const SITES: Site[] = [
  {
    name: "Harlan & Cole Law",
    app: `import { Section } from "./components/ui/Section";
import { Card } from "./components/ui/Card";
import { Button } from "./components/ui/Button";
import { Nav } from "./components/ui/Nav";

const PRACTICE_AREAS = [
  { title: "Family Law", body: "Divorce, custody, and support — handled with care, not just paperwork." },
  { title: "Personal Injury", body: "We've recovered results for clients hurt by someone else's negligence." },
  { title: "Estate Planning", body: "Wills, trusts, and probate, written in plain English." },
];

export default function App() {
  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <Nav>
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <span className="text-lg font-semibold tracking-tight">Harlan &amp; Cole</span>
          <a href="#contact" className="text-sm font-medium text-neutral-600 hover:text-neutral-900">Contact</a>
        </div>
      </Nav>
      <Section className="text-center">
        <p className="text-xs font-medium uppercase tracking-widest text-neutral-500">Denver, Colorado</p>
        <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">Family &amp; personal injury law, done right.</h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-neutral-600">Two attorneys, one clear promise: you'll always know where your case stands.</p>
        <Button className="mt-8">Request a consultation</Button>
      </Section>
      <Section>
        <h2 className="text-center text-2xl font-semibold tracking-tight">Practice areas</h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          {PRACTICE_AREAS.map((a) => (
            <Card key={a.title}>
              <h3 className="font-semibold">{a.title}</h3>
              <p className="mt-2 text-sm text-neutral-600">{a.body}</p>
            </Card>
          ))}
        </div>
      </Section>
      <Section id="contact" className="text-center">
        <h2 className="text-2xl font-semibold tracking-tight">Talk to us</h2>
        <p className="mt-2 text-neutral-600">(303) 555-0142 · hello@harlancole.example</p>
      </Section>
    </div>
  );
}
`,
  },
  {
    name: "Mesa Verde",
    app: `import { Section } from "./components/ui/Section";
import { Button } from "./components/ui/Button";
import { Nav } from "./components/ui/Nav";

const MENU = [
  { name: "Street Tacos", price: "$4" },
  { name: "Carne Asada Plate", price: "$16" },
  { name: "House Margarita", price: "$11" },
];

export default function App() {
  return (
    <div className="min-h-screen bg-[#fff8f0] text-[#2a1810]">
      <Nav className="border-orange-100 bg-[#fff8f0]/80">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <span className="text-lg font-semibold tracking-tight">Mesa Verde</span>
          <span className="text-sm text-orange-800">Tue–Sun, 5pm–11pm</span>
        </div>
      </Nav>
      <Section className="text-center">
        <p className="text-xs font-medium uppercase tracking-widest text-orange-700">Modern Mexican · Austin</p>
        <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">Tacos worth the drive.</h1>
        <Button className="mt-8 bg-orange-700 hover:bg-orange-800">Reserve a table</Button>
      </Section>
      <Section>
        <h2 className="text-center text-2xl font-semibold tracking-tight">Menu highlights</h2>
        <div className="mx-auto mt-8 max-w-md divide-y divide-orange-100">
          {MENU.map((m) => (
            <div key={m.name} className="flex items-center justify-between py-3">
              <span>{m.name}</span>
              <span className="text-orange-800">{m.price}</span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
`,
  },
  {
    name: "FlowTrack",
    app: `import { Section } from "./components/ui/Section";
import { Card } from "./components/ui/Card";
import { Button } from "./components/ui/Button";
import { Nav } from "./components/ui/Nav";

const FEATURES = [
  { title: "Kanban boards", body: "Drag, drop, done — no status meeting required." },
  { title: "Async updates", body: "Daily progress without another calendar invite." },
  { title: "Time zone aware", body: "Deadlines that make sense wherever your team is." },
];

export default function App() {
  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <Nav>
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <span className="text-lg font-semibold tracking-tight text-blue-700">FlowTrack</span>
          <Button variant="secondary">Sign in</Button>
        </div>
      </Nav>
      <Section className="text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Ship faster, together.</h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-neutral-600">Project management built for remote teams who are done with status meetings.</p>
        <Button className="mt-8 bg-blue-600 hover:bg-blue-700">Start free trial</Button>
      </Section>
      <Section>
        <div className="grid gap-6 sm:grid-cols-3">
          {FEATURES.map((f) => (
            <Card key={f.title}>
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-neutral-600">{f.body}</p>
            </Card>
          ))}
        </div>
      </Section>
    </div>
  );
}
`,
  },
  {
    name: "Maren Lucas Photography",
    app: `import { Section } from "./components/ui/Section";
import { Button } from "./components/ui/Button";
import { Nav } from "./components/ui/Nav";

export default function App() {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-50">
      <Nav className="border-neutral-800 bg-neutral-950/80">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <span className="text-lg font-semibold tracking-tight">Maren Lucas</span>
          <span className="text-sm text-neutral-400">Portland, OR</span>
        </div>
      </Nav>
      <Section className="text-center">
        <p className="text-xs font-medium uppercase tracking-widest text-neutral-400">Wedding &amp; portrait photography</p>
        <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">Moments, held onto.</h1>
        <Button className="mt-8 bg-white text-neutral-900 hover:bg-neutral-200">Book a session</Button>
      </Section>
      <Section>
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="aspect-square rounded-lg bg-neutral-800" />
          ))}
        </div>
      </Section>
    </div>
  );
}
`,
  },
  {
    name: "Northlane Digital",
    app: `import { Section } from "./components/ui/Section";
import { Card } from "./components/ui/Card";
import { Button } from "./components/ui/Button";
import { Nav } from "./components/ui/Nav";

const SERVICES = ["SEO", "Paid Media", "Content Strategy"];

export default function App() {
  return (
    <div className="min-h-screen bg-[#0b0e2c] text-white">
      <Nav className="border-indigo-900 bg-[#0b0e2c]/80">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <span className="text-lg font-semibold tracking-tight">Northlane Digital</span>
          <Button className="bg-indigo-600 hover:bg-indigo-500">Get started</Button>
        </div>
      </Nav>
      <Section className="text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Performance-driven marketing.</h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-indigo-200">We grow revenue, not vanity metrics.</p>
      </Section>
      <Section>
        <div className="grid gap-6 sm:grid-cols-3">
          {SERVICES.map((s) => (
            <Card key={s} className="border-indigo-800 bg-[#111539]">
              <h3 className="font-semibold text-white">{s}</h3>
            </Card>
          ))}
        </div>
      </Section>
    </div>
  );
}
`,
  },
];

async function seedOne(site: Site) {
  const sourceFiles: FileMap = {
    ...FOUNDATION_FILES,
    "src/App.tsx": site.app,
    "src/components/ui/Nav.tsx": NAV,
  };

  const project = await db.project.create({
    data: { userId: TARGET_USER_ID, name: site.name, slug: slugify(site.name) },
  });

  await db.projectFile.createMany({
    data: Object.entries(sourceFiles).map(([path, content]) => ({
      projectId: project.id,
      path,
      content,
      published: false,
      kind: "source",
    })),
  });

  const compiled = await buildSite(sourceFiles);
  await db.projectFile.createMany({
    data: Object.entries(compiled).map(([path, content]) => ({
      projectId: project.id,
      path,
      content,
      published: false,
      kind: "build",
    })),
  });

  await db.message.create({
    data: { projectId: project.id, role: "user", content: `Build a site for ${site.name}` },
  });
  await db.message.create({
    data: { projectId: project.id, role: "assistant", content: `Built ${site.name} — seeded test content, not an AI generation (no credits charged).` },
  });

  await db.build.create({
    data: {
      projectId: project.id,
      status: "SUCCEEDED",
      model: "seed-fixture",
      prompt: `[free test fixture] ${site.name}`,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      creditsCharged: 0,
      filesSnapshot: { source: sourceFiles, build: compiled },
      endedAt: new Date(),
    },
  });

  console.log(`seeded: ${site.name} -> /projects/${project.id}`);
}

async function main() {
  for (const site of SITES) {
    await seedOne(site);
  }
  await db.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
