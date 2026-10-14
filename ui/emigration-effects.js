// emigration-effects.js
//
// The gameplay-write layer for the assimilation cost of migration, applied via `Players.grantYield`.
// Each migrant adds "load" to the receiving civ; the load decays each turn and the civ pays a
// per-turn cost proportional to it (natural growth never adds load). State persists in
// GameConfiguration; the congestion headwind reads the per-capita load as a pull penalty. The
// `deduct`/`grantSigned` wrappers are shared by the dividend, migrant-unit and Cultural Quarter write paths.

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
 * @returns {number}
 */
function gameTurn() {
  try {
    return typeof Game !== "undefined" && typeof Game.turn === "number" ? Game.turn : 0;
  } catch (_) {
    return 0;
  }
}

/**
 * Turns elapsed since a per-key marker, rebasing an absent/stale-future marker down to the current
 * turn first: Game.turn resets at age boundaries, so a marker left above `turn` would freeze decay.
 * @param {Record<string, number>} map Per-key turn markers.
 * @param {number} key
 * @param {number} turn Current game turn.
 * @returns {number} Non-negative turns elapsed.
 */
function elapsedSince(map, key, turn) {
  const prev = map[key];
  if (prev == null || prev > turn) map[key] = turn;
  return Math.max(0, turn - map[key]);
}

/**
 * @returns {string|null}
 */
function readStored() {
  const g = Configuration?.getGame?.();
  const v = g && typeof g.getValue === "function" ? g.getValue(STATE_KEY) : null;
  return typeof v === "string" && v.length ? v : null;
}

/**
 * @returns {{ load: Record<string, number>, tickedTurn: Record<string, number> }}
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

function persist() {
  try {
    Configuration?.editGame?.()?.setValue?.(STATE_KEY, JSON.stringify(_state));
  } catch (_) {
    /* ignore */
  }
}

/**
 * Deduct `amount` (a negative number) of a yield from a player. No-ops for non-negative amounts,
 * bad ids, or a missing grantYield API. Shared by the migrant-holding penalty.
 * @param {number} pid
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
    /* ignore: a failed cost must never break the pass */
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
 * @param {number} pid
 * @returns {{load:number, happiness:number, gold:number}}
 */
export function tickAssimilation(pid) {
  const none = { load: 0, happiness: 0, gold: 0 };
  if (typeof pid !== "number") return none;
  const s = state();
  const cur = s.load[pid] || 0;
  if (cur <= 0) return none;
  const turn = gameTurn();
  const elapsed = elapsedSince(s.tickedTurn, pid, turn); // rebases a stale age-reset marker
  if (elapsed <= 0) return { load: cur, happiness: 0, gold: 0 };
  s.tickedTurn[pid] = turn;
  // integrationSpeed (civ tuning): >1 clears the load faster, <1 slower. speedDecay re-bases the
  // per-turn fade so the integration cost clears over the same game-time at any speed (else it cleared
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
 * @param {number} pid
 * @returns {number|null}
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
 * The bounded wealth-aware multiplier on the gold assimilation cost: ×1 at the reference treasury,
 * scaling up for richer civs and down for poorer ones, clamped to [min, max]. Returns 1 when the
 * weight is 0 or the treasury can't be read.
 * @param {number} pid
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
 * @param {number} pid
 * @param {number} load Current load.
 * @returns {number} Gold cost (>= 0).
 */
function assimilationGoldCost(pid, load) {
  // assimilationEase (civ tuning) scales the gold lever; wealthCostMultiplier bends the cost by the
  // civ's treasury context.
  const base = CONFIG.assimilationGold * load * civTuning(pid).assimilationEase;
  return base * wealthCostMultiplier(pid);
}

/**
 * @param {number} pid
 * @param {number} load
 * @returns {{load:number, happiness:number, gold:number}}
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
 * @param {number} pid
 * @returns {number} Current load (>= 0).
 */
export function assimLoadFor(pid) {
  if (typeof pid !== "number") return 0;
  const v = state().load[pid];
  return typeof v === "number" && isFinite(v) ? v : 0;
}

/**
 * The per-turn assimilation cost a civ would pay on its current load, without ticking or mutating
 * state, for the city readout / dashboards. Mirrors `chargeAssimilation`'s formula.
 * @param {number} pid
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
 * The congestion headwind: a pull penalty for migrating into a civ that's still digesting lots of
 * newcomers, scaling with its per-capita assimilation load (an anti-runaway brake that can't be
 * out-golded). Returns 0 when congestWeight is 0 or the civ carries no load.
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
 * Grant a signed amount of a yield to a player (the two-sided sibling of {@link deduct}), used for
 * the Cultural Quarter yields. No-ops for a zero amount, a bad id, or a missing grantYield API; never throws.
 * @param {number} pid @param {string} yieldKey e.g. "YIELD_CULTURE". @param {number} amount Signed amount.
 */
export function grantSigned(pid, yieldKey, amount) {
  if (typeof pid !== "number" || !(Math.abs(amount) > 0)) return;
  try {
    const yt = typeof YieldTypes !== "undefined" ? YieldTypes[yieldKey] : undefined;
    if (yt != null && typeof Players?.grantYield === "function") {
      Players.grantYield(pid, yt, amount);
    }
  } catch (_) {
    /* ignore: a one-time yield must never break the pass */
  }
}

/**
 * @typedef {{benefitYield:(string|null), benefitAmount:number,
 *   penaltyYield:(string|null), penaltyAmount:number, once?:boolean}} QuarterApplied
 */

/**
 * Apply a Cultural Quarter's yields to the host for one turn: grant its benefit and charge its
 * drawback, from the record's `applied` block. A `benefitScale` < 1 shrinks only the benefit (a
 * contested enclave); the drawback is always charged in full.
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
 * Reverse one turn's worth of a Cultural Quarter's yields on a host (grant the exact inverse): the
 * exact mirror of {@link applyQuarterYields}, for tests and any caller that needs to undo a single turn.
 * @param {number} owner Host player id.
 * @param {QuarterApplied} applied The resolved yields.
 */
export function reverseQuarterYields(owner, applied) {
  if (!applied) return;
  const { benefitYield, benefitAmount, penaltyYield, penaltyAmount } = applied;
  if (benefitYield && benefitAmount > 0) grantSigned(owner, benefitYield, -benefitAmount);
  if (penaltyYield && penaltyAmount > 0) grantSigned(owner, penaltyYield, penaltyAmount);
}
