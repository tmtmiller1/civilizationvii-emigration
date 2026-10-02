// emigration-loc.js
//
// The shared localization helper for the mod's runtime UI. `loc(key, fallback, ...args)` composes a
// LOC key through the engine's Locale.compose when available, and otherwise returns the English
// `fallback`. Both paths substitute {1_X} / {2_X} style placeholders from `args`, so a call reads the
// same off-engine (tests, headless) as it does in-game with English selected: the fallback IS the
// canonical English string. Depends only on the global `Locale`, so any UI module can import it
// without creating an import cycle.

/**
 * Substitute {1_X}/{2_X} positional placeholders in a template with `args`.
 * @param {string} template The template string.
 * @param {*[]} args Positional substitution args (1-based in the placeholder).
 * @returns {string} The filled string.
 */
function fill(template, args) {
  return String(template).replace(/\{(\d+)_[A-Za-z]+\}/g, (m, n) => {
    const a = args[Number(n) - 1];
    return a == null ? m : String(a);
  });
}

/**
 * Localize a LOC key with a guaranteed English fallback. Substitutes {1_X} placeholders from `args`
 * on both the localized and fallback paths.
 * @param {string} key The LOC key.
 * @param {string} fallback The canonical English string (may contain {1_X} placeholders).
 * @param {...*} args Positional substitution args.
 * @returns {string} The localized (or fallback) string.
 */
export function loc(key, fallback, ...args) {
  try {
    if (typeof Locale !== "undefined" && Locale.compose) {
      const v = Locale.compose(key, ...args);
      if (typeof v === "string" && v && !v.startsWith("LOC_")) return v;
    }
  } catch (_) {
    /* fall through to the English fallback */
  }
  return fill(fallback, args);
}

/** Display locales that need a CJK font, by their slot in the game's font lists. */
const CJK_FONT_SLOT = /** @type {Record<string, number>} */ ({ zh_Hans_CN: 1, zh_Hant_HK: 2, ja_JP: 3, ko_KR: 4 });

/**
 * The game's font faces for the active locale, ordered the way the game orders its own
 * (global-scaling.js getOrderedFontFamily): the locale's CJK face swaps into first place. TitleFont
 * and BodyFont have no Hangul, kana or Han glyphs, and a canvas or world label draws with the first
 * face only, so naming them alone shows missing-glyph boxes in Chinese, Japanese and Korean.
 * @param {"body"|"title"} [kind] Body or title faces.
 * @returns {string[]} The faces, first one leading.
 */
export function localeFonts(kind = "body") {
  const base = kind === "title" ? "TitleFont" : "BodyFont";
  const faces = [base, base + "-SC", base + "-TC", base + "-JP", base + "-KR"];
  let slot = 0;
  try {
    slot = CJK_FONT_SLOT[String(Locale.getCurrentDisplayLocale())] || 0;
  } catch (_) {
    slot = 0; // No Locale (tests): the Latin order.
  }
  [faces[0], faces[slot]] = [faces[slot], faces[0]];
  return faces;
}

/**
 * {@link localeFonts} as a CSS font-family list.
 * @param {"body"|"title"} [kind] Body or title faces.
 * @returns {string} The list, ending in sans-serif.
 */
export function localeFontFamily(kind = "body") {
  return localeFonts(kind).join(", ") + ", sans-serif";
}

// ---------------------------------------------------------------------------------------------------
// Recorded messages. A line that is stored and shown later (the notification log, the Chronicle) is
// built as a message node, rendered once in the current language for the stored English-era `summary`
// and toasts, and packed as data so the view can compose it again in whatever language is active when
// it is read. Node shapes (in memory, each with its English fallback):
//   "text" / 12              a literal (city names, already-composed fragments) or a number
//   {k, f, a}                a LOC key, its English fallback template, and its args (each a node)
//   {j: [nodes]}             the nodes concatenated
//   {cap: node}              the node with its first letter capitalized
//   {bare: node}             the node with a leading English "the " removed
//   {n: number}              an integer grouped with the locale's digit separators
// Packed (persisted) shapes drop the fallbacks: "text", 12, [key, ...args], ["+", ...parts],
// ["^", x], ["~", x], ["#", n]. To keep saves small, a key's "LOC_EMIG_" prefix is stored as "@" and
// nested concatenations are flattened.

/**
 * @typedef {string|number|{k:string, f:string, a:MsgNode[]}|{j:MsgNode[]}|{cap:MsgNode}|{bare:MsgNode}|
 *   {n:number}} MsgNode
 */

/**
 * A message node for a LOC key: renders like {@link loc} with the same fallback and args.
 * @param {string} key The LOC key. @param {string} fallback The English template.
 * @param {...(MsgNode|null|undefined)} args Positional args (strings, numbers or nodes; a missing one
 *   renders as "").
 * @returns {MsgNode} The node.
 */
export function msg(key, fallback, ...args) {
  return { k: key, f: fallback, a: args.map((a) => (a == null ? "" : a)) };
}

/**
 * A node for an engine-owned LOC key whose text was already composed (a civ adjective, a disaster or
 * war name). A non-key value stays the literal `text`.
 * @param {*} key The engine key (e.g. "LOC_CIVILIZATION_ROME_ADJECTIVE"), or anything else.
 * @param {string} text The composed text, used as the fallback and as the literal.
 * @returns {MsgNode} The node.
 */
export function msgKey(key, text) {
  return typeof key === "string" && key.startsWith("LOC_") ? { k: key, f: text, a: [] } : text;
}

/**
 * Concatenate nodes. Null, undefined and "" parts are dropped.
 * @param {...(MsgNode|null|undefined)} parts The parts. @returns {MsgNode} The joined node.
 */
export function msgJoin(...parts) {
  return { j: /** @type {MsgNode[]} */ (parts.filter((p) => p != null && p !== "")) };
}

/**
 * Join nodes with a literal separator between each, dropping empty parts.
 * @param {string} sep The separator. @param {(MsgNode|null|undefined)[]} parts The parts.
 * @returns {MsgNode} The joined node.
 */
export function msgJoinWith(sep, parts) {
  /** @type {MsgNode[]} */
  const out = [];
  for (const p of parts) {
    if (p == null || p === "") continue;
    if (out.length) out.push(sep);
    out.push(p);
  }
  return { j: out };
}

/** @param {MsgNode|undefined} x @returns {MsgNode} The node, first letter capitalized when rendered. */
export function msgCap(x) {
  return { cap: x ?? "" };
}

/** @param {MsgNode|undefined} x @returns {MsgNode} The node without a leading "the " when rendered. */
export function msgBare(x) {
  return { bare: x ?? "" };
}

/** @param {number} n An integer. @returns {MsgNode} The node, locale-grouped when rendered. */
export function msgNum(n) {
  return { n };
}

/** @param {string} s @returns {string} The string with its first letter capitalized. */
function capFirst(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** @param {string} s @returns {string} The string without a leading "the ". */
function stripThe(s) {
  return String(s || "").replace(/^the\s+/i, "");
}

/**
 * An integer grouped with the locale's separators (Locale.toNumber), or US-style grouping off-engine.
 * @param {number} n The value. @returns {string} The grouped figure.
 */
function groupNum(n) {
  const v = Math.round(Number(n) || 0);
  try {
    if (typeof Locale !== "undefined" && typeof Locale.toNumber === "function") return Locale.toNumber(v);
  } catch (_) {
    // Locale.toNumber can throw on odd input; use the manual grouping.
  }
  return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Render a node in the current language, with each key's English fallback on a miss (the same result
 * the equivalent nested {@link loc} calls give).
 * @param {MsgNode|null|undefined} node The node. @returns {string} The text.
 */
export function msgText(node) {
  if (node == null) return "";
  if (typeof node !== "object") return String(node);
  const o = /** @type {*} */ (node);
  if (Array.isArray(o.j)) return o.j.map(msgText).join("");
  if ("cap" in o) return capFirst(msgText(o.cap));
  if ("bare" in o) return stripThe(msgText(o.bare));
  if ("n" in o) return groupNum(o.n);
  return loc(o.k, o.f, ...(o.a || []).map(msgText));
}

/** Packed-form operator for each wrapping node. */
const PACK_OP = /** @type {Record<string, string>} */ ({ cap: "^", bare: "~" });

/**
 * Pack a node for storage: the fallbacks are dropped (see the section comment for the shapes).
 * @param {MsgNode|null|undefined} node The node. @returns {*} The packed value ("" for null).
 */
export function msgPack(node) {
  if (node == null) return "";
  if (typeof node !== "object") return node;
  const o = /** @type {*} */ (node);
  if (Array.isArray(o.j)) return packJoin(o.j);
  for (const op of Object.keys(PACK_OP)) {
    if (op in o) return [PACK_OP[op], msgPack(o[op])];
  }
  if ("n" in o) return ["#", o.n];
  const key = String(o.k).startsWith(OWN_PREFIX) ? "@" + String(o.k).slice(OWN_PREFIX.length) : o.k;
  return [key, ...(o.a || []).map(msgPack)];
}

/** The mod's own key prefix, stored as "@". */
const OWN_PREFIX = "LOC_EMIG_";

/**
 * Pack a concatenation, splicing nested ones into it; a single part packs as itself.
 * @param {MsgNode[]} parts The parts. @returns {*} The packed value.
 */
function packJoin(parts) {
  const out = [];
  for (const p of parts.map(msgPack)) {
    if (Array.isArray(p) && p[0] === "+") out.push(...p.slice(1));
    else if (p !== "") out.push(p);
  }
  return out.length === 1 ? out[0] : ["+", ...out];
}

/**
 * Compose a packed message in the current language, or null when it cannot be composed in full (no
 * Locale, an unknown key, malformed data), so the caller shows its stored text instead.
 * @param {*} p The packed message. @returns {string|null} The text, or null.
 */
export function msgCompose(p) {
  try {
    if (typeof Locale === "undefined" || typeof Locale.compose !== "function") return null;
    const v = composePacked(p, 0);
    return v == null ? null : String(v);
  } catch (_) {
    return null;
  }
}

/**
 * {@link msgCompose}'s recursive step. Numbers stay numbers, so a key's plural rules still see one.
 * @param {*} p The packed value. @param {number} depth Nesting depth (bounded).
 * @returns {string|number|null} The text, or null.
 */
function composePacked(p, depth) {
  if (typeof p === "string") return p;
  if (typeof p === "number" && isFinite(p)) return p;
  if (!Array.isArray(p) || !p.length || typeof p[0] !== "string" || depth > MSG_MAX_DEPTH) return null;
  const args = [];
  for (const a of p.slice(1)) {
    const s = composePacked(a, depth + 1);
    if (s == null) return null;
    args.push(s);
  }
  return applyPacked(p[0], args, p[1]);
}

/** The packed operators, by head. Each takes the composed args (and the raw first arg). */
const PACKED_OPS = /** @type {Record<string, (args:(string|number)[], raw:*) => (string|null)>} */ ({
  "+": (args) => args.join(""),
  "^": (args) => capFirst(String(args[0] ?? "")),
  "~": (args) => stripThe(String(args[0] ?? "")),
  "#": (_args, raw) => (typeof raw === "number" ? groupNum(raw) : null)
});

/**
 * Apply one packed operator (or compose a key) to its already-composed args.
 * @param {string} head The operator or LOC key. @param {(string|number)[]} args The composed args.
 * @param {*} raw The first raw arg (the number of a "#" node).
 * @returns {string|null} The text, or null.
 */
function applyPacked(head, args, raw) {
  const op = PACKED_OPS[head];
  if (op) return op(args, raw);
  const key = head.startsWith("@") ? OWN_PREFIX + head.slice(1) : head;
  if (!key.startsWith("LOC_")) return null;
  const v = Locale.compose(key, ...args);
  return typeof v === "string" && v && !v.startsWith("LOC_") ? v : null;
}

// Bounds on a stored message, so a corrupt save cannot hand the view a huge or deep structure.
const MSG_MAX_DEPTH = 8;
const MSG_MAX_NODES = 96;
const MSG_MAX_STR = 600;

/**
 * Validate a packed message read back from a save: the value when well-formed and within bounds,
 * else undefined (the entry then shows its stored text).
 * @param {*} p The packed value. @returns {*} The value, or undefined.
 */
export function msgClean(p) {
  const budget = { n: MSG_MAX_NODES };
  return validPacked(p, 0, budget) ? p : undefined;
}

/**
 * {@link msgClean}'s recursive check.
 * @param {*} p The value. @param {number} depth Nesting depth. @param {{n:number}} budget Nodes left.
 * @returns {boolean} True when well-formed.
 */
function validPacked(p, depth, budget) {
  if (--budget.n < 0 || depth > MSG_MAX_DEPTH) return false;
  if (typeof p === "string") return p.length <= MSG_MAX_STR;
  if (typeof p === "number") return isFinite(p);
  if (!Array.isArray(p) || !p.length || typeof p[0] !== "string") return false;
  return p.slice(1).every((a) => validPacked(a, depth + 1, budget));
}

/**
 * Whether a value is a message node built by this module (rather than a plain string or number).
 * @param {*} v The value. @returns {boolean} True for an object node.
 */
export function isMsgNode(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

// The engine's calendar strings as Game.getTurnDate() writes them in English. Stored turn dates keep
// that text (other code parses it); the display goes through this.
const YEAR_RE = /^(\d[\d,.]*)\s*(BCE|CE|BC|AD)$/;

/**
 * A stored English year ("1060 CE", "2850 BCE") in the current language; any other value (already
 * localized, empty, unparsed) passes through unchanged.
 * @param {*} year The stored year text. @returns {string} The display text.
 */
export function locYear(year) {
  const s = typeof year === "string" ? year.trim() : "";
  const m = YEAR_RE.exec(s);
  if (!m) return typeof year === "string" ? year : "";
  const bce = m[2] === "BCE" || m[2] === "BC";
  return bce
    ? loc("LOC_EMIG_YEAR_BCE", "{1_Year} BCE", m[1])
    : loc("LOC_EMIG_YEAR_CE", "{1_Year} CE", m[1]);
}
