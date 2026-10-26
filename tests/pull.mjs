// pull.mjs
//
// Destination safety (session 2g of the 3.7.0 plan): a destination in acute crisis pays a heavy penalty that grows
// with how far over its flee threshold it sits, capped; a stalled siege lifts it; a source worse off than the
// destination pays half; the switch turns it off; it never rejects a move outright; the engine's pass counts a
// move the penalty turned elsewhere.

import assert from "node:assert/strict";

globalThis.GameplayMap = { getPlotDistance: (ax, ay, bx, by) => Math.abs(ax - bx) + Math.abs(ay - by) };
globalThis.Culture = { isTraditionActive: () => false };
const KV = {};
globalThis.Configuration = {
  getGame: () => ({ getValue: (k) => (k in KV ? KV[k] : null) }),
  editGame: () => ({ setValue: (k, v) => (KV[k] = v) })
};

const { CONFIG } = await import("/emigration/ui/emigration-config.js");
const { adjustedPull, pullBreakdown, unsafePenalty, destInCrisis, bestDestination } = await import("/emigration/ui/emigration-pull.js");
const { telemetryCounters, __test: tele } = await import("/emigration/ui/emigration-telemetry.js");

Object.assign(CONFIG, {
  baseReluctance: 0, perExtraPop: 0, perFewerPop: 0, cityStateBarrier: 0, poachBlock: 0, distanceFactor: 0,
  congestWeight: 0, bordersEnabled: false, crossCivEnabled: true, tiltCap: 14, aggressorPenalty: 0, fleeFactor: 0,
  crisisInternalBonus: 0, crisisEscapeBonus: 0, antiSnowballWeight: 0, antiDrainWeight: 0, warSiege: false,
  violenceFleeThreshold: 2, disasterFleeThreshold: 2, destinationSafetyEnabled: true, crisisDestPenalty: 12,
  crisisDestPenaltyCap: 30, permeFloor: 0.2, permeCeil: 2
});

const sig = (owner, pros, over) => ({
  key: `${owner}:${pros}`, owner, pros, population: 5, isCityState: false, rural: 5,
  city: { id: { owner, id: pros }, location: { x: 0, y: 0 } }, violence: 0, disaster: 0, siege: false, ...over
});
const src = sig(1, 10);
const calm = sig(1, 40);
const close = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-9, `${m}: ${a} vs ${b}`);

// Not in crisis: no penalty. At the threshold: half a step (6). Twice the threshold: a full step (12). Capped at 30.
assert.equal(destInCrisis(calm), false);
assert.equal(unsafePenalty(src, calm), 0);
close(unsafePenalty(src, sig(1, 40, { violence: 2 })), 6, "at the threshold, half a step");
close(unsafePenalty(src, sig(1, 40, { violence: 4 })), 12, "twice the threshold, one step");
close(unsafePenalty(src, sig(1, 40, { violence: 8 })), 30, "capped");
close(unsafePenalty(src, sig(1, 40, { violence: 20 })), 30, "capped however bad");
close(unsafePenalty(src, sig(1, 40, { disaster: 4 })), 12, "a disaster counts the same way");
close(unsafePenalty(src, sig(1, 40, { siege: true })), 12, "razing counts as one step");

// The pull pays it, and the breakdown mirrors it.
close(adjustedPull(src, calm, null, null, null), 30, "the calm city's pull: the gradient");
close(adjustedPull(src, sig(1, 40, { violence: 4 }), null, null, null), 18, "the attacked city's pull: 30 - 12");
const bd = pullBreakdown(src, sig(1, 40, { violence: 4 }), null, null, null);
close(bd.terms.find((t) => t.key === "unsafe").raw, -12, "the breakdown's unsafe term");
assert.equal(bd.reject, null);

// Never a reject: a strong enough gradient still carries people into a city under heavy attack, and the reject
// reason for a weak one is the ordinary "outweighed", not a gate of its own.
close(adjustedPull(src, sig(1, 60, { violence: 20 }), null, null, null), 20, "50 - 30: still viable");
assert.equal(pullBreakdown(src, sig(1, 35, { violence: 20 }), null, null, null).reject, "outweighed");

// A source worse off than the destination pays half.
close(unsafePenalty(sig(1, 10, { violence: 9 }), sig(1, 40, { violence: 4 })), 6, "fleeing a worse place: half");
close(unsafePenalty(sig(1, 10, { violence: 4 }), sig(1, 40, { violence: 4 })), 12, "as bad: the full penalty");

// Off: nothing.
CONFIG.destinationSafetyEnabled = false;
assert.equal(unsafePenalty(src, sig(1, 40, { violence: 8 })), 0);
close(adjustedPull(src, sig(1, 40, { violence: 8 }), null, null, null), 30, "off: the gradient alone");
CONFIG.destinationSafetyEnabled = true;

// A stalled siege lifts it: drive the violence module to a stall for the destination's city.
{
  const { tickViolence, observeCity, siegeStalled } = await import("/emigration/ui/emigration-violence.js");
  let TURN = 1;
  let FLAG = true;
  globalThis.Game = { get turn() { return TURN; } };
  globalThis.Players = {
    Districts: { get: () => ({ getDistrictHealth: () => 100, getDistrictMaxHealth: () => 100, getDistrictIsBesieged: () => FLAG }) },
    get: () => ({ isMajor: true, Diplomacy: { isAtWarWith: () => false } })
  };
  globalThis.engine = { on: () => {}, off: () => {} };
  globalThis.MapConstructibles = { getConstructibles: () => [] };
  globalThis.Constructibles = { getByComponentID: () => ({ damaged: false }) };
  CONFIG.siegeStallTurns = 3;
  CONFIG.siegeBesiegedFloor = 0.3;
  CONFIG.vwSiege = 4;
  CONFIG.violenceDecay = 0.55;
  const parked = { id: { owner: 1, id: 77 }, owner: 1, location: { x: 7, y: 0 }, population: 8 };
  let v = 0;
  for (TURN = 1; TURN <= 4; TURN++) { tickViolence(); v = observeCity(parked); }
  assert.equal(siegeStalled(parked), true, "four quiet flagged turns: stalled");
  const stalledDest = sig(1, 40, { violence: Math.max(v, 2.5), city: parked });
  assert.equal(unsafePenalty(src, stalledDest), 0, "a stalled siege pays nothing");
  FLAG = false;
  for (TURN = 5; TURN <= 6; TURN++) { tickViolence(); observeCity(parked); }
  delete globalThis.Game;
}

// The engine's count: with a calm city beside an attacked richer one, the attacked one would have won without the
// penalty, so the move is counted as turned elsewhere; with the calm city richer anyway, nothing is counted.
{
  tele.dropMemory();
  const attacked = sig(1, 45, { violence: 8 }); // 35 - 30 = 5 after the penalty
  const best = bestDestination(src, [src, calm, attacked], { 1: 15 }, undefined, true);
  assert.equal(best.dest.key, calm.key, "the calm city wins");
  assert.equal(telemetryCounters().crisisDestAvoided, 1, "and the turn is counted");
  bestDestination(src, [src, calm, sig(1, 20, { violence: 8 })], { 1: 15 }, undefined, true);
  assert.equal(telemetryCounters().crisisDestAvoided, 1, "a city that would have lost anyway isn't counted");
  bestDestination(src, [src, calm, attacked], { 1: 15 });
  assert.equal(telemetryCounters().crisisDestAvoided, 1, "the readout's and the planner's reads don't count");
}

console.log("pull harness passed");
