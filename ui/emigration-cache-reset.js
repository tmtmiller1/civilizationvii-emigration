// emigration-cache-reset.js
//
// One SHARED "reset persisted caches on game boot" convention. Sibling modules lazy-load their state
// from GameConfiguration into a module-level cache that isolate teardown normally clears, but a NEW
// game inside a still-live isolate would keep the prior game's data and could persist it into the new
// store. So every persisted-state module registers a resetter here and calls resetCachesOnNewGame() at
// the top of its lazy loader; the first call after a game-id change (`Configuration.getGame().gameSeed`)
// nulls EVERY registered cache in that isolate.

import { CONFIG } from "/emigration/ui/emigration-config.js";

/** @type {Array<() => void>} The registered per-module cache resetters (per isolate). */
const _resetters = [];

/** Sentinel for "no game id observed in this isolate yet" (distinct from any real seed, incl. 0). */
const NO_GAME = Symbol("no-game");

/** @type {symbol|number|string} The last game id seen in this isolate. */
let _lastGameId = NO_GAME;

/**
 * The current game's unique id (its seed), or null when unreadable. Read defensively: Configuration is
 * absent off-engine and getGame() may be missing during teardown. `gameSeed`, not `startPosition`,
 * is the value that is unique per game.
 * @returns {number|string|null} The game id, or null when unavailable.
 */
export function currentGameId() {
  try {
    const getGame =
      typeof Configuration !== "undefined" && typeof Configuration.getGame === "function"
        ? Configuration.getGame.bind(Configuration)
        : null;
    const g = getGame ? getGame() : null;
    const id = g ? g.gameSeed : null;
    return typeof id === "number" || typeof id === "string" ? id : null;
  } catch (_) {
    return null;
  }
}

/**
 * Register a cache-reset callback, run once when this module is imported. The callback should null this
 * module's lazy persisted-state cache(s) so the next access reloads from the (new game's) store.
 * @param {() => void} fn The resetter.
 */
export function registerCacheReset(fn) {
  if (typeof fn === "function") _resetters.push(fn);
}

/**
 * Reset every registered persisted-state cache when a NEW game is detected (the game id changed since
 * the last call in this isolate). No-op when the feature is off, the id is unreadable or unchanged, or
 * this is the first id seen. Cheap and idempotent; call at the top of each persisted-state lazy loader.
 * @returns {boolean} True when a reset was performed.
 */
export function resetCachesOnNewGame() {
  if (!CONFIG.resetCachesOnGameBoot) return false;
  const id = currentGameId();
  if (id === null) return false; // unreadable, keep caches, don't thrash
  if (_lastGameId === NO_GAME) { // first id this isolate: adopt it, the caches are already fresh
    _lastGameId = id;
    return false;
  }
  if (id === _lastGameId) return false; // same game, nothing to do
  _lastGameId = id;
  for (const fn of _resetters) {
    try {
      fn();
    } catch (_) {
      /* one module's resetter must never block the rest */
    }
  }
  return true;
}

/** @type {*} Test-only hooks: clear/inspect the per-isolate registry + last-seen id. */
export const __test = {
  clear: () => {
    _resetters.length = 0;
    _lastGameId = NO_GAME;
  },
  resetterCount: () => _resetters.length,
  lastGameId: () => _lastGameId
};
