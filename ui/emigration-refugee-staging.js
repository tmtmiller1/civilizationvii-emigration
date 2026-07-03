// emigration-refugee-staging.js
//
// Shared refugee staging helpers: source-side re-shed behavior and destination-side pool settlement.

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { addRural, removeRural } from "/emigration/ui/emigration-population.js";
import { isRefugeeCause } from "/emigration/ui/emigration-causes.js";
import { immigrationOpenness } from "/emigration/ui/emigration-borders.js";
import { bumpRefugeesSettled } from "/emigration/ui/emigration-telemetry.js";
import {
  queueRefugees,
  consumeOneForReshed,
  refugeePoolTotal,
  refugeePoolEligible,
  consumeEligibleForSettlement
} from "/emigration/ui/emigration-refugee-pool.js";

/**
 * Deterministic [0,1) roll from a stable seed string.
 * @param {string} seed Stable seed.
 * @returns {number} Roll in [0,1).
 */
function roll01(seed) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return (h >>> 0) / 0xffffffff;
}

/**
 * Whether a refugee point settles immediately instead of entering holding.
 * @param {*} src Source signal.
 * @param {*} dest Destination signal.
 * @param {*} state Loaded state.
 * @param {string} cause Move cause.
 * @returns {boolean} True when the point settles immediately.
 */
export function immediateRefugeeSettlement(src, dest, state, cause) {
  if (!CONFIG.refugeePoolEnabled || !isRefugeeCause(cause)) return true;
  if (!(CONFIG.refugeeImmediateSettlePct > 0)) return false;
  if (CONFIG.refugeeImmediateSettlePct >= 1) return true;
  const seed = [src.key, dest.key, state.monoTurn, src.population, cause].join("|");
  return roll01(seed) < CONFIG.refugeeImmediateSettlePct;
}

/**
 * Remove one point from source-side availability: held refugees first (when fleeing a crisis), else
 * settled rural population.
 * @param {*} src Source signal.
 * @param {string} cause Move cause.
 * @returns {{ok:boolean, fromPool:boolean, originCiv?:number, since?:number}}
 */
export function consumeSourcePoint(src, cause) {
  if (CONFIG.refugeePoolEnabled && isRefugeeCause(cause) && refugeePoolTotal(src.key) > 0) {
    const one = consumeOneForReshed(src.key);
    if (one) return { ok: true, fromPool: true, originCiv: one.originCiv, since: one.since };
  }
  if (!removeRural(src.city)) return { ok: false, fromPool: false };
  src.rural -= 1;
  src.population -= 1;
  return { ok: true, fromPool: false };
}

/**
 * Undo a source-point consume when destination-side commit fails.
 * @param {*} src Source signal.
 * @param {{ok:boolean, fromPool:boolean, originCiv?:number, since?:number}} consumed Consume result.
 */
export function undoSourceConsume(src, consumed) {
  if (!consumed.ok) return;
  if (consumed.fromPool) {
    queueRefugees(
      src.key,
      typeof consumed.originCiv === "number" ? consumed.originCiv : src.owner,
      typeof consumed.since === "number" ? consumed.since : 0,
      1
    );
    return;
  }
  if (addRural(src.city)) {
    src.rural += 1;
    src.population += 1;
  }
}

/**
 * The per-city settlement budget from refugee holding pools this turn.
 * @param {*} sig City signal.
 * @returns {number} Points to settle.
 */
function refugeeSettlementBudget(sig) {
  if (!CONFIG.refugeePoolEnabled) return 0;
  let b = CONFIG.refugeePoolSettlePerCityPerTurn;
  if (!(b > 0)) return 0;
  b *= (sig.happiness || 0) >= 0 ? CONFIG.refugeePoolHappyScale : CONFIG.refugeePoolUnhappyScale;
  const over = Math.max(0, (sig.urban || 0) - CONFIG.overcrowdThreshold);
  if (over > 0 && CONFIG.refugeePoolOvercrowdPenalty > 0) {
    b *= Math.max(0.1, 1 - Math.min(0.9, over * CONFIG.refugeePoolOvercrowdPenalty));
  }
  if (CONFIG.bordersEnabled) b *= Math.max(0.25, immigrationOpenness(sig.owner));
  return Math.max(0, Math.floor(b));
}

/**
 * Settle eligible held refugees into city rural population at a bounded rate.
 * @param {*[]} ranked Ranked city signals.
 * @param {*} state Loaded emigration state.
 */
export function settleRefugeePools(ranked, state) {
  if (!CONFIG.refugeePoolEnabled) return;
  for (const sig of ranked || []) {
    if (!refugeePoolTotal(sig.key)) continue;
    let budget = refugeeSettlementBudget(sig);
    if (budget <= 0) continue;
    while (budget > 0) {
      if (!refugeePoolEligible(sig.key, state.monoTurn, CONFIG.refugeePoolMinHoldTurns)) break;
      if (!addRural(sig.city)) break;
      if (!consumeEligibleForSettlement(sig.key, state.monoTurn, CONFIG.refugeePoolMinHoldTurns)) {
        removeRural(sig.city);
        break;
      }
      sig.rural += 1;
      sig.population += 1;
      bumpRefugeesSettled(1); // P0.4 pool-outflow telemetry
      budget--;
    }
  }
}
