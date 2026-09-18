// emigration-enclave-pacing.js
//
// PER-AGE PACING of Cultural Enclave formation, so a host civilization sees an enclave a reasonable number
// of times an age: at least one is made likely, more than the cap is impossible. The controller works on
// the OUTCOME, not on one input (integration, share, dwell) tuned blind:
//
//   relax = quarterPacingMax x clamp(ageProgress / quarterPacingBy, 0, 1)   while formedThisAge < target
//   relax = 0                                                                 once the target is met
//   blocked                                                                   once formedThisAge >= cap
//
// `relax` lowers every formation bar in proportion: the established share, the scaled size bar, and the
// dwell period all become bar x (1 - relax). With the defaults (max 0.4, by 0.6), a host that has formed
// nothing by 60% of the age is measured against 60% bars for the rest of it (0.30 share reads 0.18, a
// six-point size bar reads 3.6, eight dwell turns read five). The moment an enclave forms, the bars are
// back to full. The cap (`quarterCapPerAge`) closes the age for that host. Age progress is the engine's
// own progression points (the same read the Demographics scaler uses), so the pacing follows the real
// length of the age at any speed; when unreadable, relax is 0 and the plain bars apply.
//
// Pure over its inputs where it matters (`pacingRelax`); the live readers are thin and self-guarding.

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { formedThisAge } from "/emigration/ui/emigration-quarter-state.js";
import { currentAgeProgressPct } from "/emigration/ui/emigration-population.js";

/**
 * Clamp to [0, 1], non-finite as 0. @param {*} x The value. @returns {number} Unit.
 */
function unit(x) {
  const n = Number(x);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
}

/**
 * The relaxation fraction for one host. Pure.
 * @param {number} formed Enclaves this host has formed this age.
 * @param {number} target Enclaves per age the pacing aims for (0 disables the catch-up).
 * @param {number} progress Age progress as a fraction [0, 1].
 * @param {{max:number, by:number}} cfg Maximum relaxation, and the age fraction at which it is reached.
 * @returns {number} The relaxation in [0, max].
 */
export function pacingRelax(formed, target, progress, cfg) {
  const t = Math.max(0, Number(target) || 0);
  if (!(t > 0) || (Number(formed) || 0) >= t) return 0;
  const max = unit(cfg && cfg.max);
  const by = Number(cfg && cfg.by);
  if (!(max > 0)) return 0;
  const ramp = by > 0 ? unit(unit(progress) / by) : 1;
  return max * ramp;
}

/**
 * A bar reduced by the relaxation. Pure. @param {number} bar The bar. @param {number} relax The relaxation.
 * @returns {number} bar x (1 - relax), never below 0.
 */
export function relaxedBar(bar, relax) {
  const b = Number(bar);
  if (!Number.isFinite(b)) return 0;
  return Math.max(0, b * (1 - unit(relax)));
}

/**
 * The relaxed dwell period in whole turns, never below `floor`. Pure.
 * @param {number} turns The configured dwell. @param {number} relax The relaxation.
 * @param {number} [floor] Minimum (2).
 * @returns {number} Turns.
 */
export function relaxedDwell(turns, relax, floor) {
  const f = Number.isFinite(Number(floor)) ? Number(floor) : 2;
  const t = Math.max(0, Number(turns) || 0);
  if (t === 0) return 0;
  return Math.max(f, Math.round(t * (1 - unit(relax))));
}

/** Age progress as a fraction [0, 1], or 0 when unreadable. @returns {number} Fraction. */
export function ageProgressFraction() {
  try {
    const pct = currentAgeProgressPct();
    return typeof pct === "number" && Number.isFinite(pct) ? unit(pct / 100) : 0;
  } catch (_) {
    return 0;
  }
}

/**
 * The live relaxation for a host civilization this pass: 0 when pacing is off, the target is met, or the
 * age progress is unreadable.
 * @param {number} owner Host player id. @returns {number} The relaxation in [0, quarterPacingMax].
 */
export function relaxFor(owner) {
  if (!CONFIG.quarterPacingEnabled || typeof owner !== "number") return 0;
  return pacingRelax(formedThisAge(owner), CONFIG.quarterTargetPerAge, ageProgressFraction(), {
    max: CONFIG.quarterPacingMax, by: CONFIG.quarterPacingBy
  });
}

/**
 * Whether a host has reached the per-age cap and may form no more enclaves this age (0 = uncapped).
 * @param {number} owner Host player id. @returns {boolean} True when capped out.
 */
export function capReached(owner) {
  const cap = Math.max(0, Number(CONFIG.quarterCapPerAge) || 0);
  if (!(cap > 0) || typeof owner !== "number") return false;
  return formedThisAge(owner) >= cap;
}
