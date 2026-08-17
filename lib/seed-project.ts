import { db } from "./db";

// ── Onboarding seed project ────────────────────────────────────────────────
// New signups land on an empty dashboard otherwise, which is a bad first
// impression for a tool whose entire pitch is "describe it, watch it build."
// This gives every new account one already-built, genuinely well-designed
// example project (draft-only, unpublished) so there's something real to
// look at and edit on the very first screen. It follows the exact same hard
// constraints the AI builder itself is held to (see lib/agent.ts SYSTEM
// prompt): no external requests, no CDN, system fonts only, inline SVG for
// graphics, responsive to 380px, semantic HTML, dark mode via
// prefers-color-scheme, real copy.
//
// This is free onboarding content, not a paid generation — it must never
// touch the credit ledger.

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return (base || "site") + "-" + Math.random().toString(36).slice(2, 7);
}

const INDEX_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Roan Coffee — small-batch coffee on Birch Street</title>
<meta name="description" content="Roan Coffee is a small-batch roaster and neighborhood coffee bar on Birch Street. See today's menu, our hours, and where to find us.">
<link rel="stylesheet" href="styles.css">
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>

<header class="site-header">
  <div class="wrap header-row">
    <a class="brand" href="#top">
      <svg class="brand-mark" viewBox="0 0 48 48" width="30" height="30" aria-hidden="true">
        <path d="M10 20h24v10a12 12 0 0 1-12 12 12 12 0 0 1-12-12V20Z" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>
        <path d="M34 22h3a5 5 0 0 1 0 10h-3" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
        <path d="M16 16c-1.5-2 1.5-3 0-6" class="steam steam-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M22 16c-1.5-2 1.5-3 0-6" class="steam steam-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M28 16c-1.5-2 1.5-3 0-6" class="steam steam-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
      <span>Roan Coffee</span>
    </a>
    <nav class="site-nav" aria-label="Primary">
      <a href="#menu">Menu</a>
      <a href="#visit">Visit</a>
      <a href="#story">Our story</a>
    </nav>
  </div>
</header>

<main id="main">
  <section class="hero" id="top">
    <div class="wrap hero-grid">
      <div class="hero-copy">
        <p class="eyebrow">Birch Street, since 2019</p>
        <h1>Coffee roasted two blocks from where you're standing.</h1>
        <p class="hero-lede">We roast in small batches every Tuesday and pull shots on a rebuilt 1974 lever machine. No syrups pretending to be flavor — just good beans, treated right.</p>
        <div class="hero-actions">
          <a class="btn btn-primary" href="#menu">See today's menu</a>
          <a class="btn btn-ghost" href="#visit">Find us</a>
        </div>
      </div>
      <svg class="hero-art" viewBox="0 0 320 320" role="img" aria-labelledby="cupTitle">
        <title id="cupTitle">Illustration of a steaming coffee cup</title>
        <path d="M160 20c60 0 120 40 120 110s-60 150-120 150S40 200 40 130 100 20 160 20Z" fill="var(--bg-alt)"/>
        <g transform="translate(90,108)">
          <ellipse cx="70" cy="98" rx="62" ry="10" fill="var(--brand)" opacity=".15"/>
          <path d="M10 40h120v55a60 60 0 0 1-120 0V40Z" fill="var(--card)" stroke="var(--brand)" stroke-width="3"/>
          <path d="M130 55h18a24 24 0 0 1 0 48h-18" fill="none" stroke="var(--brand)" stroke-width="3" stroke-linecap="round"/>
          <path d="M45 20c-6-8 6-12 0-24" class="steam steam-1" fill="none" stroke="var(--brand)" stroke-width="3" stroke-linecap="round"/>
          <path d="M70 16c-6-8 6-12 0-24" class="steam steam-2" fill="none" stroke="var(--brand)" stroke-width="3" stroke-linecap="round"/>
          <path d="M95 20c-6-8 6-12 0-24" class="steam steam-3" fill="none" stroke="var(--brand)" stroke-width="3" stroke-linecap="round"/>
        </g>
      </svg>
    </div>
  </section>

  <section class="story" id="story">
    <div class="wrap">
      <h2>Small batches, on purpose</h2>
      <p class="section-lede">Roan started as a Saturday folding table outside Birch Street Hardware in 2019. Three years and one very small storefront later, we still roast the same way: twelve pounds at a time, so nothing sits on a shelf long enough to go flat.</p>
      <div class="feature-grid">
        <div class="feature">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 3c-5 2-8 6-8 10a5 5 0 0 0 10 0c0-3 2-4 4-6a5 5 0 0 0-6-4Z"/>
            <path d="M8 17c1-3 3-5 6-9"/>
          </svg>
          <h3>Direct-trade beans</h3>
          <p>We buy directly from three family farms in Huila and Yirgacheffe, at prices well above commodity rate.</p>
        </div>
        <div class="feature">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="3.5" y="5" width="17" height="15" rx="2"/>
            <path d="M3.5 9.5h17M8 3v4M16 3v4"/>
            <path d="M8.5 14l2 2 4-4"/>
          </svg>
          <h3>Roasted every Tuesday</h3>
          <p>Small twelve-pound batches on a refurbished drum roaster — never more than a week between roast and cup.</p>
        </div>
        <div class="feature">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 3c3 4.5 6 8 6 11.5A6 6 0 0 1 6 14.5C6 11 9 7.5 12 3Z"/>
          </svg>
          <h3>Steamed to order</h3>
          <p>Dairy or house-made oat milk, steamed fresh for every single drink — never a pre-frothed pitcher.</p>
        </div>
      </div>
    </div>
  </section>

  <section class="menu" id="menu">
    <div class="wrap">
      <h2>Today's menu</h2>
      <p class="section-lede">Prices include tax. Ask about the rotating single-origin pour-over — it changes every two weeks.</p>
      <div class="menu-columns">
        <div class="menu-group">
          <h3>Coffee</h3>
          <ul class="menu-list">
            <li><span class="item-name">Espresso</span><span class="item-dots"></span><span class="item-price">$3.25</span></li>
            <li><span class="item-name">Cortado</span><span class="item-dots"></span><span class="item-price">$4.50</span></li>
            <li><span class="item-name">Roan House Drip</span><span class="item-dots"></span><span class="item-price">$3.00</span></li>
            <li><span class="item-name">Honey Lavender Latte</span><span class="item-dots"></span><span class="item-price">$5.25</span></li>
            <li><span class="item-name">Pour-Over, single origin</span><span class="item-dots"></span><span class="item-price">$5.75</span></li>
            <li><span class="item-name">Cardamom Cold Brew</span><span class="item-dots"></span><span class="item-price">$4.75</span></li>
          </ul>
        </div>
        <div class="menu-group">
          <h3>Tea &amp; other</h3>
          <ul class="menu-list">
            <li><span class="item-name">Gunpowder Green Tea</span><span class="item-dots"></span><span class="item-price">$3.00</span></li>
            <li><span class="item-name">Chai, steamed</span><span class="item-dots"></span><span class="item-price">$4.50</span></li>
            <li><span class="item-name">Vanilla Bean Steamer</span><span class="item-dots"></span><span class="item-price">$3.75</span></li>
            <li><span class="item-name">Italian Soda</span><span class="item-dots"></span><span class="item-price">$3.50</span></li>
          </ul>
        </div>
        <div class="menu-group">
          <h3>From the case</h3>
          <ul class="menu-list">
            <li><span class="item-name">Brown Butter Croissant</span><span class="item-dots"></span><span class="item-price">$4.00</span></li>
            <li><span class="item-name">Cornmeal Ginger Scone</span><span class="item-dots"></span><span class="item-price">$3.75</span></li>
            <li><span class="item-name">Pistachio Financier</span><span class="item-dots"></span><span class="item-price">$3.50</span></li>
            <li><span class="item-name">Marionberry Hand Pie</span><span class="item-dots"></span><span class="item-price">$4.25</span></li>
          </ul>
        </div>
      </div>
    </div>
  </section>

  <section class="visit" id="visit">
    <div class="wrap visit-grid">
      <div>
        <h2>Visit us</h2>
        <address>
          214 Birch Street<br>
          Northgate, OR 97219
        </address>
        <p>
          <a href="tel:+15035550142">(503) 555-0142</a><br>
          <a href="mailto:hello@roan.coffee">hello@roan.coffee</a>
        </p>
      </div>
      <div class="hours-card">
        <h3>Hours</h3>
        <table>
          <tbody>
            <tr><td>Monday–Friday</td><td>6:30am – 6:00pm</td></tr>
            <tr><td>Saturday</td><td>7:00am – 6:00pm</td></tr>
            <tr><td>Sunday</td><td>7:00am – 3:00pm</td></tr>
          </tbody>
        </table>
      </div>
      <div class="map-card" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 21s7-7.2 7-12a7 7 0 1 0-14 0c0 4.8 7 12 7 12Z"/>
          <circle cx="12" cy="9" r="2.5"/>
        </svg>
      </div>
    </div>
  </section>
</main>

<footer class="site-footer">
  <div class="wrap footer-row">
    <p>&copy; 2026 Roan Coffee. Made with care on Birch Street.</p>
    <form class="newsletter" id="newsletter-form">
      <label for="newsletter-email">Get weekly roast notes</label>
      <div class="newsletter-row">
        <input id="newsletter-email" name="email" type="email" placeholder="you@example.com" autocomplete="email" required>
        <button type="submit">Subscribe</button>
      </div>
      <p class="newsletter-note" id="newsletter-note" role="status"></p>
    </form>
  </div>
</footer>

<script>
  var form = document.getElementById("newsletter-form");
  var note = document.getElementById("newsletter-note");
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    note.textContent = "Thanks — you're on the list.";
    form.reset();
  });
</script>
</body>
</html>
`;

const STYLES_CSS = `:root {
  --bg: #faf3ea;
  --bg-alt: #f1e2cd;
  --card: #ffffff;
  --text: #2c1c12;
  --text-soft: #6b5745;
  --brand: #b6532c;
  --brand-dark: #8a3d1f;
  --line: #e2d2bd;
  --radius: 14px;
  --font-body: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  --font-display: Georgia, "Times New Roman", Times, serif;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #1c130c;
    --bg-alt: #241a10;
    --card: #2a1e13;
    --text: #f3e7d8;
    --text-soft: #cbb69e;
    --brand: #e08a52;
    --brand-dark: #f3a06c;
    --line: #3a2c1e;
  }
}

* , *::before, *::after { box-sizing: border-box; }
html { color-scheme: light dark; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-body);
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}

img, svg { max-width: 100%; display: block; }
a { color: inherit; }

:focus-visible {
  outline: 3px solid var(--brand);
  outline-offset: 2px;
  border-radius: 4px;
}

.wrap {
  max-width: 1080px;
  margin: 0 auto;
  padding: 0 1.5rem;
}

.skip-link {
  position: absolute;
  left: -999px;
  top: auto;
  background: var(--brand);
  color: #fff;
  padding: .75rem 1rem;
  border-radius: 0 0 8px 0;
  z-index: 100;
  text-decoration: none;
}
.skip-link:focus { left: 0; top: 0; }

/* Header */
.site-header {
  position: sticky;
  top: 0;
  z-index: 20;
  background: var(--bg);
  border-bottom: 1px solid var(--line);
}
.header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.5rem;
  gap: 1rem;
  flex-wrap: wrap;
}
.brand {
  display: flex;
  align-items: center;
  gap: .6rem;
  font-family: var(--font-display);
  font-size: 1.15rem;
  font-weight: 700;
  text-decoration: none;
  color: var(--text);
}
.brand-mark { color: var(--brand); flex-shrink: 0; }
.site-nav { display: flex; gap: 1.5rem; font-size: .95rem; flex-wrap: wrap; }
.site-nav a {
  text-decoration: none;
  color: var(--text-soft);
  padding: .25rem 0;
  border-bottom: 2px solid transparent;
}
.site-nav a:hover, .site-nav a:focus-visible { color: var(--text); border-bottom-color: var(--brand); }

/* Steam animation */
.steam { transform-origin: center bottom; animation: steam-rise 3s ease-in-out infinite; }
.steam-1 { animation-delay: 0s; }
.steam-2 { animation-delay: .6s; }
.steam-3 { animation-delay: 1.2s; }
@keyframes steam-rise {
  0% { opacity: 0; transform: translateY(0) scaleY(.8); }
  30% { opacity: .9; }
  100% { opacity: 0; transform: translateY(-10px) scaleY(1.15); }
}
@media (prefers-reduced-motion: reduce) {
  .steam { animation: none; opacity: .5; }
}

/* Hero */
.hero {
  padding: clamp(2.5rem, 6vw, 5rem) 0 clamp(3rem, 7vw, 6rem);
  background: linear-gradient(180deg, var(--bg-alt), var(--bg) 70%);
  border-bottom: 1px solid var(--line);
}
.hero-grid {
  display: grid;
  grid-template-columns: 1.1fr .9fr;
  gap: 2.5rem;
  align-items: center;
}
.hero-art { max-width: 300px; margin: 0 auto; }
.eyebrow {
  text-transform: uppercase;
  letter-spacing: .12em;
  font-size: .75rem;
  font-weight: 700;
  color: var(--brand);
  margin: 0 0 .75rem;
}
.hero h1 {
  font-family: var(--font-display);
  font-size: clamp(1.9rem, 4.5vw, 3.1rem);
  line-height: 1.1;
  margin: 0 0 1rem;
}
.hero-lede { color: var(--text-soft); font-size: 1.05rem; max-width: 46ch; margin: 0 0 1.75rem; }
.hero-actions { display: flex; gap: .85rem; flex-wrap: wrap; }

.btn {
  display: inline-flex;
  align-items: center;
  padding: .7rem 1.3rem;
  border-radius: 999px;
  font-weight: 600;
  font-size: .95rem;
  text-decoration: none;
  border: 1px solid transparent;
}
.btn-primary { background: var(--brand); color: #fff; }
.btn-primary:hover { background: var(--brand-dark); }
.btn-ghost { border-color: var(--line); color: var(--text); }
.btn-ghost:hover { border-color: var(--brand); color: var(--brand); }

/* Story */
.story { padding: clamp(3rem, 6vw, 5rem) 0; }
.story h2, .menu h2, .visit h2 {
  font-family: var(--font-display);
  font-size: clamp(1.5rem, 3vw, 2.1rem);
  margin: 0 0 1rem;
}
.section-lede { color: var(--text-soft); max-width: 60ch; margin: 0 0 2.5rem; }
.feature-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.5rem; }
.feature {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 1.5rem;
}
.feature svg { color: var(--brand); margin-bottom: .85rem; }
.feature h3 { margin: 0 0 .5rem; font-size: 1.05rem; }
.feature p { margin: 0; color: var(--text-soft); font-size: .92rem; }

/* Menu */
.menu {
  padding: clamp(3rem, 6vw, 5rem) 0;
  background: var(--bg-alt);
  border-bottom: 1px solid var(--line);
}
.menu-columns { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2.5rem; }
.menu-group h3 {
  font-family: var(--font-display);
  font-size: 1.1rem;
  margin: 0 0 1rem;
  padding-bottom: .5rem;
  border-bottom: 2px solid var(--brand);
}
.menu-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: .85rem; }
.menu-list li { display: flex; align-items: baseline; gap: .4rem; font-size: .95rem; }
.item-name { flex-shrink: 0; }
.item-dots { flex: 1; border-bottom: 1px dotted var(--line); height: 0; transform: translateY(-4px); }
.item-price { flex-shrink: 0; font-variant-numeric: tabular-nums; color: var(--text-soft); }

/* Visit */
.visit { padding: clamp(3rem, 6vw, 5rem) 0; }
.visit-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 2rem; align-items: start; }
address { font-style: normal; color: var(--text-soft); }
.hours-card, .map-card {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 1.5rem;
}
.hours-card h3 { margin: 0 0 1rem; font-size: 1.05rem; }
.hours-card table { width: 100%; border-collapse: collapse; font-size: .92rem; }
.hours-card td { padding: .4rem 0; border-bottom: 1px solid var(--line); }
.hours-card td:last-child { text-align: right; color: var(--text-soft); }
.hours-card tr:last-child td { border-bottom: none; }
.map-card { display: flex; align-items: center; justify-content: center; min-height: 160px; color: var(--brand); }

/* Footer */
.site-footer { padding: 2.5rem 0; background: var(--bg-alt); border-top: 1px solid var(--line); }
.footer-row {
  display: flex;
  flex-wrap: wrap;
  gap: 1.5rem;
  align-items: flex-start;
  justify-content: space-between;
}
.newsletter { min-width: 240px; }
.newsletter label { display: block; font-weight: 600; font-size: .9rem; margin-bottom: .5rem; }
.newsletter-row { display: flex; gap: .5rem; }
.newsletter input {
  flex: 1;
  min-width: 0;
  padding: .6rem .75rem;
  border-radius: 8px;
  border: 1px solid var(--line);
  background: var(--card);
  color: var(--text);
  font-size: .9rem;
}
.newsletter button {
  padding: .6rem 1rem;
  border-radius: 8px;
  border: none;
  background: var(--brand);
  color: #fff;
  font-weight: 600;
  cursor: pointer;
}
.newsletter button:hover { background: var(--brand-dark); }
.newsletter-note { margin: .6rem 0 0; font-size: .85rem; color: var(--brand); min-height: 1.2em; }

/* Responsive down to 380px */
@media (max-width: 760px) {
  .hero-grid { grid-template-columns: 1fr; }
  .hero-art { order: -1; max-width: 200px; }
  .feature-grid { grid-template-columns: 1fr; }
  .menu-columns { grid-template-columns: 1fr; gap: 2rem; }
  .visit-grid { grid-template-columns: 1fr; }
  .footer-row { flex-direction: column; }
}

@media (max-width: 420px) {
  .wrap { padding: 0 1.1rem; }
  .site-nav { gap: 1rem; font-size: .88rem; }
  .hero-actions { flex-direction: column; align-items: stretch; }
  .btn { justify-content: center; }
}
`;

const WELCOME_MESSAGE =
  "This is Roan Coffee, an example site so you can see what Kodely builds. It's yours to edit — describe a change here in the chat, like \"give the hero a green palette\" or \"add a catering section,\" and I'll rebuild it live.";

/**
 * Gives a brand-new account a real, already-built example project instead of
 * an empty dashboard. Free onboarding content — never charges credits.
 */
export async function createSeedProject(userId: string): Promise<string> {
  const project = await db.project.create({
    data: {
      userId,
      name: "Example: Roan Coffee",
      slug: slugify("Example Roan Coffee"),
    },
  });

  await db.projectFile.createMany({
    data: [
      { projectId: project.id, path: "index.html", content: INDEX_HTML, published: false },
      { projectId: project.id, path: "styles.css", content: STYLES_CSS, published: false },
    ],
  });

  await db.message.create({
    data: {
      projectId: project.id,
      role: "assistant",
      content: WELCOME_MESSAGE,
    },
  });

  return project.id;
}
