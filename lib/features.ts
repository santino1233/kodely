/**
 * The feature library — the things a customer can switch ON for their site,
 * and the things Kodely will not pretend to offer.
 *
 * ## Every toggle is a promise about the finished site
 *
 * A generated site is a real Vite + React + TypeScript + Tailwind app, built
 * server-side and served under
 *
 *   default-src 'self'; style-src 'self' 'unsafe-inline';
 *   script-src 'self' 'unsafe-inline'; img-src 'self' data:;
 *   connect-src 'none'; frame-ancestors 'self'; form-action 'self';
 *   base-uri 'none'; object-src 'none'
 *
 * (app/api/site/[slug]/[[...path]]/route.ts, and a byte-identical copy in
 * app/api/preview/[id]/[[...path]]/route.ts). There is no database, no
 * accounts, no payments, no CDN and no remote anything. lib/agent.ts spells the
 * same constraints out to the model.
 *
 * So a feature only earns a place in FEATURES if the finished, published site
 * genuinely does the thing the label says. Everything a customer will
 * reasonably ask for and that we CANNOT do is in NOT_OFFERED instead, named out
 * loud with the real reason and a real alternative — not hidden, and never
 * shown greyed-out behind an invented upgrade. The design system's rule is that
 * a screen which says "this does not exist, here is what you have instead" is
 * better than one that looks operable and is not; NOT_OFFERED is that rule as
 * data.
 *
 * ## The one thing that IS server-backed
 *
 * Forms. lib/site-forms.ts answers `POST /__forms/<name>` on a PUBLISHED site's
 * own origin — which is us, because proxy.ts rewrites `<slug>.kodely.site` into
 * the site route — stores the submission, and emails it to the owner. The page
 * itself stays completely static: a plain `<form method="post">` is a
 * NAVIGATION, so `connect-src 'none'` is untouched and `form-action 'self'` did
 * not have to be widened by a character.
 *
 * Two caveats travel with that, and both are in `caveat` below rather than in
 * small print:
 *   - It works once the site is PUBLISHED. submitSiteForm() refuses anything
 *     whose project has no publishedAt, and the in-editor draft preview is
 *     served from a different route entirely, so a form in the preview does
 *     nothing when submitted.
 *   - There is no mailing-list integration behind any of it. A "keep me posted"
 *     form collects addresses into the owner's submissions inbox. It does not
 *     subscribe anybody to anything.
 *
 * ## Adding a feature later
 *
 * Append to FEATURES. `id` is stable (it travels in analytics and in saved
 * answers), `description` is one true customer-facing line, `caveat` is
 * mandatory the moment the honest description needs a "but", and `fragment` is
 * the prose that lands in the build brief. Nothing else in the wizard needs to
 * change — the UI groups by `category` and the brief is assembled from
 * `fragment` in list order.
 */

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

export const FEATURE_CATEGORIES = [
  "Getting in touch",
  "The practical details",
  "What you offer",
  "Proof and trust",
  "Story and closing",
] as const;

export type FeatureCategory = (typeof FEATURE_CATEGORIES)[number];

export type SiteFeature = {
  /** Stable. Ends up in saved answers and analytics — never renumber. */
  id: string;
  label: string;
  /**
   * One line the customer reads before ticking the box, and it has to be TRUE
   * of the finished site. If it needs a "but", that half goes in `caveat`.
   */
  description: string;
  category: FeatureCategory;
  /**
   * The thing the customer would otherwise find out after publishing. Rendered
   * next to the toggle, never in a footnote. Absent means there genuinely isn't
   * one.
   */
  caveat?: string;
  /**
   * What this contributes to the build brief. Written in the same voice as the
   * starter prompts in lib/templates.ts: concrete sections, bracketed
   * placeholders for facts only the owner knows, link-outs instead of
   * machinery that does not exist.
   */
  fragment: string;
  /**
   * Set on the two form features, and only on them.
   *
   * EVERY starter prompt in lib/templates.ts, the generic skeleton in
   * lib/wizard.ts, and the SYSTEM prompt in lib/agent.ts all carry a flat "there
   * is no backend, so do not build a contact form" — written before
   * lib/site-forms.ts existed, and still correct about every other kind of
   * form. Appending a form fragment to one of those briefs without saying so
   * would hand the model two contradictory instructions and let it pick.
   *
   * So `featuresFragment` opens with an explicit supersession notice whenever a
   * feature sets this. It quotes the rule it is overriding, gives the mechanism
   * that makes the override legitimate, and narrows the override to these two
   * endpoints — because everything else that rule refuses (booking, checkout,
   * login) is still genuinely impossible.
   */
  supersedesNoFormRule?: true;
};

/** Something customers ask for that a Kodely site cannot do, said plainly. */
export type UnavailableFeature = {
  id: string;
  label: string;
  /** Why not — the actual mechanism, not "not supported yet". */
  reason: string;
  /** What to do instead. Always something that really works. */
  instead: string;
};

// ---------------------------------------------------------------------------
// What a Kodely site can actually do
// ---------------------------------------------------------------------------

export const FEATURES: SiteFeature[] = [
  // ── Getting in touch ─────────────────────────────────────────────────────
  {
    id: "contact-form",
    label: "Contact form",
    description:
      "A working contact form. Every message is emailed to you and kept in your Kodely submissions inbox.",
    category: "Getting in touch",
    caveat:
      "It starts working the moment you publish. A form in the in-Kodely preview looks right but does not send.",
    supersedesNoFormRule: true,
    fragment: `This one genuinely works, so build it rather than substituting a mailto: link. Build it exactly like this:
- \`<form method="post" action="/__forms/contact">\`. A plain HTML form and nothing else: no fetch, no onSubmit handler, no JavaScript at all. The browser navigates, which is what the site's strict CSP allows; a scripted request would be blocked.
- Three fields, using exactly these name attributes, each with a real visible <label>: \`name\`, \`email\` (type="email"), \`message\` (a <textarea>).
- A spam honeypot the platform already checks for: \`<input type="text" name="_gotcha" tabIndex={-1} autoComplete="off" aria-hidden="true" />\` inside a visually-hidden wrapper, so no sighted or screen-reader user ever meets it.
- The submit button reads "Send message" — never "Submit" or "Send".
- One line of small print under it: messages go to [your email address].
Also keep a mailto: link to [your email address] and a tel: link to [your phone number] close by, so a visitor who would rather not use a form still has a way through.`,
  },
  {
    id: "email-button",
    label: "“Email us” button",
    description:
      "A prominent button that opens the visitor's own mail app with your address already filled in.",
    category: "Getting in touch",
    fragment: `An "Email us" call to action: an \`<a href="mailto:[your email address]">\` styled as a primary button, with a label that names the destination ("Email us"), never "Submit". Put one in the hero and one in the footer.`,
  },
  {
    id: "call-button",
    label: "“Call us” button",
    description: "A button that dials straight from a phone and shows the number on a desktop.",
    category: "Getting in touch",
    fragment: `A "Call us" call to action: an \`<a href="tel:[your phone number]">\` styled as a button, with the number also written out in text beside it so it is readable and copyable on a desktop.`,
  },
  {
    id: "booking-link",
    label: "Link to your booking or ordering service",
    description:
      "A prominent button pointing at the booking, ordering or ticketing service you already use.",
    category: "Getting in touch",
    caveat:
      "Kodely cannot run bookings, availability or payments itself. This links out to the service you already have.",
    fragment: `A prominent "Book now" button linking out to [link to your booking system] — an ordinary \`<a href>\` to an external service, opening in a new tab with rel="noopener". Do NOT build a booking form, a calendar, an availability grid or a date picker: there is no backend behind them and a booking that silently goes nowhere is worse than no booking. If [link to your booking system] is not supplied, the fallback is the tel: link.`,
  },
  {
    id: "enquiry-capture",
    label: "“Keep me posted” sign-up",
    description:
      "A one-field form that collects email addresses into your Kodely submissions inbox and emails each one to you.",
    category: "Getting in touch",
    caveat:
      "It collects addresses — it does not connect to Mailchimp and it never sends anything on your behalf. Like the contact form, it works once you publish.",
    supersedesNoFormRule: true,
    fragment: `A short "keep me posted" sign-up, built on the same real mechanism as the contact form:
- \`<form method="post" action="/__forms/updates">\` — a plain HTML form, no JavaScript.
- One field named \`email\` (type="email") with a real <label>, plus the hidden honeypot \`<input type="text" name="_gotcha" tabIndex={-1} autoComplete="off" aria-hidden="true" />\` in a visually-hidden wrapper.
- The button reads "Keep me posted".
- Directly under it, in small print and in plain words: addresses go straight to [your email address], and there is no automatic mailing list yet — say this rather than implying a newsletter goes out.`,
  },
  {
    id: "social-links",
    label: "Social links",
    description: "Footer links to the profiles you already have, with proper icons.",
    category: "Getting in touch",
    fragment: `A row of social links in the footer, each an ordinary \`<a href>\` to [your social links], with an accessible name on every one. Pull the icons from Kodely's catalogue with the find_assets tool (query "social icons") rather than hand-writing path data, and leave out any platform the owner has not given a link for instead of linking to a homepage.`,
  },

  // ── The practical details ────────────────────────────────────────────────
  {
    id: "opening-hours",
    label: "Opening hours",
    description: "A clear opening-hours table that is readable at a glance on a phone.",
    category: "The practical details",
    fragment: `An opening-hours block: days and times in a real <table> or a two-column definition list, aligned so the times line up, and readable without zooming at 380px. Use whatever opening hours the brief supplied, exactly as written, and leave any day it did not mention as a bracketed placeholder — never guess a closing time, because an invented one sends a real customer to a locked door.`,
  },
  {
    id: "find-us",
    label: "Where to find you",
    description:
      "Your address laid out for a glance, with a “Get directions” button that opens the visitor's own map app.",
    category: "The practical details",
    caveat:
      "An embedded map cannot load on a Kodely site, so this is your address plus a directions link — not a map you can pan around.",
    fragment: `A "Find us" section: [your address] set out on its own lines the way it would be written on an envelope, plus nearby-landmark or parking notes if supplied, plus a "Get directions" button that is an ordinary \`<a href="https://maps.google.com/?q=[your address]">\` opening in a new tab. Do NOT embed a map iframe or a static map image — the site's CSP has no frame-src and its img-src allows only 'self' and data:, so both are blocked by the browser and would render as an empty hole. Carry the section visually with a hand-drawn inline SVG motif or a gradient panel from the asset catalogue instead.`,
  },
  {
    id: "service-area",
    label: "Areas you cover",
    description: "The towns, neighbourhoods or postcodes you travel to, as a readable list.",
    category: "The practical details",
    fragment: `An "Areas we cover" section listing [the areas you cover] as a compact, scannable list of place names — chips or a multi-column list rather than a paragraph — with one line above it saying how far you will travel and whether there is a call-out charge, left as a bracketed placeholder if not supplied.`,
  },

  // ── What you offer ───────────────────────────────────────────────────────
  {
    id: "services",
    label: "What you do",
    description: "Three to six short blocks covering the things you actually offer.",
    category: "What you offer",
    fragment: `A "What we do" section: three to six blocks, each with a short heading, one or two sentences of real copy specific to this business, and an icon pulled from Kodely's catalogue via find_assets. Write the copy properly — no "Lorem ipsum", no "Your Title Here" — but leave any price, duration or guarantee you were not told as a bracketed placeholder.`,
  },
  {
    id: "pricing",
    label: "Prices",
    description: "A price list or a set of pricing tiers, laid out so they compare at a glance.",
    category: "What you offer",
    caveat: "Prices are yours to supply. Kodely leaves them as placeholders rather than guessing.",
    fragment: `A pricing section: either a simple price list or two-to-four tiers, each with a name, the price, and a short list of what is included. Use whatever prices the brief supplied, exactly as written, and a bracketed placeholder everywhere else — an invented price is a promise a real customer will hold the business to. Mark one tier as the recommended one only if the owner said which. No checkout, no cart and no "Buy now" that goes nowhere: the call to action on each tier is the same contact route as the rest of the page.`,
  },
  {
    id: "showcase",
    label: "Work or product showcase",
    description:
      "A grid of what you make or do — each item a drawn card with a heading and a caption.",
    category: "What you offer",
    caveat:
      "Kodely sites cannot include photographs: there is no image upload and remote images are blocked. Each card is illustrated artwork, not a photo.",
    fragment: `A showcase grid of six to nine items, each a card with a heading and a one-line caption. There are NO photographs available and none can be added later, so every card must be carried by design rather than by an empty image frame: an inline SVG motif, a distinct gradient or mesh from the asset catalogue (find_assets), a pattern, or a bold typographic treatment. Do not draw picture-shaped placeholder boxes with a mountain icon in them, and do not reference any remote image URL — the CSP blocks it.`,
  },
  {
    id: "process",
    label: "How it works",
    description: "A numbered sequence explaining what happens after someone gets in touch.",
    category: "What you offer",
    fragment: `A numbered "How it works" sequence — three to five steps, each with a short heading and a sentence — laid out horizontally on a wide screen and stacked on a phone, with the connecting line or numerals drawn in CSS or inline SVG. Describe the real sequence for this kind of business and leave anything schedule- or price-specific as a bracketed placeholder.`,
  },

  // ── Proof and trust ──────────────────────────────────────────────────────
  {
    id: "testimonials",
    label: "Testimonials",
    description: "A testimonials section, designed and laid out, ready for real quotes.",
    category: "Proof and trust",
    caveat:
      "Kodely never writes fake reviews. The quotes arrive as clearly marked placeholders for you to paste your real ones into.",
    fragment: `A testimonials section with room for three quotes. Every quote, name and location must be an obvious bracketed placeholder — ["a real quote from a real customer"], [customer name], [where they are] — because a fabricated endorsement is the one thing on a page that can put the owner in genuine trouble. Design the section so the placeholders look deliberate rather than broken, and add one line of guidance in a code comment about swapping them out.`,
  },
  {
    id: "faq",
    label: "FAQ",
    description: "Questions and answers that expand and collapse, and work without JavaScript.",
    category: "Proof and trust",
    fragment: `An FAQ of five to eight questions, built as native \`<details>\`/\`<summary>\` elements (or a React accordion with correct aria-expanded and aria-controls wiring) so keyboard and screen-reader users get the same behaviour. Write questions this kind of business is genuinely asked, answer them in a real voice, and leave any figure or timescale you cannot know as a bracketed placeholder.`,
  },
  {
    id: "credentials",
    label: "Qualifications and insurance",
    description: "A strip for the memberships, certifications or cover you hold.",
    category: "Proof and trust",
    caveat:
      "Left as placeholders. Kodely will not invent a certification, a membership number or a rating.",
    fragment: `A slim credentials strip — memberships, qualifications, insurance, years in business — as [your qualifications], [your insurance cover] and similar bracketed placeholders. Never invent a body, a registration number, an award or a review score. Set it as small, confident type with a hairline rule rather than as fake badge graphics.`,
  },

  // ── Story and closing ────────────────────────────────────────────────────
  {
    id: "about",
    label: "About",
    description: "A short section in a real voice about who is behind this and why.",
    category: "Story and closing",
    fragment: `An "About" section: two short paragraphs in a real, specific human voice about who is behind this business and why it exists. Invent freely at the level of voice and framing, but never invent a fact — years in business, staff counts, awards and customer numbers all stay as bracketed placeholders.`,
  },
  {
    id: "team",
    label: "The team",
    description: "Names and roles for the people involved, laid out as cards.",
    category: "Story and closing",
    caveat:
      "Names, roles and bios come from you and appear as placeholders until you fill them in. There are no team photos — Kodely sites cannot carry photographs.",
    fragment: `A team section of two to six cards, each with [name], [role] and one line of [short bio]. Use the initials-avatar assets from Kodely's catalogue (find_assets, query "initials avatar") in place of photographs — there is no photo upload and remote images are blocked. Never invent a person's name or job title.`,
  },
  {
    id: "final-cta",
    label: "Closing call to action",
    description: "A last band before the footer that tells the visitor exactly what to do next.",
    category: "Story and closing",
    fragment: `A closing call-to-action band immediately before the footer: one short line restating the offer, and a single unmistakable next step reusing the contact route already chosen elsewhere in this brief. Give it a different background treatment from the sections around it so it reads as the end of the page, and keep any text off the gradient itself where contrast would suffer.`,
  },
];

const BY_ID = new Map(FEATURES.map((f) => [f.id, f]));

export function getFeature(id: string): SiteFeature | undefined {
  return BY_ID.get(id);
}

/** The catalogue grouped for the picker, in FEATURE_CATEGORIES order. Empty
 *  categories are dropped so adding a category ahead of its features is safe. */
export function featuresByCategory(): { category: FeatureCategory; features: SiteFeature[] }[] {
  return FEATURE_CATEGORIES.map((category) => ({
    category,
    features: FEATURES.filter((f) => f.category === category),
  })).filter((group) => group.features.length > 0);
}

/** Ids that are not in the catalogue are dropped, so a stale saved answer or a
 *  renamed feature degrades to "not selected" rather than to a crash. */
export function selectedFeatures(ids: readonly string[]): SiteFeature[] {
  return FEATURES.filter((f) => ids.includes(f.id));
}

/**
 * The features block for the build brief.
 *
 * Emitted in catalogue order rather than click order: the catalogue is ordered
 * roughly the way a page reads (contact, practical detail, offer, proof,
 * story), so the model receives the sections in a sensible sequence whatever
 * order the boxes were ticked in.
 */
export function featuresFragment(ids: readonly string[]): string {
  const chosen = selectedFeatures(ids);
  if (chosen.length === 0) return "";

  const blocks = [
    "Include these as well as the sections above. Where one of them covers the same ground as a section already listed, merge the two rather than building the same thing twice:",
  ];

  // See the note on `supersedesNoFormRule`. This has to be stated before the
  // fragments, not inside one, because it is answering an instruction that
  // appears EARLIER in the assembled brief.
  if (chosen.some((f) => f.supersedesNoFormRule)) {
    blocks.push(
      [
        'One correction to the brief above first. It says there is no backend and no form should be built. That is right about every other kind of form and wrong about exactly two, so treat this paragraph as overriding it for those two and for nothing else.',
        "Kodely's platform answers `POST /__forms/<name>` on a published site's OWN origin — proxy.ts routes that host back into the app — stores the submission, and emails it to the site owner. A plain HTML form is a navigation rather than a scripted request, so this needs no `fetch`, does not touch `connect-src 'none'`, and is permitted as written by `form-action 'self'`. A form built to the shape below therefore delivers a real message to a real inbox; it is not a decoration.",
        "Still genuinely impossible, and still refused: bookings with availability, accounts and logins, carts and checkout, anything that has to read data back. Those stay link-outs.",
      ].join("\n\n"),
    );
  }

  blocks.push(...chosen.map((f) => `${f.label}\n${f.fragment}`));
  return blocks.join("\n\n");
}

// ---------------------------------------------------------------------------
// What a Kodely site cannot do — named, not hidden
// ---------------------------------------------------------------------------

/**
 * Shown in the wizard under "What Kodely can't build yet". Every entry is
 * something a real customer asks for, and every `reason` is the actual
 * mechanism rather than a roadmap noise-word.
 */
export const NOT_OFFERED: UnavailableFeature[] = [
  {
    id: "online-booking",
    label: "A booking system with real availability",
    reason:
      "Taking a booking means storing it and knowing what is already taken. Generated sites have no database and no server of their own, so there is nowhere for an appointment to live.",
    instead:
      "Link out to the booking service you already use, or take enquiries through the contact form and confirm them yourself.",
  },
  {
    id: "accounts",
    label: "Customer logins and accounts",
    reason:
      "There is no user store, no session and no password handling on a generated site — a login box would accept anything and let nobody in.",
    instead:
      "If members need something private, host it on the service that already holds it and link to it.",
  },
  {
    id: "checkout",
    label: "A shop with a cart and checkout",
    reason:
      "Payments need a server holding secret keys, and generated sites are static files with no outbound network access at all.",
    instead:
      "Show your products and prices here, and send the buy button to your Etsy, Shopify, Square or Stripe payment link.",
  },
  {
    id: "search",
    label: "A searchable database or directory",
    reason:
      "Search over real data needs a database and a query behind it. A generated site has neither, and it cannot call out to one — its CSP sets connect-src 'none'.",
    instead:
      "For a small, fixed list, categories and anchor links get people there in one click. For a big or changing catalogue, link to where it already lives.",
  },
  {
    id: "map-embed",
    label: "An embedded map you can pan around",
    reason:
      "A map embed is a third-party iframe. The site's CSP has no frame-src, so it falls back to default-src 'self' and the browser blocks it; a static map image is blocked too, because img-src allows only 'self' and data:.",
    instead:
      "Your address laid out clearly with a “Get directions” link, which opens the visitor's own map app — usually what they wanted anyway.",
  },
  {
    id: "photos",
    label: "Your own photographs",
    reason:
      "There is no image upload, and remote images are blocked. A reference image attached to a build is looked at by the AI for style guidance only — it is never placed on the page.",
    instead:
      "Kodely carries the design with typography, colour, texture and drawn artwork from its own catalogue, which is why generated sites do not look like empty photo frames.",
  },
  {
    id: "live-chat",
    label: "A live chat widget",
    reason:
      "Every chat widget is a remote script that opens a connection back to its own servers. Both are blocked outright on a Kodely site.",
    instead: "The contact form, a mailto: link and a tel: link — all three genuinely reach you.",
  },
  {
    id: "analytics",
    label: "Google Analytics or a visitor counter",
    reason:
      "Analytics is a remote script making outbound requests, and nothing on the Kodely side counts visits either. There is no traffic data to show you.",
    instead:
      "Form submissions are the one real signal you get, and they are all in your submissions inbox.",
  },
  {
    id: "social-feed",
    label: "A live Instagram or X feed",
    reason:
      "Feed embeds are third-party iframes and scripts fetching from another origin. Blocked on all three counts.",
    instead: "Link to the profile, and put your best few posts on the page as written content.",
  },
  {
    id: "video-embed",
    label: "An embedded YouTube or Vimeo video",
    reason:
      "A video embed is a third-party iframe, which the CSP blocks, and there is no way to upload a video file to host yourself.",
    instead: "Link out to the video. It opens in the visitor's own tab and plays normally.",
  },
  {
    id: "custom-fonts",
    label: "A custom brand font",
    reason:
      "The CSP sets no font-src, so @font-face falls back to default-src 'self' — which, unlike img-src, does not allow data: either. A base64 font is blocked exactly like a hosted one.",
    instead:
      "The system font stack, used well. Kodely's look directions do real typographic work with weight, size and spacing instead.",
  },
  {
    id: "mailing-list",
    label: "Sign-ups that go into Mailchimp",
    reason:
      "That means posting to another company's domain, and a generated site may only post to its own origin (form-action 'self').",
    instead:
      "The “keep me posted” form collects addresses into your Kodely inbox and emails each one to you; you add them to your list.",
  },
];
