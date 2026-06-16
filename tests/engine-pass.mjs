// engine-pass.mjs
//
// End-to-end characterization of the engine's per-turn pass (runPass). The other harnesses
// exercise the pure leaf modules the engine composes (geography, prosperity, pull, effects, ...)
// but never drive a full pass, so every engine mutant survived mutation testing (0%). This builds
// a tiny deterministic fake world on globalThis, pins the CONFIG knobs, and asserts the observable
// outcomes of a pass: that population actually moves, the right Migration records are emitted
// (move / depart / arrive / attrition), and the engine's branches (instant vs lagged transit,
// war-surge burst, the attrition outlet) behave as documented.
//
// It is off-engine: the loader maps /emigration/ specifiers and stubs /core. We only stub the
// handful of engine globals the readers touch (Players/Cities/Yields, Configuration for state
// persistence, Game.turn, GameplayMap for distance).

import assert from "node:assert/strict";
import { CONFIG } from "/emigration/ui/emigration-config.js";
import { runPass } from "/emigration/ui/emigration-engine.js";

// ── Deterministic engine globals ──────────────────────────────────────────
globalThis.YieldTypes = {
  YIELD_FOOD: "YIELD_FOOD",
  YIELD_PRODUCTION: "YIELD_PRODUCTION",
  YIELD_GOLD: "YIELD_GOLD",
  YIELD_SCIENCE: "YIELD_SCIENCE",
  YIELD_CULTURE: "YIELD_CULTURE",
  YIELD_HAPPINESS: "YIELD_HAPPINESS"
};
// Manhattan plot distance (drives transit lag + any geo term).
globalThis.GameplayMap = {
  getPlotDistance: (ax, ay, bx, by) => Math.abs(ax - bx) + Math.abs(ay - by)
};
globalThis.Culture = { isTraditionActive: () => false };
globalThis.Database = { makeHash: (t) => t };
globalThis.GameContext = { localPlayerID: 1 };

// In-memory GameConfiguration so loadState/saveState persist across passes in one scenario.
function installConfigStore() {
  const kv = {};
  globalThis.Configuration = {
    getGame: () => ({ getValue: (k) => kv[k] }),
    editGame: () => ({ setValue: (k, v) => (kv[k] = v) })
  };
}

// A minimal city object exposing exactly what emigration-cities.js / population.js read.
function makeCity(owner, localId, opts) {
  const o = opts || {};
  return {
    owner,
    localId,
    name: o.name || "City" + owner + "_" + localId,
    isTown: false,
    isBeingRazed: !!o.siege,
    isInfected: false,
    urbanPopulation: 0,
    population: o.population,
    ruralPopulation: o.rural,
    location: { x: o.x || 0, y: o.y || 0 },
    addRuralPopulation(d) {
      this.ruralPopulation += d;
      this.population += d;
    },
    Yields: { getYield: (ev) => (o.yields && o.yields[ev]) || 0 },
    Happiness: { netHappinessPerTurn: o.happiness || 0, hasUnrest: false }
  };
}

// Install a world of `players` (pid -> { isAlive, isMajor, cities:[city] }) on globalThis.Players.
function installWorld(playersById) {
  globalThis.Players = {
    get: (pid) => playersById[pid] || null,
    getAlive: () => Object.values(playersById)
  };
}

function major(cities) {
  return {
    isAlive: true,
    isMajor: true,
    isMinor: false,
    Cities: { getCities: () => cities },
    Diplomacy: { hasMet: () => true, getWarCount: () => 0, isAtWar: () => false },
    Culture: { isTraditionActive: () => false }
  };
}

// Pin the knobs to a simple, deterministic regime: a pure food-driven prosperity gradient, no
// border/congestion/cross-civ friction, pressure that crosses in one qualifying turn.
function pinBaseConfig() {
  Object.assign(CONFIG, {
    maxMovesPerTurn: 100,
    emigrationBar: 1,
    deltaExponent: 1,
    cooldownTurns: 0,
    minRuralToEmigrate: 1,
    requireMet: false,
    includeCityStates: false,
    crossCivEnabled: true,
    foodFactor: 1,
    productionFactor: 0,
    goldFactor: 0,
    scienceFactor: 0,
    cultureFactor: 0,
    populationFactor: 0,
    happinessShaped: false,
    localHappinessFactor: 0,
    unhappyCauseThreshold: -1000,
    baseReluctance: 0,
    perExtraPop: 0,
    cityStateBarrier: 0,
    poachBlock: 0,
    congestWeight: 0,
    bordersEnabled: false,
    distanceFactor: 0,
    tiltCap: 14,
    warSurgeMax: 1,
    warSiege: false,
    attritionEnabled: false,
    transitLagTurns: 0,
    transitHexPerTurn: 5
  });
}

// ── Scenario A: an instantaneous intra-civ move (transit lag 0) ────────────
(function scenarioInstant() {
  pinBaseConfig();
  installConfigStore();
  globalThis.Game = { turn: 1 };
  const poor = makeCity(1, 1, { population: 10, rural: 10, yields: { YIELD_FOOD: 1 } });
  const rich = makeCity(1, 2, { population: 2, rural: 2, yields: { YIELD_FOOD: 1000 } });
  installWorld({ 1: major([poor, rich]) });

  const migrations = runPass();
  const moves = migrations.filter((m) => m.phase === "move");
  assert.ok(moves.length >= 1, "A: at least one instantaneous move emitted");
  const m = moves[0];
  assert.equal(m.srcOwner, 1, "A: move carries source owner");
  assert.equal(m.destOwner, 1, "A: instantaneous move carries dest owner");
  assert.equal(m.cause, "prosperity", "A: peacetime pull is a prosperity move");
  assert.equal(m.crossCiv, false, "A: same-civ move is not cross-civ");
  assert.ok(m.people > 0, "A: a positive people count is scaled");
  assert.ok(poor.ruralPopulation < 10, "A: source actually lost rural population");
  assert.ok(rich.ruralPopulation > 2, "A: destination actually gained rural population");
  assert.equal(
    poor.ruralPopulation + rich.ruralPopulation,
    12,
    "A: total rural population is conserved on an instantaneous move"
  );
})();

// ── Scenario B: a lagged move — depart now, arrive turns later ─────────────
(function scenarioLagged() {
  pinBaseConfig();
  Object.assign(CONFIG, { transitLagTurns: 4, transitHexPerTurn: 5 });
  installConfigStore();
  globalThis.Game = { turn: 1 };
  // Far apart so the lag is > 0 (manhattan 50 / 5 = 10, capped at 4).
  const poor = makeCity(1, 1, { population: 3, rural: 3, yields: { YIELD_FOOD: 1 }, x: 0, y: 0 });
  const rich = makeCity(1, 2, { population: 2, rural: 2, yields: { YIELD_FOOD: 1000 }, x: 50, y: 0 });
  installWorld({ 1: major([poor, rich]) });

  const depart = runPass().filter((m) => m.phase === "depart");
  assert.ok(depart.length >= 1, "B: a lagged move emits a departure record");
  assert.equal(depart[0].destOwner, undefined, "B: a departure does not yet credit the destination");
  assert.equal(depart[0].srcOwner, 1, "B: a departure tallies against the source");
  assert.ok(poor.ruralPopulation < 3, "B: source loses the point at departure");
  assert.equal(rich.ruralPopulation, 2, "B: destination has NOT gained yet (in transit)");

  // Jump the turn well past the arrival and run again: the transit should land.
  globalThis.Game.turn = 100;
  const arrive = runPass().filter((m) => m.phase === "arrive");
  assert.ok(arrive.length >= 1, "B: the in-flight migration lands as an arrival");
  assert.equal(arrive[0].destOwner, 1, "B: an arrival credits the destination");
  assert.ok(rich.ruralPopulation > 2, "B: destination gains the point on arrival");
})();

// ── Scenario C: the attrition outlet — distressed source, no destination ───
(function scenarioAttrition() {
  pinBaseConfig();
  Object.assign(CONFIG, {
    attritionEnabled: true,
    attritionMinDistress: 1,
    attritionThreshold: 1,
    starvationModifier: -50 // a starving city is "distressed"
  });
  installConfigStore();
  globalThis.Game = { turn: 1 };
  // One lone, starving city: nowhere to flee → the trapped population dies off.
  const trapped = makeCity(1, 1, {
    population: 10,
    rural: 10,
    yields: { YIELD_FOOD: -5 } // negative food → starving → distress
  });
  installWorld({ 1: major([trapped]) });

  // runPass needs >= 2 cities to consider departures, so add a second far, equally-poor city that
  // is not an attractive destination (same prosperity → no positive pull).
  const other = makeCity(2, 1, { population: 10, rural: 10, yields: { YIELD_FOOD: -5 }, x: 99, y: 0 });
  installWorld({ 1: major([trapped]), 2: major([other]) });
  // No cross-civ refuge: equal misery on both sides means bestDestination finds no positive pull,
  // so the distressed source falls through to the attrition outlet.
  Object.assign(CONFIG, { crossCivEnabled: true, poachBlock: 1000 });

  const before = trapped.ruralPopulation;
  let sawAttrition = false;
  // Attrition accumulates its own pressure; run a few passes until it fires.
  for (let i = 0; i < 6 && !sawAttrition; i++) {
    const recs = runPass();
    if (recs.some((m) => m.cause === "attrition" && m.srcOwner === 1)) sawAttrition = true;
  }
  assert.ok(sawAttrition, "C: a trapped, distressed source eventually emits an attrition death");
  assert.ok(trapped.ruralPopulation < before, "C: attrition actually removes population");
})();

// ── Scenario D: war surge — a besieged source sheds a burst in one turn ─────
// Drive REAL violence through the documented observation path: districtDamageFrac reads
// Players.Districts.get(owner).getDistrictHealth(loc), so a fully-wrecked district at the source's
// location accumulates intensity (vwAssault + vwSiege) above the flee threshold → cause "war" →
// warSurgeBudget sheds a multi-point burst in one turn.
(function scenarioWarSurge() {
  pinBaseConfig();
  Object.assign(CONFIG, {
    warSurgeMax: 3,
    violenceFleeThreshold: 2,
    warSiege: false, // siegeEscalation returns 1 when warSiege is off → full surge
    transitLagTurns: 0
  });
  installConfigStore();
  globalThis.Game = { turn: 1 };
  // ComponentID → stable per-city key for the violence module.
  globalThis.ComponentID = { toBitfield: (cid) => cid.owner + ":" + cid.n };

  const besieged = makeCity(1, 1, { population: 10, rural: 10, yields: { YIELD_FOOD: 1 }, x: 0, y: 0 });
  besieged.id = { owner: 1, n: 1 };
  const haven = makeCity(1, 2, { population: 2, rural: 2, yields: { YIELD_FOOD: 1000 }, x: 5, y: 0 });
  haven.id = { owner: 1, n: 2 };
  installWorld({ 1: major([besieged, haven]) });
  // A location-aware districts accessor: the source's center (x=0) is fully wrecked (health 0 of
  // 100 → damage fraction 1); the haven (x=5) is undamaged. Same owner, so one accessor serves both.
  globalThis.Players.Districts = {
    get: () => ({
      getDistrictMaxHealth: () => 100,
      getDistrictHealth: (loc) => (loc && loc.x === 0 ? 0 : 100)
    })
  };

  const recs = runPass();
  const warMoves = recs.filter((m) => m.cause === "war" && (m.phase === "move" || m.phase === "depart"));
  assert.ok(warMoves.length >= 1, "D: the besieged source flees with cause war");
  assert.ok(
    warMoves.length >= 2,
    "D: warSurge sheds a multi-point burst in one turn (budget > 1), got " + warMoves.length
  );
  assert.ok(besieged.ruralPopulation <= 8, "D: the source lost the burst from its rural pool");
})();

console.log("engine-pass harness passed (4 scenarios)");
