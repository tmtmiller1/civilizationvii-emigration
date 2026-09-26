// emigration-plot-cleanup.js
//
// Keeps an abandoned tile USABLE. Destroying a rural improvement with DESTROY_ELEMENT leaves its
// DISTRICT_RURAL behind with nothing on it, and the game never offers such a plot for a new population
// point; removing the district with DESTROY_ELEMENT {Kind:"DISTRICT"} makes it placeable again.
// `scheduleDistrictCleanup` re-checks a plot a moment after a destroy (which lands asynchronously);
// `sweepEmptyRuralDistricts` clears every empty rural district once the loaded game starts and at the
// start of each local turn. Only a RURAL district with NO constructible is ever touched.

import { dlog } from "/emigration/ui/emigration-log.js";

/** Delay before re-checking a plot whose improvement was just destroyed (the destroy lands async). */
export const CLEANUP_DELAY_MS = 2000;

/**
 * Run fn, returning `fb` on a throw. @param {()=>*} fn The function. @param {*} fb The fallback. @returns {*}
 */
function safe(fn, fb) {
  try {
    return fn();
  } catch (_) {
    return fb;
  }
}

/**
 * Whether a district id names a real element. @param {*} id The id ({owner, id}). @returns {boolean} True.
 */
function validId(id) {
  if (!id) return false;
  return typeof id.owner === "number" && id.owner >= 0 && typeof id.id === "number" && id.id >= 0;
}

/**
 * Whether the district on a location is a rural one. @param {*} loc The location. @returns {boolean} True.
 */
function isRuralDistrictAt(loc) {
  const d = Districts.getAtLocation(loc);
  if (!d) return false;
  const info = GameInfo.Districts.lookup(d.type);
  return !!info && info.DistrictType === "DISTRICT_RURAL";
}

/**
 * The id of the rural district on a plot when that district carries no constructible, else null.
 * @param {number} plot Plot index. @returns {{owner:number, id:number}|null} The empty district's id.
 */
export function emptyRuralDistrictAt(plot) {
  return safe(() => {
    const loc = GameplayMap.getLocationFromIndex(plot);
    if (!isRuralDistrictAt(loc)) return null;
    if ((MapConstructibles.getConstructibles(loc.x, loc.y) || []).length > 0) return null;
    const id = Districts.getIdAtLocation(loc);
    return validId(id) ? { owner: id.owner, id: id.id } : null;
  }, null);
}

/**
 * Remove the empty rural district on a plot, if there is one.
 * @param {number} plot Plot index. @returns {boolean} True when a removal request was sent.
 */
export function clearEmptyRuralDistrict(plot) {
  const d = emptyRuralDistrictAt(plot);
  if (!d) return false;
  const sent = safe(() => {
    Game.PlayerOperations.sendRequest(GameContext.localPlayerID, "DESTROY_ELEMENT", {
      Kind: "DISTRICT", Owner: d.owner, LocalID: d.id
    });
    return true;
  }, false);
  if (sent) dlog("empty rural district cleared at plot " + plot);
  return sent;
}

/** @type {(fn: () => void, ms: number) => void} The timer used to defer the re-check (replaceable in tests). */
let _schedule = (fn, ms) => {
  setTimeout(fn, ms);
};

/**
 * Re-check a plot a moment after its improvement was destroyed and remove the empty district left behind.
 * @param {number} plot Plot index.
 */
export function scheduleDistrictCleanup(plot) {
  if (typeof plot !== "number") return;
  safe(() => _schedule(() => clearEmptyRuralDistrict(plot), CLEANUP_DELAY_MS), null);
}

/**
 * The owned plots of every living player's settlements. @returns {number[]} Plot indexes.
 */
function allSettlementPlots() {
  /** @type {number[]} */
  const out = [];
  for (const player of safe(() => Players.getAlive(), []) || []) {
    for (const city of safe(() => player.Cities.getCities(), []) || []) {
      for (const plot of safe(() => city.getPurchasedPlots(), []) || []) out.push(plot);
    }
  }
  return out;
}

/**
 * Clear every empty rural district on any settlement's land. Called at the start of each local turn.
 * @param {Set<number>} [skip] Plots to leave alone. @returns {number} Removal requests sent.
 */
export function sweepEmptyRuralDistricts(skip) {
  let n = 0;
  for (const plot of allSettlementPlots()) {
    if (skip && skip.has(plot)) continue;
    if (clearEmptyRuralDistrict(plot)) n++;
  }
  if (n) dlog("sweep cleared " + n + " empty rural districts");
  return n;
}

/** Poll interval while waiting for a loaded game to start (Begin Game can sit on screen a while). */
const START_POLL_MS = 2000;
/** Stop waiting after this many polls (20 minutes). */
const START_POLL_MAX = 600;
/** Delay after the game starts before the sweep (no gameplay request lands before Begin Game). */
const START_SWEEP_DELAY_MS = 3000;

/** Whether the loaded game has started. @returns {boolean} True once past Begin Game. */
function gameStarted() {
  const g = /** @type {*} */ (globalThis);
  return safe(() => g.UI.getGameLoadingState() === g.UIGameLoadingState.GameStarted, false);
}

/**
 * Sweep once, a few seconds after the loaded game has started, so a save carrying empty rural districts
 * heals on load instead of on the next turn. Called once from boot.
 */
export function sweepOnceGameStarts() {
  let tries = 0;
  const poll = () => {
    if (gameStarted()) {
      _schedule(() => sweepEmptyRuralDistricts(), START_SWEEP_DELAY_MS);
      return;
    }
    tries += 1;
    if (tries < START_POLL_MAX) _schedule(poll, START_POLL_MS);
  };
  safe(() => _schedule(poll, START_POLL_MS), null);
}

export const __test = {
  /** @param {(fn: () => void, ms: number) => void} fn A replacement timer. */
  setScheduler(fn) {
    _schedule = fn;
  }
};
