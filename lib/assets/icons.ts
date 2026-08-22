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
 * Every path in this file is hand-authored geometry: primitives (lines,
 * circles, rounded rectangles, single arcs) laid out on a 24x24 grid, with
 * corner rounding delegated to stroke-linejoin="round" rather than drawn.
 * No path data was copied from any icon library, free or licensed. The brand
 * marks under the "social" category are deliberately simplified, generic
 * renderings drawn from the same primitives — they are not the trademark
 * artwork, and a site using them commercially should check the platform's own
 * brand guidelines.
 *
 * STYLE
 * One geometry, three weights. Icons are outline/stroke drawings on a 24x24
 * viewBox; weight is a render-time stroke-width, not a second copy of the
 * data, which is how we get three styles for zero extra bytes.
 */

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
};

export type Icon = {
  id: string;
  name: string;
  category: IconCategory;
  keywords: string[];
  /** Inner markup of the <svg>. viewBox is always "0 0 24 24". */
  body: string;
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

function buildBody(def: IconDef): string {
  const paths = def.d ? def.d.split("|").map((d) => `<path d="${d}"/>`).join("") : "";
  return paths + (def.b ?? "");
}

function keywordsFor(def: IconDef): string[] {
  const fromId = def.id.split("-");
  const fromName = def.name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return Array.from(new Set([...fromId, ...fromName, ...def.k.split(" "), def.c]));
}

export const ICONS: Icon[] = DEFS.map((def) => ({
  id: def.id,
  name: def.name,
  category: def.c,
  keywords: keywordsFor(def),
  body: buildBody(def),
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
