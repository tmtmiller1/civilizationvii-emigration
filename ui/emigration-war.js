// emigration-war.js
//
// Who-attacked-whom tracking for Feature 1 (aggressor-aware war migration). The base
// game fires a global, public DiplomacyDeclareWar event whose payload identifies the
// aggressor and the target (corpus-confirmed: mods read data.aggressor / data.target,
// with several candidate field names since the canonical one isn't documented). We
// record victim → aggressors on declaration and clear it on peace, so refugees fleeing
// a besieged city can prefer their own civ, then neutral third parties, then the
// aggressor last (see emigration-geography.aggressorAdjust).
//
// The event is public (declaring war isn't fog-gated), so this stays consistent with
// the mod's fog-independent design. State persists in GameConfiguration.

import { registerCacheReset, resetCachesOnNewGame } from "/emigration/ui/emigration-cache-reset.js";

const STATE_KEY = "EmigrationWar_v1";
const STATE_SCHEMA_VERSION = 2;
const MAX_VICTIMS = 256;
const MAX_AGGRESSORS_PER_VICTIM = 32;

/** @type {{ wars: Record<string, number[]> } | null} */
let _state = null;
registerCacheReset(() => { _state = null; });

/**
 * @returns {{ wars: Record<string, number[]> }} Empty war state.
 */
function emptyState() {
  return { wars: {} };
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
 * Normalize one victim aggressor list (dedupe + numeric filter + cap).
 * @param {*} rawList Candidate list.
 * @returns {number[]} Sanitized aggressor ids.
 */
function normalizeAggressorList(rawList) {
  if (!Array.isArray(rawList)) return [];
  const seen = new Set();
  /** @type {number[]} */
  const list = [];
  for (const id of rawList) {
    if (list.length >= MAX_AGGRESSORS_PER_VICTIM) break;
    if (typeof id !== "number" || !isFinite(id) || seen.has(id)) continue;
    seen.add(id);
    list.push(id);
  }
  return list;
}

/**
 * Normalize wars map entries.
 * @param {*} rawWars Candidate wars map.
 * @returns {Record<string, number[]>} Sanitized wars map.
 */
function normalizeWars(rawWars) {
  /** @type {Record<string, number[]>} */
  const wars = {};
  if (!rawWars || typeof rawWars !== "object") return wars;
  let victims = 0;
  for (const [victim, rawList] of Object.entries(rawWars)) {
    if (victims >= MAX_VICTIMS) break;
    if (typeof victim !== "string" || !victim.length) continue;
    const list = normalizeAggressorList(rawList);
    if (!list.length) continue;
    wars[victim] = list;
    victims++;
  }
  return wars;
}

/**
 * Normalize a persisted war state payload (legacy or schema envelope).
 * @param {*} parsed Parsed JSON value.
 * @returns {{ wars: Record<string, number[]> }|null} Normalized state, or null.
 */
function normalizeState(parsed) {
  const payload = payloadFromBlob(parsed);
  if (!payload) return null;
  return { wars: normalizeWars(payload.wars) };
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
 * Load (once) the persisted aggressor map (victim id → aggressor ids).
 * @returns {{ wars: Record<string, number[]> }} State.
 */
function state() {
  resetCachesOnNewGame();
  if (_state) return _state;
  try {
    const raw = readStored();
    const normalized = raw ? normalizeState(JSON.parse(raw)) : null;
    if (normalized) {
      _state = normalized;
      return _state;
    }
  } catch (_) {
    /* ignore */
  }
  _state = emptyState();
  return _state;
}

/** Persist the aggressor map to GameConfiguration. */
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
 * The first numeric id among the candidates (undefined if none).
 * @param {...*} vals Candidate values.
 * @returns {number|undefined} The first number.
 */
function pickId(...vals) {
  for (const v of vals) {
    if (typeof v === "number") return v;
  }
  return undefined;
}

/**
 * Parse a DiplomacyDeclareWar / DiplomacyMakePeace payload into {aggressor, victim},
 * or null if unreadable. Reads several candidate field names (the canonical one isn't
 * documented - see the corpus).
 * @param {*} data The event payload.
 * @returns {{aggressor:number, victim:number}|null} The pairing, or null.
 */
function parseWar(data) {
  if (!data || typeof data !== "object") return null;
  // Probe-confirmed shape (API4-B): the declarer is `actingPlayer`, the target is `reactingPlayer`.
  // `initialPlayer`/`targetPlayer` are added as primary fallbacks because they're the FAR more common
  // player fields on the base game's diplomacy event data (target 112× / initial 85× vs acting 19× /
  // reacting 14× in the base UI source), so the aggressor map still populates if this build's war
  // event uses those. The rest are defensive. The migration-probe's passive DeclareWar dump confirms it.
  const aggressor = pickId(data.actingPlayer, data.initialPlayer, data.aggressor, data.attacker, data.player1);
  const victim = pickId(data.reactingPlayer, data.targetPlayer, data.target, data.victim, data.player2);
  if (typeof aggressor !== "number" || typeof victim !== "number" || aggressor === victim) return null;
  return { aggressor, victim };
}

/**
 * Record a war declaration: the aggressor is added to the victim's aggressor list.
 * @param {*} data The DiplomacyDeclareWar payload.
 */
export function recordWarDeclared(data) {
  const w = parseWar(data);
  if (!w) return;
  const s = state();
  const list = s.wars[w.victim] || (s.wars[w.victim] = []);
  if (!list.includes(w.aggressor)) list.push(w.aggressor);
  persist();
}

/**
 * Remove `aggressor` from `victim`'s list (pruning the list if it empties).
 * @param {{ wars: Record<string, number[]> }} s State.
 * @param {number} victim Victim id.
 * @param {number} aggressor Aggressor id.
 */
function unpair(s, victim, aggressor) {
  const list = s.wars[victim];
  if (!list) return;
  const i = list.indexOf(aggressor);
  if (i >= 0) list.splice(i, 1);
  if (!list.length) delete s.wars[victim];
}

/**
 * Record peace: clear the pairing in both directions.
 * @param {*} data The DiplomacyMakePeace payload.
 */
export function recordPeace(data) {
  const w = parseWar(data);
  if (!w) return;
  const s = state();
  unpair(s, w.victim, w.aggressor);
  unpair(s, w.aggressor, w.victim);
  persist();
}

/**
 * The set of player ids recorded as aggressors against `pid` (empty if none/unknown).
 * @param {number} pid Victim player id.
 * @returns {Set<number>} Aggressor ids.
 */
export function warAggressors(pid) {
  if (typeof pid !== "number") return new Set();
  const list = state().wars[pid];
  return new Set(Array.isArray(list) ? list : []);
}

/**
 * Live player ids from the engine ({@link Players.getAlive}), or [] when unavailable.
 * @returns {number[]} Alive player ids.
 */
function alivePlayerIds() {
  try {
    const alive = typeof Players !== "undefined" && Players.getAlive ? Players.getAlive() : null;
    /** @type {number[]} */
    const ids = [];
    for (const p of alive || []) {
      const id = typeof p === "number" ? p : p?.id;
      if (typeof id === "number") ids.push(id);
    }
    return ids;
  } catch (_) {
    return [];
  }
}

/**
 * Every player `victim` is CURRENTLY at war with, asked directly of the engine
 * (`Players.get(victim).Diplomacy.isAtWarWith`). This is the fog-independent source of truth that
 * backstops the event-tracked aggressor map: a war already in progress when the mod loaded (an old
 * save, or a DeclareWar payload whose fields we couldn't parse) never populated `warAggressors`, so
 * the refugee event had no second belligerent to name and fell back to "the enemy". Empty when the
 * Diplomacy API is unreadable. Includes BOTH aggressors and victims-of-`victim` (the war is mutual).
 * @param {number} victim The besieged player id.
 * @returns {Set<number>} Opponent ids at war with `victim`.
 */
function engineWarOpponents(victim) {
  /** @type {Set<number>} */
  const set = new Set();
  if (typeof victim !== "number") return set;
  const d = diplomacyWithWarTest(victim);
  if (!d) return set;
  for (const other of alivePlayerIds()) {
    if (other !== victim && atWar(d, other)) set.add(other);
  }
  return set;
}

/**
 * A player's Diplomacy object IF it exposes `isAtWarWith`, else null.
 * @param {number} victim Player id.
 * @returns {*} The Diplomacy object, or null.
 */
function diplomacyWithWarTest(victim) {
  try {
    const d = Players?.get?.(victim)?.Diplomacy;
    return d && typeof d.isAtWarWith === "function" ? d : null;
  } catch (_) {
    return null;
  }
}

/**
 * Whether a Diplomacy object reports war with `other` (guarded; false on throw).
 * @param {*} d A Diplomacy object. @param {number} other Player id.
 * @returns {boolean} True when at war.
 */
function atWar(d, other) {
  try {
    return !!d.isAtWarWith(other);
  } catch (_) {
    return false;
  }
}

/**
 * The opponents in a war the `victim` is fleeing: the event-tracked aggressors when known, else the
 * engine's live at-war set (so an untracked / pre-existing war still names the other side instead of
 * "the enemy"). Tracked aggressors are preferred because they distinguish who DECLARED; the engine
 * fallback only fills the gap when nothing was tracked.
 * @param {number} victim The besieged player id.
 * @returns {Set<number>} Opponent ids (tracked aggressors, or the live war set).
 */
export function warOpponents(victim) {
  const tracked = warAggressors(victim);
  if (tracked.size) return tracked;
  return engineWarOpponents(victim);
}
