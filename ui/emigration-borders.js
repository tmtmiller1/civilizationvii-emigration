// emigration-borders.js
//
// Reads which of the mod's policy cards a civ has slotted (Culture.isTraditionActive) and turns them
// into the effects the scripts apply: the immigration-openness multiplier on a destination's pull, the
// retention of a source's own people, how the host treats the enclaves in its cities, the refugee tilt,
// the attraction dividend and Consular Protection. The cards' flat yields are native modifiers in the
// data files. Every policy read goes through a per-pass cache (resetBorderCache()) so each civ's slotted
// cards are read at most once per pass on the O(cities²) pull hot path.
//
// Since 3.6.0 the Pro-Immigration Stance carries the protective treatment and the refugee tilt, and the
// Anti-Immigration Stance carries the suspicion treatment. The cards those effects used to live on
// (protective, suspicion, asylum, the two other attractions) are retired: no new game offers them, but a
// save that still holds one keeps its effect, so their types stay listed here as legacy.

import { CONFIG } from "/emigration/ui/emigration-config.js";

/**
 * The tradition types behind each effect, one per age (all ages map to the same effect). Frozen
 * registry so the rest of the module names effects, not raw type-string arrays. The `legacy*`
 * families are the retired cards.
 */
export const POLICY_TYPES = Object.freeze({
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
  consular: ["TRADITION_EMIG_CONSULAR_EXPLORATION", "TRADITION_EMIG_CONSULAR_MODERN"],
  legacyCultpull: ["TRADITION_EMIG_CULTPULL_EXPLORATION", "TRADITION_EMIG_CULTPULL_MODERN"],
  legacyTradepull: ["TRADITION_EMIG_TRADEPULL_EXPLORATION", "TRADITION_EMIG_TRADEPULL_MODERN"],
  legacyAsylum: ["TRADITION_EMIG_ASYLUM_EXPLORATION", "TRADITION_EMIG_ASYLUM_MODERN"],
  legacyProtect: [
    "TRADITION_EMIG_PROTECT_ANTIQUITY",
    "TRADITION_EMIG_PROTECT_EXPLORATION",
    "TRADITION_EMIG_PROTECT_MODERN"
  ],
  legacySuspect: [
    "TRADITION_EMIG_SUSPECT_ANTIQUITY",
    "TRADITION_EMIG_SUSPECT_EXPLORATION",
    "TRADITION_EMIG_SUSPECT_MODERN"
  ]
});

/**
 * Immigration into a host with a retired suspicion card slotted, as a multiplier on its border-stance
 * openness. The Anti-Immigration Stance already throttles arrivals itself, so it doesn't take this cut.
 */
export const SUSPECT_OPENNESS = 0.75;

/** Cached type-hash per tradition type string (a hash is stable for the whole game). @type {Map<string, *>} */
const _hash = new Map();

/**
 * @param {string} type
 * @returns {*}
 */
function hashFor(type) {
  if (_hash.has(type)) return _hash.get(type);
  let h = null;
  try {
    const database = typeof Database !== "undefined" ? Database : null;
    const makeHash = database && typeof database.makeHash === "function" ? database.makeHash.bind(database) : null;
    h = makeHash ? makeHash(type) : null;
  } catch (_) {
    h = null;
  }
  _hash.set(type, h);
  return h;
}

/** @param {number} pid */
function readCulture(pid) {
  try {
    const players = typeof Players !== "undefined" ? Players : null;
    const getPlayer = players && typeof players.get === "function" ? players.get.bind(players) : null;
    const player = getPlayer ? getPlayer(pid) : null;
    return player ? player.Culture : null;
  } catch (_) {
    return null;
  }
}

/**
 * Whether the current age's database knows a tradition type. `isTraditionActive` answers true for any hash the
 * database doesn't hold (watched 2026-10-17), so the other ages' copies of a family would all read as slotted
 * unless they're skipped. Reads as known when GameInfo isn't there (the test harness).
 * @param {string} type
 * @returns {boolean}
 */
function knownType(type) {
  try {
    const info = typeof GameInfo !== "undefined" ? GameInfo : null;
    const table = info && info.Traditions;
    if (!table || typeof table.lookup !== "function") return true;
    return table.lookup(type) != null;
  } catch (_) {
    return false;
  }
}

/** @param {*} culture @param {string[]} types @returns {string|null} The first slotted type this age knows. */
function firstActive(culture, types) {
  for (const type of types) {
    if (!knownType(type)) continue;
    const h = hashFor(type);
    if (h != null && culture.isTraditionActive(h)) return type;
  }
  return null;
}

/**
 * Which of `types` a player has active in a policy slot, or null. Raw read, callers go through the
 * per-pass cache (policyState) rather than calling this directly on the hot path.
 * @param {number} pid
 * @param {string[]} types
 * @returns {string|null} The slotted tradition type, or null.
 */
function activeType(pid, types) {
  const culture = readCulture(pid);
  if (!culture || typeof culture.isTraditionActive !== "function") return null;
  try {
    return firstActive(culture, types);
  } catch (_) {
    return null;
  }
}

/** @param {number} pid @param {string[]} types @returns {boolean} */
function hasPolicy(pid, types) {
  return activeType(pid, types) != null;
}

/**
 * @typedef {Object} PolicyState A civ's resolved policy for this pass.
 * @property {boolean} open Whether a Pro-Immigration Stance is slotted.
 * @property {boolean} closed Whether an Anti-Immigration Stance is slotted.
 * @property {boolean} asylum Whether refugees are drawn to this civ (a Pro-Immigration Stance, or a retired
 *   asylum card).
 * @property {string|null} protect The card giving the protective treatment (the Pro-Immigration Stance, or a
 *   retired protective card), or null.
 * @property {string|null} suspect The card giving the suspicion treatment (the Anti-Immigration Stance, or a
 *   retired suspicion card), or null.
 * @property {boolean} legacySuspect Whether the suspicion treatment comes from a retired card alone.
 * @property {boolean} consular Whether a Consular Protection card is slotted.
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

/** The turn the cache was last known good for, so readers outside the pass never keep last turn's cards. */
let _polyStamp = "";

/** Clear the cache when the turn has moved on since it was filled (cheap: one turn read per call). */
function freshForTurn() {
  let stamp = "";
  try {
    stamp = typeof Game !== "undefined" ? Game.age + ":" + Game.turn : "";
  } catch (_) {
    stamp = "";
  }
  if (stamp !== _polyStamp) {
    _polyCache.clear();
    _polyStamp = stamp;
  }
}

/**
 * The civ's resolved border/attraction policy for this pass (memoized). Reads every relevant policy
 * family once and caches the result keyed by pid; all the exports below derive from this.
 * @param {number} pid
 * @returns {PolicyState}
 */
export function policyState(pid) {
  const hit = _polyCache.get(pid);
  if (hit) return hit;
  const openType = activeType(pid, POLICY_TYPES.open);
  const closedType = activeType(pid, POLICY_TYPES.closed);
  const legacySuspect = activeType(pid, POLICY_TYPES.legacySuspect);
  const state = {
    open: openType != null,
    closed: closedType != null,
    asylum: openType != null || hasPolicy(pid, POLICY_TYPES.legacyAsylum),
    protect: openType || activeType(pid, POLICY_TYPES.legacyProtect),
    suspect: closedType || legacySuspect,
    legacySuspect: closedType == null && legacySuspect != null,
    consular: hasPolicy(pid, POLICY_TYPES.consular)
  };
  _polyCache.set(pid, state);
  return state;
}

/**
 * A civ's immigration openness from its slotted stance. 1 = neutral; < 1 throttles inflow (floored so
 * it never hard-zeros), > 1 boosts it. Slotting both stances cancels out to neutral. A retired
 * suspicion card multiplies the result by SUSPECT_OPENNESS (still floored); the Anti-Immigration
 * Stance's own throttle already covers that. Influence is not handled here (native TraditionModifiers).
 * @param {number} pid Destination player id.
 * @returns {number} A positive multiplier.
 */
export function immigrationOpenness(pid) {
  if (!CONFIG.bordersEnabled) return 1;
  const stance = stanceOpenness(pid);
  const state = policyState(pid);
  if (!state.legacySuspect || stanceOf(state) !== "suspect") return stance;
  return Math.max(CONFIG.opennessFloor, stance * SUSPECT_OPENNESS);
}

/** @param {number} pid @returns {number} The border-stance openness alone. */
function stanceOpenness(pid) {
  const neutral = Math.max(CONFIG.opennessFloor, 1); // floored neutral
  const { open, closed } = policyState(pid);
  if (open && closed) return neutral; // both slotted → cancel out → neutral
  if (closed) return Math.max(CONFIG.opennessFloor, CONFIG.closedBordersOpenness);
  if (open) return Math.max(CONFIG.opennessFloor, CONFIG.openBordersOpenness);
  return neutral;
}

/**
 * How a host treats the communities in its cities, from its slotted stance: "protect" (Pro-Immigration),
 * "suspect" (Anti-Immigration), or null. Slotting both cancels out to null. Read whatever the border-policy
 * option says, since the cards' own effects (payouts, consular grievances) don't depend on it.
 * @param {number} pid Host player id.
 * @returns {"protect"|"suspect"|null} The stance.
 */
export function treatmentStance(pid) {
  if (typeof pid !== "number") return null;
  freshForTurn();
  return stanceOf(policyState(pid));
}

/** @param {PolicyState} state @returns {"protect"|"suspect"|null} */
function stanceOf(state) {
  if (state.protect && state.suspect) return null;
  if (state.protect) return "protect";
  return state.suspect ? "suspect" : null;
}

/**
 * The tradition type behind a host's treatment stance (for naming the card in a Chronicle line), or null.
 * @param {number} pid Host player id. @returns {string|null} The slotted card's type.
 */
export function treatmentCard(pid) {
  const stance = treatmentStance(pid);
  if (!stance) return null;
  return policyState(pid)[stance];
}

/**
 * Whether a civ holds a Consular Protection card.
 * @param {number} pid
 * @returns {boolean}
 */
export function hasConsular(pid) {
  if (typeof pid !== "number") return false;
  freshForTurn();
  return policyState(pid).consular;
}

/**
 * A civ's emigration retention from its slotted border policy: the multiplier applied to its own
 * citizens' cross-civ outbound pull. 1 = neutral; Closed Borders returns `closedBordersRetention`
 * (< 1). Only a Closed-without-Open card retains. Neutral when the feature is off.
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
 * Whether war and disaster refugees are drawn to this civ first: a Pro-Immigration Stance, or a retired
 * asylum card.
 * @param {number} pid
 * @returns {boolean}
 */
export function hasAsylum(pid) {
  return policyState(pid).asylum;
}

/**
 * A civ's immigration stance from its slotted border policy, for the readout/dashboards:
 * "pro" (Pro-Immigration), "anti" (Anti-Immigration), or "none". Slotting both Open and Closed
 * cancels out to "none". Neutral when the feature is off.
 * @param {number} pid
 * @returns {"pro"|"anti"|"none"}
 */
export function borderStance(pid) {
  if (!CONFIG.bordersEnabled) return "none";
  const { open, closed } = policyState(pid);
  if (open && closed) return "none"; // both slotted → cancel out
  if (open) return "pro";
  if (closed) return "anti";
  return "none";
}

/** @type {*} Test-only hooks. */
export const __test = {
  clearHashCache: () => _hash.clear()
};
