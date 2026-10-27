// emigration-intake-ai.js
//
// When an AI civilization closes a settlement to newcomers, the choice the player makes with the card's button.
// The game's planner can't see the switch, so the mod decides by a rule, as it does for refugees and calling
// people home. A pure decision over injected reads, so the tests drive every branch off the engine.
//
// Close, one settlement a pass at most: the civilization is past its congestion bar (the headwind the refugee rule
// reads, AI_CONGESTION_BAR), the settlement is unhappy and has been taking people in, it isn't the capital, no
// more than a third of the civilization's settlements are closed already, and the Influence treasury holds
// AI_RESERVE_TURNS of upkeep. Open again, once a settlement has been closed AI_MIN_CLOSED_TURNS: the headwind is
// under half the bar, the settlement is content, or the treasury is down to AI_FLOOR_TURNS of upkeep.

import { AI_CONGESTION_BAR } from "/emigration/ui/emigration-ai-host.js";

/** Turns of upkeep the treasury must hold before an AI civilization closes a settlement. */
export const AI_RESERVE_TURNS = 10;
/** Turns of upkeep under which an AI civilization opens its closed settlements again. */
export const AI_FLOOR_TURNS = 3;
/** The fewest turns an AI settlement stays closed before it may open, so a closing isn't undone the next pass. */
export const AI_MIN_CLOSED_TURNS = 5;

/**
 * @typedef {Object} IntakeCity One of the civilization's settlements, as the rule reads it.
 * @property {string} key The city key (owner:localId).
 * @property {number} happiness Its net happiness a turn.
 * @property {boolean} capital Whether it's the capital.
 * @property {number} recentNet Its net migration over the last few passes (positive: it has been taking people in).
 * @property {number|null} closedSince The turn it was closed, or null when open.
 */

/**
 * @typedef {Object} IntakeReads
 * @property {number} congestion The civilization's congestion headwind, in pull points.
 * @property {number} balance Its Influence.
 * @property {number} upkeep Influence a closed settlement costs a turn.
 * @property {number} turn The current turn.
 */

/**
 * What an AI civilization does with its intake this pass.
 * @param {IntakeCity[]} cities Its settlements. @param {IntakeReads} r The reads.
 * @returns {{close:string[], open:string[]}} City keys to close and to open.
 */
export function aiIntakeDecisions(cities, r) {
  const out = { close: /** @type {string[]} */ ([]), open: /** @type {string[]} */ ([]) };
  const closed = cities.filter((c) => c.closedSince !== null);
  for (const c of closed) if (shouldOpen(c, r)) out.open.push(c.key);
  const stillClosed = closed.length - out.open.length;
  const pick = closeCandidate(cities, r, stillClosed);
  if (pick) out.close.push(pick.key);
  return out;
}

/** @param {IntakeCity} c @param {IntakeReads} r @returns {boolean} */
function shouldOpen(c, r) {
  if (r.turn - Number(c.closedSince) < AI_MIN_CLOSED_TURNS) return false;
  return r.congestion < AI_CONGESTION_BAR / 2 || c.happiness >= 0 || r.balance < r.upkeep * AI_FLOOR_TURNS;
}

/**
 * The settlement to close this pass, or null: the unhappiest open one that has been taking people in.
 * @param {IntakeCity[]} cities @param {IntakeReads} r @param {number} closedNow Settlements closed after this pass's
 * openings. @returns {IntakeCity|null}
 */
function closeCandidate(cities, r, closedNow) {
  if (r.congestion < AI_CONGESTION_BAR) return null;
  if (r.balance < r.upkeep * AI_RESERVE_TURNS) return null;
  if (closedNow >= Math.max(1, Math.floor(cities.length / 3))) return null;
  const open = cities.filter((c) => c.closedSince === null && !c.capital && c.happiness < 0 && c.recentNet > 0);
  open.sort((a, b) => a.happiness - b.happiness);
  return open[0] || null;
}
