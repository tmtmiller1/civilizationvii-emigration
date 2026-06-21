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

const STATE_KEY = "EmigrationWar_v1";

/** @type {{ wars: Record<string, number[]> } | null} */
let _state = null;

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
  if (_state) return _state;
  try {
    const raw = readStored();
    const o = raw ? JSON.parse(raw) : null;
    if (o && typeof o === "object") {
      _state = { wars: o.wars || {} };
      return _state;
    }
  } catch (_) {
    /* ignore */
  }
  _state = { wars: {} };
  return _state;
}

/** Persist the aggressor map to GameConfiguration. */
function persist() {
  try {
    Configuration?.editGame?.()?.setValue?.(STATE_KEY, JSON.stringify(_state));
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
  // reacting 14× in the base UI source) — so the aggressor map still populates if this build's war
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
