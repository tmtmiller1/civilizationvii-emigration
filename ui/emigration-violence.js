// emigration-violence.js
//
// Per-city "violence intensity" - the actual fighting inside a settlement's
// borders, which is what should drive war refugees (NOT the empire merely being
// at war). A civilization at war but with no combat in a given city's territory
// produces no violence there, so that city sees no war-driven emigration.
//
// Everything is POLLED from the gameplay model each turn, never event-driven, so
// it is FOG-INDEPENDENT and symmetric: a war the player can watch and a distant
// AI-vs-AI war in the dark register identically. (Event-based combat detection
// only fires for what the local player can see, which would bias emigration
// toward player-adjacent conflicts - so it is deliberately not used.)
//
//   • District damage - the city center district's health
//     (Players.Districts.get(owner).getDistrictHealth / getDistrictMaxHealth at
//     city.location). The base game reads this the same way for every alive
//     player and only gates the on-screen HEALTH BAR by visibility, so the value
//     is readable for foreign cities being sacked out of view. A turn-over-turn
//     INCREASE = fresh assault (a spike); standing damage = an ongoing siege.
//   • Pillage - damaged constructibles on the city's purchased plots
//     (MapConstructibles.getConstructibles → Constructibles.getByComponentID
//     .damaged). Each pillaged tile adds a small standing pressure until it is
//     repaired. This applies PRESSURE only (it slides emigration up via the
//     prosperity penalty); it never moves or destroys a pop point, so repairing
//     a tile can't recycle population.
//
// Intensity ACCUMULATES and DECAYS each turn, so the score tracks recent, ongoing
// violence: a sustained siege builds high; a lone raid fades in 2–3 turns (the
// "duration" dimension). State persists in GameConfiguration.

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { speedTurns, speedDecay } from "/emigration/ui/emigration-game-speed.js";
import { civTuning } from "/emigration/ui/emigration-civ-tuning.js";
import {
  districtDamageFrac, districtBesieged, pillagedCount
} from "/emigration/ui/emigration-violence-signals.js";

const STATE_KEY = "EmigrationViolence_v2";

/**
 * @typedef {Object} ViolenceState
 * @property {Record<string, number>} byCity Accumulated intensity per city key.
 * @property {Record<string, number>} lastFrac Last observed damage fraction.
 * @property {Record<string, number>} observedTurn Turn each city was last polled.
 * @property {number} decayTurn Turn intensity was last decayed.
 * @property {Record<string, number>} tenure Consecutive turns under siege (Algorithm D).
 * @property {Record<string, number>} onsetPop Population when the siege began (Algorithm D).
 * @property {Record<string, number>} warLoss Population lost to war while besieged (Algorithm D).
 */

/** @type {ViolenceState | null} */
let _state = null;

/**
 * The current age-local game turn, or 0.
 * @returns {number} Game.turn or 0.
 */
function gameTurn() {
  try {
    return typeof Game !== "undefined" && typeof Game.turn === "number" ? Game.turn : 0;
  } catch (_) {
    return 0;
  }
}

/**
 * The raw persisted state string from GameConfiguration, or null.
 * @returns {string|null} The stored JSON, or null.
 */
function readStored() {
  const g = Configuration?.getGame?.();
  const v = g && typeof g.getValue === "function" ? g.getValue(STATE_KEY) : null;
  return typeof v === "string" && v.length ? v : null;
}

/**
 * Parse the persisted state, or null if absent/unusable. Seeds decayTurn to
 * "now" when absent, so the first tick doesn't decay fresh violence by a huge
 * elapsed span.
 * @returns {ViolenceState|null} The state, or null.
 */
function loadPersisted() {
  const raw = readStored();
  if (!raw) return null;
  const s = JSON.parse(raw);
  if (!s || typeof s !== "object") return null;
  return normalizeViolence(s);
}

/**
 * Coerce a parsed object into the canonical ViolenceState shape (filling any
 * missing maps and seeding decayTurn to "now").
 * @param {*} s Parsed object.
 * @returns {ViolenceState} The normalized state.
 */
function normalizeViolence(s) {
  return {
    byCity: s.byCity || {},
    lastFrac: s.lastFrac || {},
    observedTurn: s.observedTurn || {},
    decayTurn: s.decayTurn || gameTurn(),
    tenure: s.tenure || {},
    onsetPop: s.onsetPop || {},
    warLoss: s.warLoss || {}
  };
}

/**
 * Load (once) the persisted violence state into the module cache.
 * @returns {ViolenceState} The state.
 */
function state() {
  if (_state) return _state;
  try {
    _state = loadPersisted();
  } catch (_) {
    _state = null;
  }
  if (!_state) {
    _state = normalizeViolence({ decayTurn: gameTurn() });
  }
  return _state;
}

/** Persist the violence state to GameConfiguration. */
function persist() {
  try {
    Configuration?.editGame?.()?.setValue?.(STATE_KEY, JSON.stringify(_state));
  } catch (_) {
    /* ignore */
  }
}

/**
 * A stable string key for a city ComponentID, or null if unusable.
 * @param {*} cid A city ComponentID.
 * @returns {string|null} The key, or null.
 */
function keyFromCID(cid) {
  try {
    if (!cid) return null;
    // Prefer the owner:id pair directly off the component id, the same fields the district matching
    // reads successfully. ComponentID.toBitfield does NOT reliably yield a number/string for a CITY
    // component id (it returned a non-primitive here, so keyFromCID was returning null and the whole
    // violence model silently no-op'd). Fall back to the bitfield only if owner:id is unavailable.
    if (typeof cid.owner === "number" && cid.id != null) return cid.owner + ":" + cid.id;
    if (typeof ComponentID !== "undefined") {
      const bf = ComponentID.toBitfield(cid);
      if (typeof bf === "number" || typeof bf === "string") return String(bf);
    }
  } catch (_) {
    /* ignore */
  }
  return null;
}

/**
 * Fold this turn's polled signals into a city's intensity: a spike for fresh
 * district damage, a standing term while the city center stays hurt, and a
 * per-pillaged-tile term while improvements in its borders sit pillaged. All
 * fog-independent and never touching population - pillaging applies pressure
 * (which slides emigration up), it does not move or destroy a pop point, so
 * repairing a tile can't be used to recycle population.
 * @param {ViolenceState} s State.
 * @param {string} key City key.
 * @param {*} city A live city object.
 */
function applyObservation(s, key, city) {
  const frac = districtDamageFrac(city);
  const fresh = Math.max(0, frac - (s.lastFrac[key] || 0));
  // Standing siege pressure while the city center is under attack: scaled by damage, with a FLOOR the
  // moment it's besieged even at zero damage so an Independent Power / city-state raid still registers
  // as conflict. That floor is `siegeBesiegedFloor` (< 1) rather than full strength, so early-game
  // harassment that besieges without wrecking the district builds pressure gradually instead of
  // instantly crossing the flee threshold and flooding "war" refugees (real assault damage still
  // counts at full `frac`).
  const siegeFrac = Math.max(frac, districtBesieged(city) ? CONFIG.siegeBesiegedFloor : 0);
  let add = CONFIG.vwAssault * fresh + CONFIG.vwSiege * siegeFrac;
  add += CONFIG.vwPillage * pillagedCount(city);
  if (add > 0) s.byCity[key] = (s.byCity[key] || 0) + add;
  s.lastFrac[key] = frac;
}

/**
 * Update a city's siege tenure (Algorithm D) once per turn: if its intensity is
 * at/above the flee threshold it's "under siege" - increment the consecutive-turn
 * counter and, on the first such turn, capture the onset population (and reset the
 * war-loss tally). If it's below the threshold, the siege has lifted: clear the
 * tenure bookkeeping. Only runs under the warSiege model.
 * @param {ViolenceState} s State.
 * @param {string} key City key.
 * @param {*} city A live city object.
 */
function updateSiegeTenure(s, key, city) {
  if (!CONFIG.warSiege) return;
  const intensity = s.byCity[key] || 0;
  if (intensity >= CONFIG.violenceFleeThreshold) {
    const t = (s.tenure[key] || 0) + 1;
    s.tenure[key] = t;
    if (t === 1) {
      s.onsetPop[key] = typeof city?.population === "number" ? city.population : 0;
      s.warLoss[key] = 0;
    }
  } else if (s.tenure[key]) {
    delete s.tenure[key];
    delete s.onsetPop[key];
    delete s.warLoss[key];
  }
}

/**
 * Poll a city's damage and return its current violence intensity. Idempotent
 * within a turn (so repeated signal collection in one turn doesn't re-add), and
 * fog-independent. Call this per city when building signals.
 * @param {*} city A live city object.
 * @returns {number} Current intensity (>= 0).
 */
export function observeCity(city) {
  const key = keyFromCID(city?.id);
  if (!key) return 0;
  const s = state();
  const turn = gameTurn();
  if (s.observedTurn[key] !== turn) {
    s.observedTurn[key] = turn;
    applyObservation(s, key, city);
    updateSiegeTenure(s, key, city);
  }
  const v = s.byCity[key];
  return typeof v === "number" && isFinite(v) ? v : 0;
}

// ── Algorithm D: siege-duration escalation + cumulative war-loss cap ───────

/**
 * The war-retention multiplier for a city's owner (civ tuning), defaulting to 1.
 * @param {*} city A live city object.
 * @returns {number} Retention (> 0).
 */
function retentionFor(city) {
  const r = civTuning(city?.owner).warRetention;
  return typeof r === "number" && r > 0 ? r : 1;
}

/**
 * The siege escalation multiplier for a city's violence penalty (Algorithm D):
 * ramps from `siegeFloor` at tenure 1 to 1.0 once a siege has lasted
 * `siegeRampTurns`, so a longer siege bites harder - but drops to 0 once the city
 * has lost its capped share (`siegeLossCapPct` of onset population) to war, so the
 * remnant "digs in" and can't be fully depopulated. Returns 1 (no-op) when the
 * warSiege model is off or the city key is unreadable.
 * @param {*} city A live city object.
 * @returns {number} Multiplier in [0, 1].
 */
export function siegeEscalation(city) {
  if (!CONFIG.warSiege) return 1;
  const key = keyFromCID(city?.id);
  if (!key) return 1;
  const s = state();
  // warRetention (civ tuning): >1 lowers the cap and softens intensity (retains more).
  const r = retentionFor(city);
  const onset = s.onsetPop[key] || 0;
  if (onset > 0 && (s.warLoss[key] || 0) >= (CONFIG.siegeLossCapPct / r) * onset) return 0;
  const t = s.tenure[key] || 0;
  // tenure 1 → siegeFloor; reaches full (×1) siegeRampTurns turns after onset.
  const ramp = Math.min(1, Math.max(0, t - 1) / Math.max(1, speedTurns(CONFIG.siegeRampTurns)));
  return (CONFIG.siegeFloor + (1 - CONFIG.siegeFloor) * ramp) / r;
}

/**
 * Record that a city lost one population point to war-driven emigration this pass
 * (Algorithm D), counting toward its cumulative cap. Only counts while the city
 * is actually under siege (has a positive tenure). No-op when warSiege is off.
 * @param {*} city A live city object.
 */
export function recordWarLoss(city) {
  if (!CONFIG.warSiege) return;
  const key = keyFromCID(city?.id);
  if (!key) return;
  const s = state();
  if ((s.tenure[key] || 0) > 0) {
    s.warLoss[key] = (s.warLoss[key] || 0) + 1;
    persist();
  }
}

// ── Decay + read ──────────────────────────────────────────────────────────

/**
 * Decay every city's intensity toward zero for the turns elapsed since the last
 * tick (idempotent within a turn, so manual re-runs don't over-decay), drop
 * negligible values, and persist. Call once per pass, before observing.
 */
export function tickViolence() {
  const s = state();
  const turn = gameTurn();
  const elapsed = Math.max(0, turn - s.decayTurn);
  if (elapsed > 0) {
    const factor = Math.pow(speedDecay(CONFIG.violenceDecay), elapsed);
    for (const k of Object.keys(s.byCity)) {
      const v = s.byCity[k] * factor;
      if (v < 0.05) {
        delete s.byCity[k];
        delete s.tenure[k];
        delete s.onsetPop[k];
        delete s.warLoss[k];
      } else {
        s.byCity[k] = v;
      }
    }
    s.decayTurn = turn;
  }
  persist();
}
