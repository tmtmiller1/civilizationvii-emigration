// emigration-refugee-pool.js
//
// Refugee holding pools by destination city. Refugees can be assigned to a city immediately while
// only a bounded share settles into working population each turn. This lets wars create visible,
// temporary displacement pressure without turning every intake spike into instant labor growth.

import { registerCacheReset, resetCachesOnNewGame } from "/emigration/ui/emigration-cache-reset.js";
import { bumpRefugeesQueued } from "/emigration/ui/emigration-telemetry.js";

const STATE_KEY = "EmigrationRefugeePool_v1";
const MAX_CITIES = 8192;
const MAX_ORIGINS_PER_CITY = 128;

/** @typedef {{pts:number, since:number}} OriginPool */
/** @typedef {{byOrigin: Record<string, OriginPool>}} CityPool */
/** @typedef {{cities: Record<string, CityPool>}} RefugeePoolState */

/** @type {RefugeePoolState | null} */
let _state = null;
let _dirty = false;
registerCacheReset(() => {
  _state = null;
  _dirty = false;
});

/** @param {*} v @param {number} d */
function numOr(v, d) {
  return typeof v === "number" && isFinite(v) ? v : d;
}

function emptyState() {
  return { cities: {} };
}

function readStored() {
  const g = Configuration?.getGame?.();
  const v = g && typeof g.getValue === "function" ? g.getValue(STATE_KEY) : null;
  return typeof v === "string" && v.length ? v : null;
}

/** @param {*} v */
function normalizeOriginPool(v) {
  if (!v || typeof v !== "object") return null;
  const pts = Math.max(0, Math.floor(numOr(v.pts, 0)));
  if (pts <= 0) return null;
  return { pts, since: Math.max(0, Math.floor(numOr(v.since, 0))) };
}

/** @param {*} v */
function normalizeCityPool(v) {
  if (!hasOriginMap(v)) return null;
  /** @type {Record<string, OriginPool>} */
  const byOrigin = {};
  fillOrigins(byOrigin, v.byOrigin);
  return Object.keys(byOrigin).length ? { byOrigin } : null;
}

/** @param {*} v */
function hasOriginMap(v) {
  return !!(v && typeof v === "object" && v.byOrigin && typeof v.byOrigin === "object");
}

/** @param {Record<string, OriginPool>} out @param {*} src */
function fillOrigins(out, src) {
  let n = 0;
  for (const [k, row] of Object.entries(src || {})) {
    if (n >= MAX_ORIGINS_PER_CITY) break;
    if (typeof k !== "string" || !k.length) continue;
    const r = normalizeOriginPool(row);
    if (!r) continue;
    out[k] = r;
    n++;
  }
}

/** @param {*} parsed */
function normalizeState(parsed) {
  const payload = payloadFromParsed(parsed);
  if (!payload) return emptyState();
  return { cities: normalizeCities(payload.cities) };
}

/** @param {*} parsed */
function payloadFromParsed(parsed) {
  if (!parsed || typeof parsed !== "object") return null;
  const payload = typeof parsed.v === "number" && parsed.data && typeof parsed.data === "object"
    ? parsed.data
    : parsed;
  if (!payload || typeof payload !== "object") return null;
  if (!payload.cities || typeof payload.cities !== "object") return null;
  return payload;
}

/** @param {*} rawCities */
function normalizeCities(rawCities) {
  /** @type {Record<string, CityPool>} */
  const cities = {};
  let n = 0;
  for (const [cityKey, raw] of Object.entries(rawCities || {})) {
    if (n >= MAX_CITIES) break;
    if (typeof cityKey !== "string" || !cityKey.length) continue;
    const clean = normalizeCityPool(raw);
    if (!clean) continue;
    cities[cityKey] = clean;
    n++;
  }
  return cities;
}

function state() {
  resetCachesOnNewGame();
  if (_state) return _state;
  try {
    const raw = readStored();
    _state = raw ? normalizeState(JSON.parse(raw)) : emptyState();
  } catch (_) {
    _state = emptyState();
  }
  return _state;
}

function persistNow() {
  try {
    Configuration?.editGame?.()?.setValue?.(
      STATE_KEY,
      JSON.stringify({ v: 1, data: state() })
    );
  } catch (_) {
    /* ignore */
  }
}

function markDirty() {
  _dirty = true;
}

/** @param {string} cityKey */
function cityPool(cityKey) {
  const s = state();
  let row = s.cities[cityKey];
  if (!row) {
    row = { byOrigin: {} };
    s.cities[cityKey] = row;
  }
  return row;
}

/** @param {string} cityKey */
function pruneCity(cityKey) {
  const s = state();
  const row = s.cities[cityKey];
  if (!row) return;
  for (const k of Object.keys(row.byOrigin)) {
    const pts = Math.max(0, Math.floor(numOr(row.byOrigin[k]?.pts, 0)));
    if (pts <= 0) delete row.byOrigin[k];
  }
  if (!Object.keys(row.byOrigin).length) delete s.cities[cityKey];
}

/**
 * @param {string} cityKey
 * @param {((origin:string, e:OriginPool)=>boolean)=} pred
 */
function popOldest(cityKey, pred) {
  const row = state().cities[cityKey];
  if (!row) return null;
  let bestKey = "";
  let bestSince = Number.MAX_SAFE_INTEGER;
  for (const [origin, e] of Object.entries(row.byOrigin)) {
    const pts = Math.max(0, Math.floor(numOr(e?.pts, 0)));
    const since = Math.max(0, Math.floor(numOr(e?.since, 0)));
    if (pts <= 0) continue;
    if (typeof pred === "function" && !pred(origin, e)) continue;
    if (since < bestSince) {
      bestSince = since;
      bestKey = origin;
    }
  }
  if (!bestKey) return null;
  row.byOrigin[bestKey].pts -= 1;
  const out = { originCiv: Number(bestKey), since: bestSince };
  pruneCity(cityKey);
  markDirty();
  return out;
}

/**
 * Total refugees assigned to a city and still in holding.
 * @param {string} cityKey City signal key.
 * @returns {number} Holding size in points.
 */
export function refugeePoolTotal(cityKey) {
  const row = state().cities[cityKey];
  if (!row) return 0;
  let t = 0;
  for (const e of Object.values(row.byOrigin)) t += Math.max(0, Math.floor(numOr(e?.pts, 0)));
  return t;
}

/**
 * Total refugees held across all cities owned by one civ.
 * @param {number} owner Owner player id.
 * @returns {number} Holding size in points.
 */
export function refugeePoolTotalForOwner(owner) {
  if (typeof owner !== "number") return 0;
  const pfx = owner + ":";
  let total = 0;
  for (const cityKey of Object.keys(state().cities)) {
    if (cityKey.indexOf(pfx) !== 0) continue;
    total += refugeePoolTotal(cityKey);
  }
  return total;
}

/**
 * Add refugees to a city's holding pool.
 * @param {string} cityKey City signal key.
 * @param {number} originCiv True origin civ.
 * @param {number} turn Current monotonic turn.
 * @param {number} [pts] Points to queue.
 */
export function queueRefugees(cityKey, originCiv, turn, pts = 1) {
  const n = Math.max(0, Math.floor(numOr(pts, 0)));
  if (!cityKey || typeof originCiv !== "number" || n <= 0) return;
  const row = cityPool(cityKey);
  const k = String(originCiv);
  const since = Math.max(0, Math.floor(numOr(turn, 0)));
  const cur = row.byOrigin[k];
  if (!cur) row.byOrigin[k] = { pts: n, since };
  else {
    cur.pts += n;
    cur.since = Math.min(cur.since, since);
  }
  bumpRefugeesQueued(n); // P0.4 pool-inflow telemetry
  markDirty();
}

/**
 * Pull refugees from holding first when a host city is under attack and re-shedding people.
 * @param {string} cityKey City signal key.
 * @param {number} maxPts Maximum points to consume.
 * @returns {number} Points consumed from pool.
 */
export function consumeForReshed(cityKey, maxPts) {
  const want = Math.max(0, Math.floor(numOr(maxPts, 0)));
  let got = 0;
  for (let i = 0; i < want; i++) {
    const one = popOldest(cityKey);
    if (!one) break;
    got++;
  }
  return got;
}

/**
 * Consume one oldest held refugee for re-shed routing, preserving origin metadata for rollback.
 * @param {string} cityKey City signal key.
 * @returns {{originCiv:number, since:number}|null} The consumed refugee metadata.
 */
export function consumeOneForReshed(cityKey) {
  return popOldest(cityKey);
}

/**
 * Consume one refugee of a specific origin for return migration, before pulling from settled locals.
 * @param {string} cityKey City signal key.
 * @param {number} originCiv Origin civ to return.
 * @returns {boolean} True when one held refugee was consumed.
 */
export function consumeForReturn(cityKey, originCiv) {
  if (!cityKey || typeof originCiv !== "number") return false;
  return !!popOldest(cityKey, (/** @type {string} */ o) => Number(o) === originCiv);
}

/**
 * Consume one held refugee of a specific origin for return migration, preserving
 * origin metadata for rollback (mirrors consumeOneForReshed). Lets a caller
 * re-queue the exact refugee — with its original `since` — if the move can't land.
 * @param {string} cityKey City signal key.
 * @param {number} originCiv Origin civ to return.
 * @returns {{originCiv:number, since:number}|null} The consumed refugee metadata, or null.
 */
export function consumeOneForReturn(cityKey, originCiv) {
  if (!cityKey || typeof originCiv !== "number") return null;
  return popOldest(cityKey, (/** @type {string} */ o) => Number(o) === originCiv);
}

/**
 * How many held refugees are old enough to settle this turn.
 * @param {string} cityKey City signal key.
 * @param {number} turn Current monotonic turn.
 * @param {number} holdTurns Minimum holding turns.
 * @returns {number} Eligible points.
 */
export function refugeePoolEligible(cityKey, turn, holdTurns) {
  const row = state().cities[cityKey];
  if (!row) return 0;
  const t = Math.max(0, Math.floor(numOr(turn, 0)));
  const minAge = Math.max(0, Math.floor(numOr(holdTurns, 0)));
  let out = 0;
  for (const e of Object.values(row.byOrigin)) {
    const pts = Math.max(0, Math.floor(numOr(e?.pts, 0)));
    const since = Math.max(0, Math.floor(numOr(e?.since, 0)));
    if (pts > 0 && (t - since) >= minAge) out += pts;
  }
  return out;
}

/**
 * Consume one held refugee that is old enough to settle.
 * @param {string} cityKey City signal key.
 * @param {number} turn Current monotonic turn.
 * @param {number} holdTurns Minimum holding turns.
 * @returns {boolean} True when one eligible point was consumed.
 */
export function consumeEligibleForSettlement(cityKey, turn, holdTurns) {
  const t = Math.max(0, Math.floor(numOr(turn, 0)));
  const minAge = Math.max(0, Math.floor(numOr(holdTurns, 0)));
  return !!popOldest(
    cityKey,
    (/** @type {string} */ _o, /** @type {OriginPool} */ e) =>
      (t - Math.max(0, Math.floor(numOr(e?.since, 0)))) >= minAge
  );
}

/** Persist if this pass mutated holding pools. */
export function saveRefugeePools() {
  if (!_dirty) return;
  persistNow();
  _dirty = false;
}

/** Test helpers for deterministic unit tests. */
export const __test = {
  _clear: () => {
    _state = emptyState();
    _dirty = false;
  },
  _state: () => JSON.parse(JSON.stringify(state()))
};
