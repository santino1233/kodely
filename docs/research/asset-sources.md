# Free asset sources for customer sites — licence review

**Date of review: 2026-08-22.** Every claim below was checked against the live
licence page (and, where one exists, the separate API terms) on that date.
Licences change; re-verify before shipping and again at least annually.

**I am not a lawyer, and neither is the owner of this project.** This document
is engineering due diligence, not legal advice. Three findings in it
(§3 Pexels, §3 Pixabay, §3 Mixkit) turn on a question — *is the customer's
published site a "third party" that needs its own licence?* — that only a
lawyer should answer. Nothing here should be built without that answer.

---

## 1. What the six axes mean here

Kodely is not a designer downloading a photo for one project. Kodely is a
machine that hands asset files to strangers' commercial websites, at volume,
forever. Almost every "free" licence on the internet was written for the first
case. The axes below exist to find out what each licence says about the second.

| # | Axis | Why it decides things |
|---|------|-----------------------|
| 1 | **Self-host** | Generated sites run under `default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; frame-ancestors 'self'; form-action 'self'; base-uri 'none'; object-src 'none'` — `SANDBOX_CSP`, `app/api/site/[slug]/[[...path]]/route.ts:74-75`. No external image host. A source that forbids downloading and re-serving is unusable without widening the CSP, which is a security decision, not an asset decision. Hotlinking is not a workaround: it needs the same CSP change *and* leaks every visitor's IP to a third party. |
| 2 | **Attribution** | Checked **twice** per source — once in the licence, once in the API terms. Attribution means our supplier's branding in our customer's footer. |
| 3 | **3rd-party commercial** | Our customers are businesses. Several licences permit commercial use *by the downloader* and say nothing about the person the file is handed to. |
| 4 | **Redistribution / picker** | "Don't put this on another stock platform" clauses. Embedding one image in one generated site and exposing a searchable library inside Kodely are different acts under most of these licences. |
| 5 | **API + limits** | A 200/hour ceiling is a real cap on build throughput. |
| 6 | **Verified?** | Whether I actually read the page, or was blocked. |

---

## 2. The table

| Source | 1. Self-host | 2. Attribution (licence / API) | 3. 3rd-party commercial | 4. Redistribution / picker | 5. API + limits | 6. Verified | Verdict |
|---|---|---|---|---|---|---|---|
| **pexels.com** | Yes — download/modify permitted. **Bulk pre-scraping prohibited.** | No / **Yes — "prominent link to Pexels" on any API request** | Permitted, but no express sublicence grant → ambiguous | No selling/redistributing on other stock or wallpaper platforms; "may not replicate core functionality of Pexels" | Yes. 200/hr, 20,000/mo; higher on request | Full | **USE WITH CONDITIONS** |
| **pixabay.com** | **Required** — permanent hotlinking is forbidden, "download them to your server first" | No / soft — "show your users where the images and videos are from, whenever search results are displayed" | Permitted, no express sublicence grant → ambiguous | No standalone distribution incl. via a stock media platform; no compiling Content to replicate a competing service; **bulk/systematic copying prohibited** | Yes. 100 req/60s, responses must be cached 24h | Full | **USE WITH CONDITIONS** |
| **unsplash.com** | Licence: yes. **API: no — hotlinking is mandatory** | No / **Yes — attribute Unsplash + photographer + link, with UTM** | Licence permits it | No compiling images "to replicate a similar or competing service" | Yes. Demo 50/hr, Production 1,000/hr; download-event ping required | Full (licence, API terms, API guidelines, docs); site ToS **blocked** | **AVOID as an integration** (see §3) |
| **vecteezy.com** | Free licence: yes | **Yes — mandatory** / n/a | **No** — "licensed to an individual user" | **Prohibited outright**: no sublicence "as stock, in a tool or template"; "Using Content within software applications which allow a third party to generate on-demand designs is also not permitted" | Not evaluated — moot | Full | **AVOID** |
| **kaboompics.com** | Yes | No / n/a | Yes for client work and templates | **"Can I put the images in our website builder, plugin (or any other app) for our users? It is possible but requires individual negotiations."** | No API found | Full | **AVOID until written permission** (worth asking — one owner, direct contact) |
| **mixkit.co** | Yes — "download, copy, modify, distribute … sub-licensable" | No / n/a | Licence says sub-licensable; **User Terms contradict it** | User Terms forbid making an Item "available to any third party", "aggregate or collate an Item(s) and make available on a stock or inventory basis", and building "a similar or competitive product" | No public API | Full (licence modals + User Terms) | **AVOID** (internally contradictory → legal review) |
| **coverr.co** | Yes | No / n/a | **No** | **Explicitly names us**: content may not be "resold or offered as part of services … stock video sites, **website builders**, themes providers, mobile apps builders" | No | Full | **AVOID — unambiguous** |
| **dareful.com** | Yes | **Yes — CC BY 4.0 attribution is a licence condition** / n/a | Yes — CC licences run to downstream recipients | CC BY permits redistribution | No API | Partial — licence stated on site as CC BY 4.0; `/license/` is 404 | **USE WITH CONDITIONS** |
| **iconoop.com** | Yes | Six of seven sets: no. Emoji (Twemoji): **CC-BY 4.0, credit required** | Yes — "free for commercial use, including inside paid products and client work" | Upstream licences permit it | No | Full (homepage licence statement) | **USE — but source upstream, not from iconoop** |
| **svgrepo.com** | Unknown | Unknown | Unknown | Unknown | Unknown | **BLOCKED — could not verify** | **AVOID pending verification** |
| **iconsatlas.com** | Yes | No (MIT) | Yes | Permitted | No | Full | **USE** |
| **getillustrations.com** | Yes | **Free illustrations: visible credit required** / paid: none | **Free tier excludes client projects**; paid Standard permits them | Free: no. Standard: products for sale, ≤500 assets/design. Extended: full packs | Yes — 1,500 calls/mo incl.; Pro 300k for $49/mo | Full | **AVOID free tier; paid only if we buy it** |
| **github.com/Make-md/svg-packs** | Yes | Mixed — Font Awesome and coolicons are **CC BY 4.0** | Depends on pack | Depends on pack | n/a | Full (API metadata + README + tree) | **AVOID the mirror; vendor upstream** |
| **github.com/Kimbatt/cc0-textures** | n/a — **torrents, not files** | README claims CC0 | Unclear | Unclear | n/a | Full (repo has **no LICENSE file**) | **AVOID** |

---

## 3. Per-source detail

### pexels.com — USE WITH CONDITIONS

- **Licence** (<https://www.pexels.com/license/>): "All photos and videos on
  Pexels are free to use", "Attribution is not required", "You can modify the
  photos and videos". Not allowed: "Don't sell unaltered copies", "Don't
  redistribute or sell the photos and videos on other stock photo or wallpaper
  platforms", no trademark use, no implied endorsement.
- **API guidelines** (<https://www.pexels.com/api/documentation/#guidelines>) —
  *this is the trap, and it is real*: "Whenever you are doing an API request
  make sure to show a **prominent link to Pexels**." Also "You may not copy or
  replicate core functionality of Pexels", and 200 requests/hour, 20,000/month,
  raisable on request "given that you've implemented the API properly".
- **Terms of Service** (<https://www.pexels.com/terms-of-service/>): "Bulk,
  large-scale or systematic copying of Content is strictly prohibited unless
  explicit permission has been granted by us", and data mining / scraping is
  "strictly prohibited for all unauthorised purposes". **So a pre-scraped local
  Pexels library is out.** On-demand API fetch per build is the only compliant
  route.
- **Reading of the attribution clause.** The obligation attaches to "doing an
  API request". Kodely makes the API request in the builder; the customer's
  published site makes none. The defensible reading is a Pexels credit in the
  Kodely picker UI. It is *not* certain that the published site is exempt, and
  Pexels can decide what "proper implementation" means when we ask for a higher
  rate limit. Treat the builder-side credit as required and the site-side credit
  as an open question for legal.
- **The unresolved bit**: the licence grants rights to the user of the site; it
  never says the downloader may sublicense to someone else. See §5.

### pixabay.com — USE WITH CONDITIONS (best technical fit)

- **Content License** (<https://pixabay.com/service/license-summary/> and the
  binding full text at <https://pixabay.com/service/terms/> §5): "an
  irrevocable, worldwide, perpetual … non-exclusive and royalty-free right to
  download, use, copy, modify or adapt the Content for commercial or
  non-commercial purposes." No attribution required. Content published before
  9 January 2019 is CC0.
- **Prohibited Uses** (terms §5): no selling or distributing Content "on a
  Standalone basis … including through a stock media platform"; no commercial
  use of Content containing recognisable trademarks/logos/brands; no misleading
  use; no use as a trade mark. Elsewhere in the ToS: no "bulk, large-scale or
  systematic copying", and you may not "use or compile any Content to replicate
  a similar or competing service".
- **API docs** (<https://pixabay.com/api/docs/>) — the standout finding:
  "permanent hotlinking of images (using Pixabay URLs in your app) is **not
  allowed**. If you intend to use the images, please download them to your
  server first." Pixabay's own rules *require* the architecture our CSP
  already forces. Rate limit 100 requests per 60 seconds; "requests must be
  cached for 24 hours"; "systematic mass downloads are not allowed".
- **Attribution**: "If you make use of the API, show your users where the images
  and videos are from, whenever search results are displayed. That's the one
  thing we kindly request." Bound to *search results*, i.e. the builder UI. It
  is phrased as a request, not a condition of the licence grant.
- Same unresolved sublicence question as Pexels (§5).

### unsplash.com — AVOID as an integration

- **Licence** (<https://unsplash.com/license>) is genuinely permissive:
  "irrevocable, nonexclusive, worldwide copyright license to download, copy,
  modify, distribute, perform, and use images … for free, including for
  commercial purposes, without permission from or attributing the photographer
  or Unsplash." Restrictions: no selling unmodified copies, and no "compiling
  photos from Unsplash to replicate a similar or competing service".
- **API terms** (<https://unsplash.com/api-terms>) and **guidelines**
  (<https://help.unsplash.com/en/articles/2511245-unsplash-api-guidelines>)
  reverse that for anyone using the API:
  - "All API uses must use the hotlinked image URLs returned by the API" —
    **self-hosting is forbidden on the API path**;
  - "each time you or your Developer App displays an Image, your Developer App
    must attribute Unsplash, the Unsplash photographer, and contain a link back
    to the photographer's Unsplash profile", with `utm` parameters;
  - a download-event ping to `/photos/:id/download` on every use;
  - Demo 50 req/hr, Production 1,000 req/hr
    (<https://unsplash.com/documentation>).
- **Conclusion**: the API is structurally incompatible with `img-src 'self'`,
  and complying would put Unsplash + photographer branding on every customer's
  page. Going around the API — bulk-downloading from the website — very likely
  breaches Unsplash's site terms; I could not verify that page (blocked, §6),
  which is itself a reason not to rely on the workaround. A small hand-picked
  set, downloaded by a human, is licence-clean; an integration is not.

### vecteezy.com — AVOID

The Vecteezy License Agreement (<https://www.vecteezy.com/licensing-agreement>,
updated 22 June 2026) closes this from three directions:

- Free License: "Attribution is required. Content is licensed to an individual
  user … Content may not be used on products for resale."
- Sub-licensing: "You may not sublicense, resell, share, transfer, or otherwise
  redistribute the Content (e.g., as stock, **in a tool or template**, as source
  files, etc.), **not even for free**."
- No Content Extraction: "**Using Content within software applications which
  allow a third party to generate on-demand designs is also not permitted.**"

That last sentence is a description of Kodely. Even paid Pro tiers are subject
to it.

### kaboompics.com — AVOID until written permission

The Standard Licence (<https://kaboompics.com/page/license-and-faq>) is one of
the friendliest reviewed: commercial use, no attribution, "You may also use
Kaboompics photos as part of templates or mockups for your clients", explicit
permission for placeholder images in HTML/WordPress templates that are sold.
But the FAQ answers our exact question directly: **"Can I put the images in our
website builder, plugin (or any other app) for our users? It is possible but
requires individual negotiations."**

So the door is open but shut until someone walks through it. Single creator
(Karolina Grabowska), direct email contact on the page. Also note some photos
are "Editorial Use Only" and must never reach a commercial site — any
integration would need to filter on that flag.

### mixkit.co — AVOID (contradictory)

- **Free Licence** (fetched from `https://mixkit.co/license/modal/videoFree/`
  and `.../artFree/`, the endpoints the licence page's modal loads): "can be
  used in your commercial and non-commercial projects, for free. You're
  permitted to download, copy, modify, distribute, publicly perform and
  broadcast the Items. Your rights are non-exclusive, worldwide,
  **sub-licensable** and ongoing. Attribution is not required." Then: "There are
  some important limits to these rights, described in our User Terms."
- **User Terms** (<https://mixkit.co/terms/>) supply limits that contradict it:
  you must not "rent, license, sublicense, sell, resell or otherwise
  commercially exploit or make Mixkit or any Item available to any third
  party"; must not "aggregate or collate an Item(s) and make available on a
  stock or inventory basis"; must not "use Mixkit … or any Item, to build a
  similar or competitive product"; and these apply "even if you sub-license or
  transfer use of the Item to a third party".
- A licence that says *sub-licensable* and terms that say *not to any third
  party* cannot both be applied to our use. Ambiguous against us → do not build
  on it. Note also that Mixkit is Envato: there is a commercial route (Envato
  Elements) if video ever becomes a priority.

### coverr.co — AVOID

<https://coverr.co/license> is the only source that names the product category
outright: content may not be "resold or offered as part of services to which
providing videos can help. This applies to stock video sites, **website
builders**, themes providers, mobile apps builders and video editing services."
Also: no building "a service that is similar to or competes with Coverr.co", and
no AI-training use. Coverr explains it moved off CC0 precisely because other
sites redistributed its videos. No ambiguity, nothing to review.

### dareful.com — USE WITH CONDITIONS

Dareful releases its 4K stock video under **Creative Commons Attribution 4.0
International** (<https://creativecommons.org/licenses/by/4.0/>), stated on
<https://dareful.com/> with the requested credit format: "Video courtesy of
Dareful" with a link. CC BY is irrevocable, runs to every downstream recipient
(so the sublicence problem in §5 does not exist here), and permits self-hosting
and commercial use.

The cost is that attribution is a **condition of the licence**, not a courtesy:
drop the credit and the licence terminates. CC BY 4.0 allows the credit "in any
reasonable manner … appropriate to the medium", so a `/credits` page linked from
the footer is defensible, but the credit has to be on the customer's site, not
in our builder. Library is small (a few hundred clips) and there is no API.
`dareful.com/license/` returns 404 — the licence statement lives on the homepage
and item pages, which is weaker documentation than I would like.

### iconoop.com — USE, but source upstream

A clean aggregator of seven upstream open-source sets, each keeping its own
licence: Lucide (ISC), Tabler (MIT), Phosphor (MIT), Material Symbols
(Apache-2.0), Devicon (MIT), brand logos (CC0), emoji/Twemoji (CC-BY 4.0). Its
own summary: "Every collection here is free for commercial use, including
inside paid products and client work", and only the emoji "require a credit
line". SVG download, no account, no API.

Two conditions:
1. **Take the icons from the upstream repositories, not from iconoop.** The site
   does not identify its operator and publishes no terms; upstream repos give us
   pinned versions, real LICENSE files and a provenance trail.
2. **Brand logos are a trademark question, not a copyright one** — iconoop says
   so itself. A CC0 logo file does not give a customer the right to display
   another company's mark. Brand/logo icons must be excluded from anything the
   model can place autonomously.

### svgrepo.com — AVOID pending verification

**Could not verify.** `svgrepo.com/page/licensing/` and the site root returned
HTTP 429 behind a Vercel security checkpoint on every attempt (direct fetch,
browser user-agent, and a text-extraction proxy). Third-party summaries say the
library mixes CC0, MIT, **GPL** and CC BY per icon, with the licence shown on
each icon's page — but I did not read that from the source and will not treat it
as established.

Two reasons to stay away even after verification: a GPL-licensed icon landing in
a customer's commercial site is a genuine problem, and per-icon licence metadata
maintained by an aggregator is exactly the kind of thing that is wrong 1% of the
time — which, at Kodely's volume, means it is wrong. If anyone wants it, the
prerequisite is: verify the page in a real browser, then ingest only icons whose
recorded licence is CC0/MIT/Apache-2.0/ISC, storing the licence string per icon.

### iconsatlas.com — USE

Atlas Icons is **MIT licensed** (<https://www.iconsatlas.com/license/>): "Use it
in personal, commercial, and open-source projects with no attribution required.
Modify, redistribute, and build on it freely." The one obligation MIT does
impose is that the copyright and permission notice travels with copies of the
files — satisfied by keeping the upstream LICENSE in our vendored copy and a
`NOTICES` entry; it does not need to appear on customer sites.

### getillustrations.com — AVOID the free tier

<https://www.getillustrations.com/license>. The free illustration licence
requires "a credit such as 'Illustrations by GetIllustrations.com' in your
footer or credits page" and the comparison table marks **client projects ✗** for
Free; the FAQ says the Free License "is limited to personal use". (The pricing
card on the same page says "Personal and commercial use" — a self-contradiction
on a single page, which resolves against us.) Paid **Standard** (from $195/yr,
$599 lifetime) does cover client work and products for sale, capped at 500
assets per design, with no attribution; **Extended** covers redistributing full
packs. There is an API (1,500 calls/month included, Pro 300k for $49/mo).

Their "free MIT icons" are re-hosted upstream open-source sets (Feather, Lucide,
Phosphor, Tabler, Bootstrap, Material Symbols) — and the page calls all of them
MIT, though Material Symbols is Apache-2.0. Another argument for going upstream.

### github.com/Make-md/svg-packs — AVOID the mirror, vendor upstream

- **The repository has no LICENSE file** (GitHub API reports `license: null`).
  The aggregation itself therefore carries no grant at all; only the per-pack
  LICENSE files preserved under `svg-originals/<pack>/` do any work.
- Contents are 19 upstream packs, and they are **not consistently licensed**:
  Apache-2.0 (Material Design Icons, Remix), MIT (Tabler, Heroicons, Phosphor,
  Bootstrap, Octicons, Eva, Boxicons, Feather, Icon Brew, CSS.gg, Radix,
  Zondicons), ISC (Lucide), CC0 (Simple Icons), Unlicense (System UIcons), and
  **CC BY 4.0 — attribution required — for Font Awesome (2,806 icons) and
  coolicons (442)**. Font Awesome Brands, Boxicons "logos" and Simple Icons are
  brand marks: copyright-clear, trademark-loaded.
- It is a one-star, single-snapshot mirror generated 2025-09-26 by a third
  party. There is no reason to take a supply-chain dependency on it when every
  pack has an upstream repo with releases and a real licence file.

### github.com/Kimbatt/cc0-textures — AVOID

- **No LICENSE file** (`license: null`). The README asserts CC0 and adds "These
  textures were not made by me, I just collected them for easy download" — an
  assertion by a collector is not a licence grant.
- Distribution is **torrent files**, not the images; last push July 2020.
- It aggregates four different sites (cc0textures.com — now ambientCG,
  texturehaven.com — now Poly Haven, cgbookcase.com, sharetextures.com), each
  with its own current terms. I did not verify any of them (out of scope of the
  named list), and sharetextures in particular I would not assume is CC0.
- If textures are ever wanted, go to ambientCG / Poly Haven / cgbookcase
  directly and verify each. Note that Kodely already synthesises textures,
  gradients and patterns as inline SVG/CSS in `lib/assets/patterns.ts`, which
  has zero licence surface and zero bytes over the wire.

---

## 4. Recommendation — build against these

**1. Pixabay (photos + video) — primary.**
The only source whose own API rules *require* the architecture our CSP forces:
"download them to your server first". 100 requests per 60 seconds is 60× the
Pexels ceiling. Attribution is a soft request tied to displaying search results,
i.e. our UI, not the customer's footer. Licence grant is irrevocable and
perpetual, so nothing we ship can be pulled out from under a customer later.

**2. Pexels (photos + video) — secondary, for quality and coverage.**
Better curation than Pixabay on a lot of business subject matter. Costs us a
visible "Photos provided by Pexels" link in the builder UI, and a 200/hr cap
that will need raising (they grant increases to implementations that attribute
properly — a reason to over-comply on the credit rather than hunt for the
minimum).

**3. Upstream open-source icon packs (Lucide, Tabler, Phosphor, Material
Symbols, Heroicons) — vendored, not fetched.**
This is what iconoop and iconsatlas are actually pointing at, minus the
aggregator risk. MIT/ISC/Apache-2.0, no attribution on customer sites, pinned
versions, licence files shipped in-repo. Excludes the CC BY packs (Font Awesome,
coolicons) and all brand-logo sets.

**Not recommended but cheap to unlock:** Kaboompics — one email to one person,
and its terms otherwise fit better than anything else on the list.
**Optional third for video:** Dareful, if a visible CC BY credit on customer
sites is acceptable. Decide that as a product question before building it.

**Illustrations and textures stay generated.** `lib/assets/illustrations.ts` and
`lib/assets/patterns.ts` already cover that ground with geometry that has no
licence, no host and no bytes. Nothing on the reviewed list beats "no licence at
all" for those two categories.

---

## 5. The single biggest legal risk

**Every one of these licences grants rights to the person who downloads the
file. None of the recommended ones expressly grants the right to sublicense
those rights onward to someone else.**

Pixabay: "when you download any Content … **we grant you** an irrevocable,
worldwide, perpetual … right to download, use, copy, modify or adapt the
Content". Pexels: "All photos and videos on Pexels are free to use", addressed
to the user of the site. Neither says "and you may pass this right to your
customers".

When Kodely puts a Pixabay photo into a plumber's website, who is the licensee —
Kodely, or the plumber? If it is Kodely, the plumber is displaying an image they
have no licence to, and Kodely has arguably distributed it to a third party. If
it is the plumber, then Kodely has to be acting as their agent, which needs to
be true in our terms of service, not just in spirit.

The sources that thought about this at all came down against us: Vecteezy
forbids "software applications which allow a third party to generate on-demand
designs"; Coverr names website builders explicitly; Kaboompics says it needs
"individual negotiations"; Mixkit's terms forbid making Items "available to any
third party". Four out of four of the sources that addressed the question said
no or not-without-a-deal. Pexels and Pixabay are usable *because they are
silent* — and silence is not permission.

**Mitigations to put in front of a lawyer**, not to self-approve:
1. Structure the download so the *customer* is the licensee and Kodely is their
   agent, and say so in Kodely's ToS, which should also pass the stock licences'
   restrictions (no resale as standalone files, no trademark use, no implied
   endorsement) through to the customer.
2. Keep a provenance record per asset per site — source, id, licence text,
   author, URL, timestamp — so any single image can be evidenced or removed.
3. Prefer Pixabay's pre-2019 CC0 content and CC0/MIT/Apache-2.0 vector assets
   where quality allows: for those, the sublicence question does not exist.

Second-order risks worth naming: **trademarks and identifiable people** in
photos (both Pexels and Pixabay put that responsibility on the user — no
model-release warranty flows to our customers, and Pixabay explicitly bans
commercial use of trademark-bearing content), and **bulk-copying bans** in both
Pexels' and Pixabay's ToS, which rule out building a local mirror of either
library.

---

## 6. What I could not verify

| Item | Why | Consequence |
|---|---|---|
| **svgrepo.com licensing page** | HTTP 429 / Vercel security checkpoint on every attempt, including a text proxy | Source is excluded. Everything said about it above is third-party report, not verified fact |
| **unsplash.com/terms** (site terms, as distinct from API terms) | Blocked by an anti-scraping challenge | Cannot state whether manual bulk download breaches their site terms. Assume it does |
| **Whether Pexels permits caching/storing downloaded files** | Neither licence nor API docs address storage | The licence permits use and modification, which implies keeping the file; not explicit |
| **Whether Pexels' "prominent link" obligation reaches the published site** | Wording ties it to "doing an API request"; unaddressed for downstream output | Treat builder-side credit as required, site-side as an open legal question |
| **Who operates iconoop.com; any terms of service** | No operator identified, no terms page found | Reason to use upstream repos rather than the site |
| **Current terms of ambientCG / Poly Haven / cgbookcase / sharetextures** | Out of scope of the named list | Any texture work needs a separate review |
| **Dareful's licence page** | `/license/` is 404; CC BY 4.0 stated on the homepage and item pages | Licence identification is confident, documentation is thin |

---

## 7. Architecture consequences (see the cards for the work)

1. **Do not widen the CSP.** Rejecting Unsplash's API is the price; `img-src
   'self' data:` with no external hosts is worth more than any one source.
2. **A photo needs a real delivery path**, which does not exist yet:
   `lib/assets/index.ts` says so in its own header — "Photography. Not 'not
   yet' — there is no host to serve it from". Downloaded binaries have to become
   files in the built site, served by the existing site route so `'self'`
   covers them.
3. **The model must select by id, never by content.** Referencing
   `photo:pixabay:1234567` costs a handful of tokens; a base64 hero image costs
   ~88,900 tokens and roughly $1 per build. The existing `find_assets` /
   `.kodely-assets/INDEX.md` seam (`lib/assets/materialize.ts`) is already
   shaped for this: search returns ids and one-line descriptions, and a
   post-generation pass resolves the ids into real files and rewrites `src`
   attributes.
4. **Budget the API calls.** Pexels 200/hr is a hard throughput ceiling on
   concurrent builds; Pixabay requires 24h response caching and forbids mass
   downloads. Both point at the same design: a shared, cached search layer, one
   download per distinct asset, content-addressed storage reused across sites.
