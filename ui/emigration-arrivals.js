// emigration-arrivals.js
//
// Arrival processing for lagged migrations (Feature 1b), split out of emigration-engine.js. Each
// turn, land every in-flight migration whose transit completed: re-resolve it against the live
// ranking by destination key, credit the destination if it still exists (immigration tally +
// arrival consequences), or charge a death to the source if it was razed/captured en route.

import { addRural } from "/emigration/ui/emigration-population.js";
import { arriveRecord } from "/emigration/ui/emigration-migration-records.js";
import { applyArrivalConsequences } from "/emigration/ui/emigration-consequences.js";

/**
 * @typedef {import("/emigration/ui/emigration-state.js").EmigState} EmigState
 * @typedef {import("/emigration/ui/emigration-state.js").Transit} Transit
 * @typedef {import("/emigration/ui/emigration-migration-records.js").Migration} Migration
 */

/**
 * Land every in-flight migration whose transit completed this turn (Feature 1b). Each is
 * re-resolved against the live ranking by its destination key: if the destination still exists it
 * gains the
 * point (immigration tally + assimilation/plague on arrival); if it was razed or captured en route,
 * the migrants perished in transit (a death charged to the source). Deferred wholesale when the
 * ranking is momentarily empty, so a transient read failure never wrongly kills arrivals.
 * @param {EmigState} state Loaded state (transit queue + monoTurn).
 * @param {*[]} ranked Ranked signals (the live cities this turn).
 * @returns {Migration[]} The arrival records.
 */
export function processArrivals(state, ranked) {
  if (!state.transit.length || !ranked.length) return [];
  const now = state.monoTurn;
  const due = state.transit.filter((e) => e.arriveTurn <= now);
  if (!due.length) return [];
  state.transit = state.transit.filter((e) => e.arriveTurn > now);
  const byKey = new Map();
  for (const s of ranked) byKey.set(s.key, s);
  return due.map((e) => landArrival(e, byKey));
}

/**
 * Land one completed transit: if its destination still exists it gains the point (with the arrival
 * consequences); otherwise the migrants perished en route (a death on the source).
 * @param {Transit} e The completed transit entry.
 * @param {Map<string, *>} byKey Live ranking indexed by city key.
 * @returns {Migration} The arrival record.
 */
function landArrival(e, byKey) {
  const destSig = byKey.get(e.destKey);
  if (destSig && addRural(destSig.city)) {
    destSig.rural += 1;
    destSig.population += 1;
    const cost = applyArrivalConsequences(
      destSig.city, e.destOwner, destSig.population, e.infected, e.srcOwner
    );
    return arriveRecord(e, true, cost);
  }
  return arriveRecord(e, false); // destination gone → perished in transit
}
