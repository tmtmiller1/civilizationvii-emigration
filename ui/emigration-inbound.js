// emigration-inbound.js
//
// The per-city INBOUND cap (CONFIG.maxGainPerCityPerTurn): one settlement may GAIN at most this many
// migration points in a single turn — same-turn departures landing instantly AND completed transit
// arrivals together. The departure side (emigration-engine.js) and the arrival side
// (emigration-arrivals.js) both enforce this ONE cap over ONE shared per-turn tally, so a destination
// "boomtown" can't absorb dozens at once via either path. Kept here (not duplicated in each file) so
// the two sides can never drift apart.

import { CONFIG } from "/emigration/ui/emigration-config.js";

/** @typedef {{byCity: Map<string, number>, cap: number}} InboundCtx The per-turn inbound tally + cap. */

/**
 * The per-city inbound cap for this turn, or Infinity when the feature is off (config value <= 0).
 * @returns {number} The cap.
 */
function cityInboundCap() {
  return CONFIG.maxGainPerCityPerTurn > 0 ? CONFIG.maxGainPerCityPerTurn : Infinity;
}

/**
 * A fresh per-turn inbound context (empty tally + the current cap), built once per pass and shared
 * between the arrival and departure sides.
 * @returns {InboundCtx} The context.
 */
export function makeInboundCtx() {
  return { byCity: new Map(), cap: cityInboundCap() };
}

/**
 * Whether a destination city can still receive a migration point this turn (below its cap).
 * @param {string} key Destination city key. @param {InboundCtx} [ctx] The inbound context.
 * @returns {boolean} True when still below cap (or uncapped / no context).
 */
export function canReceiveInbound(key, ctx) {
  if (!ctx || ctx.cap === Infinity) return true;
  return (ctx.byCity.get(key) || 0) < ctx.cap;
}

/**
 * Record one landed migration point against a destination's per-turn inbound tally.
 * @param {string} key Destination city key. @param {InboundCtx} [ctx] The inbound context.
 */
export function noteInbound(key, ctx) {
  if (!ctx || ctx.cap === Infinity) return;
  ctx.byCity.set(key, (ctx.byCity.get(key) || 0) + 1);
}
