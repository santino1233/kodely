import type { Template } from "@/lib/templates";
import type { PaletteChoice } from "@/lib/brand-kit";

/**
 * The questions each template actually needs, and the assembly of the answers
 * back into its prompt.
 *
 * DERIVED FROM THE PROMPTS, NOT INVENTED
 * Every prompt in `lib/templates.ts` is already written with bracketed
 * placeholders for "the facts only the owner knows" — `[your restaurant's
 * name]`, `[cuisine, e.g. modern Italian]`, `[your opening hours]`. Those
 * brackets ARE the question list, written by whoever wrote the prompt, so the
 * fields below are keyed to the literal token they replace rather than to a
 * generic idea of what a business has. That is why the restaurant is asked for
 * a cuisine and opening hours, the photographer for a speciality and a region,
 * and the wedding page for two first names — and why no template is asked
 * anything its prompt would not use.
 *
 * WHY NOT EVERY BRACKET
 * Three kinds of placeholder are deliberately left alone:
 *   - ROW REPEATS. `[date] / [venue] / [city]` in the band's gig list, `[time]
 *     / [session title] / [speaker name]` in the conference programme, `[client
 *     name]` in three agency case studies. One answer cannot fill a list, and
 *     an intake form with twelve gig rows is not an intake form.
 *   - EXAMPLES. `[photo: ceremony, Ravenswood barn]` is showing the model the
 *     shape of a caption, not asking the customer for one.
 *   - POLICY PROSE. `[your cancellation policy]`, `[your insurance details]`,
 *     `[your wording]` for gifts. These are paragraphs, and the honest place to
 *     write them is the prompt box on the review step, which is editable.
 * They stay as brackets, which is exactly what the prompts tell the builder to
 * do with a fact it has not been given. Nothing is invented to fill a gap.
 *
 * EVERYTHING IS OPTIONAL
 * Skipping a field leaves its bracket untouched, so the prompt degrades to the
 * hand-written original — which already works on its own. That is the whole
 * reason substitution was chosen over appending an answers block: a half-filled
 * form produces a prompt with fewer blanks, never a broken one.
 */

export type IntakeField = {
  id: string;
  label: string;
  /** `long` gets a textarea; everything else is a single-line input. */
  kind: "text" | "long";
  /** Exact bracket tokens in this template's prompt that the answer replaces. */
  tokens: string[];
  /** An example, shown as the input's placeholder. Never submitted. */
  example?: string;
  hint?: string;
  /** Takes the full row of the two-column grid. */
  wide?: boolean;
};

const TEXT = "text" as const;
const LONG = "long" as const;

export const TEMPLATE_FIELDS: Record<string, IntakeField[]> = {
  restaurant: [
    { id: "name", label: "Restaurant name", kind: TEXT, tokens: ["[your restaurant's name]"], example: "Sale e Pepe" },
    { id: "cuisine", label: "Cuisine", kind: TEXT, tokens: ["[cuisine, e.g. modern Italian]"], example: "modern Italian" },
    { id: "city", label: "City", kind: TEXT, tokens: ["[your city]"], example: "Leeds" },
    { id: "address", label: "Address", kind: TEXT, tokens: ["[your address]"], example: "14 Call Lane, LS1 6DN" },
    { id: "hours", label: "Opening hours", kind: LONG, tokens: ["[your opening hours]"], example: "Tue–Sat 5pm–11pm, Sun 12pm–6pm", wide: true },
    { id: "phone", label: "Phone number", kind: TEXT, tokens: ["[your phone number]"], example: "0113 496 0000" },
    { id: "email", label: "Email", kind: TEXT, tokens: ["[your email]"], example: "hello@example.com" },
  ],
  "coffee-shop": [
    { id: "name", label: "Cafe name", kind: TEXT, tokens: ["[your cafe's name]"], example: "Fold" },
    { id: "area", label: "Neighbourhood and city", kind: TEXT, tokens: ["[your neighbourhood, your city]"], example: "Chorlton, Manchester" },
    { id: "promise", label: "What makes your coffee worth the walk", kind: LONG, tokens: ["[what makes your coffee worth the walk]"], example: "Single-origin filter, roasted three streets away", wide: true },
    { id: "address", label: "Address", kind: TEXT, tokens: ["[your address]"], example: "8 Beech Road" },
    { id: "hours", label: "Opening hours", kind: TEXT, tokens: ["[your opening hours]"], example: "Mon–Fri 7–4, weekends 8–5" },
    { id: "phone", label: "Phone number", kind: TEXT, tokens: ["[your phone number]"], example: "0161 000 0000" },
  ],
  "food-truck": [
    { id: "name", label: "Truck name", kind: TEXT, tokens: ["[your food truck's name]"], example: "Smoke & Rye" },
    { id: "food", label: "What you cook", kind: TEXT, tokens: ["[what you cook, e.g. Korean-Mexican]"], example: "Korean-Mexican" },
    { id: "city", label: "City you work around", kind: TEXT, tokens: ["[your city]"], example: "Bristol" },
    { id: "monday", label: "Where you park on Mondays", kind: TEXT, tokens: ["[your Monday stop]"], example: "Finzels Reach, 11:30–2:30" },
    { id: "phone", label: "Phone number", kind: TEXT, tokens: ["[your phone number]"], example: "07700 900000" },
  ],
  barbershop: [
    { id: "name", label: "Shop name", kind: TEXT, tokens: ["[your barbershop's name]"], example: "Sharps" },
    { id: "city", label: "City", kind: TEXT, tokens: ["[your city]"], example: "Glasgow" },
    { id: "street", label: "Street you are on", kind: TEXT, tokens: ["[your street]"], example: "Hope Street" },
    { id: "phone", label: "Phone number", kind: TEXT, tokens: ["[your phone number]"], example: "0141 000 0000" },
    { id: "booking", label: "Booking link", kind: TEXT, tokens: ["[link to your booking system, e.g. Booksy or Fresha]"], example: "https://booksy.com/…", hint: "Paste the URL of the booking tool you already use. The page links out to it — nothing books here.", wide: true },
  ],
  "hair-salon": [
    { id: "name", label: "Salon name", kind: TEXT, tokens: ["[your salon's name]"], example: "Atelier 9" },
    { id: "city", label: "City", kind: TEXT, tokens: ["[your city]"], example: "Bath" },
    { id: "category", label: "Your fourth treatment group", kind: TEXT, tokens: ["[your other category]"], example: "brows and lashes" },
    { id: "address", label: "Address", kind: TEXT, tokens: ["[your address]"], example: "3 Green Street" },
    { id: "booking", label: "Booking link", kind: TEXT, tokens: ["[link to your booking system]"], example: "https://fresha.com/…", wide: true },
  ],
  "gym-studio": [
    { id: "name", label: "Studio name", kind: TEXT, tokens: ["[your studio's name]"], example: "Basecamp" },
    { id: "type", label: "Type of studio", kind: TEXT, tokens: ["[type, e.g. reformer pilates / CrossFit / boxing]"], example: "reformer pilates" },
    { id: "city", label: "City", kind: TEXT, tokens: ["[your city]"], example: "Cardiff" },
    { id: "booking", label: "Booking link", kind: TEXT, tokens: ["[link to your booking system]"], example: "https://…", wide: true },
  ],
  tradesperson: [
    { id: "name", label: "Your name or business name", kind: TEXT, tokens: ["[your name / your business name]"], example: "D. Whelan Plumbing" },
    { id: "trade", label: "Trade", kind: TEXT, tokens: ["[trade, e.g. plumber / electrician / carpenter]"], example: "plumber" },
    { id: "area", label: "Town and areas covered", kind: TEXT, tokens: ["[your town and the areas around it]"], example: "Stockport and south Manchester", wide: true },
    { id: "phone", label: "Phone number", kind: TEXT, tokens: ["[your phone number]"], example: "07700 900123", hint: "The most important thing on this page — it becomes the big call button." },
    { id: "years", label: "Years in the trade", kind: TEXT, tokens: ["[years in the trade]"], example: "18" },
    { id: "quals", label: "Qualifications or registration number", kind: TEXT, tokens: ["[your qualifications/registration number]"], example: "Gas Safe 123456", hint: "Left blank it stays a placeholder — the prompt forbids inventing one." },
    { id: "quotes", label: "How you quote", kind: TEXT, tokens: ["[whether you give free quotes]"], example: "free written quotes, no call-out charge" },
  ],
  "local-service": [
    { id: "name", label: "Business name", kind: TEXT, tokens: ["[your business name]"], example: "Bright & Early" },
    { id: "service", label: "Service", kind: TEXT, tokens: ["[service, e.g. domestic cleaning / gardening / dog walking]"], example: "domestic cleaning" },
    { id: "area", label: "Area you serve", kind: TEXT, tokens: ["[your area]"], example: "north Leeds" },
    { id: "price", label: "Your lowest 'from' price", kind: TEXT, tokens: ["[price]"], example: "£18/hr" },
    { id: "booking", label: "Booking link", kind: TEXT, tokens: ["[link to your booking system]"], example: "https://…", wide: true },
  ],
  "law-firm": [
    { id: "name", label: "Firm name", kind: TEXT, tokens: ["[your firm's name]"], example: "Harrow & Vale" },
    { id: "size", label: "Size of the firm", kind: TEXT, tokens: ["[size, e.g. three-partner]"], example: "three-partner" },
    { id: "city", label: "City", kind: TEXT, tokens: ["[your city]"], example: "Norwich" },
    { id: "areas", label: "Practice areas", kind: LONG, tokens: ["[your practice areas]"], example: "family law, wills and probate, employment disputes", wide: true },
    { id: "fees", label: "How fees are structured", kind: TEXT, tokens: ["[your fee basis]"], example: "fixed fees agreed up front", wide: true },
  ],
  accountancy: [
    { id: "name", label: "Practice name", kind: TEXT, tokens: ["[your practice's name]"], example: "Ledger & Co" },
    { id: "city", label: "City", kind: TEXT, tokens: ["[your city]"], example: "Nottingham" },
    { id: "clients", label: "Who you work with", kind: TEXT, tokens: ["[your client type, e.g. freelancers and small limited companies]"], example: "freelancers and small limited companies", wide: true },
    { id: "service", label: "Your sixth service", kind: TEXT, tokens: ["[your other service]"], example: "R&D claims" },
    { id: "pricing", label: "How you price", kind: TEXT, tokens: ["[your pricing basis, e.g. fixed monthly fee]"], example: "fixed monthly fee" },
    { id: "software", label: "Software you use", kind: TEXT, tokens: ["[your software, e.g. Xero]"], example: "Xero" },
  ],
  consultant: [
    { id: "name", label: "Your name", kind: TEXT, tokens: ["[your name]"], example: "Priya Raman" },
    // The prompt names the discipline twice, in two differently-worded
    // brackets. One question, both tokens.
    { id: "discipline", label: "Your discipline", kind: TEXT, tokens: ["[your discipline, e.g. operations / brand / data]", "[your discipline]"], example: "operations" },
    { id: "clients", label: "Who you work with", kind: TEXT, tokens: ["[your client type]"], example: "Series A software companies", wide: true },
    { id: "scheduling", label: "Scheduling link", kind: TEXT, tokens: ["[link to your scheduling tool]"], example: "https://cal.com/…" },
    { id: "linkedin", label: "LinkedIn", kind: TEXT, tokens: ["[your LinkedIn]"], example: "https://linkedin.com/in/…" },
  ],
  agency: [
    { id: "name", label: "Agency name", kind: TEXT, tokens: ["[your agency's name]"], example: "Northbound" },
    { id: "type", label: "Type of agency", kind: TEXT, tokens: ["[type, e.g. brand and digital]"], example: "brand and digital" },
    { id: "city", label: "City", kind: TEXT, tokens: ["[your city]"], example: "Dublin" },
    { id: "fourth", label: "Your fourth service", kind: TEXT, tokens: ["[your fourth]"], example: "motion and film" },
    { id: "address", label: "Studio address", kind: TEXT, tokens: ["[your studio address]"], example: "Unit 4, Barrow Street" },
    { id: "phone", label: "Phone number", kind: TEXT, tokens: ["[your phone number]"], example: "+353 1 000 0000" },
  ],
  "personal-portfolio": [
    { id: "name", label: "Your name", kind: TEXT, tokens: ["[your name]"], example: "Sam Okafor" },
    { id: "role", label: "Your role", kind: TEXT, tokens: ["[your role, e.g. product designer / frontend developer]"], example: "product designer" },
    { id: "city", label: "City", kind: TEXT, tokens: ["[your city]"], example: "Berlin" },
    { id: "github", label: "GitHub", kind: TEXT, tokens: ["[your GitHub]"], example: "https://github.com/…" },
    { id: "linkedin", label: "LinkedIn", kind: TEXT, tokens: ["[your LinkedIn]"], example: "https://linkedin.com/in/…" },
  ],
  photographer: [
    { id: "name", label: "Your name", kind: TEXT, tokens: ["[your name]"], example: "Mara Ellis" },
    { id: "type", label: "What you shoot", kind: TEXT, tokens: ["[type, e.g. wedding and portrait]"], example: "wedding and portrait" },
    { id: "region", label: "City and region", kind: TEXT, tokens: ["[your city and region]"], example: "Edinburgh and the Borders" },
    { id: "occasion", label: "The occasion your clients are planning", kind: TEXT, tokens: ["[the occasion, e.g. a wedding]"], example: "a wedding" },
    { id: "instagram", label: "Instagram", kind: TEXT, tokens: ["[your Instagram]"], example: "https://instagram.com/…", wide: true },
  ],
  "band-musician": [
    { id: "name", label: "Band or artist name", kind: TEXT, tokens: ["[band or artist name]"], example: "Ruined Maps" },
    { id: "genre", label: "Genre", kind: TEXT, tokens: ["[genre]"], example: "post-punk" },
    { id: "city", label: "City", kind: TEXT, tokens: ["[your city]"], example: "Sheffield" },
    { id: "release", label: "Latest release", kind: TEXT, tokens: ["[latest release name]"], example: "Second Sight EP" },
    { id: "spotify", label: "Spotify link", kind: TEXT, tokens: ["[your Spotify]"], example: "https://open.spotify.com/…" },
    { id: "booking", label: "Booking email", kind: TEXT, tokens: ["[booking email]"], example: "bookings@example.com" },
  ],
  "personal-blog": [
    { id: "name", label: "Your name", kind: TEXT, tokens: ["[your name]"], example: "Jo Kessler" },
    { id: "subjects", label: "What you write about", kind: TEXT, tokens: ["[your subjects, e.g. software, cities and cooking]"], example: "software, cities and cooking", wide: true },
    { id: "email", label: "Email", kind: TEXT, tokens: ["[your email]"], example: "jo@example.com" },
    { id: "github", label: "GitHub", kind: TEXT, tokens: ["[your GitHub]"], example: "https://github.com/…" },
    { id: "social", label: "Mastodon or X", kind: TEXT, tokens: ["[your Mastodon or X]"], example: "https://mastodon.social/@…" },
    { id: "current", label: "What you are working on now", kind: TEXT, tokens: ["[your current project]"], example: "a book about small cities", wide: true },
  ],
  "link-in-bio": [
    { id: "handle", label: "Name or handle", kind: TEXT, tokens: ["[your name or handle]"], example: "@quietstudio" },
    { id: "what", label: "What you do", kind: TEXT, tokens: ["[what you do, e.g. illustrator and podcast host]"], example: "illustrator and podcast host", wide: true },
    { id: "newsletter", label: "Newsletter link", kind: TEXT, tokens: ["[your newsletter]"], example: "https://…" },
    { id: "shop", label: "Shop link", kind: TEXT, tokens: ["[your shop]"], example: "https://…" },
    { id: "portfolio", label: "Portfolio link", kind: TEXT, tokens: ["[your portfolio]"], example: "https://…", hint: "The other buttons stay as placeholders you paste URLs into later.", wide: true },
  ],
  "saas-landing": [
    { id: "product", label: "Product name", kind: TEXT, tokens: ["[your product name]"], example: "Trackline" },
    { id: "category", label: "Category", kind: TEXT, tokens: ["[category, e.g. project tracking]"], example: "project tracking" },
    { id: "audience", label: "Who it is for", kind: TEXT, tokens: ["[your audience, e.g. small agencies]"], example: "small agencies", wide: true },
    { id: "signup", label: "Sign-up URL", kind: TEXT, tokens: ["[your app signup URL]"], example: "https://app.example.com/signup" },
    { id: "login", label: "Sign-in URL", kind: TEXT, tokens: ["[your app login URL]"], example: "https://app.example.com/login" },
    { id: "price", label: "Starting price", kind: TEXT, tokens: ["[your price]"], example: "$19/month" },
    { id: "email", label: "Contact email", kind: TEXT, tokens: ["[your email]"], example: "hello@example.com" },
  ],
  "product-launch": [
    { id: "product", label: "Product name", kind: TEXT, tokens: ["[your product name]"], example: "Field Notes Vol. 3" },
    { id: "what", label: "What it is", kind: TEXT, tokens: ["[what it is, e.g. hardcover book / mechanical keyboard / iOS app]"], example: "hardcover book" },
    { id: "maker", label: "Your name or company", kind: TEXT, tokens: ["[your name or company]"], example: "Ash Editions" },
    { id: "price", label: "Price", kind: TEXT, tokens: ["[your price]"], example: "£28" },
    { id: "store", label: "Where you sell it", kind: TEXT, tokens: ["[your store]"], example: "Big Cartel", hint: "Becomes the button label — “Buy on Big Cartel”." },
    { id: "storeUrl", label: "Store URL", kind: TEXT, tokens: ["[your store URL]"], example: "https://…" },
  ],
  "coming-soon": [
    { id: "project", label: "Project name", kind: TEXT, tokens: ["[your project name]"], example: "Halfway" },
    { id: "what", label: "One line on what it will be", kind: LONG, tokens: ["[one line on what it will be]"], example: "a walking app that only suggests routes you have never taken", wide: true },
    { id: "window", label: "Launch window", kind: TEXT, tokens: ["[your launch window]"], example: "spring 2027" },
    { id: "email", label: "Email", kind: TEXT, tokens: ["[your email]"], example: "hello@example.com" },
    { id: "form", label: "Signup form link", kind: TEXT, tokens: ["[link to your signup form, e.g. Tally or Google Form]"], example: "https://tally.so/…", hint: "Nothing on the page can collect an address itself, so this is the list.", wide: true },
  ],
  wedding: [
    // Two name fields on purpose. One combined answer would leave a stray
    // second bracket in the hero, which is the known rough edge in the
    // wizard's generic substitution.
    { id: "nameOne", label: "First name", kind: TEXT, tokens: ["[name one]"], example: "Alex" },
    { id: "nameTwo", label: "Second name", kind: TEXT, tokens: ["[name two]"], example: "Rowan" },
    { id: "date", label: "Date", kind: TEXT, tokens: ["[your date]"], example: "12 September 2027" },
    { id: "venue", label: "Venue and town", kind: TEXT, tokens: ["[your venue, your town]"], example: "Ravenswood Barn, Alnwick" },
    { id: "dress", label: "Dress code", kind: TEXT, tokens: ["[your dress code]"], example: "smart, and bring flat shoes for the field" },
    { id: "email", label: "RSVP email", kind: TEXT, tokens: ["[your email]"], example: "alexandrowan@example.com" },
    { id: "rsvp", label: "RSVP form link", kind: TEXT, tokens: ["[link to your RSVP form]"], example: "https://…", wide: true },
  ],
  event: [
    { id: "name", label: "Event name", kind: TEXT, tokens: ["[event name]"], example: "Northern Interfaces" },
    { id: "type", label: "Type of event", kind: TEXT, tokens: ["[type, e.g. one-day conference / workshop / meetup]"], example: "one-day conference" },
    { id: "date", label: "Date", kind: TEXT, tokens: ["[your date]"], example: "4 March 2027" },
    { id: "venue", label: "Venue and city", kind: TEXT, tokens: ["[your venue, your city]"], example: "The Round Foundry, Leeds" },
    { id: "price", label: "Ticket price", kind: TEXT, tokens: ["[ticket price]"], example: "£95" },
    { id: "tickets", label: "Ticket page URL", kind: TEXT, tokens: ["[your ticket page URL]"], example: "https://tickettailor.com/…" },
    { id: "email", label: "Contact email", kind: TEXT, tokens: ["[your email]"], example: "hello@example.com", wide: true },
  ],
  nonprofit: [
    { id: "name", label: "Organisation name", kind: TEXT, tokens: ["[your organisation's name]"], example: "Corner House" },
    { id: "type", label: "What kind of organisation", kind: TEXT, tokens: ["[type, e.g. registered charity / volunteer-run community group]"], example: "volunteer-run community group" },
    { id: "area", label: "Area you work in", kind: TEXT, tokens: ["[your area]"], example: "east Kilburn" },
    { id: "cause", label: "What you work on", kind: TEXT, tokens: ["[your cause]"], example: "food poverty and holiday hunger" },
    { id: "phone", label: "Phone number", kind: TEXT, tokens: ["[your phone number]"], example: "020 0000 0000", hint: "This sits high on the page, for the people who need help." },
    { id: "email", label: "Email", kind: TEXT, tokens: ["[your email]"], example: "hello@example.org" },
    { id: "donate", label: "Donation page URL", kind: TEXT, tokens: ["[your donation platform URL]"], example: "https://justgiving.com/…", wide: true },
  ],
};

/** Never throws for an unknown id — an unmapped template simply asks nothing
    and starts from its prompt as written, which is a valid outcome. */
export function fieldsFor(templateId: string): IntakeField[] {
  return TEMPLATE_FIELDS[templateId] ?? [];
}

const MAX_TEXT = 120;
const MAX_LONG = 260;

/**
 * What actually goes into the prompt.
 *
 * Square brackets are stripped from the answer: the prompt's whole convention
 * is that a bracket means "this is still unknown", and letting someone type
 * `[TBD]` into a field would quietly hand the builder a placeholder that looks
 * like an instruction. Newlines collapse because every one of these tokens sits
 * inline in a sentence.
 */
export function cleanAnswer(raw: string, kind: IntakeField["kind"]): string {
  return raw
    .replace(/[[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, kind === "long" ? MAX_LONG : MAX_TEXT)
    .trim();
}

/**
 * The palette block, in the vocabulary `lib/wizard.ts` already established: the
 * preset id, the literal stops and an instruction to pull the real source
 * through `find_assets` rather than improvising a lookalike. No adjective ever
 * travels on its own.
 */
function paletteBlock(choice: PaletteChoice): string {
  const p = choice.palette;
  return [
    "Visual direction — I chose these colours, so build to them rather than picking your own. Where this disagrees with a colour hint earlier in the brief, this wins:",
    `- Palette: ${choice.id} (${choice.colors.join(" to ")}). Use find_assets with the query "${choice.id}" to pull the exact gradient source, make those the dominant colours, and derive the rest from those hexes. Do not substitute a different colour.`,
    `- Primary ${p.primary}, secondary ${p.secondary}, accent ${p.accent}.`,
    `- Page: ${p.ink} text on ${p.surface}. Keep the dark mode working.`,
  ].join("\n");
}

const LOGO_BLOCK = [
  "My logo is attached to this build as a reference image.",
  "Recreate it as inline SVG or as a simple type lockup in the header and the footer — do not link to a file, and do not leave an empty logo box. Take the palette's lead from it where that does not fight the direction above.",
].join(" ");

/**
 * Template prompt + answers + choices, as one editable string.
 *
 * Pure and deterministic: the same inputs always produce the same text, which
 * is what lets the review step re-derive the prompt after an edit is reverted
 * and what makes "go back, change one answer, come forward" show a diff the
 * customer can actually follow.
 */
export function assembleTemplatePrompt({
  template,
  answers,
  palette,
  hasLogo,
}: {
  template: Template;
  answers: Record<string, string>;
  palette: PaletteChoice | null;
  hasLogo: boolean;
}): string {
  let body = template.prompt;

  for (const field of fieldsFor(template.id)) {
    const value = cleanAnswer(answers[field.id] ?? "", field.kind);
    if (!value) continue;
    for (const token of field.tokens) body = body.split(token).join(value);
  }

  return [body.trim(), palette ? paletteBlock(palette) : "", hasLogo ? LOGO_BLOCK : ""]
    .filter(Boolean)
    .join("\n\n");
}

/** True once anything has been typed or chosen — drives the "you have unsaved
    answers" affordances rather than a naive dirty flag on every keystroke. */
export function hasIntake(answers: Record<string, string>): boolean {
  return Object.values(answers).some((v) => v.trim() !== "");
}
