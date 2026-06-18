import assert from "node:assert/strict";

// Guardrail: simulation eligibility must NOT depend on local-player contact. With requireMet=false
// (global scope), an alive but UNMET foreign civ's cities must appear in collectCitySignals(); dead
// civs stay excluded and the city-state policy is still obeyed. Fails if met-gating is reintroduced
// at the simulation-input layer.

globalThis.GameContext = { localPlayerID: 1 };
globalThis.YieldTypes = {
  YIELD_FOOD: "YIELD_FOOD", YIELD_PRODUCTION: "YIELD_PRODUCTION", YIELD_GOLD: "YIELD_GOLD",
  YIELD_SCIENCE: "YIELD_SCIENCE", YIELD_CULTURE: "YIELD_CULTURE", YIELD_HAPPINESS: "YIELD_HAPPINESS"
};
globalThis.GameplayMap = { getLocationFromIndex: (i) => ({ x: i, y: 0 }) };

function makeCity(owner, localId) {
  return {
    owner, localId, name: "City" + owner + "_" + localId, isTown: false, isBeingRazed: false,
    isInfected: false, urbanPopulation: 0, population: 10, ruralPopulation: 8,
    location: { x: owner, y: localId },
    Yields: { getYield: () => 1 }, Happiness: { netHappinessPerTurn: 1, hasUnrest: false }
  };
}
// The local player (1) has met itself and civ 2; civ 3 is UNMET.
const metByLocal = new Set([1, 2]);
function major(pid, alive) {
  return {
    isAlive: alive, isMajor: true, isMinor: false,
    Cities: { getCities: () => [makeCity(pid, 1)] },
    Diplomacy: { hasMet: (o) => metByLocal.has(o), getWarCount: () => 0, isAtWar: () => false },
    Culture: { isTraditionActive: () => false }
  };
}
function cityState(pid) {
  return {
    isAlive: true, isMajor: false, isMinor: true,
    Cities: { getCities: () => [makeCity(pid, 1)] },
    Diplomacy: { hasMet: () => true, getWarCount: () => 0, isAtWar: () => false },
    Culture: { isTraditionActive: () => false }
  };
}
const world = { 1: major(1, true), 2: major(2, true), 3: major(3, true), 4: major(4, false), 5: cityState(5) };
globalThis.Players = { get: (pid) => world[pid] || null, getAlive: () => Object.values(world) };

const { collectCitySignals } = await import("/emigration/ui/emigration-cities.js");
const { CONFIG } = await import("/emigration/ui/emigration-config.js");

function owners() {
  return new Set(collectCitySignals().map((s) => s.owner));
}

// Global scope: unmet alive civ 3 is INCLUDED; dead civ 4 excluded; city-state 5 excluded.
CONFIG.requireMet = false;
CONFIG.includeCityStates = false;
let o = owners();
assert.ok(o.has(1) && o.has(2), "local + met civ present");
assert.ok(o.has(3), "UNMET alive civ included under global scope (requireMet=false)");
assert.ok(!o.has(4), "dead civ excluded");
assert.ok(!o.has(5), "city-state excluded when includeCityStates=false");

// City-state policy still honored when enabled.
CONFIG.includeCityStates = true;
assert.ok(owners().has(5), "city-state included when includeCityStates=true");
CONFIG.includeCityStates = false;

// Met-only scope: the unmet civ 3 is excluded again (the toggle still works).
CONFIG.requireMet = true;
o = owners();
assert.ok(o.has(1) && o.has(2), "met civs still present under met-only");
assert.ok(!o.has(3), "unmet civ excluded under met-only scope (toggle honored)");

CONFIG.requireMet = false; // leave at shipped default (global)
console.log("city-scope-global harness passed");
