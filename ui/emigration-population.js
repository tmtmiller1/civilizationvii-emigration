// emigration-population.js
//
// Population read/write + the Demographics-aligned scaling that turns Civ's
// abstract population points (1, 2, 3, …) into historically representative
// people counts (thousands … hundreds of millions).
//
// The scaling formula is IDENTICAL to the Demographics mod's
// scaleCityPopulationAt(raw, turn) = raw^1.11 * 3000 * 1.009^turn, so a town's
// population reads the same in both mods, and a migration of one population
// point reports the marginal people that one point represents.

import { CONFIG } from "/emigration/ui/emigration-config.js";

/**
 * Scale a raw settlement population into a representative people count, matching
 * Demographics' scaleCityPopulationAt. `turn` should be a MONOTONIC turn (see
 * monotonicTurn) so the figure doesn't reset at age boundaries.
 * @param {number} raw Raw population points.
 * @param {number} turn Monotonic turn.
 * @returns {number} Scaled people count (0 for non-positive input).
 */
export function scaleCityPopulation(raw, turn) {
  if (typeof raw !== "number" || !isFinite(raw) || raw <= 0) return 0;
  const t = typeof turn === "number" && isFinite(turn) ? turn : 0;
  return Math.pow(raw, CONFIG.scaleExp) * CONFIG.scaleBase * Math.pow(CONFIG.scaleGrowth, t);
}

/**
 * The number of people represented by the pop-th population point at `pop`
 * (i.e. the marginal people who emigrate when population goes pop → pop-1).
 * @param {number} pop The population point in question.
 * @param {number} turn Monotonic turn.
 * @returns {number} Marginal people (>= 0).
 */
export function marginalPeople(pop, turn) {
  return Math.max(0, scaleCityPopulation(pop, turn) - scaleCityPopulation(pop - 1, turn));
}

/**
 * Format a people count the historical way: "12 thousand", "1.3 million",
 * "240 million", "1.1 billion".
 * @param {number} n People count.
 * @returns {string} Human-readable string.
 */
export function formatPeople(n) {
  if (typeof n !== "number" || !isFinite(n) || n <= 0) return "0";
  if (n >= 1e9) return (n / 1e9).toFixed(n >= 1e10 ? 0 : 1) + " billion";
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + " million";
  if (n >= 1e3) return Math.round(n / 1e3) + " thousand";
  return String(Math.round(n));
}

/**
 * Read a city's rural population defensively.
 * @param {*} city City object.
 * @returns {number} Rural population (0 if unreadable).
 */
export function ruralPop(city) {
  try {
    const r = city?.ruralPopulation;
    return typeof r === "number" && isFinite(r) ? r : 0;
  } catch (_) {
    return 0;
  }
}

/**
 * Read a city's total population defensively.
 * @param {*} city City object.
 * @returns {number} Total population (0 if unreadable).
 */
export function totalPop(city) {
  try {
    const p = city?.population;
    return typeof p === "number" && isFinite(p) ? p : 0;
  } catch (_) {
    return 0;
  }
}

/**
 * Move one rural population point from `source` to `dest`. Confirmed reachable
 * from the UI VM, including across civilizations (probe Q2). Returns whether the
 * move was applied.
 * @param {*} source Losing city.
 * @param {*} dest Gaining city.
 * @returns {boolean} True if both writes were attempted without throwing.
 */
export function moveRural(source, dest) {
  try {
    if (typeof source?.addRuralPopulation !== "function") return false;
    if (typeof dest?.addRuralPopulation !== "function") return false;
    source.addRuralPopulation(-1);
    dest.addRuralPopulation(1);
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Remove one rural population point from a city WITHOUT moving it anywhere - the outlet
 * for a trapped, distressed population with no refuge (attrition / death). Uses the same
 * rural-population accounting the game's own starvation shrinkage uses, so the world's
 * population genuinely drops. Returns whether the write was applied.
 * @param {*} city The city losing a point.
 * @returns {boolean} True if applied.
 */
export function removeRural(city) {
  try {
    if (typeof city?.addRuralPopulation !== "function") return false;
    city.addRuralPopulation(-1);
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Add one rural population point to a city WITHOUT taking it from anywhere - the
 * arrival half of a lagged migration (the departure used {@link removeRural} some
 * turns earlier; see the transit queue in emigration-engine.js). Returns whether the
 * write was applied.
 * @param {*} city The city gaining a point.
 * @returns {boolean} True if applied.
 */
export function addRural(city) {
  try {
    if (typeof city?.addRuralPopulation !== "function") return false;
    city.addRuralPopulation(1);
    return true;
  } catch (_) {
    return false;
  }
}
