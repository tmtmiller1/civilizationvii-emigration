// emigration-city-net.js
//
// The per-city net-migration series behind the city-readout sparkline: a bounded rolling record of
// each city's net pop-point change per pass, plus the shared "net points per city this pass" reduction
// the stats reconciliation also uses. The series lives in the stats state; this module only reads and
// writes the store it is handed.

const MAX_SERIES = 24;   // per-city rolling series length (readout sparkline window)
const MAX_CITIES = 4000; // ceiling on tracked cities (drops the oldest when exceeded)
const MAX_PRESSURE_SERIES = 6; // per-source pressure samples kept for the forecast's rate of rise

/**
 * Net pop-point change per city for one pass ("owner|cityName" -> net): arrivals add to the
 * destination, departures/attrition subtract from the source. This is what the mod did to each city,
 * so it can be subtracted from the observed population change during reconciliation.
 * @param {*[]} migs This pass's migrations.
 * @returns {Record<string, number>} Net points per "owner|cityName".
 */
export function modPointsByCity(migs) {
  /** @type {Record<string, number>} */
  const map = {};
  for (const m of migs || []) {
    const pts = m.points || 0;
    if (typeof m.srcOwner === "number") {
      const k = m.srcOwner + "|" + m.srcName;
      map[k] = (map[k] || 0) - pts;
    }
    if (typeof m.destOwner === "number") {
      const k = m.destOwner + "|" + m.destName;
      map[k] = (map[k] || 0) + pts;
    }
  }
  return map;
}

/**
 * Append this pass's per-city net to the rolling store (bounded per city and in city count). Only
 * cities touched this pass get a point, so storage stays bounded.
 * @param {Record<string, number[]>} store The per-city series map (mutated in place).
 * @param {*[]} migs This pass's migrations.
 */
export function recordCityNet(store, migs) {
  const net = modPointsByCity(migs);
  for (const k of Object.keys(net)) {
    const arr = store[k] || (store[k] = []);
    arr.push(net[k]);
    if (arr.length > MAX_SERIES) arr.splice(0, arr.length - MAX_SERIES);
  }
  const keys = Object.keys(store);
  if (keys.length > MAX_CITIES) {
    for (const k of keys.slice(0, keys.length - MAX_CITIES)) delete store[k];
  }
}

/**
 * Append each source's accumulated emigration pressure after this pass to its rolling sample series (bounded
 * per source and in source count), so the forecast can read how fast the pressure is rising. Sources the
 * engine no longer tracks drop out of the store.
 * @param {Record<string, number[]>} store The per-source sample map (mutated in place).
 * @param {Record<string, {pressure?:number}>} sources The engine's per-source state after the pass.
 */
export function recordPressure(store, sources) {
  if (!store || !sources || typeof sources !== "object") return;
  pruneDropped(store, sources);
  for (const k of Object.keys(sources)) {
    const p = Number(sources[k] && sources[k].pressure);
    if (!Number.isFinite(p)) continue;
    const arr = store[k] || (store[k] = []);
    arr.push(p);
    if (arr.length > MAX_PRESSURE_SERIES) arr.splice(0, arr.length - MAX_PRESSURE_SERIES);
  }
}

/**
 * @param {Record<string, number[]>} store The sample map (mutated). @param {Record<string, *>} live The live keys.
 */
function pruneDropped(store, live) {
  for (const k of Object.keys(store)) if (!(k in live)) delete store[k];
}

/**
 * The last `n` net values for a city, oldest first; empty for an unknown city or n <= 0.
 * @param {Record<string, number[]>} store The per-city series map.
 * @param {string} key "owner|cityName".
 * @param {number} [n] Max points to return.
 * @returns {number[]}
 */
export function cityNetSeriesFrom(store, key, n = 12) {
  const arr = (store || {})[key] || [];
  if (!(n > 0)) return [];
  return arr.length > n ? arr.slice(arr.length - n) : arr.slice();
}
