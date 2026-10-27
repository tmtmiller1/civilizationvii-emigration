// emigration-intake-upkeep.js
//
// The Influence upkeep on a settlement closed to newcomers: `cityIntakeInfluence` (1) Influence a turn for each
// closed settlement, charged with each pass for the turns since the last charge, so a pass every two turns still
// charges two. When the treasury can't cover them all, as many as it can pay for stay closed and the rest open
// again, with a notice to the player naming theirs. AI civilizations close and open settlements by the rule in
// emigration-intake-ai.js, applied here before the charge, and pay the same upkeep less their difficulty discount.

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { loadState, setCityClosed } from "/emigration/ui/emigration-state.js";
import { callHomeBalance } from "/emigration/ui/emigration-call-home-action.js";
import { CALL_HOME_CURRENCY } from "/emigration/ui/emigration-call-home.js";
import { deduct } from "/emigration/ui/emigration-effects.js";
import { loc } from "/emigration/ui/emigration-loc.js";
import { dlog } from "/emigration/ui/emigration-log.js";
import { isAiHost, hostCongestion } from "/emigration/ui/emigration-ai-host.js";
import { aiPriceScale } from "/emigration/ui/emigration-ai-difficulty.js";
import { aiIntakeDecisions } from "/emigration/ui/emigration-intake-ai.js";
import { cityName as recordCityName } from "/emigration/ui/emigration-migration-records.js";

const KEY = "EmigrationIntakeUpkeep_v1";
/** The most turns one charge covers, so a long gap (a reload after an age change) never takes a lump sum. */
const MAX_TURNS = 5;

/** @returns {number} The Influence a closed settlement costs a turn (0 = free). */
export function intakeUpkeep() {
  const n = Math.floor(Number(CONFIG.cityIntakeInfluence));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** @returns {number} */
function gameTurn() {
  try {
    return typeof Game !== "undefined" && typeof Game.turn === "number" ? Game.turn : 0;
  } catch (_) {
    return 0;
  }
}

/** @returns {number|null} The turn of the last charge, or null before the first. */
function lastCharged() {
  try {
    const raw = Configuration?.getGame?.()?.getValue?.(KEY);
    const v = typeof raw === "string" && raw.length ? JSON.parse(raw) : null;
    return v && Number.isFinite(Number(v.turn)) ? Number(v.turn) : null;
  } catch (_) {
    return null;
  }
}

/** @param {number} turn */
function markCharged(turn) {
  try {
    Configuration?.editGame?.()?.setValue?.(KEY, JSON.stringify({ turn }));
  } catch (_) {
    /* the next pass charges one turn again */
  }
}

/**
 * How many turns this pass pays for: the turns since the last charge, at least 1 and at most MAX_TURNS; 0 when the
 * last charge was this turn. Game.turn restarts at an age change, so a turn below the last charge counts as one.
 * @param {number} now @param {number|null} last @returns {number}
 */
export function turnsToCharge(now, last) {
  if (last === null || now < last) return 1;
  return Math.min(MAX_TURNS, now - last);
}

/**
 * The closed settlements, by owner, that still stand under that owner; entries for a settlement that changed hands
 * or was razed are dropped from the state.
 * @param {(owner:number, localId:number)=>(*|null)} [findCity] Test seam.
 * @returns {Map<number, {key:string, name:string}[]>}
 */
function closedByOwner(findCity = liveCity) {
  /** @type {Map<number, {key:string, name:string}[]>} */
  const by = new Map();
  const cities = loadState().cities || {};
  for (const key of Object.keys(cities)) {
    const owner = cities[key].owner;
    const city = findCity(owner, Number(key.split(":")[1]));
    if (!city) {
      setCityClosed(key, false);
      continue;
    }
    const list = by.get(owner) || [];
    list.push({ key, name: cityName(city) });
    by.set(owner, list);
  }
  return by;
}

/** @param {number} owner @param {number} localId @returns {*|null} */
function liveCity(owner, localId) {
  try {
    const list = Players.get(owner)?.Cities?.getCities?.() || [];
    return list.find((/** @type {*} */ c) => c.localId === localId || c.id?.id === localId) || null;
  } catch (_) {
    return null;
  }
}

/** @param {*} city @returns {string} */
function cityName(city) {
  try {
    return typeof Locale !== "undefined" ? Locale.compose(city.name) : String(city.name);
  } catch (_) {
    return String(city && city.name);
  }
}

/**
 * Charge one owner for its closed settlements; open the ones it can't pay for.
 * @param {number} owner @param {{key:string, name:string}[]} list @param {number} perCity The charge per settlement.
 * @param {{balance?:(pid:number)=>number, pay?:(pid:number, n:number)=>void}} deps Test seams.
 * @returns {string[]} The names opened again.
 */
function chargeOwner(owner, list, perCity, deps) {
  const balance = (deps.balance || ((pid) => callHomeBalance(pid, CALL_HOME_CURRENCY.INFLUENCE)))(owner);
  const affordable = Number.isFinite(balance) ? Math.max(0, Math.floor(balance / perCity)) : list.length;
  const kept = list.slice(0, affordable);
  const opened = list.slice(affordable);
  for (const c of opened) setCityClosed(c.key, false);
  if (kept.length) (deps.pay || ((pid, n) => deduct(pid, "YIELD_DIPLOMACY", -n)))(owner, kept.length * perCity);
  return opened.map((c) => c.name);
}

/**
 * The pass's upkeep: charge each owner of a closed settlement, open what it can't pay for, and say so.
 * @param {{balance?:(pid:number)=>number, pay?:(pid:number, n:number)=>void, notify?:(msg:string)=>void,
 *   findCity?:(owner:number, localId:number)=>(*|null), turn?:number, isAi?:(pid:number)=>boolean}} [deps] Test
 *   seams; with `isAi` given, every owner's reopened settlements are reported.
 * @returns {{charged:number, opened:string[]}} Influence charged and the settlements opened again.
 */
export function chargeIntakeUpkeep(deps = {}) {
  const out = { charged: 0, opened: /** @type {string[]} */ ([]) };
  const turns = turnsDue(deps);
  if (turns <= 0) return out;
  for (const [owner, list] of closedByOwner(deps.findCity)) chargeOne(owner, list, turns, deps, out);
  if (out.opened.length) reportOpened(out.opened, deps.notify);
  return out;
}

/**
 * The turns this pass pays for, stamping the charge; 0 when the upkeep is off or already charged this turn.
 * @param {{turn?:number}} deps @returns {number}
 */
function turnsDue(deps) {
  if (!CONFIG.cityIntakeToggleEnabled || intakeUpkeep() <= 0) return 0;
  const now = typeof deps.turn === "number" ? deps.turn : gameTurn();
  const turns = turnsToCharge(now, lastCharged());
  if (turns > 0) markCharged(now);
  return turns;
}

/**
 * Charge one owner and collect the player's reopened settlements.
 * @param {number} owner @param {{key:string, name:string}[]} list @param {number} turns
 * @param {*} deps @param {{charged:number, opened:string[]}} out (mutated)
 */
function chargeOne(owner, list, turns, deps, out) {
  const scale = (deps.isAi || isAiHost)(owner) ? aiPriceScale() : 1;
  const perCity = Math.max(1, Math.round(intakeUpkeep() * turns * scale));
  const pay = deps.pay || defaultPay;
  const tally = (/** @type {number} */ pid, /** @type {number} */ n) => {
    out.charged += n;
    pay(pid, n);
  };
  const opened = chargeOwner(owner, list, perCity, { ...deps, pay: tally });
  const me = typeof GameContext !== "undefined" ? GameContext.localPlayerID : -1;
  if (owner === me || deps.isAi) out.opened.push(...opened);
}

/** @param {number} pid @param {number} n */
function defaultPay(pid, n) {
  deduct(pid, "YIELD_DIPLOMACY", -n);
}

/** @param {string[]} names @param {((msg:string)=>void)|undefined} notify */
function reportOpened(names, notify) {
  const msg = loc("LOC_EMIG_INTAKE_REOPENED",
    "Not enough Influence to keep dissuading newcomers in {1_Names}. They're welcome there again.",
    names.join(", "));
  dlog("intake upkeep: reopened " + names.join(", "));
  if (notify) notify(msg);
}

/**
 * The AI's side of the pass: each AI civilization's settlements read into the rule's shape, its choices applied.
 * @param {*[]} signals This pass's city signals.
 * @returns {{closed:string[], opened:string[]}} The keys the AI closed and opened.
 */
export function applyAiIntake(signals) {
  const out = { closed: /** @type {string[]} */ ([]), opened: /** @type {string[]} */ ([]) };
  if (!CONFIG.cityIntakeToggleEnabled || !CONFIG.aiIntakeEnabled) return out;
  const cities = loadState().cities || {};
  for (const [owner, list] of byOwner(signals)) {
    if (!isAiHost(owner)) continue;
    const d = aiIntakeDecisions(list.map((s) => intakeCity(s, cities)), aiReads(owner, list));
    for (const k of d.open) setCityClosed(k, false);
    for (const k of d.close) setCityClosed(k, true);
    out.closed.push(...d.close);
    out.opened.push(...d.open);
  }
  if (out.closed.length || out.opened.length) dlog("intake ai: closed " + out.closed + " opened " + out.opened);
  return out;
}

/**
 * The rule's reads for one AI civilization.
 * @param {number} owner @param {*[]} list Its city signals.
 * @returns {import("/emigration/ui/emigration-intake-ai.js").IntakeReads}
 */
function aiReads(owner, list) {
  const per = intakeUpkeep();
  return {
    congestion: hostCongestion(owner, list.reduce((n, s) => n + (s.population || 0), 0)),
    balance: callHomeBalance(owner, CALL_HOME_CURRENCY.INFLUENCE),
    upkeep: per > 0 ? Math.max(1, Math.round(per * aiPriceScale())) : 0,
    turn: gameTurn()
  };
}

/** @param {*[]} signals @returns {Map<number, *[]>} */
function byOwner(signals) {
  /** @type {Map<number, *[]>} */
  const m = new Map();
  for (const s of signals || []) {
    if (!s || typeof s.owner !== "number" || s.isCityState) continue;
    const l = m.get(s.owner) || [];
    l.push(s);
    m.set(s.owner, l);
  }
  return m;
}

/**
 * One settlement as the rule reads it.
 * @param {*} s A city signal. @param {Record<string, {owner:number, since?:number}>} cities The closed entries.
 * @returns {import("/emigration/ui/emigration-intake-ai.js").IntakeCity}
 */
function intakeCity(s, cities) {
  const row = cities[s.key];
  return {
    key: s.key, happiness: Number(s.happiness) || 0, capital: !!(s.city && s.city.isCapital),
    recentNet: recentNet(s), closedSince: row && row.owner === s.owner ? Number(row.since ?? 0) : null
  };
}

/** @param {*} s A city signal. @returns {number} Its net migration over the last three passes. */
function recentNet(s) {
  try {
    const D = /** @type {*} */ (globalThis).EmigrationData;
    const key = s.owner + "|" + recordCityName(s.city);
    const v = D && typeof D.cityNetSeries === "function" ? D.cityNetSeries(key, 3) : [];
    const list = Array.isArray(v) ? v : [];
    return list.reduce((/** @type {number} */ n, /** @type {number} */ x) => n + (Number(x) || 0), 0);
  } catch (_) {
    return 0;
  }
}

/**
 * The pass's intake work: the AI's choices, then the upkeep.
 * @param {*[]} signals This pass's city signals. @param {(msg:string)=>void} notify How to tell the player.
 */
export function intakePass(signals, notify) {
  try {
    applyAiIntake(signals);
    chargeIntakeUpkeep({ notify });
  } catch (e) {
    dlog("intake pass threw " + e);
  }
}
