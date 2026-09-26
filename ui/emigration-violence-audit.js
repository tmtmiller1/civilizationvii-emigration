// emigration-violence-audit.js
//
// A running audit of the minor-power downgrade in the violence model. For every observed city it keeps
// a COUNTERFACTUAL intensity (every observation scored at full strength, no minor-power scaling) fed
// the same observations and decay as the real one, so the only difference is the downgrade itself.
// Also records each city's most recent observation and its war-refugee count. Changes no gameplay;
// in-memory only, published on `globalThis.EmigrationViolence` so a probe can read the live instance.

/**
 * @typedef {{turn:number, owner:number, minorsOnly:boolean, source:string, named:number[],
 *   add:number, addFull:number}} Observation
 */

/** @type {Map<string, number>} Counterfactual intensity per city: the same observations, never downgraded. */
const _full = new Map();
/** @type {Map<string, Observation>} The most recent scored observation per city. */
const _last = new Map();
/** @type {Map<string, number>} War refugees who actually left each city since load. */
const _refugees = new Map();
/** @type {Map<string, number>} Observations scored as minor-only, per city, since load. */
const _minorObs = new Map();

/** Below this the real model drops a city's intensity; the counterfactual follows the same rule. */
const NEGLIGIBLE = 0.05;

/**
 * Record one scored observation.
 * @param {string} key City key. @param {number} actualBefore The real intensity before this observation.
 * @param {Observation} obs What was decided and how much it added, with and without the downgrade.
 */
export function auditObservation(key, actualBefore, obs) {
  // Seed from the real value the first time a city is seen, so a save loaded mid-war starts both figures
  // level. Without this every city with persisted intensity would begin with a counterfactual of zero and
  // look as though the downgrade had INCREASED its pressure.
  const base = _full.has(key) ? /** @type {number} */ (_full.get(key)) : Math.max(0, actualBefore);
  _full.set(key, base + Math.max(0, obs.addFull));
  _last.set(key, obs);
  if (obs.minorsOnly) _minorObs.set(key, (_minorObs.get(key) || 0) + 1);
}

/**
 * Decay the counterfactual exactly as the real intensity decays.
 * @param {number} factor The per-tick decay factor the real model applied.
 */
export function auditDecay(factor) {
  for (const [key, v] of _full) {
    const next = v * factor;
    if (next < NEGLIGIBLE) _full.delete(key);
    else _full.set(key, next);
  }
}

/**
 * Count one war refugee leaving a city.
 * @param {string} key City key.
 */
export function auditRefugee(key) {
  if (key) _refugees.set(key, (_refugees.get(key) || 0) + 1);
}

/**
 * Every audited city as a flat row.
 * @param {(key:string) => number} actualOf Reads a city's real current intensity.
 * @returns {Array<{key:string, intensity:number, counterfactual:number, refugees:number, minorObs:number,
 *   last:Observation|null}>} One row per city the audit has seen.
 */
export function auditSnapshot(actualOf) {
  const keys = new Set([..._full.keys(), ..._last.keys(), ..._refugees.keys()]);
  return [...keys].map((key) => {
    const intensity = actualOf(key);
    return {
      key,
      intensity,
      // A city whose counterfactual decayed away while nothing new was observed holds no more than its real
      // value; reporting zero there would show the downgrade as an increase.
      counterfactual: _full.has(key) ? /** @type {number} */ (_full.get(key)) : intensity,
      refugees: _refugees.get(key) || 0,
      minorObs: _minorObs.get(key) || 0,
      last: _last.get(key) || null
    };
  });
}

/** Test seam: forget everything. */
export function _resetAudit() {
  _full.clear();
  _last.clear();
  _refugees.clear();
  _minorObs.clear();
}
