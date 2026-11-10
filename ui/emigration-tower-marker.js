// emigration-tower-marker.js
//
// Marker buildings: the free, hidden City Center buildings the Tower mods place by script so the AI can read an
// effect (this mod's old People who left tiers, Economics' markers, and the rest). Every one carries the shared
// constructible tag TOWER_MARKER. The engine lists them with a city's buildings, but to a player they aren't
// buildings, so the screens and rules here skip them whenever they count, list or score what stands on a tile.
//
// The tagged types are read from GameInfo.TypeTags once per game, so a marker added by any Tower mod is skipped
// without a list here. Without a TypeTags table nothing is skipped.

import { registerCacheReset, resetCachesOnNewGame } from "/emigration/ui/emigration-cache-reset.js";

export const TOWER_MARKER_TAG = "TOWER_MARKER";

/** @type {Set<string>|null} The ConstructibleTypes tagged TOWER_MARKER, read once per game. */
let _types = null;
registerCacheReset(() => {
  _types = null;
});

/** @returns {Set<string>} The tagged types (empty off-engine, or when TypeTags can't be read). */
function markerTypes() {
  resetCachesOnNewGame();
  if (_types) return _types;
  /** @type {Set<string>} */
  const out = new Set();
  // Before GameInfo exists there's nothing to cache: a later call, once it loads, reads the real table.
  if (typeof GameInfo === "undefined") return out;
  try {
    const table = /** @type {*} */ (GameInfo).TypeTags;
    if (table) {
      for (const row of table) {
        if (row && row.Tag === TOWER_MARKER_TAG && typeof row.Type === "string") out.add(row.Type);
      }
    }
  } catch (_) {
    /* an unreadable table skips nothing */
  }
  _types = out;
  return _types;
}

/**
 * Whether a ConstructibleType is a Tower marker building.
 * @param {*} type A ConstructibleType string. @returns {boolean}
 */
export function isTowerMarker(type) {
  return typeof type === "string" && type.length > 0 && markerTypes().has(type);
}

/**
 * Whether a constructible component id (from MapConstructibles or city.Constructibles) is a Tower marker.
 * An unreadable id isn't one.
 * @param {*} cid A constructible component id. @returns {boolean}
 */
export function isTowerMarkerId(cid) {
  if (markerTypes().size === 0) return false;
  try {
    const inst = Constructibles.getByComponentID(cid);
    const def = inst ? GameInfo.Constructibles.lookup(inst.type) : null;
    return isTowerMarker(def && def.ConstructibleType);
  } catch (_) {
    return false;
  }
}

/**
 * A plot's or city's constructible ids without the Tower markers. With no markers defined the list comes back
 * as it was, so the common case costs no lookups.
 * @param {*} cids The ids as the engine returned them (an array, or null).
 * @returns {*[]} The ids that are real constructibles.
 */
export function withoutTowerMarkers(cids) {
  if (!cids) return [];
  const list = Array.isArray(cids) ? cids : Array.from(cids);
  return markerTypes().size === 0 ? list : list.filter((cid) => !isTowerMarkerId(cid));
}

/** Test seam: forget the cached types, so the next read takes GameInfo.TypeTags again. */
export const __test = {
  reset: () => {
    _types = null;
  }
};
