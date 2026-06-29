import assert from "node:assert/strict";

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { runPass } from "/emigration/ui/emigration-engine.js";

globalThis.YieldTypes = {
  YIELD_FOOD: "YIELD_FOOD",
  YIELD_PRODUCTION: "YIELD_PRODUCTION",
  YIELD_GOLD: "YIELD_GOLD",
  YIELD_SCIENCE: "YIELD_SCIENCE",
  YIELD_CULTURE: "YIELD_CULTURE",
  YIELD_HAPPINESS: "YIELD_HAPPINESS"
};
globalThis.GameplayMap = {
  getPlotDistance: (ax, ay, bx, by) => Math.abs(ax - bx) + Math.abs(ay - by)
};
globalThis.Culture = { isTraditionActive: () => false };
globalThis.Database = { makeHash: (v) => v };
globalThis.GameContext = { localPlayerID: 1 };
globalThis.ComponentID = { toBitfield: (cid) => `${cid.owner}:${cid.n}` };

const world = {};
const mementos = {};
const kv = {};
let turn = 1;

globalThis.Game = {
  get turn() {
    return turn;
  }
};

globalThis.Configuration = {
  getGame: () => ({ getValue: (k) => kv[k] }),
  editGame: () => ({ setValue: (k, v) => (kv[k] = v) })
};

globalThis.GameInfo = {
  Leaders: { lookup: (lt) => (lt ? { LeaderType: lt } : null) },
  Civilizations: { lookup: (ct) => (ct ? { CivilizationType: ct } : null) }
};

globalThis.Online = {
  Metaprogression: {
    getEquippedMementos: (pid) => mementos[pid] || []
  }
};

globalThis.Players = {
  get: (pid) => world[pid] || null,
  getAlive: () => Object.values(world),
  grantYield: () => {},
  Districts: {
    get: () => ({
      getDistrictMaxHealth: () => 100,
      getDistrictHealth: () => 100
    })
  }
};

function baseConfig() {
  Object.assign(CONFIG, {
    maxMovesPerTurn: 100,
    movesPerCity: 1,
    movesPerSiege: 3,
    maxLossPerCityPerTurn: 2,
    maxGainPerCityPerTurn: 2,
    emigrationBar: 1,
    deltaExponent: 1,
    cooldownTurns: 0,
    minRuralToEmigrate: 1,
    requireMet: false,
    includeCityStates: false,
    crossCivEnabled: true,
    foodFactor: 1,
    productionFactor: 1,
    goldFactor: 1,
    scienceFactor: 1,
    cultureFactor: 1,
    populationFactor: 0,
    localHappinessFactor: 6,
    unhappyCauseThreshold: 0,
    baseReluctance: 0,
    perExtraPop: 0,
    cityStateBarrier: 0,
    poachBlock: 0,
    congestWeight: 0,
    bordersEnabled: false,
    distanceFactor: 0,
    warSurgeMax: 3,
    warSiege: false,
    attritionEnabled: false,
    transitLagTurns: 0,
    transitHexPerTurn: 5,
    civTuningEnabled: true,
    civTuningStrength: 1
  });
}

function makeCity(owner, localId, opts) {
  const o = opts || {};
  return {
    owner,
    localId,
    id: { owner, n: localId },
    name: o.name || `City_${owner}_${localId}`,
    isTown: false,
    isBeingRazed: !!o.siege,
    isInfected: false,
    urbanPopulation: o.urban || 0,
    population: o.population,
    ruralPopulation: o.rural,
    location: { x: o.x || 0, y: o.y || 0 },
    addRuralPopulation(d) {
      this.ruralPopulation += d;
      this.population += d;
    },
    Yields: {
      getYield: (y) => (o.yields && y in o.yields ? o.yields[y] : 0),
      getNetYield: (y) => (o.yields && y in o.yields ? o.yields[y] : 0)
    },
    Happiness: { netHappinessPerTurn: o.happiness || 0, hasUnrest: !!o.unrest }
  };
}

function major(opts) {
  const o = opts || {};
  return {
    isAlive: true,
    isMajor: true,
    isMinor: false,
    leaderType: o.leaderType,
    civilizationType: o.civilizationType,
    Cities: { getCities: () => o.cities || [] },
    Diplomacy: { hasMet: () => true, getWarCount: () => 0, isAtWar: () => false },
    Culture: { isTraditionActive: () => false },
    Treasury: { goldBalance: o.goldBalance || 0 },
    Units: { getUnits: () => [] }
  };
}

function resetState() {
  for (const k of Object.keys(world)) delete world[k];
  for (const k of Object.keys(mementos)) delete mementos[k];
  for (const k of Object.keys(kv)) delete kv[k];
  turn = 1;
}

function applyWorld(players) {
  resetState();
  for (const [pid, player] of Object.entries(players)) {
    world[Number(pid)] = player;
  }
}

function checkInvariants(records, trackedCityNames) {
  for (const r of records) {
    if (typeof r.people === "number") {
      assert.ok(Number.isFinite(r.people), "record people must be finite");
      assert.ok(r.people > 0, "record people must be positive");
    }
  }
  for (const city of trackedCityNames) {
    assert.ok(city.population >= 0, "population must never go negative");
    assert.ok(city.ruralPopulation >= 0, "rural population must never go negative");
  }
  const lossBySrc = new Map();
  const gainByDest = new Map();
  for (const r of records) {
    if (r.cause === "attrition") continue;
    if (typeof r.srcOwner === "number" && r.srcName) {
      const key = `${r.srcOwner}:${r.srcName}`;
      lossBySrc.set(key, (lossBySrc.get(key) || 0) + 1);
    }
    if (typeof r.destOwner === "number" && r.destName) {
      const key = `${r.destOwner}:${r.destName}`;
      gainByDest.set(key, (gainByDest.get(key) || 0) + 1);
    }
  }
  for (const v of lossBySrc.values()) {
    assert.ok(v <= CONFIG.maxLossPerCityPerTurn, "per-city migration loss cap must hold");
  }
  for (const v of gainByDest.values()) {
    assert.ok(v <= CONFIG.maxGainPerCityPerTurn, "per-city migration gain cap must hold");
  }
}

function runScenario(label, setup, turnsToRun) {
  baseConfig();
  const tracked = setup();
  for (let t = 0; t < turnsToRun; t++) {
    turn = t + 1;
    const records = runPass();
    checkInvariants(records, tracked);
    // Ulema-like guard: very unhappy voluntary sources should classify as unhappiness, not prosperity.
    for (const city of tracked) {
      if (city.owner !== 1) continue;
      if (!(city.Happiness.netHappinessPerTurn < CONFIG.unhappyCauseThreshold)) continue;
      const voluntary = records.filter(
        (r) => r.srcOwner === city.owner && r.srcName === city.name && r.cause !== "war" && r.cause !== "disaster"
      );
      if (voluntary.length) {
        assert.ok(
          voluntary.every((r) => r.cause === "unhappiness" || r.cause === "attrition"),
          `${label}: unhappy specialist-like source emitted non-unhappiness voluntary migration`
        );
      }
    }
  }
}

runScenario(
  "specialist-science pressure",
  () => {
    const src = makeCity(1, 1, {
      name: "MadrasaHub",
      population: 14,
      rural: 14,
      urban: 10,
      yields: {
        YIELD_FOOD: 2,
        YIELD_PRODUCTION: 2,
        YIELD_GOLD: 1,
        YIELD_SCIENCE: 36,
        YIELD_CULTURE: 5,
        YIELD_HAPPINESS: -12
      },
      happiness: -12,
      unrest: true
    });
    const dst = makeCity(2, 1, {
      name: "HarborHaven",
      population: 9,
      rural: 9,
      urban: 3,
      yields: {
        YIELD_FOOD: 12,
        YIELD_PRODUCTION: 10,
        YIELD_GOLD: 8,
        YIELD_SCIENCE: 8,
        YIELD_CULTURE: 6,
        YIELD_HAPPINESS: 8
      },
      happiness: 8,
      x: 1,
      y: 0
    });
    applyWorld({
      1: major({ cities: [src], leaderType: "LEADER_CONFUCIUS", civilizationType: "CIVILIZATION_ABBASID", goldBalance: 60 }),
      2: major({ cities: [dst], leaderType: "LEADER_ISABELLA", civilizationType: "CIVILIZATION_SPAIN", goldBalance: 300 })
    });
    return [src, dst];
  },
  8
);

runScenario(
  "memento magnet stack",
  () => {
    const src = makeCity(1, 1, {
      name: "SourceTown",
      population: 10,
      rural: 10,
      urban: 4,
      yields: {
        YIELD_FOOD: 1,
        YIELD_PRODUCTION: 1,
        YIELD_GOLD: 1,
        YIELD_SCIENCE: 1,
        YIELD_CULTURE: 1,
        YIELD_HAPPINESS: -4
      },
      happiness: -4
    });
    const dst = makeCity(2, 1, {
      name: "MagnetCapital",
      population: 12,
      rural: 12,
      urban: 6,
      yields: {
        YIELD_FOOD: 8,
        YIELD_PRODUCTION: 7,
        YIELD_GOLD: 11,
        YIELD_SCIENCE: 8,
        YIELD_CULTURE: 8,
        YIELD_HAPPINESS: 11
      },
      happiness: 11,
      x: 2,
      y: 0
    });
    applyWorld({
      1: major({ cities: [src], leaderType: "LEADER_TRUNG_TRAC", civilizationType: "CIVILIZATION_DAI_VIET", goldBalance: 120 }),
      2: major({ cities: [dst], leaderType: "LEADER_BENJAMIN_FRANKLIN", civilizationType: "CIVILIZATION_AMERICA", goldBalance: 800 })
    });
    mementos[2] = [
      { mementoTypeId: "MEMENTO_BENJAMIN_FRANKLIN_GLASS_ARMONICA" },
      { mementoTypeId: "MEMENTO_FOUNDATION_LYDIAN_LION" },
      { mementoTypeId: "MEMENTO_FOUNDATION_TRAVELS_MARCO_POLO" }
    ];
    return [src, dst];
  },
  10
);

runScenario(
  "negative science edge",
  () => {
    const src = makeCity(1, 1, {
      name: "CollapsedAcademy",
      population: 11,
      rural: 11,
      urban: 8,
      yields: {
        YIELD_FOOD: 0,
        YIELD_PRODUCTION: 1,
        YIELD_GOLD: 0,
        YIELD_SCIENCE: -20,
        YIELD_CULTURE: 2,
        YIELD_HAPPINESS: -9
      },
      happiness: -9
    });
    const dst = makeCity(2, 1, {
      name: "SteadyProvince",
      population: 11,
      rural: 11,
      urban: 3,
      yields: {
        YIELD_FOOD: 6,
        YIELD_PRODUCTION: 6,
        YIELD_GOLD: 6,
        YIELD_SCIENCE: 4,
        YIELD_CULTURE: 4,
        YIELD_HAPPINESS: 5
      },
      happiness: 5,
      x: 1,
      y: 1
    });
    applyWorld({
      1: major({ cities: [src], leaderType: "LEADER_HIMIKO", civilizationType: "CIVILIZATION_HEIAN", goldBalance: 40 }),
      2: major({ cities: [dst], leaderType: "LEADER_AUGUSTUS", civilizationType: "CIVILIZATION_ROME", goldBalance: 200 })
    });
    return [src, dst];
  },
  8
);

console.log("hypotheticals harness passed");
