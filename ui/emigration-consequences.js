// emigration-consequences.js
//
// The source-side and destination-side side effects of a migration, split out of
// emigration-engine.js. A departure can book a capped war-loss on a besieged source; an arrival
// books assimilation load on the receiving civ, pays out attraction/raid dividends, and can carry
// plague distress with the migrants. The engine and the arrival processor both apply these.

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { recordWarLoss } from "/emigration/ui/emigration-violence.js";
import { addDistress, disasterKey } from "/emigration/ui/emigration-disasters.js";
import { addAssimilationLoad } from "/emigration/ui/emigration-effects.js";
import { addAttractionDividend } from "/emigration/ui/emigration-dividend.js";
import { activeAttractions } from "/emigration/ui/emigration-borders.js";
import { onRaidIntake } from "/emigration/ui/emigration-raid.js";

/**
 * Migration as a contagion vector (§11): when an infected city's people flee, seed a small distress
 * at their destination - beyond the base game's trade-network spread. Bounded well below the source
 * and gated off by default. Applied on ARRIVAL (so a lagged plague reaches the destination with the
 * carriers, not before them).
 * @param {boolean} infected Whether the source city was infected.
 * @param {*} destCity The destination city object.
 */
function carryPlague(infected, destCity) {
  if (!CONFIG.plagueCarryEnabled || !infected) return;
  const key = disasterKey(destCity);
  if (key) addDistress(key, CONFIG.plagueCarryDistress);
}

/**
 * Source-side consequence applied when the people LEAVE: a capped war-loss tally if the source is
 * besieged (so the siege cap counts them the moment they depart).
 * @param {*} src Source signal.
 */
export function applyDepartureConsequences(src) {
  if (src.violence >= CONFIG.violenceFleeThreshold) recordWarLoss(src.city);
}

/**
 * Destination-side consequence applied when the people ARRIVE: assimilation load on the receiving
 * civ, the carried attraction/raid dividends, and any carried plague distress.
 * @param {*} destCity Destination city object.
 * @param {number} destOwner Destination owner id.
 * @param {number} destPop Destination population after arrival.
 * @param {boolean} infected Whether the source was infected.
 * @param {number} srcOwner Source owner id (a raid rewards/costs only for its target's people).
 * @returns {number} The assimilation load booked on the destination civ (the "cost paid").
 */
export function applyArrivalConsequences(destCity, destOwner, destPop, infected, srcOwner) {
  const load = addAssimilationLoad(destOwner, destPop);
  // Carried dividend (§1b): turn each immigrant into a per-turn yield under any attraction card.
  for (const yieldKey of activeAttractions(destOwner)) {
    addAttractionDividend(destOwner, yieldKey, CONFIG.dividendPerMigrant);
  }
  // Raid (§4b): when the arrival is from the raider's target, bank its domain dividend AND charge
  // the per-migrant Influence cost. onRaidIntake gates both to the target (the felt "raise yours").
  const raidYield = onRaidIntake(destOwner, srcOwner);
  if (raidYield) addAttractionDividend(destOwner, raidYield, CONFIG.dividendPerMigrant);
  carryPlague(infected, destCity);
  return load;
}
