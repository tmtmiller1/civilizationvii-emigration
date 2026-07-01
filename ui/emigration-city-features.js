// emigration-city-features.js
//
// Reads a settlement's REAL geography and buildings into a small set of "feature keys" (coast, river,
// mountain, granary, temple, market, walls), so the Migration Chronicle can say where a diaspora
// settled WITHOUT inventing a feature the city doesn't have. Every engine read is fully guarded: a
// missing API or an unreadable plot simply contributes no key, and the caller falls back to a generic,
// always-true phrase. Used in the gameplay pass (emigration-diaspora.js), polling the same map and
// constructible APIs the rest of the mod already uses.

// Substring tests against a constructible's ConstructibleType string (e.g. "BUILDING_GRANARY"). A
// city is credited with a building key only when it actually holds a matching constructible.
const BUILDING_KEYS = [
  { match: "GRANARY", key: "granary" },
  { match: "TEMPLE", key: "temple" },
  { match: "ALTAR", key: "temple" },
  { match: "MARKET", key: "market" },
  { match: "BAZAAR", key: "market" },
  { match: "WALL", key: "walls" }
];

/**
 * Whether a guarded GameplayMap predicate is present and true for a plot.
 * @param {*} G The GameplayMap global (or null). @param {string} name The predicate method name.
 * @param {number} x Plot x. @param {number} y Plot y. @returns {boolean} True when present and true.
 */
function plotIs(G, name, x, y) {
  return !!(G && typeof G[name] === "function" && G[name](x, y));
}

/**
 * Add the terrain feature keys true of one plot (coast/river/mountain) to `out`. Each check is
 * independent and guarded; an unreadable plot adds nothing.
 * @param {number} x Plot x. @param {number} y Plot y. @param {Set<string>} out Accumulator.
 */
function addTerrainKeys(x, y, out) {
  try {
    const G = /** @type {*} */ (typeof GameplayMap !== "undefined" ? GameplayMap : null);
    if (!G) return;
    if (plotIs(G, "isMountain", x, y)) out.add("mountain");
    if (plotIs(G, "isWater", x, y) || plotIs(G, "isCoastalLand", x, y)) out.add("coast");
    if (plotIs(G, "isRiver", x, y) || plotIs(G, "isNavigableRiver", x, y)) out.add("river");
  } catch (_) {
    /* ignore unreadable plot */
  }
}

/**
 * The ConstructibleType string for a constructible component id, or null when it can't be resolved.
 * @param {*} cid A constructible component id. @returns {string|null} e.g. "BUILDING_GRANARY".
 */
function constructibleTypeName(cid) {
  try {
    const inst = typeof Constructibles !== "undefined" && Constructibles.getByComponentID
      ? Constructibles.getByComponentID(cid) : null;
    if (!inst || typeof inst.type !== "number") return null;
    const def = typeof GameInfo !== "undefined" && GameInfo.Constructibles
      ? GameInfo.Constructibles.lookup(inst.type) : null;
    return def && typeof def.ConstructibleType === "string" ? def.ConstructibleType : null;
  } catch (_) {
    return null;
  }
}

/**
 * Add the building feature keys true of one plot (granary/temple/market/walls) to `out`, by reading
 * the plot's constructibles and matching their types.
 * @param {number} x Plot x. @param {number} y Plot y. @param {Set<string>} out Accumulator.
 */
function addBuildingKeys(x, y, out) {
  try {
    const cids = typeof MapConstructibles !== "undefined" && MapConstructibles.getConstructibles
      ? MapConstructibles.getConstructibles(x, y) : null;
    if (!cids) return;
    for (const cid of cids) {
      const name = constructibleTypeName(cid);
      if (!name) continue;
      for (const b of BUILDING_KEYS) {
        if (name.includes(b.match)) out.add(b.key);
      }
    }
  } catch (_) {
    /* ignore unreadable plot */
  }
}

/**
 * The set of REAL feature keys a settlement has across its owned plots, terrain (coast/river/
 * mountain) and notable buildings (granary/temple/market/walls). Fully guarded: an unreadable city
 * yields an empty set, and the caller falls back to a generic quarter phrase. Never throws.
 * @param {*} city A city object. @returns {Set<string>} The present feature keys.
 */
export function cityFeatureKeys(city) {
  const out = new Set();
  try {
    const idx = city && typeof city.getPurchasedPlots === "function" ? city.getPurchasedPlots() : [];
    for (const i of idx || []) {
      const loc = typeof GameplayMap !== "undefined" && GameplayMap.getLocationFromIndex
        ? GameplayMap.getLocationFromIndex(i) : null;
      if (!loc) continue;
      addTerrainKeys(loc.x, loc.y, out);
      addBuildingKeys(loc.x, loc.y, out);
    }
  } catch (_) {
    /* ignore unreadable city */
  }
  return out;
}
