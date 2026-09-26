// emigration-violence.js
//
// Per-city "violence intensity" - the actual fighting inside a settlement's borders, which drives war
// refugees (NOT the empire merely being at war). Signals are POLLED from the gameplay model each turn
// (city-center district damage, pillaged constructibles, plus the combat-event evidence), so the model is
// fog-independent and symmetric between player-visible and distant AI wars. Pillage applies pressure
// only; it never moves or destroys a pop point. Intensity accumulates and decays each turn, so a
// sustained siege builds high while a lone raid fades. State persists in GameConfiguration.

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { speedTurns, speedDecay } from "/emigration/ui/emigration-game-speed.js";
import { civTuning } from "/emigration/ui/emigration-civ-tuning.js";
import { registerCacheReset, resetCachesOnNewGame } from "/emigration/ui/emigration-cache-reset.js";
import {
  districtDamageFrac, districtBesieged, pillagedCount, besiegingPlayers, attackersNear
} from "/emigration/ui/emigration-violence-signals.js";
import { warOpponents } from "/emigration/ui/emigration-war.js";
import { takeCombatEvidence } from "/emigration/ui/emigration-combat-events.js";
import {
  auditObservation, auditDecay, auditRefugee, auditSnapshot
} from "/emigration/ui/emigration-violence-audit.js";

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
registerCacheReset(() => { _state = null; });

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
 * Keep only finite-number values from a parsed map (drops NaN/garbage).
 * @param {*} m Parsed map object.
 * @returns {Record<string, number>} The sanitized numeric map.
 */
function finiteMap(m) {
  /** @type {Record<string, number>} */
  const out = {};
  if (m && typeof m === "object") {
    for (const k of Object.keys(m)) {
      const v = Number(m[k]);
      if (Number.isFinite(v)) out[k] = v;
    }
  }
  return out;
}

/**
 * Coerce a parsed object into the canonical ViolenceState shape (filling any
 * missing maps and seeding decayTurn to "now").
 * @param {*} s Parsed object.
 * @returns {ViolenceState} The normalized state.
 */
function normalizeViolence(s) {
  // Sanitize every numeric map on load so a corrupted/hand-edited save
  // can't seed NaN that propagates through the decay math for a cycle.
  return {
    byCity: finiteMap(s.byCity),
    lastFrac: finiteMap(s.lastFrac),
    observedTurn: finiteMap(s.observedTurn),
    decayTurn: Number.isFinite(Number(s.decayTurn)) ? Number(s.decayTurn) : gameTurn(),
    tenure: finiteMap(s.tenure),
    onsetPop: finiteMap(s.onsetPop),
    warLoss: finiteMap(s.warLoss)
  };
}

/**
 * Load (once) the persisted violence state into the module cache.
 * @returns {ViolenceState} The state.
 */
function state() {
  resetCachesOnNewGame();
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
    // Prefer the owner:id pair directly off the component id: ComponentID.toBitfield does NOT reliably
    // yield a number/string for a CITY component id. Fall back to the bitfield only if owner:id is unavailable.
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


/** @returns {number} The minor-violence multiplier, clamped to 0..1. */
function minorScale() {
  const n = Number(CONFIG.minorViolenceScale);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 1;
}

/** @returns {number} The major-war violence multiplier, clamped to 0..2 (1 = the measured war balance). */
function majorScale() {
  const n = Number(CONFIG.majorViolenceScale);
  return Number.isFinite(n) ? Math.max(0, Math.min(2, n)) : 1;
}

/**
 * Who is attacking this city, where that answer came from, and whether every one of them is a minor power
 * (city-state or Independent Power). Minor-only requires POSITIVE evidence; an empty or unreadable set
 * counts as a major war so a failed read never downgrades a real invasion. Sources, best first, each used
 * only when the one above names nobody: combat events (struck), hostile units beside the districts
 * (units), an overrun district's holder (district), then the at-war list (atwar; `isAtWarWith` is true
 * for EVERY Independent Power, so it only says whether any MAJOR is at war with the owner).
 * @param {*} city A live city object. @param {number[]} struck Attackers from this observation's events.
 * @returns {{minorsOnly:boolean, source:string, named:number[]}} The decision and its basis.
 */
function attackerVerdict(city, struck) {
  const owner = city && typeof city.owner === "number" ? city.owner : -1;
  /** @type {Array<[string, () => Iterable<number>]>} */
  const sources = [
    ["struck", () => struck || []],
    ["units", () => attackersNear(city)],
    ["district", () => besiegingPlayers(city)],
    ["atwar", () => (owner >= 0 ? warOpponents(owner) || [] : [])]
  ];
  for (const [source, read] of sources) {
    /** @type {number[]} */
    let named = [];
    try {
      named = [...read()];
    } catch (_) {
      named = [];
    }
    if (named.length) return { minorsOnly: named.every((pid) => isMinor(pid)), source, named };
  }
  return { minorsOnly: false, source: "none", named: [] };
}

/**
 * Whether a player id is a minor power. Unknown ids count as MAJOR, so an unreadable attacker never
 * downgrades the pressure.
 * @param {number} pid Player id. @returns {boolean} True when minor.
 */
function isMinor(pid) {
  try {
    const p = typeof Players !== "undefined" ? Players.get?.(pid) : null;
    if (!p) return false;
    return p.isMajor === false || p.isMinor === true;
  } catch (_) {
    return false;
  }
}

/**
 * Fold this turn's polled signals into a city's intensity: a spike for fresh district damage, a
 * standing term while the city center stays hurt, and a per-pillaged-tile term. Never touches
 * population: pillaging applies pressure only.
 * @param {ViolenceState} s State.
 * @param {string} key City key.
 * @param {*} city A live city object.
 */
function applyObservation(s, key, city) {
  const frac = districtDamageFrac(city);
  const fresh = Math.max(0, frac - (s.lastFrac[key] || 0));
  // Standing siege pressure while the city center is under attack: scaled by damage, with a FLOOR
  // (`siegeBesiegedFloor` < 1) the moment it's besieged so a raid registers without instantly crossing
  // the flee threshold. Facing only minor powers, the floor drops and the observation is scaled down.
  const besieged = districtBesieged(city);
  const pillaged = pillagedCount(city);
  // Taken, not peeked: every combat event reaches this model exactly once, whenever in the turn it landed.
  const ev = takeCombatEvidence(key);
  if (isQuiet(frac, besieged, pillaged, ev)) {
    s.lastFrac[key] = frac;
    return;
  }
  const verdict = attackerVerdict(city, ev.attackers);
  // The STRONGER of the two damage readings, never their sum: both describe the same wounds, and the max
  // lets each cover the other's blind spot (repaired-between-samples vs detached-handler gaps).
  const obs = { harm: Math.max(fresh, ev.dmg), frac, besieged, pillaged, ev };
  const addFull = scoreObservation(obs, false);
  const add = verdict.minorsOnly ? scoreObservation(obs, true) : addFull;
  const before = s.byCity[key] || 0;
  if (add > 0) s.byCity[key] = before + add;
  s.lastFrac[key] = frac;
  auditObservation(key, before, { turn: gameTurn(), owner: city.owner, add, addFull, ...verdict });
}

/**
 * How much one observation adds to a city's intensity.
 * @param {{harm:number, frac:number, besieged:boolean, pillaged:number, ev:*}} o The observation.
 * @param {boolean} minor Score it as a minor-power raid (its own besieged floor and scale) rather than a war with a
 *   major civilization (the ordinary floor and majorViolenceScale). Unknown attackers are scored as a major war.
 * @returns {number} The intensity to add.
 */
function scoreObservation(o, minor) {
  const floor = minor ? CONFIG.minorSiegeBesiegedFloor : CONFIG.siegeBesiegedFloor;
  const siegeFrac = Math.max(o.frac, o.besieged ? floor : 0);
  let add = CONFIG.vwAssault * o.harm + CONFIG.vwSiege * siegeFrac + CONFIG.vwPillage * o.pillaged;
  // Fighting and dying are separate evidence from structural damage, and nothing polled can see either: a
  // field battle that routs a defending army terrifies a city without scratching a single district.
  add += (Number(CONFIG.vwBattle) || 0) * o.ev.battles + (Number(CONFIG.vwCasualty) || 0) * o.ev.kills;
  return add * (minor ? minorScale() : majorScale());
}

/**
 * Whether nothing worth weighing happened to a city this turn. This early exit keeps the attacker scan
 * (units on ~20-40 plots) off every city at peace. The event evidence is part of the test because a
 * battle in a city's fields leaves every polled signal clean.
 * @param {number} frac Polled district damage. @param {boolean} besieged The besieged flag.
 * @param {number} pillaged Pillaged tiles. @param {*} ev This turn's combat-event evidence.
 * @returns {boolean} True when there is nothing to score.
 */
function isQuiet(frac, besieged, pillaged, ev) {
  return frac <= 0 && !besieged && pillaged <= 0 && ev.dmg <= 0 && ev.battles <= 0 && ev.kills <= 0;
}

/**
 * Update a city's siege tenure once per turn: at/above the flee threshold, increment the consecutive-turn
 * counter and capture the onset population on the first such turn; below it, the siege has lifted and
 * the tenure bookkeeping is cleared. Only runs under the warSiege model.
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
 * The siege escalation multiplier for a city's violence penalty: ramps from `siegeFloor` at tenure 1 to
 * 1.0 after `siegeRampTurns`, and drops to 0 once the city has lost `siegeLossCapPct` of its onset
 * population so the remnant digs in. Returns 1 when warSiege is off or the city key is unreadable.
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
  const key = keyFromCID(city?.id);
  if (!key) return;
  auditRefugee(key);
  if (!CONFIG.warSiege) return;
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
  // Game.turn resets to a low value at each age boundary; rebase the decay clock so decay resumes
  // instead of sitting pinned at elapsed 0 for the rest of the age.
  if (turn < s.decayTurn) s.decayTurn = turn;
  const elapsed = Math.max(0, turn - s.decayTurn);
  if (elapsed > 0) {
    const factor = Math.pow(speedDecay(CONFIG.violenceDecay), elapsed);
    auditDecay(factor);
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

/**
 * Publish the balance audit on `globalThis.EmigrationViolence`, so a probe can compare each city's real
 * intensity with the audit's reference scoring. Read-only; nothing here affects gameplay.
 */
export function exposeViolenceAudit() {
  try {
    const g = /** @type {*} */ (globalThis);
    g.EmigrationViolence = Object.assign(g.EmigrationViolence || {}, {
      snapshot: () => auditSnapshot((key) => {
        const v = state().byCity[key];
        return typeof v === "number" && isFinite(v) ? v : 0;
      }),
      threshold: () => CONFIG.violenceFleeThreshold,
      config: () => ({
        minorViolenceScale: CONFIG.minorViolenceScale,
        majorViolenceScale: CONFIG.majorViolenceScale,
        minorSiegeBesiegedFloor: CONFIG.minorSiegeBesiegedFloor,
        siegeBesiegedFloor: CONFIG.siegeBesiegedFloor,
        warSurgeMax: CONFIG.warSurgeMax
      })
    });
  } catch (_) {
    /* publishing the audit must never affect the model */
  }
}
