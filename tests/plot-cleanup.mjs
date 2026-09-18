// plot-cleanup.mjs
//
// Empty rural districts left by a destroyed improvement are found and removed (emigration-plot-cleanup.js):
// only a RURAL district with NO constructible and a real id; the deferred re-check; the per-turn sweep.
import assert from "node:assert/strict";

globalThis.GameContext = { localPlayerID: 0 };
const requests = [];
globalThis.Game = { PlayerOperations: { sendRequest: (...a) => { requests.push(a); return true; } } };
const PLOTS = {
  10: { d: { type: 1, owner: 3, id: 42 }, cons: [] }, // empty rural district: the dead plot
  11: { d: { type: 1, owner: 3, id: 43 }, cons: ["farm"] }, // rural district with its improvement
  12: { d: { type: 2, owner: 3, id: 44 }, cons: [] }, // an urban district: never touched
  13: { d: null, cons: [] }, // no district at all
  14: { d: { type: 1, owner: -1, id: -1 }, cons: [] } // unreadable id
};
globalThis.GameplayMap = { getLocationFromIndex: (p) => ({ x: p, y: 0 }) };
globalThis.Districts = {
  getAtLocation: (loc) => (PLOTS[loc.x] && PLOTS[loc.x].d ? { type: PLOTS[loc.x].d.type } : null),
  getIdAtLocation: (loc) => (PLOTS[loc.x] && PLOTS[loc.x].d ? { owner: PLOTS[loc.x].d.owner, id: PLOTS[loc.x].d.id } : null)
};
globalThis.GameInfo = { Districts: { lookup: (t) => ({ DistrictType: t === 1 ? "DISTRICT_RURAL" : "DISTRICT_URBAN" }) } };
globalThis.MapConstructibles = { getConstructibles: (x) => (PLOTS[x] ? PLOTS[x].cons : []) };
globalThis.Players = { getAlive: () => [{ Cities: { getCities: () => [{ getPurchasedPlots: () => [10, 11, 12, 13, 14] }] } }] };

const m = await import("/emigration/ui/emigration-plot-cleanup.js");

// Only an empty RURAL district with a real id counts.
{
  assert.deepEqual(m.emptyRuralDistrictAt(10), { owner: 3, id: 42 });
  assert.equal(m.emptyRuralDistrictAt(11), null, "a district with its improvement is not empty");
  assert.equal(m.emptyRuralDistrictAt(12), null, "an urban district is never touched");
  assert.equal(m.emptyRuralDistrictAt(13), null, "no district");
  assert.equal(m.emptyRuralDistrictAt(14), null, "unreadable id");
  assert.equal(m.emptyRuralDistrictAt(99), null, "an unknown plot");
}

// Clearing sends the tuner's district destroy, from the local player, only for the dead plot.
{
  requests.length = 0;
  assert.equal(m.clearEmptyRuralDistrict(10), true);
  assert.deepEqual(requests, [[0, "DESTROY_ELEMENT", { Kind: "DISTRICT", Owner: 3, LocalID: 42 }]]);
  requests.length = 0;
  for (const p of [11, 12, 13, 14]) assert.equal(m.clearEmptyRuralDistrict(p), false);
  assert.equal(requests.length, 0);
}

// The deferred re-check runs after the delay and still checks the plot at that moment.
{
  const scheduled = [];
  m.__test.setScheduler((fn, ms) => scheduled.push({ fn, ms }));
  requests.length = 0;
  m.scheduleDistrictCleanup(10);
  m.scheduleDistrictCleanup(11);
  m.scheduleDistrictCleanup("x");
  assert.equal(scheduled.length, 2, "a non-number plot schedules nothing");
  assert.equal(scheduled[0].ms, m.CLEANUP_DELAY_MS);
  assert.equal(requests.length, 0, "nothing is removed before the destroy has landed");
  PLOTS[11].cons = []; // the improvement's destroy landed on plot 11 in the meantime
  scheduled.forEach((s) => s.fn());
  assert.deepEqual(requests.map((r) => r[2].LocalID), [42, 43]);
  PLOTS[11].cons = ["farm"];
}

// The sweep clears every empty rural district on settlement land, honours the skip set, and survives a
// missing engine surface.
{
  requests.length = 0;
  assert.equal(m.sweepEmptyRuralDistricts(), 1);
  assert.equal(requests[0][2].LocalID, 42);
  requests.length = 0;
  assert.equal(m.sweepEmptyRuralDistricts(new Set([10])), 0, "skipped plots are left alone");
  const saved = globalThis.Districts;
  delete globalThis.Districts;
  assert.equal(m.sweepEmptyRuralDistricts(), 0, "no engine surface: nothing, no throw");
  globalThis.Districts = saved;
  const savedPlayers = globalThis.Players;
  globalThis.Players = { getAlive: () => { throw new Error("boom"); } };
  assert.equal(m.sweepEmptyRuralDistricts(), 0);
  globalThis.Players = savedPlayers;
}

// On load: poll until the game has started, then sweep once after a short delay.
{
  const scheduled = [];
  m.__test.setScheduler((fn, ms) => scheduled.push({ fn, ms }));
  let state = 1;
  globalThis.UIGameLoadingState = { WaitingForUIReady: 1, GameStarted: 5 };
  globalThis.UI = { getGameLoadingState: () => state };
  requests.length = 0;
  m.sweepOnceGameStarts();
  assert.equal(scheduled.length, 1, "the first poll is scheduled");
  scheduled.shift().fn(); // still waiting on Begin Game
  assert.equal(scheduled.length, 1, "keeps polling");
  assert.equal(requests.length, 0, "nothing swept before the game starts");
  state = 5;
  scheduled.shift().fn(); // started: the sweep is scheduled
  assert.equal(scheduled.length, 1);
  scheduled.shift().fn();
  assert.deepEqual(requests.map((r) => r[2].LocalID), [42], "the dead plot is cleared once the game starts");
  assert.equal(scheduled.length, 0, "no further polling after the sweep");
  delete globalThis.UI;
  m.sweepOnceGameStarts();
  scheduled.shift().fn();
  assert.equal(scheduled.length, 1, "no UI surface reads as not started, and keeps waiting quietly");
}

console.log("plot-cleanup: ok");
