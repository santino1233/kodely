/**
 * Kodely inline-SVG icon set.
 *
 * WHY THIS EXISTS AS SOURCE DATA AND NOT AN NPM PACKAGE
 * Generated sites are served under a CSP of
 *   default-src 'self'; img-src 'self' data:; connect-src 'none'
 * (see app/api/site/[slug]/[[...path]]/route.ts). There is no CDN, no icon
 * font, no remote sprite sheet, and the generated project cannot add
 * dependencies (lib/foundation.ts pins react + react-dom and nothing else).
 * The only icon mechanism that survives that sandbox is geometry pasted
 * straight into the site's own source — which is exactly what this module
 * hands out.
 *
 * PROVENANCE
 * The original ~147 icons below (the `DEFS` array) are hand-authored
 * geometry: primitives (lines, circles, rounded rectangles, single arcs) laid
 * out on a 24x24 grid, with corner rounding delegated to
 * stroke-linejoin="round" rather than drawn. No path data in `DEFS` was
 * copied from any icon library, free or licensed. The brand marks under the
 * "social" category are deliberately simplified, generic renderings drawn
 * from the same primitives — they are not the trademark artwork, and a site
 * using them commercially should check the platform's own brand guidelines.
 *
 * `VENDORED_DEFS`, further down, is a second and much smaller set: real path
 * data pulled verbatim from four permissively-licensed open-source icon
 * projects (Lucide, Tabler Icons, Phosphor Icons, Heroicons) to close gaps
 * the hand-authored set left — see the comment above that array for the full
 * account. Every entry there carries a `prov` field (see ./provenance.ts,
 * `VendorProvenance`) recording exactly which repo, which icon, which
 * licence, and which commit it came from, plus a saved copy of the licence
 * text under lib/assets/icon-licenses/. Nothing in `DEFS` was touched to make
 * room for it.
 *
 * STYLE
 * One geometry, three weights. Icons are outline/stroke drawings on a 24x24
 * viewBox; weight is a render-time stroke-width, not a second copy of the
 * data, which is how we get three styles for zero extra bytes.
 */

import { vendorProvenance, type VendorProvenance } from "./provenance";

export type IconCategory =
  | "contact"
  | "social"
  | "commerce"
  | "food"
  | "services"
  | "people"
  | "media"
  | "nature"
  | "ui";

/**
 * Compact on-disk form. `d` holds one or more path `d` strings joined by "|"
 * (each becomes its own <path>); `b` holds any extra raw child elements for
 * icons that need a circle/rect/filled dot. Both are optional but at least one
 * is always present.
 */
type IconDef = {
  id: string;
  name: string;
  c: IconCategory;
  /** Space-separated search terms. The id's own words are added automatically. */
  k: string;
  d?: string;
  b?: string;
  /** Present only on vendored icons — see VENDORED_DEFS below and ./provenance.ts. */
  prov?: VendorProvenance;
};

export type Icon = {
  id: string;
  name: string;
  category: IconCategory;
  keywords: string[];
  /** Inner markup of the <svg>. viewBox is always "0 0 24 24". */
  body: string;
  /** Per-asset source/licence record. Undefined means hand-authored, in-house geometry. */
  provenance?: VendorProvenance;
};

/** Stroke widths for the three weights. Same geometry, different pen. */
export const ICON_WEIGHTS = { light: 1.25, regular: 1.75, bold: 2.25 } as const;
export type IconWeight = keyof typeof ICON_WEIGHTS;

export const ICON_VIEWBOX = "0 0 24 24";

// A small filled dot, used for the punctuation inside i/!/? style glyphs and
// for the lens dot in brand marks. Written out here so the defs stay readable.
const dot = (cx: number, cy: number, r = 1) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="currentColor" stroke="none"/>`;

const DEFS: IconDef[] = [
  // ---------------------------------------------------------------- contact
  {
    id: "phone",
    name: "Phone",
    c: "contact",
    k: "call telephone handset ring contact dial",
    d: "M9 3H5a2 2 0 0 0-2 2c0 8.8 7.2 16 16 16a2 2 0 0 0 2-2v-4l-4.5-1.5-2 2.5a14.5 14.5 0 0 1-6.5-6.5l2.5-2z",
  },
  {
    id: "mail",
    name: "Mail",
    c: "contact",
    k: "email envelope contact message inbox newsletter subscribe",
    d: "M3.5 7.2 12 12.8l8.5-5.6",
    b: `<rect x="3" y="4.5" width="18" height="15" rx="2.5"/>`,
  },
  {
    id: "map-pin",
    name: "Map pin",
    c: "contact",
    k: "location address place marker directions where find us",
    d: "M12 21.5s7.5-6.6 7.5-11.5a7.5 7.5 0 0 0-15 0c0 4.9 7.5 11.5 7.5 11.5z",
    b: `<circle cx="12" cy="10" r="2.6"/>`,
  },
  {
    id: "clock",
    name: "Clock",
    c: "contact",
    k: "time hours opening schedule when duration wait",
    d: "M12 6.8V12.4l3.6 2.1",
    b: `<circle cx="12" cy="12" r="9"/>`,
  },
  {
    id: "calendar",
    name: "Calendar",
    c: "contact",
    k: "date booking appointment schedule event reserve month",
    d: "M3 9.5h18M8 2.8V6.5M16 2.8V6.5",
    b: `<rect x="3" y="4.5" width="18" height="17" rx="2.5"/>`,
  },
  {
    id: "globe",
    name: "Globe",
    c: "contact",
    k: "world web international language country website global",
    d: "M3 12h18M12 3c2.6 2.7 4 5.7 4 9s-1.4 6.3-4 9c-2.6-2.7-4-5.7-4-9s1.4-6.3 4-9z",
    b: `<circle cx="12" cy="12" r="9"/>`,
  },
  {
    id: "send",
    name: "Send",
    c: "contact",
    k: "submit paper plane message deliver contact form",
    d: "M21.2 2.8 11 13M21.2 2.8 14.8 21.4 11 13 2.6 9.2z",
  },
  {
    id: "message-circle",
    name: "Message",
    c: "contact",
    k: "chat bubble comment review testimonial support talk sms",
    d: "M20.5 11.6c0 4.4-3.8 7.9-8.5 7.9a9.4 9.4 0 0 1-3.4-.6L3.5 20.5l1.7-4.4a7.6 7.6 0 0 1-1.7-4.5c0-4.4 3.8-7.9 8.5-7.9s8.5 3.5 8.5 7.9z",
  },
  {
    id: "compass",
    name: "Compass",
    c: "contact",
    k: "directions navigate explore find route guide",
    d: "m15.5 8.5-2 5-5 2 2-5z",
    b: `<circle cx="12" cy="12" r="9"/>`,
  },
  {
    id: "printer",
    name: "Printer",
    c: "contact",
    k: "print fax office document paper",
    d: "M7 8.5V3h10v5.5M7 17.5H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2",
    b: `<rect x="7" y="14" width="10" height="7" rx="1.2"/>`,
  },

  // ----------------------------------------------------------------- social
  {
    id: "instagram",
    name: "Instagram",
    c: "social",
    k: "social photo insta ig follow feed",
    b: `<rect x="3" y="3" width="18" height="18" rx="5.2"/><circle cx="12" cy="12" r="4.1"/>${dot(17.2, 6.9, 1.05)}`,
  },
  {
    id: "facebook",
    name: "Facebook",
    c: "social",
    k: "social meta fb follow page like",
    d: "M13.5 21.4v-7.6h2.6l.5-3.1h-3.1V8.4c0-.9.4-1.6 1.8-1.6h1.5V4a19 19 0 0 0-2.4-.2c-2.5 0-4.1 1.5-4.1 4.2v2.3H7.4v3.1h2.9v7.6z",
  },
  {
    id: "x-twitter",
    name: "X (Twitter)",
    c: "social",
    k: "social twitter tweet follow bird post",
    d: "M4.5 3.6 19.5 20.4M19.5 3.6 4.5 20.4",
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    c: "social",
    k: "social professional network career job business connect",
    d: "M8 10.6v6.6M12 17.2v-6.6M12 13.6a2.7 2.7 0 0 1 5.4 0v3.6",
    b: `<rect x="3" y="3" width="18" height="18" rx="4.2"/>${dot(8, 7.4, 1.05)}`,
  },
  {
    id: "tiktok",
    name: "TikTok",
    c: "social",
    k: "social video short reels follow music clip",
    d: "M14.8 3v11.4a4.3 4.3 0 1 1-3.5-4.2M14.8 3c.4 2.7 2.3 4.4 5 4.6",
  },
  {
    id: "youtube",
    name: "YouTube",
    c: "social",
    k: "social video watch channel subscribe play tube",
    d: "m10.2 9.3 5.3 2.7-5.3 2.7z",
    b: `<rect x="2.5" y="5.5" width="19" height="13" rx="4"/>`,
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    c: "social",
    k: "social chat message contact whats app text order",
    d: "M3.5 20.5 5 16.2A8.4 8.4 0 1 1 8.3 19.3zM9 9.4c0 3 2.5 5.5 5.5 5.5.6 0 1.1-.5 1.1-1.1v-.9l-1.8-.7-.9 1a5.6 5.6 0 0 1-2.2-2.2l1-.9-.7-1.8h-.9c-.6 0-1.1.5-1.1 1.1z",
  },
  {
    id: "pinterest",
    name: "Pinterest",
    c: "social",
    k: "social pin board inspiration save idea",
    d: "M9.8 20.7 12.5 8.9M11 13.4a3.3 3.3 0 0 0 4.9-1.4 3.9 3.9 0 0 0-2.1-5 3.9 3.9 0 0 0-5.1 2",
    b: `<circle cx="12" cy="12" r="9"/>`,
  },
  {
    id: "telegram",
    name: "Telegram",
    c: "social",
    k: "social chat channel message plane send",
    d: "M21.2 3.8 2.9 11.1l5 1.7 1.8 5.6 2.6-3.2 4.4 3.2zM7.9 12.8l9.8-7.2-6.5 9.6",
  },
  {
    id: "github",
    name: "GitHub",
    c: "social",
    k: "social code repository developer open source git",
    d: "M15.5 21.3v-3.6c0-1-.3-1.7-.9-2.2 3-.3 6-1.5 6-6.2a4.8 4.8 0 0 0-1.3-3.3 4.5 4.5 0 0 0-.1-3.3s-1-.3-3.4 1.3a11.6 11.6 0 0 0-6 0C7.4 2.4 6.4 2.7 6.4 2.7a4.5 4.5 0 0 0-.1 3.3A4.8 4.8 0 0 0 5 9.3c0 4.7 3 5.9 5.9 6.2-.5.5-.8 1.1-.9 1.9v3.9M10 18.4c-2.8 1-4.2-.6-5-1.7",
  },

  // --------------------------------------------------------------- commerce
  {
    id: "shopping-cart",
    name: "Shopping cart",
    c: "commerce",
    k: "buy basket checkout store ecommerce order purchase",
    d: "M2.5 3.5h2.3l2.4 11.4h11l2.4-8.4H6",
    b: `<circle cx="9" cy="19.5" r="1.7"/><circle cx="17.5" cy="19.5" r="1.7"/>`,
  },
  {
    id: "shopping-bag",
    name: "Shopping bag",
    c: "commerce",
    k: "buy shop retail boutique purchase order tote",
    d: "M4.5 7.5h15L21 21.3H3zM8.5 10.4V6.8a3.5 3.5 0 0 1 7 0v3.6",
  },
  {
    id: "credit-card",
    name: "Credit card",
    c: "commerce",
    k: "payment pay checkout visa billing money secure",
    d: "M2.5 10h19M6 15h4",
    b: `<rect x="2.5" y="5" width="19" height="14" rx="2.5"/>`,
  },
  {
    id: "tag",
    name: "Tag",
    c: "commerce",
    k: "price label sale offer discount deal category",
    d: "M11.6 3H3v8.6l9.4 9.4 8.6-8.6z",
    b: `<circle cx="7.4" cy="7.4" r="1.6"/>`,
  },
  {
    id: "truck",
    name: "Delivery truck",
    c: "commerce",
    k: "shipping delivery freight logistics courier van transport",
    d: "M2.5 6.5h11v9h-11zM13.5 10h4l3.5 3.2v2.3h-7.5M8.8 18h6.4M2.5 15.5h2.7",
    b: `<circle cx="7" cy="18" r="1.8"/><circle cx="17" cy="18" r="1.8"/>`,
  },
  {
    id: "package",
    name: "Package",
    c: "commerce",
    k: "box parcel product shipping inventory order bundle",
    d: "M21 8.2 12 3 3 8.2v7.6L12 21l9-5.2zM3 8.2l9 5.2 9-5.2M12 13.4V21M7.5 5.6l9 5.2",
  },
  {
    id: "receipt",
    name: "Receipt",
    c: "commerce",
    k: "invoice bill order total purchase tax paper",
    d: "M5 3h14v18.2l-2.3-1.6-2.4 1.6-2.3-1.6-2.3 1.6-2.4-1.6L5 21.2zM9 8h6M9 12h6",
  },
  {
    id: "wallet",
    name: "Wallet",
    c: "commerce",
    k: "money payment balance cash funds pay account",
    d: "M3 8A2.5 2.5 0 0 1 5.5 5.5H18V8",
    b: `<rect x="3" y="8" width="18" height="11.5" rx="2.5"/>${dot(17.3, 13.8, 1.1)}`,
  },
  {
    id: "gift",
    name: "Gift",
    c: "commerce",
    k: "present voucher reward loyalty birthday bonus wrap",
    d: "M4.5 13v8.2h15V13M12 8.5v12.7M12 8.5S10.5 3 8 3.6 8.7 8.5 12 8.5zM12 8.5s1.5-5.5 4-4.9-.7 4.9-4 4.9z",
    b: `<rect x="3" y="8.5" width="18" height="4.5" rx="1.2"/>`,
  },
  {
    id: "percent",
    name: "Percent",
    c: "commerce",
    k: "discount sale offer deal off promo coupon",
    d: "M6 18 18 6",
    b: `<circle cx="7.5" cy="7.5" r="2.2"/><circle cx="16.5" cy="16.5" r="2.2"/>`,
  },
  {
    id: "store",
    name: "Storefront",
    c: "commerce",
    k: "shop retail business location branch market",
    d: "M3.5 9.4v11.9h17V9.4M2.2 9.4 4.6 3.5h14.8l2.4 5.9zM9 21.3v-6.4h6v6.4",
  },
  {
    id: "barcode",
    name: "Barcode",
    c: "commerce",
    k: "sku scan product inventory label upc",
    d: "M4 5v14M7 5v14M10 5v10M13 5v14M16 5v10M20 5v14",
  },

  // ------------------------------------------------------------------- food
  {
    id: "coffee",
    name: "Coffee",
    c: "food",
    k: "cafe espresso latte drink cup barista brew morning",
    d: "M4 5.5h13V14a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM17 8h1.8a2.8 2.8 0 0 1 0 5.6H17M4 21.5h13",
  },
  {
    id: "utensils",
    name: "Fork and spoon",
    c: "food",
    k: "restaurant food dining menu eat cutlery kitchen meal",
    d: "M7 3v6a2.4 2.4 0 0 0 4.8 0V3M9.4 11.4V21M7 3v6M11.8 3v6M16.5 21v-7.5M16.5 13.5c-2 0-3.2-1.9-3.2-4.5S14.5 3 16.5 3s3.2 3.4 3.2 6-1.2 4.5-3.2 4.5z",
  },
  {
    id: "pizza",
    name: "Pizza",
    c: "food",
    k: "italian slice pizzeria takeaway food delivery",
    d: "M12 2.6 21.6 20A22 22 0 0 1 2.4 20z",
    b: `${dot(10, 12, 1.2)}${dot(14.4, 15.6, 1.2)}${dot(9.6, 17.2, 1.2)}`,
  },
  {
    id: "wine",
    name: "Wine",
    c: "food",
    k: "bar drink glass vineyard alcohol cellar tasting",
    d: "M7 3h10l-.7 6.3a4.4 4.4 0 0 1-8.6 0zM12 13.8V21M8 21h8",
  },
  {
    id: "beer",
    name: "Beer",
    c: "food",
    k: "pub bar brewery drink pint tap ale lager",
    d: "M5.5 7.4h10v13.8h-10zM15.5 10.4h2.6a2.4 2.4 0 0 1 0 4.8h-2.6M5.5 7.4c0-2.2 1.5-3.6 3.3-3.6.7-1 3-1.3 4 .2 1.7-.5 3.1.9 2.7 3.4M9 11v6M12 11v6",
  },
  {
    id: "ice-cream",
    name: "Ice cream",
    c: "food",
    k: "gelato dessert cone sweet summer treat",
    d: "M8 10.6 12 21.2l4-10.6zM7.2 10.6a4.8 4.8 0 0 1 9.6 0z",
  },
  {
    id: "cake",
    name: "Cake",
    c: "food",
    k: "bakery dessert birthday celebration patisserie sweet",
    d: "M4 12.5h16v8.7H4zM4 16.6c1.6 1.3 2.7 1.3 4 0s2.7-1.3 4 0 2.7 1.3 4 0 2.4-1.3 4 0M8 12.5V9M12 12.5V8.5M16 12.5V9",
    b: `<circle cx="8" cy="6.9" r="1.1"/><circle cx="12" cy="6.4" r="1.1"/><circle cx="16" cy="6.9" r="1.1"/>`,
  },
  {
    id: "bread",
    name: "Bread",
    c: "food",
    k: "bakery loaf sourdough baker artisan food",
    d: "M4 10.6a4.1 4.1 0 0 1 4.1-4.1h7.8a4.1 4.1 0 0 1 4.1 4.1v6.3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM9 6.6v12.3M13.5 6.6v12.3",
  },
  {
    id: "salad",
    name: "Salad bowl",
    c: "food",
    k: "healthy vegan vegetarian fresh greens bowl lunch",
    d: "M3 11.5h18a9 9 0 0 1-18 0zM12 11.5c0-3 1.8-5.6 4.6-6.6M12 11.5c-1.6-2-1.4-4.6.5-6.1",
  },
  {
    id: "chef-hat",
    name: "Chef hat",
    c: "food",
    k: "cooking kitchen restaurant catering cuisine chef menu",
    d: "M6.5 20.6v-5A5 5 0 0 1 8 6a4.5 4.5 0 0 1 8 0 5 5 0 0 1 1.5 9.6v5zM6.5 17.5h11",
  },
  {
    id: "cocktail",
    name: "Cocktail",
    c: "food",
    k: "bar martini drink happy hour mixology lounge alcohol",
    d: "M3.5 5.5h17L12 14zM12 14v6.6M8 20.6h8",
  },
  {
    id: "bowl",
    name: "Bowl",
    c: "food",
    k: "soup ramen noodles pho asian hot dish",
    d: "M3 10.5h18a9 9 0 0 1-18 0zM8 7c0-1.2 1-1.6 1-2.8M12 6.5c0-1.5 1-2 1-3.5M16 7c0-1.2 1-1.6 1-2.8",
  },

  // --------------------------------------------------------------- services
  {
    id: "scissors",
    name: "Scissors",
    c: "services",
    k: "salon barber hair cut stylist groom trim",
    d: "M8.6 8 20 19M8.6 16 20 5",
    b: `<circle cx="6.4" cy="6.5" r="2.6"/><circle cx="6.4" cy="17.5" r="2.6"/>`,
  },
  {
    id: "dumbbell",
    name: "Dumbbell",
    c: "services",
    k: "gym fitness workout training weights strength coach sport",
    d: "M3 9.5v5M6 7v10M18 7v10M21 9.5v5M6 12h12",
  },
  {
    id: "wrench",
    name: "Wrench",
    c: "services",
    k: "repair plumber mechanic fix maintenance handyman tools service",
    d: "M20 5.5a5.5 5.5 0 0 1-7.4 7.1L5.4 19.8a2 2 0 0 1-2.8-2.8l7.2-7.2A5.5 5.5 0 0 1 17 2.2l-3.2 3.2.9 3.1 3.1.9z",
  },
  {
    id: "hammer",
    name: "Hammer",
    c: "services",
    k: "construction builder carpenter renovation contractor diy tools",
    d: "M14 2.5 21.5 6l-2.2 4.8-7.5-3.5zM13.3 9.4 5 19.4a1.9 1.9 0 0 0 2.7 2.7l9.3-8.8",
  },
  {
    id: "paw",
    name: "Paw",
    c: "services",
    k: "pet dog cat vet grooming animal kennel groomer",
    d: "M12 11.4c-2.9 0-5.6 2.4-5.6 5.3 0 2 1.6 3.4 3.5 3l2.1-.5 2.1.5c1.9.4 3.5-1 3.5-3 0-2.9-2.7-5.3-5.6-5.3z",
    b: `<circle cx="5.6" cy="10.2" r="2"/><circle cx="9.6" cy="6.4" r="2.1"/><circle cx="14.4" cy="6.4" r="2.1"/><circle cx="18.4" cy="10.2" r="2"/>`,
  },
  {
    id: "camera",
    name: "Camera",
    c: "services",
    k: "photo photography photographer studio portrait shoot gallery",
    d: "M8.5 7 10 4h4l1.5 3",
    b: `<rect x="2.5" y="7" width="19" height="13" rx="2.5"/><circle cx="12" cy="13.5" r="3.6"/>`,
  },
  {
    id: "paint-brush",
    name: "Paint brush",
    c: "services",
    k: "painter decorator art design colour studio creative renovation",
    d: "M17.6 2.9a2 2 0 0 1 2.8 2.8L12 14.2l-3.4-3.4zM8.6 10.8 5.4 14a3.5 3.5 0 0 0-1 2.5c0 1-.4 1.7-1.4 2.4 1 .9 2.4 1.4 3.7 1.4a4 4 0 0 0 4-4c0-.6.2-1 .6-1.4l.7-.7z",
  },
  {
    id: "spray",
    name: "Spray bottle",
    c: "services",
    k: "cleaning cleaner housekeeping sanitise laundry maid service",
    d: "M9.5 9V6h4v3M16 6h2.4M16 3.6h2.4M16 8.4h2.4",
    b: `<rect x="7" y="9" width="9" height="12.2" rx="2"/>`,
  },
  {
    id: "leaf",
    name: "Leaf",
    c: "services",
    k: "garden landscaping eco green organic natural plants nursery",
    d: "M20.5 3.5C11 3 5 7 5 14a6.5 6.5 0 0 0 6.5 6.5C18 20.5 21 14.5 20.5 3.5zM4 21 14 11",
  },
  {
    id: "sprout",
    name: "Sprout",
    c: "services",
    k: "plant grow nursery seedling garden florist sustainable",
    d: "M12 21.2v-8.2M12 13c0-3-2-5.5-5.5-5.5C6.5 11 8.5 13 12 13zM12 13c0-3.5 2-6.5 5.5-6.5C17.5 10.5 15.5 13 12 13z",
  },
  {
    id: "stethoscope",
    name: "Stethoscope",
    c: "services",
    k: "doctor clinic medical health nurse gp practice healthcare",
    d: "M5 3v5a4.5 4.5 0 0 0 9 0V3M5 3H3.5M14 3h1.5M9.5 12.5v2a5 5 0 0 0 10 0v-1.3",
    b: `<circle cx="19.5" cy="10.4" r="2.2"/>`,
  },
  {
    id: "tooth",
    name: "Tooth",
    c: "services",
    k: "dentist dental orthodontist hygienist smile clinic teeth",
    d: "M6.2 4.5C4 6 3.5 8.6 4.3 11.6c.9 3.4 1.3 5.5 1.7 7.6.3 1.7 2.6 2 3.2.4.5-1.4.9-3.2 1.5-3.9a1.7 1.7 0 0 1 2.6 0c.6.7 1 2.5 1.5 3.9.6 1.6 2.9 1.3 3.2-.4.4-2.1.8-4.2 1.7-7.6.8-3 .3-5.6-1.9-7.1-2-1.4-4.1-.4-5.8-.4s-3.8-1-5.8.4z",
  },
  {
    id: "car",
    name: "Car",
    c: "services",
    k: "automotive garage taxi rental mechanic vehicle driving valet",
    d: "M3 15.5h18v-2.7l-2-1L17 6.5H7L5 11.8l-2 1zM5 11.8h14",
    b: `<circle cx="7.5" cy="17.2" r="1.8"/><circle cx="16.5" cy="17.2" r="1.8"/>`,
  },
  {
    id: "key",
    name: "Key",
    c: "services",
    k: "estate agent locksmith rental property access secure keys letting",
    d: "M10.4 13.6l9-9M17 7l2.5 2.5M14.5 9.5l2.5 2.5",
    b: `<circle cx="7.5" cy="16.5" r="4"/>`,
  },
  {
    id: "home",
    name: "Home",
    c: "services",
    k: "house property real estate interior residential move mortgage",
    d: "M3 11 12 3l9 8M5.5 9.3V21.2h13V9.3M9.8 21.2v-6.5h4.4v6.5",
  },
  {
    id: "building",
    name: "Building",
    c: "services",
    k: "office company commercial apartment corporate premises hq",
    d: "M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2M10.5 21.2v-3.2h3v3.2",
    b: `<rect x="4" y="2.8" width="16" height="18.4" rx="1.5"/>`,
  },
  {
    id: "briefcase",
    name: "Briefcase",
    c: "services",
    k: "business work consulting professional career portfolio corporate",
    d: "M8.5 7V5.5a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2V7M2.5 12.5h19",
    b: `<rect x="2.5" y="7" width="19" height="13" rx="2"/>`,
  },
  {
    id: "graduation-cap",
    name: "Graduation cap",
    c: "services",
    k: "school education tutor course academy training university learn class",
    d: "M2 8.5 12 4l10 4.5-10 4.5zM6.5 10.5v5c0 1.8 2.5 3 5.5 3s5.5-1.2 5.5-3v-5M21 9.2v5.3",
  },
  {
    id: "lotus",
    name: "Lotus",
    c: "services",
    k: "spa yoga wellness massage beauty meditation calm therapy",
    d: "M12 20.5c-4 0-7.5-2.6-8.5-6 1.6-.6 3-.5 4.2.2M12 20.5c4 0 7.5-2.6 8.5-6-1.6-.6-3-.5-4.2.2M12 20.5c-2.5-2-3.8-4.6-3.8-7.3 0-2.6 1.3-5 3.8-6.7 2.5 1.7 3.8 4.1 3.8 6.7 0 2.7-1.3 5.3-3.8 7.3z",
  },
  {
    id: "ticket",
    name: "Ticket",
    c: "services",
    k: "event booking admission cinema concert pass venue tickets",
    d: "M3 8.5V5.5h18v3a3.5 3.5 0 0 0 0 7v3H3v-3a3.5 3.5 0 0 0 0-7zM13 5.5v2M13 11v2M13 16.5v2",
  },

  // ----------------------------------------------------------------- people
  {
    id: "user",
    name: "User",
    c: "people",
    k: "person account profile customer member login avatar client",
    d: "M4.5 20.5a7.5 7.5 0 0 1 15 0",
    b: `<circle cx="12" cy="8" r="4"/>`,
  },
  {
    id: "users",
    name: "Team",
    c: "people",
    k: "people group team staff community members about us crew",
    d: "M3 20.5a6.5 6.5 0 0 1 13 0M16 4.8a3.6 3.6 0 0 1 0 6.9M17.5 14.4a6.5 6.5 0 0 1 3.5 5.8",
    b: `<circle cx="9.5" cy="8" r="3.6"/>`,
  },
  {
    id: "smile",
    name: "Smile",
    c: "people",
    k: "happy face satisfaction friendly review rating emoji",
    d: "M8 14.2a5 5 0 0 0 8 0",
    b: `<circle cx="12" cy="12" r="9"/>${dot(9, 9.5)}${dot(15, 9.5)}`,
  },
  {
    id: "thumbs-up",
    name: "Thumbs up",
    c: "people",
    k: "like approve recommend rating good positive feedback",
    d: "M7 10.5 11.2 3.2a2.7 2.7 0 0 1 2.4 2.7v3.6h4.9a2.2 2.2 0 0 1 2.2 2.7l-1.4 6.2a2.7 2.7 0 0 1-2.6 2.1H7z",
    b: `<rect x="2.5" y="10.5" width="4.5" height="10" rx="1.2"/>`,
  },
  {
    id: "bed",
    name: "Bed",
    c: "services",
    k: "hotel accommodation guesthouse room stay bnb lodging sleep booking",
    d: "M3 20.5V6.5M3 16.5h18v4M10.5 11.5H17a4 4 0 0 1 4 4v1",
    b: `<circle cx="6.9" cy="13.2" r="2.3"/>`,
  },
  {
    id: "id-card",
    name: "ID card",
    c: "people",
    k: "member badge staff licence credential identity pass",
    d: "M14 10.5h4M14 14h4M6 16.5a3 3 0 0 1 5 0",
    b: `<rect x="2.5" y="4.5" width="19" height="15" rx="2.5"/><circle cx="8.5" cy="11" r="2"/>`,
  },

  // ------------------------------------------------------------------ media
  {
    id: "image",
    name: "Image",
    c: "media",
    k: "photo picture gallery portfolio media upload thumbnail",
    d: "m3.5 17.5 5-5 4.5 4.5 3-3 4.5 4.5",
    b: `<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><circle cx="8.6" cy="9.8" r="1.8"/>`,
  },
  {
    id: "video",
    name: "Video",
    c: "media",
    k: "film recording camera reel movie clip vlog",
    d: "m15.5 10.5 6-3.5v10l-6-3.5z",
    b: `<rect x="2.5" y="6" width="13" height="12" rx="2.5"/>`,
  },
  {
    id: "music",
    name: "Music",
    c: "media",
    k: "audio song band dj playlist sound studio note",
    d: "M9 18V5l11-2v13",
    b: `<circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>`,
  },
  {
    id: "mic",
    name: "Microphone",
    c: "services",
    k: "podcast voice recording speaker interview audio",
    d: "M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3.5M8.5 21.5h7",
    b: `<rect x="9" y="2.5" width="6" height="11" rx="3"/>`,
  },
  {
    id: "headphones",
    name: "Headphones",
    c: "media",
    k: "audio support listen sound music helpdesk",
    d: "M4 15v-3a8 8 0 0 1 16 0v3",
    b: `<rect x="2.5" y="13.5" width="4.5" height="7" rx="2"/><rect x="17" y="13.5" width="4.5" height="7" rx="2"/>`,
  },
  {
    id: "book",
    name: "Book",
    c: "media",
    k: "read menu guide library story catalogue blog manual",
    d: "M4 4.5A2 2 0 0 1 6 2.5h13v16H6a2 2 0 0 0-2 2zM4 20.5h15v-2",
  },
  {
    id: "newspaper",
    name: "Newspaper",
    c: "media",
    k: "news press blog article editorial magazine media",
    d: "M20 5.5H6.5v15h12a1.5 1.5 0 0 0 1.5-1.5zM6.5 20.5H5a1.5 1.5 0 0 1-1.5-1.5V8.5h3M9.5 9H17M9.5 12.5H17M9.5 16h4.5",
  },
  {
    id: "file-text",
    name: "Document",
    c: "media",
    k: "file paper pdf report download form terms policy",
    d: "M13.5 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5zM13.5 3v5.5H19M8.5 13h7M8.5 17h5",
  },
  {
    id: "monitor",
    name: "Monitor",
    c: "media",
    k: "desktop screen web design computer display website",
    d: "M8 21.2h8M12 17v4.2",
    b: `<rect x="2.5" y="4" width="19" height="13" rx="2"/>`,
  },
  {
    id: "smartphone",
    name: "Smartphone",
    c: "media",
    k: "mobile app phone responsive device ios android",
    d: "M10.5 18.5h3",
    b: `<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/>`,
  },
  {
    id: "code",
    name: "Code",
    c: "media",
    k: "developer software programming web build engineering api",
    d: "M8.5 7 3 12l5.5 5M15.5 7 21 12l-5.5 5M13.5 4l-3 16",
  },
  {
    id: "cloud",
    name: "Cloud",
    c: "media",
    k: "hosting saas backup storage online server sync",
    d: "M7 19.5a4.6 4.6 0 0 1-.4-9 6 6 0 0 1 11.4 0 4.5 4.5 0 0 1 0 9z",
  },
  {
    id: "database",
    name: "Database",
    c: "media",
    k: "data storage records server hosting backend",
    d: "M4.5 5.5v13c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-13M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3",
    b: `<ellipse cx="12" cy="5.5" rx="7.5" ry="3"/>`,
  },
  {
    id: "wifi",
    name: "Wi-Fi",
    c: "media",
    k: "internet connection network hotspot free wifi signal",
    d: "M2.5 9a15 15 0 0 1 19 0M6 12.6a10 10 0 0 1 12 0M9.5 16.2a5 5 0 0 1 5 0",
    b: dot(12, 19.6, 1.2),
  },
  {
    id: "chart-bar",
    name: "Bar chart",
    c: "media",
    k: "analytics stats growth results metrics report data",
    d: "M3 21.2h18M6.5 21.2v-6M12 21.2V8M17.5 21.2v-10",
  },
  {
    id: "chart-line",
    name: "Line chart",
    c: "media",
    k: "analytics trend growth performance metrics results roi",
    d: "M3 3v18.2h18M6.5 15.5l4-4.5 3.5 3 5.5-6.5",
  },
  {
    id: "pie-chart",
    name: "Pie chart",
    c: "media",
    k: "analytics share breakdown percentage report split",
    d: "M12 3a9 9 0 1 0 9 9h-9zM15 3.2A9 9 0 0 1 20.8 9H15z",
  },
  {
    id: "palette",
    name: "Palette",
    c: "media",
    k: "design colour brand art creative theme studio",
    d: "M12 21.5a9.5 9.5 0 1 1 0-19c5.2 0 9.5 3.6 9.5 8 0 2.6-2.1 4.2-4.6 4.2h-2c-1.3 0-2.3 1-2.3 2.2 0 .6.2 1 .5 1.5.3.4.5.9.5 1.4 0 1-.8 1.7-1.6 1.7z",
    b: `${dot(7.5, 12.5, 1.2)}${dot(9, 8.5, 1.2)}${dot(13, 7, 1.2)}${dot(16.5, 9.5, 1.2)}`,
  },

  // ----------------------------------------------------------------- nature
  {
    id: "sun",
    name: "Sun",
    c: "nature",
    k: "light day weather summer bright outdoor solar",
    d: "M12 2.5v2.3M12 19.2v2.3M21.5 12h-2.3M4.8 12H2.5M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6M18.7 18.7l-1.6-1.6M6.9 6.9 5.3 5.3",
    b: `<circle cx="12" cy="12" r="4.2"/>`,
  },
  {
    id: "moon",
    name: "Moon",
    c: "nature",
    k: "night dark mode evening late sleep",
    d: "M20.5 14.3A9 9 0 0 1 9.7 3.5a9 9 0 1 0 10.8 10.8z",
  },
  {
    id: "droplet",
    name: "Droplet",
    c: "nature",
    k: "water plumbing hydration clean wash pool spa",
    d: "M12 21.5a6.5 6.5 0 0 0 6.5-6.5c0-4.3-6.5-12.5-6.5-12.5S5.5 10.7 5.5 15a6.5 6.5 0 0 0 6.5 6.5z",
  },
  {
    id: "flame",
    name: "Flame",
    c: "nature",
    k: "fire hot grill heating bbq energy trending popular",
    d: "M12 21.5c3.6 0 6.5-2.7 6.5-6 0-4.5-4-6-4.5-11-2 1.5-3.5 3.5-3.5 6 0 1.5-1 2-1.5 1-.4-.8-.5-1.6-.5-2.4C6.8 11 5.5 13 5.5 15.5c0 3.3 2.9 6 6.5 6z",
  },
  {
    id: "tree",
    name: "Tree",
    c: "nature",
    k: "park forest outdoor nature garden woodland arborist",
    d: "M12 3 7 11h3l-4 6h12l-4-6h3zM12 17v4.2",
  },
  {
    id: "mountain",
    name: "Mountain",
    c: "nature",
    k: "outdoor hiking adventure travel peak landscape trek",
    d: "M2 20 9 8l4.5 7 2-3L22 20z",
  },
  {
    id: "waves",
    name: "Waves",
    c: "nature",
    k: "sea ocean beach surf pool water coastal",
    d: "M2 8.5c2-2 4-2 6 0s4 2 6 0 4-2 6 0M2 13.5c2-2 4-2 6 0s4 2 6 0 4-2 6 0M2 18.5c2-2 4-2 6 0s4 2 6 0 4-2 6 0",
  },
  {
    id: "plane",
    name: "Plane",
    c: "nature",
    k: "travel flight airport holiday tourism trip transfer",
    d: "M10.5 2.5a1.5 1.5 0 0 1 3 0v6l8 4.5v2.5l-8-2.5v4l2.5 2v1.5L12 19.5l-4 1V20l2.5-2v-4l-8 2.5V14l8-4.5z",
  },

  // --------------------------------------------------------------------- ui
  { id: "check", name: "Check", c: "ui", k: "tick yes done complete included success", d: "M4.5 12.5 9.5 17.5 19.5 6.5" },
  {
    id: "check-circle",
    name: "Check circle",
    c: "ui",
    k: "tick done success confirmed verified included feature",
    d: "m8 12.2 2.9 2.9 5.3-5.3",
    b: `<circle cx="12" cy="12" r="9"/>`,
  },
  { id: "close", name: "Close", c: "ui", k: "x cancel dismiss remove exit clear no", d: "M6 6 18 18M18 6 6 18" },
  { id: "plus", name: "Plus", c: "ui", k: "add new create more expand", d: "M12 5v14M5 12h14" },
  { id: "minus", name: "Minus", c: "ui", k: "remove subtract less collapse", d: "M5 12h14" },
  { id: "arrow-right", name: "Arrow right", c: "ui", k: "next forward continue cta go", d: "M4 12h15M13 6l6 6-6 6" },
  { id: "arrow-left", name: "Arrow left", c: "ui", k: "back previous return", d: "M20 12H5M11 6l-6 6 6 6" },
  { id: "arrow-up", name: "Arrow up", c: "ui", k: "top increase rise scroll up", d: "M12 20V5M6 11l6-6 6 6" },
  { id: "arrow-down", name: "Arrow down", c: "ui", k: "bottom decrease scroll down more", d: "M12 4v15M6 13l6 6 6-6" },
  {
    id: "arrow-up-right",
    name: "Arrow up right",
    c: "ui",
    k: "external open diagonal launch link cta",
    d: "M7 17 17 7M8.5 7H17v8.5",
  },
  { id: "chevron-right", name: "Chevron right", c: "ui", k: "next carousel slider more expand", d: "M9 5l7 7-7 7" },
  { id: "chevron-left", name: "Chevron left", c: "ui", k: "previous carousel slider back", d: "M15 5l-7 7 7 7" },
  { id: "chevron-down", name: "Chevron down", c: "ui", k: "accordion dropdown expand faq select open", d: "M5 9l7 7 7-7" },
  { id: "chevron-up", name: "Chevron up", c: "ui", k: "accordion collapse close scroll top", d: "M5 15l7-7 7 7" },
  { id: "menu", name: "Menu", c: "ui", k: "hamburger nav navigation mobile burger bars", d: "M4 7h16M4 12h16M4 17h16" },
  {
    id: "more-horizontal",
    name: "More",
    c: "ui",
    k: "ellipsis options dots overflow actions",
    b: `${dot(5, 12, 1.5)}${dot(12, 12, 1.5)}${dot(19, 12, 1.5)}`,
  },
  {
    id: "search",
    name: "Search",
    c: "ui",
    k: "find magnifier lookup filter query explore",
    d: "m15.3 15.3 5.2 5.2",
    b: `<circle cx="10.5" cy="10.5" r="6.5"/>`,
  },
  { id: "filter", name: "Filter", c: "ui", k: "sort refine narrow options funnel", d: "M3 5h18l-7 8v6.5l-4 2V13z" },
  {
    id: "star",
    name: "Star",
    c: "ui",
    k: "rating review favourite testimonial quality five stars",
    d: "M12 3.2 14.1 9.3 20.6 9.4 15.4 13.3 17.3 19.5 12 15.8 6.7 19.5 8.6 13.3 3.4 9.4 9.9 9.3z",
  },
  {
    id: "heart",
    name: "Heart",
    c: "ui",
    k: "love favourite wishlist save like care charity",
    d: "M12 20.8 4.2 13a4.8 4.8 0 0 1 7.8-5.4 4.8 4.8 0 0 1 7.8 5.4z",
  },
  {
    id: "quote",
    name: "Quote",
    c: "ui",
    k: "testimonial review speech citation blockquote said",
    d: "M10 6.5C6.8 7.8 5.2 10.1 5.2 13.3v4.2H10v-5.9H7.9c0-1.9.7-3.2 2.1-3.9zM19.8 6.5c-3.2 1.3-4.8 3.6-4.8 6.8v4.2h4.8v-5.9h-2.1c0-1.9.7-3.2 2.1-3.9z",
  },
  { id: "play", name: "Play", c: "ui", k: "video watch start media button trailer", d: "M8 5.5 19 12 8 18.5z" },
  { id: "pause", name: "Pause", c: "ui", k: "stop hold media video", d: "M9 5v14M15 5v14" },
  {
    id: "external-link",
    name: "External link",
    c: "ui",
    k: "open new tab outbound visit website",
    d: "M14 4h6v6M20 4 11 13M18 14v4.5a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2H10",
  },
  { id: "download", name: "Download", c: "ui", k: "save export pdf get file menu brochure", d: "M12 3.5v12M7 11l5 5 5-5M4 20.5h16" },
  { id: "upload", name: "Upload", c: "ui", k: "import send file attach photo submit", d: "M12 16.5v-12M7 9l5-5 5 5M4 20.5h16" },
  {
    id: "share",
    name: "Share",
    c: "ui",
    k: "social send refer forward network spread",
    d: "m8.3 10.8 7.4-4M8.3 13.2l7.4 4",
    b: `<circle cx="18" cy="5.5" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="18.5" r="2.6"/>`,
  },
  {
    id: "settings",
    name: "Settings",
    c: "ui",
    k: "gear preferences options configure admin controls",
    d: "M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4 5.3 5.3",
    b: `<circle cx="12" cy="12" r="3.2"/>`,
  },
  {
    id: "trash",
    name: "Trash",
    c: "ui",
    k: "delete remove bin discard clear",
    d: "M4 6.5h16M9.5 6.5V4h5v2.5M6.5 6.5 7.6 20a1.5 1.5 0 0 0 1.5 1.4h5.8a1.5 1.5 0 0 0 1.5-1.4l1.1-13.5M10 10.5v6.5M14 10.5v6.5",
  },
  { id: "edit", name: "Edit", c: "ui", k: "pencil write update change compose modify", d: "M16.5 3.5 20.5 7.5 8 20H4v-4zM14 6 18 10" },
  {
    id: "eye",
    name: "Eye",
    c: "ui",
    k: "view preview visible watch look see",
    d: "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z",
    b: `<circle cx="12" cy="12" r="3.2"/>`,
  },
  {
    id: "lock",
    name: "Lock",
    c: "ui",
    k: "secure privacy password protected safe ssl private",
    d: "M7.8 10V7.5a4.2 4.2 0 0 1 8.4 0V10",
    b: `<rect x="4" y="10" width="16" height="11.2" rx="2.5"/>`,
  },
  {
    id: "shield",
    name: "Shield",
    c: "ui",
    k: "security guarantee warranty trust protection insured safe",
    d: "M12 21.5c5-2 8-5.7 8-10.2V5.5L12 2.5 4 5.5v5.8c0 4.5 3 8.2 8 10.2zM8.5 11.8l2.5 2.5 4.5-4.5",
  },
  {
    id: "info",
    name: "Info",
    c: "ui",
    k: "information about details help note",
    d: "M12 11v5.5",
    b: `<circle cx="12" cy="12" r="9"/>${dot(12, 7.8)}`,
  },
  {
    id: "alert",
    name: "Alert",
    c: "ui",
    k: "warning error attention notice important caution",
    d: "M12 7v6",
    b: `<circle cx="12" cy="12" r="9"/>${dot(12, 16.5)}`,
  },
  {
    id: "help",
    name: "Help",
    c: "ui",
    k: "question faq support ask enquiry unsure",
    d: "M9.4 9.4a2.7 2.7 0 1 1 3.4 3.3c-.5.2-.8.7-.8 1.3v.5",
    b: `<circle cx="12" cy="12" r="9"/>${dot(12, 17)}`,
  },
  {
    id: "bell",
    name: "Bell",
    c: "ui",
    k: "notification alert reminder subscribe updates news",
    d: "M18 9a6 6 0 1 0-12 0c0 5-2 6.5-2 6.5h16S18 14 18 9zM10 19a2.2 2.2 0 0 0 4 0",
  },
  { id: "bookmark", name: "Bookmark", c: "ui", k: "save read later pin collection favourite", d: "M6 3.5h12v18l-6-4.3-6 4.3z" },
  { id: "flag", name: "Flag", c: "ui", k: "milestone report goal country mark", d: "M5 21.2V4h13l-2.5 4.2L18 12.5H5" },
  {
    id: "link",
    name: "Link",
    c: "ui",
    k: "url chain anchor connect hyperlink copy",
    d: "M10 13.5a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.3 1.3M14 10.5a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.3-1.3",
  },
  { id: "refresh", name: "Refresh", c: "ui", k: "reload retry sync update again restart", d: "M20.5 12a8.5 8.5 0 1 1-2.6-6.1M20.5 4v5h-5" },
  {
    id: "target",
    name: "Target",
    c: "ui",
    k: "goal aim mission focus objective precision",
    b: `<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/>${dot(12, 12, 1.4)}`,
  },
  {
    id: "trophy",
    name: "Trophy",
    c: "ui",
    k: "award winner best prize achievement award-winning champion",
    d: "M8 3.5h8v6.5a4 4 0 0 1-8 0zM8 5.5H5.5v2A3.5 3.5 0 0 0 9 11M16 5.5h2.5v2A3.5 3.5 0 0 1 15 11M12 14v3.5M8.5 20.7h7l-1-3.2h-5z",
  },
  {
    id: "medal",
    name: "Medal",
    c: "ui",
    k: "award certified accredited quality badge recognition",
    d: "m8.5 13.6-1.5 7L12 18l4.5 2.6-1.5-7",
    b: `<circle cx="12" cy="9" r="5.5"/>`,
  },
  {
    id: "clipboard-check",
    name: "Clipboard check",
    c: "ui",
    k: "checklist task quote estimate survey form approved",
    d: "M9 2.5h6v3H9zm-.5 10.6 2.5 2.5 4.5-4.5",
    b: `<rect x="4.5" y="4" width="15" height="17.2" rx="2"/>`,
  },
  {
    id: "sparkles",
    name: "Sparkles",
    c: "ui",
    k: "ai magic new premium special shine highlight",
    d: "M10 3.2l1.7 4.4 4.4 1.7-4.4 1.7-1.7 4.4-1.7-4.4-4.4-1.7 4.4-1.7zM17.8 14.6l.9 2.3 2.3.9-2.3.9-.9 2.3-.9-2.3-2.3-.9 2.3-.9z",
  },
  { id: "zap", name: "Zap", c: "ui", k: "fast energy power speed instant electric quick", d: "M13.5 2.5 4.5 13.5h6l-.5 8 9.5-11h-6.5z" },
  { id: "grid", name: "Grid", c: "ui", k: "layout gallery tiles categories dashboard apps", b: `<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>` },
  {
    id: "list",
    name: "List",
    c: "ui",
    k: "bullets items menu features checklist lines",
    d: "M8 6.5h13M8 12h13M8 17.5h13",
    b: `${dot(3.8, 6.5, 1.2)}${dot(3.8, 12, 1.2)}${dot(3.8, 17.5, 1.2)}`,
  },
  {
    id: "layers",
    name: "Layers",
    c: "ui",
    k: "stack tiers plans packages options levels",
    d: "M12 2.5 2.5 7.5 12 12.5l9.5-5zM2.5 12.5 12 17.5l9.5-5M2.5 17 12 22l9.5-5",
  },
  {
    id: "rocket",
    name: "Rocket",
    c: "ui",
    k: "launch startup growth boost fast new begin",
    d: "M9.4 14.6 5 13.6l1.9-3.4A13.6 13.6 0 0 1 20.6 3.4a13.6 13.6 0 0 1-6.8 13.7l-3.4 1.9zM9.4 14.6 5.5 18.5M8 20.5c-1.5 1-3.5 1-4.5 0-1-1-1-3 0-4.5",
    b: `<circle cx="14.9" cy="9.1" r="2"/>`,
  },
];

// ---------------------------------------------------------------------------
// Vendored icons
//
// The gap this closes: `services`/`trades` had only 22 hand-authored icons,
// and the SYNONYMS map in ./index.ts resolved plumber, electrician, handyman
// and mechanic all down to the same single `wrench` icon; `contact` had only
// 10 icons shared by every generated site's contact section. Rather than
// hand-draw approximations, real path data was pulled from four permissively
// licensed, general-purpose (non-brand) icon projects, verified against each
// project's own LICENSE file fetched from its own GitHub repo (never an
// aggregator — see docs/research/asset-sources.md §4):
//
//   - Lucide      ISC, plus MIT for the subset derived from Feather (Cole
//                 Bemis) — lucide-icons/lucide, commit 33a44aa8b0b43d9b0ed14eb08860a1b5550a1573
//   - Tabler Icons MIT — tabler/tabler-icons, commit 5a0fe38e97784d94279ce4eb1bf85f9a91bf027e
//   - Phosphor Icons MIT — phosphor-icons/core, commit 2b75f3ad12b420c9504ef05df8d2564a28f8500e
//   - Heroicons   MIT — tailwindlabs/heroicons, commit 616b7a4dbbf3d011760af8066262cd5c6b3868f3
//
// All four ship stroke/outline geometry compatible with this module's
// fill="none" + dynamic stroke-width render model, so the vendored `d`/`b`
// data renders through the exact same iconSvg()/three-weights pipeline as
// the hand-authored set — no separate code path. Phosphor's upstream
// viewBox is 0-256 rather than 0-24; those four icons carry their geometry
// unscaled inside a `<g transform="scale(0.09375)">` with
// vector-effect="non-scaling-stroke" on every child so the stroke still
// tracks this module's dynamic weight instead of shrinking with the
// transform.
//
// Every entry's `prov` is a full lib/assets/provenance.ts `VendorProvenance`
// record (source repo, upstream id, licence, exact commit, retrieved-at,
// brand-mark flag). Licence text for each pack is saved verbatim under
// lib/assets/icon-licenses/<pack>/LICENSE. `isBrandMark` is false for every
// icon here — all four packs are general UI icon sets, not logo packs — and
// anything brand-shaped noticed while curating (Phosphor ships
// `whatsapp-logo`, `telegram-logo`) was excluded rather than vendored.
const LUCIDE_COMMIT = "33a44aa8b0b43d9b0ed14eb08860a1b5550a1573";
const TABLER_COMMIT = "5a0fe38e97784d94279ce4eb1bf85f9a91bf027e";
const PHOSPHOR_COMMIT = "2b75f3ad12b420c9504ef05df8d2564a28f8500e";
const HEROICONS_COMMIT = "616b7a4dbbf3d011760af8066262cd5c6b3868f3";
const VENDORED_AT = "2026-08-24";

const lucideProv = (upstreamId: string, featherDerived = false): VendorProvenance =>
  featherDerived
    ? vendorProvenance("lucide", upstreamId, "MIT", "Feather-derived; (c) 2013-present Cole Bemis", LUCIDE_COMMIT, VENDORED_AT)
    : vendorProvenance("lucide", upstreamId, "ISC", "(c) 2026 Lucide Icons and Contributors", LUCIDE_COMMIT, VENDORED_AT);

const tablerProv = (upstreamId: string): VendorProvenance =>
  vendorProvenance("tabler", upstreamId, "MIT", "(c) 2020-2026 Pawel Kuna", TABLER_COMMIT, VENDORED_AT);

const phosphorProv = (upstreamId: string): VendorProvenance =>
  vendorProvenance("phosphor", upstreamId, "MIT", "(c) 2023 Phosphor Icons", PHOSPHOR_COMMIT, VENDORED_AT);

const heroiconsProv = (upstreamId: string): VendorProvenance =>
  vendorProvenance("heroicons", upstreamId, "MIT", "(c) Tailwind Labs, Inc.", HEROICONS_COMMIT, VENDORED_AT);

const VENDORED_DEFS: IconDef[] = [
  // ------------------------------------------------------- services (trades)
  {
    id: "circuit-board",
    name: "Circuit board",
    c: "services",
    k: "electrician electrical panel circuit board wiring fuse breaker technician",
    d: "M11 9h4a2 2 0 0 0 2-2V3|M7 21v-4a2 2 0 0 1 2-2h4",
    b: `<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><circle cx="15" cy="15" r="2"/>`,
    prov: lucideProv("circuit-board"),
  },
  {
    id: "electric-plug",
    name: "Electric plug",
    c: "services",
    k: "electrician electrical plug power outlet socket wiring",
    d: "M9.785 6l8.215 8.215l-2.054 2.054a5.81 5.81 0 1 1 -8.215 -8.215l2.054 -2.054|M4 20l3.5 -3.5|M15 4l-3.5 3.5|M20 9l-3.5 3.5",
    prov: tablerProv("plug"),
  },
  {
    id: "pipe-wrench",
    name: "Pipe wrench",
    c: "services",
    k: "plumber plumbing pipe wrench drain repair fix",
    b: `<g transform="scale(0.09375)"><path d="M125.66,145.66a8,8,0,0,0,0-11.32L77,85a17,17,0,0,1,0-24h0a17,17,0,0,1,24,0l72.69,73.37a8,8,0,0,1,0,11.32L85,235a17,17,0,0,1-24,0h0a17,17,0,0,1,0-24Z" vector-effect="non-scaling-stroke"/><path d="M132.28,92.58,150.9,74.34a8,8,0,0,1,11.25-.06l37.45,35.38a8,8,0,0,0,11.31,0l3.72-3.72a32,32,0,0,0,0-45.25l-45-42.35a8,8,0,0,0-11.32,0L108.12,68.19" vector-effect="non-scaling-stroke"/><path d="M84,92.12,58.34,117.66a8,8,0,0,0,0,11.31L71,141.66a8,8,0,0,0,11.31,0L108,116.4" vector-effect="non-scaling-stroke"/></g>`,
    prov: phosphorProv("pipe-wrench"),
  },
  {
    id: "pipeline",
    name: "Pipeline",
    c: "services",
    k: "plumber plumbing pipe drain conduit installer",
    d: "M3 4h8|M4 4v5a6 6 0 0 0 6 6h3a1 1 0 0 1 1 1v4|M10 4v4a1 1 0 0 0 1 1h3a6 6 0 0 1 6 6v5|M13 20h8|M12 9v6",
    prov: tablerProv("pipeline"),
  },
  {
    id: "hard-hat",
    name: "Hard hat",
    c: "services",
    k: "contractor construction builder safety site foreman crew",
    d: "M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5|M14 6a6 6 0 0 1 6 6v3|M4 15v-3a6 6 0 0 1 6-6",
    b: `<rect x="2" y="15" width="20" height="4" rx="1"/>`,
    prov: lucideProv("hard-hat"),
  },
  {
    id: "toolbox",
    name: "Toolbox",
    c: "services",
    k: "handyman tools toolbox repair maintenance fix contractor",
    d: "M16 12v4|M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2|M17 6a2 2 0 011.414.586l3 3A2 2 0 0122 11v8a2 2 0 01-2 2H4a2 2 0 01-2-2v-8a2 2 0 01.586-1.414l3-3A2 2 0 017 6z|M2 14h20|M8 12v4",
    prov: lucideProv("toolbox"),
  },
  {
    id: "power-drill",
    name: "Power drill",
    c: "services",
    k: "carpenter handyman power tool drill construction diy",
    d: "M10 18a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H5a3 3 0 0 1-3-3 1 1 0 0 1 1-1z|M13 10H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1l-.81 3.242a1 1 0 0 1-.97.758H8|M14 4h3a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-3|M18 6h4|m5 10-2 8|m7 18 2-8",
    prov: lucideProv("drill"),
  },
  {
    id: "wrench-screwdriver",
    name: "Wrench and screwdriver",
    c: "services",
    k: "handyman tools repair maintenance fix multi-trade",
    d: "M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437 1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008Z",
    prov: heroiconsProv("wrench-screwdriver"),
  },
  {
    id: "paint-roller",
    name: "Paint roller",
    c: "services",
    k: "painter decorator paint roller renovation redecorate",
    d: "M10 16v-2a2 2 0 0 1 2-2h8a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2",
    b: `<rect x="2" y="2" width="16" height="6" rx="2"/><rect x="8" y="16" width="4" height="6" rx="1"/>`,
    prov: lucideProv("paint-roller"),
  },
  {
    id: "potted-plant",
    name: "Potted plant",
    c: "services",
    k: "landscaping gardener nursery garden plant potted greenery",
    d: "M7 15h10v4a2 2 0 0 1 -2 2h-6a2 2 0 0 1 -2 -2v-4|M12 9a6 6 0 0 0 -6 -6h-3v2a6 6 0 0 0 6 6h3|M12 11a6 6 0 0 1 6 -6h3v1a6 6 0 0 1 -6 6h-3|M12 15l0 -6",
    prov: tablerProv("plant"),
  },
  {
    id: "air-vent",
    name: "Air vent",
    c: "services",
    k: "hvac ventilation air conditioning duct climate installer",
    d: "M18 17.5a2.5 2.5 0 1 1-4 2.03V12|M6 12H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2|M6 8h12|M6.6 15.572A2 2 0 1 0 10 17v-5",
    prov: lucideProv("air-vent"),
  },
  {
    id: "fan",
    name: "Fan",
    c: "services",
    k: "hvac ventilation cooling air conditioning climate",
    d: "M10.827 16.379a6.082 6.082 0 0 1-8.618-7.002l5.412 1.45a6.082 6.082 0 0 1 7.002-8.618l-1.45 5.412a6.082 6.082 0 0 1 8.618 7.002l-5.412-1.45a6.082 6.082 0 0 1-7.002 8.618l1.45-5.412Z|M12 12v.01",
    prov: lucideProv("fan"),
  },
  {
    id: "solar-panel",
    name: "Solar panel",
    c: "services",
    k: "solar renewable energy installer panel electrician sustainable",
    b: `<g transform="scale(0.09375)"><line x1="40" y1="104" x2="56" y2="104" vector-effect="non-scaling-stroke"/><line x1="65.77" y1="41.77" x2="77.09" y2="53.09" vector-effect="non-scaling-stroke"/><line x1="128" y1="16" x2="128" y2="32" vector-effect="non-scaling-stroke"/><line x1="190.23" y1="41.77" x2="178.91" y2="53.09" vector-effect="non-scaling-stroke"/><line x1="216" y1="104" x2="200" y2="104" vector-effect="non-scaling-stroke"/><path d="M88,104a40,40,0,0,1,80,0" vector-effect="non-scaling-stroke"/><polygon points="24 216 64.7 144 191.3 144 232 216 24 216" vector-effect="non-scaling-stroke"/><line x1="46.61" y1="176" x2="209.39" y2="176" vector-effect="non-scaling-stroke"/><line x1="152.35" y1="144" x2="168" y2="216" vector-effect="non-scaling-stroke"/><line x1="88" y1="216" x2="103.65" y2="144" vector-effect="non-scaling-stroke"/></g>`,
    prov: phosphorProv("solar-panel"),
  },
  {
    id: "broom",
    name: "Broom",
    c: "services",
    k: "cleaning cleaner housekeeping sweep janitorial sweeper",
    d: "M13.5 10.5 22 2|M14.734 13.841a2 2 0 00-.314-2.42L12.58 9.58a2 2 0 00-2.421-.314l-7.657 4.461A1 1 0 002.3 15.3l6.403 6.403a1 1 0 001.571-.204z|m5 18 2-2|m7.699 10.7 5.602 5.601",
    prov: lucideProv("broom"),
  },
  {
    id: "laundry-wash",
    name: "Wash",
    c: "services",
    k: "cleaning laundry wash launderette housekeeping",
    d: "M3.486 8.965c.168 .02 .34 .033 .514 .035c.79 .009 1.539 -.178 2 -.5c.461 -.32 1.21 -.507 2 -.5c.79 -.007 1.539 .18 2 .5c.461 .322 1.21 .509 2 .5c.79 .009 1.539 -.178 2 -.5c.461 -.32 1.21 -.507 2 -.5c.79 -.007 1.539 .18 2 .5c.461 .322 1.21 .509 2 .5c.17 0 .339 -.014 .503 -.034|M3 6l1.721 10.329a2 2 0 0 0 1.973 1.671h10.612a2 2 0 0 0 1.973 -1.671l1.721 -10.329",
    prov: tablerProv("wash"),
  },
  {
    id: "cctv",
    name: "CCTV camera",
    c: "services",
    k: "security camera surveillance cctv monitoring alarm installer",
    d: "M16.75 12h3.632a1 1 0 0 1 .894 1.447l-2.034 4.069a1 1 0 0 1-1.708.134l-2.124-2.97|M17.106 9.053a1 1 0 0 1 .447 1.341l-3.106 6.211a1 1 0 0 1-1.342.447L3.61 12.3a2.92 2.92 0 0 1-1.3-3.91L3.69 5.6a2.92 2.92 0 0 1 3.92-1.3z|M2 19h3.76a2 2 0 0 0 1.8-1.1L9 15|M2 21v-4|M7 9h.01",
    prov: lucideProv("cctv"),
  },
  {
    id: "shield-lock",
    name: "Shield lock",
    c: "services",
    k: "security locksmith alarm protection safe access control",
    d: "M20 9.807V6a1 1 0 00-1-1c-2 0-4.49-1.19-6.24-2.72a1.17 1.17 0 00-1.52 0C9.5 3.8 7 5 5 5a1 1 0 00-1 1v7c0 3.88 2.107 6.254 5 7.796|M19 17v-2a2 2 0 00-4 0v2",
    b: `<rect x="13" y="17" width="8" height="5" rx="1"/>`,
    prov: lucideProv("shield-lock"),
  },
  {
    id: "server-rack",
    name: "Server",
    c: "services",
    k: "it tech support hosting server backend network administrator",
    b: `<rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/>`,
    prov: lucideProv("server", true),
  },
  {
    id: "router",
    name: "Router",
    c: "services",
    k: "it network wifi internet router installer technician",
    d: "M6.01 18H6|M10.01 18H10|M15 10v4|M17.84 7.17a4 4 0 0 0-5.66 0|M20.66 4.34a8 8 0 0 0-11.31 0",
    b: `<rect x="2" y="14" width="20" height="8" rx="2"/>`,
    prov: lucideProv("router"),
  },
  {
    id: "network",
    name: "Network",
    c: "services",
    k: "it network connectivity topology tech support administrator",
    d: "M6 9a6 6 0 1 0 12 0a6 6 0 0 0 -12 0|M12 3c1.333 .333 2 2.333 2 6s-.667 5.667 -2 6|M12 3c-1.333 .333 -2 2.333 -2 6s.667 5.667 2 6|M6 9h12|M3 20h7|M14 20h7|M10 20a2 2 0 1 0 4 0a2 2 0 0 0 -4 0|M12 15v3",
    prov: tablerProv("network"),
  },
  {
    id: "cpu-chip",
    name: "CPU chip",
    c: "services",
    k: "it tech support computer chip processor repair",
    d: "M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 0 0 2.25-2.25V6.75a2.25 2.25 0 0 0-2.25-2.25H6.75A2.25 2.25 0 0 0 4.5 6.75v10.5a2.25 2.25 0 0 0 2.25 2.25Zm.75-12h9v9h-9v-9Z",
    prov: heroiconsProv("cpu-chip"),
  },
  {
    id: "compass-tool",
    name: "Drafting compass",
    c: "services",
    k: "architect engineer design drafting compass tool blueprint",
    b: `<g transform="scale(0.09375)"><circle cx="128" cy="80" r="32" vector-effect="non-scaling-stroke"/><line x1="128" y1="48" x2="128" y2="24" vector-effect="non-scaling-stroke"/><line x1="141" y1="109.25" x2="192" y2="224" vector-effect="non-scaling-stroke"/><line x1="64" y1="224" x2="115" y2="109.25" vector-effect="non-scaling-stroke"/><path d="M208,120c-14.57,28.49-45.8,48-80,48a87.71,87.71,0,0,1-35.75-7.56" vector-effect="non-scaling-stroke"/></g>`,
    prov: phosphorProv("compass-tool"),
  },
  {
    id: "megaphone",
    name: "Megaphone",
    c: "services",
    k: "marketing advertising promotion agency announcement",
    d: "M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 1 1 0-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 0 1-1.44-4.282m3.102.069a18.03 18.03 0 0 1-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 0 1 8.835 2.535M10.34 6.66a23.847 23.847 0 0 0 8.835-2.535m0 0A23.74 23.74 0 0 0 18.795 3m.38 1.125a23.91 23.91 0 0 1 1.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 0 0 1.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 0 1 0 3.46",
    prov: heroiconsProv("megaphone"),
  },

  // ------------------------------------------------------------------ contact
  {
    id: "mailbox",
    name: "Mailbox",
    c: "contact",
    k: "contact mail mailbox post address postbox",
    d: "M22 17a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9.5C2 7 4 5 6.5 5H18c2.2 0 4 1.8 4 4v8Z|M6.5 5C9 5 11 7 11 9.5V17a2 2 0 0 1-2 2",
    b: `<polyline points="15,9 18,9 18,11"/><line x1="6" y1="10" x2="7" y2="10"/>`,
    prov: lucideProv("mailbox"),
  },
  {
    id: "qr-code",
    name: "QR code",
    c: "contact",
    k: "contact scan qr code link share digital business card",
    d: "M21 16h-3a2 2 0 0 0-2 2v3|M21 21v.01|M12 7v3a2 2 0 0 1-2 2H7|M3 12h.01|M12 3h.01|M12 16v.01|M16 12h1|M21 12v.01|M12 21v-1",
    b: `<rect x="3" y="3" width="5" height="5" rx="1"/><rect x="16" y="3" width="5" height="5" rx="1"/><rect x="3" y="16" width="5" height="5" rx="1"/>`,
    prov: lucideProv("qr-code"),
  },
  {
    id: "headset",
    name: "Headset",
    c: "contact",
    k: "contact support helpdesk customer service headset call centre",
    d: "M3 11h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Zm0 0a9 9 0 1 1 18 0m0 0v5a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3Z|M21 16v2a4 4 0 0 1-4 4h-5",
    prov: lucideProv("headset"),
  },
  {
    id: "address-book",
    name: "Address book",
    c: "contact",
    k: "contact address book directory contacts list",
    b: `<g transform="scale(0.09375)"><circle cx="136" cy="112" r="32" vector-effect="non-scaling-stroke"/><line x1="32" y1="72" x2="56" y2="72" vector-effect="non-scaling-stroke"/><line x1="32" y1="128" x2="56" y2="128" vector-effect="non-scaling-stroke"/><line x1="32" y1="184" x2="56" y2="184" vector-effect="non-scaling-stroke"/><path d="M88,168a60,60,0,0,1,96,0" vector-effect="non-scaling-stroke"/><rect x="40" y="48" width="192" height="160" rx="8" transform="translate(264 -8) rotate(90)" vector-effect="non-scaling-stroke"/></g>`,
    prov: phosphorProv("address-book"),
  },
  {
    id: "lifebuoy",
    name: "Lifebuoy",
    c: "contact",
    k: "support help contact assistance customer service",
    d: "M16.712 4.33a9.027 9.027 0 0 1 1.652 1.306c.51.51.944 1.064 1.306 1.652M16.712 4.33l-3.448 4.138m3.448-4.138a9.014 9.014 0 0 0-9.424 0M19.67 7.288l-4.138 3.448m4.138-3.448a9.014 9.014 0 0 1 0 9.424m-4.138-5.976a3.736 3.736 0 0 0-.88-1.388 3.737 3.737 0 0 0-1.388-.88m2.268 2.268a3.765 3.765 0 0 1 0 2.528m-2.268-4.796a3.765 3.765 0 0 0-2.528 0m4.796 4.796c-.181.506-.475.982-.88 1.388a3.736 3.736 0 0 1-1.388.88m2.268-2.268 4.138 3.448m0 0a9.027 9.027 0 0 1-1.306 1.652c-.51.51-1.064.944-1.652 1.306m0 0-3.448-4.138m3.448 4.138a9.014 9.014 0 0 1-9.424 0m5.976-4.138a3.765 3.765 0 0 1-2.528 0m0 0a3.736 3.736 0 0 1-1.388-.88 3.737 3.737 0 0 1-.88-1.388m2.268 2.268L7.288 19.67m0 0a9.024 9.024 0 0 1-1.652-1.306 9.027 9.027 0 0 1-1.306-1.652m0 0 4.138-3.448M4.33 16.712a9.014 9.014 0 0 1 0-9.424m4.138 5.976a3.765 3.765 0 0 1 0-2.528m0 0c.181-.506.475-.982.88-1.388a3.736 3.736 0 0 1 1.388-.88m-2.268 2.268L4.33 7.288m6.406 1.18L7.288 4.33m0 0a9.024 9.024 0 0 0-1.652 1.306A9.025 9.025 0 0 0 4.33 7.288",
    prov: heroiconsProv("lifebuoy"),
  },
];

function buildBody(def: IconDef): string {
  const paths = def.d ? def.d.split("|").map((d) => `<path d="${d}"/>`).join("") : "";
  return paths + (def.b ?? "");
}

function keywordsFor(def: IconDef): string[] {
  const fromId = def.id.split("-");
  const fromName = def.name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return Array.from(new Set([...fromId, ...fromName, ...def.k.split(" "), def.c]));
}

export const ICONS: Icon[] = [...DEFS, ...VENDORED_DEFS].map((def) => ({
  id: def.id,
  name: def.name,
  category: def.c,
  keywords: keywordsFor(def),
  body: buildBody(def),
  provenance: def.prov,
}));

const BY_ID = new Map(ICONS.map((icon) => [icon.id, icon]));

export function getIcon(id: string): Icon | undefined {
  return BY_ID.get(id);
}

export type IconRenderOptions = {
  /** Pixel size for width/height. Omit to emit a size-less svg sized by CSS. */
  size?: number | null;
  /** A named weight, or an explicit stroke width. Default "regular" (1.75). */
  weight?: IconWeight | number;
  /** Added to the root <svg>. */
  className?: string;
  /** Stroke colour. Defaults to currentColor so the icon inherits text colour. */
  color?: string;
  /**
   * Accessible name. When omitted the icon is emitted as aria-hidden, which is
   * the right default for an icon sitting next to a text label.
   */
  title?: string;
};

function strokeWidthOf(weight: IconRenderOptions["weight"]): number {
  if (typeof weight === "number") return weight;
  return ICON_WEIGHTS[weight ?? "regular"];
}

/**
 * A standalone `<svg>` string — paste into HTML, or into JSX after running it
 * through {@link iconJsx}.
 */
export function iconSvg(id: string, opts: IconRenderOptions = {}): string | null {
  const icon = BY_ID.get(id);
  if (!icon) return null;
  const { size = 24, className, color = "currentColor", title } = opts;
  const dims = size == null ? "" : ` width="${size}" height="${size}"`;
  const cls = className ? ` class="${className}"` : "";
  const label = title
    ? ` role="img" aria-label="${title.replace(/"/g, "&quot;")}"`
    : ` aria-hidden="true"`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${ICON_VIEWBOX}"${dims}` +
    ` fill="none" stroke="${color}" stroke-width="${strokeWidthOf(opts.weight)}"` +
    ` stroke-linecap="round" stroke-linejoin="round"${cls}${label}>${icon.body}</svg>`
  );
}

// The only kebab-case SVG attributes this module ever emits. Rewriting exactly
// these (rather than every hyphenated token) keeps path data untouched.
const JSX_ATTRS: [RegExp, string][] = [
  [/\bstroke-width=/g, "strokeWidth="],
  [/\bstroke-linecap=/g, "strokeLinecap="],
  [/\bstroke-linejoin=/g, "strokeLinejoin="],
  [/\bfill-rule=/g, "fillRule="],
  [/\bclip-rule=/g, "clipRule="],
  [/\bstop-color=/g, "stopColor="],
  [/\baria-hidden=/g, "aria-hidden="],
  [/\bclass=/g, "className="],
];

/** The same markup with JSX-safe attribute names — ready to drop into a .tsx file. */
export function toJsx(svg: string): string {
  return JSX_ATTRS.reduce((acc, [re, to]) => acc.replace(re, to), svg);
}

export function iconJsx(id: string, opts: IconRenderOptions = {}): string | null {
  const svg = iconSvg(id, opts);
  return svg === null ? null : toJsx(svg);
}

/**
 * `data:` URI form, for CSS `background-image` / `<img src>`. Allowed by the
 * sandbox CSP (`img-src 'self' data:`). Note that `currentColor` does NOT
 * resolve inside a data URI — pass an explicit `color`.
 */
export function iconDataUri(id: string, opts: IconRenderOptions = {}): string | null {
  const svg = iconSvg(id, { color: "#000000", ...opts });
  if (svg === null) return null;
  return `data:image/svg+xml,${encodeURIComponent(svg).replace(/'/g, "%27")}`;
}

/** All categories present, in declaration order, with their icon counts. */
export function iconCategories(): { category: IconCategory; count: number }[] {
  const counts = new Map<IconCategory, number>();
  for (const icon of ICONS) counts.set(icon.category, (counts.get(icon.category) ?? 0) + 1);
  return Array.from(counts, ([category, count]) => ({ category, count }));
}
