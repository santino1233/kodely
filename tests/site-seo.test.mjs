// lib/site-seo.ts — the serve-time SEO backstop for published sites.
//
// Note what is NOT here: the og:title entity round trip. It is still broken,
// so its test lives in tests/open-bugs.test.mjs with the evidence.

import test from "node:test";
import assert from "node:assert/strict";

import { applySeo, pageUrl, robotsTxt, siteBaseUrl, sitemapXml } from "../lib/site-seo.ts";

const doc = (head, body = "<p>hello</p>") =>
  `<!doctype html><html lang="en"><head>${head}</head><body>${body}</body></html>`;

const req = (host) => new Request("http://internal.invalid/", { headers: { host } });

/** The value of one attribute on the first tag matching `re`. */
function attr(html, re, name) {
  const tag = html.match(re);
  if (!tag) return null;
  return tag[0].match(new RegExp(`${name}=["']([^"']*)["']`, "i"))?.[1] ?? null;
}

const ogTitle = (html) => attr(html, /<meta\s+property=["']og:title["'][^>]*>/i, "content");
const ogUrl = (html) => attr(html, /<meta\s+property=["']og:url["'][^>]*>/i, "content");
const ogImage = (html) => attr(html, /<meta\s+property=["']og:image["'][^>]*>/i, "content");
const description = (html) => attr(html, /<meta\s+name=["']description["'][^>]*>/i, "content");
const canonical = (html) => attr(html, /<link\s+rel=["']canonical["'][^>]*>/i, "href");
const title = (html) => html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? null;

// ── siteBaseUrl ────────────────────────────────────────────────────────────

test("siteBaseUrl: a branded subdomain lives at the host root", () => {
  assert.equal(siteBaseUrl(req("bloom.kodely.site"), "bloom"), "https://bloom.kodely.site");
});

test("siteBaseUrl: anything else is served under /api/site/<slug>", () => {
  assert.equal(siteBaseUrl(req("staging.kodely.me"), "bloom"), "https://staging.kodely.me/api/site/bloom");
});

test("siteBaseUrl: only loopback is http — never trust x-forwarded-proto", () => {
  // Cloudflare terminates TLS at the edge and talks to the origin over plain
  // HTTP, so a forwarded proto of "http" is a lie for every real visitor. This
  // emitted http:// og:url on https-only sites, and Automatic HTTPS Rewrites
  // repaired the canonical but not the OG tag, so only the OG tag stayed wrong.
  const forwarded = new Request("http://internal.invalid/", {
    headers: { host: "bloom.kodely.site", "x-forwarded-proto": "http" },
  });
  assert.ok(siteBaseUrl(forwarded, "bloom").startsWith("https://"));

  for (const local of ["localhost:3000", "127.0.0.1:3000", "localhost"]) {
    assert.ok(siteBaseUrl(req(local), "bloom").startsWith("http://"), local);
  }
});

test("siteBaseUrl: the port is kept, because that is where the visitor is", () => {
  assert.equal(siteBaseUrl(req("localhost:3000"), "b"), "http://localhost:3000/api/site/b");
});

test("siteBaseUrl: a lookalike suffix is not treated as a branded subdomain", () => {
  // "notkodely.site" ends with "kodely.site" but not with ".kodely.site".
  assert.equal(siteBaseUrl(req("notkodely.site"), "b"), "https://notkodely.site/api/site/b");
});

// ── pageUrl ────────────────────────────────────────────────────────────────

test("pageUrl: the home page is the base URL itself", () => {
  assert.equal(pageUrl("https://b.kodely.site", "index.html"), "https://b.kodely.site");
  assert.equal(pageUrl("https://b.kodely.site/", "/index.html"), "https://b.kodely.site");
});

test("pageUrl: a page is its extensionless path", () => {
  assert.equal(pageUrl("https://b.kodely.site", "about.html"), "https://b.kodely.site/about");
  assert.equal(
    pageUrl("https://b.kodely.site", "services/boilers.html"),
    "https://b.kodely.site/services/boilers",
  );
});

test("pageUrl: a directory index collapses onto the directory", () => {
  assert.equal(pageUrl("https://b.kodely.site", "blog/index.html"), "https://b.kodely.site/blog");
});

test("pageUrl: the path form keeps its /api/site/<slug> prefix", () => {
  assert.equal(
    pageUrl("https://staging.kodely.me/api/site/b", "about.html"),
    "https://staging.kodely.me/api/site/b/about",
  );
});

// ── applySeo: leave the builder's work alone ───────────────────────────────

test("applySeo: a fragment with no <head> is returned untouched", () => {
  const fragment = "<div><h1>hi</h1></div>";
  assert.equal(applySeo(fragment, { projectName: "P", baseUrl: "https://p.kodely.site" }), fragment);
});

test("applySeo: a real title the builder wrote is preserved", () => {
  const html = doc("<title>Bloom Pilates — Reformer studio in Denver</title>");
  const out = applySeo(html, { projectName: "Bloom Pilates", baseUrl: "https://b.kodely.site" });
  assert.equal(title(out), "Bloom Pilates — Reformer studio in Denver");
});

test("applySeo: tags the builder already filled in are not overwritten", () => {
  const html = doc(
    `<title>Real Title</title>` +
      `<meta name="description" content="A description with real content in it." />` +
      `<meta property="og:title" content="Custom OG" />`,
  );
  const out = applySeo(html, { projectName: "P", baseUrl: "https://p.kodely.site" });
  assert.equal(description(out), "A description with real content in it.");
  assert.equal(ogTitle(out), "Custom OG");
});

// ── applySeo: fill the gaps ────────────────────────────────────────────────

test("applySeo: the foundation placeholder is replaced by the project name", () => {
  // Every site shipped as "Kodely Site" before this existed — in the browser
  // tab, in Google, and in every link preview.
  const out = applySeo(doc("<title>Kodely Site</title>"), {
    projectName: "Bloom Pilates",
    baseUrl: "https://b.kodely.site",
  });
  assert.equal(title(out), "Bloom Pilates");
  assert.ok(!out.includes("Kodely Site"));
});

test("applySeo: a missing <title> is injected", () => {
  const out = applySeo(doc('<meta charset="utf-8" />'), {
    projectName: "Bloom Pilates",
    baseUrl: "https://b.kodely.site",
  });
  assert.equal(title(out), "Bloom Pilates");
});

test("applySeo: an empty <title> counts as missing", () => {
  const out = applySeo(doc("<title>   </title>"), { projectName: "Bloom", baseUrl: "https://b.kodely.site" });
  assert.equal(title(out), "Bloom");
});

test("applySeo: scaffolding with an empty content= is filled, not left forever", () => {
  // The foundation ships empty content="" to show the builder what to write,
  // so an existence-only check would leave those blank on every published site.
  const out = applySeo(
    doc(`<title>Bloom</title><meta name="description" content="" /><meta property="og:url" content="" />`),
    { projectName: "Bloom", baseUrl: "https://b.kodely.site" },
  );
  assert.equal(description(out), "Bloom — built with Kodely.");
  assert.equal(ogUrl(out), "https://b.kodely.site");
});

test("applySeo: the full tag set is present after one pass", () => {
  const out = applySeo(doc("<title>Bloom</title>"), { projectName: "Bloom", baseUrl: "https://b.kodely.site" });
  assert.equal(description(out), "Bloom — built with Kodely.");
  assert.equal(canonical(out), "https://b.kodely.site");
  assert.equal(ogUrl(out), "https://b.kodely.site");
  assert.match(out, /<meta property="og:type" content="website" \/>/);
  assert.match(out, /<meta name="twitter:card" content="summary_large_image" \/>/);
  // Injected inside the head, not after it.
  assert.ok(out.indexOf('rel="canonical"') < out.indexOf("</head>"));
});

test("applySeo: a subpage canonicalises to ITSELF, not to the home page", () => {
  // THE THING MULTI-PAGE RESTS ON. canonical and og:url used to be baseUrl
  // unconditionally, which was harmless while every site was one page. On a
  // multi-page site it tells Google that /about, /services and /contact are all
  // really the home page — an instruction to drop every extra page from the
  // index, i.e. the exact opposite of why anyone wanted multi-page.
  const out = applySeo(doc("<title>About — Bloom</title>"), {
    projectName: "Bloom",
    baseUrl: "https://b.kodely.site",
    pageUrl: "https://b.kodely.site/about",
  });
  assert.equal(canonical(out), "https://b.kodely.site/about");
  assert.equal(ogUrl(out), "https://b.kodely.site/about");
});

test("applySeo: without a pageUrl the base is still used", () => {
  // A single-page site, and every caller that predates multi-page.
  const out = applySeo(doc("<title>Bloom</title>"), {
    projectName: "Bloom",
    baseUrl: "https://b.kodely.site",
  });
  assert.equal(canonical(out), "https://b.kodely.site");
  assert.equal(ogUrl(out), "https://b.kodely.site");
});

test("applySeo: empty canonical/og:url scaffolding is filled with the page URL", () => {
  const out = applySeo(
    doc(`<title>About</title><link rel="canonical" href="" /><meta property="og:url" content="" />`),
    { projectName: "Bloom", baseUrl: "https://b.kodely.site", pageUrl: "https://b.kodely.site/about" },
  );
  assert.equal(canonical(out), "https://b.kodely.site/about");
  assert.equal(ogUrl(out), "https://b.kodely.site/about");
});

test("applySeo: is still idempotent per page", () => {
  const opts = {
    projectName: "Bloom",
    baseUrl: "https://b.kodely.site",
    pageUrl: "https://b.kodely.site/about",
  };
  const once = applySeo(doc("<title>About</title>"), opts);
  assert.equal(applySeo(once, opts), once);
});

// ── applySeo: escaping and the entity round trip ───────────────────────────

test("applySeo: the fallback description does not double-escape an encoded title", () => {
  // THE REGRESSION. The title is read back out of <title>…</title>, where it
  // is ALREADY encoded — "Bloom & Co" is stored as "Bloom &amp; Co". Composing
  // the description from that and escaping again produced "Bloom &amp;amp; Co"
  // and the literal entity showed up in every link preview.
  const out = applySeo(doc("<title>Bloom &amp; Co</title>"), {
    projectName: "Ignored",
    baseUrl: "https://b.kodely.site",
  });
  assert.equal(description(out), "Bloom &amp; Co — built with Kodely.");
  assert.ok(!description(out).includes("&amp;amp;"), "the description double-escaped the ampersand");
});

test("applySeo: a raw project name IS escaped exactly once", () => {
  // The other direction: projectName has not been through HTML, so it needs
  // one pass of escaping and no decode.
  const out = applySeo(doc("<title>Kodely Site</title>"), {
    projectName: "Bloom & Co",
    baseUrl: "https://b.kodely.site",
  });
  assert.equal(title(out), "Bloom &amp; Co");
  assert.equal(description(out), "Bloom &amp; Co — built with Kodely.");
  assert.ok(!out.includes("&amp;amp;"));
});

test("applySeo: applying twice changes nothing", () => {
  // It rewrites on READ, so the same document goes through it on every single
  // request. A non-idempotent pass would compound with every page view.
  for (const head of [
    "<title>Bloom &amp; Co</title>",
    "<title>Kodely Site</title>",
    '<meta charset="utf-8" />',
    `<title>Bloom</title><meta name="description" content="" />`,
    `<title>Bloom</title><meta property="og:image" content="/hero.png" />`,
  ]) {
    const opts = { projectName: "Bloom & Co", baseUrl: "https://b.kodely.site" };
    const once = applySeo(doc(head), opts);
    assert.equal(applySeo(once, opts), once, `not idempotent for head: ${head}`);
  }
});

test("applySeo: a relative og:image is absolutised, an absolute one is left alone", () => {
  const opts = { projectName: "Bloom", baseUrl: "https://b.kodely.site" };
  assert.equal(
    ogImage(applySeo(doc(`<title>B</title><meta property="og:image" content="/hero.png" />`), opts)),
    "https://b.kodely.site/hero.png",
  );
  assert.equal(
    ogImage(applySeo(doc(`<title>B</title><meta property="og:image" content="hero.png" />`), opts)),
    "https://b.kodely.site/hero.png",
  );
  assert.equal(
    ogImage(applySeo(doc(`<title>B</title><meta property="og:image" content="https://cdn.example/x.png" />`), opts)),
    "https://cdn.example/x.png",
  );
  assert.equal(
    ogImage(applySeo(doc(`<title>B</title><meta property="og:image" content="data:image/png;base64,AA" />`), opts)),
    "data:image/png;base64,AA",
  );
});

test("applySeo: absolutising never doubles the slash", () => {
  const out = applySeo(doc(`<title>B</title><meta property="og:image" content="/hero.png" />`), {
    projectName: "B",
    baseUrl: "https://b.kodely.site/",
  });
  assert.equal(ogImage(out), "https://b.kodely.site/hero.png");
});

// ── robots.txt ─────────────────────────────────────────────────────────────

test("robotsTxt: allows everything and points at the sitemap", () => {
  assert.equal(
    robotsTxt("https://b.kodely.site"),
    "User-agent: *\nAllow: /\n\nSitemap: https://b.kodely.site/sitemap.xml\n",
  );
});

test("robotsTxt: a trailing slash on the base does not double up", () => {
  assert.ok(robotsTxt("https://b.kodely.site/").includes("https://b.kodely.site/sitemap.xml"));
  assert.ok(!robotsTxt("https://b.kodely.site/").includes("//sitemap.xml"));
});

// ── sitemap.xml ────────────────────────────────────────────────────────────

test("sitemapXml: index.html maps to the base URL itself", () => {
  const xml = sitemapXml("https://b.kodely.site", ["index.html"]);
  assert.match(xml, /<loc>https:\/\/b\.kodely\.site<\/loc>/);
  assert.ok(!xml.includes("index.html"));
});

// CONTRACT CHANGE, with multi-page. A page's <loc> is now its EXTENSIONLESS
// URL — about.html is listed as /about — because that is the URL the site route
// answers and the URL applySeo stamps into that page's canonical tag. Listing
// /about.html while the page there canonicalises to /about would tell Google
// two different things about the same document, and it resolves that by
// dropping the sitemap URL. Same reason pageUrl() is one exported function
// rather than two similar-looking regexes in two files.
test("sitemapXml: other pages hang off the base, extensionless, with one slash", () => {
  const xml = sitemapXml("https://b.kodely.site/", ["about.html", "/pricing.html"]);
  assert.match(xml, /<loc>https:\/\/b\.kodely\.site\/about<\/loc>/);
  assert.match(xml, /<loc>https:\/\/b\.kodely\.site\/pricing<\/loc>/);
  assert.ok(!xml.includes(".html"));
  assert.ok(!xml.includes("site//"));
});

test("sitemapXml: one entry per page, for a real multi-page site", () => {
  const xml = sitemapXml("https://b.kodely.site", [
    "index.html",
    "about.html",
    "services.html",
    "services/boilers.html",
    "contact.html",
  ]);
  assert.equal(xml.match(/<loc>/g).length, 5);
  for (const loc of ["", "/about", "/services", "/services/boilers", "/contact"]) {
    assert.ok(xml.includes(`<loc>https://b.kodely.site${loc}</loc>`), loc || "(root)");
  }
});

test("sitemapXml: a directory index is the directory, not /blog/index", () => {
  const xml = sitemapXml("https://b.kodely.site", ["blog/index.html"]);
  assert.match(xml, /<loc>https:\/\/b\.kodely\.site\/blog<\/loc>/);
  assert.ok(!xml.includes("index"));
});

test("sitemapXml: duplicates collapse to one <url>", () => {
  const xml = sitemapXml("https://b.kodely.site", ["about.html", "about.html", "/about.html"]);
  assert.equal(xml.match(/<loc>/g).length, 1);
});

test("sitemapXml: two spellings of the same page collapse to one <url>", () => {
  // about.html and about/index.html are the same address. Listing both would
  // put the site's own duplicate content in its own sitemap.
  const xml = sitemapXml("https://b.kodely.site", ["about.html", "about/index.html"]);
  assert.equal(xml.match(/<loc>/g).length, 1);
});

test("sitemapXml: locs are XML-escaped, apostrophes included", () => {
  const xml = sitemapXml("https://b.kodely.site", ["a&b.html", "o'neill.html"]);
  assert.match(xml, /<loc>https:\/\/b\.kodely\.site\/a&amp;b<\/loc>/);
  assert.match(xml, /<loc>https:\/\/b\.kodely\.site\/o&apos;neill<\/loc>/);
  // A bare ampersand inside <loc> would make the document unparseable.
  assert.ok(!/&(?!amp;|apos;|quot;|lt;|gt;)/.test(xml));
});

test("sitemapXml: lastmod is a date, and is omitted when not supplied", () => {
  const withMod = sitemapXml("https://b.kodely.site", ["index.html"], new Date("2026-01-02T03:04:05Z"));
  assert.match(withMod, /<lastmod>2026-01-02<\/lastmod>/);
  assert.ok(!sitemapXml("https://b.kodely.site", ["index.html"]).includes("lastmod"));
});

test("sitemapXml: a site with no pages is still a well-formed urlset", () => {
  const xml = sitemapXml("https://b.kodely.site", []);
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(xml, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.match(xml, /<\/urlset>\s*$/);
  assert.ok(!xml.includes("<url>"));
});
