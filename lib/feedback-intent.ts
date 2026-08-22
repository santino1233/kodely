// Classifies a follow-up request into a coarse intent bucket.
//
// The point: what someone types AFTER a build is the sharpest quality signal
// the product produces, and it is currently thrown away. If "the copy is
// generic" is 40% of follow-ups and "it's broken" is 2%, that ranks the next
// prompt change for us. Nothing else we collect answers that question.
//
// Deliberately heuristic, and deliberately NOT a model call:
//  - It runs on the request path of every edit. A model call there would add
//    latency and cost to every single build to produce a dashboard number.
//  - The cost of a wrong answer is one miscounted row in an aggregate. That is
//    a completely different risk profile from, say, content moderation, where
//    a keyword heuristic would be indefensible because a wrong answer blocks a
//    real customer's site.
//
// Treat the output as a weak signal in aggregate, never as a fact about an
// individual request. If the buckets ever start driving something with real
// consequences, replace this with a proper classifier first.

export const INTENTS = [
  "broken", // it doesn't work / it's blank / error
  "visual", // colours, fonts, spacing, "ugly"
  "content", // wording, copy, text, names, prices
  "layout", // move/reorder/resize/structure
  "add", // add a section, page, feature
  "remove", // delete something
  "praise", // no change requested
  "other",
] as const;

export type Intent = (typeof INTENTS)[number];

// Ordered: the FIRST match wins, so the list runs most-specific first.
// "broken" outranks everything — a blank page is not a styling note even when
// the user politely phrases it as one.
//
// Note the plural-tolerant endings (`colou?rs?`, `fonts?`). `\bcolou?r\b`
// does NOT match "colors": the trailing \b fails against the s. That silently
// mis-bucketed the single most common visual request until a test caught it.
const RULES: { intent: Intent; pattern: RegExp }[] = [
  {
    intent: "broken",
    pattern:
      /\b(broken|not working|doesn'?t work|blank|white screen|empty page|errors?|crash(ed|ing|es)?|bugs?|nothing (shows|happens|loads)|won'?t load|failed)\b/i,
  },
  {
    intent: "remove",
    pattern: /\b(remove|delete|get rid of|take out|drop the|don'?t (want|need))\b/i,
  },
  {
    intent: "add",
    pattern:
      /\b(add|include|insert|another|a new|also (want|need)|can (you|we) (add|put)|put in|create a)\b/i,
  },
  {
    intent: "visual",
    pattern:
      /\b(colou?rs?|fonts?|typefaces?|bolder|darker|lighter|backgrounds?|gradients?|styl(e|es|ing)|themes?|ugly|prettier|nicer|modern|rounded|shadows?|spacing|padding|margins?|warmer|cooler|brighter|vibrant)\b/i,
  },
  {
    intent: "layout",
    pattern:
      /\b(move|reorder|swap|above|below|left|right|centre|center|align|bigger|smaller|wider|narrower|full width|layouts?|position|order|top|bottom|grids?|columns?|stack)\b/i,
  },
  {
    intent: "content",
    pattern:
      /\b(text|copy|wording|words?|headlines?|titles?|headings?|paragraphs?|change .* to|rename|spelling|typos?|prices?|pricing|phone|address|emails?|hours|name)\b/i,
  },
];

// Vague quality complaints, checked AFTER content rather than inside the
// visual rule where they used to live.
//
// They are not visual words. "The copy is generic" is a CONTENT complaint —
// and it is this module's own headline example of one at the top of the file —
// but `generic` sat in the visual pattern, and visual is tested before content,
// so "copy" never got a look in. Same shape as the `colou?r` plural bug: an
// over-broad token in a higher-priority rule swallowing the specific rule below.
//
// A bare "this looks generic", with no content noun anywhere, still means the
// look — so these resolve to `visual`, just last, after anything more specific
// has had its chance.
const VAGUE_VISUAL = /\b(generic|bland|boring|dull)\b/i;

// Checked only AFTER every actionable rule misses. "Great, now make the
// colours warmer" is a change request that opens politely, not praise — so
// praise must never outrank a bucket that names actual work. Matching a
// keyword anywhere (rather than requiring the whole string to be praise) is
// what lets "wow this is amazing" through.
const PRAISE =
  /\b(wow|nice|great|perfect|awesome|amazing|love it|looks good|looks great|thanks?|thank you|beautiful|excellent|brilliant|exactly)\b/i;

/**
 * Best-guess bucket for a follow-up request. Returns "other" when nothing
 * matches, which is a real answer — an "other" rate that climbs means the
 * rules have drifted from how people actually talk.
 */
export function classifyFollowUp(prompt: string): Intent {
  const text = prompt.trim();
  if (!text) return "other";

  for (const rule of RULES) {
    if (rule.pattern.test(text)) return rule.intent;
  }
  if (VAGUE_VISUAL.test(text)) return "visual";
  if (PRAISE.test(text)) return "praise";
  return "other";
}
