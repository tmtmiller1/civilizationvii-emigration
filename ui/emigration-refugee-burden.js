// emigration-refugee-burden.js
//
// Per-turn burden from refugee holding pools, separate from assimilation. While refugees remain in
// holding, the owner pays a temporary support cost each turn (happiness/gold), proportional to the
// number currently held.

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { refugeePoolTotalForOwner } from "/emigration/ui/emigration-refugee-pool.js";
import { registerCacheReset, resetCachesOnNewGame } from "/emigration/ui/emigration-cache-reset.js";

const STATE_KEY = "EmigrationRefugeeBurden_v1";

/** @type {{tickedTurn: Record<string, number>} | null} */
let _state = null;
registerCacheReset(() => { _state = null; });

function gameTurn() {
  try {
    return typeof Game !== "undefined" && typeof Game.turn === "number" ? Game.turn : 0;
  } catch (_) {
    return 0;
  }
}

function readStored() {
  const g = Configuration?.getGame?.();
  const v = g && typeof g.getValue === "function" ? g.getValue(STATE_KEY) : null;
  return typeof v === "string" && v.length ? v : null;
}

function state() {
  resetCachesOnNewGame();
  if (_state) return _state;
  try {
    const raw = readStored();
    const o = raw ? JSON.parse(raw) : null;
    if (o && typeof o === "object" && o.tickedTurn && typeof o.tickedTurn === "object") {
      _state = { tickedTurn: o.tickedTurn };
      return _state;
    }
  } catch (_) {
    /* ignore */
  }
  _state = { tickedTurn: {} };
  return _state;
}

function persist() {
  try {
    Configuration?.editGame?.()?.setValue?.(STATE_KEY, JSON.stringify(_state));
  } catch (_) {
    /* ignore */
  }
}

/** @param {number} pid @param {string} yieldKey @param {number} amount */
function deduct(pid, yieldKey, amount) {
  if (!(amount < 0)) return;
  try {
    const yt = typeof YieldTypes !== "undefined" ? YieldTypes[yieldKey] : undefined;
    if (yt != null && typeof Players?.grantYield === "function") {
      Players.grantYield(pid, yt, amount);
    }
  } catch (_) {
    /* ignore */
  }
}

/**
 * Current refugee-holding burden for a civ, without mutating state.
 * @param {number} pid Player id.
 * @returns {{pool:number, happiness:number, gold:number}} Current burden values.
 */
export function refugeeBurdenFor(pid) {
  if (!CONFIG.refugeePoolEnabled || !CONFIG.refugeePoolBurdenEnabled || typeof pid !== "number") {
    return { pool: 0, happiness: 0, gold: 0 };
  }
  const pool = refugeePoolTotalForOwner(pid);
  if (!(pool > 0)) return { pool: 0, happiness: 0, gold: 0 };
  return {
    pool,
    happiness: pool * CONFIG.refugeePoolBurdenHappinessPerPoint,
    gold: pool * CONFIG.refugeePoolBurdenGoldPerPoint
  };
}

/**
 * Apply one turn of refugee-holding burden for a civ (idempotent within the same turn).
 * @param {number} pid Player id.
 * @returns {{pool:number, happiness:number, gold:number}} Charged burden values.
 */
export function tickRefugeeBurden(pid) {
  const none = { pool: 0, happiness: 0, gold: 0 };
  if (typeof pid !== "number") return none;
  const s = state();
  const turn = gameTurn();
  if (s.tickedTurn[pid] === turn) return none;
  s.tickedTurn[pid] = turn;
  const out = refugeeBurdenFor(pid);
  if (out.pool > 0) {
    deduct(pid, "YIELD_HAPPINESS", -out.happiness);
    deduct(pid, "YIELD_GOLD", -out.gold);
  }
  persist();
  return out;
}
