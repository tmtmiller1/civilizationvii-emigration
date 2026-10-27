// emigration-settlements-section.js
//
// The Settlements section of the dashboard: the player's cards, every civilization's cards, the displaced people,
// and the settlement mix rows (Majority / Character, once the Communities tab; the owner, 2026-10-26): the owner's
// rows feed each card's Arrived pane, every row the All civilizations view. Split out of emigration-views.js, which
// is at its length cap.

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { buildCivFlows } from "/emigration/ui/emigration-city-flows.js";
import { displacedExtras } from "/emigration/ui/emigration-displaced-view.js";
import { diverseCityRows } from "/emigration/ui/emigration-detail-views.js";
import { loc } from "/emigration/ui/emigration-loc.js";

/**
 * @param {*} d Gathered dashboard data (myCities, flows, civs, eventsByOwner, displaced, diversity).
 * @returns {*} The section ({title, kind:"cityflows", cities, civCards, displaced..., diversity}); `diversity` is
 *   empty when the diversity ranking is switched off.
 */
export function settlementsSection(d) {
  const diversity = CONFIG.diversityRanking
    ? diverseCityRows(d.diversity || [], { cosmo: !!CONFIG.cosmopolitanismScore }) : [];
  return {
    title: loc("LOC_EMIG_VIEW_SEC_SETTLEMENTS", "Settlements"), kind: "cityflows", cities: d.myCities || [],
    civCards: buildCivFlows(d.flows || [], d.civs || [], d.eventsByOwner, d.intra || []),
    ...displacedExtras(d), diversity
  };
}
