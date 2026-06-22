// emigration-combat.js
//
// Per-civ COMBAT-LOSS intensity: a decaying count of the units a civ has recently lost, from the base
// game's `UnitRemovedFromMap` event (its payload's `unit` ComponentID carries the owner). It feeds the
// war-SEVERITY term (emigration-engine.crisisSeverity) so a civ that's bleeding its army in the field —
// not just taking city damage — dies harder. Bounded + decaying, so it reflects RECENT losses, and it
// only matters while a city is already in crisis (severity gates on distress), so peacetime disbands
// can't cause deaths. Persisted under its own GameConfiguration key (additive; old saves start empty).

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { speedDecay } from "/emigration/ui/emigration-game-speed.js";

const STATE_KEY = "EmigrationCombat_v1";

/** @typedef {{ byCiv: Record<string, number>, decayTurn: number }} CombatState */

/** @type {CombatState | null} */
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
 * The raw persisted state string, or null.
 * @returns {string|null} Stored JSON, or null.
 */
function rawStored() {
  const g = Configuration?.getGame?.();
  const v = g && typeof g.getValue === "function" ? g.getValue(STATE_KEY) : null;
  return typeof v === "string" && v.length ? v : null;
}

/**
 * The persisted combat-loss state, or null when absent/unreadable.
 * @returns {CombatState|null} Parsed state, or null.
 */
function readStored() {
  try {
    const raw = rawStored();
    const o = raw ? JSON.parse(raw) : null;
    if (o && typeof o === "object") return { byCiv: o.byCiv || {}, decayTurn: o.decayTurn || gameTurn() };
  } catch (_) {
    /* ignore */
  }
  return null;
}

/**
 * Load (once) the persisted combat-loss state.
 * @returns {CombatState} State.
 */
function state() {
  if (!_state) _state = readStored() || { byCiv: {}, decayTurn: gameTurn() };
  return _state;
}

/** Persist the combat-loss state to GameConfiguration. */
function persist() {
  try {
    Configuration?.editGame?.()?.setValue?.(STATE_KEY, JSON.stringify(_state));
  } catch (_) {
    /* ignore */
  }
}

/**
 * Record one unit lost by a civ (from a UnitRemovedFromMap event). The owner comes off the removed
 * unit's ComponentID. No-op for an unreadable owner.
 * @param {*} cid The removed unit's ComponentID ({owner, id}).
 */
export function recordUnitLost(cid) {
  const owner = cid && typeof cid.owner === "number" ? cid.owner : null;
  if (owner == null) return;
  const s = state();
  s.byCiv[owner] = (s.byCiv[owner] || 0) + 1;
  persist();
}

/**
 * Decay every civ's combat-loss intensity toward zero for the turns elapsed since the last tick
 * (idempotent within a turn), dropping negligible values. Call once per pass before reading.
 */
export function tickCombat() {
  const s = state();
  const turn = gameTurn();
  const elapsed = Math.max(0, turn - s.decayTurn);
  if (elapsed > 0) {
    const factor = Math.pow(speedDecay(CONFIG.combatDecay), elapsed);
    for (const k of Object.keys(s.byCiv)) {
      const v = s.byCiv[k] * factor;
      if (v < 0.05) delete s.byCiv[k];
      else s.byCiv[k] = v;
    }
    s.decayTurn = turn;
  }
  persist();
}

/**
 * A civ's recent combat-loss intensity (decaying count of units lost), 0 when none.
 * @param {number} pid Civ id.
 * @returns {number} Combat-loss intensity (>= 0).
 */
export function combatLossFor(pid) {
  if (typeof pid !== "number") return 0;
  return state().byCiv[pid] || 0;
}
