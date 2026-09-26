// emigration-combat.js
//
// War-casualty input to the war-SEVERITY term. The Demographics mod owns the raw tracking
// (`globalThis.DemographicsData.casualtyCumFor(pid)`, cumulative); this module turns that figure into
// a decaying "recent casualty intensity". Returns 0 when Demographics isn't providing data.

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
  // Rebase down on an age-boundary Game.turn reset so `turn > t.turn` can fire again and the
  // decay/delta fold resumes instead of stalling until the turn climbs back.
  if (t && turn < t.turn) t.turn = turn;
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
