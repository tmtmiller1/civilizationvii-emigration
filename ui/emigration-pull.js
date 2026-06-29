// emigration-pull.js
//
// The DECISION layer of the emigration algorithm (docs/immigration-interaction-plan.md §1):
// given a candidate (source, destination) pair, how strongly are people pulled from one to the
// other? Composed as two clamped channels over the prosperity gradient and friction:
//
//     pull = (gradient + TILT) - friction, then x PERMEABILITY
//
// TILT (targeted attraction: asylum refugee-push, raid targeting) is clamped to ±tiltCap;
// PERMEABILITY (border openness × cross-civ relationship factors) is clamped to [floor, ceil] ,
// so any stack of cards/agreements/ops composes without runaway. This module decides WHERE people
// want to go; emigration-engine.js executes the moves. Pure (no state mutation, no persistence).

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { fleeVector, geoAdjust, hasOpenBordersDeal, hasAlliance, atWar } from "/emigration/ui/emigration-geography.js";
import { immigrationOpenness, emigrationRetention, hasAsylum } from "/emigration/ui/emigration-borders.js";
import { raidTilt } from "/emigration/ui/emigration-raid.js";
import { congestionPenalty } from "/emigration/ui/emigration-effects.js";
import { warAggressors } from "/emigration/ui/emigration-war.js";

// When set, the openness/retention border multipliers are forced to neutral (1). The stance-impact
// counterfactual (emigration-engine.js) toggles this around a "what if borders were neutral?" plan;
// it is reset immediately after, so the real decision path always sees true stances.
let _neutralBorders = false;

/**
 * Force border multipliers neutral (for the stance-impact counterfactual) , or restore them.
 * @param {boolean} on Whether to neutralize border stance.
 */
export function setNeutralBorders(on) {
  _neutralBorders = !!on;
}

/** @typedef {import("/emigration/ui/emigration-causes.js").MigrationCause} MigrationCause */

/**
 * Classify why a source is shedding population, in precedence order: disaster distress, then
 * in-border violence (both gated on their flee thresholds), then , for an ordinary peacetime
 * departure , `unhappiness` if the city's net happiness is below `unhappyCauseThreshold` (a push)
 * vs `prosperity` if it's content but a neighbour out-prospers it (a pull). This is a reporting
 * split only; it never changes whether or where people move. `conquest` is reserved (a later phase
 * emits it on capture-driven displacement).
 * @param {*} src Source signal.
 * @returns {MigrationCause} The cause.
 */
export function migrationCause(src) {
  if ((src.disaster || 0) >= CONFIG.disasterFleeThreshold) return "disaster";
  if ((src.violence || 0) >= CONFIG.violenceFleeThreshold) return "war";
  if ((src.happiness || 0) < CONFIG.unhappyCauseThreshold) return "unhappiness";
  return "prosperity";
}

/**
 * Clamp `v` into [lo, hi].
 * @param {number} v Value.
 * @param {number} lo Lower bound.
 * @param {number} hi Upper bound.
 * @returns {number} The clamped value.
 */
function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * The TILT channel (§1): targeted attraction added to the prosperity gradient - "is something
 * pulling this specific person?". Currently the asylum refugee-push (§4a) and the raid targeting
 * (§4b). The caller clamps the total to ±`tiltCap`.
 * @param {*} src Source signal.
 * @param {*} dest Destination signal.
 * @returns {number} The targeted-attraction tilt (>= 0 today).
 */
function tiltFor(src, dest) {
  let tilt = 0;
  // Asylum (§4a): ease refugee-caused pull toward a civ holding an asylum card, scaled by the
  // source's distress so it prefers the most desperate sources. Economic migration is untouched.
  const cause = migrationCause(src);
  if ((cause === "war" || cause === "disaster") && hasAsylum(dest.owner)) {
    tilt += CONFIG.asylumPushWeight * ((src.violence || 0) + (src.disaster || 0));
  }
  // Raid (§4b): pull the target's people toward the raider while an op is active.
  tilt += raidTilt(src.owner, dest.owner);
  return tilt;
}

/**
 * The PERMEABILITY channel (§1): "how easily does anyone cross from src to dest?" , the border
 * openness multiplier times every cross-civ relationship factor (Open Borders, alliance, war). The
 * caller clamps the product to [permeFloor, permeCeil] so any stack of agreements stays bounded.
 * @param {*} src Source signal.
 * @param {*} dest Destination signal.
 * @returns {number} A positive multiplier.
 */
function permeability(src, dest) {
  let p = opennessFor(dest);
  if (src.owner !== dest.owner) {
    // Closed Borders RETAINS your own people: the source civ's stance dampens how easily its
    // citizens are pulled across to a RIVAL civ (internal moves don't lose you population, so
    // retention is cross-civ only). The mirror of the destination's inbound openness.
    p *= retentionFor(src);
    // Every cross-civ "easing" is a FACTOR of this one product, not its own additive term:
    // Open Borders / alliance ease migration; war dampens it. The caller clamps the product.
    if (hasOpenBordersDeal(src.owner, dest.owner)) p *= CONFIG.permOpenBorders;
    if (hasAlliance(src.owner, dest.owner)) p *= CONFIG.permAlly;
    if (atWar(src.owner, dest.owner)) p *= CONFIG.permWar;
  }
  return p;
}

/**
 * The cross-civ friction (`poachBlock`) a source pays to send a citizen abroad, the full anti-
 * poaching barrier for an ordinary economic migrant, but a much smaller one (`refugeePoachBlock`) for
 * a war/disaster REFUGEE (a source in acute crisis). A refugee isn't being lured away, they're
 * fleeing, so the border barrier shouldn't pen them inside a collapsing civ, this is what lets their
 * outflow reach neutral neighbours and populate the cross-civ migration network.
 * @param {*} src Source signal.
 * @returns {number} The cross-civ delta penalty.
 */
function crossCivBlock(src) {
  if (!srcInCrisis(src)) return CONFIG.poachBlock;
  // A crisis refugee pays reduced friction AND gets an escape bonus (negative delta = net pull) so it
  // flees abroad instead of being out-pulled by a nearer, equally-stricken internal city.
  const escape = CONFIG.crisisEscapeBonus > 0 ? CONFIG.crisisEscapeBonus : 0;
  return CONFIG.refugeePoachBlock - escape;
}

/**
 * Whether a source is in ACUTE crisis (war or disaster distress over its flee threshold), i.e. its
 * people are refugees fleeing, not economic migrants.
 * @param {*} src Source signal.
 * @returns {boolean} True when fleeing a crisis.
 */
function srcInCrisis(src) {
  return (src.violence || 0) >= CONFIG.violenceFleeThreshold
    || (src.disaster || 0) >= CONFIG.disasterFleeThreshold;
}

/**
 * The adjusted pull from `src` to `dest`, composed as the two clamped channels over the prosperity
 * gradient and friction (see §1). War is NOT a gate here: a city under attack simply has low
 * prosperity (so its people leave) and a flee vector (so they head away from the invader) - both
 * folded into the score, not a hard block. Exported for the characterization test. Returns null
 * when the destination is ineligible or the net pull is not positive.
 * @param {*} src Source signal.
 * @param {*} dest Candidate destination signal.
 * @param {{x:number, y:number}|null} flee The source's flee vector, or null.
 * @param {Record<number, number>|null} ownerPop Per-owner total population (congestion).
 * @param {Set<number>|null} aggressors The source's aggressors (war refugees only).
 * @returns {number|null} The adjusted pull, or null to skip.
 */
export function adjustedPull(src, dest, flee, ownerPop, aggressors) {
  if (dest.key === src.key) return null;

  // GRADIENT + TILT (clamped): the prosperity driver plus any targeted attraction.
  let pull = (dest.pros - src.pros) + clamp(tiltFor(src, dest), -CONFIG.tiltCap, CONFIG.tiltCap);
  if (pull <= 0) return null;

  // FRICTION: reluctance, overcrowding, city-state + cross-civ barriers, distance, congestion.
  pull -= CONFIG.baseReluctance;
  if (dest.population > src.population) {
    pull -= CONFIG.perExtraPop * (dest.population - src.population);
  }
  if (dest.isCityState || src.isCityState) pull -= CONFIG.cityStateBarrier;
  if (dest.owner !== src.owner) {
    if (!CONFIG.crossCivEnabled) return null;
    pull -= crossCivBlock(src); // friction for the move, minus the crisis ESCAPE bonus for refugees
    pull -= dominanceFor(dest, ownerPop); // anti-snowball: cross-civ inflow to a runaway leader only
  }
  pull += geoAdjust(src, dest, flee, aggressors);
  pull -= congestionFor(dest, ownerPop);

  // PERMEABILITY: openness × clamped relationship factors (Open Borders / alliance / war).
  pull *= clamp(permeability(src, dest), CONFIG.permeFloor, CONFIG.permeCeil);
  return pull > 0 ? pull : null;
}

/**
 * The immigration-openness multiplier for a destination civ (1 when border policies are off, so
 * it's a no-op by default).
 * @param {*} dest Destination signal.
 * @returns {number} A positive multiplier.
 */
function opennessFor(dest) {
  if (_neutralBorders || !CONFIG.bordersEnabled) return 1;
  return immigrationOpenness(dest.owner);
}

/**
 * The emigration-retention multiplier for a source civ (1 when border policies are off): Closed
 * Borders keeps a civ's own people from being lured across to rivals.
 * @param {*} src Source signal.
 * @returns {number} A positive multiplier (<= 1).
 */
function retentionFor(src) {
  if (_neutralBorders || !CONFIG.bordersEnabled) return 1;
  return emigrationRetention(src.owner);
}

/**
 * The congestion-headwind pull penalty for a destination (0 when disabled).
 * @param {*} dest Destination signal.
 * @param {Record<number, number>|null} ownerPop Per-owner total population.
 * @returns {number} A non-negative penalty.
 */
function congestionFor(dest, ownerPop) {
  if (!(CONFIG.congestWeight > 0)) return 0;
  return congestionPenalty(dest.owner, ownerPop ? ownerPop[dest.owner] || 0 : 0);
}

// The world-average civ population, memoized per ownerPop snapshot (one map per pass) so the
// anti-snowball ratio doesn't re-sum every (source × destination) pair.
let _fieldPopRef = /** @type {Record<number, number>|null} */ (null);
let _fieldAvg = 0;

/**
 * The mean population across all owners in `ownerPop` (the "fair share" a snowball is measured
 * against), memoized by the map's identity.
 * @param {Record<number, number>} ownerPop Per-owner total population.
 * @returns {number} World-average civ population (0 when empty).
 */
function fieldAverage(ownerPop) {
  if (ownerPop === _fieldPopRef) return _fieldAvg;
  _fieldPopRef = ownerPop;
  let sum = 0;
  let n = 0;
  for (const k of Object.keys(ownerPop)) {
    sum += ownerPop[+k] || 0;
    n++;
  }
  _fieldAvg = n > 0 ? sum / n : 0;
  return _fieldAvg;
}

/**
 * The anti-snowball headwind for a destination civ: a pull penalty that grows as the civ's
 * population runs ahead of the world-average civ, so a runaway leader gets a self-correcting brake
 * on further cross-civ immigration. Zero at or below the fair-share threshold, and zero when the
 * brake is off or population data is missing.
 * @param {*} dest Destination signal.
 * @param {Record<number, number>|null} ownerPop Per-owner total population.
 * @returns {number} A non-negative penalty.
 */
function dominanceFor(dest, ownerPop) {
  if (!(CONFIG.antiSnowballWeight > 0) || !ownerPop) return 0;
  const avg = fieldAverage(ownerPop);
  if (!(avg > 0)) return 0;
  const ratio = (ownerPop[dest.owner] || 0) / avg;
  const excess = ratio - CONFIG.antiSnowballThreshold;
  if (!(excess > 0)) return 0;
  return CONFIG.antiSnowballWeight * Math.pow(excess, CONFIG.antiSnowballExponent);
}

/**
 * Find the best destination for a source: the city with the greatest adjusted pull. The source's
 * flee vector (away from its nearest invader, if any) is computed once and shared across all
 * candidates.
 * @param {*} src Ranked source signal.
 * @param {*[]} ranked All ranked signals.
 * @param {Record<number, number>|null} ownerPop Per-owner total population (congestion).
 * @param {(dest: any) => boolean} [acceptDest] Optional destination predicate (false skips a candidate).
 * @returns {{dest:*, adjusted:number}|null} Best destination + its adjusted pull.
 */
export function bestDestination(src, ranked, ownerPop, acceptDest) {
  const flee = fleeVector(src, ranked);
  const aggressors = warRefugeeAggressors(src);
  let best = null;
  for (const dest of ranked) {
    if (typeof acceptDest === "function" && !acceptDest(dest)) continue;
    const adjusted = adjustedPull(src, dest, flee, ownerPop, aggressors);
    if (adjusted !== null && (!best || adjusted > best.adjusted)) {
      best = { dest, adjusted };
    }
  }
  return best;
}

/**
 * The aggressors a besieged source's refugees should avoid (Feature 1), or null when the feature
 * is off (`aggressorPenalty` 0) or the source isn't under enough violence.
 * @param {*} src Source signal.
 * @returns {Set<number>|null} Aggressor ids, or null.
 */
function warRefugeeAggressors(src) {
  if (!(CONFIG.aggressorPenalty > 0)) return null;
  if (!(src.violence >= CONFIG.violenceFleeThreshold)) return null;
  return warAggressors(src.owner);
}
