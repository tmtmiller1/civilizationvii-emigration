// engine-legacy-snapshots.mjs
//
// Coverage for the two engine paths the end-to-end engine-pass.mjs harness doesn't drive, plus the
// engine-reading city-snapshot readers — all over the SAME tiny fake world (so collectCitySignals,
// the engine pass, and the snapshot builders share one setup):
//   1. the LEGACY single-cause pass (CONFIG.splitTracksEnabled = false): processSourceLegacy /
//      legacyEmigrate / belowEmigrationBar / restingOnCooldown — below-the-bar wait, shed, cooldown;
//   2. the STANCE counterfactual (planTurn / planSource / planApply / planBump): real vs neutral
//      borders, banked as the per-civ flow difference, driven by a slotted Open-Borders tradition;
//   3. citySnapshot / ownerCitySnapshots (emigration-city-readout-data.js): resolveComposition,
//      resolveCityName, findSignal, ownerStats, destInfo, snapshotFromRanked — live recompute-on-read.
//
// Off-engine: the loader maps /emigration/ specifiers and stubs /core; we stub the handful of engine
// globals the readers touch (Players/Cities/Yields, Configuration, Game.turn, GameplayMap, Locale).

import assert from "node:assert/strict";
import { CONFIG } from "/emigration/ui/emigration-config.js";
import { runPass } from "/emigration/ui/emigration-engine.js";
import { citySnapshot, ownerCitySnapshots } from "/emigration/ui/emigration-city-readout-data.js";
import { __test as compTest } from "/emigration/ui/emigration-composition.js";

// ── Engine globals (mirrors engine-pass.mjs) ──────────────────────────────────
globalThis.YieldTypes = { YIELD_FOOD: "YIELD_FOOD", YIELD_PRODUCTION: "YIELD_PRODUCTION", YIELD_GOLD: "YIELD_GOLD", YIELD_SCIENCE: "YIELD_SCIENCE", YIELD_CULTURE: "YIELD_CULTURE", YIELD_HAPPINESS: "YIELD_HAPPINESS" };
globalThis.GameplayMap = { getPlotDistance: (ax, ay, bx, by) => Math.abs(ax - bx) + Math.abs(ay - by) };
globalThis.Culture = { isTraditionActive: () => false };
globalThis.Database = { makeHash: (t) => t };
globalThis.GameContext = { localPlayerID: 1 };
globalThis.Locale = { compose: (s) => s }; // resolveCityName goes through Locale.compose

function installConfigStore() {
  const kv = {};
  globalThis.Configuration = { getGame: () => ({ getValue: (k) => kv[k] }), editGame: () => ({ setValue: (k, v) => (kv[k] = v) }) };
}
function makeCity(owner, localId, opts) {
  const o = opts || {};
  return {
    owner, localId, name: o.name || "City" + owner + "_" + localId, isTown: false,
    isBeingRazed: !!o.siege, isInfected: false, urbanPopulation: 0,
    population: o.population, ruralPopulation: o.rural, location: { x: o.x || 0, y: o.y || 0 },
    addRuralPopulation(d) { this.ruralPopulation += d; this.population += d; },
    Yields: { getYield: (ev) => (o.yields && o.yields[ev]) || 0 },
    Happiness: { netHappinessPerTurn: o.happiness || 0, hasUnrest: false }
  };
}
function major(cities, opts) {
  const o = opts || {};
  return {
    isAlive: true, isMajor: true, isMinor: false,
    Cities: { getCities: () => cities },
    Diplomacy: { hasMet: () => true, getWarCount: () => 0, isAtWar: () => false },
    // A civ "slots Open Borders" by reporting that tradition active (drives borderStance → "pro").
    Culture: { isTraditionActive: (h) => !!(o.open && typeof h === "string" && /OPEN/i.test(h)) }
  };
}
function installWorld(playersById) {
  globalThis.Players = { get: (pid) => playersById[pid] || null, getAlive: () => Object.values(playersById) };
}
function pinBaseConfig() {
  Object.assign(CONFIG, {
    maxMovesPerTurn: 100, emigrationBar: 1, deltaExponent: 1, cooldownTurns: 0, minRuralToEmigrate: 1,
    requireMet: false, includeCityStates: false, crossCivEnabled: true, foodFactor: 1, productionFactor: 0,
    goldFactor: 0, scienceFactor: 0, cultureFactor: 0, populationFactor: 0, happinessShaped: false,
    localHappinessFactor: 0, unhappyCauseThreshold: -1000, baseReluctance: 0, perExtraPop: 0,
    cityStateBarrier: 0, poachBlock: 0, congestWeight: 0, bordersEnabled: false, distanceFactor: 0,
    tiltCap: 14, warSurgeMax: 1, warSiege: false, attritionEnabled: false, transitLagTurns: 0,
    transitHexPerTurn: 5, splitTracksEnabled: true
  });
}

// ── 1. Legacy single-cause pass ──────────────────────────────────────────────
// 1a. Below the bar: a slow voluntary pull under a high emigrationBar accumulates pressure but moves
// no one this turn (belowEmigrationBar → true; legacyEmigrate returns []).
(function legacyBelowBar() {
  pinBaseConfig();
  Object.assign(CONFIG, { splitTracksEnabled: false, emigrationBar: 1e9 });
  installConfigStore();
  globalThis.Game = { turn: 1 };
  const poor = makeCity(1, 1, { population: 10, rural: 10, yields: { YIELD_FOOD: 1 } });
  const rich = makeCity(1, 2, { population: 2, rural: 2, yields: { YIELD_FOOD: 5 } });
  installWorld({ 1: major([poor, rich]) });
  const moves = runPass().filter((m) => m.phase === "move");
  assert.equal(moves.length, 0, "legacy: under a high bar, no one moves this turn");
  assert.equal(poor.ruralPopulation, 10, "legacy: the source keeps its population while below the bar");
})();

// 1b. Cross the bar, then rest on cooldown: a strong pull over a low bar sheds at least one mover and
// arms the post-move cooldown; the next turn the source is resting (restingOnCooldown → true).
(function legacyShedThenCooldown() {
  pinBaseConfig();
  Object.assign(CONFIG, { splitTracksEnabled: false, emigrationBar: 1, cooldownTurns: 5 });
  installConfigStore();
  globalThis.Game = { turn: 1 };
  const poor = makeCity(1, 1, { population: 10, rural: 10, yields: { YIELD_FOOD: 1 } });
  const rich = makeCity(1, 2, { population: 2, rural: 2, yields: { YIELD_FOOD: 1000 } });
  installWorld({ 1: major([poor, rich]) });

  const first = runPass().filter((m) => m.phase === "move");
  assert.ok(first.length >= 1, "legacy: a strong pull over a low bar sheds a voluntary mover");
  assert.ok(poor.ruralPopulation < 10, "legacy: the source actually lost population");
  const afterFirst = poor.ruralPopulation;

  globalThis.Game = { turn: 2 }; // same cooldown window
  const second = runPass().filter((m) => m.phase === "move" && m.srcOwner === 1);
  assert.equal(second.length, 0, "legacy: the source rests on cooldown the next turn");
  assert.equal(poor.ruralPopulation, afterFirst, "legacy: nothing moves while resting on cooldown");
})();

// ── 2. Stance counterfactual: planTurn / planSource / planApply / planBump ────
// Two civs with a cross-civ pull; civ 1 slots Open Borders. The pass plans the cross-civ flows once
// with real stances and once with neutral borders and banks the difference — exercising the whole
// side-effect-free planning path without disturbing the real move.
(function stanceCounterfactual() {
  pinBaseConfig();
  Object.assign(CONFIG, {
    bordersEnabled: true, crossCivEnabled: true, emigrationBar: 1, cooldownTurns: 0,
    openBordersOpenness: 1.5, closedBordersOpenness: 0.4, opennessFloor: 0.15, poachBlock: 0
  });
  installConfigStore();
  globalThis.Game = { turn: 1 };
  // Civ 2's city is poor; civ 1's city is rich AND open-bordered → a cross-civ pull civ-1-ward.
  const poor = makeCity(2, 1, { population: 10, rural: 10, yields: { YIELD_FOOD: 1 }, x: 0, y: 0 });
  const rich = makeCity(1, 1, { population: 2, rural: 2, yields: { YIELD_FOOD: 1000 }, x: 1, y: 0 });
  installWorld({ 1: major([rich], { open: true }), 2: major([poor]) });

  // Should not throw; the counterfactual runs alongside the real pass.
  const recs = runPass();
  assert.ok(Array.isArray(recs), "stance: the pass completes with the counterfactual planned");
  const crossCiv = recs.filter((m) => m.crossCiv);
  assert.ok(crossCiv.length >= 1, "stance: an open-bordered rich neighbour pulls cross-civ migrants");
})();

// ── 3. Snapshot readers over a live world ─────────────────────────────────────
(function snapshots() {
  pinBaseConfig();
  Object.assign(CONFIG, { splitTracksEnabled: true, emigrationBar: 1 });
  installConfigStore();
  globalThis.Game = { turn: 1 };
  const poor = makeCity(1, 1, { name: "Poorholm", population: 8, rural: 8, yields: { YIELD_FOOD: 1 }, x: 0, y: 0 });
  const rich = makeCity(1, 2, { name: "Richberg", population: 3, rural: 3, yields: { YIELD_FOOD: 1000 }, x: 2, y: 0 });
  const foreign = makeCity(2, 1, { name: "Faraway", population: 4, rural: 4, yields: { YIELD_FOOD: 500 }, x: 9, y: 0 });
  installWorld({ 1: major([poor, rich]), 2: major([foreign]) });

  // Owner-level tallies the snapshot folds in (ownerStats reads these off EmigrationData).
  globalThis.EmigrationData = {
    netCumFor: (pid) => (pid === 1 ? -42 : 0),
    grossInCumFor: (pid) => (pid === 1 ? 10 : 0),
    grossOutCumFor: (pid) => (pid === 1 ? 52 : 0)
  };
  // Give Poorholm a real ethnic composition so resolveComposition returns parts (not null).
  compTest.reset();
  compTest.recordCompositionPass([{ city: { location: { x: 0, y: 0 }, name: "Poorholm" }, owner: 1, population: 8 }], []);

  // ownerCitySnapshots: one per city civ 1 owns.
  const owned = ownerCitySnapshots(1);
  assert.equal(owned.length, 2, "ownerCitySnapshots returns a snapshot per owned city");
  const poorSnap = owned.find((s) => s.cityName === "Poorholm");
  assert.ok(poorSnap, "the source city is present by its resolved name");
  assert.equal(poorSnap.ownerNet, -42, "owner-level net tally is folded in");
  assert.equal(poorSnap.ownerOut, 52, "owner-level outflow tally is folded in");
  assert.ok(poorSnap.composition && poorSnap.composition.parts.length >= 1,
    "the city's ethnic composition resolves to display parts");

  // A city with no recorded composition still snapshots (resolveComposition → null branch).
  const richSnap = owned.find((s) => s.cityName === "Richberg");
  assert.ok(richSnap, "a city without composition still produces a snapshot");
  assert.equal(richSnap.composition, null, "no composition recorded → null (no throw)");

  // citySnapshot by numeric localId (findSignal's localId path).
  const byId = citySnapshot(1);
  assert.ok(byId && typeof byId.cityName === "string", "citySnapshot resolves a city by its localId");

  // citySnapshot by the city object itself (findSignal's s.city path).
  const byObj = citySnapshot(poor);
  assert.ok(byObj && byObj.cityName === "Poorholm", "citySnapshot resolves a city by object identity");

  // An unknown id → null (findSignal miss).
  assert.equal(citySnapshot("no-such-city"), null, "an unknown city id → null");

  // ownerCitySnapshots for a civ that owns nothing here → [].
  assert.deepEqual(ownerCitySnapshots(7), [], "an ownerless civ → no snapshots");
})();

console.log("engine-legacy-snapshots harness passed");
