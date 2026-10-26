// emigration-prescribe.js
//
// What would stop people leaving a settlement, in game terms. The readout already says why they go; this says
// how much Food, Production or Happiness the settlement would need before nobody is drawn away, and which
// building of this age gives that yield. The arithmetic is the prosperity model's own: a settlement loses
// people while its best destination pulls harder than it holds (`bestDestination().adjusted` > 0), and raising
// its own base score by that much closes the gap. Pure given its seams.

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { bestDestination } from "/emigration/ui/emigration-pull.js";
import { fieldContext, prosperity } from "/emigration/ui/emigration-prosperity.js";

/** The yields a settlement can be told to raise, in the order they are offered. */
export const FIX_YIELDS = ["YIELD_FOOD", "YIELD_PRODUCTION", "YIELD_HAPPINESS"];
/** The signal field each yield lives in. */
/** @type {Record<string, string>} */
const FIELD = { YIELD_FOOD: "food", YIELD_PRODUCTION: "production", YIELD_HAPPINESS: "happiness" };
/** Beyond this the number is no advice ("+80 Food"), so the yield is left out. */
const MAX_STEP = 60;

/**
 * @typedef {Object} Fix
 * @property {number} gap How much harder the best destination pulls than the settlement holds.
 * @property {{yield:string, amount:number, building:string|null, buildingGives:number}[]} options The smallest
 *   whole amount of each yield that would close the gap, with the age's building that gives most of it.
 */

/**
 * The smallest whole amount of one yield that raises a settlement's score by at least `gap`.
 * @param {*} sig The settlement's signal. @param {string} yieldKey @param {number} gap @param {*} ctx
 * @returns {number} The amount, or 0 when MAX_STEP isn't enough.
 */
export function amountToClose(sig, yieldKey, gap, ctx) {
  const field = FIELD[yieldKey];
  const base = prosperity(sig, ctx);
  for (let k = 1; k <= MAX_STEP; k++) {
    const s = { ...sig, [field]: (Number(sig[field]) || 0) + k };
    if (prosperity(s, ctx) - base >= gap) return k;
  }
  return 0;
}

/**
 * The building of the current age that gives the most of a yield, from the game's own data.
 * @param {string} yieldKey @param {string} ageType The current AgeType.
 * @returns {{name:string, gives:number}|null}
 */
export function bestBuildingFor(yieldKey, ageType) {
  try {
    if (typeof GameInfo === "undefined") return null;
    /** @type {{name:string, gives:number}|null} */
    let best = null;
    for (const row of GameInfo.Constructible_YieldChanges) {
      const def = buildingOfAge(row, yieldKey, ageType);
      if (def && (!best || row.YieldChange > best.gives)) best = { name: def.Name, gives: row.YieldChange };
    }
    return best;
  } catch (_) {
    return null;
  }
}

/**
 * The building a yield-change row belongs to, when it gives that yield and is a building of that age; else null.
 * @param {*} row A Constructible_YieldChanges row. @param {string} yieldKey @param {string} ageType @returns {*}
 */
function buildingOfAge(row, yieldKey, ageType) {
  if (row.YieldType !== yieldKey || !(row.YieldChange > 0)) return null;
  const def = GameInfo.Constructibles.lookup(row.ConstructibleType);
  return def && def.ConstructibleClass === "BUILDING" && def.Age === ageType ? def : null;
}

/** @returns {string} The live AgeType, or "". */
function liveAgeType() {
  try {
    const row = GameInfo.Ages.lookup(Game.age);
    return row && typeof row.AgeType === "string" ? row.AgeType : "";
  } catch (_) {
    return "";
  }
}

/**
 * What would stop people leaving: null when nobody is drawn away (no destination, or none that pulls harder
 * than the settlement holds), else the gap and the yields that would close it.
 * @param {*} sig The settlement's signal. @param {*[]} ranked Every settlement's signal this pass.
 * @param {*} ownerPop Per-owner populations. @param {(y:string, age:string)=>*} [buildingFor] Test seam.
 * @returns {Fix|null}
 */
export function prescribe(sig, ranked, ownerPop, buildingFor) {
  if (!sig || !Array.isArray(ranked) || !CONFIG.readoutPrescribe) return null;
  const best = bestDestination(sig, ranked, ownerPop);
  if (!best || !(best.adjusted > 0)) return null;
  // The cheapest two: on real cities a gap of 10 reads "+23 Food or +23 Production or +4 Happiness", and the
  // number a player can act on is the small one (watched 2026-10-25, Exploration seed 4242).
  const options = fixOptions(sig, ranked, best.adjusted, buildingFor || bestBuildingFor)
    .sort((a, b) => a.amount - b.amount).slice(0, 2);
  return options.length ? { gap: best.adjusted, options } : null;
}

/**
 * The yields that would close a gap, each with the age's best building for it.
 * @param {*} sig @param {*[]} ranked @param {number} gap @param {(y:string, age:string)=>*} lookup
 * @returns {Fix["options"]}
 */
function fixOptions(sig, ranked, gap, lookup) {
  const ctx = fieldContext(ranked);
  const age = liveAgeType();
  /** @type {Fix["options"]} */
  const options = [];
  for (const y of FIX_YIELDS) {
    const amount = amountToClose(sig, y, gap, ctx);
    if (!(amount > 0)) continue;
    const b = lookup(y, age);
    options.push({ yield: y, amount, building: b ? b.name : null, buildingGives: b ? b.gives : 0 });
  }
  return options;
}
