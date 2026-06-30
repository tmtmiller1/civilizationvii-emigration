// emigration-dividend.js
//
// The carried dividend (docs/immigration-interaction-plan.md §1b) , the positive MIRROR of the
// assimilation load (emigration-effects.js): when a civ holds an attraction card (or runs a raid),
// each migrant it receives accrues a decaying per-turn BENEFIT in a chosen yield (+Science/Culture/
// Gold). This is the "raise yours" mechanism , it decouples the gain from migration throughput (the
// G1 finding), because each migrant is worth a tunable chunk regardless of how few move. State
// persists separately in GameConfiguration.

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { speedDecay } from "/emigration/ui/emigration-game-speed.js";
import { registerCacheReset, resetCachesOnNewGame } from "/emigration/ui/emigration-cache-reset.js";

const DIV_KEY = "EmigrationDividend_v1";
const DIV_SCHEMA_VERSION = 2;
const MAX_POOL_KEYS = 8192;
const MAX_TICKED_KEYS = 256;
const DIVIDEND_YIELDS = ["YIELD_SCIENCE", "YIELD_CULTURE", "YIELD_GOLD"];

/** @type {{ pool: Record<string, number>, tickedTurn: Record<string, number> } | null} */
let _div = null;
registerCacheReset(() => { _div = null; });

/**
 * @returns {{ pool: Record<string, number>, tickedTurn: Record<string, number> }} Empty dividend state.
 */
function emptyState() {
  return { pool: {}, tickedTurn: {} };
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
 * @param {*} pool Candidate pool map.
 * @returns {Record<string, number>} Sanitized pool map.
 */
function normalizePool(pool) {
  /** @type {Record<string, number>} */
  const out = {};
  if (!pool || typeof pool !== "object") return out;
  let n = 0;
  for (const [key, val] of Object.entries(pool)) {
    if (n >= MAX_POOL_KEYS) break;
    if (typeof key !== "string" || !key.length) continue;
    if (typeof val !== "number" || !isFinite(val) || !(val > 0)) continue;
    out[key] = val;
    n++;
  }
  return out;
}

/**
 * @param {*} turns Candidate tick map.
 * @returns {Record<string, number>} Sanitized tick map.
 */
function normalizeTickedTurn(turns) {
  /** @type {Record<string, number>} */
  const out = {};
  if (!turns || typeof turns !== "object") return out;
  let n = 0;
  for (const [key, val] of Object.entries(turns)) {
    if (n >= MAX_TICKED_KEYS) break;
    if (typeof key !== "string" || !key.length) continue;
    if (typeof val !== "number" || !isFinite(val)) continue;
    out[key] = Math.max(0, Math.floor(val));
    n++;
  }
  return out;
}

/**
 * @param {*} parsed Parsed persisted state.
 * @returns {{ pool: Record<string, number>, tickedTurn: Record<string, number> }|null} Normalized state.
 */
function normalizeState(parsed) {
  const payload = payloadFromBlob(parsed);
  if (!payload) return null;
  return {
    pool: normalizePool(payload.pool),
    tickedTurn: normalizeTickedTurn(payload.tickedTurn)
  };
}

/**
 * The current age-local game turn, or 0.
 * @returns {number} Game.turn or 0.
 */
function gameTurn() {
  try {
    return typeof Game !== "undefined" && typeof Game.turn === "number" ? Game.turn : 0;
  } catch (_) {
    return 0;
  }
}

/**
 * The raw persisted dividend state string, or null.
 * @returns {string|null} JSON, or null.
 */
function divReadStored() {
  const g = Configuration?.getGame?.();
  const v = g && typeof g.getValue === "function" ? g.getValue(DIV_KEY) : null;
  return typeof v === "string" && v.length ? v : null;
}

/**
 * Load (once) the persisted dividend state into the module cache.
 * @returns {{ pool: Record<string, number>, tickedTurn: Record<string, number> }} State.
 */
function divState() {
  resetCachesOnNewGame();
  if (_div) return _div;
  try {
    const raw = divReadStored();
    const normalized = raw ? normalizeState(JSON.parse(raw)) : null;
    if (normalized) {
      _div = normalized;
      return _div;
    }
  } catch (_) {
    /* ignore */
  }
  _div = emptyState();
  return _div;
}

/** Persist the dividend state to GameConfiguration. */
function divPersist() {
  try {
    const normalized = normalizeState(_div) || emptyState();
    Configuration?.editGame?.()?.setValue?.(
      DIV_KEY,
      JSON.stringify({ v: DIV_SCHEMA_VERSION, data: normalized })
    );
  } catch (_) {
    /* ignore */
  }
}

/**
 * Grant `amount` (a POSITIVE number) of a yield to a player. No-ops for non-positive amounts, bad
 * ids, or a missing grantYield API. The mirror of effects.js's `deduct`.
 * @param {number} pid Player id.
 * @param {string} yieldKey e.g. "YIELD_SCIENCE".
 * @param {number} amount Signed amount; only positive values are applied.
 */
function grant(pid, yieldKey, amount) {
  if (!(amount > 0)) return;
  try {
    const yt = typeof YieldTypes !== "undefined" ? YieldTypes[yieldKey] : undefined;
    if (yt != null && typeof Players?.grantYield === "function") {
      Players.grantYield(pid, yt, amount);
    }
  } catch (_) {
    /* ignore - a failed bonus must never break the pass */
  }
}

/**
 * Accrue a carried dividend for a civ when it receives a migrant under an attraction card. Seeds
 * the decay clock on first accrual so the first grant lands the following turn. Returns the pool
 * added (for reporting).
 * @param {number} destOwner Receiving player id.
 * @param {string} yieldKey The attraction's yield (YIELD_SCIENCE / YIELD_CULTURE / YIELD_GOLD).
 * @param {number} perMigrant Pool added per migrant (CONFIG.dividendPerMigrant).
 * @returns {number} Pool added (>= 0).
 */
export function addAttractionDividend(destOwner, yieldKey, perMigrant) {
  if (typeof destOwner !== "number" || !(perMigrant > 0)) return 0;
  const s = divState();
  s.pool[destOwner + ":" + yieldKey] = (s.pool[destOwner + ":" + yieldKey] || 0) + perMigrant;
  if (s.tickedTurn[destOwner] == null) s.tickedTurn[destOwner] = gameTurn();
  divPersist();
  return perMigrant;
}

/**
 * Decay one yield's dividend pool for `elapsed` turns and grant the capped amount. Drops a
 * negligible pool. Returns the amount granted (0 if none).
 * @param {{pool: Record<string, number>}} s Dividend state.
 * @param {number} pid Player id.
 * @param {string} yk Yield key.
 * @param {number} elapsed Turns elapsed since the last tick.
 * @returns {number} Granted amount (>= 0).
 */
function tickOneDividend(s, pid, yk, elapsed) {
  const key = pid + ":" + yk;
  const cur = s.pool[key] || 0;
  if (cur <= 0) return 0;
  // speedDecay re-bases the per-turn fade so the attraction dividend fades over the same GAME-TIME at
  // any speed (mirrors the assimilation-load fix; else the reward decayed too fast on Marathon).
  const pool = cur * Math.pow(speedDecay(CONFIG.dividendDecay), elapsed);
  if (pool < 0.05) {
    delete s.pool[key];
    return 0;
  }
  s.pool[key] = pool;
  const amt = Math.min(CONFIG.dividendCap, pool);
  grant(pid, yk, amt);
  return amt;
}

/**
 * Tick a civ's carried dividends once per turn: decay each yield's pool for the turns elapsed and
 * grant the (capped) decayed amount. Idempotent within a turn. Returns amounts by yield.
 * @param {number} pid Player id.
 * @returns {Record<string, number>} Granted amounts by yield.
 */
export function tickAttractionDividend(pid) {
  /** @type {Record<string, number>} */
  const granted = {};
  if (typeof pid !== "number") return granted;
  const s = divState();
  const last = s.tickedTurn[pid];
  if (last == null) return granted; // nothing has accrued for this civ
  const elapsed = Math.max(0, gameTurn() - last);
  if (elapsed <= 0) return granted; // already ticked this turn (or the accrual turn)
  s.tickedTurn[pid] = gameTurn();
  for (const yk of DIVIDEND_YIELDS) {
    const amt = tickOneDividend(s, pid, yk, elapsed);
    if (amt > 0) granted[yk] = amt;
  }
  divPersist();
  return granted;
}

/**
 * The current dividend pool a civ carries for a yield (read-only; does not tick).
 * @param {number} pid Player id.
 * @param {string} yieldKey The yield key.
 * @returns {number} Current pool (>= 0).
 */
export function dividendFor(pid, yieldKey) {
  if (typeof pid !== "number") return 0;
  const v = divState().pool[pid + ":" + yieldKey];
  return typeof v === "number" && isFinite(v) ? v : 0;
}
