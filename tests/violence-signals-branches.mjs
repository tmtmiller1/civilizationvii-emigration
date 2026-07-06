import assert from "node:assert/strict";

const { CONFIG } = await import("/emigration/ui/emigration-config.js");
const { districtDamageFrac, districtBesieged, pillagedCount } =
  await import("/emigration/ui/emigration-violence-signals.js");

const originalVwPillage = CONFIG.vwPillage;

function resetGlobals() {
  delete globalThis.Players;
  delete globalThis.Districts;
  delete globalThis.MapConstructibles;
  delete globalThis.Constructibles;
  delete globalThis.GameplayMap;
}

function setDistrictMocks({ city, districtRows, healthByKey, besiegedByKey }) {
  const byId = new Map(districtRows.map(d => [d.__id, d]));
  const pd = {
    getDistrictIds: () => districtRows.map(d => d.__id),
    getDistrictMaxHealth: (loc) => healthByKey[`${loc.x},${loc.y}`]?.max,
    getDistrictHealth: (loc) => healthByKey[`${loc.x},${loc.y}`]?.cur,
    getDistrictIsBesieged: (loc) => !!besiegedByKey[`${loc.x},${loc.y}`]
  };
  globalThis.Players = {
    Districts: {
      get: (owner) => (owner === city.owner ? pd : null)
    }
  };
  globalThis.Districts = {
    get: (did) => byId.get(did) || null
  };
}

const city = {
  owner: 1,
  id: { owner: 1, id: 77 },
  location: { x: 10, y: 20 },
  getPurchasedPlots: () => [1, 2, 3, 4]
};

resetGlobals();
setDistrictMocks({
  city,
  districtRows: [
    {
      __id: "center",
      cityId: { owner: 1, id: 77 },
      location: { x: 10, y: 20 },
      owner: 1,
      controllingPlayer: 1
    },
    {
      __id: "outer",
      cityId: { owner: 1, id: 77 },
      location: { x: 11, y: 20 },
      owner: 1,
      controllingPlayer: 1
    },
    {
      __id: "other-city",
      cityId: { owner: 1, id: 78 },
      location: { x: 99, y: 99 },
      owner: 1,
      controllingPlayer: 1
    }
  ],
  healthByKey: {
    "10,20": { max: 100, cur: 100 },
    "11,20": { max: 100, cur: 40 }
  },
  besiegedByKey: {}
});
assert.equal(districtDamageFrac(city), 0.6, "worst district damage should be returned");

// Defensive path coverage: missing/invalid district health values are skipped.
setDistrictMocks({
  city,
  districtRows: [
    {
      __id: "bad",
      cityId: { owner: 1, id: 77 },
      location: { x: 12, y: 20 },
      owner: 1,
      controllingPlayer: 1
    }
  ],
  healthByKey: {
    "12,20": { max: 0, cur: "NaN" }
  },
  besiegedByKey: {}
});
assert.equal(districtDamageFrac(city), 0, "invalid district health inputs should produce zero damage");

// Missing Districts API path.
globalThis.Players = { Districts: null };
assert.equal(districtDamageFrac(city), 0, "missing Districts API should produce zero damage");

resetGlobals();
setDistrictMocks({
  city,
  districtRows: [
    {
      __id: "contested",
      cityId: { owner: 1, id: 77 },
      location: { x: 10, y: 20 },
      owner: 1,
      controllingPlayer: 2
    }
  ],
  healthByKey: {
    "10,20": { max: 100, cur: 100 }
  },
  besiegedByKey: {}
});
assert.equal(districtBesieged(city), true, "contested districts should be reported as besieged");

// Non-contested districts with an explicit besieged flag path.
setDistrictMocks({
  city,
  districtRows: [
    {
      __id: "safe",
      cityId: { owner: 1, id: 77 },
      location: { x: 10, y: 20 },
      owner: 1,
      controllingPlayer: 1
    }
  ],
  healthByKey: {
    "10,20": { max: 100, cur: 100 }
  },
  besiegedByKey: {
    "10,20": true
  }
});
assert.equal(districtBesieged(city), true, "district besieged flag should be respected");

// Missing getDistrictIsBesieged fallback path.
globalThis.Players = {
  Districts: {
    get: () => ({
      getDistrictIds: () => [],
      getDistrictMaxHealth: () => 100,
      getDistrictHealth: () => 100
    })
  }
};
assert.equal(districtBesieged(city), false, "missing besiege accessor should return false");

resetGlobals();
globalThis.MapConstructibles = {
  getConstructibles: (x, y) => {
    if (x === 10 && y === 20) return [{ id: "ok" }];
    if (x === 11 && y === 20) return [{ id: "pillaged" }];
    return null;
  }
};
globalThis.Constructibles = {
  getByComponentID: (cid) => ({ damaged: cid.id === "pillaged" })
};
globalThis.GameplayMap = {
  getLocationFromIndex: (idx) => {
    if (idx === 1) return { x: 10, y: 20 };
    if (idx === 2) return { x: 11, y: 20 };
    if (idx === 3) return { x: 12, y: 20 };
    return null;
  }
};
CONFIG.vwPillage = 1;
assert.equal(pillagedCount(city), 1, "only damaged constructibles should count as pillaged");

// Guard path: disabled pillage weight short-circuits expensive scans.
CONFIG.vwPillage = 0;
globalThis.MapConstructibles = {
  getConstructibles: () => {
    throw new Error("should not run when vwPillage is 0");
  }
};
assert.equal(pillagedCount(city), 0, "disabled pillage weight should short-circuit to zero");

// Catch path: city plot accessor failure is swallowed.
CONFIG.vwPillage = 1;
assert.equal(pillagedCount({ getPurchasedPlots: () => { throw new Error("boom"); } }), 0);

CONFIG.vwPillage = originalVwPillage;
resetGlobals();
console.log("violence-signals-branches harness passed");
