// emigration-relief.js
//
// Takes down the old People who left buildings. The first 4.0.0 build of 2026-10-27 gave a settlement that lost people
// over unhappiness +1 Happiness for each, through hidden city-center buildings (data/emigration-relief.sql). The City
// Details panel lists every constructible and other rules count buildings, so the relief moved into the mod's reading
// of Happiness, then went altogether (roadmap sections 72 and 73). The types stay defined so a save holding one still
// loads, and each pass takes down any still standing.

import { dlog } from "/emigration/ui/emigration-log.js";

const PREFIX = "BUILDING_EMIG_RELIEF_";

/** @param {string} type @returns {boolean} Whether a constructible type is one of the old relief buildings. */
export function isReliefBuilding(type) {
  return typeof type === "string" && type.startsWith(PREFIX);
}

/**
 * One pass: take down any old relief building.
 * @param {{clearStanding?:()=>number}} [d] Seam for tests. @returns {number} How many requests were sent.
 */
export function reliefSweep(d) {
  const cleared = ((d && d.clearStanding) || clearStanding)();
  if (cleared) dlog("relief: " + cleared + " old relief building(s) taken down");
  return cleared;
}

/**
 * Take down every old relief building standing in a major civilization's settlement, as the local player (the engine
 * gates DESTROY_ELEMENT to the local player's requests).
 * @returns {number} How many requests were sent.
 */
function clearStanding() {
  let sent = 0;
  try {
    const sender = GameContext.localPlayerID;
    for (const p of Players.getAlive()) {
      if (!p.isMajor) continue;
      for (const c of p.Cities.getCities()) sent += clearIn(c, sender);
    }
  } catch (_) {
    /* a partial read leaves the rest for the next pass */
  }
  return sent;
}

/** @param {*} city @param {number} sender @returns {number} */
function clearIn(city, sender) {
  let sent = 0;
  for (const id of (city && city.Constructibles && city.Constructibles.getIds()) || []) {
    const inst = Constructibles.getByComponentID(id);
    const def = inst ? GameInfo.Constructibles.lookup(inst.type) : null;
    if (!isReliefBuilding(def && def.ConstructibleType)) continue;
    Game.PlayerOperations.sendRequest(sender, "DESTROY_ELEMENT", { Kind: "CONSTRUCTIBLE", Owner: id.owner, LocalID: id.id });
    sent++;
  }
  return sent;
}
