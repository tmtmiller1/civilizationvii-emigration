import assert from "node:assert/strict";

const { CONFIG } = await import("/emigration/ui/emigration-config.js");
const { collectCitySignals } = await import("/emigration/ui/emigration-cities.js");

const priorIncludeCityStates = CONFIG.includeCityStates;
const priorRequireMet = CONFIG.requireMet;

globalThis.YieldTypes = {
  YIELD_FOOD: "food",
  YIELD_PRODUCTION: "production",
  YIELD_GOLD: "gold",
  YIELD_SCIENCE: "science",
  YIELD_CULTURE: "culture",
  YIELD_HAPPINESS: "happiness"
};

globalThis.GameContext = { localPlayerID: 0 };

function mkCity(owner, id, opts = {}) {
  const net = opts.net || {};
  const gross = opts.gross || {};
  return {
    owner,
    id: { owner, id },
    localId: id,
    name: opts.name || `City${id}`,
    isTown: !!opts.isTown,
    isBeingRazed: !!opts.isBeingRazed,
    isInfected: !!opts.isInfected,
    ruralPopulation: opts.ruralPopulation ?? 3,
    population: opts.population ?? 7,
    urbanPopulation: opts.urbanPopulation ?? 4,
    Happiness: opts.happiness,
    Yields: {
      getNetYield(key) {
        if (opts.throwNet) throw new Error("net-fail");
        if (opts.invalidNet) return Number.NaN;
        return Object.prototype.hasOwnProperty.call(net, key) ? net[key] : 0;
      },
      getYield(key) {
        return Object.prototype.hasOwnProperty.call(gross, key) ? gross[key] : 0;
      }
    }
  };
}

const players = {
  0: {
    isAlive: true,
    isMajor: true,
    isAtWar: true,
    Happiness: { isInGoldenAge: true, goldenAgeTurnsLeft: 3, hasWarWeariness: true },
    Cities: {
      getCities() {
        return [
          mkCity(0, 1, {
            net: { food: -2, production: 5, gold: 10, science: 3, culture: 2, happiness: -1 },
            happiness: { netHappinessPerTurn: -3, hasUnrest: true },
            isBeingRazed: true,
            isInfected: true
          }),
          mkCity(0, 2, {
            invalidNet: true,
            gross: { food: 4, production: 2, gold: 1, science: 1, culture: 0, happiness: 6 },
            happiness: null,
            isTown: true
          })
        ];
      }
    }
  },
  1: {
    isAlive: true,
    isMajor: true,
    isAtWar: false,
    Cities: {
      getCities() {
        return [mkCity(1, 3, { net: { food: 3, production: 1, gold: 1, science: 1, culture: 1 } })];
      }
    }
  },
  2: {
    isAlive: true,
    isMajor: false,
    isMinor: true,
    Cities: {
      getCities() {
        return [mkCity(2, 4, { net: { food: 2 } })];
      }
    }
  }
};

players[0].Diplomacy = {
  hasMet(pid) {
    return pid === 1;
  }
};

globalThis.Players = {
  get(pid) {
    return players[pid] || null;
  }
};

globalThis.GameInfo = {
  HappinessStages: {
    forEach(cb) {
      cb({ HappinessStageType: "HAPPINESS_STAGE_ANGRY", StageMinThreshold: -999, StageMaxThreshold: -3 });
      cb({ HappinessStageType: "HAPPINESS_STAGE_HAPPY", StageMinThreshold: -2, StageMaxThreshold: 2 });
      cb({ HappinessStageType: "HAPPINESS_STAGE_ECSTATIC", StageMinThreshold: 3, StageMaxThreshold: 999 });
    }
  },
  Governments: {
    lookup() {
      return { GovernmentType: "GOVERNMENT_CLASSICAL_REPUBLIC" };
    }
  }
};

function testCollectSignalsFiltersByPolicy() {
  CONFIG.includeCityStates = false;
  CONFIG.requireMet = true;

  const out = collectCitySignals();
  assert.ok(out.length >= 2, "local player's cities should be collected");
  assert.ok(out.every((s) => s.owner !== 2), "city-state should be filtered when includeCityStates=false");
}

function testSignalFieldsAndFallbacks() {
  CONFIG.includeCityStates = true;
  CONFIG.requireMet = false;

  const out = collectCitySignals();
  const primary = out.find((s) => s.key === "0:1");
  const fallbackYield = out.find((s) => s.key === "0:2");
  const minor = out.find((s) => s.owner === 2);

  assert.ok(primary);
  assert.equal(primary.starving, true);
  assert.equal(primary.unrest, true);
  assert.equal(primary.siege, true);
  assert.equal(primary.atWar, true);
  assert.equal(primary.stage, -2);
  assert.equal(primary.population, 7);
  assert.equal(primary.rural, 3);

  assert.ok(fallbackYield);
  assert.equal(fallbackYield.food, 4, "should fall back to gross yield when net read fails");
  assert.equal(fallbackYield.happiness, 6, "happiness should fall back to yield when city Happiness is absent");
  assert.equal(fallbackYield.isTown, true);

  assert.ok(minor);
  assert.equal(minor.isCityState, true);
}

testCollectSignalsFiltersByPolicy();
testSignalFieldsAndFallbacks();

CONFIG.includeCityStates = priorIncludeCityStates;
CONFIG.requireMet = priorRequireMet;
delete globalThis.GameInfo;
delete globalThis.GameContext;
delete globalThis.Players;
delete globalThis.YieldTypes;

console.log("cities-signals harness passed");
