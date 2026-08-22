# Kodely product design system

The contract for the customer-facing portal (`app/(portal)/**`) and the builder
(`app/projects/[id]/**`). Marketing pages (`app/page.tsx`, `/pricing`, `/blog`,
`/templates`, `/wizard`) are a **separate** system — do not repoint their tokens.

## The one-sentence brief

An AI website builder that happens to have a customer portal around it — not a
dashboard that happens to contain a builder. The primary action is always
"build something".

---

## Tokens

Defined in `app/globals.css`, exposed to Tailwind via `@theme inline`. **Use the
Tailwind class, never a raw hex and never an arbitrary-value bracket.**

### Surface

| Class | Use |
| --- | --- |
| `bg-canvas` | The page behind panels. Set by `AppShell`; pages never set it. |
| `bg-surface` | Cards, panels, the sidebar. |
| `bg-surface-2` | Hover, inset rows, quiet fills. |
| `bg-surface-3` | Track of a progress bar, the deepest step. |
| `bg-inset` | Code/preview wells. |

### Line

`border-hair` (default for cards) · `border-line-mid` (inputs, menus) ·
`border-line-strong` (emphasis, pending step outline)

### Text

`text-ink` (primary) · `text-ink-2` (secondary/body) · `text-ink-3` (tertiary,
placeholder, disabled) · `text-ink-inv` (on a brand fill)

### Brand

`text-brand` `bg-brand` `bg-brand-tint` `bg-brand-tint-2` `text-brand-ink`

`--brand-gradient` is a **fill of last resort**. Exactly one element per view may
carry it: the primary button. Do not gradient headings, cards, borders or icons.

### Status

`ok` `warn` `danger` `info`, each with a `-tint` companion
(`text-ok` / `bg-ok-tint`). Status colour is never the brand colour.

### Radius / elevation / motion

`rounded-sm|md|lg|xl|2xl` (8/10/14/20/28px) · `shadow-e1|e2|e3` ·
`duration-[var(--t-1)]` 120ms, `--t-2` 200ms, `--t-3` 380ms ·
`ease-[var(--ease)]`

---

## Utility classes

`k-focus` — **put this on every interactive element.** One focus ring, product-wide.
`k-display` `k-h1` `k-h2` `k-label` — the type scale. `k-label` is the only uppercase.
`k-num` — **required** on any figure: credits, prices, counts, dates in a column.
`k-scroll-x` — wrap any wide table/code block. The page body must never scroll sideways.
`k-msg-in` `k-step-in` `k-step-active` — entrance and progress animations.
`k-preview-busy` / `k-preview-idle` — the preview treatment while the AI works.
`k-wash` — ambient brand glow inside a hero panel. Sparingly: one per page, at most.
`k-gradient-border` — gradient hairline. Reserve for the single most important panel.

---

## Components (`components/ui/`)

Import these. **Do not hand-roll a second version of any of them.**

| Component | Notes |
| --- | --- |
| `Button` `ButtonLink` `IconButton` `buttonClass` | Variants `primary\|secondary\|ghost\|soft\|danger`, sizes `xs\|sm\|md\|lg`. **One `primary` per view.** `IconButton` requires `label`. |
| `Card` `CardHeader` `SectionHeader` | `interactive` only if it truly responds. |
| `Badge` | `tone` + `dot` + `pulse`. Set `dot` on anything conveying live state — colour alone is not a status channel. |
| `Input` `Textarea` `Select` `SearchInput` | Label/hint/error/aria wiring is built in. Never hand-write a bare `<input>`. |
| `Progress` `toneForUsage` | Recolours as it fills. `indeterminate` for work with no known end. |
| `Skeleton` `SkeletonList` | Stagger with `delay`. |
| `EmptyState` | `kind` is required: `empty` (none yet) / `no-results` (filter too narrow) / `unavailable` (does not exist yet). These need different sentences. |
| `Menu` | Keyboard + Escape + click-outside already handled. `unavailableReason` greys an item and says why. |
| `Modal` `ConfirmModal` | Native `<dialog>`. Confirm buttons are labelled with the verb, never "OK". |
| `ToastProvider` `useToast` | Provider is already mounted by `AppShell`. Errors and toasts with an action do not auto-dismiss. |
| `Segmented` | Real radios. Used for grid/list and device toggles. |
| `AIProgress` `stepsAt` | **The** progress component. See below. |
| `Stat` `StatRow` | Any number the customer must understand. |
| `Avatar` | Initials only — there is no avatar upload. |
| `Spinner` | |

## Shell (`components/app/`)

`AppShell` wraps every portal page and already provides the sidebar, mobile
drawer, bottom bar and toast host. **A page renders content only** — no page
supplies its own nav, no page sets a background, no page mounts a second
`ToastProvider`, and no page sets a title suffix (the group layout owns the
`"%s — Kodely"` template; a page declares only its own noun).

Navigation lives in `components/app/nav.ts`. An item may only be added there
once it is backed by real data; `soon: true` marks the ones that are not.

`SidebarFooter` carries the brand-gradient credits card, the theme toggle and
the bug/feature link (`/support?topic=bug`, `?topic=feature`). It appears in
both the desktop rail and the mobile drawer.

**The credits card has no progress bar and no "X of Y" figure, deliberately.**
There is no allowance for the balance to be a fraction of — credits are bought
in packs and never expire — so a bar would have to invent a denominator. It
shows the balance and "about N more builds" from `averageBuildCredits()`.
**Anything else in the product showing credits must agree with it.** A card
elsewhere claiming a monthly total would contradict the rail sitting beside it.

### Where the brand gradient may be used as a fill

Three places, and nowhere else: the single `primary` button on a view, the
sidebar credits card, and the `/support` credits card. Not on headings, cards,
borders, icons or section dividers.

---

## AI progress is one object, not three spinners

`AIProgress` is rendered by the initial build overlay, by the chat panel during
an edit, and beside the preview. All three must show the **same steps in the
same state**, because the customer reads them as one thing happening.

**Drive `state` from real build signals.** A timer that walks the list forward on
its own is a fake — and it will still be sitting on "Finalizing" long after a
build has failed. The build genuinely does not know its percentage (it is an
agent loop of unknown length), which is exactly why this is a named-step list
and not a progress bar.

---

## What does not exist (audited — do not build UI that pretends otherwise)

| Thing | Reality |
| --- | --- |
| **Plans / subscriptions** | None. No plan, price, or renewal date. Checkout is one-off `payment` mode for credit packs. **Never render a "Pro" chip or "$X/month".** |
| **Credit reset date** | Credits never expire. There is no monthly allowance and no reset day — the spend cap is a *rolling* 30 days chosen so there is no reset. |
| **Invoices / payment method** | Not fetched from Stripe. The credit ledger is the only history. |
| **Thumbnails** | Nothing captures a screenshot. No headless browser. |
| **Project status** | Only `publishedAt` → Published / Draft. No `archived`. "Building" is derivable from `Build.status = RUNNING` but has no staleness rule, so it is not yet trustworthy. |
| **Domains** | No model, no field, no route. Sites live at `<slug>.kodely.site` only. |
| **Integrations** | Nothing customer-facing. |
| ~~**Support tickets**~~ | **NOW BUILT.** `SupportTicket` + `SupportMessage` exist, with customer-visible staff replies. `SupportNote` remains a separate, admin-only internal note that is still never shown to the customer — do not conflate them. Tickets are included in the data export and the deletion preview; if you add a field holding a customer's words, both must be updated too. |
| **Storage / bandwidth** | Not measured anywhere. |
| **Workspaces / members / roles** | No concept of it. Ownership is one FK: `Project.userId`. |
| **Avatar upload, password change, 2FA, notification prefs** | None. |

**Sessions list and revoke, and editing `User.name`, are now BUILT** — see
`/settings/security` and `/settings`. Note what `Session` actually records:
`id · userId · tokenHash · expiresAt · createdAt`, and nothing else. There is no
user agent, no IP, no last-seen and no device. Do not add a column for them
casually: `/legal/rights` and the data export both enumerate in writing
everything the database holds, so a new personal-data field silently makes two
published documents wrong.

### The rule

A screen that looks operable and is not is worse than an absent one. A screen
that says "this does not exist yet, here is what you have instead" is neither.
Use `EmptyState kind="unavailable"` and say plainly what is missing.
