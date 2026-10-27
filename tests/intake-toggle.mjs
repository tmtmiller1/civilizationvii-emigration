// intake-toggle.mjs
//
// The per-settlement intake switch (risks 2.4, plan 7.3): a city its owner closed is never chosen as a
// destination, the planning pass and the real pass agree, an arrival due at a city that closed while it travelled
// is re-aimed at the civilization's next open settlement (population conserved), a city that changed hands reopens
// by itself, the setting round-trips through the persisted state, and the option switch reopens everything.

import assert from "node:assert/strict";
import { CONFIG } from "/emigration/ui/emigration-config.js";
import { runPass, __test } from "/emigration/ui/emigration-engine.js";
import { loadState, saveState, setCityClosed, isCityClosed } from "/emigration/ui/emigration-state.js";

globalThis.YieldTypes = {
  YIELD_FOOD: "YIELD_FOOD", YIELD_PRODUCTION: "YIELD_PRODUCTION", YIELD_GOLD: "YIELD_GOLD",
  YIELD_SCIENCE: "YIELD_SCIENCE", YIELD_CULTURE: "YIELD_CULTURE", YIELD_HAPPINESS: "YIELD_HAPPINESS"
};
globalThis.GameplayMap = { getPlotDistance: (ax, ay, bx, by) => Math.abs(ax - bx) + Math.abs(ay - by) };
globalThis.Culture = { isTraditionActive: () => false };
globalThis.Database = { makeHash: (t) => t };
globalThis.GameContext = { localPlayerID: 1 };

function installConfigStore() {
  const kv = {};
  globalThis.Configuration = {
    getGame: () => ({ getValue: (k) => kv[k] }),
    editGame: () => ({ setValue: (k, v) => (kv[k] = v) })
  };
}

function makeCity(owner, localId, o) {
  return {
    owner, localId, name: o.name || "City" + owner + "_" + localId, isTown: false, isBeingRazed: false,
    isInfected: false, urbanPopulation: 0, population: o.population, ruralPopulation: o.rural,
    location: { x: o.x || 0, y: o.y || 0 },
    addRuralPopulation(d) { this.ruralPopulation += d; this.population += d; },
    Yields: { getYield: (ev) => (o.yields && o.yields[ev]) || 0 },
    Happiness: { netHappinessPerTurn: 0, hasUnrest: false }
  };
}

function installWorld(playersById) {
  globalThis.Players = { get: (pid) => playersById[pid] || null, getAlive: () => Object.values(playersById) };
}

function major(cities) {
  return {
    isAlive: true, isMajor: true, isMinor: false,
    Cities: { getCities: () => cities },
    Diplomacy: { hasMet: () => true, getWarCount: () => 0, isAtWar: () => false },
    Culture: { isTraditionActive: () => false }
  };
}

function pinBaseConfig() {
  Object.assign(CONFIG, {
    maxMovesPerTurn: 100, emigrationBar: 1, deltaExponent: 1, cooldownTurns: 0, minRuralToEmigrate: 1,
    requireMet: false, includeCityStates: false, crossCivEnabled: true, foodFactor: 1, productionFactor: 0,
    goldFactor: 0, scienceFactor: 0, cultureFactor: 0, populationFactor: 0, happinessShaped: false,
    localHappinessFactor: 0, unhappyCauseThreshold: -1000, baseReluctance: 0, perExtraPop: 0, cityStateBarrier: 0,
    poachBlock: 0, congestWeight: 0, bordersEnabled: false, distanceFactor: 0, tiltCap: 14, warSurgeMax: 1,
    warSiege: false, attritionEnabled: false, transitLagTurns: 0, transitHexPerTurn: 5,
    cityIntakeToggleEnabled: true, refugeePoolEnabled: false, maxGainPerCityPerTurn: 100
  });
}

const total = (cities) => cities.reduce((n, c) => n + c.ruralPopulation, 0);

// A: the closed city is never the destination; the next best one is.
{
  pinBaseConfig();
  installConfigStore();
  globalThis.Game = { turn: 1 };
  const poor = makeCity(1, 1, { population: 10, rural: 10, yields: { YIELD_FOOD: 1 } });
  const rich = makeCity(1, 2, { population: 2, rural: 2, yields: { YIELD_FOOD: 1000 } });
  const second = makeCity(1, 3, { population: 2, rural: 2, yields: { YIELD_FOOD: 500 } });
  installWorld({ 1: major([poor, rich, second]) });
  setCityClosed("1:2", true);
  assert.equal(isCityClosed({ key: "1:2", owner: 1 }), true, "closed by its owner");
  assert.equal(isCityClosed({ key: "1:3", owner: 1 }), false);
  const moves = runPass().filter((m) => m.phase === "move");
  assert.ok(moves.length >= 1, "A: people still move");
  assert.ok(moves.every((m) => m.destName === second.name), "A: every move lands in the open city");
  assert.equal(rich.ruralPopulation, 2, "A: the closed city took nobody");
  assert.ok(second.ruralPopulation > 2, "A: the next best city took them");
  assert.equal(total([poor, rich, second]), 14, "A: population conserved");
  // Reopen: the richest city takes them again.
  setCityClosed("1:2", false);
  assert.equal(isCityClosed({ key: "1:2", owner: 1 }), false);
  globalThis.Game.turn = 2;
  const after = runPass().filter((m) => m.phase === "move");
  assert.ok(after.some((m) => m.destName === rich.name), "A: reopened, it is the destination again");
}

// B: the plan and the shed agree on a closed destination.
{
  pinBaseConfig();
  installConfigStore();
  globalThis.Game = { turn: 1 };
  const poor = makeCity(1, 1, { population: 10, rural: 10, yields: { YIELD_FOOD: 1 } });
  const rich = makeCity(2, 2, { population: 2, rural: 2, yields: { YIELD_FOOD: 1000 } });
  const second = makeCity(2, 3, { population: 2, rural: 2, yields: { YIELD_FOOD: 500 } });
  installWorld({ 1: major([poor]), 2: major([rich, second]) });
  setCityClosed("2:2", true);
  const { collectCitySignals } = await import("/emigration/ui/emigration-cities.js");
  const { rankByProsperity } = await import("/emigration/ui/emigration-prosperity.js");
  const { ownerPopulations } = await import("/emigration/ui/emigration-state.js");
  const ranked = rankByProsperity(collectCitySignals());
  const src = ranked.find((s) => s.key === "1:1");
  const best = __test.bestOpenDestination(src, ranked, ownerPopulations(ranked), undefined);
  assert.equal(best.dest.key, "2:3", "B: the real pass skips the closed city");
  const plan = __test.planTurn(ranked, loadState());
  const inbound = plan.get(2);
  assert.ok(inbound && inbound.inPts > 0, "B: the plan still sends people to civ 2, through its open city");
  setCityClosed("2:2", false);
}

// C: an arrival due at a city that closed while it travelled lands in the civilization's next open settlement.
{
  pinBaseConfig();
  Object.assign(CONFIG, { transitLagTurns: 4, transitHexPerTurn: 5 });
  installConfigStore();
  globalThis.Game = { turn: 1 };
  const poor = makeCity(1, 1, { population: 3, rural: 3, yields: { YIELD_FOOD: 1 }, x: 0, y: 0 });
  const rich = makeCity(1, 2, { population: 2, rural: 2, yields: { YIELD_FOOD: 1000 }, x: 50, y: 0 });
  const second = makeCity(1, 3, { population: 4, rural: 4, yields: { YIELD_FOOD: 500 }, x: 52, y: 0 });
  installWorld({ 1: major([poor, rich, second]) });
  const depart = runPass().filter((m) => m.phase === "depart");
  assert.ok(depart.length >= 1 && depart[0].destName === rich.name, "C: the departure aims at the richest city");
  const before = total([poor, rich, second]) + depart.length;
  const richBefore = rich.ruralPopulation; // the open city took an instant move this turn; none after it closes
  setCityClosed("1:2", true); // closes while they are on the road
  globalThis.Game.turn = 100;
  const arrive = runPass().filter((m) => m.phase === "arrive");
  assert.equal(arrive.length, 0, "C: the arrival is held a turn while it is re-aimed");
  globalThis.Game.turn = 101;
  const landed = runPass().filter((m) => m.phase === "arrive");
  assert.ok(landed.length >= 1, "C: it lands the next turn");
  assert.ok(landed.every((m) => m.destName === second.name), "C: in the open settlement of the same civilization");
  assert.equal(rich.ruralPopulation, richBefore, "C: the closed city took nobody after closing");
  assert.equal(total([poor, rich, second]) + loadState().transit.length, before,
    "C: population conserved across the reroute (one more point is still on the road)");
  setCityClosed("1:2", false);
}

// D: a city that changed hands reopens by itself; the state round-trips; the option switch reopens everything.
{
  installConfigStore();
  CONFIG.cityIntakeToggleEnabled = true;
  setCityClosed("1:2", true);
  assert.equal(isCityClosed({ key: "1:2", owner: 1 }), true);
  assert.equal(isCityClosed({ key: "1:2", owner: 2 }), false, "D: a captured city (new owner) reopens");
  const raw = JSON.parse(globalThis.Configuration.getGame().getValue("EmigrationState_v1"));
  assert.deepEqual(Object.keys(raw.data.cities), ["1:2"]);
  assert.equal(raw.data.cities["1:2"].owner, 1, "D: persisted with the owner");
  assert.equal(typeof raw.data.cities["1:2"].since, "number", "D: and the turn it was closed");
  // A hand-edited or older blob: junk rows drop, an open row drops, a closed row without an owner reads it off the key.
  saveState({ sources: {}, monoTurn: 3, transit: [], cities: { "1:5": { closed: true }, "1:6": { closed: false }, "x": 1 } });
  const s = loadState();
  assert.deepEqual(s.cities, { "1:5": { closed: true, owner: 1 } }, "D: normalized on load");
  assert.equal(isCityClosed({ key: "1:5", owner: 1 }), true);
  CONFIG.cityIntakeToggleEnabled = false;
  assert.equal(isCityClosed({ key: "1:5", owner: 1 }), false, "D: the option off reopens every settlement");
  CONFIG.cityIntakeToggleEnabled = true;
  assert.equal(isCityClosed(null), false);
  assert.equal(isCityClosed({ key: "nope", owner: 1 }), false);
}

console.log("intake-toggle harness passed");
