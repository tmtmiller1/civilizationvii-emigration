// emigration-quarters.js
//
// Truthful "quarter" phrases for the Migration Chronicle's diaspora lines — where a settled minority
// "kept a district of their own". Every feature phrase names only a REAL feature of the host city (a
// coast, a river, the mountains, or a building it has actually raised), so the Chronicle never claims
// a granary the city never built. The present-feature keys are supplied by emigration-city-features.js
// (the engine reads); this module is PURE (a deterministic, seeded choice with no engine reads), so it
// is unit-testable and never throws.
//
// The phrases are framed at the EDGE of the city ("beyond the granaries", "by the harbour", "on the
// far side of town"), which is also where the ethnicity lens paints a diaspora — its people fill the
// sparse rural fringe, not the dense core — so the prose and the map agree.

/** @type {Record<string, string[]>} Truthful edge-of-city phrases, one list per real feature key. */
const FEATURE_QUARTERS = {
  coast: ["by the harbour", "along the waterfront", "in the dock quarter"],
  river: ["along the river", "by the river landings"],
  mountain: ["below the mountains", "on the high ground"],
  granary: ["beyond the granaries", "past the granaries"],
  temple: ["outside the temple district", "by the temple precinct"],
  market: ["around the market", "by the market stalls"],
  walls: ["near the old walls", "by the city gate"]
};

// Preference order when a city has several nameable features: a distinctive landmark reads better than
// a generic edge. Among the features actually present, the seed picks one deterministically.
const FEATURE_ORDER = ["coast", "river", "mountain", "granary", "temple", "market", "walls"];

/** @type {string[]} Always-true fallbacks naming no specific feature (used when the city has none). */
const GENERIC_QUARTERS = [
  "on the edge of the city", "in the outer streets", "past the last houses",
  "on the far side of town", "where the streets give out"
];

/**
 * A stable 32-bit FNV-1a hash of a seed string, for deterministic choice (matches the narrative
 * engine's own hash so a given event reads the same wherever it is rendered).
 * @param {string} s The seed. @returns {number} An unsigned 32-bit hash.
 */
function hash(s) {
  let h = 2166136261 >>> 0;
  const str = typeof s === "string" ? s : String(s);
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/**
 * Normalize the caller's feature keys (a Set, an array, or nothing) into the present-and-known keys,
 * in preference order. Unknown keys are dropped, so a phrase is only ever drawn for a real feature.
 * @param {Iterable<string>|null|undefined} keys The city's feature keys.
 * @returns {string[]} The known keys that are present, in {@link FEATURE_ORDER}.
 */
function presentFeatures(keys) {
  if (!keys) return [];
  const set = keys instanceof Set ? keys : new Set(keys);
  return FEATURE_ORDER.filter((k) => set.has(k));
}

/**
 * A truthful quarter phrase for a diaspora line. When the city has a nameable feature, a phrase for
 * one of those features is chosen deterministically by seed; otherwise a generic, always-true edge
 * phrase is returned. Never names a feature the city lacks; never throws.
 * @param {Iterable<string>|null|undefined} keys The city's real feature keys (coast/river/mountain/
 *   granary/temple/market/walls), from emigration-city-features.js.
 * @param {string} seed The event seed, so the choice is stable per diaspora.
 * @returns {string} A prepositional phrase, e.g. "by the harbour" or "on the edge of the city".
 */
export function resolveQuarter(keys, seed) {
  const s = typeof seed === "string" ? seed : String(seed || "");
  const present = presentFeatures(keys);
  if (present.length) {
    const feat = present[hash(s + ":qf") % present.length];
    const opts = FEATURE_QUARTERS[feat];
    return opts[hash(s + ":qp") % opts.length];
  }
  return GENERIC_QUARTERS[hash(s + ":qg") % GENERIC_QUARTERS.length];
}

// Test hook.
export const __test = { hash, presentFeatures, FEATURE_QUARTERS, FEATURE_ORDER, GENERIC_QUARTERS };
