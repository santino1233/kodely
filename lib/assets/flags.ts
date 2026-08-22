/**
 * Country flags for generated sites.
 *
 * THE APPROACH — BOTH, WITH EMOJI AS THE UNIVERSAL FALLBACK
 * Hand-authoring 250 accurate flags is not something anyone should pretend to
 * do, so this module ships two layers and is explicit about the seam:
 *
 *  1. EMOJI (complete). Every ISO 3166-1 alpha-2 country resolves to a flag
 *     emoji, derived arithmetically from its two letters via Unicode regional
 *     indicators. Emoji are *text* — they need no asset, no network, and no
 *     CSP allowance, so they work in a generated site unconditionally. This is
 *     the honest "complete set". Caveat: Windows Chrome/Edge render regional
 *     indicator pairs as two grey letter boxes rather than a flag, so
 *     {@link flagEmoji} is right for language pickers and phone-code lists but
 *     not for a design that leans on the flag as an image.
 *
 *  2. SVG (a curated subset, currently ~55 countries). Hand-authored geometry
 *     for the most-requested flags. Each carries an `accuracy` field:
 *       - "exact"      — the flag is fully described by bands, crosses, discs,
 *                        or stars, and this drawing reproduces it.
 *       - "simplified" — a recognisable rendering that knowingly omits or
 *                        approximates detail (a coat of arms, a counterchange,
 *                        an emblem). `note` says exactly what is missing.
 *     Nothing here is presented as authoritative artwork. Flags with a
 *     detailed emblem at their centre (Mexico, Spain's arms, Saudi Arabia,
 *     Sri Lanka, Bhutan, ...) are deliberately absent from the SVG layer
 *     rather than shipped wrong — they resolve to emoji.
 *
 * ASPECT RATIO. Every SVG flag is drawn on a normalised 3:2 canvas except
 * Switzerland (1:1), the United Kingdom (2:1), the United States (19:10) and
 * the five Nordic crosses (their own official ratios), where the proportion is
 * part of the flag's identity. Colours and internal layout are to spec; the
 * canvas ratio is not, and for a handful of countries (Belgium 13:15, Denmark,
 * Nepal) that differs from the official proportion.
 *
 * PROVENANCE. All geometry here is generated from arithmetic in this file —
 * band rects, star/crescent/chakra generators — or hand-authored from
 * published public-domain specifications (flag construction sheets are not
 * copyrightable subject matter). No path data was copied from a flag library.
 */

export type FlagAccuracy = "exact" | "simplified";

export type Flag = {
  /** Lowercase ISO 3166-1 alpha-2, e.g. "fr". */
  code: string;
  name: string;
  emoji: string;
  /** Present only for the curated SVG subset. */
  svg?: {
    viewBox: string;
    body: string;
    accuracy: FlagAccuracy;
    note?: string;
  };
};

// ---------------------------------------------------------------------------
// Complete country list (ISO 3166-1 alpha-2, officially assigned) + EU.
// Stored as one delimited string: 250 object literals would cost several times
// this in source bytes for no benefit.
// ---------------------------------------------------------------------------

const COUNTRY_TABLE =
  "AD:Andorra|AE:United Arab Emirates|AF:Afghanistan|AG:Antigua and Barbuda|AI:Anguilla|" +
  "AL:Albania|AM:Armenia|AO:Angola|AQ:Antarctica|AR:Argentina|AS:American Samoa|AT:Austria|" +
  "AU:Australia|AW:Aruba|AX:Åland Islands|AZ:Azerbaijan|BA:Bosnia and Herzegovina|BB:Barbados|" +
  "BD:Bangladesh|BE:Belgium|BF:Burkina Faso|BG:Bulgaria|BH:Bahrain|BI:Burundi|BJ:Benin|" +
  "BL:Saint Barthélemy|BM:Bermuda|BN:Brunei|BO:Bolivia|BQ:Caribbean Netherlands|BR:Brazil|" +
  "BS:Bahamas|BT:Bhutan|BV:Bouvet Island|BW:Botswana|BY:Belarus|BZ:Belize|CA:Canada|" +
  "CC:Cocos (Keeling) Islands|CD:DR Congo|CF:Central African Republic|CG:Republic of the Congo|" +
  "CH:Switzerland|CI:Côte d'Ivoire|CK:Cook Islands|CL:Chile|CM:Cameroon|CN:China|CO:Colombia|" +
  "CR:Costa Rica|CU:Cuba|CV:Cape Verde|CW:Curaçao|CX:Christmas Island|CY:Cyprus|CZ:Czechia|" +
  "DE:Germany|DJ:Djibouti|DK:Denmark|DM:Dominica|DO:Dominican Republic|DZ:Algeria|EC:Ecuador|" +
  "EE:Estonia|EG:Egypt|EH:Western Sahara|ER:Eritrea|ES:Spain|ET:Ethiopia|EU:European Union|" +
  "FI:Finland|FJ:Fiji|FK:Falkland Islands|FM:Micronesia|FO:Faroe Islands|FR:France|GA:Gabon|" +
  "GB:United Kingdom|GD:Grenada|GE:Georgia|GF:French Guiana|GG:Guernsey|GH:Ghana|GI:Gibraltar|" +
  "GL:Greenland|GM:Gambia|GN:Guinea|GP:Guadeloupe|GQ:Equatorial Guinea|GR:Greece|" +
  "GS:South Georgia and the South Sandwich Islands|GT:Guatemala|GU:Guam|GW:Guinea-Bissau|" +
  "GY:Guyana|HK:Hong Kong|HM:Heard and McDonald Islands|HN:Honduras|HR:Croatia|HT:Haiti|" +
  "HU:Hungary|ID:Indonesia|IE:Ireland|IL:Israel|IM:Isle of Man|IN:India|" +
  "IO:British Indian Ocean Territory|IQ:Iraq|IR:Iran|IS:Iceland|IT:Italy|JE:Jersey|JM:Jamaica|" +
  "JO:Jordan|JP:Japan|KE:Kenya|KG:Kyrgyzstan|KH:Cambodia|KI:Kiribati|KM:Comoros|" +
  "KN:Saint Kitts and Nevis|KP:North Korea|KR:South Korea|KW:Kuwait|KY:Cayman Islands|" +
  "KZ:Kazakhstan|LA:Laos|LB:Lebanon|LC:Saint Lucia|LI:Liechtenstein|LK:Sri Lanka|LR:Liberia|" +
  "LS:Lesotho|LT:Lithuania|LU:Luxembourg|LV:Latvia|LY:Libya|MA:Morocco|MC:Monaco|MD:Moldova|" +
  "ME:Montenegro|MF:Saint Martin|MG:Madagascar|MH:Marshall Islands|MK:North Macedonia|ML:Mali|" +
  "MM:Myanmar|MN:Mongolia|MO:Macao|MP:Northern Mariana Islands|MQ:Martinique|MR:Mauritania|" +
  "MS:Montserrat|MT:Malta|MU:Mauritius|MV:Maldives|MW:Malawi|MX:Mexico|MY:Malaysia|" +
  "MZ:Mozambique|NA:Namibia|NC:New Caledonia|NE:Niger|NF:Norfolk Island|NG:Nigeria|" +
  "NI:Nicaragua|NL:Netherlands|NO:Norway|NP:Nepal|NR:Nauru|NU:Niue|NZ:New Zealand|OM:Oman|" +
  "PA:Panama|PE:Peru|PF:French Polynesia|PG:Papua New Guinea|PH:Philippines|PK:Pakistan|" +
  "PL:Poland|PM:Saint Pierre and Miquelon|PN:Pitcairn Islands|PR:Puerto Rico|PS:Palestine|" +
  "PT:Portugal|PW:Palau|PY:Paraguay|QA:Qatar|RE:Réunion|RO:Romania|RS:Serbia|RU:Russia|" +
  "RW:Rwanda|SA:Saudi Arabia|SB:Solomon Islands|SC:Seychelles|SD:Sudan|SE:Sweden|SG:Singapore|" +
  "SH:Saint Helena|SI:Slovenia|SJ:Svalbard and Jan Mayen|SK:Slovakia|SL:Sierra Leone|" +
  "SM:San Marino|SN:Senegal|SO:Somalia|SR:Suriname|SS:South Sudan|ST:São Tomé and Príncipe|" +
  "SV:El Salvador|SX:Sint Maarten|SY:Syria|SZ:Eswatini|TC:Turks and Caicos Islands|TD:Chad|" +
  "TF:French Southern Territories|TG:Togo|TH:Thailand|TJ:Tajikistan|TK:Tokelau|TL:Timor-Leste|" +
  "TM:Turkmenistan|TN:Tunisia|TO:Tonga|TR:Turkey|TT:Trinidad and Tobago|TV:Tuvalu|TW:Taiwan|" +
  "TZ:Tanzania|UA:Ukraine|UG:Uganda|UM:U.S. Outlying Islands|US:United States|UY:Uruguay|" +
  "UZ:Uzbekistan|VA:Vatican City|VC:Saint Vincent and the Grenadines|VE:Venezuela|" +
  "VG:British Virgin Islands|VI:U.S. Virgin Islands|VN:Vietnam|VU:Vanuatu|WF:Wallis and Futuna|" +
  "WS:Samoa|YE:Yemen|YT:Mayotte|ZA:South Africa|ZM:Zambia|ZW:Zimbabwe";

/**
 * The flag emoji for an ISO 3166-1 alpha-2 code, built from the two Unicode
 * regional indicator symbols (U+1F1E6 is "A"). Pure arithmetic — no lookup
 * table, and it works for any two-letter code including ones added later.
 * Returns "" for anything that is not two ASCII letters.
 */
export function flagEmoji(code: string): string {
  const cc = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return "";
  return String.fromCodePoint(cc.charCodeAt(0) + 0x1f1a5, cc.charCodeAt(1) + 0x1f1a5);
}

// ---------------------------------------------------------------------------
// Geometry helpers. Everything below emits plain SVG child elements against a
// 60x40 canvas unless a flag overrides its viewBox.
// ---------------------------------------------------------------------------

const W = 60;
const H = 40;

const rect = (x: number, y: number, w: number, h: number, fill: string) =>
  `<rect x="${r2(x)}" y="${r2(y)}" width="${r2(w)}" height="${r2(h)}" fill="${fill}"/>`;

/** Trim float noise so the emitted markup stays readable and small. */
function r2(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/** Equal horizontal bands, top to bottom. */
function hBands(colors: string[], w = W, h = H): string {
  const band = h / colors.length;
  return colors.map((c, i) => rect(0, i * band, w, band, c)).join("");
}

/** Equal vertical bands, hoist to fly. */
function vBands(colors: string[], w = W, h = H): string {
  const band = w / colors.length;
  return colors.map((c, i) => rect(i * band, 0, band, h, c)).join("");
}

/** Weighted horizontal bands: `[["#fff", 1], ["#f00", 2]]`. */
function hWeighted(bands: [string, number][], w = W, h = H): string {
  const total = bands.reduce((s, [, n]) => s + n, 0);
  let y = 0;
  return bands
    .map(([c, n]) => {
      const bh = (n / total) * h;
      const out = rect(0, y, w, bh, c);
      y += bh;
      return out;
    })
    .join("");
}

/** Weighted vertical bands. */
function vWeighted(bands: [string, number][], w = W, h = H): string {
  const total = bands.reduce((s, [, n]) => s + n, 0);
  let x = 0;
  return bands
    .map(([c, n]) => {
      const bw = (n / total) * w;
      const out = rect(x, 0, bw, h, c);
      x += bw;
      return out;
    })
    .join("");
}

/**
 * A Nordic cross. `w`/`h` are the flag's own units; `arm` is the cross-arm
 * thickness and `vx` the vertical arm's left edge, both in those units.
 */
function nordic(field: string, arm: string, w: number, h: number, thick: number, vx: number): string {
  return (
    rect(0, 0, w, h, field) +
    rect(vx, 0, thick, h, arm) +
    rect(0, (h - thick) / 2, w, thick, arm)
  );
}

/** An n-pointed star as a filled path. `rot` is degrees clockwise from "point up". */
function star(cx: number, cy: number, radius: number, fill: string, points = 5, rot = 0, innerRatio = 0.382): string {
  const pts: string[] = [];
  const step = Math.PI / points;
  const start = (rot - 90) * (Math.PI / 180);
  for (let i = 0; i < points * 2; i++) {
    const rr = i % 2 === 0 ? radius : radius * innerRatio;
    const a = start + i * step;
    pts.push(`${r2(cx + rr * Math.cos(a))} ${r2(cy + rr * Math.sin(a))}`);
  }
  return `<path d="M${pts.join("L")}z" fill="${fill}"/>`;
}

/** A pentagram drawn as a continuous interlaced outline (Morocco). */
function pentagram(cx: number, cy: number, radius: number, stroke: string, width: number): string {
  const pts: [number, number][] = [];
  for (let i = 0; i < 5; i++) {
    const a = (-90 + i * 72) * (Math.PI / 180);
    pts.push([cx + radius * Math.cos(a), cy + radius * Math.sin(a)]);
  }
  const order = [0, 2, 4, 1, 3];
  const d = order.map((i, n) => `${n === 0 ? "M" : "L"}${r2(pts[i][0])} ${r2(pts[i][1])}`).join("") + "z";
  return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${width}"/>`;
}

/**
 * A crescent as one closed path — the outer disc minus an offset inner disc,
 * expressed as two arcs so it needs no mask or clip-path (and therefore no
 * generated element id, which keeps the markup safe to paste twice on a page).
 * Both circle centres must share a y.
 */
function crescent(ox: number, oy: number, R: number, ix: number, r: number, fill: string): string {
  const d = ix - ox;
  const px = (d * d + R * R - r * r) / (2 * d);
  const py = Math.sqrt(Math.max(R * R - px * px, 0));
  const x = ox + px;
  return (
    `<path d="M${r2(x)} ${r2(oy - py)}A${R} ${R} 0 1 0 ${r2(x)} ${r2(oy + py)}` +
    `A${r} ${r} 0 1 1 ${r2(x)} ${r2(oy - py)}z" fill="${fill}"/>`
  );
}

/** The Ashoka Chakra: 24 spokes, a rim and a hub. */
function chakra(cx: number, cy: number, radius: number, color: string): string {
  const spokes: string[] = [];
  for (let i = 0; i < 24; i++) {
    const a = (i * 15) * (Math.PI / 180);
    spokes.push(
      `M${r2(cx + radius * 0.22 * Math.cos(a))} ${r2(cy + radius * 0.22 * Math.sin(a))}` +
        `L${r2(cx + radius * 0.92 * Math.cos(a))} ${r2(cy + radius * 0.92 * Math.sin(a))}`,
    );
  }
  return (
    `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="${color}" stroke-width="${r2(radius * 0.09)}"/>` +
    `<path d="${spokes.join("")}" stroke="${color}" stroke-width="${r2(radius * 0.07)}"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${r2(radius * 0.18)}" fill="${color}"/>`
  );
}

/** The 50-star union of the US flag, laid out on the official 9-row grid. */
function usStars(cw: number, ch: number, color: string): string {
  const out: string[] = [];
  for (let row = 1; row <= 9; row++) {
    const cols = row % 2 === 1 ? [1, 3, 5, 7, 9, 11] : [2, 4, 6, 8, 10];
    for (const col of cols) {
      out.push(star((col * cw) / 12, (row * ch) / 10, ch / 10 / 1.74, color));
    }
  }
  return out.join("");
}

/**
 * The simplified Union canton, reused by the UK, Australia and New Zealand.
 * The diagonal counterchange (the red saltire being offset to one side of the
 * white within each quadrant) is NOT reproduced — the red saltire here is
 * centred on the white. Everything else is to proportion.
 */
function unionJack(w: number, h: number): string {
  const s = h / 30;
  return (
    rect(0, 0, w, h, "#012169") +
    `<path d="M0 0L${r2(w)} ${r2(h)}M${r2(w)} 0L0 ${r2(h)}" stroke="#fff" stroke-width="${r2(6 * s)}"/>` +
    `<path d="M0 0L${r2(w)} ${r2(h)}M${r2(w)} 0L0 ${r2(h)}" stroke="#C8102E" stroke-width="${r2(2 * s)}"/>` +
    `<path d="M${r2(w / 2)} 0V${r2(h)}M0 ${r2(h / 2)}H${r2(w)}" stroke="#fff" stroke-width="${r2(10 * s)}"/>` +
    `<path d="M${r2(w / 2)} 0V${r2(h)}M0 ${r2(h / 2)}H${r2(w)}" stroke="#C8102E" stroke-width="${r2(6 * s)}"/>`
  );
}

// ---------------------------------------------------------------------------
// The curated SVG subset.
// ---------------------------------------------------------------------------

type SvgDef = { viewBox?: string; body: string; accuracy: FlagAccuracy; note?: string };

const BOX = `0 0 ${W} ${H}`;

const SVG_FLAGS: Record<string, SvgDef> = {
  // --- plain band flags: exact by construction -----------------------------
  fr: { body: vBands(["#002395", "#ffffff", "#ED2939"]), accuracy: "exact" },
  it: { body: vBands(["#008C45", "#F4F5F0", "#CD212A"]), accuracy: "exact" },
  ie: { body: vBands(["#169B62", "#ffffff", "#FF883E"]), accuracy: "exact" },
  be: { body: vBands(["#000000", "#FDDA24", "#EF3340"]), accuracy: "exact" },
  ro: { body: vBands(["#002B7F", "#FCD116", "#CE1126"]), accuracy: "exact" },
  ng: { body: vBands(["#008751", "#ffffff", "#008751"]), accuracy: "exact" },
  pe: { body: vBands(["#D91023", "#ffffff", "#D91023"]), accuracy: "exact", note: "Civil flag — the state flag adds the coat of arms." },
  de: { body: hBands(["#000000", "#DD0000", "#FFCE00"]), accuracy: "exact" },
  nl: { body: hBands(["#AE1C28", "#ffffff", "#21468B"]), accuracy: "exact" },
  ru: { body: hBands(["#ffffff", "#0039A6", "#D52B1E"]), accuracy: "exact" },
  at: { body: hBands(["#ED2939", "#ffffff", "#ED2939"]), accuracy: "exact" },
  hu: { body: hBands(["#CE2939", "#ffffff", "#477050"]), accuracy: "exact" },
  bg: { body: hBands(["#ffffff", "#00966E", "#D62612"]), accuracy: "exact" },
  ee: { body: hBands(["#0072CE", "#000000", "#ffffff"]), accuracy: "exact" },
  lt: { body: hBands(["#FDB913", "#006A44", "#C1272D"]), accuracy: "exact" },
  lu: { body: hBands(["#ED2939", "#ffffff", "#00A1DE"]), accuracy: "exact" },
  pl: { body: hBands(["#ffffff", "#DC143C"]), accuracy: "exact" },
  id: { body: hBands(["#CE1126", "#ffffff"]), accuracy: "exact" },
  ua: { body: hBands(["#0057B7", "#FFD700"]), accuracy: "exact" },
  lv: { body: hWeighted([["#9E3039", 2], ["#ffffff", 1], ["#9E3039", 2]]), accuracy: "exact" },
  co: { body: hWeighted([["#FCD116", 2], ["#003893", 1], ["#CE1126", 1]]), accuracy: "exact" },
  th: {
    body: hWeighted([["#A51931", 1], ["#F4F5F8", 1], ["#2D2A4A", 2], ["#F4F5F8", 1], ["#A51931", 1]]),
    accuracy: "exact",
  },
  ae: {
    body: hBands(["#00732F", "#ffffff", "#000000"]) + rect(0, 0, W / 4, H, "#FF0000"),
    accuracy: "exact",
  },
  cz: {
    body: hBands(["#ffffff", "#D7141A"]) + `<path d="M0 0L${W / 2} ${H / 2}L0 ${H}z" fill="#11457E"/>`,
    accuracy: "exact",
  },

  // --- Nordic crosses: drawn at their official ratios ----------------------
  dk: { viewBox: "0 0 37 28", body: nordic("#C8102E", "#ffffff", 37, 28, 4, 12), accuracy: "exact" },
  se: { viewBox: "0 0 16 10", body: nordic("#006AA7", "#FECC00", 16, 10, 2, 5), accuracy: "exact" },
  fi: { viewBox: "0 0 18 11", body: nordic("#ffffff", "#003580", 18, 11, 3, 5), accuracy: "exact" },
  no: {
    viewBox: "0 0 22 16",
    body: nordic("#BA0C2F", "#ffffff", 22, 16, 4, 6) + rect(7, 0, 2, 16, "#00205B") + rect(0, 7, 22, 2, "#00205B"),
    accuracy: "exact",
  },
  is: {
    viewBox: "0 0 25 18",
    body: nordic("#02529C", "#ffffff", 25, 18, 4, 7) + rect(8, 0, 2, 18, "#DC1E35") + rect(0, 8, 25, 2, "#DC1E35"),
    accuracy: "exact",
  },

  // --- crosses, discs, stars ----------------------------------------------
  ch: {
    viewBox: "0 0 32 32",
    body: rect(0, 0, 32, 32, "#FF0000") + rect(13, 6, 6, 20, "#ffffff") + rect(6, 13, 20, 6, "#ffffff"),
    accuracy: "exact",
  },
  gr: {
    body:
      hBands(Array.from({ length: 9 }, (_, i) => (i % 2 === 0 ? "#0D5EAF" : "#ffffff"))) +
      rect(0, 0, (5 * H) / 9, (5 * H) / 9, "#0D5EAF") +
      rect((2 * H) / 9, 0, H / 9, (5 * H) / 9, "#ffffff") +
      rect(0, (2 * H) / 9, (5 * H) / 9, H / 9, "#ffffff"),
    accuracy: "exact",
  },
  jp: {
    body: rect(0, 0, W, H, "#ffffff") + `<circle cx="30" cy="20" r="12" fill="#BC002D"/>`,
    accuracy: "exact",
  },
  bd: {
    body: rect(0, 0, W, H, "#006A4E") + `<circle cx="27" cy="20" r="8" fill="#F42A41"/>`,
    accuracy: "exact",
  },
  vn: { body: rect(0, 0, W, H, "#DA251D") + star(30, 20, 11, "#FFFF00"), accuracy: "exact" },
  ma: { body: rect(0, 0, W, H, "#C1272D") + pentagram(30, 20, 10, "#006233", 1.6), accuracy: "exact" },
  gh: {
    body: hBands(["#CE1126", "#FCD116", "#006B3F"]) + star(30, 20, 6, "#000000"),
    accuracy: "exact",
  },
  cl: {
    body:
      hBands(["#ffffff", "#D52B1E"]) +
      rect(0, 0, 20, 20, "#0039A6") +
      star(10, 10, 6, "#ffffff"),
    accuracy: "exact",
  },
  jm: {
    body:
      `<path d="M0 0L30 20L0 40z" fill="#009B3A"/><path d="M60 0L30 20L60 40z" fill="#009B3A"/>` +
      `<path d="M0 0L30 20L60 0z" fill="#000000"/><path d="M0 40L30 20L60 40z" fill="#000000"/>` +
      `<path d="M0 0L60 40M60 0L0 40" stroke="#FED100" stroke-width="6.5"/>`,
    accuracy: "exact",
  },
  il: {
    body:
      rect(0, 0, W, H, "#ffffff") +
      rect(0, 5, W, 5, "#0038B8") +
      rect(0, 30, W, 5, "#0038B8") +
      `<path d="M30 12L37 24H23zM30 28L23 16H37z" fill="none" stroke="#0038B8" stroke-width="1.6"/>`,
    accuracy: "exact",
  },
  in: {
    body: hBands(["#FF9933", "#ffffff", "#138808"]) + chakra(30, 20, 5.6, "#000080"),
    accuracy: "exact",
  },
  us: {
    viewBox: "0 0 57 30",
    body:
      hBands(Array.from({ length: 13 }, (_, i) => (i % 2 === 0 ? "#B31942" : "#ffffff")), 57, 30) +
      rect(0, 0, 22.8, (7 * 30) / 13, "#0A3161") +
      usStars(22.8, (7 * 30) / 13, "#ffffff"),
    accuracy: "exact",
  },
  tr: {
    body: rect(0, 0, W, H, "#E30A17") + crescent(22, 20, 8, 25, 6.4, "#ffffff") + star(34.5, 20, 3.7, "#ffffff", 5, 0),
    accuracy: "exact",
  },
  pk: {
    body:
      rect(0, 0, W, H, "#01411C") +
      rect(0, 0, 15, H, "#ffffff") +
      crescent(36, 21, 9, 39.5, 7.5, "#ffffff") +
      star(45, 14, 3.4, "#ffffff", 5, 45),
    accuracy: "exact",
  },
  sg: {
    body:
      hBands(["#EF3340", "#ffffff"]) +
      crescent(13, 10, 6.5, 15.6, 5.2, "#ffffff") +
      [
        [22, 6.2],
        [26.4, 9.4],
        [24.7, 14.6],
        [19.3, 14.6],
        [17.6, 9.4],
      ]
        .map(([x, y]) => star(x, y, 2.1, "#ffffff"))
        .join(""),
    accuracy: "exact",
  },
  za: {
    body:
      rect(0, 0, W, H, "#E03C31") +
      rect(0, 20, W, 20, "#001489") +
      `<path d="M0 0L25 20L60 20M0 40L25 20" fill="none" stroke="#ffffff" stroke-width="13.4"/>` +
      `<path d="M0 0L25 20L60 20M0 40L25 20" fill="none" stroke="#007A4D" stroke-width="8"/>` +
      `<path d="M0 4.5L18 20L0 35.5z" fill="#FFB81C"/><path d="M0 9.5L12 20L0 30.5z" fill="#000000"/>`,
    accuracy: "simplified",
    note: "Proportions of the Y and the hoist triangle are approximated.",
  },

  // --- knowingly simplified -----------------------------------------------
  gb: {
    viewBox: "0 0 60 30",
    body: unionJack(60, 30),
    accuracy: "simplified",
    note: "The red saltire is centred on the white; the official diagonal counterchange is not reproduced.",
  },
  au: {
    viewBox: "0 0 60 30",
    body:
      `<rect x="0" y="0" width="60" height="30" fill="#00247D"/>` +
      `<svg x="0" y="0" width="30" height="15" viewBox="0 0 30 15">${unionJack(30, 15)}</svg>` +
      star(15, 22.5, 4, "#ffffff", 7) +
      star(47, 6, 2.6, "#ffffff") +
      star(52, 13, 2.2, "#ffffff") +
      star(47, 21, 2.6, "#ffffff") +
      star(42, 15, 2.2, "#ffffff") +
      star(45.5, 12.5, 1.3, "#ffffff"),
    accuracy: "simplified",
    note: "Union canton is the simplified Union Jack; Southern Cross positions are approximate.",
  },
  nz: {
    viewBox: "0 0 60 30",
    body:
      `<rect x="0" y="0" width="60" height="30" fill="#00247D"/>` +
      `<svg x="0" y="0" width="30" height="15" viewBox="0 0 30 15">${unionJack(30, 15)}</svg>` +
      [
        [48, 7],
        [52.5, 15.5],
        [44, 19],
        [42.5, 11],
      ]
        .map(([x, y]) => star(x, y, 2.8, "#ffffff") + star(x, y, 1.9, "#CC142B"))
        .join(""),
    accuracy: "simplified",
    note: "Union canton is the simplified Union Jack; Southern Cross positions are approximate.",
  },
  ca: {
    body:
      vWeighted([["#D80621", 1], ["#ffffff", 2], ["#D80621", 1]]) +
      `<path d="M30 6.5L31.3 11.2L35.6 10.4L34.6 14L39.6 18.2L38.4 19.6L41 22.4L35.2 21.2L34.6 22.8L36 29.6L31.6 28.4L31.6 34.5L28.4 34.5L28.4 28.4L24 29.6L25.4 22.8L24.8 21.2L19 22.4L21.6 19.6L20.4 18.2L25.4 14L24.4 10.4L28.7 11.2z" fill="#D80621"/>`,
    accuracy: "simplified",
    note: "The maple leaf is a hand-authored 11-point approximation, not the official outline.",
  },
  es: {
    body: hWeighted([["#AA151B", 1], ["#F1BF00", 2], ["#AA151B", 1]]),
    accuracy: "simplified",
    note: "Coat of arms omitted — this is the plain civil ensign layout.",
  },
  pt: {
    body:
      vWeighted([["#006600", 2], ["#FF0000", 3]]) +
      `<circle cx="24" cy="20" r="8" fill="none" stroke="#FFD700" stroke-width="1.4"/>`,
    accuracy: "simplified",
    note: "Armillary sphere and shield reduced to a plain gold ring.",
  },
  ar: {
    body:
      hBands(["#74ACDF", "#ffffff", "#74ACDF"]) +
      star(30, 20, 5.2, "#F6B40E", 16, 0, 0.62) +
      `<circle cx="30" cy="20" r="3.1" fill="#F6B40E" stroke="#85340A" stroke-width="0.5"/>`,
    accuracy: "simplified",
    note: "Sun of May is drawn as rays plus a disc; the face is omitted.",
  },
  br: {
    body:
      rect(0, 0, W, H, "#009B3A") +
      `<path d="M30 4L56 20L30 36L4 20z" fill="#FEDF00"/>` +
      `<circle cx="30" cy="20" r="9" fill="#002776"/>` +
      `<path d="M21.6 16.6A16 16 0 0 1 38.6 17.6" fill="none" stroke="#ffffff" stroke-width="2.4"/>`,
    accuracy: "simplified",
    note: "The 27 stars and the ORDEM E PROGRESSO lettering are omitted.",
  },
  cn: {
    body:
      rect(0, 0, W, H, "#EE1C25") +
      star(10, 10, 6, "#FFFF00") +
      star(20, 4, 2, "#FFFF00") +
      star(24, 8, 2, "#FFFF00") +
      star(24, 13, 2, "#FFFF00") +
      star(20, 17, 2, "#FFFF00"),
    accuracy: "simplified",
    note: "The four small stars are not rotated to point at the large star.",
  },
  kr: {
    body:
      rect(0, 0, W, H, "#ffffff") +
      `<g transform="rotate(-33.69 30 20)">` +
      `<path d="M22 20A8 8 0 0 1 38 20A4 4 0 0 0 30 20A4 4 0 0 1 22 20z" fill="#CD2E3A"/>` +
      `<path d="M22 20A8 8 0 0 0 38 20A4 4 0 0 1 30 20A4 4 0 0 0 22 20z" fill="#0047A0"/>` +
      `</g>` +
      [
        [11, 8, -56.3],
        [11, 32, 56.3],
        [49, 8, 56.3],
        [49, 32, -56.3],
      ]
        .map(
          ([x, y, a]) =>
            `<g transform="rotate(${a} ${x} ${y})">` +
            [-3, 0, 3]
              .map((dy) => `<rect x="${x - 5}" y="${y + dy - 0.9}" width="10" height="1.8" fill="#000"/>`)
              .join("") +
            `</g>`,
        )
        .join(""),
    accuracy: "simplified",
    note: "All four trigrams are drawn solid; the broken bars of ☵ ☲ ☰ ☷ are not differentiated.",
  },
};

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

export const FLAGS: Flag[] = COUNTRY_TABLE.split("|").map((entry) => {
  const idx = entry.indexOf(":");
  const code = entry.slice(0, idx);
  const name = entry.slice(idx + 1);
  const svg = SVG_FLAGS[code.toLowerCase()];
  return {
    code: code.toLowerCase(),
    name,
    emoji: flagEmoji(code),
    ...(svg ? { svg: { viewBox: svg.viewBox ?? BOX, body: svg.body, accuracy: svg.accuracy, note: svg.note } } : {}),
  };
});

const FLAGS_BY_CODE = new Map(FLAGS.map((f) => [f.code, f]));

export function getFlag(code: string): Flag | undefined {
  return FLAGS_BY_CODE.get(code.trim().toLowerCase());
}

/** Only the countries with hand-authored SVG geometry. */
export function flagsWithSvg(): Flag[] {
  return FLAGS.filter((f) => f.svg);
}

export type FlagRenderOptions = {
  /** Rendered width in px. Height follows the flag's own aspect ratio. */
  width?: number;
  className?: string;
  /** Adds a hairline border, which stops white-edged flags vanishing on white. */
  border?: boolean;
  title?: string;
};

/**
 * A standalone `<svg>` for a flag, or `null` when that country is emoji-only.
 * Callers that need a guaranteed result should fall back to {@link flagEmoji}.
 */
export function flagSvg(code: string, opts: FlagRenderOptions = {}): string | null {
  const flag = getFlag(code);
  if (!flag?.svg) return null;
  const [, , vw, vh] = flag.svg.viewBox.split(" ").map(Number);
  const { width = 60, className, border = true, title = flag.name } = opts;
  const height = Math.round((width * vh) / vw * 100) / 100;
  const cls = className ? ` class="${className}"` : "";
  const frame = border
    ? `<rect x="0" y="0" width="${vw}" height="${vh}" fill="none" stroke="rgba(0,0,0,.15)" stroke-width="${
        Math.round((vh / 60) * 100) / 100
      }"/>`
    : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${flag.svg.viewBox}" width="${width}" height="${height}"` +
    ` role="img" aria-label="${flag.name.replace(/"/g, "&quot;")}"${cls}>` +
    `<title>${title.replace(/</g, "&lt;")}</title>${flag.svg.body}${frame}</svg>`
  );
}

/** `data:` URI form — usable in CSS `background-image` under the sandbox CSP. */
export function flagDataUri(code: string, opts: FlagRenderOptions = {}): string | null {
  const svg = flagSvg(code, opts);
  return svg === null ? null : `data:image/svg+xml,${encodeURIComponent(svg).replace(/'/g, "%27")}`;
}
