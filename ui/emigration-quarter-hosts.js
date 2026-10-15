// emigration-quarter-hosts.js
//
// Keeps each enclave record's host in step with the settlement it sits in. A captured settlement carries
// its enclave to the new owner (the record's `owner` follows the city at its key, read once per pass), and
// the settlement's name is kept on the record so a later line can still name it. When the settlement is
// gone and Partisans reports it burned in an uprising, the enclave closes with a line about the families
// fleeing the fighting rather than the built-over line.

import { allQuarterEntries, dropQuarter } from "/emigration/ui/emigration-quarter-state.js";
import { burnedChapterAt } from "/emigration/ui/emigration-partisans.js";
import { chronicle } from "/emigration/ui/emigration-chronicle.js";
import { toast } from "/emigration/ui/emigration-feedback.js";
import { narrativeCiv } from "/emigration/ui/emigration-naming.js";
import { enclaveYields, yieldsText, withYields } from "/emigration/ui/emigration-enclave-yields.js";
import { enclaveStanding, destroyPlacedTile } from "/emigration/ui/emigration-enclave-place.js";
import { dlog } from "/emigration/ui/emigration-log.js";
import { msg, msgText } from "/emigration/ui/emigration-loc.js";

/**
 * Whether a player is a major civilization. Unreadable players count as major, so an off-engine read keeps
 * the old behaviour; only a player the engine reports as minor (a city-state or independent) is excluded.
 * @param {number} pid Player id. @returns {boolean}
 */
export function isMajorHost(pid) {
  try {
    const p = typeof Players !== "undefined" ? Players.get(pid) : null;
    return !(p && (p.isMajor === false || p.isMinor === true));
  } catch (_) {
    return true;
  }
}

/** @param {*} city @returns {string|null} */
function nameOf(city) {
  try {
    const n = city && city.name;
    if (typeof n !== "string" || !n) return null;
    return typeof Locale !== "undefined" && typeof Locale.compose === "function" ? Locale.compose(n) : n;
  } catch (_) {
    return null;
  }
}

/** @param {string} key @returns {{x:number, y:number}|null} The coordinates, when a city lookup is possible. */
function lookupKey(key) {
  if (typeof MapCities === "undefined" || typeof Cities === "undefined" || typeof key !== "string") return null;
  const [x, y] = key.split(",").map(Number);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

/**
 * The settlement centred on a key: gone (nothing stands there), or standing with its owner and name. Null
 * when the lookup is unavailable or throws, so the record is left alone.
 * @param {string} key The "x,y" settlement-centre key.
 * @returns {{gone:boolean, owner:(number|null), name:(string|null)}|null} The reading.
 */
export function settlementAt(key) {
  try {
    const xy = lookupKey(key);
    if (!xy) return null;
    const { x, y } = xy;
    const id = MapCities.getCity(x, y);
    const city = id != null ? Cities.get(id) : null;
    const loc = city && city.location;
    if (!(loc && loc.x === x && loc.y === y)) return { gone: true, owner: null, name: null };
    return { gone: false, owner: typeof city.owner === "number" ? city.owner : null, name: nameOf(city) };
  } catch (_) {
    return null;
  }
}

/**
 * The line for an enclave whose settlement burned in an uprising, or null when Partisans reports no burned
 * chapter for that key. Deduped per key, so it's written once however the enclave's end is noticed.
 * @param {string} key The settlement-centre key. @param {*} rec The quarter record.
 * @param {string} lost What the host stops receiving ("" when nothing).
 * @returns {*} The chronicle input, or null.
 */
export function burnedEntry(key, rec, lost) {
  const chapter = burnedChapterAt(key);
  if (!chapter) return null;
  const city = rec.hostName || chapter.name;
  return {
    kind: "founding",
    title: msg("LOC_EMIG_QTR_CHRON_BURNED_TITLE", "{1_City} Burns", city),
    body: withYields(msg("LOC_EMIG_QTR_CHRON_BURNED_BODY",
      "When {1_City} burned in the uprising, the {2_Adj} families there scattered with everyone else.",
      city, narrativeCiv(rec.civ).adjMsg), lost),
    civ: narrativeCiv(rec.civ).adj,
    dedupeKey: "quarter:burned:" + key
  };
}

/** @returns {number|null} */
function localPid() {
  try {
    return typeof GameContext !== "undefined" && typeof GameContext.localPlayerID === "number"
      ? GameContext.localPlayerID : null;
  } catch (_) {
    return null;
  }
}

/**
 * Close an enclave whose settlement burned: remove a tile still standing, drop the record, and write the
 * burned line (a notice too when it was the local player's settlement).
 * @param {string} key The settlement-centre key. @param {*} rec The record.
 */
function retireBurned(key, rec) {
  const entry = burnedEntry(key, rec, yieldsText(enclaveYields(rec), -1));
  if (!entry) return;
  if (rec.placed && enclaveStanding(rec)) destroyPlacedTile(rec);
  dropQuarter(key);
  dlog("enclave BURNED with its settlement at " + key + " (host " + rec.owner + ", origin " + rec.civ + ")");
  if (chronicle(entry) && rec.owner === localPid()) toast(msgText(entry.body), "chronicle");
}

/**
 * Bring one record in line with its settlement: a new owner is taken over, the name is kept, and a burned
 * settlement closes the enclave. A record held by a city-state or independent stays on file but gets no
 * upkeep (see isMajorHost in the per-turn tick), so they're never touched.
 * @param {string} key The settlement-centre key. @param {*} rec The record (mutated).
 */
function reconcileOne(key, rec) {
  const s = settlementAt(key);
  if (!s) return;
  if (s.gone) {
    retireBurned(key, rec);
    return;
  }
  if (s.name) rec.hostName = s.name;
  if (s.owner == null || s.owner === rec.owner) return;
  dlog("enclave at " + key + " follows its settlement from host " + rec.owner + " to " + s.owner);
  rec.owner = s.owner;
}

/**
 * Once per pass: every enclave record follows the current owner of its settlement. Never throws.
 */
export function reconcileQuarterHosts() {
  for (const { tileKey, rec } of allQuarterEntries()) {
    try {
      reconcileOne(tileKey, rec);
    } catch (_) {
      /* one bad record must never stop the rest */
    }
  }
}
