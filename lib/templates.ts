/**
 * Starter prompts for the gallery at /templates.
 *
 * The prompt is the product here, not the card. Each one is written the way an
 * expert user would write it — audience, purpose, tone, the sections wanted,
 * and bracketed placeholders for the facts only the owner knows.
 *
 * Every prompt is written to stay inside what a generated site actually IS
 * (see the SYSTEM prompt in lib/agent.ts and the starting files in
 * lib/foundation.ts): a Vite + React + TS + Tailwind app, served under a CSP
 * that blocks every external host, with no backend — EXCEPT the one real
 * exception documented in lib/agent.ts and lib/site-forms.ts: a plain HTML
 * contact form posting to the site's own `/__forms/<name>` genuinely works,
 * is stored, and emails the owner. So no template may ask for — or imply — a
 * working booking form, an account, a cart, a database, a live API call, a
 * remote or stock image, or a custom web font. A contact form IS fair game
 * where the brief calls for one.
 *
 * The 23 prompts below predate that exception and were written when contact
 * forms were also refused — most say "no backend, use mailto:" in the same
 * breath as booking/checkout. That is still correct for booking, checkout,
 * accounts and search; it is now OVERLY CAUTIOUS about plain contact. See the
 * board for the follow-up to revise each one individually — a vertical like
 * legal or trades wants the real contact form, not just a mailto: link.
 *
 * Where a vertical normally leans on something that still cannot work
 * (bookings, RSVPs, donations, checkout, waitlists), the prompt asks for a
 * link-out instead — a mailto:, a tel:, or a clearly-bracketed [link to your
 * …] — and the card's own description says so, so nobody clicks expecting a
 * booking system.
 *
 * Two agent rules the prompts are written to cooperate with rather than
 * fight: never invent facts about a real business (hence the brackets), and
 * never build a control that only pretends to work (hence the link-outs).
 *
 * ## Page count is no longer asserted here
 *
 * These prompts used to all open with "Build a one-page website for…" as a
 * blanket rule, regardless of what kind of business the template described.
 * That was wrong twice over: it pre-empted lib/agent.ts's own judgment call
 * ("use pages when the content genuinely differs… don't manufacture thin
 * pages to look bigger" — see its Multi-page section), and it actively
 * contradicted a customer who typed "with a page for each location" into the
 * wizard or the intake form on top of a template that had already told the
 * model to build one page.
 *
 * Most of the 23 templates below now open with the page-count-neutral "Build
 * a website for…" / "Build a site for…" — the vertical genuinely CAN go
 * either way (a restaurant, a law firm, a portfolio can be one great page or
 * several; the model decides from the brief, the same way it would for the
 * raw composer). A small number keep "one-page" as a deliberate, literal
 * constraint because being a single page is what the format IS, not a guess
 * about the business behind it:
 *   - `link-in-bio`      — a link-in-bio page is by definition one page.
 *   - `coming-soon`      — a pre-launch teaser is one screen by definition;
 *                          its own copy says "keep it short, one screen".
 *   - `personal-blog`    — literally named "Personal one-page blog"; the
 *                          prompt explains why (no database, posts live in
 *                          the page itself) as a deliberate structural choice.
 * Nothing here was flipped to the opposite blanket rule ("always multi-page")
 * — removing an incorrect assertion is the whole fix, not replacing it with
 * another one.
 */

export const TEMPLATE_CATEGORIES = [
  "Food & drink",
  "Beauty & wellness",
  "Local services",
  "Professional services",
  "Personal & creative",
  "Startup & product",
  "Events & causes",
] as const;

export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

export type Template = {
  /** Stable — it ends up in URLs and analytics, so never renumber these. */
  id: string;
  name: string;
  /**
   * One honest sentence. If the vertical usually implies a backend feature
   * this can't deliver, that limit belongs HERE, not in the small print.
   */
  description: string;
  category: TemplateCategory;
  /** The full starter prompt — exactly what lands in the composer. */
  prompt: string;
};

export const TEMPLATES: Template[] = [
  // ---------------------------------------------------------------- Food
  {
    id: "restaurant",
    name: "Restaurant",
    description:
      "A site with menu highlights, hours and location. Bookings link out to your phone or existing reservation service — there is no built-in reservation system.",
    category: "Food & drink",
    prompt: `Build a website for [your restaurant's name], a [cuisine, e.g. modern Italian] restaurant in [your city].

Audience: locals deciding where to eat tonight, plus people who were recommended us and want to check we look good before calling. Tone: warm and appetising, confident, never corporate.

Sections in this order:
1. Hero — the name, a single line describing the food, and a "Call to book" button.
2. A short paragraph about the kitchen: what we cook, where the ingredients come from, why it tastes the way it does.
3. Menu highlights — 6 to 8 dishes grouped as starters / mains / desserts, each with a one-line description and a price.
4. Hours and location, laid out so they are readable at a glance.
5. A footer with social links.

Leave every fact you cannot know as an obvious bracketed placeholder for me to fill in — [your address], [your phone number], [your opening hours], dish names and prices — instead of inventing something plausible.

There is no backend, so do not build a reservation form. The calls to action are a tel: link to [your phone number], a mailto: to [your email], and an optional [link to your booking system].

I have no photographs to give you, so carry the atmosphere with typography, a warm palette, texture and inline SVG detail rather than image placeholders everywhere. Responsive down to 380px, and include a dark mode.`,
  },
  {
    id: "coffee-shop",
    name: "Coffee shop / cafe",
    description:
      "A neighbourhood cafe page: what you serve, where you are, when you open. No online ordering or delivery — those link out if you use them.",
    category: "Food & drink",
    prompt: `Build a website for [your cafe's name], an independent coffee shop in [your neighbourhood, your city].

Audience: people nearby looking for somewhere to work, meet a friend, or grab a flat white on the way to work. Tone: relaxed and human, a bit design-led, absolutely not "artisanal" parody.

Sections in this order:
1. Hero — the name, a one-line promise ("[what makes your coffee worth the walk]"), and the opening hours right there in the hero.
2. What we serve — a short drinks list (espresso, filter, a couple of specials) and a short food list, with prices.
3. A short "about" paragraph: who roasts the beans, what the room is like, whether laptops are welcome.
4. Find us — address, nearest transport, and hours by day.
5. Footer with an Instagram link and a tel: link.

Use bracketed placeholders for anything only I can know: [your address], [your opening hours], [your phone number], prices, the roaster's name. Do not invent them.

No forms — there is no server behind this. If I take orders, the call to action is a plain [link to your ordering page]; otherwise the CTAs are "Call us" (tel:) and "Email us" (mailto:).

No photos are available. Build the mood with a warm, slightly muted palette, big confident type, and inline SVG icons for the drinks. Responsive to 380px, dark mode included.`,
  },
  {
    id: "food-truck",
    name: "Food truck",
    description:
      "A page for a mobile food business: what you cook and where you park. The weekly schedule is text you edit yourself, not a live feed.",
    category: "Food & drink",
    prompt: `Build a website for [your food truck's name], a [what you cook, e.g. Korean-Mexican] food truck operating around [your city].

Audience: people who saw the truck once and want to find it again, and event organisers thinking about hiring us. Tone: bold, fast, street-food energy — loud typography is welcome here.

Sections in this order:
1. Hero — the name, what we cook in one line, and "Where we are this week" as the primary button that scrolls to the schedule.
2. The menu — 5 or 6 items with short punchy descriptions and prices.
3. This week's stops — a simple day-by-day list: day, location, times. Make it obvious that this is a hand-edited list I update, not a live map.
4. Private hire — one paragraph on catering events, with an "Email us about catering" mailto: link.
5. Footer with social links.

Every location, time, price and phone number must be a bracketed placeholder ([your Monday stop], [your phone number]) until I replace it. Do not invent a schedule.

There is no backend: no booking form, no live location tracking, no map embed (external requests are blocked). Link-outs and mailto:/tel: only.

No photography available — lean on strong colour, angled shapes, and inline SVG. Responsive to 380px with a dark mode.`,
  },

  // ------------------------------------------------------ Beauty & wellness
  {
    id: "barbershop",
    name: "Barbershop",
    description:
      "A sharp, credible site with services, prices and hours. Appointments go through a tel: link or your existing booking tool — no booking engine is built.",
    category: "Beauty & wellness",
    prompt: `Build a website for [your barbershop's name], a barbershop in [your city].

Audience: men looking for a regular barber, and first-timers deciding whether we are the traditional kind or the fade-specialist kind. Tone: confident, masculine, clean — dark and sharp rather than rustic.

Sections in this order:
1. Hero — the shop name, one line on what we do best, and a "Call to book" button.
2. Services and prices — a clean list: cut, skin fade, beard trim, hot towel shave, kids' cut, each with a price and a duration.
3. The shop — a short paragraph on the barbers and how long we have been on [your street].
4. Hours and location.
5. Footer with an Instagram link and phone number.

Prices, durations, address, phone number, hours and how long we have been open must all be bracketed placeholders I fill in. Never invent them.

There is no backend, so do not build a booking form or a calendar. Booking is a tel: link to [your phone number] plus an optional [link to your booking system, e.g. Booksy or Fresha] — and the button label must say what it actually does ("Call to book"), not "Book now" if it only opens the phone.

No photos to work with, so use a dark palette, strong type, thin rules and inline SVG icons. Responsive down to 380px; dark mode is the default here, but keep a light mode working.`,
  },
  {
    id: "hair-salon",
    name: "Hair & beauty salon",
    description:
      "Services, price list, hours and location for a salon or beauty studio. Clients book by phone or via a link to your existing booking service.",
    category: "Beauty & wellness",
    prompt: `Build a website for [your salon's name], a hair and beauty salon in [your city].

Audience: someone choosing a new salon — they want to know the price range, the vibe, and whether we do their kind of hair before they commit. Tone: calm, elegant, contemporary; soft neutral palette with one accent colour.

Sections in this order:
1. Hero — the salon name, a one-line positioning statement, and a "Call to book" button.
2. Treatments and prices — grouped as cut & finish, colour, treatments, and [your other category], each entry with a price or a "from" price.
3. A short paragraph about the team and the approach (consultation first, products used).
4. Hours, address and parking/transport note.
5. Footer with Instagram and phone.

All prices, names, addresses, hours and product brands stay as bracketed placeholders ([your colour prices], [your address]) until I fill them in — do not guess at them.

No backend exists, so no booking form and no gift-card checkout. Use a tel: link, a mailto: link, and [link to your booking system] where I will paste my real booking URL.

I have no photographs yet — build elegance out of whitespace, type and a restrained palette, with inline SVG detail instead of empty image boxes. Responsive to 380px, with a dark mode.`,
  },
  {
    id: "gym-studio",
    name: "Gym or fitness studio",
    description:
      "A studio page with classes, a written timetable and membership prices. No sign-up or payment — joining links out to your existing system.",
    category: "Beauty & wellness",
    prompt: `Build a website for [your studio's name], a [type, e.g. reformer pilates / CrossFit / boxing] studio in [your city].

Audience: someone who has decided to start training and is comparing two or three local studios. They want to know what a class is actually like, what it costs, and whether beginners are welcome. Tone: energetic but grown-up — motivating, not shouty.

Sections in this order:
1. Hero — the studio name, one line on what makes training here different, and a "Book your first class" button.
2. Classes — 3 or 4 class types, each with a short description, difficulty level and duration.
3. Timetable — a simple weekly grid of day / time / class. Make clear in the copy that this is the current timetable and I keep it up to date by hand.
4. Membership — 2 or 3 price options (drop-in, monthly, intro offer) as plain cards with what each includes.
5. A short "new here?" paragraph answering what to bring and how early to arrive.
6. Hours, address, footer.

Class times, prices, the address, the trainers' names and any claims about results must be bracketed placeholders — never invented.

There is no backend: no sign-up form, no payment, no class booking. The CTAs are [link to your booking system], a tel: link and a mailto: link, labelled so it is obvious where they go.

No photography available — use bold type, a high-contrast palette and inline SVG. Responsive to 380px, dark mode included.`,
  },

  // --------------------------------------------------------- Local services
  {
    id: "tradesperson",
    name: "Tradesperson",
    description:
      "A credibility page for a plumber, electrician, builder or similar: services, areas covered, and a big call-me button. Quotes come by phone or email.",
    category: "Local services",
    prompt: `Build a website for [your name / your business name], a [trade, e.g. plumber / electrician / carpenter] working in [your town and the areas around it].

Audience: someone with a problem right now, on their phone, deciding who to call. The single most important thing on the page is the phone number. Tone: straightforward, reassuring, no jargon and no marketing fluff.

Sections in this order:
1. Hero — what I do, where I work, and a large "Call [your phone number]" button that is visible without scrolling on a phone.
2. What I do — 5 or 6 concrete jobs (e.g. boiler repairs, bathroom installs, emergency leaks), each one line.
3. Areas covered — a short list of towns and postcodes.
4. Why me — a few honest points: [years in the trade], [your qualifications/registration number], [whether you give free quotes], guarantee terms. Leave every one as a placeholder; do not invent qualifications or registration numbers.
5. How it works — three steps: call or text, I quote, I do the work.
6. Footer with phone, email and hours.

There is no backend, so do not build a "request a quote" form — a form that quietly loses an emergency call-out is worse than none. Use a tel: link, a "Text me" sms: link and a mailto: link, each labelled with what it does.

No photos of past work are available yet, so use a clean, high-trust layout with inline SVG icons for each trade task rather than empty photo frames. Mobile-first, readable at 380px, with a dark mode.`,
  },
  {
    id: "local-service",
    name: "Local service business",
    description:
      "For cleaners, gardeners, dog walkers, tutors and the like: what you offer, where you cover, what it costs. Enquiries go by phone or email.",
    category: "Local services",
    prompt: `Build a website for [your business name], a [service, e.g. domestic cleaning / gardening / dog walking] business serving [your area].

Audience: a local household comparing two or three providers. They want to know exactly what is included, roughly what it costs, and that a real person will answer. Tone: friendly, practical, trustworthy.

Sections in this order:
1. Hero — the business name, what we do and where, and a "Call for a quote" button.
2. Services — 3 or 4 packages (e.g. regular weekly, one-off deep clean, end of tenancy), each with what is included and a "from [price]" placeholder.
3. Areas covered — a plain list.
4. What to expect — 3 short steps from first call to the work being done, plus a line on insurance and cancellations as [your insurance details] / [your cancellation policy].
5. Frequently asked questions — 4 questions a real customer asks (do I need to be home, do you bring supplies, how do I pay, what if I am not happy). Keep the answers as bracketed placeholders where they depend on how I run things.
6. Footer with phone, email and hours.

Do not invent prices, insurance cover, staff counts, review scores or years in business — bracket them all.

There is no backend, so no booking or quote form. The calls to action are a tel: link, a mailto: link and, if I add one, [link to your booking system].

No photographs available — use a light, clean layout, inline SVG icons and clear type. Responsive to 380px, dark mode included.`,
  },

  // --------------------------------------------------- Professional services
  {
    id: "law-firm",
    name: "Law firm",
    description:
      "A restrained, credible page for a solicitor or small firm: practice areas, approach, contact. No client intake form or portal — enquiries go by phone and email.",
    category: "Professional services",
    prompt: `Build a website for [your firm's name], a [size, e.g. three-partner] law firm in [your city] practising [your practice areas].

Audience: someone with a serious problem — a dispute, an injury, an estate — who is nervous and comparing firms. They need to feel competence and calm within five seconds. Tone: measured, precise, human. No stock-photo handshake energy, no exclamation marks.

Sections in this order:
1. Hero — the firm name, one sentence on what we do and who for, and a "Speak to us" button.
2. Practice areas — 4 to 6 areas, each with two lines explaining what we handle in plain English rather than legal terms.
3. Our approach — a short paragraph on how we work with clients: who you deal with, how you are kept informed, how fees are structured ([your fee basis]).
4. The team — name, role and one-line background per person, all as placeholders ([partner name], [their qualification]) for me to complete.
5. Contact — address, phone, email, office hours.

This is critical: do not invent anything regulated or checkable — no bar/SRA numbers, no years in practice, no case results, no client testimonials, no accreditations. Leave each as a clearly bracketed placeholder.

There is no backend, so build no intake form and no client portal — a legal enquiry silently vanishing is unacceptable. Contact is a tel: link and a mailto: link, plus [link to your booking system] if I use one.

No photography available — use serif headings, generous whitespace, a restrained palette and thin rules for authority. Responsive to 380px with a dark mode.`,
  },
  {
    id: "accountancy",
    name: "Accountant / bookkeeper",
    description:
      "Services, who you work with and how fees work. No client portal or document upload — those link out to the software you already use.",
    category: "Professional services",
    prompt: `Build a website for [your practice's name], an accountancy and bookkeeping practice in [your city] working mainly with [your client type, e.g. freelancers and small limited companies].

Audience: a small business owner who is behind on their books or unhappy with their current accountant. They want to know the services, the price basis, and that deadlines will be met. Tone: clear, calm, competent — reassuring rather than salesy.

Sections in this order:
1. Hero — the practice name, one sentence on who we help and how, and a "Book a call" button.
2. Services — 5 or 6 (annual accounts, self-assessment, bookkeeping, payroll, VAT, [your other service]), each with one line of plain-English explanation.
3. How we price — a short honest paragraph plus [your pricing basis, e.g. fixed monthly fee]. Do not invent numbers.
4. Who we work with — two or three client profiles described generically, no named clients or logos.
5. Software — a line naming the packages I actually use as [your software, e.g. Xero], with a plain external [link to your client portal] rather than any kind of upload area.
6. Contact — phone, email, hours, address.

Do not invent qualifications, licence numbers, professional body memberships, client counts, fees or testimonials. Bracket every one.

There is no backend: no enquiry form, no document upload, no login. Use tel:, mailto: and clearly-labelled external links.

No photography available — use a crisp, confident layout with strong type, a cool neutral palette and inline SVG icons. Responsive to 380px with a dark mode.`,
  },
  {
    id: "consultant",
    name: "Independent consultant",
    description:
      "A single-page pitch: the problem you solve, how you work, and how to reach you. Calls are booked via a link to your existing scheduling tool.",
    category: "Professional services",
    prompt: `Build a website for [your name], an independent [your discipline, e.g. operations / brand / data] consultant working with [your client type].

Audience: a hiring manager or founder who got my name from someone and is checking whether I am the real thing before emailing. Tone: senior, specific, quietly confident — this should read like a strong point of view, not a CV.

Sections in this order:
1. Hero — my name, one sharp sentence on the problem I solve and for whom, and an "Email me" button.
2. The problem — three or four paragraphs' worth of point of view about what usually goes wrong in [your discipline] and what I do differently. This is the heart of the page; give it room.
3. How I work — 3 engagement shapes (e.g. a two-week diagnostic, a fixed-scope project, an ongoing advisory retainer), each with what it includes, typical duration and [your price or "from" price].
4. Background — a short bio with [your previous roles] and [your education] as placeholders.
5. Contact — email, [link to your scheduling tool], [your LinkedIn].

Do not invent clients, case-study results, revenue figures, testimonials or years of experience. Every one of those is a bracketed placeholder.

There is no backend, so no contact form and no embedded calendar (external embeds are blocked). Use a mailto: link and a plain link to my scheduling page.

No photography available — use editorial typography, a strong single accent colour and lots of whitespace. Responsive to 380px with a dark mode.`,
  },
  {
    id: "agency",
    name: "Agency",
    description:
      "An agency site: services, approach, and written case-study summaries. Client logos and screenshots are placeholders you replace later.",
    category: "Professional services",
    prompt: `Build a website for [your agency's name], a [type, e.g. brand and digital] agency in [your city].

Audience: a marketing lead shortlisting agencies. They want to see taste in the first three seconds and substance in the next thirty. Tone: crafted, opinionated, contemporary — the design of the page IS the portfolio.

Sections in this order:
1. Hero — the agency name, a one-line positioning statement with a real point of view, and a "Start a project" button.
2. Services — 4 areas (e.g. brand identity, websites, campaigns, [your fourth]), each with a short description of what the deliverable actually is.
3. Selected work — 3 case-study cards, each with [client name], the challenge in one line, what we did, and [the result] as a placeholder. Do not invent clients or numbers; if I have not given them, the brackets stay.
4. How we work — a short process in 4 steps with a sentence each.
5. The team — [number] people, roles listed, no invented bios.
6. Contact — email, [your studio address], [your phone number].

Do not fabricate client names, logos, award wins, headcount or results.

There is no backend, so no project-enquiry form: the CTA is a mailto: link labelled "Email us about a project", plus [link to your booking system] if I add one.

I cannot supply images or client logos, so make each case study a typographic card with a distinct colour treatment and inline SVG, and leave obviously-labelled placeholder blocks where logos will go. Give the page one distinctive visual idea rather than the usual hero-plus-three-cards. Responsive to 380px with a dark mode.`,
  },

  // ---------------------------------------------------- Personal & creative
  {
    id: "personal-portfolio",
    name: "Personal portfolio",
    description:
      "A single-page portfolio: who you are, what you have built, how to reach you. Project thumbnails are generated placeholders until you replace them.",
    category: "Personal & creative",
    prompt: `Build a portfolio site for [your name], a [your role, e.g. product designer / frontend developer] based in [your city].

Audience: a hiring manager or potential client who has thirty seconds and a dozen tabs open. They need to understand what I do, see evidence, and find the contact link without scrolling forever. Tone: personal and specific, confident without bragging.

Sections in this order:
1. Hero — my name, one line on what I do and what I am looking for right now, and links to email, [your GitHub], [your LinkedIn].
2. Selected work — 4 projects. For each: the project name, my role, one line on the problem, two lines on what I built, the tools used, and a [link to the live project]. Use [project name] style placeholders wherever I have not told you the details.
3. About — a short paragraph in my own voice, plus a skills list grouped by type.
4. Experience — 3 roles as [company], [title], [dates], each with one line. Placeholders only; do not invent employers or dates.
5. Contact — a mailto: link and my social links.

Do not invent employers, dates, metrics ("increased conversion by 40%"), or testimonials. Brackets, always.

There is no backend, so no contact form — a mailto: link labelled "Email me" is the contact method.

I have no images to supply, so give each project card its own generated visual treatment: a distinct gradient, pattern or inline SVG mark rather than a grey rectangle. Make the layout the thing that shows taste. Responsive to 380px with a dark mode.`,
  },
  {
    id: "photographer",
    name: "Photographer showcase",
    description:
      "A gallery-style page for a photographer. Honest limit: you cannot upload photos yet, so the grid is filled with generated placeholder tiles you swap out later.",
    category: "Personal & creative",
    prompt: `Build a site for [your name], a [type, e.g. wedding and portrait] photographer working in [your city and region].

Audience: someone planning [the occasion, e.g. a wedding] who is comparing photographers on style and price. Tone: quiet and confident — the design should get out of the way of the pictures.

Important and honest: I cannot upload my photographs into this build yet. So construct the gallery as a real, well-composed grid of placeholder tiles — mixed portrait and landscape aspect ratios, tasteful generated gradients or subtle patterns, each with a caption like [photo: ceremony, Ravenswood barn] — so it reads as a designed gallery and I can drop my own images in later. Do not link to any stock or remote images; they are blocked.

Sections in this order:
1. Hero — my name, one line on the kind of photography I do, and a "Check your date" button.
2. The gallery grid described above — around 9 to 12 tiles.
3. Approach — a short paragraph on how I shoot (documentary, posed, how much direction I give) and what a day with me is like.
4. Packages — 3 tiers with [what is included] and [your price] as placeholders: hours of coverage, number of edited images, delivery time, whether an album is included.
5. Contact — email, [your Instagram], and the areas I travel to.

Do not invent prices, turnaround times, awards, publications or client names.

There is no backend, so no enquiry form and no client-gallery login. Contact is a mailto: link plus [link to your client gallery service] if I use one.

Responsive down to 380px, with a dark mode that suits a gallery.`,
  },
  {
    id: "band-musician",
    name: "Band or musician",
    description:
      "A site for an artist: bio, tour dates and links to the platforms your music already lives on. Audio is not hosted here — streaming links out.",
    category: "Personal & creative",
    prompt: `Build a website for [band or artist name], a [genre] act from [your city].

Audience: someone who just heard us at a gig or on a playlist and searched the name. They want to hear more, see when we play next, and follow us — in that order. Tone: match the genre; give the page a strong, distinctive visual identity rather than a neutral template look.

Sections in this order:
1. Hero — the name, one line describing the sound, and prominent buttons linking out to [your Spotify], [your Apple Music], [your Bandcamp] and [your YouTube].
2. Listen — cards for [latest release name] and [previous release], each with the release date and a link out to the streaming platform. Do not embed a player: external embeds and remote audio are blocked, and a play button that does nothing is worse than a link.
3. Live dates — a list of [date], [venue], [city], [link to tickets]. Make it obvious that I edit this list by hand; do not invent gigs.
4. About — two short paragraphs of bio with [members' names] and [instruments] as placeholders.
5. Contact — [booking email] as a mailto: link labelled "Booking enquiries", and [press kit link].

Do not invent releases, tour dates, venues, labels, streaming numbers or press quotes.

No photography available, so build the identity out of type, colour, grain and inline SVG shapes — treat it like a record sleeve rather than a business site. Responsive to 380px; dark mode expected.`,
  },
  {
    id: "personal-blog",
    name: "Personal one-page blog",
    description:
      "A writing-first page holding a handful of posts written directly into it. There is no CMS or comments — new posts are added by asking for an edit.",
    category: "Personal & creative",
    prompt: `Build a one-page personal site for [your name], somewhere between a homepage and a blog, about [your subjects, e.g. software, cities and cooking].

Audience: someone who found one of my posts and wants to know who wrote it. Tone: my own voice — essayistic, unhurried, no corporate copy.

Understood constraint: this is a single page with no database, so the posts live in the page itself. Structure it so adding another post later is a simple edit.

Sections in this order:
1. A short masthead — my name, one line about what I write about, and links to [your email], [your GitHub], [your Mastodon or X].
2. Writing — 4 or 5 entries. Each entry: a title, a date placeholder [date], a two-sentence standfirst, and the full text of the post rendered on the page in a comfortable reading measure (roughly 65 to 75 characters). Use [your post text here] placeholders for the bodies I have not given you — do not write fake essays under my name and do not invent opinions I have not expressed.
3. Now — a short "what I am doing at the moment" block with [your current project].
4. Colophon — a couple of lines about how the site is built, and a mailto: link.

No comments section, no newsletter signup form, no search: none of them can work without a backend. If I want subscribers, put a plain [link to your newsletter signup page] instead of a fake email field.

Typography is the whole design here: a strong type scale, real hierarchy, comfortable line length, generous margins, and a genuinely pleasant reading experience in both light and dark mode. Responsive to 380px.`,
  },
  {
    id: "link-in-bio",
    name: "Link in bio",
    description:
      "A compact mobile-first page of links to everything you do. Pure link-out by design, so nothing here depends on a backend.",
    category: "Personal & creative",
    prompt: `Build a one-page "link in bio" site for [your name or handle], a [what you do, e.g. illustrator and podcast host].

Audience: someone tapping the link in my social profile on a phone. They should find the thing they came for in one tap. Tone: personal, playful, unmistakably mine.

Design for the phone first — one column, big tap targets at least 44px tall, everything above two screens of scroll. It should still look deliberate on a desktop rather than a stretched phone layout.

Structure:
1. A header with an initials-style avatar mark (generated, not a photo — I cannot upload one yet), my name/handle, and one line about what I do.
2. A stack of 6 to 8 link buttons, each with a short label, a one-line subtitle and an inline SVG icon: [your newsletter], [your shop], [your latest video], [your podcast], [your portfolio], [book a call — link to your scheduling tool], "Email me" (mailto:), and [your other link].
3. A "currently" line — one sentence on what I am working on right now.
4. A small footer row of social icons linking to [your profiles].

Every destination is a bracketed placeholder until I paste the real URL — do not invent handles or URLs.

No forms of any kind: no email capture, no analytics scripts, no remote embeds. Every button is a plain link.

Make it visually distinctive: a strong gradient or pattern background, rounded cards, a clear hover and focus state on every button, and a dark mode. Responsive from 380px up.`,
  },

  // ----------------------------------------------------- Startup & product
  {
    id: "saas-landing",
    name: "SaaS landing page",
    description:
      "A marketing page for a software product: problem, features, pricing, FAQ. Sign-up and login buttons link out to your actual app.",
    category: "Startup & product",
    prompt: `Build a landing site for [your product name], a [category, e.g. project tracking] tool for [your audience, e.g. small agencies].

Audience: someone who just clicked an ad or a Show HN link. In ten seconds they must understand what it does, who it is for, and what it costs. Tone: sharp and specific — plain language, concrete benefits, no vague "supercharge your workflow".

Sections in this order:
1. Hero — a headline stating what the product does for whom, a subhead with the mechanism, and two buttons: "Start free" linking to [your app signup URL] and "Sign in" linking to [your app login URL].
2. The problem — three short paragraphs or three cards naming the pain honestly.
3. How it works — 3 steps, each with a heading, two lines, and an inline-SVG or CSS diagram of the idea (not a screenshot; I cannot supply images).
4. Features — 6 features with a title and one line each.
5. Pricing — 3 tiers with [your price] placeholders, what is included in each, and buttons linking out to [your app signup URL]. Mark one tier as most popular.
6. FAQ — 5 real objections (data export, cancelling, security, integrations, support) with honest answers, using placeholders where the answer depends on my policies.
7. Footer with [your email], [your status page], links to [your privacy policy] and [your terms].

Do not invent customer counts, logos, testimonials, uptime figures, funding, security certifications or review scores. Bracket them all.

There is no backend on this page, so no signup form, no email capture and no live demo — every call to action is a plain link to my real app. If you show an interface, make it an obviously illustrative mock, not a control that pretends to work.

Give the page one distinctive visual idea. Responsive to 380px with a dark mode.`,
  },
  {
    id: "product-launch",
    name: "Product launch page",
    description:
      "A focused page for launching one physical or digital product. There is no cart or checkout — the buy button links to the store you already sell through.",
    category: "Startup & product",
    prompt: `Build a launch site for [your product name], a [what it is, e.g. hardcover book / mechanical keyboard / iOS app] by [your name or company].

Audience: someone sent here by a launch post, deciding in under a minute whether to buy. Tone: confident and product-obsessed; the page should feel like the product.

Sections in this order:
1. Hero — the product name, a one-line description that says what it IS before what it is like, [your price], and a "Buy on [your store]" button linking to [your store URL].
2. What it is — three short blocks on the three things that make it worth the money, each with an inline-SVG or CSS illustration of the idea rather than a photo.
3. Details — a specification list: [dimensions], [materials], [what is in the box], [shipping regions], [delivery estimate] — all placeholders, none invented.
4. Who it is for — two short "this is for you if…" / "probably not for you if…" lists. Being honest about the second one earns the first.
5. FAQ — 5 questions: shipping, returns, warranty, availability, support, each answered with my [policy] as a placeholder.
6. Final call to action repeating the buy link, plus a mailto: for questions.

Do not invent prices, specs, shipping times, stock levels, reviews, ratings or press quotes.

There is no backend: no cart, no checkout, no email capture. The single conversion path is a link out to wherever I actually sell it.

Responsive down to 380px, dark mode included.`,
  },
  {
    id: "coming-soon",
    name: "Coming soon / waitlist",
    description:
      "A pre-launch teaser page. It cannot collect email addresses itself, so the signup is a mailto: or a link to a form service you already use.",
    category: "Startup & product",
    prompt: `Build a one-page "coming soon" site for [your project name], [one line on what it will be].

Audience: people arriving early from a teaser post or a shared link. The job of the page is to make them want it and give them one way to hear about launch. Tone: intriguing and specific — a teaser that says nothing is just a wasted visit, so explain the real idea.

Structure — keep it short, one screen plus a little:
1. A "launching [your launch window]" label.
2. The project name and a headline that states the actual promise.
3. Two or three sentences on what it does and who it is for.
4. Three short bullets on what will be in the first version.
5. The signup call to action — see the constraint below.
6. A footer line with [your email] and [your social links].

The constraint, and please handle it exactly this way: there is no backend, so an email field on this page would silently discard every address typed into it. Do not build one. Instead make the primary call to action a clearly-labelled link — either "Email me to join the list" as a mailto: to [your email] with a pre-filled subject line, or a button linking to [link to your signup form, e.g. Tally or Google Form] if I provide one. The label must say where it goes.

Do not invent a launch date, a waitlist count or backer names — bracket them.

Visually: this page has one job, so give it one strong idea — an animated CSS gradient field, a bold type lockup, generated grain or a geometric inline-SVG motif. It should look finished, not like a placeholder. Responsive to 380px with a dark mode.`,
  },

  // ------------------------------------------------------- Events & causes
  {
    id: "wedding",
    name: "Wedding info page",
    description:
      "The where-and-when page for guests: schedule, venue, travel, dress code. RSVPs go by email or to the form service you are already using.",
    category: "Events & causes",
    prompt: `Build a wedding information site for [name one] and [name two], getting married on [your date] at [your venue, your town].

Audience: our guests — including relatives who are not confident online. Every practical question they have should be easy to find on a phone without digging. Tone: warm and personal, elegant rather than twee.

Sections in this order:
1. Hero — both first names, the date and the venue town.
2. The day — a simple timeline: [ceremony time and place], [drinks], [dinner], [dancing], [carriages]. Times as placeholders.
3. Getting there — [venue address], [parking notes], [nearest station], [taxi numbers].
4. Staying over — 2 or 3 [hotel name] entries with [distance] and [booking link], plus any [room block code].
5. What to wear — [your dress code] in one clear line, plus a note on the terrain if it is outdoors.
6. Gifts — [your wording], with a plain [link to your gift registry] if we have one.
7. RSVP — see below.
8. A short FAQ: children, dietary requirements, photographs during the ceremony, arrival time.

RSVP handling, exactly: there is no backend, so do not build an RSVP form — a lost RSVP means a missing seat. Make it a mailto: link to [your email] with a pre-filled subject line, or a button to [link to your RSVP form] if we use one. Label it so it is obvious what happens when clicked.

Never invent names, dates, times, addresses or hotel details — every one is a bracketed placeholder.

We have no photographs to include, so use elegant typography, a soft palette, and a delicate inline-SVG botanical or geometric motif. Responsive down to 380px, and make sure the text is comfortably large for older guests.`,
  },
  {
    id: "event",
    name: "Event or conference page",
    description:
      "One page covering an event: what, when, where, who is speaking. Tickets and registration link out to the platform selling them.",
    category: "Events & causes",
    prompt: `Build a site for [event name], a [type, e.g. one-day conference / workshop / meetup] on [your date] at [your venue, your city].

Audience: someone deciding whether to spend a day and [ticket price] on this. They need the theme, the line-up, the practicalities and the ticket link. Tone: energetic and credible.

Sections in this order:
1. Hero — the event name, the date, the city, a one-line description of the theme, and a "Get tickets" button linking to [your ticket page URL].
2. About — two short paragraphs: what the day is about and who it is for.
3. Programme — a schedule of [time] / [session title] / [speaker name] rows, including the breaks. All placeholders; do not invent sessions.
4. Speakers — cards with [speaker name], [their role], and one line of bio, each with a generated initials avatar rather than a photo (I cannot upload images yet).
5. Venue and travel — [venue address], [transport notes], [accessibility notes].
6. Tickets — 2 or 3 tiers with [price] and what each includes, each linking out to the ticket page.
7. FAQ — 4 questions: refunds, food, recordings, accessibility, answered with [your policy] placeholders.
8. Footer with [your email] and [your social links].

Do not invent speakers, sponsors, attendee numbers, prices or past-edition claims.

There is no backend, so no registration form and no ticket checkout on this page — every ticket call to action is a link to the platform actually selling them.

Responsive to 380px with a dark mode.`,
  },
  {
    id: "nonprofit",
    name: "Nonprofit or community group",
    description:
      "A page explaining your cause, your work and how to help. Donations link out to your existing donation platform — no payments are handled here.",
    category: "Events & causes",
    prompt: `Build a website for [your organisation's name], a [type, e.g. registered charity / volunteer-run community group] in [your area] working on [your cause].

Audience: three groups at once — someone who might donate, someone who might volunteer, and someone who needs the help we offer. The third group matters most, so make it easy for them to find what to do.

Sections in this order:
1. Hero — the organisation name, one clear sentence on what we do and where, and two buttons: "Donate" and "Get help".
2. Get help — plain, non-patronising instructions on how to reach us, with [your phone number], [your email] and [your opening times]. Put this high on the page, not in the footer.
3. What we do — 3 or 4 programmes, each with a short honest description.
4. Our impact — leave the numbers as bracketed placeholders ([people supported last year], [meals delivered]). Do not invent a single figure; made-up impact numbers are the most damaging thing this page could contain.
5. How to help — donate (a button linking to [your donation platform URL]), volunteer (a mailto: with a pre-filled subject), and [your other ways to help].
6. About — [year founded], [how we are funded], [your registered charity number] as placeholders, plus a short paragraph on who runs it.
7. Footer with contact details and [your social links].

There is no backend, so no donation form, no card processing and no volunteer sign-up form. Every one of those is a clearly-labelled link out to the service that actually handles it.

No photographs available — use a warm, human palette, clear type and inline SVG rather than empty photo frames. Accessibility matters more than usual here: strong contrast, large tap targets, plain language. Responsive to 380px with a dark mode.`,
  },
];

/** Lookup by stable id — used by the gallery and anything that deep-links. */
export function getTemplate(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
