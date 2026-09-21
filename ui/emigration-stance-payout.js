// emigration-stance-payout.js
//
// What an enclave stance pays, ONCE, when its host recognizes the enclave. A stance pays Gold, Influence,
// Science or Culture, and one that does not pay Gold costs Gold: those are the only yields a script can
// grant, and Gold is the only one it can take (engine-closed.md; mod tests 152-153, 2026-09-18). Science
// lands on the tech being researched, Culture on the civic being researched.
//
// The amounts are sized to the host's own economy, so a stance is worth the same share of an empire in
// every age and at every speed: the payout is a number of turns of the host's own income of that yield,
// and the price a number of turns of its Gold income. Each is held above a per-age floor (so a poor or
// Influence-starved host still gets a meaningful sum), and the whole figure is multiplied by the game-speed
// scalar (research costs scale with speed while income per turn does not). Amounts round to the nearest 5.
//
// Pure apart from the engine reads (income, treasury, age), each guarded; off-engine every rate reads 0,
// so the floors decide and the tests see stable numbers.

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { gameSpeedScalar } from "/emigration/ui/emigration-game-speed.js";
import { grantSigned } from "/emigration/ui/emigration-effects.js";

/** The yields a stance may pay; anything else pays nothing. */
const PAYABLE = Object.freeze(["YIELD_GOLD", "YIELD_DIPLOMACY", "YIELD_SCIENCE", "YIELD_CULTURE"]);
const GOLD = "YIELD_GOLD";
const AGES = Object.freeze(["AGE_ANTIQUITY", "AGE_EXPLORATION", "AGE_MODERN"]);

/** A finite number or 0. @param {*} v Any value. @returns {number} The number. */
function num(v) {
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

/**
 * The current age's position (0 Antiquity, 1 Exploration, 2 Modern), or 0 off-engine.
 * @returns {number} The age index.
 */
export function ageIndex() {
  try {
    if (typeof Game === "undefined" || typeof GameInfo === "undefined") return 0;
    const row = GameInfo.Ages.lookup(Game.age);
    const i = row ? AGES.indexOf(row.AgeType) : -1;
    return i >= 0 ? i : 0;
  } catch (_) {
    return 0;
  }
}

/**
 * The host's own net income of a yield per turn, never below 0 (0 off-engine or unreadable).
 * @param {number} pid Player id. @param {string} yieldKey e.g. "YIELD_CULTURE". @returns {number} Per turn.
 */
function incomeOf(pid, yieldKey) {
  try {
    const p = Players.get(pid);
    const yt = YieldTypes[yieldKey];
    return p && yt != null ? Math.max(0, num(p.Stats.getNetYield(yt))) : 0;
  } catch (_) {
    return 0;
  }
}

/**
 * The host's Gold on hand, or Infinity when it cannot be read (so an unreadable treasury never blocks).
 * @param {number} pid Player id. @returns {number} The balance.
 */
export function goldOnHand(pid) {
  try {
    const v = Number(Players.get(pid).Treasury.goldBalance);
    return isFinite(v) ? v : Infinity;
  } catch (_) {
    return Infinity;
  }
}

/** @param {number} v @returns {number} v rounded to the nearest 5, never below 5 when v > 0. */
function round5(v) {
  return v > 0 ? Math.max(5, Math.round(v / 5) * 5) : 0;
}

/**
 * The least any payout or price is in the current age, before the speed scalar.
 * @returns {number} The floor.
 */
function ageFloor() {
  const floors = Array.isArray(CONFIG.quarterStanceFloor) ? CONFIG.quarterStanceFloor : [];
  const i = ageIndex();
  return Math.max(0, num(floors[Math.min(i, floors.length - 1)]));
}

/**
 * The one-time payout and price of a stance for a host, as an `applied` record: `once` marks it as paid at
 * recognition (never per turn). The passive stance, or one naming a yield a script cannot grant, pays and
 * costs nothing. A contested enclave (host at war with the enclave's homeland) pays `benefitScale` of its
 * payout; its price is unchanged.
 * @param {{benefitYield:(string|null)}} option The offered option. @param {number} pid Host player id.
 * @param {number} [benefitScale] Multiplier on the payout (default 1).
 * @returns {{benefitYield:(string|null), benefitAmount:number, penaltyYield:(string|null), penaltyAmount:number,
 *   once:boolean}} The payout.
 */
export function stancePayout(option, pid, benefitScale = 1) {
  const pays = option && typeof option.benefitYield === "string" && PAYABLE.includes(option.benefitYield)
    ? option.benefitYield : null;
  if (!pays) return { benefitYield: null, benefitAmount: 0, penaltyYield: null, penaltyAmount: 0, once: true };
  const speed = Math.max(0.1, num(gameSpeedScalar()) || 1);
  const floor = ageFloor();
  const isGold = pays === GOLD;
  const turns = Math.max(0, num(isGold ? CONFIG.quarterGoldStanceTurns : CONFIG.quarterStanceTurns));
  const scale = Math.max(0, Math.min(1, num(benefitScale)));
  const benefit = round5(speed * Math.max(floor, turns * incomeOf(pid, pays)) * scale);
  const price = isGold ? 0 : round5(speed * Math.max(floor * Math.max(0, num(CONFIG.quarterStanceCostFloorScale)),
    Math.max(0, num(CONFIG.quarterStanceCostTurns)) * incomeOf(pid, GOLD)));
  return {
    benefitYield: pays, benefitAmount: benefit, penaltyYield: price > 0 ? GOLD : null, penaltyAmount: price, once: true
  };
}

/**
 * Whether the host can pay a stance's price from the Gold it holds now.
 * @param {{penaltyYield:(string|null), penaltyAmount:number}} payout A {@link stancePayout} result.
 * @param {number} pid Host player id. @returns {boolean} True when affordable (or free).
 */
export function affordable(payout, pid) {
  return !(payout && payout.penaltyYield === GOLD && payout.penaltyAmount > goldOnHand(pid));
}

/**
 * Pay a stance to its host: grant the payout and charge the price. Never throws.
 * @param {number} pid Host player id. @param {{benefitYield:(string|null), benefitAmount:number,
 *   penaltyYield:(string|null), penaltyAmount:number}} payout A {@link stancePayout} result.
 */
export function payStance(pid, payout) {
  if (!payout) return;
  if (payout.benefitYield && payout.benefitAmount > 0) grantSigned(pid, payout.benefitYield, payout.benefitAmount);
  if (payout.penaltyYield && payout.penaltyAmount > 0) grantSigned(pid, payout.penaltyYield, -payout.penaltyAmount);
}

// Test hook.
export const __test = { PAYABLE, round5, ageFloor, incomeOf };
