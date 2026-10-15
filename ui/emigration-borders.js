// emigration-borders.js
//
// Reads which Open/Closed Borders policy a civ has slotted (Culture.isTraditionActive) and turns it
// into the immigration-openness multiplier the engine applies to a destination's pull. The cards'
// Influence is a native modifier in the data files; this module only enforces the immigration %.
// Every policy read goes through a per-pass cache (resetBorderCache()) so each civ's slotted cards
// are read at most once per pass on the O(cities²) pull hot path.

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
  asylum: ["TRADITION_EMIG_ASYLUM_EXPLORATION", "TRADITION_EMIG_ASYLUM_MODERN"],
  protect: [
    "TRADITION_EMIG_PROTECT_ANTIQUITY",
    "TRADITION_EMIG_PROTECT_EXPLORATION",
    "TRADITION_EMIG_PROTECT_MODERN"
  ],
  suspect: [
    "TRADITION_EMIG_SUSPECT_ANTIQUITY",
    "TRADITION_EMIG_SUSPECT_EXPLORATION",
    "TRADITION_EMIG_SUSPECT_MODERN"
  ],
  consular: ["TRADITION_EMIG_CONSULAR_EXPLORATION", "TRADITION_EMIG_CONSULAR_MODERN"]
});

/** Immigration into a host with a suspicion card slotted, as a multiplier on its border-stance openness. */
export const SUSPECT_OPENNESS = 0.75;

// Attraction cards: each turns the civ's immigration into a carried dividend in one yield. Data-driven
// so activeAttractions is just a filter; a new attraction card is one row here.
/** @type {ReadonlyArray<{family:keyof typeof POLICY_TYPES, yield:string}>} */
const ATTRACTIONS = Object.freeze([
  { family: "talent", yield: "YIELD_SCIENCE" },
  { family: "cultpull", yield: "YIELD_CULTURE" },
  { family: "tradepull", yield: "YIELD_GOLD" }
]);

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

/** @param {*} culture @param {string[]} types @returns {string|null} The first slotted type. */
function firstActive(culture, types) {
  for (const type of types) {
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
 * @typedef {Object} PolicyState A civ's resolved border/attraction policy for this pass.
 * @property {boolean} open Whether an Open Borders card is slotted.
 * @property {boolean} closed Whether a Closed Borders card is slotted.
 * @property {boolean} asylum Whether an Asylum card is slotted.
 * @property {string[]} attractions Yield keys the slotted Attraction cards accrue.
 * @property {string|null} protect The slotted protective treatment card, or null.
 * @property {string|null} suspect The slotted suspicion treatment card, or null.
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
function policyState(pid) {
  const hit = _polyCache.get(pid);
  if (hit) return hit;
  const state = {
    open: hasPolicy(pid, POLICY_TYPES.open),
    closed: hasPolicy(pid, POLICY_TYPES.closed),
    asylum: hasPolicy(pid, POLICY_TYPES.asylum),
    attractions: ATTRACTIONS.filter((a) => hasPolicy(pid, POLICY_TYPES[a.family])).map((a) => a.yield),
    protect: activeType(pid, POLICY_TYPES.protect),
    suspect: activeType(pid, POLICY_TYPES.suspect),
    consular: hasPolicy(pid, POLICY_TYPES.consular)
  };
  _polyCache.set(pid, state);
  return state;
}

/**
 * A civ's immigration openness from its slotted border policy. 1 = neutral; < 1 throttles inflow
 * (floored so it never hard-zeros), > 1 boosts it. Slotting both Open and Closed cancels out to
 * neutral. A suspicion card multiplies the result by SUSPECT_OPENNESS (still floored). Influence is
 * not handled here (native TraditionModifiers).
 * @param {number} pid Destination player id.
 * @returns {number} A positive multiplier.
 */
export function immigrationOpenness(pid) {
  if (!CONFIG.bordersEnabled) return 1;
  const stance = stanceOpenness(pid);
  if (stanceOf(policyState(pid)) !== "suspect") return stance;
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
 * How a host treats the communities in its cities, from its slotted treatment card: "protect", "suspect",
 * or null. Slotting one of each cancels out to null. Read whatever the border-policy option says, since the
 * cards' own effects (payouts, consular grievances) don't depend on it.
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
 * The yields a civ's slotted Attraction cards grant per immigrant. Talent → YIELD_SCIENCE,
 * Cultural → YIELD_CULTURE, Commercial → YIELD_GOLD; a civ may hold more than one. Empty when none
 * are slotted, so the carried dividend is a no-op (fail-safe) until the cards exist + are chosen.
 * @param {number} pid
 * @returns {string[]} Yield keys to accrue a dividend in.
 */
export function activeAttractions(pid) {
  return policyState(pid).attractions;
}

/**
 * Whether a civ holds an Asylum card, which eases refugee-caused pull toward it.
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
