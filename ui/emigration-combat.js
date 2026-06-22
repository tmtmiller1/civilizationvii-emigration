// emigration-combat.js
//
// War-casualty input to the war-SEVERITY term (emigration-engine.crisisSeverity). The Demographics mod
// OWNS the raw tracking — it already accumulates per-civ unit-kill STRENGTH from the engine's
// `UnitKilledInCombat` event and exposes it on `globalThis.DemographicsData.casualtyCumFor(pid)`
// (cumulative). This module just turns that cumulative figure into a decaying "recent casualty
// intensity": each turn it folds in the new casualties since last turn and decays the rest, so a civ
// that's currently bleeding its army scores high and an old, settled war fades. Returns 0 when
// Demographics isn't providing data, so severity gracefully falls back to damage + participants only.

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { speedDecay } from "/emigration/ui/emigration-game-speed.js";

/** @type {Record<number, {turn:number, cum:number, intensity:number}>} Per-civ derived state. */
const _track = {};

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
 * The Demographics mod's cumulative unit-kill strength for a civ, or 0 when Demographics isn't
 * exposing it (not installed / not yet loaded).
 * @param {number} pid Civ id.
 * @returns {number} Cumulative casualty strength.
 */
function casualtyCum(pid) {
  try {
    const D = /** @type {*} */ (globalThis).DemographicsData;
    return D && typeof D.casualtyCumFor === "function" ? D.casualtyCumFor(pid) || 0 : 0;
  } catch (_) {
    return 0;
  }
}

/**
 * A civ's RECENT combat-loss intensity (decaying running sum of casualty strength), derived lazily
 * from the Demographics cumulative tally. Idempotent within a turn (the first read each turn folds in
 * the delta and decays; later reads return the same value).
 * @param {number} pid Civ id.
 * @returns {number} Recent casualty intensity (>= 0).
 */
export function combatLossFor(pid) {
  if (typeof pid !== "number") return 0;
  const cum = casualtyCum(pid);
  const turn = gameTurn();
  const t = _track[pid];
  if (!t) {
    _track[pid] = { turn, cum, intensity: 0 }; // first sighting → baseline only (no phantom spike)
    return 0;
  }
  if (turn > t.turn) {
    const factor = Math.pow(speedDecay(CONFIG.combatDecay), turn - t.turn);
    t.intensity = t.intensity * factor + Math.max(0, cum - t.cum);
    t.turn = turn;
    t.cum = cum;
  }
  return t.intensity;
}
