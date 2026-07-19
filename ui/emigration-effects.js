// emigration-effects.js
//
// The gameplay-WRITE layer for the ASSIMILATION cost of migration, applied from the UI VM via
// `Players.grantYield`. This is what gives population growth a cost in Civ VII (where raw
// population is otherwise "free" - see docs/civ7-mechanics-and-feasibility.md §4).
//
// Assimilation load (duration-based): each migrant adds "load" to the receiving civ; the load
// DECAYS each turn (= the assimilation duration) and the civ pays a per-turn grantYield cost
// proportional to its current load. Scoped to migrated population only - natural growth never adds
// load. So a magnet civ that keeps pulling people in keeps paying, and the cost fades as newcomers
// integrate. State persists in GameConfiguration. The congestion headwind (Algorithm C) reads the
// per-capita load as a pull penalty.
//
// Sibling write-layers split out for cohesion: the carried dividend (the positive mirror) lives in
// emigration-dividend.js; the migrant-holding penalty in emigration-migrant-units.js. Both reuse
// the `deduct`/grant grantYield wrappers. Probe-confirmed: grantYield deducts cross-civ for gold. The
// Cultural Quarter yields reuse the same per-turn grantYield path (grantSigned/applyQuarterYields).

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { civTuning } from "/emigration/ui/emigration-civ-tuning.js";
import { speedDecay } from "/emigration/ui/emigration-game-speed.js";
import { registerCacheReset, resetCachesOnNewGame } from "/emigration/ui/emigration-cache-reset.js";

const STATE_KEY = "EmigrationAssim_v1";

/** @type {{ load: Record<string, number>, tickedTurn: Record<string, number> } | null} */
let _state = null;
registerCacheReset(() => { _state = null; });

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
 * Turns elapsed since a per-key marker, rebasing an absent/stale-future marker down to the
 * current turn first (F1): Game.turn resets at age boundaries, so a marker left above `turn`
 * would pin elapsed to 0 forever and freeze decay; pulling it down lets decay resume.
 * @param {Record<string, number>} map Per-key turn markers.
 * @param {number} key The entry key.
 * @param {number} turn Current game turn.
 * @returns {number} Non-negative turns elapsed.
 */
function elapsedSince(map, key, turn) {
  const prev = map[key];
  if (prev == null || prev > turn) map[key] = turn;
  return Math.max(0, turn - map[key]);
}

/**
 * The raw persisted assimilation state string, or null.
 * @returns {string|null} JSON, or null.
 */
function readStored() {
  const g = Configuration?.getGame?.();
  const v = g && typeof g.getValue === "function" ? g.getValue(STATE_KEY) : null;
  return typeof v === "string" && v.length ? v : null;
}

/**
 * Load the persisted state (once) into the module cache.
 * @returns {{ load: Record<string, number>, tickedTurn: Record<string, number> }} State.
 */
function state() {
  resetCachesOnNewGame();
  if (_state) return _state;
  try {
    const raw = readStored();
    const o = raw ? JSON.parse(raw) : null;
    if (o && typeof o === "object") {
      _state = { load: o.load || {}, tickedTurn: o.tickedTurn || {} };
      return _state;
    }
  } catch (_) {
    /* ignore */
  }
  _state = { load: {}, tickedTurn: {} };
  return _state;
}

/** Persist the assimilation state to GameConfiguration. */
function persist() {
  try {
    Configuration?.editGame?.()?.setValue?.(STATE_KEY, JSON.stringify(_state));
  } catch (_) {
    /* ignore */
  }
}

/**
 * Deduct `amount` (a NEGATIVE number) of a yield from a player. No-ops for non-negative amounts,
 * bad ids, or a missing grantYield API. Shared by the migrant-holding penalty.
 * @param {number} pid Player id.
 * @param {string} yieldKey e.g. "YIELD_HAPPINESS".
 * @param {number} amount Signed amount; only negative values are applied.
 */
export function deduct(pid, yieldKey, amount) {
  if (!(amount < 0)) return;
  try {
    const yt = typeof YieldTypes !== "undefined" ? YieldTypes[yieldKey] : undefined;
    if (yt != null && typeof Players?.grantYield === "function") {
      Players.grantYield(pid, yt, amount);
    }
  } catch (_) {
    /* ignore - a failed cost must never break the pass */
  }
}

/**
 * Add assimilation load to a destination civ when it receives a migrant. Load = base × (1 + perPop
 * × destPop), so absorbing into a larger settlement adds more (overcrowding). Seeds the decay clock
 * on first load so the next tick has a turn to decay from. Returns the load added (for reporting).
 * @param {number} destOwner Receiving player id.
 * @param {number} destPopulation Receiving settlement's population.
 * @returns {number} Load added (>= 0).
 */
export function addAssimilationLoad(destOwner, destPopulation) {
  if (typeof destOwner !== "number") return 0;
  const pop = destPopulation > 0 ? destPopulation : 0;
  const added = CONFIG.assimilationLoadPerMigrant * (1 + CONFIG.assimilationCostPerPop * pop);
  if (!(added > 0)) return 0;
  const s = state();
  s.load[destOwner] = (s.load[destOwner] || 0) + added;
  if (s.tickedTurn[destOwner] == null) s.tickedTurn[destOwner] = gameTurn();
  persist();
  return added;
}

/**
 * Tick a civ's assimilation load once per turn: decay it for the turns elapsed and charge a
 * grantYield cost proportional to the (decayed) load. Idempotent within a turn. Returns the load
 * and amounts charged.
 * @param {number} pid Player id.
 * @returns {{load:number, happiness:number, gold:number}} Outcome.
 */
export function tickAssimilation(pid) {
  const none = { load: 0, happiness: 0, gold: 0 };
  if (typeof pid !== "number") return none;
  const s = state();
  const cur = s.load[pid] || 0;
  if (cur <= 0) return none;
  const turn = gameTurn();
  const elapsed = elapsedSince(s.tickedTurn, pid, turn); // F1: rebases a stale age-reset marker
  if (elapsed <= 0) return { load: cur, happiness: 0, gold: 0 };
  s.tickedTurn[pid] = turn;
  // integrationSpeed (civ tuning): >1 clears the load faster, <1 slower. speedDecay re-bases the
  // per-turn fade so the integration cost clears over the same GAME-TIME at any speed (else it cleared
  // ~3× too fast on Marathon and lingered on Online).
  const load = cur * Math.pow(speedDecay(CONFIG.assimilationDecay), civTuning(pid).integrationSpeed * elapsed);
  if (load < 0.05) {
    delete s.load[pid];
    persist();
    return none;
  }
  s.load[pid] = load;
  const out = chargeAssimilation(pid, load);
  persist();
  return out;
}

/**
 * A civ's current gold balance (treasury), or null when unreadable. Mirrors the probe's accessor
 * order (goldBalance field, then getGoldBalance()).
 * @param {number} pid Player id.
 * @returns {number|null} Gold balance, or null off-engine / when absent.
 */
function goldBalanceFor(pid) {
  try {
    const t = typeof Players !== "undefined" ? Players.get?.(pid)?.Treasury : null;
    if (t && typeof t.goldBalance === "number") return t.goldBalance;
    if (t && typeof t.getGoldBalance === "function") return t.getGoldBalance();
  } catch (_) {
    // Players.get / Treasury can be absent or throw mid age-transition.
  }
  return null;
}

/**
 * The bounded wealth-aware multiplier on the GOLD assimilation cost (P1.4): ×1 at the reference
 * treasury, scaling up for richer civs and down for poorer ones, clamped to [min, max]. Returns 1
 * (no effect) when the weight is 0 or the treasury can't be read, so a missing read never
 * over-charges a civ.
 * @param {number} pid Player id.
 * @returns {number} A multiplier in [assimilationWealthMin, assimilationWealthMax].
 */
function wealthCostMultiplier(pid) {
  const weight = CONFIG.assimilationWealthWeight;
  if (!(weight > 0)) return 1;
  const balance = goldBalanceFor(pid);
  if (balance == null) return 1;
  const ref = Math.max(1, CONFIG.assimilationWealthRef);
  const raw = 1 + weight * (balance / ref - 1);
  return Math.min(CONFIG.assimilationWealthMax, Math.max(CONFIG.assimilationWealthMin, raw));
}

/**
 * The per-turn gold cost for a load, with the civ-tuning ease and the wealth-aware multiplier.
 * @param {number} pid Player id.
 * @param {number} load Current load.
 * @returns {number} Gold cost (>= 0).
 */
function assimilationGoldCost(pid, load) {
  // assimilationEase (civ tuning): scales the confirmed gold lever (variance, no runaway).
  // wealthCostMultiplier (P1.4): bends the cost by the civ's treasury context.
  const base = CONFIG.assimilationGold * load * civTuning(pid).assimilationEase;
  return base * wealthCostMultiplier(pid);
}

/**
 * Deduct the per-turn assimilation cost for a given load and return the amounts.
 * @param {number} pid Player id.
 * @param {number} load Current load.
 * @returns {{load:number, happiness:number, gold:number}} Outcome.
 */
function chargeAssimilation(pid, load) {
  const happiness = CONFIG.assimilationHappiness * load;
  const gold = assimilationGoldCost(pid, load);
  deduct(pid, "YIELD_HAPPINESS", -happiness);
  deduct(pid, "YIELD_GOLD", -gold);
  return { load, happiness, gold };
}

/**
 * The current assimilation load a civ is carrying (read-only; does not tick).
 * @param {number} pid Player id.
 * @returns {number} Current load (>= 0).
 */
export function assimLoadFor(pid) {
  if (typeof pid !== "number") return 0;
  const v = state().load[pid];
  return typeof v === "number" && isFinite(v) ? v : 0;
}

/**
 * The per-turn assimilation cost a civ WOULD pay on its CURRENT load, without ticking or mutating
 * state, for the city readout / dashboards. Mirrors `chargeAssimilation`'s formula.
 * @param {number} pid Player id.
 * @returns {{load:number, happiness:number, gold:number}} Current load and the per-turn cost.
 */
export function assimilationCostFor(pid) {
  const load = assimLoadFor(pid);
  if (!(load > 0)) return { load: 0, happiness: 0, gold: 0 };
  const happiness = CONFIG.assimilationHappiness * load;
  const gold = assimilationGoldCost(pid, load);
  return { load, happiness, gold };
}

/**
 * The congestion headwind (Algorithm C): a pull penalty for migrating INTO a civ that's still
 * digesting lots of newcomers, scaling with its per-capita assimilation load. A structural
 * anti-runaway brake (a heavy magnet cools off) that can't be out-golded. Returns 0 when
 * congestWeight is 0 or the civ carries no load.
 * @param {number} pid Destination player id.
 * @param {number} civPopulation The destination civ's total population.
 * @returns {number} A non-negative pull penalty.
 */
export function congestionPenalty(pid, civPopulation) {
  if (!(CONFIG.congestWeight > 0)) return 0;
  const load = assimLoadFor(pid);
  if (!(load > 0)) return 0;
  return CONFIG.congestWeight * (load / Math.max(1, civPopulation));
}

/**
 * Grant a SIGNED amount of a yield to a player (the two-sided sibling of {@link deduct}, which only
 * ever applies costs). Used for the per-turn Cultural Quarter yields, where a benefit is granted and
 * a drawback deducted each turn from the tile's current record. No-ops for a zero amount, a bad id, or
 * a missing grantYield API; never throws.
 * @param {number} pid Player id. @param {string} yieldKey e.g. "YIELD_CULTURE". @param {number} amount Signed amount.
 */
function grantSigned(pid, yieldKey, amount) {
  if (typeof pid !== "number" || !(Math.abs(amount) > 0)) return;
  try {
    const yt = typeof YieldTypes !== "undefined" ? YieldTypes[yieldKey] : undefined;
    if (yt != null && typeof Players?.grantYield === "function") {
      Players.grantYield(pid, yt, amount);
    }
  } catch (_) {
    /* ignore - a one-time yield must never break the pass */
  }
}

/**
 * @typedef {{benefitYield:(string|null), benefitAmount:number,
 *   penaltyYield:(string|null), penaltyAmount:number}} QuarterApplied
 */

/**
 * Apply a Cultural Quarter's yields to the host for ONE turn: grant its benefit and charge its
 * drawback. Called every turn from the quarter tick against whatever record currently holds the tile
 * (a one-time grant of Happiness/Culture was wiped by the engine's per-turn recompute and never
 * showed). The amounts are read from the record's `applied` block (resolved from CONFIG at formation).
 * A `benefitScale` < 1 shrinks only the BENEFIT (a contested enclave gives less good while at war with
 * its homeland); the drawback is always charged in full.
 * @param {number} owner Host player id.
 * @param {QuarterApplied} applied The resolved yields.
 * @param {number} [benefitScale] Multiplier on the benefit amount (default 1 = full).
 */
export function applyQuarterYields(owner, applied, benefitScale = 1) {
  if (!applied) return;
  const { benefitYield, benefitAmount, penaltyYield, penaltyAmount } = applied;
  const scaled = benefitAmount * (benefitScale >= 0 ? benefitScale : 1);
  if (benefitYield && scaled > 0) grantSigned(owner, benefitYield, scaled);
  if (penaltyYield && penaltyAmount > 0) grantSigned(owner, penaltyYield, -penaltyAmount);
}

/**
 * Reverse one turn's worth of a Cultural Quarter's yields on a host (grant the exact inverse). Retained
 * as the exact mirror of {@link applyQuarterYields} for tests and for any caller that needs to undo a
 * single turn's application; the per-turn model itself needs no reversal (the tile's current record is
 * the single source of truth, so a change-of-hands self-corrects on the next tick).
 * @param {number} owner Host player id.
 * @param {QuarterApplied} applied The resolved yields.
 */
export function reverseQuarterYields(owner, applied) {
  if (!applied) return;
  const { benefitYield, benefitAmount, penaltyYield, penaltyAmount } = applied;
  if (benefitYield && benefitAmount > 0) grantSigned(owner, benefitYield, -benefitAmount);
  if (penaltyYield && penaltyAmount > 0) grantSigned(owner, penaltyYield, penaltyAmount);
}
