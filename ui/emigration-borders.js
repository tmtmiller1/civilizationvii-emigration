// emigration-borders.js
//
// Feature 2 (UI-VM half): reads which Open/Closed Borders policy a civ has slotted
// (Culture.isTraditionActive) and turns it into the immigration-openness multiplier the
// engine applies to a destination's pull.
//
// The cards' per-turn Influence (+1 Open / -2 Closed, YIELD_DIPLOMACY) is a NATIVE modifier
// (data/emigration-policies-*.xml + the gameeffects file), so it shows on the card and in the
// yields; this module only enforces the immigration %. Neutral when the feature is off.

import { CONFIG } from "/emigration/ui/emigration-config.js";

/** The Open Borders tradition types (one per age - all map to the same effect). */
const OPEN_TYPES = [
  "TRADITION_EMIG_OPEN_BORDERS_ANTIQUITY",
  "TRADITION_EMIG_OPEN_BORDERS_EXPLORATION",
  "TRADITION_EMIG_OPEN_BORDERS_MODERN"
];
/** The Closed Borders tradition types (one per age). */
const CLOSED_TYPES = [
  "TRADITION_EMIG_CLOSED_BORDERS_ANTIQUITY",
  "TRADITION_EMIG_CLOSED_BORDERS_EXPLORATION",
  "TRADITION_EMIG_CLOSED_BORDERS_MODERN"
];

// Attraction cards (§1b): each turns the civ's immigration into a carried dividend in one yield
// (debut Exploration, strengthen Modern). The yield each grants drives addAttractionDividend.
/** Talent Attraction tradition types → +Science dividend. */
const TALENT_TYPES = ["TRADITION_EMIG_TALENT_EXPLORATION", "TRADITION_EMIG_TALENT_MODERN"];
/** Cultural Attraction tradition types → +Culture dividend. */
const CULTPULL_TYPES = ["TRADITION_EMIG_CULTPULL_EXPLORATION", "TRADITION_EMIG_CULTPULL_MODERN"];
/** Commercial Attraction tradition types → +Gold dividend. */
const TRADEPULL_TYPES = ["TRADITION_EMIG_TRADEPULL_EXPLORATION", "TRADITION_EMIG_TRADEPULL_MODERN"];
/** Asylum tradition types (§4a): ease refugee-caused pull toward the holder. */
const ASYLUM_TYPES = ["TRADITION_EMIG_ASYLUM_EXPLORATION", "TRADITION_EMIG_ASYLUM_MODERN"];

/** @type {Record<string, *>} */
const _hash = {};

/**
 * The (cached) type-hash for a tradition type string, or null.
 * @param {string} type Tradition type string.
 * @returns {*} The hash, or null.
 */
function hashFor(type) {
  if (type in _hash) return _hash[type];
  let h = null;
  try {
    h = typeof Database !== "undefined" ? Database?.makeHash?.(type) : null;
  } catch (_) {
    h = null;
  }
  _hash[type] = h;
  return h;
}

/**
 * Whether a player has any of `types` active in a policy slot.
 * @param {number} pid Player id.
 * @param {string[]} types Tradition type strings.
 * @returns {boolean} True if any is active.
 */
function hasPolicy(pid, types) {
  try {
    const culture = Players?.get?.(pid)?.Culture;
    if (typeof culture?.isTraditionActive !== "function") return false;
    for (const type of types) {
      const h = hashFor(type);
      if (h != null && culture.isTraditionActive(h)) return true;
    }
  } catch (_) {
    /* ignore */
  }
  return false;
}

/**
 * A civ's immigration openness from its slotted border policy. 1 = neutral; < 1 throttles
 * inflow (floored so it never hard-zeros), > 1 boosts it. Influence is not handled here: the
 * Open/Closed Borders cards carry their +1 / -2 Influence as native TraditionModifiers
 * (data/emigration-policies-gameeffects.xml), visible on the card and in the yields.
 * @param {number} pid Destination player id.
 * @returns {number} A positive multiplier.
 */
export function immigrationOpenness(pid) {
  let o = 1;
  if (CONFIG.bordersEnabled) {
    if (hasPolicy(pid, CLOSED_TYPES)) o *= CONFIG.closedBordersOpenness;
    if (hasPolicy(pid, OPEN_TYPES)) o *= CONFIG.openBordersOpenness;
  }
  return Math.max(CONFIG.opennessFloor, o);
}

/**
 * A civ's emigration RETENTION from its slotted border policy: the multiplier applied to its own
 * citizens' cross-civ outbound pull. 1 = neutral; Closed Borders returns `closedBordersRetention`
 * (< 1) so fewer of your people are lured away to rival civs - the "keep them home" half of closing
 * your borders, the mirror of the inbound throttle. Open Borders does not retain (an open civ lets
 * people come and go freely), so only the Closed card moves this. Neutral when the feature is off.
 * @param {number} pid Source player id (the civ losing population).
 * @returns {number} A positive multiplier (<= 1).
 */
export function emigrationRetention(pid) {
  if (CONFIG.bordersEnabled && hasPolicy(pid, CLOSED_TYPES)) return CONFIG.closedBordersRetention;
  return 1;
}

/**
 * The yields a civ's slotted Attraction cards grant per immigrant (§1b). Talent → YIELD_SCIENCE,
 * Cultural → YIELD_CULTURE, Commercial → YIELD_GOLD; a civ may hold more than one. Empty when none
 * are slotted, so the carried dividend is a no-op (fail-safe) until the cards exist + are chosen.
 * @param {number} pid Player id.
 * @returns {string[]} Yield keys to accrue a dividend in.
 */
export function activeAttractions(pid) {
  /** @type {string[]} */
  const out = [];
  if (hasPolicy(pid, TALENT_TYPES)) out.push("YIELD_SCIENCE");
  if (hasPolicy(pid, CULTPULL_TYPES)) out.push("YIELD_CULTURE");
  if (hasPolicy(pid, TRADEPULL_TYPES)) out.push("YIELD_GOLD");
  return out;
}

/**
 * Whether a civ holds an Asylum card (§4a), which eases refugee-caused pull toward it.
 * @param {number} pid Player id.
 * @returns {boolean} True if an asylum tradition is active.
 */
export function hasAsylum(pid) {
  return hasPolicy(pid, ASYLUM_TYPES);
}

/**
 * A civ's immigration stance from its slotted border policy, for the readout/dashboards:
 * "pro" (Pro-Immigration), "anti" (Anti-Immigration), or "none". Neutral when the feature is off.
 * @param {number} pid Player id.
 * @returns {"pro"|"anti"|"none"} The stance.
 */
export function borderStance(pid) {
  if (!CONFIG.bordersEnabled) return "none";
  if (hasPolicy(pid, OPEN_TYPES)) return "pro";
  if (hasPolicy(pid, CLOSED_TYPES)) return "anti";
  return "none";
}
