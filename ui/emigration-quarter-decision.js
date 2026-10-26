// emigration-quarter-decision.js
//
// The enclave decision one of the local player's settlements is waiting on, for the Settlements tab's Arrived
// pane (the owner, 2026-10-26: "any outstanding enclave decisions should be able to be set in the Arrived section,
// like the hasten return in the Left section"). The same candidate, dialog and choice as the pass's own offer
// (emigration-quarter.js); this file only lets the tab raise it on demand.

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { monoTurn } from "/emigration/ui/emigration-migration-stats.js";
import { showDilemma } from "/emigration/ui/emigration-dilemma-view.js";
import { candidateFromSignal, applyQuarterChoice, quarterView, recognitionMode, RECOGNITION }
  from "/emigration/ui/emigration-quarter.js";

/** @returns {number|null} */
function localPid() {
  try {
    const id = typeof GameContext !== "undefined" ? GameContext.localPlayerID : null;
    return typeof id === "number" && id >= 0 ? id : null;
  } catch (_) {
    return null;
  }
}

/**
 * `pending` when the player decides stances themselves and the settlement has an established community past its
 * dwell; `open` raises the dialog and runs `after` once the player has chosen.
 * @param {*} city The live city. @param {()=>void} [after]
 * @returns {{pending:boolean, open:()=>boolean}}
 */
export function quarterDecisionFor(city, after) {
  const none = { pending: false, open: () => false };
  try {
    const me = localPid();
    if (!CONFIG.quartersEnabled || me == null || !city || city.owner !== me) return none;
    if (recognitionMode() !== RECOGNITION.ASK) return none;
    const signal = { owner: me, city, population: Number(city.population) || 0 };
    const cand = candidateFromSignal(signal, me, monoTurn(), false);
    if (!cand) return none;
    return {
      pending: true,
      open: () => {
        showDilemma(quarterView(cand.quarter, cand.ordinal, me), (/** @type {string} */ id) => {
          applyQuarterChoice(id, cand.tileKey, { ...cand.quarter, city: cand.city }, me, monoTurn());
          if (typeof after === "function") after();
        });
        return true;
      }
    };
  } catch (_) {
    return none;
  }
}
