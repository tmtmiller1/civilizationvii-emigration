// emigration-refugee-staging.js
//
// Shared refugee staging helpers: source-side re-shed behavior and destination-side pool settlement.

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { originMixForCity } from "/emigration/ui/emigration-composition.js";
import { addRural, removeRural } from "/emigration/ui/emigration-population.js";
import { departureWouldAbandonTile } from "/emigration/ui/emigration-departure-tile.js";
import { arriveRural } from "/emigration/ui/emigration-arrival-placement.js";
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
  // Final avalanche (murmur3 fmix32): FNV alone barely changes its high bits when only the tail of the seed changes.
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 0x100000000;
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
 * @returns {{ok:boolean, fromPool:boolean, originCiv?:number, since?:number,
 *   deferredTile?:boolean}} The consume result.
 */
export function consumeSourcePoint(src, cause) {
  if (CONFIG.refugeePoolEnabled && isRefugeeCause(cause) && refugeePoolTotal(src.key) > 0) {
    const one = consumeOneForReshed(src.key);
    if (one) return { ok: true, fromPool: true, originCiv: one.originCiv, since: one.since };
  }
  // Rural exhausted: nothing leaves (the urban core is never taken; see emigration-departure-tile.js).
  if ((src.rural || 0) <= CONFIG.minRuralToEmigrate) return { ok: false, fromPool: false };
  // Tile abandonment (departure-tile.js) cannot be undone, so the engine write is DEFERRED: reserve the
  // point in the signal now; commitSourcePoint destroys the tile once the destination has accepted it.
  if (departureWouldAbandonTile(src.city)) {
    src.rural -= 1;
    src.population -= 1;
    return { ok: true, fromPool: false, deferredTile: true };
  }
  if (!removeRural(src.city)) return { ok: false, fromPool: false };
  src.rural -= 1;
  src.population -= 1;
  return { ok: true, fromPool: false };
}

/**
 * Who is leaving, as origin civ → fraction: a held refugee is their own recorded origin; anyone else is a
 * slice of the source settlement's mix (ethnicity audit item 2). Undefined when the mix is unreadable, and
 * the ledger then counts the migrant as the source owner's people, as it always did.
 * @param {*} src Source signal.
 * @param {{fromPool:boolean, originCiv?:number}} consumed Where the point came from.
 * @returns {Record<string, number>|undefined} The mix.
 */
export function departingMix(src, consumed) {
  if (consumed.fromPool && typeof consumed.originCiv === "number") return { [consumed.originCiv]: 1 };
  try {
    return originMixForCity(src.city);
  } catch (_) {
    return undefined;
  }
}

/**
 * Release a deferred tile reservation (nothing was written to the engine yet).
 * @param {*} src Source signal.
 */
function releaseReservation(src) {
  src.population += 1;
  src.rural += 1;
}

/**
 * Undo a source-point consume when destination-side commit fails.
 * @param {*} src Source signal.
 * @param {{ok:boolean, fromPool:boolean, originCiv?:number, since?:number,
 *   deferredTile?:boolean}} consumed Consume result.
 */
export function undoSourceConsume(src, consumed) {
  if (!consumed.ok) return;
  if (consumed.deferredTile) {
    releaseReservation(src);
    return;
  }
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
  // Anti-Immigration throttles refugee SETTLEMENT too (on top of the border turn-away in the pull
  // path), so a closed civ absorbs its holding pool more slowly. Floored on the same `opennessFloor`
  // the pull path uses, so the two stages share one floor (never hard-zeros pool drain).
  if (CONFIG.bordersEnabled) b *= Math.max(CONFIG.opennessFloor, immigrationOpenness(sig.owner));
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
      if (!arriveRural(sig.city, { kind: "refugee" })) break;
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

// Test hook: the pure per-city settlement-budget computation.
export const __test = { refugeeSettlementBudget };
