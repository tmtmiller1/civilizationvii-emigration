import assert from "node:assert/strict";

// Setup comprehensive mocks for violence-signals testing
globalThis.CONFIG = { vwPillage: 1 };
globalThis.Players = {
  Districts: {
    get: (pid) => ({
      getDistrictIds: () => [
        { x: 10, y: 20, owner: pid },
        { x: 11, y: 20, owner: pid },
        { x: 12, y: 20, owner: pid }
      ],
      getDistrictMaxHealth: () => 100,
      getDistrictHealth: (loc) => {
        if (loc.x === 11) return 50;  // 50% damaged
        if (loc.x === 12) return 0;   // 100% destroyed
        return 100;  // Pristine
      },
      getDistrictIsBesieged: (loc) => loc.x === 12
    })
  }
};

globalThis.MapConstructibles = {
  getConstructibles: (x, y) => {
    if (x === 10 && y === 20) return [{ id: "c1" }];
    if (x === 11 && y === 20) return [{ id: "c2" }];
    return null;
  }
};

globalThis.Constructibles = {
  getByComponentID: (cid) => {
    if (cid.id === "c2") return { damaged: true };
    return { damaged: false };
  }
};

globalThis.GameplayMap = {
  getLocationFromIndex: (idx) => {
    const locs = { 0: { x: 10, y: 20 }, 1: { x: 11, y: 20 }, 2: { x: 12, y: 20 } };
    return locs[idx] || null;
  }
};

const { districtDamageFrac, districtBesieged, pillagedCount } =
  await import("/emigration/ui/emigration-violence-signals.js");

function testDistrictDamageFracWithDamagedDistricts() {
  const city = {
    owner: 1,
    getPurchasedPlots: () => [0, 1, 2]
  };
  
  const damage = districtDamageFrac(city);
  assert.equal(typeof damage, "number", "should return a number");
  assert.ok(damage >= 0 && damage <= 1, "damage should be between 0 and 1");
}

function testDistrictDamageFracWithNoCityDistricts() {
  const city = { owner: 999 };  // Non-existent owner
  const damage = districtDamageFrac(city);
  assert.equal(damage, 0, "should return 0 when city districts unavailable");
}

function testDistrictDamageFracWithNullCity() {
  const damage = districtDamageFrac(null);
  assert.equal(damage, 0, "should return 0 for null city");
}

function testDistrictBesiegedWithContestedDistrict() {
  // Create a mock with a contested district
  const origDistricts = globalThis.Players.Districts;
  globalThis.Players.Districts = {
    get: (pid) => ({
      getDistrictIds: () => [{ x: 10, y: 20, owner: pid }],
      getDistrictIsBesieged: () => false
    })
  };
  
  // Mock cityDistrictObjs to return a contested district
  const city = {
    owner: 1,
    getPurchasedPlots: () => []
  };
  
  // Should check contested status - we need to test the logic path
  const besieged = districtBesieged(city);
  assert.equal(typeof besieged, "boolean", "should return a boolean");
  
  globalThis.Players.Districts = origDistricts;
}

function testDistrictBesiegedWithBesiegeFlagSet() {
  const city = {
    owner: 1,
    getPurchasedPlots: () => [0, 1, 2]
  };
  
  const besieged = districtBesieged(city);
  assert.equal(typeof besieged, "boolean", "should return a boolean");
  // With mock setup, district at x=12 should be besieged
}

function testDistrictBesiegedWithNullCity() {
  const besieged = districtBesieged(null);
  assert.equal(besieged, false, "should return false for null city");
}

function testDistrictBesiegedWithoutDistrictsAPI() {
  globalThis.Players.Districts = null;
  const city = { owner: 1, getPurchasedPlots: () => [] };
  
  const besieged = districtBesieged(city);
  assert.equal(besieged, false, "should return false when Districts API unavailable");
  
  globalThis.Players.Districts = {
    get: () => null
  };
  const besieged2 = districtBesieged(city);
  assert.equal(besieged2, false, "should return false when cityDistricts returns null");
}

function testPillagedCountWithPillagedPlots() {
  const city = {
    owner: 1,
    getPurchasedPlots: () => [0, 1, 2]
  };
  
  const count = pillagedCount(city);
  assert.equal(typeof count, "number", "should return a number");
  assert.ok(count >= 0, "pillaged count should be non-negative");
  // Plot 1 should have pillage
  assert.ok(count > 0, "should count pillaged plots");
}

function testPillagedCountWithNoPillagedPlots() {
  globalThis.MapConstructibles = {
    getConstructibles: () => null
  };
  
  const city = {
    owner: 1,
    getPurchasedPlots: () => [0, 1, 2]
  };
  
  const count = pillagedCount(city);
  assert.equal(count, 0, "should return 0 when no pillage detected");
}

function testPillagedCountWhenConfigDisabled() {
  const origConfig = globalThis.CONFIG.vwPillage;
  globalThis.CONFIG.vwPillage = 0;
  
  const city = {
    owner: 1,
    getPurchasedPlots: () => [0, 1, 2]
  };
  
  const count = pillagedCount(city);
  assert.equal(count, 0, "should return 0 when vwPillage is disabled");
  
  globalThis.CONFIG.vwPillage = origConfig;
}

function testPillagedCountWithNullCity() {
  const count = pillagedCount(null);
  assert.equal(count, 0, "should return 0 for null city");
}

function testPillagedCountWithoutPurchasedPlots() {
  const city = { owner: 1, getPurchasedPlots: () => null };
  const count = pillagedCount(city);
  assert.equal(count, 0, "should handle null purchased plots");
}

function testPillagedCountErrorHandling() {
  globalThis.MapConstructibles = {
    getConstructibles: () => {
      throw new Error("API error");
    }
  };
  
  const city = {
    owner: 1,
    getPurchasedPlots: () => [0, 1, 2]
  };
  
  // Should not throw
  try {
    const count = pillagedCount(city);
    assert.equal(typeof count, "number");
  } catch (e) {
    assert.fail(`should handle errors gracefully: ${e.message}`);
  }
}

testDistrictDamageFracWithDamagedDistricts();
testDistrictDamageFracWithNoCityDistricts();
testDistrictDamageFracWithNullCity();
testDistrictBesiegedWithContestedDistrict();
testDistrictBesiegedWithBesiegeFlagSet();
testDistrictBesiegedWithNullCity();
testDistrictBesiegedWithoutDistrictsAPI();
testPillagedCountWithPillagedPlots();
testPillagedCountWithNoPillagedPlots();
testPillagedCountWhenConfigDisabled();
testPillagedCountWithNullCity();
testPillagedCountWithoutPurchasedPlots();
testPillagedCountErrorHandling();

delete globalThis.CONFIG;
delete globalThis.Players;
delete globalThis.MapConstructibles;
delete globalThis.Constructibles;
delete globalThis.GameplayMap;

console.log("violence-signals-branches harness passed");
