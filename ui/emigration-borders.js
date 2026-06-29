// emigration-borders.js
//
// Feature 2 (UI-VM half): reads which Open/Closed Borders policy a civ has slotted
// (Culture.isTraditionActive) and turns it into the immigration-openness multiplier the
// engine applies to a destination's pull.
//
// The cards' per-turn Influence (+1 Open / -2 Closed, YIELD_DIPLOMACY) is a NATIVE modifier
// (data/emigration-policies-*.xml + the gameeffects file), so it shows on the card and in the
// yields; this module only enforces the immigration %. Neutral when the feature is off.
//
// Every policy read goes through a per-pass cache (resetBorderCache() at the top of
// collectCitySignals, alongside resetPolityCache) so each civ's slotted cards are read at most
// once per pass instead of once per (city × candidate) on the O(cities²) pull hot path.

import { CONFIG } from "/emigration/ui/emigration-config.js";

/**
 * The tradition types behind each border/attraction effect, one per age (all ages map to the same
 * effect). Frozen registry so the rest of the module names effects, not raw type-string arrays.
 */
const POLICY_TYPES = Object.freeze({
  open: [
    "TRADITION_EMIG_OPEN_BORDERS_ANTIQUITY",
    "TRADITION_EMIG_OPEN_BORDERS_EXPLORATION",
    "TRADITION_EMIG_OPEN_BORDERS_MODERN"
  ],
  closed: [
    "TRADITION_EMIG_CLOSED_BORDERS_ANTIQUITY",
    "TRADITION_EMIG_CLOSED_BORDERS_EXPLORATION",
    "TRADITION_EMIG_CLOSED_BORDERS_MODERN"
  ],
  talent: ["TRADITION_EMIG_TALENT_EXPLORATION", "TRADITION_EMIG_TALENT_MODERN"],
  cultpull: ["TRADITION_EMIG_CULTPULL_EXPLORATION", "TRADITION_EMIG_CULTPULL_MODERN"],
  tradepull: ["TRADITION_EMIG_TRADEPULL_EXPLORATION", "TRADITION_EMIG_TRADEPULL_MODERN"],
  asylum: ["TRADITION_EMIG_ASYLUM_EXPLORATION", "TRADITION_EMIG_ASYLUM_MODERN"]
});

// Attraction cards (§1b): each turns the civ's immigration into a carried dividend in one yield
// (debut Exploration, strengthen Modern). Data-driven so activeAttractions is just a filter — a new
// attraction card is one row here (the policy family + the yield it accrues), no new branch.
/** @type {ReadonlyArray<{family:keyof typeof POLICY_TYPES, yield:string}>} */
const ATTRACTIONS = Object.freeze([
  { family: "talent", yield: "YIELD_SCIENCE" },
  { family: "cultpull", yield: "YIELD_CULTURE" },
  { family: "tradepull", yield: "YIELD_GOLD" }
]);

/** Cached type-hash per tradition type string (a hash is stable for the whole game). @type {Map<string, *>} */
const _hash = new Map();

/**
 * The (cached) type-hash for a tradition type string, or null.
 * @param {string} type Tradition type string.
 * @returns {*} The hash, or null.
 */
function hashFor(type) {
  if (_hash.has(type)) return _hash.get(type);
  let h = null;
  try {
    h = typeof Database !== "undefined" ? Database?.makeHash?.(type) : null;
  } catch (_) {
    h = null;
  }
  _hash.set(type, h);
  return h;
}

/**
 * Whether a player has any of `types` active in a policy slot. Raw read — callers go through the
 * per-pass cache (policyState) rather than calling this directly on the hot path.
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
 * @typedef {Object} PolicyState A civ's resolved border/attraction policy for this pass.
 * @property {boolean} open Whether an Open Borders card is slotted.
 * @property {boolean} closed Whether a Closed Borders card is slotted.
 * @property {boolean} asylum Whether an Asylum card is slotted.
 * @property {string[]} attractions Yield keys the slotted Attraction cards accrue.
 */

/** Per-pass memo of policyState, keyed by player id. Cleared by resetBorderCache(). @type {Map<number, PolicyState>} */
const _polyCache = new Map();

/**
 * Clear the per-pass border-policy cache. Called at the top of collectCitySignals (next to
 * resetPolityCache) so each civ's slotted cards are read at most once per pass.
 * @returns {void}
 */
export function resetBorderCache() {
  _polyCache.clear();
}

/**
 * The civ's resolved border/attraction policy for this pass (memoized). Reads every relevant policy
 * family once and caches the result keyed by pid; all the exports below derive from this.
 * @param {number} pid Player id.
 * @returns {PolicyState} The resolved state.
 */
function policyState(pid) {
  const hit = _polyCache.get(pid);
  if (hit) return hit;
  const state = {
    open: hasPolicy(pid, POLICY_TYPES.open),
    closed: hasPolicy(pid, POLICY_TYPES.closed),
    asylum: hasPolicy(pid, POLICY_TYPES.asylum),
    attractions: ATTRACTIONS.filter((a) => hasPolicy(pid, POLICY_TYPES[a.family])).map((a) => a.yield)
  };
  _polyCache.set(pid, state);
  return state;
}

/**
 * A civ's immigration openness from its slotted border policy. 1 = neutral; < 1 throttles
 * inflow (floored so it never hard-zeros), > 1 boosts it. Slotting BOTH Open and Closed cancels
 * out to neutral (the two stances negate each other). Influence is not handled here: the
 * Open/Closed Borders cards carry their +1 / -2 Influence as native TraditionModifiers
 * (data/emigration-policies-gameeffects.xml), visible on the card and in the yields.
 * @param {number} pid Destination player id.
 * @returns {number} A positive multiplier.
 */
export function immigrationOpenness(pid) {
  if (!CONFIG.bordersEnabled) return 1;
  const neutral = Math.max(CONFIG.opennessFloor, 1); // floored neutral (matches the pre-cancel formula)
  const { open, closed } = policyState(pid);
  if (open && closed) return neutral; // both slotted → cancel out → neutral
  if (closed) return Math.max(CONFIG.opennessFloor, CONFIG.closedBordersOpenness);
  if (open) return Math.max(CONFIG.opennessFloor, CONFIG.openBordersOpenness);
  return neutral;
}

/**
 * A civ's emigration RETENTION from its slotted border policy: the multiplier applied to its own
 * citizens' cross-civ outbound pull. 1 = neutral; Closed Borders returns `closedBordersRetention`
 * (< 1) so fewer of your people are lured away to rival civs - the "keep them home" half of closing
 * your borders, the mirror of the inbound throttle. Open Borders does not retain (an open civ lets
 * people come and go freely); slotting BOTH cancels out, so only a Closed-without-Open card retains.
 * Neutral when the feature is off.
 * @param {number} pid Source player id (the civ losing population).
 * @returns {number} A positive multiplier (<= 1).
 */
export function emigrationRetention(pid) {
  if (!CONFIG.bordersEnabled) return 1;
  const { open, closed } = policyState(pid);
  if (closed && !open) return CONFIG.closedBordersRetention; // both slotted → cancel out → neutral
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
  return policyState(pid).attractions;
}

/**
 * Whether a civ holds an Asylum card (§4a), which eases refugee-caused pull toward it.
 * @param {number} pid Player id.
 * @returns {boolean} True if an asylum tradition is active.
 */
export function hasAsylum(pid) {
  return policyState(pid).asylum;
}

/**
 * A civ's immigration stance from its slotted border policy, for the readout/dashboards:
 * "pro" (Pro-Immigration), "anti" (Anti-Immigration), or "none". Slotting BOTH Open and Closed
 * cancels out to "none". Neutral when the feature is off.
 * @param {number} pid Player id.
 * @returns {"pro"|"anti"|"none"} The stance.
 */
export function borderStance(pid) {
  if (!CONFIG.bordersEnabled) return "none";
  const { open, closed } = policyState(pid);
  if (open && closed) return "none"; // both slotted → cancel out
  if (open) return "pro";
  if (closed) return "anti";
  return "none";
}
