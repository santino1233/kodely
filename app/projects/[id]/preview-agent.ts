// Click-to-select for the live preview.
//
// ---------------------------------------------------------------------------
// WHY THIS FILE EXISTS, AND WHY IT LOOKS LIKE THIS
//
// The preview iframe is sandboxed `allow-scripts allow-forms` WITHOUT
// `allow-same-origin` (PreviewFrame.tsx). That is deliberate and stays.
// Everything below was verified in real headless Chrome against a server that
// reproduced the preview's exact sandbox + CSP, not assumed:
//
//   * `iframe.contentDocument` is null and `contentWindow.location` throws
//     SecurityError. The parent CANNOT read or touch the preview DOM. Any
//     design that walks the iframe's DOM from the parent is dead.
//   * `contentWindow.postMessage(msg, "*")` DOES reach the frame. Targeting an
//     exact origin instead is silently dropped (the frame's origin is opaque),
//     and `targetOrigin: "null"` throws SyntaxError. So: always "*".
//   * The frame can `parent.postMessage(...)` back. On arrival `event.origin`
//     is the *string* "null", which is worthless for authentication —
//     `event.source === iframe.contentWindow` is the only real check.
//   * Every SUBRESOURCE request made from inside the frame is treated as
//     cross-site: `sec-fetch-site: cross-site`, and the session cookie is NOT
//     sent. A cookie-authenticated `/api/preview/...` asset therefore 401s.
//     There is no header-only fix for that.
//
// That last point is why this file assembles a SELF-CONTAINED document. The
// parent fetches index.html and its assets (same-origin, cookies work fine
// there), inlines them, and hands the whole thing to the iframe via `srcdoc`.
// Zero subresources means zero cross-site requests, and it gives us the one
// thing click-to-select actually needs: a place to inject the agent below.
//
// The sandbox attribute is untouched. The security policy is re-asserted
// in-band by <meta http-equiv> — see PREVIEW_META_CSP.
// ---------------------------------------------------------------------------

/** Namespaces every message in both directions. Bump if the shape changes. */
export const PREVIEW_NS = "kodely-preview:v1";

/** Where a selected element sits in the page's top-level landmark run. */
export type SelectionSection = {
  index: number;
  total: number;
  tag: string;
  id: string | null;
  heading: string | null;
};

/** What the agent reports about a clicked element. All fields are UNTRUSTED. */
export type SelectedElement = {
  tag: string;
  id: string | null;
  classes: string | null;
  /** Own text if the element has any, otherwise its subtree's text. */
  text: string | null;
  /** False when `text` came from descendants rather than the element itself. */
  textIsOwn: boolean;
  path: string;
  section: SelectionSection | null;
  role: string | null;
  alt: string | null;
  href: string | null;
  imgSrc: string | null;
  childCount: number;
  rect: { x: number; y: number; w: number; h: number };
  label: string;
};

export type AgentMessage =
  | { ns: string; type: "ready" }
  | { ns: string; type: "mode"; on: boolean }
  | { ns: string; type: "cleared" }
  | { ns: string; type: "selected"; el: SelectedElement };

export type SelectionMove = "up" | "down" | "prev" | "next";

// ---------------------------------------------------------------------------
// Content Security Policy for the assembled document.
//
// The served preview route sends its policy as a RESPONSE HEADER. A `srcdoc`
// document has no response, so the policy has to travel in-band. It is placed
// as the first child of <head>, before any inlined style or script, because a
// meta policy only governs what is parsed after it.
//
// This is STRICTER than the header policy it stands in for, not weaker: the
// document is fully self-contained, so nothing needs to be fetched and
// `default-src 'none'` costs nothing. `connect-src 'none'`, `form-action`,
// `base-uri` and `object-src` are all carried over. Verified in Chrome: an
// external <script src> is blocked and never requested, and fetch() rejects.
//
// `frame-ancestors` is deliberately absent — it is ignored in a meta policy,
// and the frame's parent is our own editor page anyway.
// ---------------------------------------------------------------------------
export const PREVIEW_META_CSP = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  "script-src 'unsafe-inline'",
  "img-src data:",
  "font-src data:",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "object-src 'none'",
].join("; ");

// ---------------------------------------------------------------------------
// The agent, as source text. It runs INSIDE the preview, alongside generated
// code, so it keeps to boring ES5-shaped JS and namespaces its own DOM with
// `data-kodely-ui` so it can never select itself.
//
// It must not contain the character sequence that would close a script tag;
// inlineScript() below escapes that anyway, but keeping it out is cheaper than
// relying on the escape.
// ---------------------------------------------------------------------------
const AGENT_SOURCE = `
(function () {
  var NS = ${JSON.stringify(PREVIEW_NS)};
  var mode = false;
  var current = null;
  var box = null;
  var label = null;
  var sink = null;

  function send(msg) {
    msg.ns = NS;
    try { parent.postMessage(msg, "*"); } catch (err) {}
  }

  function clean(s) { return (s || "").replace(/\\s+/g, " ").trim(); }

  function isOurs(el) {
    return !!(el && el.closest && el.closest("[data-kodely-ui]"));
  }

  function ensureOverlay() {
    if (box || !document.body) return;
    box = document.createElement("div");
    box.setAttribute("data-kodely-ui", "1");
    box.style.cssText = "position:fixed;z-index:2147483647;pointer-events:none;" +
      "border:2px solid #1d4ed8;background:rgba(29,78,216,0.08);border-radius:2px;display:none";
    label = document.createElement("div");
    label.setAttribute("data-kodely-ui", "1");
    label.style.cssText = "position:fixed;z-index:2147483647;pointer-events:none;" +
      "font:11px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;background:#1d4ed8;color:#fff;" +
      "padding:0 5px;border-radius:3px;display:none;max-width:60vw;overflow:hidden;" +
      "text-overflow:ellipsis;white-space:nowrap";
    // Picking an element cancels the click, which means focus never moves into
    // this document — so Escape and the arrow keys below would never reach it.
    // This is somewhere for focus to land that is ours, not the generated
    // page's: no tabindex is added to any generated element.
    sink = document.createElement("div");
    sink.setAttribute("data-kodely-ui", "1");
    sink.setAttribute("tabindex", "-1");
    sink.setAttribute("aria-hidden", "true");
    sink.style.cssText = "position:fixed;width:1px;height:1px;top:0;left:0;outline:none;opacity:0";
    document.body.appendChild(box);
    document.body.appendChild(label);
    document.body.appendChild(sink);
  }

  function paint(el, dashed) {
    ensureOverlay();
    if (!box) return;
    if (!el) { box.style.display = "none"; label.style.display = "none"; return; }
    var r = el.getBoundingClientRect();
    box.style.display = "block";
    box.style.left = r.left + "px";
    box.style.top = r.top + "px";
    box.style.width = r.width + "px";
    box.style.height = r.height + "px";
    box.style.borderStyle = dashed ? "dashed" : "solid";
    label.textContent = shortLabel(el);
    label.style.display = "block";
    label.style.left = Math.max(0, r.left) + "px";
    label.style.top = (r.top >= 18 ? r.top - 18 : r.top + 2) + "px";
  }

  function shortLabel(el) {
    var t = ownText(el) || subtreeText(el);
    if (t.length > 32) t = t.slice(0, 32) + "\\u2026";
    return "<" + el.tagName.toLowerCase() + ">" + (t ? " " + t : "");
  }

  function nthOfType(el) {
    var i = 1;
    var sib = el;
    while ((sib = sib.previousElementSibling)) { if (sib.tagName === el.tagName) i++; }
    return i;
  }

  // Short on purpose. This is a HINT for a model reading the source, not a
  // selector anything resolves — the preview is compiled output, so there is
  // no path back to the JSX except through structure and text.
  function cssPath(el) {
    var parts = [];
    var n = el;
    var depth = 0;
    while (n && n.nodeType === 1 && n !== document.documentElement && n !== document.body && depth < 5) {
      var seg = n.tagName.toLowerCase();
      if (n.id) { parts.unshift(seg + "#" + n.id); break; }
      var kids = n.parentElement ? n.parentElement.children : [];
      var same = 0;
      for (var i = 0; i < kids.length; i++) { if (kids[i].tagName === n.tagName) same++; }
      if (same > 1) seg += ":nth-of-type(" + nthOfType(n) + ")";
      parts.unshift(seg);
      n = n.parentElement;
      depth++;
    }
    return parts.join(" > ");
  }

  function landmarks() {
    var out = [];
    var all = document.querySelectorAll("section, header, footer, nav, article, aside, main > div");
    for (var i = 0; i < all.length; i++) {
      if (isOurs(all[i])) continue;
      var nested = false;
      for (var j = 0; j < out.length; j++) { if (out[j].contains(all[i])) { nested = true; break; } }
      if (!nested) out.push(all[i]);
    }
    return out;
  }

  function sectionInfo(el) {
    var all = landmarks();
    for (var i = 0; i < all.length; i++) {
      if (all[i] === el || all[i].contains(el)) {
        var h = all[i].querySelector("h1, h2, h3");
        return {
          index: i + 1,
          total: all.length,
          tag: all[i].tagName.toLowerCase(),
          id: all[i].id || null,
          heading: h ? clean(h.textContent).slice(0, 60) || null : null
        };
      }
    }
    return null;
  }

  // An element's OWN text, from its direct child text nodes only.
  //
  // el.textContent on a wrapper returns every descendant's text run together
  // with no separators ("Since 2014A quiet room"), which reads as a quotation
  // the element does not actually contain. Own text is what can honestly be
  // quoted; the subtree is only ever offered as context, and flagged as such.
  function ownText(el) {
    var out = "";
    for (var i = 0; i < el.childNodes.length; i++) {
      var n = el.childNodes[i];
      if (n.nodeType === 3) out += n.nodeValue;
    }
    return clean(out);
  }

  // Descendant text, one node at a time, joined with spaces.
  //
  // Neither built-in does the job: textContent runs the nodes together
  // ("Since 2014A quiet room") and innerText applies text-transform, so a
  // CSS-uppercased heading comes back in capitals the source does not contain
  // — and the source is exactly what the model will be grepping.
  function subtreeText(el) {
    var parts = [];
    var total = 0;
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    var n;
    while ((n = walker.nextNode())) {
      var t = clean(n.nodeValue);
      if (!t) continue;
      parts.push(t);
      total += t.length + 1;
      if (total > 200) break;
    }
    return parts.join(" ");
  }

  function describe(el) {
    var tag = el.tagName.toLowerCase();
    var own = ownText(el);
    var isOwn = own.length > 0;
    var text = (isOwn ? own : subtreeText(el)).slice(0, 140);
    var r = el.getBoundingClientRect();
    var src = tag === "img" ? (el.getAttribute("src") || "") : "";
    return {
      tag: tag,
      id: el.id || null,
      classes: clean(el.getAttribute("class")).slice(0, 160) || null,
      text: text || null,
      textIsOwn: isOwn,
      path: cssPath(el),
      section: sectionInfo(el),
      role: el.getAttribute("role") || null,
      alt: el.getAttribute("alt"),
      href: el.getAttribute("href"),
      imgSrc: src ? (src.length > 80 ? src.slice(0, 80) + "\\u2026" : src) : null,
      childCount: el.children.length,
      rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
      label: shortLabel(el)
    };
  }

  function selectable(el) {
    return !!el && el.nodeType === 1 && !isOurs(el) &&
      el !== document.documentElement && el !== document.body;
  }

  function select(el) {
    if (!selectable(el)) return;
    current = el;
    paint(el, false);
    if (sink && sink.focus) { try { sink.focus({ preventScroll: true }); } catch (err) {} }
    send({ type: "selected", el: describe(el) });
  }

  function firstSelectable() {
    var pick = document.querySelector("h1, h2, section, header, main");
    return selectable(pick) ? pick : document.body.firstElementChild;
  }

  function move(dir) {
    if (!current || !current.isConnected) { select(firstSelectable()); return; }
    var next = null;
    if (dir === "up") next = current.parentElement;
    else if (dir === "down") next = current.firstElementChild;
    else if (dir === "prev") next = current.previousElementSibling;
    else if (dir === "next") next = current.nextElementSibling;
    while (next && isOurs(next)) {
      next = dir === "prev" ? next.previousElementSibling : next.nextElementSibling;
    }
    if (!selectable(next)) return;
    select(next);
    if (next.scrollIntoView) next.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function setMode(on) {
    mode = !!on;
    ensureOverlay();
    if (document.documentElement) {
      document.documentElement.style.cursor = mode ? "crosshair" : "";
    }
    // Leaving select mode keeps the selection (the editor still shows it) but
    // stops intercepting, so the page behaves normally again.
    paint(mode ? current : null, false);
    send({ type: "mode", on: mode });
  }

  // Capture phase, and mousedown too: a generated page's own click handler
  // must not fire, and a link must not navigate, while the user is picking.
  document.addEventListener("click", function (e) {
    if (!mode || isOurs(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    select(e.target);
  }, true);

  document.addEventListener("mousedown", function (e) {
    if (!mode || isOurs(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
  }, true);

  document.addEventListener("submit", function (e) {
    if (mode) e.preventDefault();
  }, true);

  document.addEventListener("mouseover", function (e) {
    if (!mode || current || isOurs(e.target)) return;
    paint(e.target, true);
  }, true);

  document.addEventListener("keydown", function (e) {
    if (!mode) return;
    var k = e.key;
    if (k === "Escape") { e.preventDefault(); setMode(false); return; }
    if (k === "ArrowUp") { e.preventDefault(); move("up"); }
    else if (k === "ArrowDown") { e.preventDefault(); move("down"); }
    else if (k === "ArrowLeft") { e.preventDefault(); move("prev"); }
    else if (k === "ArrowRight") { e.preventDefault(); move("next"); }
    else if (k === "Enter" && !current) { e.preventDefault(); select(firstSelectable()); }
  }, true);

  function repaint() { if (mode || current) paint(current, false); }
  window.addEventListener("scroll", repaint, true);
  window.addEventListener("resize", repaint);

  window.addEventListener("message", function (e) {
    if (e.source !== parent) return;
    var d = e.data;
    if (!d || d.ns !== NS) return;
    if (d.cmd === "set-mode") setMode(!!d.on);
    else if (d.cmd === "move") move(d.dir);
    else if (d.cmd === "clear") { current = null; paint(null, false); send({ type: "cleared" }); }
    else if (d.cmd === "ping") send({ type: "ready" });
  });

  // Both, because the parent may attach its listener before or after we load.
  send({ type: "ready" });
  window.addEventListener("load", function () { send({ type: "ready" }); });
})();
`;

/**
 * Escapes text destined for a `<script>` body. The HTML serializer emits
 * script text raw, so an occurrence of the closing-tag sequence inside a
 * bundle would end the element early. `<\/` is valid inside a JS string,
 * template literal or regex, which is the only place it can legitimately
 * appear in minified output.
 */
function inlineScript(js: string): string {
  return js.replace(/<\/(script)/gi, "<\\/$1");
}

/**
 * Same problem for `<style>`. `<\/style` is valid inside a CSS string, the
 * only place the sequence realistically occurs in generated CSS.
 */
function inlineStyle(css: string): string {
  return css.replace(/<\/(style)/gi, "<\\/$1");
}

/** True for a Vite-style absolute build path we can serve from the preview route. */
function isLocalAsset(url: string | null): url is string {
  return !!url && url.startsWith("/") && !url.startsWith("//");
}

export type PreviewAssembly = {
  /** The complete self-contained document for the iframe's `srcdoc`. */
  doc: string;
  /** Build paths referenced by index.html that we could not inline. */
  missing: string[];
};

/**
 * Turns the built index.html plus a map of build files into one self-contained
 * document with the selection agent injected.
 *
 * `fetchAsset` is given a build-relative path ("assets/index-abc.js") and
 * returns its text, or null if it could not be read. Parsing goes through
 * DOMParser rather than regex: it neither executes scripts nor loads
 * subresources, and it cannot be fooled by markup inside an attribute.
 */
export async function buildPreviewDocument(
  indexHtml: string,
  fetchAsset: (path: string) => Promise<string | null>,
): Promise<PreviewAssembly> {
  const missing: string[] = [];
  const doc = new DOMParser().parseFromString(indexHtml, "text/html");
  // DOMParser always synthesises <head> and <body> for text/html; the fallback
  // is only here so a hand-written fragment can never drop the policy.
  const head: Element = doc.head ?? doc.documentElement;

  // Vite emits these to warm the module graph. Every one of them would be a
  // blocked request in the assembled document, so they are noise at best.
  doc.querySelectorAll('link[rel="modulepreload"], link[rel="preload"]').forEach((el) => {
    if (isLocalAsset(el.getAttribute("href"))) el.remove();
  });

  // Stylesheets -> <style>. `crossorigin` goes with the href.
  for (const link of Array.from(doc.querySelectorAll('link[rel="stylesheet"]'))) {
    const href = link.getAttribute("href");
    if (!isLocalAsset(href)) continue;
    const css = await fetchAsset(href.replace(/^\//, ""));
    if (css === null) {
      missing.push(href);
      continue;
    }
    const style = doc.createElement("style");
    // Escaped BEFORE it goes in: the HTML serializer emits <style>/<script>
    // text raw, so escaping afterwards would already be too late.
    style.textContent = inlineStyle(css);
    link.replaceWith(style);
  }

  // Scripts -> inline. A module script is ALWAYS a CORS-mode fetch, so this is
  // not an optimisation: it is the only way the bundle can run in an opaque
  // origin without the asset route serving Access-Control-Allow-Origin.
  for (const script of Array.from(doc.querySelectorAll("script[src]"))) {
    const src = script.getAttribute("src");
    if (!isLocalAsset(src)) continue;
    const js = await fetchAsset(src.replace(/^\//, ""));
    if (js === null) {
      missing.push(src);
      continue;
    }
    const inline = doc.createElement("script");
    const type = script.getAttribute("type");
    if (type) inline.setAttribute("type", type);
    inline.textContent = inlineScript(js);
    script.replaceWith(inline);
  }

  // First child of <head>: a meta policy only governs what is parsed after it.
  const meta = doc.createElement("meta");
  meta.setAttribute("http-equiv", "Content-Security-Policy");
  meta.setAttribute("content", PREVIEW_META_CSP);
  head.insertBefore(meta, head.firstChild);

  // Last child of <body>: the agent wants the finished DOM to walk.
  const agent = doc.createElement("script");
  agent.setAttribute("data-kodely-ui", "1");
  agent.textContent = inlineScript(AGENT_SOURCE);
  (doc.body ?? doc.documentElement).appendChild(agent);

  // outerHTML drops the doctype; without it the frame renders in quirks mode
  // and every generated layout shifts.
  return { doc: `<!doctype html>${doc.documentElement.outerHTML}`, missing };
}

// ---------------------------------------------------------------------------
// The trust boundary.
//
// The preview runs GENERATED code. Nothing stops a generated page from posting
// its own message that looks exactly like the agent's — `event.source` proves
// the message came from the preview frame, not that the agent sent it. So the
// payload is re-validated and re-clamped here rather than trusted.
//
// The blast radius is deliberately small either way: the worst a forged
// selection can do is put text the user can see and edit into the prompt box.
// Nothing here is ever rendered as HTML and nothing is ever auto-submitted.
// ---------------------------------------------------------------------------

function str(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const cleaned = v.replace(/\s+/g, " ").trim().slice(0, max);
  return cleaned.length ? cleaned : null;
}

function int(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.round(v) : 0;
}

/** Validates and clamps an untrusted `selected` payload, or rejects it. */
export function normalizeSelection(raw: unknown): SelectedElement | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  // A tag name is the one field with no sensible default.
  const tag = str(r.tag, 40)?.toLowerCase();
  if (!tag || !/^[a-z][a-z0-9-]*$/.test(tag)) return null;

  let section: SelectionSection | null = null;
  if (r.section && typeof r.section === "object") {
    const s = r.section as Record<string, unknown>;
    const total = int(s.total);
    const index = int(s.index);
    if (total > 0 && index > 0 && index <= total) {
      section = {
        index,
        total,
        tag: str(s.tag, 40)?.toLowerCase() ?? "section",
        id: str(s.id, 80),
        heading: str(s.heading, 80),
      };
    }
  }

  const rect = (r.rect ?? {}) as Record<string, unknown>;

  return {
    tag,
    id: str(r.id, 80),
    classes: str(r.classes, 160),
    text: str(r.text, 140),
    textIsOwn: r.textIsOwn === true,
    path: str(r.path, 200) ?? tag,
    section,
    role: str(r.role, 40),
    alt: str(r.alt, 120),
    href: str(r.href, 200),
    imgSrc: str(r.imgSrc, 100),
    childCount: Math.max(0, int(r.childCount)),
    rect: { x: int(rect.x), y: int(rect.y), w: int(rect.w), h: int(rect.h) },
    label: str(r.label, 60) ?? `<${tag}>`,
  };
}

/**
 * The one-line reference that goes into the prompt box.
 *
 * The preview serves COMPILED output, so a DOM node has no direct line back to
 * the JSX that produced it. What the model can actually act on is the element's
 * text (greppable), its tag, and where it sits — so that is what this says, and
 * it deliberately claims nothing more.
 */
export function selectionReference(el: SelectedElement): string {
  const bits: string[] = [`the <${el.tag}> element`];

  if (el.text) {
    const t = el.text.length > 80 ? `${el.text.slice(0, 80)}…` : el.text;
    // "reading" only when the element itself holds the words. For a wrapper
    // the text belongs to its descendants, and saying otherwise would send the
    // model looking for a string that is not in that element.
    bits.push(el.textIsOwn ? `reading "${t}"` : `(a container whose contents begin "${t}")`);
  } else if (el.alt) {
    bits.push(`(image with alt text "${el.alt}")`);
  } else if (el.imgSrc) {
    bits.push("(an image)");
  }

  const where: string[] = [];
  if (el.section) {
    const name = el.section.heading
      ? `"${el.section.heading}"`
      : el.section.id
        ? `#${el.section.id}`
        : `<${el.section.tag}>`;
    where.push(`in section ${el.section.index} of ${el.section.total} (${name})`);
  }
  if (el.path) where.push(`at ${el.path}`);
  if (where.length) bits.push(where.join(", "));

  return bits.join(" ");
}
