// emigration-consular.js
//
// Consular Protection: a civ with the card earns Influence for each recognised enclave of its people living
// in another civ's cities, and once per host per age it lodges grievances against a host that has a
// suspicion card slotted while those people live there. The grievance goes through the engine's
// Diplomacy.changeNumGrievances (n/1000 grievances; it moves both sides' relationship), which books it on the civ
// that did the wrong, so the write is on the host, aimed at the consular civ. The per-turn grant
// stamp and the once-per-host-per-age stamps persist in GameConfiguration under EmigrationConsular_v1.

import { hasConsular, treatmentStance } from "/emigration/ui/emigration-borders.js";
import { allQuarterEntries } from "/emigration/ui/emigration-quarter-state.js";
import { grantSigned } from "/emigration/ui/emigration-effects.js";
import { registerCacheReset, resetCachesOnNewGame } from "/emigration/ui/emigration-cache-reset.js";
import { dlog } from "/emigration/ui/emigration-log.js";

const STATE_KEY = "EmigrationConsular_v1";
/** Most Influence per turn the card pays, however many enclaves abroad. */
export const CONSULAR_INFLUENCE_CAP = 4;
/** Grievances lodged against a suspicious host, once per host per age. */
export const CONSULAR_GRIEVANCES = 30;

/** @typedef {{granted: Record<string,string>, lodged: Record<string,number>}} ConsularState */

/** @type {ConsularState|null} */
let _state = null;
registerCacheReset(() => { _state = null; });

function gameAge() {
  try {
    return typeof Game !== "undefined" && typeof Game.age === "number" ? Game.age : 0;
  } catch (_) {
    return 0;
  }
}

/** @returns {string} The age and turn, the per-turn grant stamp. */
function turnStamp() {
  try {
    const turn = typeof Game !== "undefined" && typeof Game.turn === "number" ? Game.turn : 0;
    return gameAge() + ":" + turn;
  } catch (_) {
    return "0:0";
  }
}

/** @param {*} m @param {(v:*) => boolean} ok @returns {Record<string,*>} */
function cleanMap(m, ok) {
  /** @type {Record<string,*>} */
  const out = {};
  if (!m || typeof m !== "object") return out;
  for (const [k, v] of Object.entries(m)) if (ok(v)) out[k] = v;
  return out;
}

/** @param {*} parsed @returns {ConsularState} */
function normalize(parsed) {
  const src = parsed && typeof parsed === "object" ? parsed : {};
  return {
    granted: cleanMap(src.granted, (v) => typeof v === "string"),
    lodged: cleanMap(src.lodged, (v) => typeof v === "number" && Number.isFinite(v))
  };
}

/** @returns {ConsularState} */
function state() {
  resetCachesOnNewGame();
  if (_state) return _state;
  try {
    const raw = Configuration?.getGame?.()?.getValue?.(STATE_KEY);
    _state = normalize(typeof raw === "string" && raw ? JSON.parse(raw) : null);
  } catch (_) {
    _state = normalize(null);
  }
  return _state;
}

function save() {
  try {
    Configuration?.editGame?.()?.setValue?.(STATE_KEY, JSON.stringify(state()));
  } catch (_) {
    /* a failed save must never break the pass */
  }
}

/**
 * Recognised enclaves of a civ's people living in other civs' cities.
 * @param {number} pid The origin player id. @returns {number} The count.
 */
export function enclavesAbroad(pid) {
  let n = 0;
  for (const { rec } of allQuarterEntries()) {
    if (rec.recognized !== false && rec.civ === pid && rec.owner !== pid) n++;
  }
  return n;
}

/**
 * The Influence a civ's Consular Protection card pays this turn: +1 per recognised enclave abroad, capped.
 * @param {number} pid Player id. @returns {number} The amount (0 without the card).
 */
export function consularInfluence(pid) {
  if (typeof pid !== "number" || !hasConsular(pid)) return 0;
  return Math.min(CONSULAR_INFLUENCE_CAP, enclavesAbroad(pid));
}

/**
 * Grant a civ its Consular Protection Influence for this turn, once per turn (a reload or a repeated turn
 * event pays nothing extra). Never throws.
 * @param {number} pid The player whose turn began. @returns {number} The Influence granted.
 */
export function tickConsular(pid) {
  try {
    const amount = consularInfluence(pid);
    if (!(amount > 0)) return 0;
    const s = state();
    const stamp = turnStamp();
    if (s.granted[String(pid)] === stamp) return 0;
    s.granted[String(pid)] = stamp;
    grantSigned(pid, "YIELD_DIPLOMACY", amount);
    save();
    dlog("consular: player " + pid + " +" + amount + " influence for enclaves abroad");
    return amount;
  } catch (_) {
    return 0;
  }
}

/**
 * Lodge grievances from `consular` against `host` through the engine: the host is booked as the civ that did the
 * wrong. Guarded: false when the API is absent or throws.
 * @param {number} consular The civ lodging them. @param {number} host The suspicious host.
 * @returns {boolean} True when the call went through.
 */
function lodgeGrievances(consular, host) {
  try {
    const dip = Players.get(host)?.Diplomacy;
    if (!dip || typeof dip.changeNumGrievances !== "function") return false;
    dip.changeNumGrievances(consular, CONSULAR_GRIEVANCES * 1000);
    return true;
  } catch (e) {
    dlog("consular: changeNumGrievances threw " + e);
    return false;
  }
}

/**
 * Whether a host/consular pair is due a grievance this age: a different civ holding Consular Protection,
 * a host with a suspicion card slotted, and no stamp yet this age.
 * @param {number} consular Origin player id. @param {number} host Host player id. @param {number} age Now.
 * @returns {boolean}
 */
function grievanceDue(consular, host, age) {
  if (typeof consular !== "number" || typeof host !== "number" || consular === host) return false;
  if (state().lodged[consular + ">" + host] === age) return false;
  return hasConsular(consular) && treatmentStance(host) === "suspect";
}

/**
 * Once per pass: every civ with Consular Protection whose people hold an enclave in a host with a suspicion
 * card slotted lodges grievances against that host, once per host per age. Never throws.
 * @returns {number} How many grievances were lodged this pass.
 */
export function checkConsularGrievances() {
  let lodged = 0;
  try {
    const age = gameAge();
    for (const { rec } of allQuarterEntries()) {
      if (!grievanceDue(rec.civ, rec.owner, age)) continue;
      const ok = lodgeGrievances(rec.civ, rec.owner);
      dlog("consular: player " + rec.civ + " holds grievances against host " + rec.owner + (ok ? "" : ", not written"));
      if (!ok) continue;
      state().lodged[rec.civ + ">" + rec.owner] = age;
      lodged++;
    }
    if (lodged) save();
  } catch (_) {
    /* never disrupt a pass */
  }
  return lodged;
}

/** @type {*} Test-only hooks. */
export const __test = { STATE_KEY, readState: () => state() };
