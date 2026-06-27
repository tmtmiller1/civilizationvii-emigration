// emigration-dilemma.js
//
// Refugee DILEMMAS: the rare moment when a great wave of refugees reaches your lands and you pause for
// a short decision. Deliberately uncommon (a hard per-age cap plus a long cooldown) and triggered only
// by genuine upheavals the rest of the mod already detects:
//   • a neighbour's CONQUEST SPREE (one civ taking several cities in a short span), whose victims flee
//     toward you;
//   • a PLAGUE crisis emptying a neighbour's cities, the survivors arriving at your gates.
//
// The choices use only the effects a UI mod can actually apply: a small one-time gold cost (grantYield)
// and settling a population point into one of your cities (addRural). Effects are light and
// flavour-first. The whole feature is gated by the Options toggle (getDilemmasEnabled) and never
// affects the simulation. State (the spree tracker + the throttle) persists in GameConfiguration.

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { getDilemmasEnabled } from "/emigration/ui/emigration-settings.js";
import { narrativeCiv } from "/emigration/ui/emigration-naming.js";
import { dilemmaPrompt } from "/emigration/ui/emigration-narrative.js";
import {
  addRural, scaleCityPopulation, formatPeopleExact
} from "/emigration/ui/emigration-population.js";
import { deduct } from "/emigration/ui/emigration-effects.js";
import { monoTurn } from "/emigration/ui/emigration-migration-stats.js";
import { activeCrisis } from "/emigration/ui/emigration-event-attribution.js";
import { cityName } from "/emigration/ui/emigration-migration-records.js";
import { chronicle } from "/emigration/ui/emigration-chronicle.js";
import { showDilemma } from "/emigration/ui/emigration-dilemma-view.js";

const STATE_KEY = "EmigrationDilemma_v1";
const STATE_SCHEMA_VERSION = 2;
const MAX_SPREE_CIVS = 64;
const MAX_SPREE_EVENTS_PER_CIV = 32;

/** The choices offered, with a one-line consequence cue. */
const CHOICES = [
  { id: "welcome", label: "Welcome them in",
    note: "A cost in gold now; they settle among you and, in time, become your people." },
  { id: "frontier", label: "Settle the frontier",
    note: "Send them to a smaller town to make a new start, for a little less." },
  { id: "away", label: "Turn them away",
    note: "They move on down the road. Their burden is not yours to carry." }
];

/**
 * @typedef {{spree: Record<string, {turn:number, victim:number, points:number}[]>,
 *   age:number, count:number, lastTurn:number}} DilemmaState
 */
/** @type {DilemmaState | null} */
let _state = null;

/**
 * @returns {DilemmaState} Empty persisted dilemma state.
 */
function emptyState() {
  return { spree: {}, age: currentAge(), count: 0, lastTurn: -999 };
}

/**
 * Resolve persisted payload from a legacy or schema envelope blob.
 * @param {*} parsed Parsed JSON value.
 * @returns {*} Payload object, or null.
 */
function payloadFromBlob(parsed) {
  if (!parsed || typeof parsed !== "object") return null;
  const payload = typeof parsed.v === "number" && parsed.data && typeof parsed.data === "object"
    ? parsed.data
    : parsed;
  return payload && typeof payload === "object" ? payload : null;
}

/**
 * @param {*} v Candidate turn/count value.
 * @param {number} fallback Fallback value.
 * @returns {number} Normalized non-negative integer.
 */
function nonNegInt(v, fallback) {
  return typeof v === "number" && isFinite(v) ? Math.max(0, Math.floor(v)) : fallback;
}

/**
 * @param {*} row Candidate spree row.
 * @returns {{turn:number, victim:number, points:number}|null} Sanitized row.
 */
function normalizeSpreeRow(row) {
  if (!row || typeof row !== "object") return null;
  if (typeof row.victim !== "number" || !isFinite(row.victim)) return null;
  return {
    turn: nonNegInt(row.turn, 0),
    victim: row.victim,
    points: nonNegInt(row.points, 1)
  };
}

/**
 * @param {string} aggressor Candidate aggressor key.
 * @param {*} rawRows Candidate rows collection.
 * @returns {boolean} Whether entry shape is valid.
 */
function isSpreeEntry(aggressor, rawRows) {
  return typeof aggressor === "string" && aggressor.length > 0 && Array.isArray(rawRows);
}

/**
 * @param {*} rawRows Candidate rows collection.
 * @returns {{turn:number, victim:number, points:number}[]} Sanitized rows.
 */
function collectSpreeRows(rawRows) {
  /** @type {{turn:number, victim:number, points:number}[]} */
  const rows = [];
  for (const raw of rawRows) {
    if (rows.length >= MAX_SPREE_EVENTS_PER_CIV) break;
    const row = normalizeSpreeRow(raw);
    if (row) rows.push(row);
  }
  return rows;
}

/**
 * @param {*} spree Candidate spree map.
 * @returns {Record<string, {turn:number, victim:number, points:number}[]>} Sanitized spree map.
 */
function normalizeSpree(spree) {
  /** @type {Record<string, {turn:number, victim:number, points:number}[]>} */
  const out = {};
  if (!spree || typeof spree !== "object") return out;
  let civs = 0;
  for (const [aggressor, rawRows] of Object.entries(spree)) {
    if (civs >= MAX_SPREE_CIVS) break;
    if (!isSpreeEntry(aggressor, rawRows)) continue;
    const rows = collectSpreeRows(rawRows);
    if (!rows.length) continue;
    out[aggressor] = rows;
    civs++;
  }
  return out;
}

/**
 * @param {*} parsed Parsed persisted state.
 * @returns {DilemmaState|null} Normalized state.
 */
function normalizeState(parsed) {
  const payload = payloadFromBlob(parsed);
  if (!payload) return null;
  return {
    spree: normalizeSpree(payload.spree),
    age: nonNegInt(payload.age, 0),
    count: nonNegInt(payload.count, 0),
    lastTurn: typeof payload.lastTurn === "number" && isFinite(payload.lastTurn)
      ? Math.floor(payload.lastTurn)
      : -999
  };
}

/**
 * The current age ordinal (for the per-age cap), or 0.
 * @returns {number} Game.age or 0.
 */
function currentAge() {
  try {
    return typeof Game !== "undefined" && typeof Game.age === "number" ? Game.age : 0;
  } catch (_) {
    return 0;
  }
}

/**
 * The local (viewing) player id, or null.
 * @returns {number|null} The local player id.
 */
function localPid() {
  try {
    return typeof GameContext !== "undefined" && typeof GameContext.localPlayerID === "number"
      ? GameContext.localPlayerID : null;
  } catch (_) {
    return null;
  }
}

/**
 * Load (once) the persisted dilemma state.
 * @returns {{ spree: Record<string, *[]>, age:number, count:number, lastTurn:number }} State.
 */
function state() {
  if (!_state) _state = loadState() || emptyState();
  return _state;
}

/**
 * The raw persisted state string, or null.
 * @returns {string|null} The stored JSON, or null.
 */
function readStored() {
  const g = Configuration?.getGame?.();
  const v = g && typeof g.getValue === "function" ? g.getValue(STATE_KEY) : null;
  return typeof v === "string" && v.length ? v : null;
}

/**
 * Read + parse the persisted dilemma state, or null when absent/unusable.
 * @returns {{ spree: Record<string, *[]>, age:number, count:number, lastTurn:number }|null} State.
 */
function loadState() {
  try {
    const raw = readStored();
    return raw ? normalizeState(JSON.parse(raw)) : null;
  } catch (_) {
    return null;
  }
}

/** Persist the dilemma state. */
function persist() {
  try {
    const normalized = normalizeState(_state) || emptyState();
    Configuration?.editGame?.()?.setValue?.(
      STATE_KEY,
      JSON.stringify({ v: STATE_SCHEMA_VERSION, data: normalized })
    );
  } catch (_) {
    /* ignore */
  }
}

/**
 * Fold this pass's captures into the per-aggressor spree tracker, pruning entries older than the
 * window. (A capture event = {prevOwner, newOwner, name, points}.)
 * @param {{spree:Record<string,*[]>}} s State. @param {*[]} conquests Capture events. @param {number} turn Now.
 */
function recordCaptures(s, conquests, turn) {
  const cutoff = turn - CONFIG.dilemmaWindowTurns;
  for (const c of conquests || []) {
    if (typeof c.newOwner !== "number" || typeof c.prevOwner !== "number") continue;
    const key = String(c.newOwner);
    const list = (s.spree[key] || []).filter((e) => e.turn >= cutoff);
    list.push({ turn, victim: c.prevOwner, points: c.points || 1 });
    s.spree[key] = list;
  }
  // Prune aggressors whose window has fully emptied.
  for (const key of Object.keys(s.spree)) {
    s.spree[key] = s.spree[key].filter((e) => e.turn >= cutoff);
    if (!s.spree[key].length) delete s.spree[key];
  }
}

/**
 * Whether a fresh dilemma may fire now: under the per-age cap and past the cooldown. Resets the cap
 * count when the age has advanced.
 * @param {{age:number, count:number, lastTurn:number}} s State. @param {number} turn Now. @param {number} age Age.
 * @returns {boolean} True when a dilemma may fire.
 */
function canFire(s, turn, age) {
  if (age !== s.age) {
    s.age = age;
    s.count = 0;
  }
  if (s.count >= CONFIG.dilemmaMaxPerAge) return false;
  return turn - s.lastTurn >= CONFIG.dilemmaCooldownTurns;
}

/**
 * The conquest-spree dilemma descriptor, or null: an aggressor (not the local player) who has taken
 * at least dilemmaSpreeCaptures cities in the window, whose latest victim (also not local) is fleeing
 * toward the local player.
 * @param {{spree:Record<string,*[]>}} s State. @param {number} me Local player id.
 * @returns {{kind:string, instigator:number, origin:number, points:number}|null} The descriptor, or null.
 */
function detectConquestDilemma(s, me) {
  for (const key of Object.keys(s.spree)) {
    const aggressor = Number(key);
    const list = s.spree[key];
    if (aggressor === me || list.length < CONFIG.dilemmaSpreeCaptures) continue;
    const latest = list[list.length - 1];
    if (latest.victim === me) continue; // your own fall isn't a bystander's dilemma
    const points = list.reduce((a, e) => a + (e.points || 0), 0);
    return { kind: "conquest", instigator: aggressor, origin: latest.victim, points };
  }
  return null;
}

/**
 * Sum this pass's disaster-cause migration points per NON-local civ (the survivors fleeing each
 * stricken neighbour).
 * @param {*[]} migrations The pass's migrations. @param {number} me Local player id.
 * @returns {Map<number, number>} Disaster points by source civ.
 */
function disasterWavesByCiv(migrations, me) {
  /** @type {Map<number, number>} */
  const byCiv = new Map();
  for (const m of migrations || []) {
    if (m.cause !== "disaster" || typeof m.srcOwner !== "number" || m.srcOwner === me) continue;
    byCiv.set(m.srcOwner, (byCiv.get(m.srcOwner) || 0) + (m.points || 0));
  }
  return byCiv;
}

/**
 * The plague-crisis dilemma descriptor, or null: while a plague crisis is active, the largest disaster
 * wave this pass from a non-local civ brings survivors to the local player's gates.
 * @param {*[]} migrations The pass's migrations. @param {number} me Local player id.
 * @returns {{kind:string, origin:number, points:number}|null} The descriptor, or null.
 */
function detectPlagueDilemma(migrations, me) {
  const crisis = activeCrisis();
  if (!crisis || crisis.category !== "disaster") return null;
  let best = null;
  for (const [civ, points] of disasterWavesByCiv(migrations, me)) {
    if (points >= 2 && (!best || points > best.points)) best = { kind: "plague", origin: civ, points };
  }
  return best;
}

/**
 * Apply a chosen option's light effects to the local player: a one-time gold cost and (for the two
 * "take them in" options) settling one population point into a city. Records the decision in the
 * Chronicle. No-op for "turn them away" beyond the chronicle line.
 * @param {string} choiceId The chosen option id.
 * @param {{origin:number}} d The dilemma descriptor.
 * @param {*[]} localCities The local player's city signals (largest first).
 * @param {number} me Local player id. @param {number} turn Now.
 */
function applyChoice(choiceId, d, localCities, me, turn) {
  try {
    if (choiceId === "welcome") {
      deduct(me, "YIELD_GOLD", -CONFIG.dilemmaGoldWelcome);
      settleInto(localCities[0]);
    } else if (choiceId === "frontier") {
      deduct(me, "YIELD_GOLD", -CONFIG.dilemmaGoldFrontier);
      settleInto(localCities[localCities.length - 1]);
    }
    chronicleDecision(choiceId, d, localCities[0], turn);
  } catch (_) {
    /* a dilemma outcome must never break anything */
  }
}

/**
 * Settle one population point into a city signal's settlement (the refugees who stayed).
 * @param {*} citySig A city signal, or undefined.
 */
function settleInto(citySig) {
  if (citySig && citySig.city) addRural(citySig.city);
}

/**
 * Record the player's decision in the Migration Chronicle, so the choice becomes part of the world's
 * written history.
 * @param {string} choiceId The chosen option. @param {{origin:number}} d The descriptor.
 * @param {*} hostSig The local capital signal (for a place name). @param {number} turn Now.
 */
function chronicleDecision(choiceId, d, hostSig, turn) {
  const nc = narrativeCiv(d.origin);
  const who = nc.framed ? "a people we had only heard tell of" : "the " + nc.adj;
  const place = hostSig && hostSig.city ? cityName(hostSig.city) : "your lands";
  const body = choiceId === "welcome"
    ? `You opened ${place} to the refugees of ${nc.adj}. They are your people now, or will be.`
    : choiceId === "frontier"
      ? `You sent the refugees of ${nc.adj} to the frontier, to build something of their own.`
      : `You turned the refugees of ${nc.adj} away from ${place}. They went on down the road, ${who}.`;
  chronicle({ kind: "founding", title: "A Decision at the Border", body, civ: nc.adj,
    dedupeKey: "dilemma:" + d.origin + "|" + turn });
}

/**
 * The view model for the modal: the prompt prose + the choices.
 * @param {{kind:string, instigator?:number, origin:number, points:number}} d The descriptor.
 * @param {number} turn Now.
 * @returns {{title:string, body:string, choices:{id:string,label:string,note:string}[]}} The view model.
 */
function dilemmaView(d, turn) {
  const origin = narrativeCiv(d.origin);
  const instigator = typeof d.instigator === "number" ? narrativeCiv(d.instigator) : origin;
  const people = formatPeopleExact(scaleCityPopulation(d.points, turn, "dilemma" + d.origin));
  const prompt = dilemmaPrompt({ kind: d.kind, instigator, origin, people, seed: "d" + d.origin + turn });
  return { title: prompt.title, body: prompt.body, choices: CHOICES };
}

/**
 * Per-pass entry point: maybe present a refugee dilemma. Records captures, checks the throttle, looks
 * for a trigger, and (when one fires) shows the modal wired to apply the chosen effects. Gated by the
 * Options toggle; never throws into the pass.
 * @param {*[]} conquests This pass's capture events. @param {*[]} migrations This pass's migrations.
 * @param {*[]} signals This pass's city signals.
 */
export function maybeDilemma(conquests, migrations, signals) {
  if (!getDilemmasEnabled()) return;
  const me = localPid();
  if (me == null) return;
  try {
    const s = state();
    const turn = monoTurn(); // monotonic, so the window + cooldown survive age-boundary turn resets
    recordCaptures(s, conquests, turn);
    const d = canFire(s, turn, currentAge())
      ? detectConquestDilemma(s, me) || detectPlagueDilemma(migrations, me)
      : null;
    if (d) fireDilemma(s, d, signals, me, turn);
    persist();
  } catch (_) {
    /* never disrupt a pass */
  }
}

/**
 * Stamp the throttle and present the dilemma modal, wired to apply the chosen effects to the local
 * player's cities (largest first, so "welcome" settles the capital and "frontier" a smaller town).
 * @param {{count:number, lastTurn:number}} s State. @param {*} d The descriptor.
 * @param {*[]} signals City signals. @param {number} me Local player id. @param {number} turn Now.
 */
function fireDilemma(s, d, signals, me, turn) {
  s.count += 1;
  s.lastTurn = turn;
  const localCities = (signals || [])
    .filter((x) => x.owner === me)
    .sort((a, b) => (b.population || 0) - (a.population || 0));
  showDilemma(dilemmaView(d, monoTurn()), (/** @type {string} */ id) => applyChoice(id, d, localCities, me, turn));
}

// Test hook: the pure decision pieces and persistence helpers.
export const __test = {
  recordCaptures,
  canFire,
  detectConquestDilemma,
  detectPlagueDilemma,
  CHOICES,
  readStateForTest: () => state(),
  persistStateForTest: () => persist(),
  loadStateForTest: () => loadState()
};
