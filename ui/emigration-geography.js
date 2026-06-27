// emigration-geography.js
//
// The geographic shaping of where emigrants go. Two effects, both added to a
// destination's pull in the engine:
//
//   1. Distance decay - people prefer nearer settlements (own civ or foreign),
//      so migration stays regional instead of teleporting across the map. A flat
//      penalty proportional to the hex distance between source and destination.
//
//   2. Directional flight from an invader - when a city is under attack, its
//      people are pushed AWAY from the threat. We locate the nearest settlement
//      at war with the source's owner, take the unit vector pointing away from
//      it, and reward destinations that lie in that direction (and penalize ones
//      back toward the invader). This is the Mongol-invasion effect: an army
//      pressing from the east drives refugees west.
//
// Reads engine globals defensively: GameplayMap.getPlotDistance for hex
// distance, Players.get(...).Diplomacy.isAtWarWith for the per-pair war test,
// and city.location ({x, y}) for positions. Any unreadable input degrades to a
// neutral 0, never a throw.

import { CONFIG } from "/emigration/ui/emigration-config.js";

/**
 * A city's {x, y} hex location, or null if unreadable.
 * @param {*} sig A CitySignal.
 * @returns {{x:number, y:number}|null} The location, or null.
 */
function cityLoc(sig) {
  const l = sig?.city?.location;
  return l && typeof l.x === "number" && typeof l.y === "number" ? l : null;
}

/**
 * Hex distance between two signals' cities, or 0 if either is unreadable.
 * @param {*} a A CitySignal.
 * @param {*} b A CitySignal.
 * @returns {number} Hex distance (>= 0).
 */
export function hexDistance(a, b) {
  const la = cityLoc(a);
  const lb = cityLoc(b);
  if (!la || !lb) return 0;
  try {
    return GameplayMap.getPlotDistance(la.x, la.y, lb.x, lb.y);
  } catch (_) {
    return 0;
  }
}

/**
 * Whether player `a` is at war with player `b` (best-effort).
 * @param {number} a Player id.
 * @param {number} b Player id.
 * @returns {boolean} True if at war.
 */
export function atWarBetween(a, b) {
  try {
    return !!Players.get(a)?.Diplomacy?.isAtWarWith?.(b);
  } catch (_) {
    return false;
  }
}

/**
 * The location of the nearest settlement at war with the source's owner, or
 * null when the source has no locatable enemy. This is the threat origin the
 * source's people flee from.
 * @param {*} src Source signal.
 * @param {*[]} ranked All ranked signals.
 * @returns {{x:number, y:number}|null} The nearest enemy's location, or null.
 */
function nearestEnemyLoc(src, ranked) {
  let nearest = null;
  let best = Infinity;
  for (const o of ranked) {
    if (o.owner === src.owner || !atWarBetween(src.owner, o.owner)) continue;
    const d = hexDistance(src, o);
    if (d > 0 && d < best) {
      best = d;
      nearest = cityLoc(o);
    }
  }
  return nearest;
}

/**
 * The unit vector pointing AWAY from the nearest invader, for a source under
 * military threat, or null when the source isn't threatened / has no locatable
 * enemy. Drives the directional flight bias.
 * @param {*} src Source signal.
 * @param {*[]} ranked All ranked signals.
 * @returns {{x:number, y:number}|null} A unit "flee" vector, or null.
 */
export function fleeVector(src, ranked) {
  // Only cities actually under attack flee directionally - gate on accumulated
  // violence, not the empire merely being at war.
  if (!(src.violence >= CONFIG.violenceFleeThreshold)) return null;
  const here = cityLoc(src);
  if (!here) return null;
  const enemy = nearestEnemyLoc(src, ranked);
  if (!enemy) return null;
  const dx = here.x - enemy.x;
  const dy = here.y - enemy.y;
  const mag = Math.hypot(dx, dy);
  return mag > 0 ? { x: dx / mag, y: dy / mag } : null;
}

/**
 * Owner-preference for a war refugee (Feature 1): prefer the source's own civ, treat
 * the aggressor that attacked it as a last resort, leave neutral third parties
 * unchanged - so refugees rank own civ > others > aggressor.
 * @param {*} src Source signal.
 * @param {*} dest Destination signal.
 * @param {Set<number>} aggressors The source's recorded aggressors.
 * @returns {number} Signed pull adjustment.
 */
export function aggressorAdjust(src, dest, aggressors) {
  if (dest.owner === src.owner) return CONFIG.ownCivRefugeeBonus;
  if (aggressors.has(dest.owner)) return -CONFIG.aggressorPenalty;
  return 0;
}

/** Smoothstep on [0,1]. @param {number} x Input. @returns {number} Smoothed value. */
function smoothstep01(x) {
  const c = x < 0 ? 0 : x > 1 ? 1 : x;
  return c * c * (3 - 2 * c);
}

/**
 * How hard a threatened city flees DIRECTIONALLY, ramped smoothly from the flee threshold up to ~2×
 * it, instead of snapping to full strength the instant the threshold is crossed. Removes the "one bad
 * turn suddenly empties my city" cliff: just over the bar the directional tilt eases in; a heavy
 * assault still reaches full intensity. 0 at/below the threshold, 1 at ≥ 2× it.
 * @param {number} value The accumulated violence. @param {number} threshold The flee threshold.
 * @returns {number} Intensity in [0,1].
 */
function fleeIntensity(value, threshold) {
  if (!(threshold > 0)) return value > 0 ? 1 : 0;
  return smoothstep01((value - threshold) / threshold);
}

/**
 * The directional flight bonus for a move under `flee`: cosine of the angle between
 * the move and the flee direction × fleeFactor (+1 directly away from the invader,
 * −1 straight back toward them), ramped by {@link fleeIntensity} so it builds smoothly past the
 * threshold rather than as a binary gate. 0 when positions are unreadable.
 * @param {*} src Source signal.
 * @param {*} dest Destination signal.
 * @param {{x:number, y:number}} flee The flee unit vector.
 * @returns {number} The directional bonus.
 */
function fleeBonus(src, dest, flee) {
  const here = cityLoc(src);
  const there = cityLoc(dest);
  if (!here || !there) return 0;
  const mx = there.x - here.x;
  const my = there.y - here.y;
  const mag = Math.hypot(mx, my);
  if (!(mag > 0)) return 0;
  const intensity = fleeIntensity(src.violence || 0, CONFIG.violenceFleeThreshold);
  return CONFIG.fleeFactor * intensity * ((mx * flee.x + my * flee.y) / mag);
}

/**
 * The geographic delta added to a destination's pull: a distance-decay penalty
 * (always), an aggressor/own-civ owner preference for war refugees (when
 * `aggressors` is given), and a directional flight bonus when `flee` is set.
 * @param {*} src Source signal.
 * @param {*} dest Destination signal.
 * @param {{x:number, y:number}|null} flee The source's flee vector, or null.
 * @param {Set<number>|null} [aggressors] The source's aggressors (war refugees only).
 * @returns {number} The geographic adjustment (can be negative).
 */
export function geoAdjust(src, dest, flee, aggressors) {
  let g = -CONFIG.distanceFactor * hexDistance(src, dest);
  if (aggressors) g += aggressorAdjust(src, dest, aggressors);
  if (flee) g += fleeBonus(src, dest, flee);
  return g;
}

/**
 * Whether two civs have an active base-game Open Borders agreement - a diplomatic deal
 * (DIPLOMACY_ACTION_OPEN_BORDERS), distinct from the mod's Pro/Anti-Immigration policy
 * cards. Read defensively from the joint diplomatic-events API; false on any error.
 * @param {number} a Player id.
 * @param {number} b Player id.
 * @returns {boolean} True if an Open Borders agreement is active between them.
 */
export function hasOpenBordersDeal(a, b) {
  try {
    if (typeof Game === "undefined") return false;
    const events = Game?.Diplomacy?.getJointEvents?.(a, b, false);
    if (!events) return false;
    for (const e of events) {
      if (e && e.actionTypeName === "DIPLOMACY_ACTION_OPEN_BORDERS") return true;
    }
  } catch (_) {
    /* a failed diplomacy read must never break the pass */
  }
  return false;
}

/**
 * A modest cross-civ pull bonus when the destination civ shares an Open Borders agreement
 * with the source civ: migrants flow more freely between open-bordered civs (both
 * directions). 0 for same-civ moves, no agreement, or when the bonus is disabled.
 * @param {number} srcOwner Source civ player id.
 * @param {number} destOwner Destination civ player id.
 * @returns {number} The pull bonus (>= 0).
 */
export function openBordersBonus(srcOwner, destOwner) {
  if (srcOwner === destOwner || !CONFIG.openBordersBonus) return 0;
  return hasOpenBordersDeal(srcOwner, destOwner) ? CONFIG.openBordersBonus : 0;
}

/**
 * Whether two civs share an active base-game Alliance. Eases cross-civ migration as a Permeability
 * factor (§1 / Phase 4). Uses the engine's dedicated relationship-state method
 * `Players.get(a).Diplomacy.hasAllied(b)`, the base game detects a standing alliance this way (15+
 * call sites). The OLD code scanned `getJointEvents` for `DIPLOMACY_ACTION_FORM_ALLIANCE`, which is an
 * action enum used to *initiate* an alliance, NOT a value that persists in the joint events, so it
 * was always false and the alliance permeability never applied.
 * @param {number} a A player id.
 * @param {number} b Another player id.
 * @returns {boolean} True if an alliance is active.
 */
export function hasAlliance(a, b) {
  try {
    return !!Players?.get?.(a)?.Diplomacy?.hasAllied?.(b);
  } catch (_) {
    return false; // a failed diplomacy read must never break the pass
  }
}

/**
 * Whether two civs are at war (per-pair, best-effort). Dampens cross-civ migration (§1 / Phase 4).
 * @param {number} a A player id.
 * @param {number} b Another player id.
 * @returns {boolean} True if a is at war with b.
 */
export function atWar(a, b) {
  try {
    if (a === b) return false;
    return !!Players?.get?.(a)?.Diplomacy?.isAtWarWith?.(b);
  } catch (_) {
    return false;
  }
}
