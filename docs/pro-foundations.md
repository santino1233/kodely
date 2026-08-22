# Pro foundations

A **foundation** is a pre-built app that a generation edits rather than writes.
`lib/foundation.ts` (singular) is the marketing-site starter every project uses
today: nine small files, a blank page and four UI primitives.
`lib/foundations/` (plural) is the Pro equivalent — whole applications, shipped
working, where the model supplies a schema and a dashboard instead of an app.

There is one so far: **`client-tracker`**. This document says what it is, what
it cannot do, and — the part worth reading — whether the "a foundation makes
generation cheaper" claim actually survives contact with the billing model.

---

## 1. What is built

**A single-user CRM that runs entirely in the visitor's own browser.** No
server, no account, no network request of any kind. Data lives in
`localStorage` on one device.

That shape is not a compromise chosen for speed; it is the only app shape the
current architecture permits. Generated sites are static files served under
`connect-src 'none'` (the CSP in `app/api/site/[slug]/[[...path]]/route.ts`),
with `react` and `react-dom` as the only runtime dependencies and no
`npm install` per generation (`lib/build-site.ts` symlinks one pre-installed
tree). There is no backend a generated app could talk to. Everything else on
the board's Pro column is blocked behind the backend decision; this is not.

### The split: kernel vs app

25 files, 105KB. The point is the ratio between the two halves.

| | files | bytes | est. tokens |
| --- | ---: | ---: | ---: |
| **Kernel** — pre-built, model never touches it | 19 | 90,146 | ~25,000 |
| **App** — schema, branding, dashboard, `<head>` | 6 | 15,551 | ~4,300 |

The kernel is `src/kernel/**`: the `localStorage` store with cross-tab sync and
corruption handling, `useSyncExternalStore` bindings, a hash router, the whole
UI kit, schema-driven validation, formula-injection-safe CSV export, and the
CRUD engine — list with search / filter / sort, detail with related records,
create and edit forms generated from field declarations, delete with
confirmation, backup / restore / wipe, light and dark themes.

The app is `src/app/schema.ts` (collections and fields), `src/app/branding.ts`,
`src/app/Dashboard.tsx`, `src/App.tsx`, `src/index.css` and `index.html`. Adding
a field to the schema gives you a form control, a table column, a validation
rule, a detail row, a search target and a CSV column with no other edit. Adding
a collection gives you a nav item and full CRUD.

| file | bytes | written by |
| --- | ---: | --- |
| `src/kernel/ui.tsx` | 12,236 | kernel |
| `src/kernel/CollectionList.tsx` | 10,883 | kernel |
| `src/kernel/RecordDetail.tsx` | 8,708 | kernel |
| `src/kernel/store.ts` | 8,247 | kernel |
| `src/kernel/DataSettings.tsx` | 7,994 | kernel |
| `src/kernel/AppShell.tsx` | 7,979 | kernel |
| `src/kernel/RecordForm.tsx` | 5,274 | kernel |
| `src/kernel/router.ts` | 4,233 | kernel |
| `src/kernel/format.ts` | 4,131 | kernel |
| `src/kernel/FieldControl.tsx` | 3,640 | kernel |
| `src/kernel/records.ts` | 3,322 | kernel |
| `src/kernel/validate.ts` | 2,976 | kernel |
| `src/kernel/types.ts` | 2,611 | kernel |
| `src/kernel/AppRoutes.tsx` | 2,486 | kernel |
| `src/kernel/hooks.tsx` | 2,336 | kernel |
| `src/kernel/csv.ts` | 2,180 | kernel |
| `src/kernel/brand.ts` | 504 | kernel |
| `src/main.tsx` | 231 | kernel |
| `src/kernel/cx.ts` | 175 | kernel |
| `src/app/Dashboard.tsx` | 8,113 | **model** |
| `src/app/schema.ts` | 4,224 | **model** |
| `src/App.tsx` | 978 | **model** |
| `index.html` | 896 | **model** |
| `src/app/branding.ts` | 742 | **model** |
| `src/index.css` | 598 | **model** |

### Quality bar

The same one `lib/agent.ts` demands of generated sites: responsive down to
380px (verified — the table becomes a card stack at 640px, `body.scrollWidth`
is 380 at a 380px viewport), a real dark mode on a class the user controls
rather than a media query they cannot, `focus-visible` outlines on every
interactive element, labelled controls with `aria-invalid` and
`aria-describedby`, `aria-current` on nav, a dialog that traps Escape and
returns focus to its opener, and no external request of any kind — no fonts, no
images, no CDN. Icons are inline SVG.

---

## 2. What it honestly cannot do

This is on the record in three places: `CLIENT_TRACKER.cannot` in
`lib/foundations/client-tracker/index.ts`, a non-dismissible footer on every
screen of the app, and a four-bullet explanation on the app's own Data page.

- **It cannot be shared.** One browser, one device. A second person or a second
  device opens an empty app. There is no "our team's CRM" version of this.
- **It cannot back itself up.** Clearing site data, a privacy cleaner or a
  browser reset destroys everything with no warning and no recovery. The JSON
  export is the only copy that survives, which is why the export is one click
  from every screen and the delete flow makes you type `DELETE`.
- **It cannot send or receive anything.** No email, no SMS, no calendar sync,
  no payment, no import from another system except pasted JSON.
- **It has no accounts and no permissions.** Whoever can open the browser
  profile can read everything.
- **It must not hold data anyone is legally required to protect.** Nothing is
  encrypted at rest and nothing is audited.

The kernel enforces the first two in the UI rather than leaving them to the
generated copy. `StorageFooter` in `src/kernel/AppShell.tsx` is not dismissible
and does not take a prop that could turn it off. That is deliberate: the
failure it guards against — a year of client history lost to a cache clear —
happens exactly once per user and cannot be undone. Selling a local-only "CRM"
without that sentence would be the "pretends to work" failure the system prompt
in `lib/agent.ts` already forbids.

---

## 3. Proof it compiles

Built through the real `buildSite` from `lib/build-site.ts` — the same function
production and the eval harness call, not a copy.

```
KODELY_FOUNDATION_DIR = C:\Users\edmem\kodely-foundation
source files: 28
BUILD OK in 1563 ms
  dist: assets/index-DxGST5kA.js   239939 bytes
  dist: assets/index-Dy7UXBU7.css   28708 bytes
  dist: index.html                    994 bytes
```

28 = the foundation's 25 files plus `package.json`, `vite.config.ts` and
`tsconfig.json`, which `foundationFiles()` takes **by reference** from
`FOUNDATION_FILES`. That reference matters: `package.json` has to stay
byte-identical to the one `scripts/install-foundation.mjs` installs, or the
shared `node_modules` symlink points at a tree that does not match the project.

`KODELY_FOUNDATION_DIR` must be loaded from `.env` before calling `buildSite`.
Without it the path falls back to `/home/kodely/kodely-foundation` and every
build fails with a "Cannot find module" that points nowhere near the cause.
`loadEnv()` in `scripts/eval/loader.mjs` throws on this for exactly that reason.

The output was then served under the production CSP verbatim and clicked
through in a browser: create with validation rejecting a bad email, save,
persist to `localStorage`, detail view, a related-record link that pre-fills the
parent, the dashboard tiles, currency and relative-date formatting, the list
table, and the Data page. Zero console messages, zero CSP violations.

---

## 4. The credit arithmetic — does the thesis hold?

The claim under test: *pre-built foundations make generation cheaper, because
the model writes less.* It is a real claim with a real counter-argument —
`describeFiles()` in `lib/agent.ts` inlines every byte of every project file
into the request **on every turn**, so a big foundation is a recurring context
charge, not a one-off saving.

### The rate card

From `lib/models.ts`, `claude-sonnet-5`, in micro-dollars per token. One credit
is 2,000 micros (`MICROS_PER_CREDIT`, `lib/credits.ts`).

| | µ$/token |
| --- | ---: |
| output | 15.00 |
| input (uncached) | 3.00 |
| cache write | 3.75 |
| cache read | 0.30 |

### The measured anchor

One real marketing build, `scripts/eval/results/2026-08-21T17-44-48-482Z-verify.json`
— 13 files written, compiled first try, 472 credits:

| | tokens | µ$ | share |
| --- | ---: | ---: | ---: |
| output | 22,568 | 338,520 | 36% |
| cache read | 1,076,680 | 323,004 | 34% |
| cache write | 74,345 | 278,794 | 30% |
| input | 992 | 2,976 | 0.3% |
| **total** | | **943,294** | = **472 credits** |

**Two facts fall straight out of this table, and both are load-bearing.**

First, **output is only 36% of a build's cost.** Nearly two thirds is context.
So "the model writes less" is an argument about the smaller half of the bill.

Second, **the request prefix is being served from cache.** `input_tokens` is
992 for the entire build — everything else was a cache read. The final prefix is
about 77,000 tokens (74,345 cache-written plus system and tools), and 1,076,680
cache-read tokens against it means **the average context token was billed as a
cache read roughly 14 times.**

### The per-token comparison

A token of foundation, placed in the request prefix, costs one cache write plus
one cache read per subsequent call. A token the model writes instead costs
output price, and then *also* joins the prefix and is re-read.

```
in cached prefix:   3.75 + 0.30 x (reads)
written as output: 15.00 + 0.30 x (reads after it was written)
```

| re-reads | prefix token | output token | ratio |
| ---: | ---: | ---: | ---: |
| 2 (turns=3) | 4.35 µ$ | 15.30 µ$ | 3.5x |
| 4 (turns=5) | 4.95 µ$ | 15.90 µ$ | 3.2x |
| 7 (turns=8, `MAX_TURNS`) | 5.85 µ$ | 16.80 µ$ | 2.9x |
| 13 (the 14x measured above) | 7.65 µ$ | 18.60 µ$ | 2.4x |

**Break-even is 38.5 re-reads.** `MAX_TURNS` is 8, so within one build the
foundation physically cannot reach the point where carrying it costs more than
generating it.

### What that means for this foundation, in credits

The Pro foundation as `describeFiles()` would send it is 108,797 characters ≈
**30,221 tokens**, estimated at 3.6 chars/token. That divisor is a heuristic,
not a tokenizer count — there is no `ANTHROPIC_API_KEY` in this tree to call
`countTokens` with, and adding a tokenizer would be a new dependency. It is
consistent with the board's own "roughly 1,400 tokens" figure for the ~5KB
marketing foundation as it stood when that card was written. Being wrong by
±20% moves every row in the table below by the same factor and changes which
side wins in none of them.

| | credits per build |
| --- | ---: |
| Foundation inlined by `describeFiles()`, 8 turns, cached | **88** |
| Same, but the cache misses entirely (uncached input x 8) | **363** |
| Same, cold cache write only (a single-turn build) | **57** |
| Model writes those 25,000 kernel tokens itself instead | **254** (before thinking tokens) |
| Manifest instead of the dump (1,213 tokens) | **3.5** |
| *For scale: today's marketing foundation dump* | *8.4* |

### Verdict

**The thesis holds — by about 3x, not 10x, and only because of prefix caching.**

- Shipping the kernel as context costs ~88 credits a build. Having the model
  write the same code costs ~254 credits of output *before* thinking tokens,
  before the repair turns that a 25-file app would provoke, and before the very
  real possibility that it never completes inside `MAX_TURNS` at all. So the
  foundation wins on cost and wins much harder on whether the build finishes.
- **But 88 credits is a tax on every build, including edits that never touch
  the kernel.** "Make the header blue" pays the full 88 credits to re-send a
  CSV exporter and a date formatter the model will not read. Against a measured
  ~172-credit edit, that is a **~50% surcharge on every follow-up turn**. This
  is the honest bad news, and it is the strongest possible argument for the
  board's manifest card.
- **The saving is entirely contingent on the prefix being cached.** At
  30,221 tokens, an uncached foundation costs 363 credits a build — *more
  expensive than having the model write it.* Today `lib/agent.ts` sets
  `cache_control` only on the system prompt; the messages array carries no
  breakpoint, and the caching visible in the measured build is therefore not
  something the code explicitly asks for. **Before a foundation this size ships,
  the cache breakpoints on the messages array are not an optimisation — they
  are the difference between the foundation saving 166 credits a build and
  costing 109 more.**
- **The manifest changes the answer from "3x better" to "25x better."** Sending
  the manifest (`describeManifest()` in `lib/foundations/types.ts`: path,
  purpose, byte size and exported symbols per file) is 1,213 tokens against
  30,221 — **4%** — for 3.5 credits a build instead of 88. Every foundation file
  already carries the `purpose` and `exports` strings this needs. A foundation
  that ships 25 files and is invisible in context is a pure win; one that ships
  25 files and inlines them every turn is a tax the customer pays on code they
  did not ask for.

**The number to quote internally:** with the manifest and cache breakpoints in
place, a client-tracker build should be roughly *4 credits of foundation
context + ~36 credits of output for the six app files + the ordinary context
growth of the conversation* — comfortably under the 472 credits a marketing
site measured. An app costing less than a landing page is a better sentence
than "apps are cheaper than they would have been", and this arithmetic supports
it — but only after two changes that are not in this directory.

---

## 5. Wiring it in — changes needed outside `lib/foundations/**`

Nothing imports `lib/foundations/` yet. It compiles, it builds and it runs, but
no generation can reach it. In rough order of necessity:

1. **`lib/agent.ts` — a separate system prompt for app generation.** Do not
   extend `SYSTEM`. Several of its hardest rules are actively wrong here: "this
   is a single-page app ... not separate .html files" (the kernel routes), and
   "Do not build a contact form, booking form, newsletter signup, login, cart
   or checkout that appears functional" (a CRUD app is nothing but forms). Two
   rules must transfer unchanged and matter more here: never invent facts about
   a real business, and never build something that only pretends to work.
2. **`lib/agent.ts` — `PROTECTED_PATHS` must cover `src/kernel/`.** The prompt
   saying "do not touch the kernel" is a request; `isProtectedPath` is a rule.
   A one-line pattern `/^src\/kernel\//` does it. `kernelPaths()` in
   `lib/foundations/types.ts` returns the exact list.
3. **`lib/agent.ts` — cache breakpoints on the messages array, and a `read_file`
   tool plus manifest instead of `describeFiles()`.** Per section 4, the first
   is a correctness requirement for the cost model and the second is where the
   whole saving lives.
4. **`lib/build-site.ts` and `prisma/schema.prisma` — a `foundation` parameter
   and a column recording which foundation a project was created from.** Not
   needed for `client-tracker`, which adds no dependency and compiles against
   the existing tree unchanged; needed the moment a foundation wants one.
5. **Project creation (`lib/seed-project.ts`, `app/api/projects/route.ts`)** —
   seed from `foundationFiles(getFoundation(id))` instead of `FOUNDATION_FILES`,
   and surface `foundation.cannot` in the picker before the user chooses, not
   after.
6. **`app/api/site/[slug]/[[...path]]/route.ts` — nothing.** That is the point.
   The CSP does not move for a client-only app, which is the entire reason this
   one could be built now.

---

## 6. The next three or four

In the order they should be built, each still client-only, each reusing the
same kernel with a different `src/app/**`:

1. **Booking log** (~1 week). Services, staff, appointments, a day and week
   view. The kernel needs a `time` field kind and a calendar screen; the
   availability engine and double-booking guard are *not* buildable here —
   without a server there is nothing to enforce a uniqueness constraint
   against, so this is an appointment **log** for one person's own diary, and
   it must be named and described as one. Timezone handling belongs in
   `src/kernel/format.ts` where it is tested, never in generated code.
2. **Stock count** (~3 days). Items, locations, and a movement ledger with
   stock-on-hand *derived from movements* rather than stored as a mutable
   counter. The kernel needs one new thing — a derived/computed field — and
   gets the cheapest possible proof of it. A mutable quantity column is the
   classic inventory bug and the same read-then-write shape audit finding M1
   identifies in Kodely's own credit ledger.
3. **Quote and invoice builder** (~1 week). Line items, totals, a printable
   view. Needs a repeating-group field kind (the kernel's biggest genuine gap)
   and money arithmetic in integer minor units in the kernel — never in
   generated code, and never in floats. Print CSS instead of PDF generation,
   because a PDF library is a dependency and there is no install step.
4. **Personal admin console** (~2 days). The kernel with almost nothing on top:
   any declared collection gets full CRUD and a CSV export. Cheapest of the
   four and the best regression test of the kernel, since it is the kernel with
   the vertical removed. Worth building *last* here rather than first as the
   board suggests, because after three real verticals it becomes a genuine
   check that nothing vertical-specific leaked into `src/kernel/`.

**What none of them can be.** Every one of these is single-user and
single-device, and each one wants to be shared more than the last — a booking
log that a customer cannot book into is half a product, and an invoice nobody
can be sent is less than that. That ceiling is not a gap in the kernel; it is
`connect-src 'none'` plus "no server", and no amount of client-side code moves
it.

### What would have to change for a genuinely multi-user app

Three things, in strict order, and the first two are decisions rather than work:

1. **Move published site serving off the app origin.** Sites render today at
   `kodely.me/api/site/...`, first-party to the app. `connect-src 'none'` is
   the single control stopping hostile generated script from calling `/api/*`
   with the victim's cookies, and `docs/security/audit-2026-08.md` cites it as
   the reason finding H1 is High rather than Critical. Opening `connect-src`
   before that move makes the current position materially worse.
2. **Decide whether Kodely will be a processor of its customers' end-user
   data.** The moment a plumber's client list lives on Kodely's servers, that
   is a DPA, a sub-processor list, breach-notification duties, and deletion
   requests about people Kodely has no relationship with. This is the actual
   product being sold and it is not an engineering call.
3. **Then, and only then, one first-party data service** at a single origin,
   reached by exactly one new `connect-src` entry (`https://data.kodely.app`,
   deliberately not `'self'`), with declarative per-project schemas, first-party
   end-user auth, and **server-enforced** row scoping. The model would declare a
   schema — the same `src/app/schema.ts` this foundation already uses — and
   write UI, never a permission check and never a query. The kernel's data layer
   would swap `src/kernel/store.ts` for an SDK behind the same
   `useCollection` / `useStore` interface, which is why that interface is worth
   keeping narrow now.

Until then, "single-user, on this device, and it says so" is not a lesser
product. It is the honest one.
