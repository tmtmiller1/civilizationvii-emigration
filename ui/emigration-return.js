// emigration-return.js
//
// Return migration (homeland recovery). A diaspora remembers where it came from. When an origin civ's
// homeland is at peace with the host and faring well, a small share of its people abroad set out for
// home: REAL population moves from the host settlement back to one of the homeland's cities, the move
// is attributed to the returnees' true origin (so the composition ledger follows them home), and the
// moment is written into the Migration Chronicle as a return.
//
// Heavily throttled (a per-host cooldown plus a small per-turn rate), so it reads as a slow ebb rather
// than a snap-back, and gated by CONFIG.returnEnabled. Defensive throughout: it never throws into the
// pass, and a half-applied move is undone rather than leaking population.

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { compositionForCity } from "/emigration/ui/emigration-composition.js";
import { cityName } from "/emigration/ui/emigration-migration-records.js";
import { removeRural, addRural, marginalPeople } from "/emigration/ui/emigration-population.js";
import { atWarBetween } from "/emigration/ui/emigration-geography.js";
import { monoTurn } from "/emigration/ui/emigration-migration-stats.js";
import { narrativeCiv } from "/emigration/ui/emigration-naming.js";
import { formatPeopleExact } from "/emigration/ui/emigration-population.js";
import { chronicle } from "/emigration/ui/emigration-chronicle.js";
import { returnLine, chronicleTitle } from "/emigration/ui/emigration-narrative.js";
import { getReturnEnabled } from "/emigration/ui/emigration-settings.js";

const STATE_KEY = "EmigrationReturn_v1";
const STATE_SCHEMA_VERSION = 2;
const MAX_HOST_ENTRIES = 8192;

/** @type {{ lastByHost: Record<string, number> } | null} Per-host last-return turn. */
let _state = null;

/**
 * @returns {{ lastByHost: Record<string, number> }} Empty cooldown state.
 */
function emptyState() {
  return { lastByHost: {} };
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
 * Normalize per-host cooldown map.
 * @param {*} map Candidate cooldown map.
 * @returns {Record<string, number>} Sanitized cooldown map.
 */
function normalizeLastByHost(map) {
  /** @type {Record<string, number>} */
  const out = {};
  if (!map || typeof map !== "object") return out;
  let n = 0;
  for (const [host, turn] of Object.entries(map)) {
    if (n >= MAX_HOST_ENTRIES) break;
    if (typeof host !== "string" || !host.length) continue;
    if (typeof turn !== "number" || !isFinite(turn)) continue;
    out[host] = Math.max(0, Math.floor(turn));
    n++;
  }
  return out;
}

/**
 * Normalize a persisted return state payload (legacy or schema envelope).
 * @param {*} parsed Parsed JSON value.
 * @returns {{ lastByHost: Record<string, number> }|null} Normalized state, or null.
 */
function normalizeState(parsed) {
  const payload = payloadFromBlob(parsed);
  if (!payload) return null;
  return { lastByHost: normalizeLastByHost(payload.lastByHost) };
}

/**
 * Load (once) the per-host cooldown state.
 * @returns {{ lastByHost: Record<string, number> }} State.
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
 * Read + parse the persisted cooldown state, or null when absent/unusable.
 * @returns {{ lastByHost: Record<string, number> }|null} State, or null.
 */
function loadState() {
  try {
    const raw = readStored();
    return raw ? normalizeState(JSON.parse(raw)) : null;
  } catch (_) {
    return null;
  }
}

/** Persist the cooldown state. */
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
 * The best receiving city for each owner: the largest-population settlement they hold (a capital-scale
 * place for returnees to come home to). Owners with no readable settlement are absent.
 * @param {*[]} signals This pass's city signals.
 * @returns {Map<number, *>} owner id → the owner's largest city signal.
 */
function homelandCitiesByOwner(signals) {
  /** @type {Map<number, *>} */
  const best = new Map();
  for (const s of signals || []) {
    if (typeof s.owner !== "number" || s.isCityState) continue; // a city-state isn't a civ "homeland"
    const cur = best.get(s.owner);
    if (!cur || (s.population || 0) > (cur.population || 0)) best.set(s.owner, s);
  }
  return best;
}

/**
 * The set of owners whose homeland is "faring well" (a recovered home worth returning to): their
 * settlements net non-negative happiness and at least one is not starving.
 * @param {*[]} signals This pass's city signals.
 * @returns {Set<number>} Prospering owner ids.
 */
function prosperingOwners(signals) {
  const set = new Set();
  for (const [owner, a] of aggregateOwnerWellbeing(signals)) {
    if (a.happy >= 0 && a.fed) set.add(owner);
  }
  return set;
}

/**
 * Aggregate per-owner wellbeing (summed happiness + whether any settlement is fed) across the
 * signals, skipping city-states (never civ homelands).
 * @param {*[]} signals This pass's city signals.
 * @returns {Map<number, {happy:number, fed:boolean}>} Per-owner wellbeing.
 */
function aggregateOwnerWellbeing(signals) {
  /** @type {Map<number, {happy:number, fed:boolean}>} */
  const agg = new Map();
  for (const s of signals || []) {
    if (typeof s.owner !== "number" || s.isCityState) continue;
    const a = agg.get(s.owner) || { happy: 0, fed: false };
    a.happy += typeof s.happiness === "number" ? s.happiness : 0;
    if (!s.starving) a.fed = true;
    agg.set(s.owner, a);
  }
  return agg;
}

/**
 * The largest foreign-origin minority in a host city that's eligible to draw returnees (share + points
 * over the configured floors), or null.
 * @param {*} comp The host city composition.
 * @returns {{civ:number, share:number, pts:number}|null} The eligible diaspora, or null.
 */
function eligibleDiaspora(comp) {
  if (!comp || typeof comp.owner !== "number") return null;
  let best = null;
  for (const c of comp.civs) {
    if (c.civ === comp.owner) continue;
    if (!best || c.pts > best.pts) best = c;
  }
  if (!best || best.share < CONFIG.returnMinShare || best.pts < CONFIG.returnMinPoints) return null;
  return best;
}

/**
 * Whether a host+origin return may fire now: the homeland exists, is prospering, is not at war with
 * the host, and the host is off cooldown.
 * @param {number} host Host owner id. @param {number} origin Origin owner id.
 * @param {string} hostKey The host cooldown key.
 * @param {{homelands:Map<number,*>, prospering:Set<number>, turn:number}} ctx The pass context.
 * @returns {boolean} True when a return is allowed.
 */
function returnAllowed(host, origin, hostKey, ctx) {
  if (!ctx.homelands.has(origin) || !ctx.prospering.has(origin)) return false;
  if (origin === host || atWarBetween(host, origin)) return false;
  const last = state().lastByHost[hostKey];
  return !(typeof last === "number" && ctx.turn - last < CONFIG.returnCooldownTurns);
}

/**
 * Move one population point of returnees from the host city home, undoing the removal if the homeland
 * can't receive it (so population is never lost). Returns whether the move applied.
 * @param {*} hostCity The host city object. @param {*} homeCity The homeland city object.
 * @returns {boolean} True when the population actually moved.
 */
function moveReturnees(hostCity, homeCity) {
  if (!removeRural(hostCity)) return false;
  if (!addRural(homeCity)) {
    addRural(hostCity); // undo: the homeland couldn't take them, so keep them where they were
    return false;
  }
  return true;
}

/**
 * Write the return into the Migration Chronicle, naming the homeland (framed as hearsay when unmet).
 * @param {number} origin Origin owner id. @param {string} hostName Host city name.
 * @param {number} people Returnees (scaled people). @param {number} turn The current turn.
 */
function chronicleReturn(origin, hostName, people, turn) {
  const nc = narrativeCiv(origin);
  const seed = hostName + "|return|" + origin + "|" + Math.floor(turn / CONFIG.returnCooldownTurns);
  const body = returnLine({
    origin: nc.adj, framed: nc.framed, city: hostName, people: formatPeopleExact(people),
    reason: "at peace again", seed
  });
  chronicle({
    kind: "return", title: chronicleTitle({ kind: "return", civ: nc.adj, city: hostName, seed }),
    body, civ: nc.adj, people, dedupeKey: "return:" + hostName + "|" + origin + "|" + turn
  });
}

/**
 * A deterministic per-(host, turn) roll honouring CONFIG.returnRate, so a return is an occasional
 * ebb rather than firing on every eligible host the moment it's off cooldown. Hash-based (no RNG), so
 * it's stable across save-reload and identical on every client.
 * @param {string} hostKey The host settlement key. @param {number} turn The current turn.
 * @returns {boolean} True when a return may proceed this pass.
 */
function returnRoll(hostKey, turn) {
  let h = 2166136261 >>> 0;
  const s = hostKey + "|" + turn;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return (h >>> 0) / 0xffffffff < CONFIG.returnRate;
}

/**
 * Mirror a one-point return move on the shared signal objects (the engine cities were just mutated):
 * one rural point leaves the host for the homeland, so the single per-pass collection stays accurate.
 * @param {*} host The host city signal. @param {*} homeCity The homeland city signal.
 */
function syncSignalsForMove(host, homeCity) {
  host.population = (host.population || 0) - 1;
  host.rural = (host.rural || 0) - 1;
  homeCity.population = (homeCity.population || 0) + 1;
  homeCity.rural = (homeCity.rural || 0) + 1;
}

/**
 * Plan and apply at most one return out of a single host settlement, returning the migration record
 * (for the flow/composition tally) or null when nothing returned.
 * @param {*} host The host city signal.
 * @param {{homelands:Map<number,*>, prospering:Set<number>, turn:number}} ctx The pass context.
 * @returns {*} A return migration record, or null.
 */
function planOneReturn(host, ctx) {
  // The host must have RURAL population to give. Eligibility above checks the composition ledger,
  // whose points include URBAN people; without this floor an urban-only diaspora would be "removed"
  // from a city that has no rural to lose while still being added at the homeland, inventing
  // population. Mirrors the engine's own emigration floor.
  if ((host.rural || 0) <= CONFIG.minRuralToEmigrate) return null;
  const dia = eligibleDiaspora(compositionForCity(host.city));
  if (!dia) return null;
  const hostKey = cityName(host.city);
  if (!returnAllowed(host.owner, dia.civ, hostKey, ctx)) return null;
  if (!returnRoll(hostKey, ctx.turn)) return null; // returnRate: occasional, deterministic
  const homeCity = ctx.homelands.get(dia.civ);
  if (!moveReturnees(host.city, homeCity.city)) return null;
  const popBefore = host.population || 0;
  syncSignalsForMove(host, homeCity); // keep the shared pass signals accurate for the accounting below
  state().lastByHost[hostKey] = ctx.turn;
  const people = marginalPeople(popBefore, ctx.turn, hostKey);
  chronicleReturn(dia.civ, hostKey, people, ctx.turn);
  return {
    srcOwner: host.owner, srcName: hostKey, destOwner: dia.civ, destName: cityName(homeCity.city),
    originCiv: dia.civ, points: 1, people, cause: "return", crossCiv: true
  };
}

/**
 * Drop per-host cooldown entries that are already past the cooldown window, so `lastByHost` stays
 * bounded over a long game. monoTurn is monotonic, so a host that has aged out is simply forgotten;
 * its absence reads as "off cooldown", which is the correct state anyway.
 * @param {number} turn The current (monotonic) turn.
 */
function pruneCooldowns(turn) {
  const m = state().lastByHost;
  for (const k of Object.keys(m)) {
    if (turn - m[k] >= CONFIG.returnCooldownTurns) delete m[k];
  }
}

/**
 * Plan and apply this pass's return migrations across the world, returning the records (to fold into
 * the pass's migrations for the flow tally + composition). No-op when disabled; never throws.
 * @param {*[]} signals This pass's city signals.
 * @returns {*[]} The return migration records.
 */
export function planReturns(signals) {
  if (!getReturnEnabled() || !(CONFIG.returnRate > 0)) return [];
  /** @type {*[]} */
  const records = [];
  try {
    const ctx = {
      turn: monoTurn(),
      homelands: homelandCitiesByOwner(signals),
      prospering: prosperingOwners(signals)
    };
    for (const host of signals || []) {
      const rec = planOneReturn(host, ctx);
      if (rec) records.push(rec);
    }
    pruneCooldowns(ctx.turn);
    persist();
  } catch (_) {
    /* return migration is non-essential; never disrupt a pass */
  }
  return records;
}

// Test hook: the pure decision pieces (the engine-mutating planOneReturn is exercised in-game).
export const __test = { eligibleDiaspora, prosperingOwners, homelandCitiesByOwner, returnAllowed };
