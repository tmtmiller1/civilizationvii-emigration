// emigration-call-home.js
//
// "Call our people home": a paid, player-initiated attempt to bring displaced population back to the
// settlement it left, sized by the player (callHomeTiers) on a CONVEX price curve (callHomeCost). An
// INTERNAL call (people in your own settlements) is a purchase: everyone paid for comes. An EXTERNAL
// call (people under another civ) is a gamble: each person is rolled against callHomeChanceExternal
// and the fee is spent regardless. The roll is seeded from game id, pair and turn, so it cannot be re-rolled.
import { CONFIG } from "/emigration/ui/emigration-config.js";
import { migrationFlows } from "/emigration/ui/emigration-migration-stats.js";
import { isRefugeeCause } from "/emigration/ui/emigration-causes.js";

/** Currency choices for the fee. */
export const CALL_HOME_CURRENCY = Object.freeze({ GOLD: 0, INFLUENCE: 1 });
/** The two variants. */
export const CALL_HOME_SCOPE = Object.freeze({ INTERNAL: "internal", EXTERNAL: "external" });

/**
 * The per-point chance that a called person comes. Internal calls are certain (a purchase, not a roll);
 * external calls use the tunable, clamped to 0..1.
 * @param {string} scope A CALL_HOME_SCOPE. @returns {number} The chance.
 */
export function callHomeChance(scope) {
  if (scope !== CALL_HOME_SCOPE.EXTERNAL) return 1;
  const raw = Number(CONFIG.callHomeChanceExternal);
  return Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 0;
}

/**
 * How steeply the fee climbs with the size of the call: base × n ^ COST_EXPONENT. At 1.5, two people cost about
 * 2.8× one and three about 5.2×, so every extra person is dearer than the last. The first to come home are the
 * eager ones; the stragglers have to be coaxed, and a big call is a decision, not a bulk order.
 */
const COST_EXPONENT = 1.5;

/** The ages in order; a call costs callHomeAgeCostStep times more per age past Antiquity. */
const AGE_ORDER = ["AGE_ANTIQUITY", "AGE_EXPLORATION", "AGE_MODERN"];

/**
 * How much dearer a call is in a given age: callHomeAgeCostStep raised to the age's index (Antiquity ×1,
 * Exploration ×step, Modern ×step²), since treasuries grow by a similar order across the ages. An
 * unknown or missing age counts as Antiquity.
 * @param {string} [ageType] An AgeType such as "AGE_EXPLORATION" (default: the live age).
 * @returns {number} The multiplier (at least 1).
 */
export function callHomeAgeScale(ageType) {
  const idx = Math.max(0, AGE_ORDER.indexOf(ageType === undefined ? liveAgeType() : ageType));
  const step = Number(CONFIG.callHomeAgeCostStep);
  return Math.pow(Number.isFinite(step) && step >= 1 ? step : 1, idx);
}

/**
 * The fee for a call of a given size, in the chosen currency: CONVEX in the size (see COST_EXPONENT), scaled
 * up for the external variant because it asks people to leave another ruler's city, and scaled by the age
 * (see callHomeAgeScale). Internally the fee buys that many people; abroad it buys that many attempts.
 * @param {number} points How many people the call is for. @param {string} scope A CALL_HOME_SCOPE.
 * @param {number} currency A CALL_HOME_CURRENCY. @param {string} [ageType] The age (default: live).
 * @returns {number} The fee (never negative).
 */
export function callHomeCost(points, scope, currency, ageType) {
  const n = Math.max(0, Math.floor(Number(points) || 0));
  if (n <= 0) return 0;
  const per = currency === CALL_HOME_CURRENCY.INFLUENCE
    ? Number(CONFIG.callHomeInfluencePerPoint)
    : Number(CONFIG.callHomeGoldPerPoint);
  const base = Number.isFinite(per) ? Math.max(0, per) : 0;
  const mult = scope === CALL_HOME_SCOPE.EXTERNAL ? Number(CONFIG.callHomeExternalCostScale) || 1 : 1;
  return Math.round(base * Math.pow(n, COST_EXPONENT) * mult * callHomeAgeScale(ageType));
}

/**
 * The live AgeType, or "" off-engine or mid-transition. Game.age is a numeric hash (engine-closed.md), so it
 * has to go through the Ages table.
 * @returns {string} The AgeType.
 */
function liveAgeType() {
  try {
    if (typeof Game === "undefined" || Game.age === undefined) return "";
    const row = typeof GameInfo !== "undefined" ? GameInfo.Ages?.lookup?.(Game.age) : null;
    return row && typeof row.AgeType === "string" ? row.AgeType : "";
  } catch (_) {
    return "";
  }
}

/**
 * The sizes a call is offered in: one person, about half of what is callable, and all of it,
 * deduplicated and ascending. Three buttons per currency is as tall as the dialog should get, and the
 * three sizes cover "just the one", "a fair share" and "everyone".
 * @param {number} max The most points one call may bring. @returns {number[]} The sizes, ascending.
 */
export function callHomeTiers(max) {
  const cap = Math.max(0, Math.floor(Number(max) || 0));
  if (cap <= 0) return [];
  return [...new Set([1, Math.ceil(cap / 2), cap])].sort((a, b) => a - b);
}

/**
 * Candidate pairs for one player: where their displaced people went, and where they came from. Internal
 * pairs are moves between the player's OWN settlements; external pairs are the player's people living
 * under another civilization. Only refugee-shaped causes count.
 * @param {number} pid The player id. @param {*[]} [flows] Flow rows (defaults to the live matrix).
 * @returns {{internal:*[], external:*[]}} Candidate pairs, richest first.
 */
export function callHomeCandidates(pid, flows) {
  const rows = Array.isArray(flows) ? flows : safeFlows();
  /** @type {*[]} */ const internal = [];
  /** @type {*[]} */ const external = [];
  for (const f of rows) {
    if (!f || f.src !== pid) continue;
    const pts = refugeePoints(f.byCause, f.points);
    if (pts <= 0 || !f.srcCity || !f.destCity || f.srcCity === f.destCity) continue;
    const row = { from: f.destCity, home: f.srcCity, points: pts, host: f.dest };
    if (f.dest === pid) internal.push(row);
    else external.push(row);
  }
  const bySize = (/** @type {*} */ a, /** @type {*} */ b) => b.points - a.points;
  return { internal: internal.sort(bySize), external: external.sort(bySize) };
}

/**
 * What a call would look like: how many people it is for, what it costs, and the odds. `want` narrows the
 * call to the size the player picked; it can never exceed the per-call cap.
 * @param {number} pid The player id. @param {string} scope A CALL_HOME_SCOPE.
 * @param {number} currency A CALL_HOME_CURRENCY. @param {*[]} [flows] Flow rows (defaults to live).
 * @param {number} [want] How many the player asked for (default: as many as the cap allows).
 * @returns {{scope:string, available:number, points:number, cost:number, chance:number, pairs:*[]}} The quote.
 */
export function callHomeQuote(pid, scope, currency, flows, want) {
  const cands = callHomeCandidates(pid, flows);
  const pairs = scope === CALL_HOME_SCOPE.EXTERNAL ? cands.external : cands.internal;
  const available = pairs.reduce((n, p) => n + p.points, 0);
  const cap = Math.max(0, Math.floor(Number(CONFIG.callHomeMaxPointsPerAttempt) || 0));
  const asked = Number.isFinite(Number(want)) && Number(want) > 0 ? Math.floor(Number(want)) : cap;
  const points = Math.min(available, cap, asked);
  return { scope, available, points, pairs,
    cost: callHomeCost(points, scope, currency), chance: callHomeChance(scope) };
}

/**
 * Roll one point, seeded so a reload cannot change the answer.
 * @param {string} seed A stable seed for this attempt. @param {number} chance 0..1. @returns {boolean} Came home.
 */
export function callHomeRoll(seed, chance) {
  let h = 2166136261 >>> 0;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  // Same avalanche as the return roll: without it, seeds differing only in their tail barely move the result.
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 0x100000000 < chance;
}

/**
 * Resolve one call: size it to what the treasury covers, pay for it, then find out who comes (everyone for
 * internal, a roll per person for external) and move them. Pure apart from the injected effects, so the odds
 * and the accounting are testable without the engine.
 * @param {number} pid The player id. @param {string} scope A CALL_HOME_SCOPE.
 * @param {number} currency A CALL_HOME_CURRENCY.
 * @param {{turn:number, gameId?:string|number, flows?:*[], want?:number, pay:(amount:number, currency:number)=>boolean,
 *   move:(pair:*)=>boolean, afford?:(currency:number)=>number}} deps Effects: how many were asked for, what
 *   the player can spend, pay the bill, and move one point home.
 * @returns {{ok:boolean, reason:string, scope:string, paid:number, attempted:number, returned:number}} Result.
 */
export function resolveCallHome(pid, scope, currency, deps) {
  const d = deps || /** @type {*} */ ({});
  if (!CONFIG.callHomeEnabled) return fail("disabled", scope);
  const quote = callHomeQuote(pid, scope, currency, d.flows, d.want);
  if (quote.points <= 0) return fail("nobody-to-call", scope);
  // A treasury that covers a smaller call than was asked for makes that smaller call, not none.
  const size = affordableSize(quote.points, scope, currency, d);
  if (size <= 0) return fail("cannot-pay", scope);
  // Pay first: the fee buys the call. Abroad, what it brings is decided afterward, and the money is gone
  // either way; that is the gamble.
  const bill = callHomeCost(size, scope, currency);
  if (typeof d.pay !== "function" || !d.pay(bill, currency)) return fail("cannot-pay", scope);
  const { attempted, returned } = scope === CALL_HOME_SCOPE.EXTERNAL
    ? rollPairs(pid, scope, { ...quote, points: size }, d)
    : { attempted: size, returned: size };
  if (returned <= 0) return { ok: false, reason: "nobody-came", scope, paid: bill, attempted, returned: 0 };
  const moved = moveHome(quote, returned, d);
  return { ok: true, reason: moved ? "returned" : "none-moved", scope, paid: bill, attempted, returned: moved };
}

/**
 * The largest call, up to the size asked for, whose fee the treasury covers. Walks the size down rather than
 * dividing, because the fee is a curve, not a rate.
 * @param {number} asked How many were asked for. @param {string} scope A CALL_HOME_SCOPE.
 * @param {number} currency A CALL_HOME_CURRENCY. @param {*} d The injected effects.
 * @returns {number} The affordable size.
 */
function affordableSize(asked, scope, currency, d) {
  const afford = typeof d.afford === "function" ? Number(d.afford(currency)) : Infinity;
  if (!Number.isFinite(afford)) return asked;
  for (let k = asked; k > 0; k--) if (callHomeCost(k, scope, currency) <= afford) return k;
  return 0;
}

/**
 * Move up to `n` points home across the quote's pairs, richest first.
 * @param {*} quote @param {number} n How many to move. @param {*} d The injected effects.
 * @returns {number} How many actually moved.
 */
function moveHome(quote, n, d) {
  let moved = 0;
  for (const pair of quote.pairs) {
    for (let i = 0; i < pair.points && moved < n; i++) {
      if (typeof d.move === "function" && d.move(pair)) moved++;
    }
    if (moved >= n) break;
  }
  return moved;
}

/**
 * Roll each person the call is for: how many of them agree to come home. No move happens here.
 * @param {number} pid The player id. @param {string} scope A CALL_HOME_SCOPE.
 * @param {*} quote @param {*} d The injected effects.
 * @returns {{attempted:number, returned:number}} What happened.
 */
function rollPairs(pid, scope, quote, d) {
  let returned = 0;
  let attempted = 0;
  for (const pair of quote.pairs) {
    for (let i = 0; i < pair.points && attempted < quote.points; i++) {
      attempted++;
      const seed = [d.gameId ?? "", pid, scope, pair.home, pair.from, d.turn ?? 0, attempted].join("|");
      if (callHomeRoll(seed, quote.chance)) returned++;
    }
    if (attempted >= quote.points) break;
  }
  return { attempted, returned };
}

/** @param {string} reason @param {string} scope @returns {*} A failed result. */
function fail(reason, scope) {
  return { ok: false, reason, scope, paid: 0, attempted: 0, returned: 0 };
}

/**
 * Points in a flow that were driven out rather than drawn away.
 * @param {*} byCause Points/people by cause. @param {number} total The row's total points.
 * @returns {number} Refugee-shaped points.
 */
function refugeePoints(byCause, total) {
  if (!byCause || typeof byCause !== "object") return 0;
  let n = 0;
  for (const [cause, v] of Object.entries(byCause)) if (isRefugeeCause(cause)) n += Number(v) || 0;
  // byCause is measured in people for the flow row; scale it back onto the row's own point total.
  const people = Object.values(byCause).reduce((a, b) => a + (Number(b) || 0), 0);
  if (people <= 0) return 0;
  return Math.floor((Number(total) || 0) * (n / people));
}

/** @returns {*[]} The live flow matrix, or [] when unreadable. */
function safeFlows() {
  try {
    return migrationFlows() || [];
  } catch (_) {
    return [];
  }
}
