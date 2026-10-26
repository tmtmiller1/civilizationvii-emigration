// emigration-outlet-death.js
//
// The outlet's death channel, split out of emigration-engine.js: the crisis-severity multiplier, the death-onset
// ramp, the sustained-unrest counter and the per-source death gate (processOutletDeath). The engine calls the gate
// once per source after it has found (or failed to find) a refuge for the pass.

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { speedTurns, speedBar, speedDecay, speedShock } from "/emigration/ui/emigration-game-speed.js";
import { lethalDistress } from "/emigration/ui/emigration-prosperity.js";
import { marginalPeople, settlementSignal } from "/emigration/ui/emigration-population.js";
import { recordSiegeDeath } from "/emigration/ui/emigration-violence.js";
import { deriveDeathReasons } from "/emigration/ui/emigration-pull.js";
import { cityName, settlementLoc } from "/emigration/ui/emigration-migration-records.js";
import { eventKeyForDeath } from "/emigration/ui/emigration-event-attribution.js";
import { warAggressors } from "/emigration/ui/emigration-war.js";
import { combatLossFor } from "/emigration/ui/emigration-combat.js";
import { abandonForDeath } from "/emigration/ui/emigration-departure-tile.js";

/** @typedef {import("/emigration/ui/emigration-migration-records.js").Migration} Migration */

/**
 * The crisis-severity multiplier (≥ 0) on the crisis-death rate: the worse the crisis, the larger the
 * share of a stricken city's people that die rather than escaping. Built from lethal distress `d`
 * (siege duration, pillage, assault damage, disaster/famine; normalized by the firing floor and
 * capped) times the number of attacking civs, plus unit casualties. ≈ 1 at the firing floor.
 * @param {*} src Source signal.
 * @param {number} d The source's lethal distress (already computed by the caller).
 * @returns {number}
 */
export function crisisSeverity(src, d) {
  const ref = Math.max(1, CONFIG.attritionMinDistress);
  const intensity = Math.min(CONFIG.crisisSeverityCap, d / ref); // pillaging / assault damage / duration
  const extra = Math.max(0, warAggressors(src.owner).size - 1);
  const gang = 1 + Math.min(CONFIG.crisisParticipantMax, CONFIG.crisisParticipantWeight * extra);
  // Unit casualties are a major co-factor: a civ bleeding its army (field battles, not just city
  // damage) dies harder. Bounded so it stays alongside, not over, the damage-driven intensity.
  const combat = Math.min(CONFIG.crisisCombatMax, CONFIG.crisisCombatWeight * combatLossFor(src.owner));
  return intensity * gang + combat;
}

/**
 * The death-onset ramp in [deathRampFloor, 1] (not a cap): a lethal crisis accrues death-pressure
 * gently at first and deepens over `deathRampTurns` of sustained lethal distress, then holds at the
 * full rate, so a sudden catastrophe is never instantly devastating. 1 when disabled.
 * @param {number} tenure Consecutive turns the source has been under lethal distress (>= 1 here).
 * @returns {number} The per-turn death-pressure accrual multiplier.
 */
export function deathRamp(tenure) {
  if (!CONFIG.deathRampEnabled) return 1;
  const floor = CONFIG.deathRampFloor;
  const ramp = Math.min(1, Math.max(0, tenure - 1) / Math.max(1, speedTurns(CONFIG.deathRampTurns)));
  return floor + (1 - floor) * ramp;
}

/**
 * Advance (or relax) the per-source sustained-unrest counter and report whether unrest has been
 * sustained for `unrestLethalDelayTurns` and so counts as lethal this pass. Called before the death
 * gate's early-return so the counter still climbs on pre-lethal unrest turns.
 * @param {*} src Source signal.
 * @param {*} st Per-source state (mutates st.unrestTenure).
 * @returns {boolean} Whether sustained unrest is lethal this pass.
 */
function tickUnrestLethality(src, st) {
  st.unrestTenure = src.unrest ? (st.unrestTenure || 0) + 1 : Math.max(0, (st.unrestTenure || 0) - 1);
  return !!src.unrest && st.unrestTenure >= speedTurns(CONFIG.unrestLethalDelayTurns);
}

/**
 * The outlet's death channel: population that leaves the world (cause `attrition`), tracked as deaths.
 * Fires under lethal distress (`lethalDistress ≥ attritionMinDistress`: war, disaster, siege, famine,
 * plus unrest sustained for `unrestLethalDelayTurns`) on its own `deathPressure`, concurrently with
 * emigration: a trapped source (no refuge) dies at full rate; with a refuge (`crisisDeathEnabled`)
 * some die at `crisisDeathShare` of that rate while the rest flee.
 * @param {*} src Source signal.
 * @param {*} st Per-source state (uses st.deathPressure).
 * @param {*} state Loaded state.
 * @param {boolean} hasRefuge Whether a viable destination exists this pass.
 * @returns {Migration|null} An attrition death record, or null.
 */
export function processOutletDeath(src, st, state, hasRefuge) {
  const unrestLethal = tickUnrestLethality(src, st);
  const d = CONFIG.attritionEnabled ? lethalDistress(src, unrestLethal) : 0;
  // Lethal distress is the situational crises (war/disaster/siege/famine, plus sustained unrest).
  if (d < CONFIG.attritionMinDistress || (hasRefuge && !CONFIG.crisisDeathEnabled)) {
    st.deathPressure = Math.max(0, st.deathPressure * speedDecay(0.5)); // coping → decay (same game-time)
    st.crisisTenure = Math.max(0, (st.crisisTenure || 0) - 1); // crisis eased → the onset ramp relaxes (reversible)
    return null;
  }
  st.crisisTenure = (st.crisisTenure || 0) + 1; // sustained lethal distress → the crisis deepens over time
  // Dynamic: the worse the crisis, the larger the share that dies rather than fleeing. Trapped → full.
  const rate = hasRefuge ? Math.min(1, CONFIG.crisisDeathShare * crisisSeverity(src, d)) : 1;
  // deathRamp smooths the onset (see above). speedShock (÷S) balances the ×S kill threshold below so
  // the total crisis pressure to a death is speed-invariant.
  st.deathPressure += speedShock(Math.pow(Math.max(d, 1), CONFIG.deltaExponent) * rate * deathRamp(st.crisisTenure));
  if (st.deathPressure < speedBar(CONFIG.attritionThreshold)) return null;
  const popBefore = src.population;
  const taken = abandonForDeath(src); // the dead leave their farmstead, or (at the rural floor) the count
  if (!taken.ok) return null;
  st.deathPressure = 0;
  src.rural -= 1;
  src.population -= 1;
  recordSiegeDeath(src.city); // under siege, a death counts into the siege's tally like a departure
  return {
    srcName: cityName(src.city),
    destName: "",
    srcLoc: settlementLoc(src.city),
    srcOwner: src.owner,
    crossCiv: false,
    points: 1,
    people: marginalPeople(popBefore, state.monoTurn, cityName(src.city), settlementSignal(src)),
    cause: "attrition",
    subject: taken.mode,
    eventKey: eventKeyForDeath(src), // specific war/disaster/crisis/famine that killed them
    reasons: deriveDeathReasons(src, hasRefuge, unrestLethal) // "why": crisis/unrest + trapped/fleeing
  };
}
