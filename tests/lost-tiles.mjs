// lost-tiles.mjs
//
// The tiles a departure tore down (emigration-lost-tiles.js), the Displaced tab's "Lost" line, and a returnee
// going back to the plot their people left when the game still offers it, else another free plot of the same
// settlement (the owner's rule, 2026-10-25). Watched in a lab game beforehand (roadmap section 31): an abandoned
// plot stays the city's and EXPAND lists it among the plots a pending point may settle.

import assert from "node:assert/strict";

const KV = {};
globalThis.Configuration = {
  getGame: () => ({ getValue: (k) => (k in KV ? KV[k] : null) }),
  editGame: () => ({ setValue: (k, v) => (KV[k] = v) })
};
globalThis.Locale = { compose: (s) => s };
globalThis.GameContext = { localPlayerID: 0 };
const cityCommands = [];
let expandPlots = [200, 201, 202];
globalThis.Game = {
  turn: 3,
  PlayerOperations: { sendRequest: () => true, canStart: () => ({ Success: false }) },
  CityCommands: {
    canStart: () => ({ Success: true, Plots: expandPlots }),
    sendRequest: (id, cmd, args) => cityCommands.push([id, cmd, args])
  }
};
globalThis.CityCommandTypes = { EXPAND: "EXPAND" };
globalThis.PlayerOperationTypes = { ASSIGN_WORKER: "ASSIGN_WORKER" };
globalThis.GameplayMap = { getLocationFromIndex: (p) => ({ x: p, y: 1 }), getResourceType: () => -1 };

const { CONFIG } = await import("/emigration/ui/emigration-config.js");
const lost = await import("/emigration/ui/emigration-lost-tiles.js");
const place = await import("/emigration/ui/emigration-arrival-placement.js");
const { lostSummary } = await import("/emigration/ui/emigration-displaced.js");
const { lostText } = await import("/emigration/ui/emigration-displaced-view.js");
place._setSyncFlushForTests(true);

function testStore() {
  lost._forgetLostTilesMemory();
  lost.recordLostTile(0, "Rome", "IMPROVEMENT_FARM", 201, 40);
  lost.recordLostTile(0, "Rome", "IMPROVEMENT_FARM", 205, 41);
  lost.recordLostTile(0, "Rome", "IMPROVEMENT_WOODCUTTER", 202, 42);
  lost.recordLostTile(0, "Rome", "", 203, 42);
  lost.recordLostTile(0, "Rome", "IMPROVEMENT_MINE", 1.5, 42);
  assert.deepEqual(lost.lostTilesFor(0, "Rome").map((e) => [e.t, e.p]),
    [["IMPROVEMENT_FARM", 201], ["IMPROVEMENT_FARM", 205], ["IMPROVEMENT_WOODCUTTER", 202]], "well-formed entries, oldest first");
  assert.deepEqual(lost.lostTilesFor(0, "Ostia"), []);
  lost._forgetLostTilesMemory();
  assert.equal(lost.lostTilesFor(0, "Rome").length, 3, "kept in the save");
  assert.deepEqual(lostSummary(lost.lostTilesFor(0, "Rome")),
    [{ type: "IMPROVEMENT_FARM", count: 2 }, { type: "IMPROVEMENT_WOODCUTTER", count: 1 }]);
  assert.equal(lostText(lostSummary(lost.lostTilesFor(0, "Rome"))), "Farm ×2, Woodcutter",
    "named from the game's own improvement names, with a plain fallback off-engine");
  // A returnee takes the oldest entry whose plot is still open, else the oldest of all.
  const open = new Set([205]);
  assert.deepEqual(lost.takeLostTile(0, "Rome", (p) => open.has(p)).p, 205, "the open plot first");
  assert.deepEqual(lost.takeLostTile(0, "Rome", () => false).p, 201, "none open: the oldest");
  assert.deepEqual(lost.takeLostTile(0, "Rome", () => {
    throw new Error("unreadable");
  }).p, 202, "an unreadable map counts as not open");
  assert.equal(lost.takeLostTile(0, "Rome"), null, "nothing left");
  assert.deepEqual(JSON.parse(KV.EmigrationLostTiles_v1), {}, "an emptied settlement leaves the save clean");
  assert.deepEqual(lost.cleanLostTiles({ 0: { Rome: [{ t: "X", p: 1 }, { t: 2, p: 1 }, { p: 3 }, null], Ostia: 5 } }),
    { 0: { Rome: [{ t: "X", p: 1, turn: 0 }] } }, "junk in the save is dropped");
}

function makeCity(owner, id) {
  return {
    owner, id: { owner, id, type: 1 }, name: "City" + id, location: { x: 5, y: 5 },
    population: 6, ruralPopulation: 3, pendingPopulation: 0,
    getPurchasedPlots: () => [200, 201, 202],
    addRuralPopulation(d) {
      this.population += d;
      this.ruralPopulation += d;
      this.pendingPopulation += d > 0 ? d : 0;
    }
  };
}

function testReturneeSettlesTheirOldPlot() {
  CONFIG.arrivalPlacement = place.PLACEMENT.AUTO;
  CONFIG.arrivalPreferSpecialists = false;
  const city = makeCity(0, 7);
  cityCommands.length = 0;
  expandPlots = [200, 201, 202];
  assert.equal(place.pickPlacementPlot([200, 201], [202, 201]), 201, "the first preferred plot the game offers");
  const prefer = [300];
  assert.equal(place.pickPlacementPlot([200, 201], prefer), 200, "no preferred plot offered: the usual pick");
  assert.deepEqual(prefer, [300], "an unoffered preference is kept for a later point");
  place.arriveRural(city, { preferPlot: 202 });
  assert.deepEqual(cityCommands.at(-1)[2], { X: 202, Y: 1 }, "a returnee lands on the plot their people left");
  expandPlots = [200, 201];
  place.arriveRural(city, { preferPlot: 202 });
  assert.deepEqual(cityCommands.at(-1)[2], { X: 200, Y: 1 }, "the plot taken meanwhile: another free plot of the city");
  place.arriveRural(city, { civ: 3, kind: "migrant", cause: "prosperity" });
  assert.deepEqual(cityCommands.at(-1)[2], { X: 200, Y: 1 }, "an ordinary arrival places as before");
}

testStore();
testReturneeSettlesTheirOldPlot();
console.log("lost-tiles: ok");
