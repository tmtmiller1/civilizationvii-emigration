import assert from "node:assert/strict";

globalThis.Database = { makeHash: (s) => s === "UNIT_MIGRANT" ? "HASH_MIGRANT" : null };
globalThis.GameInfo = {
  Units: {
    lookup: (type) => type === "UNIT_MIGRANT" || type === "HASH_MIGRANT" 
      ? { UnitType: "UNIT_MIGRANT" } 
      : null
  }
};
globalThis.Players = {
  get: (pid) => ({
    Units: {
      getUnits: () => [
        { type: "HASH_MIGRANT", name: "Migrant" },
        { type: "UNIT_CAVALRY", name: "Cavalry" },
        { type: "UNIT_MIGRANT", name: "Nomad Migrant" }
      ]
    }
  })
};
globalThis.Configuration = {
  getGame: () => ({ getValue: () => null }),
  editGame: () => ({ setValue: () => {} })
};

const { countMigrants } = await import("/emigration/ui/emigration-migrant-units.js");

function testCountMigrantsWithMigrantUnits() {
  const count = countMigrants(0);
  assert.equal(typeof count, "number");
  assert.ok(count > 0, "should find at least one migrant unit");
}

function testCountMigrantsWithNoMigrants() {
  globalThis.Players.get = () => ({
    Units: {
      getUnits: () => [
        { type: "UNIT_CAVALRY", name: "Cavalry" },
        { type: "UNIT_WARRIOR", name: "Warrior" }
      ]
    }
  });
  
  const count = countMigrants(1);
  assert.equal(count, 0, "should find no migrants");
}

function testCountMigrantsWithoutGameInfo() {
  const originalGameInfo = globalThis.GameInfo;
  delete globalThis.GameInfo;
  const count = countMigrants(0);
  assert.equal(typeof count, "number");
  globalThis.GameInfo = originalGameInfo;
}

function testCountMigrantsWithEmptyUnits() {
  globalThis.Players.get = () => ({
    Units: { getUnits: () => [] }
  });
  
  const count = countMigrants(2);
  assert.equal(count, 0);
}

function testCountMigrantsErrorHandling() {
  globalThis.Players.get = () => ({ Units: null });
  const count = countMigrants(3);
  assert.equal(typeof count, "number");
}

testCountMigrantsWithMigrantUnits();
testCountMigrantsWithNoMigrants();
testCountMigrantsWithoutGameInfo();
testCountMigrantsWithEmptyUnits();
testCountMigrantsErrorHandling();

delete globalThis.Database;
delete globalThis.GameInfo;
delete globalThis.Players;
delete globalThis.Configuration;

console.log("migrant-units-branches harness passed");
