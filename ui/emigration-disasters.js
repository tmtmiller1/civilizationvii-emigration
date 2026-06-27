// emigration-disasters.js
//
// Per-city "disaster distress" - environmental events (flood, volcano, plague, …) as a
// migration driver (climate / disaster refugees), parallel to the violence model. The
// distress accumulates and decays each turn, and feeds a situational prosperity penalty
// so a struck city sheds population.
//
// Fog-independence (matching the rest of the mod): the canonical, always-readable signal
// is `city.isInfected` (the base game's outbreak flag - an infected city already stops
// growing and emits migrants), polled for every met city. Event-driven disasters
// (RandomEventOccurred) front-run this with a severity-scaled spike via `recordDisaster`,
// used mainly for the local player's feedback/notification; the poll is the source of
// truth. State persists in GameConfiguration.

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { speedDecay } from "/emigration/ui/emigration-game-speed.js";

const STATE_KEY = "EmigrationDisaster_v1";
const STATE_SCHEMA_VERSION = 2;
const MAX_CITY_KEYS = 8192;

/**
 * @typedef {Object} DisasterState
 * @property {Record<string, number>} byCity Accumulated distress per city key.
 * @property {Record<string, string>} typeByCity Most-recent disaster RandomEventType per city key.
 * @property {Record<string, number>} observedTurn Turn each city was last polled.
 * @property {number} decayTurn Turn distress was last decayed.
 */

/** @type {DisasterState | null} */
let _state = null;

/**
 * @returns {DisasterState} Empty disaster state.
 */
function emptyState() {
  return { byCity: {}, typeByCity: {}, observedTurn: {}, decayTurn: gameTurn() };
}

/**
 * Resolve persisted payload from a legacy or schema envelope blob.
 * @param {*} parsed Parsed JSON value.
 * @returns {*} Payload object, or null.
 */
function payloadFromBlob(parsed) {
  if (!parsed || typeof parsed !== "object") return null;
  const payload = typeof parsed.v === "number" && parsed.data && typeof parsed.data === "object"
    ? parsed.data
    : parsed;
  return payload && typeof payload === "object" ? payload : null;
}

/**
 * @param {string} k Candidate map key.
 * @param {*} v Candidate numeric value.
 * @param {boolean} nonNegative Whether values must be non-negative.
 * @returns {boolean} Whether entry is valid.
 */
function isValidNumericEntry(k, v, nonNegative) {
  if (typeof k !== "string" || !k.length) return false;
  if (typeof v !== "number" || !isFinite(v)) return false;
  return !(nonNegative && v < 0);
}

/**
 * @param {*} m Candidate numeric map.
 * @param {boolean} nonNegative Whether values must be non-negative.
 * @returns {Record<string, number>} Sanitized numeric map.
 */
function normalizeNumericMap(m, nonNegative) {
  /** @type {Record<string, number>} */
  const out = {};
  if (!m || typeof m !== "object") return out;
  let n = 0;
  for (const [k, v] of Object.entries(m)) {
    if (n >= MAX_CITY_KEYS) break;
    if (!isValidNumericEntry(k, v, nonNegative)) continue;
    out[k] = v;
    n++;
  }
  return out;
}

/**
 * @param {*} m Candidate disaster type map.
 * @returns {Record<string, string>} Sanitized type map.
 */
function normalizeTypeMap(m) {
  /** @type {Record<string, string>} */
  const out = {};
  if (!m || typeof m !== "object") return out;
  let n = 0;
  for (const [k, v] of Object.entries(m)) {
    if (n >= MAX_CITY_KEYS) break;
    if (typeof k !== "string" || !k.length) continue;
    if (typeof v !== "string" || !v.length) continue;
    out[k] = v;
    n++;
  }
  return out;
}

/**
 * @param {*} parsed Parsed persisted state.
 * @returns {DisasterState|null} Normalized state.
 */
function normalizeState(parsed) {
  const payload = payloadFromBlob(parsed);
  if (!payload) return null;
  return {
    byCity: normalizeNumericMap(payload.byCity, true),
    typeByCity: normalizeTypeMap(payload.typeByCity),
    observedTurn: normalizeNumericMap(payload.observedTurn, true),
    decayTurn: typeof payload.decayTurn === "number" && isFinite(payload.decayTurn)
      ? Math.max(0, Math.floor(payload.decayTurn))
      : gameTurn()
  };
}

/**
 * Per-event-class distress weights for a severity-1 event (severity multiplies).
 * @type {Record<string, number>}
 */
const CLASS_WEIGHT = {
  CLASS_VOLCANO: 12,
  CLASS_FLOOD: 8,
  CLASS_PLAGUE: 8,
  CLASS_HURRICANE: 7,
  CLASS_TORNADO: 5,
  CLASS_BLIZZARD: 4,
  CLASS_DUSTSTORM: 3,
  CLASS_THUNDERSTORM: 3
};

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
 * The raw persisted state string, or null.
 * @returns {string|null} The stored JSON, or null.
 */
function readStored() {
  const g = Configuration?.getGame?.();
  const v = g && typeof g.getValue === "function" ? g.getValue(STATE_KEY) : null;
  return typeof v === "string" && v.length ? v : null;
}

/**
 * Load (once) the persisted distress state.
 * @returns {DisasterState} State.
 */
function state() {
  if (_state) return _state;
  try {
    const raw = readStored();
    const normalized = raw ? normalizeState(JSON.parse(raw)) : null;
    if (normalized) {
      _state = normalized;
      return _state;
    }
  } catch (_) {
    /* ignore */
  }
  _state = emptyState();
  return _state;
}

/** Persist the distress state to GameConfiguration. */
function persist() {
  try {
    const normalized = normalizeState(_state) || emptyState();
    Configuration?.editGame?.()?.setValue?.(
      STATE_KEY,
      JSON.stringify({ v: STATE_SCHEMA_VERSION, data: normalized })
    );
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
    // Prefer the owner:id pair directly off the component id (the fields the rest of the mod keys
    // on). ComponentID.toBitfield does NOT reliably yield a number/string for a CITY component id,
    // it returned a non-primitive here, so this returned null and the disaster model silently
    // recorded distress for NO city (affectedCities=0). Fall back to the bitfield if owner:id absent.
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
 * This turn's polled, fog-independent distress for a city: a standing term while it's
 * infected (the base game's outbreak flag). 0 when disasters are disabled or unreadable.
 * @param {*} city A live city object.
 * @returns {number} Polled distress to add this turn (>= 0).
 */
function polledDistress(city) {
  try {
    if (city?.isInfected) return CONFIG.disasterPlagueWeight;
  } catch (_) {
    /* ignore */
  }
  return 0;
}

/**
 * Poll a city's disaster distress and return its current intensity. Idempotent within a
 * turn (so repeated signal collection doesn't re-add). Returns 0 when disabled.
 * @param {*} city A live city object.
 * @returns {number} Current distress (>= 0).
 */
export function observeDisaster(city) {
  if (!CONFIG.disastersEnabled) return 0;
  const key = keyFromCID(city?.id);
  if (!key) return 0;
  const s = state();
  const turn = gameTurn();
  if (s.observedTurn[key] !== turn) {
    s.observedTurn[key] = turn;
    const add = polledDistress(city);
    if (add > 0) s.byCity[key] = (s.byCity[key] || 0) + add;
  }
  const v = s.byCity[key];
  return typeof v === "number" && isFinite(v) ? v : 0;
}

/**
 * Add a severity-scaled distress spike to a set of cities hit by a RandomEvent (the
 * event-driven front-run). `cityKeys` are the keyFromCID keys of the affected cities.
 * @param {string} eventClass The event's CLASS_* string.
 * @param {number} severity The event severity (>= 1).
 * @param {string[]} cityKeys Affected city keys.
 * @param {string} [eventType] The RandomEventType, stamped per city for cause attribution.
 */
export function recordDisaster(eventClass, severity, cityKeys, eventType) {
  if (!CONFIG.disastersEnabled || !Array.isArray(cityKeys) || !cityKeys.length) return;
  const w = (CLASS_WEIGHT[eventClass] || 4) * (severity > 0 ? severity : 1);
  const s = state();
  const type = typeof eventType === "string" && eventType ? eventType : null;
  for (const key of cityKeys) stampDisaster(s, key, w, type);
  persist();
}

/**
 * Add `w` distress to one city and stamp the disaster `type` (latest hit wins) for attribution.
 * @param {DisasterState} s State. @param {string} key City key. @param {number} w Distress.
 * @param {string|null} type The RandomEventType, or null.
 */
function stampDisaster(s, key, w, type) {
  if (!key) return;
  s.byCity[key] = (s.byCity[key] || 0) + w;
  if (type) s.typeByCity[key] = type;
}

/**
 * The RandomEventType of the most recent disaster that struck a city (for cause attribution), or
 * null. Cleared when the city's distress decays away (see tickDisasters).
 * @param {string} cityKey The city key.
 * @returns {string|null} The event type, or null.
 */
export function disasterTypeFor(cityKey) {
  if (!cityKey) return null;
  const t = state().typeByCity[cityKey];
  return typeof t === "string" && t ? t : null;
}

/**
 * The owner player id encoded in a city key ("owner:id"), or null when unparseable.
 * @param {string} key A city key.
 * @returns {number|null} The owner id, or null.
 */
function ownerOfKey(key) {
  const owner = Number(String(key).split(":")[0]);
  return Number.isInteger(owner) ? owner : null;
}

/**
 * The RandomEventType of the WORST disaster currently afflicting any of `owner`'s cities — the one
 * carrying the most distress right now — for naming that civ's refugee crisis. Returns the disaster
 * actually striking THAT civ, not the globally most-recent event (which could be a flood on another
 * continent), so a "Greek refugee crisis" names the Greek disaster. Null when none is active.
 * @param {number} owner Owner player id.
 * @returns {string|null} The event type, or null.
 */
export function worstDisasterTypeForOwner(owner) {
  if (typeof owner !== "number") return null;
  const s = state();
  let bestType = null;
  let best = -1;
  for (const k of Object.keys(s.typeByCity)) {
    if (ownerOfKey(k) !== owner) continue;
    const d = s.byCity[k] || 0;
    if (d > best) {
      best = d;
      bestType = s.typeByCity[k];
    }
  }
  return typeof bestType === "string" && bestType ? bestType : null;
}

/**
 * Seed a small amount of distress at a destination city (plague carried by migrants).
 * @param {string} cityKey Destination city key.
 * @param {number} amount Distress to add.
 */
export function addDistress(cityKey, amount) {
  if (!CONFIG.disastersEnabled || !cityKey || !(amount > 0)) return;
  const s = state();
  s.byCity[cityKey] = (s.byCity[cityKey] || 0) + amount;
  persist();
}

/**
 * Decay every city's distress toward zero for the turns elapsed since the last tick
 * (idempotent within a turn), drop negligible values, and persist. Call once per pass
 * before observing.
 */
export function tickDisasters() {
  if (!CONFIG.disastersEnabled) return;
  const s = state();
  const turn = gameTurn();
  const elapsed = Math.max(0, turn - s.decayTurn);
  if (elapsed > 0) {
    const factor = Math.pow(speedDecay(CONFIG.disasterDecay), elapsed);
    for (const k of Object.keys(s.byCity)) {
      const v = s.byCity[k] * factor;
      if (v < 0.05) {
        delete s.byCity[k];
        delete s.typeByCity[k]; // the disaster has faded; drop its stale type stamp
      } else s.byCity[k] = v;
    }
    s.decayTurn = turn;
  }
  persist();
}

/**
 * The key for a city (exposed so the event layer can map affected cities → distress).
 * @param {*} city A live city object.
 * @returns {string|null} The key, or null.
 */
export function disasterKey(city) {
  return keyFromCID(city?.id);
}
