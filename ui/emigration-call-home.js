// emigration-call-home.js
//
// "Call our people home": a paid, player-initiated attempt to bring displaced population back to the
// settlement it left. Return migration (emigration-return.js) already drifts a diaspora home on its own once
// a homeland is at peace and prospering; this is the player leaning on that, deliberately and at a price,
// which is what a war's end should let you do.
//
// You pay for the people who actually come home, and for nobody else. An earlier draft charged for ATTEMPTS,
// which made the common external outcome "full price, nobody came" -- randomness that only ever takes from the
// player, with no lever to improve it. The odds now decide HOW MANY return, not whether the fee was wasted, and
// a call with anyone callable always brings at least one person back. Two variants, because the cases differ:
//   • INTERNAL — people who fled one of your settlements for another of your own. They are already inside your
//     borders, under your government, among their own; asking them to go back is a small thing, so most do.
//   • EXTERNAL — your people living in another civilization's cities. They have a life there now, and a
//     foreign ruler has no reason to help you empty their streets, so most stay.
// The odds are deliberately far apart (see callHomeChanceInternal / callHomeChanceExternal).
//
// The roll is seeded from the game id, the pair and the turn, exactly as return migration is: reloading a save
// and trying again gives the same answer, so the outcome cannot be re-rolled by save-scumming.
import { CONFIG } from "/emigration/ui/emigration-config.js";
import { migrationFlows } from "/emigration/ui/emigration-migration-stats.js";
import { isRefugeeCause } from "/emigration/ui/emigration-causes.js";

/** Currency choices for the fee. */
export const CALL_HOME_CURRENCY = Object.freeze({ GOLD: 0, INFLUENCE: 1 });
/** The two variants. */
export const CALL_HOME_SCOPE = Object.freeze({ INTERNAL: "internal", EXTERNAL: "external" });

/**
 * The per-point success chance for a variant, clamped to 0..1.
 * @param {string} scope A CALL_HOME_SCOPE. @returns {number} The chance.
 */
export function callHomeChance(scope) {
  const raw = scope === CALL_HOME_SCOPE.EXTERNAL
    ? Number(CONFIG.callHomeChanceExternal)
    : Number(CONFIG.callHomeChanceInternal);
  return Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 0;
}

/**
 * The fee for the people who actually came home, in the chosen currency. Nobody who refuses is charged for;
 * the external variant costs more per head because it is asking people to leave another ruler's city.
 * @param {number} points How many points came home. @param {string} scope A CALL_HOME_SCOPE.
 * @param {number} currency A CALL_HOME_CURRENCY. @returns {number} The fee (never negative).
 */
export function callHomeCost(points, scope, currency) {
  const n = Math.max(0, Math.floor(Number(points) || 0));
  const per = currency === CALL_HOME_CURRENCY.INFLUENCE
    ? Number(CONFIG.callHomeInfluencePerPoint)
    : Number(CONFIG.callHomeGoldPerPoint);
  const base = Number.isFinite(per) ? per : 0;
  const mult = scope === CALL_HOME_SCOPE.EXTERNAL ? Number(CONFIG.callHomeExternalCostScale) || 1 : 1;
  return Math.max(0, Math.round(n * base * mult));
}

/**
 * Candidate pairs for one player: where their displaced people went, and where they came from. Internal pairs
 * are moves between the player's OWN settlements; external pairs are the player's people now living under
 * another civilization. Only refugee-shaped causes count -- this is about people driven out, not about
 * ordinary migrants who simply chose somewhere better.
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
 * What a call would look like: how many points could come, the most it could cost, and the odds. `cost` is
 * the WORST case (everyone comes); a call that brings fewer costs proportionally less.
 * @param {number} pid The player id. @param {string} scope A CALL_HOME_SCOPE.
 * @param {number} currency A CALL_HOME_CURRENCY. @param {*[]} [flows] Flow rows (defaults to live).
 * @returns {{scope:string, available:number, points:number, cost:number, chance:number, pairs:*[]}} The quote.
 */
export function callHomeQuote(pid, scope, currency, flows) {
  const cands = callHomeCandidates(pid, flows);
  const pairs = scope === CALL_HOME_SCOPE.EXTERNAL ? cands.external : cands.internal;
  const available = pairs.reduce((n, p) => n + p.points, 0);
  const cap = Math.max(0, Math.floor(Number(CONFIG.callHomeMaxPointsPerAttempt) || 0));
  const points = Math.min(available, cap);
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
 * Resolve one call-home attempt: charge the fee, then roll each point separately.
 * Pure apart from the injected effects, so the odds and the accounting are testable without the engine.
 * @param {number} pid The player id. @param {string} scope A CALL_HOME_SCOPE.
 * @param {number} currency A CALL_HOME_CURRENCY.
 * @param {{turn:number, gameId?:string|number, flows?:*[], pay:(amount:number, currency:number)=>boolean,
 *   move:(pair:*)=>boolean, afford?:(currency:number)=>number}} deps Effects: how much the player can spend,
 *   pay the bill for those who came, and move one point home.
 * @returns {{ok:boolean, reason:string, scope:string, paid:number, attempted:number, returned:number}} Result.
 */
export function resolveCallHome(pid, scope, currency, deps) {
  const d = deps || /** @type {*} */ ({});
  if (!CONFIG.callHomeEnabled) return fail("disabled", scope);
  const quote = callHomeQuote(pid, scope, currency, d.flows);
  if (quote.points <= 0) return fail("nobody-to-call", scope);
  // Roll first, then bill: only the people who actually come home are paid for.
  const { attempted, returned } = rollPairs(pid, scope, quote, d);
  // A call is never wasted. If the dice refused everyone, one person still comes: the floor is what keeps a
  // call worth making, and it is why this reads as "how many" rather than "did I get anything".
  const payable = affordableHeads(Math.max(1, returned), scope, currency, d);
  if (payable <= 0) return fail("cannot-pay", scope);
  const bill = callHomeCost(payable, scope, currency);
  if (typeof d.pay !== "function" || !d.pay(bill, currency)) return fail("cannot-pay", scope);
  const moved = moveHome(quote, payable, d);
  return { ok: true, reason: moved ? "returned" : "none-moved", scope, paid: bill, attempted, returned: moved };
}

/**
 * How many of the people who agreed to come the player can actually pay for. A treasury that covers only two
 * heads brings two home rather than refusing the whole call.
 * @param {number} coming How many agreed to come. @param {string} scope A CALL_HOME_SCOPE.
 * @param {number} currency A CALL_HOME_CURRENCY. @param {*} d The injected effects.
 * @returns {number} How many can be paid for.
 */
function affordableHeads(coming, scope, currency, d) {
  const perHead = callHomeCost(1, scope, currency);
  if (perHead <= 0) return coming;
  const afford = typeof d.afford === "function" ? Number(d.afford(currency)) : Infinity;
  if (!Number.isFinite(afford)) return coming;
  return Math.min(coming, Math.max(0, Math.floor(afford / perHead)));
}

/**
 * Move up to `n` points home across the quote's pairs, richest first.
 * @param {*} quote The quote. @param {number} n How many to move. @param {*} d The injected effects.
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
 * Roll each callable point: how many of them agree to come home. No move happens here, and no fee is due
 * for anyone who refuses.
 * @param {number} pid The player id. @param {string} scope A CALL_HOME_SCOPE.
 * @param {*} quote The quote. @param {*} d The injected effects.
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
