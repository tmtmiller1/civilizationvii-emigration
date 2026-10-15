// emigration-partisans.js
//
// Optional reads from the Partisans mod, through the global it publishes (globalThis.__towerPartisans,
// apiVersion >= 1, risings() returning copies of its uprising chapters). Nothing here loads or touches
// Partisans' files: without that global every reader returns null and Emigration plays as before. The
// list is read at most once per turn and every row is checked before use, since it crosses a mod line.

import { dlog } from "/emigration/ui/emigration-log.js";

/**
 * @typedef {Object} Rising A validated Partisans chapter.
 * @property {string} id Chapter id (colons stripped, so it can sit inside an event key).
 * @property {string} at The settlement-centre key "x,y".
 * @property {string} name The rising's name ("the {name} Uprising").
 * @property {number} start Game.turn it began.
 * @property {number|null} end Game.turn it ended, or null while it is open.
 * @property {string|null} outcome "dispersed" | "time" | "burned" | "age", or null.
 */

const OUTCOMES = new Set(["dispersed", "time", "burned", "age"]);
const CAUSES = new Set(["flip", "enclave", "misery"]);
const KEY_RE = /^-?\d+,-?\d+$/;
const NAME_MAX = 60;
/** How far from a settlement an open rising still drives its departures. */
export const UPRISING_RADIUS = 3;

/** @type {{stamp:string, rows:Rising[]}|null} */
let _cache = null;

/** @returns {string} The age and turn, so the list is read at most once per turn. */
function stampNow() {
  try {
    const age = typeof Game !== "undefined" && typeof Game.age === "number" ? Game.age : 0;
    const turn = typeof Game !== "undefined" && typeof Game.turn === "number" ? Game.turn : 0;
    return age + ":" + turn;
  } catch (_) {
    return "0:0";
  }
}

/** @param {*} v @returns {number|null} */
function finiteOrNull(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** @param {*} v @returns {string|null} */
function cleanName(v) {
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, NAME_MAX);
  return t.length ? t : null;
}

/** @param {*} v @returns {string|null} */
function cleanId(v) {
  if (typeof v !== "string" && !(typeof v === "number" && Number.isFinite(v))) return null;
  const t = String(v).replace(/:/g, "").slice(0, 40);
  return t.length ? t : null;
}

/** @param {*} r @returns {boolean} The key, owner and cause are well formed. */
function shapeOk(r) {
  return typeof r.at === "string" && KEY_RE.test(r.at) && finiteOrNull(r.owner) != null && CAUSES.has(r.cause);
}

/**
 * One chapter checked and trimmed to the fields Emigration reads, or null when unusable.
 * @param {*} r A raw row. @returns {Rising|null} The row.
 */
export function validRising(r) {
  if (!r || typeof r !== "object" || !shapeOk(r)) return null;
  const id = cleanId(r.id);
  const name = cleanName(r.name);
  const start = finiteOrNull(r.start);
  if (!id || !name || start == null) return null;
  const end = finiteOrNull(r.end);
  const outcome = typeof r.outcome === "string" && OUTCOMES.has(r.outcome) ? r.outcome : null;
  return { id, at: r.at, name, start, end, outcome };
}

/** @returns {*} The Partisans API when it is present and new enough, else null. */
function partisansApi() {
  const P = /** @type {*} */ (globalThis).__towerPartisans;
  return P && P.apiVersion >= 1 && typeof P.risings === "function" ? P : null;
}

/** @returns {Rising[]} The validated rows (empty without Partisans or on any error). */
function readRisings() {
  try {
    const P = partisansApi();
    if (!P) return [];
    const raw = P.risings();
    if (!Array.isArray(raw)) return [];
    /** @type {Rising[]} */
    const rows = [];
    for (const r of raw) {
      const ok = validRising(r);
      if (ok) rows.push(ok);
    }
    return rows;
  } catch (e) {
    dlog("partisans: risings() threw " + e);
    return [];
  }
}

/**
 * Partisans' uprising chapters, read once per turn and validated.
 * @returns {Rising[]} The rows.
 */
export function partisanRisings() {
  const stamp = stampNow();
  if (!_cache || _cache.stamp !== stamp) _cache = { stamp, rows: readRisings() };
  return _cache.rows;
}

/** @param {string} key @returns {{x:number, y:number}|null} */
function parseKey(key) {
  if (typeof key !== "string" || !KEY_RE.test(key)) return null;
  const [x, y] = key.split(",").map(Number);
  return { x, y };
}

/** @param {string} a @param {string} b @returns {number} Plot distance, or Infinity when unreadable. */
function keyDistance(a, b) {
  const pa = parseKey(a);
  const pb = parseKey(b);
  if (!pa || !pb) return Infinity;
  try {
    const d = GameplayMap.getPlotDistance(pa.x, pa.y, pb.x, pb.y);
    return typeof d === "number" && Number.isFinite(d) ? d : Infinity;
  } catch (_) {
    return Infinity;
  }
}

/**
 * The open rising (no end yet) centred on a settlement or within UPRISING_RADIUS tiles of it, nearest first.
 * @param {string} key The settlement-centre key "x,y". @returns {Rising|null} The rising, or null.
 */
export function openRisingNear(key) {
  if (!parseKey(key)) return null;
  let best = null;
  let bestD = Infinity;
  for (const r of partisanRisings()) {
    if (r.end != null) continue;
    const d = r.at === key ? 0 : keyDistance(r.at, key);
    if (d <= UPRISING_RADIUS && d < bestD) {
      best = r;
      bestD = d;
    }
  }
  return best;
}

/**
 * The chapter that ended with this settlement burned, or null.
 * @param {string} key The settlement-centre key "x,y". @returns {Rising|null} The chapter.
 */
export function burnedChapterAt(key) {
  if (typeof key !== "string") return null;
  return partisanRisings().find((r) => r.at === key && r.outcome === "burned") || null;
}

/**
 * The event key for a war departure from a city with an open rising nearby ("uprising:<id>:<name>"), or
 * null. The key groups under the war cause, so the migration figures are unchanged.
 * @param {*} city The source city object (reads `location`). @returns {string|null} The key.
 */
export function uprisingEventKey(city) {
  try {
    const loc = city && city.location;
    if (!loc || typeof loc.x !== "number" || typeof loc.y !== "number") return null;
    const r = openRisingNear(loc.x + "," + loc.y);
    return r ? "uprising:" + r.id + ":" + r.name : null;
  } catch (_) {
    return null;
  }
}

/**
 * The rising's name inside an uprising event key, or null for any other key.
 * @param {*} eventKey The event key. @returns {string|null} The name.
 */
export function uprisingNameOf(eventKey) {
  if (typeof eventKey !== "string" || eventKey.indexOf("uprising:") !== 0) return null;
  const rest = eventKey.slice(9);
  const i = rest.indexOf(":");
  const name = i >= 0 ? rest.slice(i + 1) : "";
  return name.length ? name : null;
}

/** @type {*} Test-only hooks. */
export const __test = {
  reset: () => {
    _cache = null;
  }
};
