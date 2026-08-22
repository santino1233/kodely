# Kodely — Competitive Position

Synthesis of the 99 cards in the board's "Competitor Teardowns" column, checked
against what `kodely-prod` actually does today and against competitor pricing
re-verified on 2026-08-22.

**Scope discipline.** Every claim about Kodely below cites the code that backs
it. Every claim about a competitor is either verified against a primary source
on 2026-08-22 or explicitly marked unverified. Where a board card is now wrong,
it is listed in [§6](#6-board-cards-that-are-stale-or-wrong).

---

## 1. What Kodely actually is

Not a summary of the marketing — a summary of the code.

Kodely generates **one Vite + React + TypeScript + Tailwind single-page app**,
compiles it server-side, and serves the compiled output from its own
infrastructure under a CSP that blocks every external host.

| Dimension | Reality | Source |
|---|---|---|
| Output | One SPA. "Build distinct sections/routes as components conditionally rendered or scrolled to, not separate .html files." | `lib/agent.ts:51` |
| Dependencies | `react` + `react-dom` only. The agent cannot add packages; there is no per-generation install step. | `lib/foundation.ts:16-19`, `lib/agent.ts:55-57` |
| Backend | None. No DB, no auth, no API, no server functions for the generated site. | `prisma/schema.prisma` has no generated-app models; `lib/foundation.ts` |
| Network | `connect-src 'none'`. No fetch, no XHR, no CDN, no remote images, no web fonts. | `app/api/site/[slug]/[[...path]]/route.ts:28-29` |
| Forms | Explicitly forbidden to build one that appears functional. Uses `mailto:` / `tel:` / bracketed link-outs instead. | `lib/agent.ts:92-101` |
| Images | Inline SVG, CSS gradients, `data:` URIs, and a ~460-item built-in catalogue. No uploads, no stock. | `lib/agent.ts:58-63` |
| Hosting | First-party. Published at `https://<slug>.kodely.site` behind Cloudflare. | `proxy.ts:33-34`, `lib/site-seo.ts:30-53` |
| Custom domains | **None.** Zero occurrences of `customDomain` / `cname` anywhere in `lib/`, `app/`, or `prisma/`. | grep, 2026-08-22 |
| Model | `claude-sonnet-5` at `high` effort for a first build, `medium` for an edit. Max 8 agent turns. | `lib/models.ts:12-34`, `lib/agent.ts:299` |
| Billing | One-time credit packs. **Not a subscription.** | `app/api/billing/checkout/route.ts:37` (`mode: "payment"`) |

The template gallery has already made a market choice the rest of the board has
not caught up to. Its **23 starter prompts** sit in seven categories — *Food &
drink, Beauty & wellness, Local services, Professional services, Personal &
creative, Startup & product, Events & causes* (`lib/templates.ts:26-34`) —
local businesses and personal sites, not the "non-technical founder building an
MVP" that the board's **Market & Users** column assumes. See
[§5, Choice 3](#choice-3-name-the-market-brochure-site-not-app).

Publishing is also worth stating precisely, because the board's moat column
overstates it. `app/api/projects/[id]/publish/route.ts:12-15` says so directly:
publishing is "**deliberately NOT deploying to real Nxeon hosting infra in
Phase 1**" — `*.kodely.site` is served straight out of this Next app from
Postgres rows, on a self-hosted OVH VPS behind Cloudflare. That is genuinely
first-party (no Netlify, no Vercel, no Cloudflare Pages anywhere in the tree,
unlike Rocket per card #5 and Bolt per card #35), but it is a serving route,
not a hosting product. The **Differentiation & Moat** card "Built-in hosting on
Nxeon VPS = structural margin advantage" describes an intention, not the
current implementation.

---

## 2. Where Kodely genuinely wins today

These are real, code-backed, and — against the verified competitor set — mostly
unmatched. They are also all in the same family: **honesty about money and
about what was actually shipped.**

### 2.1 It is the only pay-once product in the category

`app/api/billing/checkout/route.ts:37` uses Stripe `mode: "payment"`. The packs
in `lib/stripe.ts:44-48` are one-time purchases, and `CreditLedger`
(`prisma/schema.prisma:275-287`) has no expiry column — the `/pricing` page's
claim that "Credits never expire" is backed by the schema, not by policy.

Verified 2026-08-22, every major rival is subscription-gated:

| Product | Cheapest paid plan | Can you buy credits without a subscription? |
|---|---|---|
| Lovable | Pro $20–25/mo *(sources conflict)* | No — top-ups require an active Pro/Business plan |
| Bolt.new | Pro $25/mo | No — purchased and rolled-over tokens need an active sub |
| v0 | Plus $30/user/mo (Premium $20 closed to new users) | No — Premium/Plus/Business only |
| Replit | Core $20/mo annual, $25/mo monthly | No — pay-as-you-go sits on top of a plan |
| Base44 | Starter $16/mo (annualized) | Top-ups tied to an existing plan |
| Rocket.new | Pro $25/mo | No — docs state an active paid subscription is required |
| Hostinger Horizons | Explorer $6.99/mo annual ($9.99 monthly) | Closest: support doc states top-ups "don't require an additional subscription" — but still presumes a Hostinger plan |

There is no true pay-once, no-recurring-fee credit pack in this market. Kodely's
$9 starter pack is a genuinely differentiated commercial shape. Whether it is
*sized* correctly is a separate and serious problem — see [§4](#4-the-pricing-landscape-and-where-kodely-sits).

### 2.2 A credit is a published dollar amount, not a mystery unit

`lib/credits.ts:12` — `MICROS_PER_CREDIT = 2_000`. One credit is $0.002 of real
model spend. Charge is computed from **metered tokens after the fact**
(`costMicros`, `lib/credits.ts:38-47`), never from a flat guess.

The category's single loudest complaint is the opposite of this. Board cards
document it across five vendors: Rocket publishes no credit-to-action
conversion at all (card #14); Bubble's Workload Units draw the loudest
complaints in no-code (card #76); Replit shows the exact price only *after* the
Agent finishes (card #51); Lovable users describe it as "a slot machine with
credits" (card #29); Bolt reviewers estimate roughly half of tokens go to the
AI fixing its own bugs (card #40).

Hostinger has since moved the same direction Kodely already sits — as of June
2026 Horizons meters *dynamic credits* by computing resources consumed, not
flat per-message (verified: Hostinger support doc 11136677). That is
convergence on Kodely's model, which is a validation of the design and an
erosion of the differentiator at the same time.

### 2.3 A failed build is free, and "failed" is decided by a compiler

`app/api/generate/route.ts:325` writes `creditsCharged: 0` on failure. What
makes this stronger than a policy promise is the definition of success:
`buildSite()` (`lib/build-site.ts:25-60`) runs a real `vite build` in a
throwaway directory against a pre-installed foundation tree (60s timeout), and
only output that compiles is stored and charged.

There is one automatic repair pass — `MAX_BUILD_ATTEMPTS = 2`
(`app/api/generate/route.ts:19`), re-prompting the agent with the actual build
error at `:231`. Two notes on its limits: it is a **single** retry, and it
re-runs the same `claude-sonnet-5` builder. `MODELS.planner`
(`claude-opus-5`, `lib/models.ts:16`) is declared as being "reserved for
planning and repair of builds the workhorse couldn't fix" but **no code path
routes to it** — the escalation described in the comment does not exist yet.

**Honest caveat on the billing claim.** If the *repair* pass succeeds, the user
pays for both passes — `app/api/generate/route.ts:259-260` charges the token
totals accumulated across every turn, repairs included. Only a build that never
compiles at all is free. Marketing must say "a build that fails is free," not
"we never charge you for our mistakes"; the second claim is not true as
written.

### 2.4 Preview and production are byte-identical

The CSP string in `app/api/preview/[id]/[[...path]]/route.ts:16-17` and
`app/api/site/[slug]/[[...path]]/route.ts:28-29` is the same string, and both
routes serve compiled artefacts from `ProjectFile`. There is no separate
runtime, no WebContainer, no dev-server-versus-build divergence.

This structurally eliminates a complaint that appears against two competitors
in the board's own research: "preview works, production breaks" is listed as a
recurring Bolt grievance in cards #35 and #40. Kodely cannot have that bug,
because the preview *is* the build output.

### 2.5 A user-set spend cap, enforced before anything is spent

`getSpendCapStatus` (`lib/credits.ts:154-189`) tracks a rolling-30-day ceiling
the user sets themselves; `app/api/generate/route.ts:59-72` checks it before a
single token is spent and returns a 402 explaining that *the user* set the
limit.

No competitor in the 99 cards is documented as offering this. It is the exact
control that the incidents the board catalogued would have needed: $607 over a
$25/mo Replit plan in 3.5 days, $1,982 in 24 days on a pre-launch app
(**Market & Users**, "Churn driver #2"), $250 on Rocket credits (card #7),
$1,000+ in underestimated Lovable costs (card #29).

### 2.6 Full source export, free and ungated

`app/api/projects/[id]/export/route.ts` has no plan check, no credit charge,
and no tier gate — any signed-in owner gets the complete Vite + React + TS
source tree as a zip. It is wired into the editor UI at
`app/projects/[id]/Editor.tsx:304-327`.

Verified 2026-08-22: Rocket.new's own docs still state source download
"requires a paid plan (Pro or above)" — card #13 holds. GoDaddy Airo goes
further the other way and requires a **paid plan to publish at all**.

*(The task brief described export as "built but not deployed." The route and its
UI entry point both exist in the tree; whether the currently deployed build
includes them is a deployment question this analysis did not verify.)*

### 2.7 A free, unbilled plan step before spending

`lib/enhance.ts` expands a one-line prompt into an editable spec on
`claude-haiku-4-5`, deliberately unbilled and not recorded as a build. Its
header comment states the reasoning directly: "a preview you pay for is not a
preview." The abuse ceiling is rate-limiting, not the credit meter.

The board's **Differentiation & Moat** column lists "'Plan/Chat mode' before
spending credits" as an aspiration. It already ships.

### 2.8 The build sandbox is enforced in code, not in the prompt

`PROTECTED_PATHS` / `PROTECTED_PATTERNS` / `normalizePath`
(`lib/agent.ts:176-204`) refuse writes to `vite.config.ts`, `package.json`,
`tsconfig.json`, `tailwind.config.*`, `postcss.config.*`, and all dotfiles. The
comment is explicit about why: the Vite config is *executed* server-side, so "a
sentence in the system prompt is not an access control." On the SDK engine the
same principle holds — `lib/agent-sdk.ts:73-83` denies Bash, WebFetch,
WebSearch, and Task by name, with a deny-by-default `canUseTool` callback at
`:342-348`. `lib/build-site.ts:78-94` spawns Vite with a minimal environment.

This is the correct reading of the Replit production-database incident (card
#53), whose lesson the card itself states precisely: the code freeze lived only
in instructions, and nothing in the execution path enforced it. Kodely's
equivalent guard is in the execution path.

**But the *serving* sandbox is weaker than it looks, and this analysis must not
overclaim it.** `docs/security/audit-2026-08.md` documents two gaps that are
still open in the current tree:

- **`form-action` and `base-uri` are not set** (audit M4). `connect-src 'none'`
  kills `fetch`, `XHR`, `WebSocket`, and `sendBeacon` — but a plain
  `<form method="post" action="https://…">` still submits to any external host.
  The "a generated site cannot make an external request" claim is true for
  scripted requests and false for form navigation. Do not put the absolute
  version of that claim in marketing.
- **The site route does not check `Host`** (audit H1). `kodely.me/api/site/<any-published-slug>/index.html`
  serves generated HTML on the *app* origin, which makes `'self'` mean
  `kodely.me`. Until that is fixed, the CSP's isolation guarantee is weaker
  than §2.4's byte-identical-header framing implies.
- `next.config.ts` is empty (audit M5) — the application itself ships no HSTS,
  `X-Frame-Options`, `X-Content-Type-Options`, or app CSP.

The security *posture* is a genuine differentiator worth marketing (see
[§5, Choice 4](#choice-4-decide-whether-the-sandbox-is-a-product-or-a-limitation)).
Marketing it before H1 and M4 are closed would be selling a guarantee the code
does not yet make.

### 2.9 Free rollback to any successful build

`Build.filesSnapshot` (`prisma/schema.prisma:263`) stores the full
`{source, build}` tree for every successful build;
`app/api/projects/[id]/builds/[buildId]/restore/route.ts` restores both trees
**with no regeneration and therefore no credit charge.**

This is the correct structural answer to the category's worst failure mode —
the debugging death-spiral where the AI breaks something and the user pays
again to get back. Cards #29 (Lovable, "fixes one thing, breaks another"), #40
(Bolt error loops), and #8 (Rocket, "fixing bugs the platform itself created
consumes additional credits") all describe a problem that free rollback
directly defuses. The board's **Differentiation & Moat** card "Real version
history: timestamps, named checkpoints, one-click rollback" is two-thirds
shipped; only user-named checkpoints are missing.

*Caveat:* `lib/retention.ts` includes a `build-snapshots` rule that clears
`filesSnapshot` (~105 kB/build), and nothing currently schedules it. Rollback
depth and storage cost are on a collision course that no one has priced.

### 2.10 It refuses to fabricate facts about a real business

`lib/agent.ts:74-90` forbids inventing addresses, phone numbers, opening hours,
prices, staff names, certifications, review scores, or testimonials, and
explicitly ranks this *above* the "no placeholder text" rule. The reasoning in
the prompt is the right one: an invented phone number is a real number
belonging to somebody else.

For the local-business market the template gallery actually targets, this is a
sharper trust story than any generic "production-ready code" claim, and none of
the 99 cards records a competitor making it.

---

## 3. Where Kodely structurally cannot compete

The distinction that matters: these are not missing features on a roadmap. Each
one is blocked by an architectural commitment that the current foundation
cannot reach incrementally.

### 3.1 The entire "app" market — closed

Lovable, Replit, Base44, Bolt, Rocket, and Chef all generate a database, auth,
and server logic. Kodely's generated projects have `react` and `react-dom`
(`lib/foundation.ts:16-19`), and `lib/build-site.ts:12-26` builds against a
single shared, pre-installed foundation tree specifically so that no build ever
runs `npm install`. That property is what makes server-side compilation safe to
run at all.

**What would have to change:** per-project dependency installation, a sandboxed
runtime, a provisioned database, an auth service, and a secrets store. That is
not a feature — it is a different product with a different security model. The
board's **Differentiation & Moat** card "Real backend, DB & auth built-in" is
not reachable from this foundation, and should be re-scoped or retired rather
than left standing as a moat.

### 3.2 Multi-page sites — closed by prompt, and it is the common case

`lib/agent.ts:51` mandates a single-page app. Most SMB brochure sites are
multi-page (Home / Services / About / Contact). This is the gap that hurts most
*within* the market Kodely has actually chosen, and unlike §3.1 it is
reachable: a router plus multiple HTML entry points is a foundation change, not
an architecture change. The serving route already handles arbitrary paths and
already synthesises a sitemap over every `.html` file it finds
(`app/api/site/[slug]/[[...path]]/route.ts:64-72`) — the serving layer is ready
for multi-page before the generator is.

### 3.3 A form that delivers — closed, and it is the #1 SMB job-to-be-done

The prompt forbids any form that appears functional (`lib/agent.ts:92-101`),
and the reasoning is correct — a form that silently discards a real enquiry is
worse than no form. But lead capture is the main commercial reason a local
business wants a website. A `mailto:` link is a materially worse answer, and
every hosting-company competitor bundles a real one.

This is the cheapest high-value gap on the list. A Kodely-hosted form endpoint
that emails the site owner needs no change to the generated app's architecture:
`lib/mail.ts` (nodemailer over `SMTP_*`) already exists and already powers
Kodely's own contact form at `app/api/contact/route.ts`. The generated page
would `POST` to a first-party endpoint — which, note, **already works today**,
because `form-action` is unset (§2.8). The correct move is to set `form-action`
to Kodely's own origin and then *use* it, closing a security gap and shipping
the feature in the same change.

### 3.4 Custom domains — absent, and it is the competitors' whole wedge

No `customDomain`, `cname`, or equivalent anywhere in the codebase. Sites live
at `<slug>.kodely.site`.

Hostinger Horizons bundles hosting on every tier plus a free domain for a year
from Starter up, and free mailboxes (verified 2026-08-22). Card #63 correctly
names Hostinger the closest strategic analog. A business will not run its
public presence on someone else's subdomain, so today Kodely produces a *draft*
of a website rather than a website — and the board's own **Pricing** column
already identifies "deploy/hosting/custom-domain as the natural upsell fence."
The fence exists; the gate does not.

### 3.5 Real photographs — absent, and for several template categories the photo is the product

Assets are inline SVG, gradients, and a ~460-item catalogue (`lib/agent.ts:58-63`);
`img-src 'self' data:` permits data URIs but there is no upload path for the
generated site. For *Food & drink* and *Beauty & wellness* — two of the seven
template categories — a site without the owner's photographs is not a
competitive artefact regardless of how well it is designed.

### 3.6 Every third-party embed — closed by `connect-src 'none'`

No analytics, no Calendly, no Google Maps, no chat widget, no booking embed, no
review widget, no payment button. This is the direct cost of §2.8. It is a
coherent trade, but it is currently an *unnamed* trade — see
[§5, Choice 4](#choice-4-decide-whether-the-sandbox-is-a-product-or-a-limitation).

### 3.7 Speed

The one recorded eval run
(`scripts/eval/results/2026-08-21T17-44-48-482Z-verify.json`) shows a
first build at **243 seconds** wall time against `maxDuration = 300` in
`app/api/generate/route.ts:11`. Four minutes to a first site, with 19% headroom
before the route ceiling. "Fastest prompt-to-prototype" is Lovable's
most-praised trait per card #30; that competitive axis is not currently winnable
and the timeout headroom is thin enough to be an operational risk on a larger
brief.

### 3.8 Teams, collaboration, GitHub sync, code editing

No collaboration models in `prisma/schema.prisma`; export is a manual zip
download, not two-way Git sync. The editor's code view is a **read-only
`<pre>`** — there is no Dev Mode equivalent to Lovable's, v0's, or Bolt's.
Lovable, Bolt, v0, and Rocket all ship Git integration; Lovable and v0 ship
click-to-edit visual editing that costs no credits.

For the local-business market this matters far less than §3.2–3.5 and should be
explicitly deprioritised. One exception is worth separating out: **visual
click-to-edit is a credit-free way to make small changes**, and in a product
where every edit currently costs 60–300 credits, that is a pricing feature as
much as a UX one.

### 3.9 Table-stakes account features that are simply missing

Not architectural — just absent, and each one is a support burden and a churn
cause rather than a competitive differentiator:

- **No password reset / forgot-password flow anywhere.** A user who forgets
  their password has no self-serve recovery.
- **No email verification.** See §4.4 for the economic consequence.
- **No self-serve account deletion** — `app/legal/privacy/page.tsx:319` directs
  users to email `privacy@kodely.me`.
- **No analytics on published sites.** `connect-src 'none'` blocks every
  provider, and Kodely ships no first-party equivalent, so a business owner
  cannot learn whether their site is working. Durable, Wix, Squarespace, and
  GoDaddy all bundle basic traffic stats.

### 3.10 Built but not wired

Four things exist in the tree and nothing calls them. Each is close-range value
already paid for:

| Component | State |
|---|---|
| `GET /api/assets` | Complete, auth-gated catalogue API. Header says it is "for a **future** asset-picker UI." No UI consumes it. |
| `lib/flags.ts` kill switches | `isEnabled()` is never called from any route or component. `generation.enabled` / `publishing.enabled` / `signups.enabled` can be flipped in the admin UI and **nothing reads them** — there is no working kill switch during an incident. |
| `MODELS.planner` (`claude-opus-5`) | Declared as the repair escalation; never routed to (§2.3). |
| `lib/retention.ts` | Full policy engine; no scheduler invokes it (§2.9 caveat). |

---

## 4. The pricing landscape and where Kodely sits

### 4.1 The packs and their margin

From `lib/stripe.ts:44-48`, against the $0.002/credit cost basis in
`lib/credits.ts:12`:

| Pack | Credits | Price | Per credit | Cost basis | Gross margin |
|---|---|---|---|---|---|
| starter | 500 | $9 | $0.0180 | $1.00 | 88.9% |
| builder | 2,500 | $40 | $0.0160 | $5.00 | 87.5% |
| pro | 6,000 | $90 | $0.0150 | $12.00 | 86.7% |

The margin is real and healthy. The volume discount is per-credit against the
starter pack, and margin drifts down slightly as the discount deepens — the
intended shape, and `lib/stripe.ts:22-43` documents it correctly after a
correction on 2026-08-22.

### 4.2 The problem the margin table hides

The margin is per *credit*. The customer buys *builds*. Translating:

Measured build cost is **144 credits** (2026-08-17) and **472 credits**
(2026-08-21 eval, `scripts/eval/results/`). `estimateCredits`
(`lib/credits.ts:115-117`) quotes 120–550 for a create and 60–300 for an edit,
deliberately wide because two samples is not a distribution.

At the measured 472-credit build:

| Pack | Builds it buys | Effective price per build |
|---|---|---|
| starter $9 | **1.06** | $8.50 |
| builder $40 | 5.3 | $7.55 |
| pro $90 | 12.7 | $7.08 |

At the optimistic 144-credit end, starter buys 3.5 builds at $2.59 each. **The
true answer is somewhere in a 3x band and nobody knows where.** `lib/credits.ts`
and `lib/stripe.ts` both carry explicit comments saying not to publish a
per-build price until `scripts/eval` has run a full sweep. That sweep has run
**once, against one prompt** (`selectedIds: ["plumber"]`, `count: 1`).

Three numbers that follow from this and are currently incoherent:

1. **The signup grant exceeds the starter pack.** `SIGNUP_GRANT = 750`
   (`lib/credits.ts:20`) versus a 500-credit starter pack. A new account is
   given 50% more credits than $9 buys. At 472 credits/build that is ~1.6 free
   builds handed to every signup, costing $1.50 of real model spend each, with
   no obvious reason to then buy the smallest pack.
2. **The social reward is below the noise floor.** `REWARD_CREDITS = 50`
   (`app/api/rewards/_lib.ts:26`) is roughly one tenth of a build — $0.10 of
   spend. It cannot buy anything the user can perceive.
3. **The headline number does not communicate.** "500 credits" reads generous
   and means about one website. Competitors' units are coarser and therefore
   more honest to a buyer: Lovable Pro is 100 credits, Rocket Pro is 100
   credits, Framer Basic is 1,000 AI credits. A Kodely credit is denominated at
   1/10th of a cent, so the number on the pack is an order of magnitude larger
   than the number of things it buys.

### 4.3 Where the $9 pack actually lands

Verified competitor entry points, 2026-08-22:

| Product | Entry | Commitment | Bundled |
|---|---|---|---|
| **Kodely starter** | **$9 one-time** | **None** | Hosting on `*.kodely.site` |
| Hostinger Horizons Explorer | $6.99/mo annual ($9.99 monthly) | Annual for the low price | Hosting; domain from Starter up; mailboxes |
| Base44 Starter | $16/mo annualized | Subscription | Hosting, backend, auth |
| Lovable Pro | $20–25/mo *(unresolved)* | Subscription | Hosting, Cloud backend |
| Replit Core | $20/mo annual, $25 monthly | Subscription | Hosting, DB, auth, deploys |
| Bolt Pro | $25/mo | Subscription | Deploy to Netlify/Vercel/CF |
| v0 Plus | $30/user/mo | Subscription | Vercel deploy |

Kodely is the cheapest way to get *one* website with no recurring commitment,
and the only no-commitment option at all. It is *not* the cheapest way to get
volume: at $9.99/month Hostinger Horizons bundles hosting, mailboxes, and a
credit allowance for a whole month, and its dynamic credits meter the same way
Kodely's do.

**The positioning that survives contact with these numbers is "pay once, own
it, no subscription" — not "cheap."** The margin analysis says Kodely can
afford to be either; the pack sizing currently says neither clearly.

---

### 4.4 The free-credit surface is not rate-limited or verified

This belongs in the pricing section because it is a direct, unpriced charge
against the margin in §4.1.

- `POST /api/auth/signup` has **no rate limit and no email verification**
  (`app/api/auth/signup/route.ts`; `lib/rate-limit.ts` defines exactly three
  limiters — generate 20/hr, first publish 15/day, enhance 40/hr — and none on
  auth). Password minimum is 8 characters with no other check.
- Each signup grants 750 credits (`lib/credits.ts:20`) = **$1.50 of real model
  spend**, and additionally runs `createSeedProject()`
  (`lib/seed-project.ts:52-65`), which **pre-compiles a project with
  `buildSite()`** — real CPU, on signup, before any human has been verified.
- Social rewards add up to 200 more credits (4 platforms × 50,
  `app/api/rewards/_lib.ts:26-28`), and three of the four
  (Instagram/Facebook/LinkedIn) are **self-declared and unverified**
  (`app/api/rewards/social/_unverified.ts`). Only Discord does a real
  membership check.

So an unverified email address is currently worth up to 950 credits — $1.90 of
model spend plus a compile — with nothing throttling how many can be created.
Every competitor's free tier is gated by an account system that at minimum
verifies an address. This is not a competitive weakness in the product; it is a
hole in the unit economics that §4.1's margin table silently assumes away.

## 5. The strategic choices this forces

Five. Each is a fork, not a task.

### Choice 1: Re-denominate the credit, or re-price the packs — before publishing any per-build number

The unit is broken as a communication device (§4.2). Two coherent exits:

- **Re-denominate.** Make one credit ~$0.02 of spend, so a build is ~7–24
  credits and the starter pack is ~25 builds. The headline number then maps to
  something a buyer can hold in their head, and the published cost basis stays
  honest.
- **Keep the unit, change the story.** Stop selling "credits" in the headline
  and sell builds: "$9 — your first site, plus edits." That requires knowing the
  distribution, which requires the eval sweep.

Either way, **run `scripts/eval` across the full prompt set first.** One run
against one prompt is the entire empirical basis for the current numbers, and
both `lib/credits.ts` and `lib/stripe.ts` already say in comments not to publish
until it has run. This is the gating decision for everything else in §4.

### Choice 2: The signup grant and the starter pack cannot both stand

750 free versus 500 for $9 is not a funnel, it is an argument against the
smallest pack. Pick one: cut the grant to a fraction of a build and rely on the
free enhance step for the "try it" moment; or raise the starter pack above the
grant so the first purchase is an obvious upgrade; or keep the grant large and
delete the starter pack, making $40/2,500 the entry point. Doing nothing means
the cheapest pack is dominated by the free tier.

### Choice 3: Name the market — brochure site, not app

The board's **Market & Users** column targets non-technical founders building
MVPs. The code cannot serve them (§3.1) and the template gallery does not try
to (`lib/templates.ts:26-33` is seven local-business and personal categories).
That gap is the single biggest source of wasted planning on the board — the
Competitor Teardowns column spends most of its 99 cards on full-stack app
builders that Kodely does not compete with.

**Decide explicitly that Kodely is a single-page site generator for local
businesses and personal projects.** If that is the answer, the roadmap that
follows is §3.2 (multi-page), §3.3 (a form that delivers), §3.4 (custom
domains), and §3.5 (owner photographs) — none of which is a database. If it is
not the answer, the foundation needs replacing and that should be stated as
such rather than accumulated as feature cards.

### Choice 4: Decide whether the sandbox is a product or a limitation

`connect-src 'none'` is simultaneously Kodely's best security story (§2.8) and
the cause of §3.6. Two honest positions:

- **Market it.** "No trackers, no third-party requests, no cookie banner
  needed, perfect Lighthouse by construction." This is a real and increasingly
  saleable claim, and it makes the missing embeds a feature rather than an
  absence. It also pairs naturally with §2.10.
- **Carve a controlled allowlist.** A first-party form endpoint and a named set
  of embeds, with the CSP widened per-origin rather than opened.

The failure mode is drifting between them: keeping the restriction without
selling it, and adding exceptions without a policy. Note that a first-party
form endpoint (§3.3) is compatible with *either* position, because the allowed
origin is Kodely's own.

**Precondition either way.** The marketing version of this claim cannot ship
before audit findings **H1** (no `Host` check on the site route — generated
HTML is servable on the app origin) and **M4** (`form-action` and `base-uri`
unset) are closed. Both are documented in `docs/security/audit-2026-08.md` and
both are open in the current tree. Selling "no external requests" while a
generated page can POST anywhere is the one thing that would turn Kodely's best
differentiator into its worst story.

### Choice 5: Stop researching competitors Kodely does not compete with

The teardown column is dominated by full-stack app builders, mobile builders,
and Google/Wix platform moves. If Choice 3 goes the way the code points, the
comparison set that matters shrinks to hosting-bundled site builders —
Hostinger AI Builder, GoDaddy Airo, Durable, Squarespace, Wix — plus Framer on
design quality. Lovable, Bolt, v0, Replit, Rocket, Base44, Chef, Databutton,
a0.dev, Rork, Emergent, Bubble, and Manus become context, not competition.
Cards #95–#98 request *more* teardown depth on several of these; that is the
opposite of what this analysis concludes.

---

## 6. Board cards that are stale or wrong

Verified against primary sources on 2026-08-22 unless noted.

### Wrong on facts

| Card | Claim | Correction |
|---|---|---|
| **#25** Lovable pricing | "Free ($0, 5 daily credits capped ~150/mo)" | **Wrong.** Official pricing page and docs say 5 build credits/day capped at **30/month**, plus 20 Cloud credits/mo and 4 AI credits/mo. |
| **#25** Lovable pricing | "runtime Lovable Cloud/AI usage is billed separately on top of subscription credits" | **No longer true.** As of the **2026-06-13** billing change, build + Cloud + in-app AI share one credit balance; prior Cloud/AI balances were converted. Source: lovable.dev/blog/simplifying-billing |
| **#25** Lovable pricing | "Pro ($25/mo)" | **Unresolved.** Lovable's own docs read $20/mo; aggregators checked 2026-08-12 say $25. Do not quote a number without re-checking. |
| **#63** Hostinger Horizons | "Tiered by AI messages" | **Wrong since June 2026.** Metering is dynamic **credits** by compute consumed (~0.12 credits simple, ~2.45 complex), per Hostinger support doc 11136677. This is the same model Kodely uses — the differentiator named in the card has been matched. |
| **#63** Hostinger Horizons | Tier list omits Hustler; prices given as flat | Hustler tier exists ($79.99 annual / $99.99 monthly, 400 credits). Listed prices are month-to-month; annual is ~30% lower. Brand is also consolidating toward "Hostinger AI Builder" (Premium $2.99 / Unlimited $3.99 / Cloud Startup $7.99 on long terms). Horizons tier cards did not render on an official page during verification — **treat the tier list as secondary-sourced.** |
| **#78** Framer | "Free, Basic $10, Pro $30, **Scale $100/mo**, Enterprise" | **No Scale tier found** on framer.com/pricing. Verified tiers: Free $0 (500 one-time credits), Basic $10 (1,000 AI credits/mo), Pro $30 (3,000/mo), Enterprise. The "all paid plans include AI credits" part is correct. |
| **#45** v0 | "Premium $20/mo … Team $30/user/mo" | **Stale.** Premium is "being sunsetted and is no longer available to new users." The $30/user tier is named **Plus**, not Team. Live page shows Free / Plus / Business / Enterprise. |
| **#51** Replit | "Core $20/mo (annual, includes $20 monthly usage credits)" | **Partly off.** $20/mo annual but **$25/mo monthly**, and the page describes it as "$25 towards most powerful models." The effort-based-checkpoint date (2026-07-01) is correct. |
| **#87** Landscape: who leads | "Lovable ~$400M ARR, $6.6B valuation; Replit ~$253M ARR (Oct 2025)" | **Superseded**, as the card's own RECONCILE note says. Verified: Lovable $500M ARR June 2026, **$13.3B** valuation (Series C, 2026-08-12). Replit ~$525M ARR per card #54. |
| **#86, #88, #89, #90, #91, #92, #93, #94** | All carry the same RECONCILE stamp | The stamp was appended to eight cards, but only #86/#87 contain the stale figures. On #88–#94 it is noise that makes otherwise-current cards look untrustworthy. Strip it from those seven. |

### Overtaken by events

| Card | Status |
|---|---|
| **#56, #57, #58, #61** Firebase Studio | Sunset **verified exactly as card #59 states**: signups and new workspaces disabled 2026-06-22, full shutdown 2027-03-22 with data deletion. These four cards describe a product that cannot be signed up for. Not competitive intelligence any more; keep #59 and #60 (Antigravity) and archive the rest. |
| **#79** Wix ADI | Correct that ADI retired 2024-11-10, but the card predates the current state: Base44 is a live standalone product under Wix with its own pricing page (Free / Starter $16 / Builder $40 / Pro $80 / Elite $160, annualized) and reportedly hit $100M ARR nine months post-acquisition. Merge into #62. |
| **#62** Base44 | Understates it. "Being folded into Wix's ecosystem, reducing independence" — it still operates independently with its own pricing and a $100M ARR milestone. |
| **#64** GoDaddy Airo | Missing the decisive fact: **publishing a site requires an active paid plan.** The 50 free credits/month is verified, but the free tier cannot ship a site. The card's "full source-code export" claim was **not verified** in this pass. |
| **#13** Rocket source download | **Still correct** — docs confirm zip download requires Pro or above. Rocket also verified at Free $0/20 one-time credits, Pro $25/100, Rocket $50/250, Booster $250/1,500, credits never expire, and free users cannot buy credits at all. |

### Not competitors — should not be in this column

| Cards | Reason |
|---|---|
| **#75** Napkin AI | The card says so itself: a text-to-visuals tool, not a builder. |
| **#83** Manus, **#84** Google Opal | General agent and mini-app automation respectively. Neither competes for the job Kodely does. |
| **#66** Databutton, **#82** Chef by Convex, **#68** Tempo, **#69** a0.dev, **#70** Rork, **#81** Builder.io Fusion | Backend/Python, mobile, and dev-team tooling. Out of scope entirely if Choice 3 lands as the code suggests. |

### Not observations at all

**#95, #96, #97, #98** are research requests, not findings — "deep teardown," "expand beyond one card," "one normalized table." #98 (the cross-competitor pricing table) is superseded by §4.3 above. #95 (Hostinger deep teardown) is the one worth keeping if Choice 3 lands, because Hostinger is then the primary competitor. #96 (GoDaddy Airo) is partly answered above. #97 (Anthropic as a platform-risk competitor) is a genuine and unanswered strategic question that this analysis did not address and that no other card covers — it should be kept and re-scoped as a *risk*, not a teardown.

### Cards that are correct and load-bearing — keep

**#7, #8** (Rocket: credits burn fast; fixing the platform's own bugs costs more
credits), **#29** (Lovable: charged for the AI's own mistakes), **#40** (Bolt:
~half of tokens on self-inflicted error loops), **#51** (Replit: price visible
only after the fact), **#53** (Replit production-DB incident — the guardrail
lesson Kodely's `PROTECTED_PATHS` correctly implements), **#14** (Rocket's
opaque credit conversion). These six are the evidentiary base for everything in
§2.1–§2.5 and none of them has aged.

---

## 7. Summary

**Where Kodely wins:** billing honesty that is enforced in code rather than
promised in copy — pay-once packs with no subscription and no expiry, a credit
denominated in published dollars, a compiler deciding what counts as a
deliverable, free rollback to any prior build, a user-set spend cap, and free
ungated source export.

**Where it cannot compete:** anything requiring a backend, a second page, a
working form, a custom domain, the owner's photographs, or a third-party embed
— and it will not win on speed.

**What that combination is:** the most trustworthy way to buy a single-page
website outright. That is a real position. It is not the position the board's
Market & Users column describes, and closing that gap is Choice 3.
