import assert from "node:assert/strict";

const { CONFIG } = await import("/emigration/ui/emigration-config.js");
const { collectCitySignals } = await import("/emigration/ui/emigration-cities.js");

const priorIncludeCityStates = CONFIG.includeCityStates;
const priorRequireMet = CONFIG.requireMet;

function mkCity(owner, localId, opts = {}) {
  return {
    owner,
    localId,
    id: localId,
    isTown: !!opts.isTown,
    isBeingRazed: !!opts.isBeingRazed,
    isInfected: !!opts.isInfected,
    population: opts.population ?? 5,
    urbanPopulation: opts.urbanPopulation ?? 2,
    Yields: opts.yields,
    Happiness: opts.happiness
  };
}

function baseGlobals() {
  globalThis.GameContext = { localPlayerID: 0 };
  globalThis.GameInfo = {
    HappinessStages: { forEach: () => {} },
    Governments: { lookup: () => null }
  };
}

// Branch: includeCityStates false + requireMet true + unmet filtered + atWar fallback from diplomacy fn.
baseGlobals();
CONFIG.includeCityStates = false;
CONFIG.requireMet = true;

globalThis.YieldTypes = {
  YIELD_FOOD: "food",
  YIELD_PRODUCTION: "production",
  YIELD_GOLD: "gold",
  YIELD_SCIENCE: "science",
  YIELD_CULTURE: "culture",
  YIELD_HAPPINESS: "happiness"
};

const playersA = {
  0: {
    isAlive: true,
    isMajor: true,
    Diplomacy: { hasMet: (pid) => pid === 1 },
    Cities: {
      getCities: () => [mkCity(0, 1, {
        yields: {
          getNetYield: () => Number.NaN,
          getYield: (k) => (k === "food" ? -2 : 1)
        },
        happiness: { netHappinessPerTurn: -1, hasUnrest: true },
        isBeingRazed: true,
        isInfected: true
      })]
    }
  },
  1: {
    isAlive: true,
    isMajor: true,
    Diplomacy: { isAtWarWithAnyMajorCiv: () => true },
    Cities: {
      getCities: () => [mkCity(1, 2, {
        yields: {
          getNetYield: () => 2,
          getYield: () => 0
        }
      })]
    }
  },
  2: {
    isAlive: true,
    isMinor: true,
    Cities: { getCities: () => [mkCity(2, 3, { yields: { getNetYield: () => 1, getYield: () => 1 } })] }
  },
  3: {
    isAlive: true,
    isMajor: true,
    Cities: { getCities: () => [mkCity(3, 4, { yields: { getNetYield: () => 1, getYield: () => 1 } })] }
  }
};

globalThis.Players = {
  get(pid) {
    if (pid === 5) throw new Error("player lookup boom");
    return playersA[pid] || null;
  }
};

const outA = collectCitySignals();
assert.ok(outA.some((s) => s.owner === 0));
assert.ok(outA.some((s) => s.owner === 1));
assert.ok(!outA.some((s) => s.owner === 2), "city-state should be filtered");
assert.ok(!outA.some((s) => s.owner === 3), "unmet major should be filtered when requireMet");
assert.ok(outA.some((s) => s.owner === 0 && s.starving));

// Branches: missing YieldTypes, missing Yields, getNetYield throw, getYield throw, localHasMet catch.
CONFIG.includeCityStates = true;
CONFIG.requireMet = true;

Object.defineProperty(globalThis, "YieldTypes", {
  configurable: true,
  get() {
    throw new Error("yield enum unavailable");
  }
});

Object.defineProperty(globalThis, "GameContext", {
  configurable: true,
  get() {
    throw new Error("gamecontext unavailable");
  }
});

const playersB = {
  0: {
    isAlive: true,
    isMajor: true,
    Cities: {
      getCities: () => [
        mkCity(0, 11, {
          yields: {
            getNetYield: () => {
              throw new Error("net fail");
            },
            getYield: () => {
              throw new Error("gross fail");
            }
          },
          happiness: null
        }),
        mkCity(0, 12, {
          yields: null,
          happiness: null
        }),
        {
          owner: 0,
          get localId() {
            throw new Error("city object boom");
          }
        }
      ]
    }
  },
  1: {
    isAlive: true,
    isMajor: true,
    Cities: {
      getCities: () => {
        throw new Error("cities read boom");
      }
    }
  },
  2: {
    isAlive: true,
    isMinor: true,
    Cities: {
      getCities: () => null
    }
  }
};

globalThis.Players = {
  get(pid) {
    return playersB[pid] || null;
  }
};

const outB = collectCitySignals();
assert.ok(outB.some((s) => s.key === "0:11"));
const c11 = outB.find((s) => s.key === "0:11");
assert.equal(c11.food, 0, "throwing yield readers should fail-safe to 0");
assert.equal(c11.happiness, 0, "missing Happiness + yield fallback failures should be 0");
assert.ok(outB.some((s) => s.key === "0:12"), "city with null Yields should still produce signal");

// cleanup
CONFIG.includeCityStates = priorIncludeCityStates;
CONFIG.requireMet = priorRequireMet;

const priorGameContext = Object.getOwnPropertyDescriptor(globalThis, "GameContext");
if (priorGameContext && priorGameContext.value) {
  globalThis.GameContext = priorGameContext.value;
} else {
  delete globalThis.GameContext;
}

delete globalThis.GameInfo;
delete globalThis.Players;
delete globalThis.YieldTypes;

console.log("cities-branches-extra harness passed");
