import assert from "node:assert/strict";

// enclave-place harness: the recognized enclave as a real tile. Pure naming, the empty-plot ranking over
// a stubbed map, the CREATE_ELEMENT argument shape (tuner form: $index + Parent), the outlying-farmstead
// fallback, the "tile still stands" read that gates the stance grant, and the off switches.

const requests = [];
const LOC = { 10: { x: 5, y: 5 }, 11: { x: 6, y: 5 }, 12: { x: 7, y: 5 }, 13: { x: 5, y: 7 }, 14: { x: 8, y: 5 } };
const TERRAIN = { "6,5": "TERRAIN_FLAT", "7,5": "TERRAIN_HILL", "5,7": "TERRAIN_MOUNTAIN", "8,5": "TERRAIN_FLAT" };
const CONSTRUCTIBLES = { "5,5": ["c-palace"], "8,5": ["c-farm"] };
const DISTRICT_AT = { "5,5": true, "8,5": true };
const INST = { "c-palace": 1, "c-farm": 2, "c-enc": 3, "c-village": 7 };
const DEFS = {
  1: { ConstructibleType: "BUILDING_PALACE", ConstructibleClass: "BUILDING" },
  2: { ConstructibleType: "IMPROVEMENT_FARM", ConstructibleClass: "IMPROVEMENT" },
  3: { ConstructibleType: "IMPROVEMENT_EMIG_ENCLAVE_ROME_A", ConstructibleClass: "IMPROVEMENT" },
  7: { ConstructibleType: "IMPROVEMENT_VILLAGE", ConstructibleClass: "IMPROVEMENT" }
};
const BY_TYPE = { IMPROVEMENT_EMIG_ENCLAVE_ROME_A: { $index: 300 }, IMPROVEMENT_EMIG_ENCLAVE_ROME_B: { $index: 301 }, IMPROVEMENT_VILLAGE: { $index: 7 },
  IMPROVEMENT_GAMA: { $index: 40 }, IMPROVEMENT_HIDDEN_FORTRESS: { $index: 41 }, IMPROVEMENT_HILLFORT: { $index: 42 }, IMPROVEMENT_CARAVANSERAI: { $index: 43 } };
const VALID_TERRAINS = [{ ConstructibleType: "IMPROVEMENT_HIDDEN_FORTRESS", TerrainType: "TERRAIN_HILL" }, { ConstructibleType: "IMPROVEMENT_HILLFORT", TerrainType: "TERRAIN_HILL" }];
const INST_VILLAGE = "c-village";
globalThis.GameContext = { localPlayerID: 0 };
globalThis.Game = { turn: 4, PlayerOperations: { sendRequest: (pid, op, args) => requests.push([pid, op, args]) } };
globalThis.GameplayMap = {
  getLocationFromIndex: (p) => LOC[p],
  isWater: () => false,
  getTerrainType: (x, y) => TERRAIN[x + "," + y] || "TERRAIN_FLAT",
  getPlotDistance: (ax, ay, bx, by) => Math.abs(ax - bx) + Math.abs(ay - by),
  getResourceType: () => -1
};
globalThis.GameInfo = {
  Terrains: { lookup: (t) => ({ TerrainType: t }) },
  Constructibles: { lookup: (t) => (typeof t === "number" ? DEFS[t] : BY_TYPE[t]) || null },
  Constructible_ValidTerrains: { filter: (f) => VALID_TERRAINS.filter(f) },
  Leaders: { lookup: () => null },
  Civilizations: { lookup: () => null }
};
globalThis.MapConstructibles = { getConstructibles: (x, y) => CONSTRUCTIBLES[x + "," + y] || [] };
globalThis.Constructibles = { getByComponentID: (c) => ({ type: typeof c === "string" ? INST[c] : c.type }) };
globalThis.Districts = {
  getAtLocation: (loc) => (DISTRICT_AT[loc.x + "," + loc.y]
    ? { getConstructibleIdsOfClass: () => (loc.x === 8 ? [{ owner: 0, id: 77, type: 2 }] : []), getConstructibleIds: () => [] }
    : null)
};
globalThis.ConstructibleClasses = { IMPROVEMENT: 1 };
globalThis.YieldTypes = { YIELD_GOLD: "GOLD" };
globalThis.Players = { grantYield: () => {}, get: () => ({ Units: { getUnits: () => [] } }) };
globalThis.Configuration = { getGame: () => ({ getValue: () => null }), editGame: () => ({ setValue: () => {} }) };

const { CONFIG } = await import("/emigration/ui/emigration-config.js");
const { enclaveTypeFor, enclaveIndex, emptyPlotsOf, placeEnclave, enclaveStanding, enclaveTypeAt, enclaveCarriesBenefit, enclaveTypeOf, placedTypesFor, validTerrainsFor } =
  await import("/emigration/ui/emigration-enclave-place.js");
const { skinCandidates, isSkinType, UNIQUE_IMPROVEMENTS, FAMILY_SKINS } = await import("/emigration/ui/emigration-enclave-skins.js");
CONFIG.enclaveTileSkin = 0; // the native skin first; the Village skin has its own section below

const city = { owner: 0, id: { owner: 0, id: 9, type: 1 }, location: { x: 5, y: 5 }, getPurchasedPlots: () => [10, 11, 12, 13, 14] };

// ── naming mirrors the generator ──
assert.equal(enclaveTypeFor("CIVILIZATION_ROME", "a"), "IMPROVEMENT_EMIG_ENCLAVE_ROME_A");
assert.equal(enclaveTypeFor("CIVILIZATION_ROME", "b"), "IMPROVEMENT_EMIG_ENCLAVE_ROME_B");
assert.equal(enclaveTypeFor("CIVILIZATION_ROME", "ignore"), null);
assert.equal(enclaveTypeFor(null, "a"), null);
assert.equal(enclaveIndex("IMPROVEMENT_EMIG_ENCLAVE_ROME_A"), 300);
assert.equal(enclaveIndex("IMPROVEMENT_EMIG_ENCLAVE_NOPE_A"), null, "unloaded data reads as null");

// ── empty plots: not the center, not a district plot, not a mountain, nearest first ──
{
  const empty = emptyPlotsOf(city);
  assert.deepEqual(empty.map((e) => e.plot), [11, 12], "6,5 (flat, d1) then 7,5 (hill, d2); 5,7 is mountain, 8,5 has a farm");
}

// ── placement: tuner argument shape, nearest empty plot ──
{
  CONFIG.quarterPlaceImprovement = true;
  requests.length = 0;
  const r = placeEnclave(city, "CIVILIZATION_ROME", "a");
  assert.deepEqual(r, { type: "IMPROVEMENT_EMIG_ENCLAVE_ROME_A", plot: 11, enclave: "IMPROVEMENT_EMIG_ENCLAVE_ROME_A" });
  assert.equal(requests.length, 2, "an empty plot gets its rural district first, then the improvement");
  assert.deepEqual(requests[0], [0, "CREATE_ELEMENT", { Kind: "DISTRICT", Type: "DISTRICT_RURAL", Location: { x: 6, y: 5 }, Parent: city.id, Owner: 0 }]);
  assert.deepEqual(requests[1], [0, "CREATE_ELEMENT", { Kind: "CONSTRUCTIBLE", Type: 300, Location: { x: 6, y: 5 }, Parent: city.id, Owner: 0 }]);
}

// ── off switch, ignore stance, unloaded data → nothing placed ──
{
  requests.length = 0;
  CONFIG.quarterPlaceImprovement = false;
  assert.equal(placeEnclave(city, "CIVILIZATION_ROME", "a"), null);
  CONFIG.quarterPlaceImprovement = true;
  assert.equal(placeEnclave(city, "CIVILIZATION_ROME", "ignore"), null);
  assert.equal(placeEnclave(city, "CIVILIZATION_NOPE", "a"), null);
  assert.equal(requests.length, 0);
}

// ── no empty plot: the outlying farmstead is replaced (destroy then create on the same plot) ──
{
  requests.length = 0;
  const cramped = { ...city, getPurchasedPlots: () => [10, 14] };
  const r = placeEnclave(cramped, "CIVILIZATION_ROME", "b");
  assert.deepEqual(r, { type: "IMPROVEMENT_EMIG_ENCLAVE_ROME_B", plot: 14, enclave: "IMPROVEMENT_EMIG_ENCLAVE_ROME_B", replaced: "IMPROVEMENT_FARM" });
  assert.equal(requests[0][1], "DESTROY_ELEMENT");
  assert.deepEqual(requests[0][2], { Kind: "CONSTRUCTIBLE", Owner: 0, LocalID: 77 });
  assert.equal(requests.length, 2, "a farmstead plot keeps its district: destroy, then the improvement");
  assert.equal(requests[1][1], "CREATE_ELEMENT");
  assert.equal(requests[1][2].Type, 301);
  assert.deepEqual(requests[1][2].Location, { x: 8, y: 5 });
}

// ── standing check: true only while that type is on that plot ──
{
  assert.equal(enclaveStanding({ placed: { type: "IMPROVEMENT_EMIG_ENCLAVE_ROME_A", plot: 11 } }), false, "not placed on the map yet");
  CONSTRUCTIBLES["6,5"] = ["c-enc"];
  assert.equal(enclaveTypeAt(6, 5), "IMPROVEMENT_EMIG_ENCLAVE_ROME_A");
  assert.equal(enclaveStanding({ placed: { type: "IMPROVEMENT_EMIG_ENCLAVE_ROME_A", plot: 11 } }), true);
  assert.equal(enclaveStanding({ placed: { type: "IMPROVEMENT_EMIG_ENCLAVE_ROME_B", plot: 11 } }), false, "a different stance's tile does not count");
  assert.equal(enclaveStanding({ placed: null }), false);
  assert.equal(enclaveStanding(null), false);
  assert.equal(enclaveCarriesBenefit({ placed: { type: "IMPROVEMENT_EMIG_ENCLAVE_ROME_A", plot: 11 } }), true, "a standing native tile pays the benefit itself");
}

// ── the Village skin: the base Village is placed, the record keeps the enclave identity ──
{
  CONFIG.enclaveTileSkin = 2;
  assert.deepEqual(placedTypesFor("IMPROVEMENT_EMIG_ENCLAVE_ROME_A", "CIVILIZATION_ROME"), ["IMPROVEMENT_VILLAGE"]);
  requests.length = 0;
  delete CONSTRUCTIBLES["6,5"];
  const r = placeEnclave(city, "CIVILIZATION_ROME", "a");
  assert.deepEqual(r, { type: "IMPROVEMENT_VILLAGE", plot: 11, enclave: "IMPROVEMENT_EMIG_ENCLAVE_ROME_A" });
  assert.equal(requests[1][2].Type, 7, "the Village's own $index is what CREATE_ELEMENT gets");
  assert.equal(enclaveTypeOf({ placed: r }), "IMPROVEMENT_EMIG_ENCLAVE_ROME_A", "the marker still knows whose enclave it is");
  assert.equal(enclaveStanding({ placed: r }), false, "not on the map yet");
  CONSTRUCTIBLES["6,5"] = [INST_VILLAGE];
  assert.equal(enclaveStanding({ placed: r }), true, "a Village on the plot = the enclave stands");
  assert.equal(enclaveTypeAt(6, 5), null, "a Village is not a native enclave improvement");
  assert.equal(enclaveCarriesBenefit({ placed: r }), true, "a standing skin tile IS the benefit (only the drawback is charged)");
  assert.equal(enclaveTypeOf({ placed: { type: "IMPROVEMENT_EMIG_ENCLAVE_ROME_B", plot: 3 } }), "IMPROVEMENT_EMIG_ENCLAVE_ROME_B", "legacy native records need no enclave field");
  assert.equal(enclaveTypeOf({ placed: { type: "IMPROVEMENT_VILLAGE", plot: 3 } }), null, "a Village record without its enclave field is unattributable");
  CONFIG.enclaveTileSkin = 0;
}

// ── the THEMED skin: unique improvement first, then the stance-yield fallbacks, then the Village ──
{
  // Pure tables.
  assert.equal(UNIQUE_IMPROVEMENTS.CIVILIZATION_GORYEO, "IMPROVEMENT_GAMA");
  assert.deepEqual(skinCandidates("CIVILIZATION_GORYEO").slice(0, 1), ["IMPROVEMENT_GAMA"], "own unique improvement first");
  assert.equal(skinCandidates("CIVILIZATION_GORYEO").at(-1), "IMPROVEMENT_VILLAGE", "the Village is always last");
  const rome = skinCandidates("CIVILIZATION_ROME"); // no unique; stances a = production, b = gold
  assert.deepEqual(rome.slice(0, 2), FAMILY_SKINS.YIELD_PRODUCTION, "Rome: the production fallbacks first");
  assert.ok(rome.includes("IMPROVEMENT_CARAVANSERAI"), "then the gold fallbacks from stance b");
  assert.ok(!rome.includes("IMPROVEMENT_EMIG_ENCLAVE_ROME_A"), "the native improvement is not a themed skin");
  const abbasid = skinCandidates("CIVILIZATION_ABBASID"); // a = science (no skin), b = happiness
  assert.equal(abbasid[0], "IMPROVEMENT_THING", "a science stance falls through to the other stance's family");
  assert.ok(isSkinType("IMPROVEMENT_GAMA") && isSkinType("IMPROVEMENT_VILLAGE") && !isSkinType("IMPROVEMENT_FARM"));
  assert.deepEqual([...validTerrainsFor("IMPROVEMENT_HIDDEN_FORTRESS")], ["TERRAIN_HILL"]);
  assert.equal(validTerrainsFor("IMPROVEMENT_GAMA").size, 0, "no terrain rows = any land");
  // Placement: Goryeo gets a Gama on the nearest empty plot (6,5 flat).
  CONFIG.enclaveTileSkin = 1;
  requests.length = 0;
  delete CONSTRUCTIBLES["6,5"];
  let r = placeEnclave(city, "CIVILIZATION_GORYEO", "a");
  assert.deepEqual(r, { type: "IMPROVEMENT_GAMA", plot: 11, enclave: "IMPROVEMENT_EMIG_ENCLAVE_GORYEO_A" });
  assert.equal(requests[1][2].Type, 40);
  // Rome: the Hidden Fortress needs a HILL; the empty plots are 6,5 (flat) and 7,5 (hill) → 7,5.
  requests.length = 0;
  r = placeEnclave(city, "CIVILIZATION_ROME", "a");
  assert.deepEqual(r, { type: "IMPROVEMENT_HIDDEN_FORTRESS", plot: 12, enclave: "IMPROVEMENT_EMIG_ENCLAVE_ROME_A" }, "terrain-bound skins take a matching plot");
  assert.deepEqual(requests[1][2].Location, { x: 7, y: 5 });
  // Water plots are never skin plots: with the only remaining empty plot flooded, a takeover of a land farmstead wins.
  {
    const oldWater = GameplayMap.isWater;
    GameplayMap.isWater = (x, y) => x === 7 && y === 5;
    requests.length = 0;
    const w = placeEnclave({ ...city, getPurchasedPlots: () => [10, 12, 14] }, "CIVILIZATION_GORYEO", "a");
    assert.equal(w.plot, 14, "the flooded empty plot is skipped; the farm plot is taken over");
    GameplayMap.isWater = oldWater;
  }
  // Rome with no hill anywhere: the production skins are skipped, the gold fallback (Caravanserai, any land) wins.
  TERRAIN["7,5"] = "TERRAIN_FLAT";
  requests.length = 0;
  r = placeEnclave(city, "CIVILIZATION_ROME", "a");
  assert.equal(r.type, "IMPROVEMENT_CARAVANSERAI", "no valid plot for a skin → the next candidate");
  TERRAIN["7,5"] = "TERRAIN_HILL";
  // A unique improvement that is not loaded (a later age): Mughal's Stepwell is absent from GameInfo → fallbacks.
  r = placeEnclave(city, "CIVILIZATION_MUGHAL", "a"); // a = culture → Gama
  assert.equal(r.type, "IMPROVEMENT_GAMA", "an unloaded unique improvement falls back by stance yield");
  CONFIG.enclaveTileSkin = 0;
}

console.log("enclave-place harness passed");

// ── takeover compensation: base + the replaced improvement's yields + the enclave's own ──
{
  const { takeoverCompensation, nativeYieldsOf, plotYieldsAt } = await import("/emigration/ui/emigration-enclave-place.js");
  // A farm gave the plot 3 food, 1 production; the Gama tile reads 2 food, 1 production, 3 culture.
  const comp = takeoverCompensation({ YIELD_FOOD: 3, YIELD_PRODUCTION: 1 }, { YIELD_CULTURE: 3 }, { YIELD_FOOD: 2, YIELD_PRODUCTION: 1, YIELD_CULTURE: 3 });
  assert.deepEqual(comp, { YIELD_FOOD: 1 }, "only the food the farm gave and the Gama does not is paid back");
  assert.deepEqual(takeoverCompensation({ YIELD_PRODUCTION: 3 }, { YIELD_CULTURE: 3 }, { YIELD_PRODUCTION: 3, YIELD_CULTURE: 3 }), {}, "nothing lost, nothing paid");
  assert.deepEqual(takeoverCompensation({ YIELD_GOLD: 2 }, {}, { YIELD_GOLD: 5 }), {}, "a richer tile never pays negative");
  // Native yields from the data rows, plus the Village's modifier culture.
  GameInfo.Constructible_YieldChanges = { filter: (f) => [{ ConstructibleType: "IMPROVEMENT_GAMA", YieldType: "YIELD_CULTURE", YieldChange: 3 }].filter(f) };
  assert.deepEqual(nativeYieldsOf("IMPROVEMENT_GAMA"), { YIELD_CULTURE: 3 });
  assert.deepEqual(nativeYieldsOf("IMPROVEMENT_VILLAGE"), { YIELD_CULTURE: 2 }, "the Village's +2 Culture is a modifier, not a row");
  delete GameInfo.Constructible_YieldChanges;
  // A takeover records the plot's yields before the farmstead goes.
  GameplayMap.getYields = (plot) => (plot === 14 ? [["YIELD_FOOD", 3], ["YIELD_PRODUCTION", 1]] : []);
  GameInfo.Yields = { lookup: (t) => ({ YieldType: t }) };
  assert.deepEqual(plotYieldsAt(14, 0), { YIELD_FOOD: 3, YIELD_PRODUCTION: 1 });
  CONFIG.enclaveTileSkin = 0;
  CONSTRUCTIBLES["6,5"] = ["c-enc"]; // no empty plot left except the mountain: the farm plot 14 is taken over
  const r = placeEnclave({ ...city, getPurchasedPlots: () => [10, 11, 14] }, "CIVILIZATION_ROME", "b");
  assert.equal(r.replaced, "IMPROVEMENT_FARM");
  assert.deepEqual(r.before, { YIELD_FOOD: 3, YIELD_PRODUCTION: 1 }, "the takeover carries the plot's prior yields");
  delete CONSTRUCTIBLES["6,5"];
  delete GameplayMap.getYields;
}
