import assert from "node:assert/strict";

// ── Stub the gameplay surface the violence module polls ───────────────────
let TURN = 1;
globalThis.Game = {
  get turn() {
    return TURN;
  }
};
// Per-(owner,plot) district health, so we can script a siege. Default pristine.
const HEALTH = {};
const hkey = (owner, loc) => `${owner}:${loc.x}:${loc.y}`;
function setHealth(owner, loc, cur, max) {
  HEALTH[hkey(owner, loc)] = { cur, max };
}
globalThis.Players = {
  Districts: {
    get: (owner) => ({
      getDistrictHealth: (loc) => HEALTH[hkey(owner, loc)]?.cur ?? 100,
      getDistrictMaxHealth: (loc) => HEALTH[hkey(owner, loc)]?.max ?? 100
    })
  }
};
globalThis.ComponentID = { toBitfield: (cid) => (cid ? cid.owner * 1000 + cid.id : 0) };
// Pillage stubs: plot index → location → constructibles → damaged flag.
const PLOT_LOC = { 100: { x: 7, y: 7 }, 200: { x: 8, y: 8 } };
const PILLAGED = { "7:7": true, "8:8": false };
globalThis.GameplayMap = { getLocationFromIndex: (i) => PLOT_LOC[i] };
globalThis.MapConstructibles = { getConstructibles: (x, y) => [`${x}:${y}`] };
globalThis.Constructibles = { getByComponentID: (cid) => ({ damaged: !!PILLAGED[cid] }) };
globalThis.Configuration = {
  getGame: () => ({ getValue: () => null }),
  editGame: () => ({ setValue: () => {} })
};

const { tickViolence, observeCity, siegeEscalation, recordWarLoss } = await import(
  "/emigration/ui/emigration-violence.js"
);
const { CONFIG } = await import("/emigration/ui/emigration-config.js");

const cityA = { id: { owner: 0, id: 1 }, owner: 0, location: { x: 5, y: 0 } };
const close = (a, b) => Math.abs(a - b) < 1e-9;

// Advance to turn n: decay (as runPass does) then poll the city's state.
function step(city, n) {
  TURN = n;
  tickViolence();
  return observeCity(city);
}

function testPristineCityHasNoViolence() {
  // A city not under attack - even in a civ at war - registers nothing.
  assert.equal(step(cityA, 1), 0);
}

function testFreshAssaultSpikes() {
  setHealth(0, cityA.location, 50, 100); // city center to half health
  // fresh damage 0.5 → vwAssault*0.5 + vwSiege*0.5 = 10*0.5 + 4*0.5 = 7.
  assert.ok(close(step(cityA, 2), 7));
}

function testIdempotentWithinTurn() {
  // Re-collecting signals in the same turn must not re-add.
  assert.ok(close(observeCity(cityA), 7));
}

function testStandingSiegeSustainsButDecays() {
  // Same damage held: prior 7 decays (×0.55 = 3.85) + standing vwSiege*0.5 (2).
  const v = step(cityA, 3); // health unchanged at 50/100
  assert.ok(close(v, 3.85 + 2));
  assert.ok(v > 3.85 && v < 7); // below the spike, above pure decay
}

function testRepairLetsItFade() {
  setHealth(0, cityA.location, 100, 100); // walls repaired
  assert.ok(close(step(cityA, 4), 5.85 * 0.55)); // decay only, no fresh/standing add
}

function testPillagedTilesAddPressureFogIndependently() {
  // A pristine city (full health) with one pillaged tile in its borders. Plot 100
  // (7,7) is pillaged; plot 200 (8,8) is not → exactly one pillaged tile.
  const cityP = {
    id: { owner: 0, id: 5 },
    owner: 0,
    location: { x: 7, y: 7 },
    getPurchasedPlots: () => [100, 200]
  };
  // No district damage (frac 0) → only vwPillage * 1 = 0.6.
  assert.ok(close(step(cityP, 5), 0.6));
}

// ── Algorithm D: siege escalation (time-gated) + cumulative war-loss cap ──

function testSiegeOffIsNeutral() {
  // With warSiege off, escalation is a no-op multiplier (1) - legacy behaviour.
  // (Ship default is now on, so set it explicitly for the off-case.)
  CONFIG.warSiege = false;
  assert.equal(siegeEscalation(cityA), 1);
}

function testSiegeEscalatesWithDurationThenCaps() {
  CONFIG.warSiege = true;
  CONFIG.violenceFleeThreshold = 2;
  CONFIG.siegeFloor = 0.3;
  CONFIG.siegeRampTurns = 4;
  CONFIG.siegeLossCapPct = 0.5;
  const city = { id: { owner: 0, id: 9 }, owner: 0, location: { x: 9, y: 9 }, population: 10 };
  setHealth(0, city.location, 20, 100); // heavy, sustained district damage → above threshold

  step(city, 10); // tenure 1
  const e1 = siegeEscalation(city);
  assert.ok(close(e1, CONFIG.siegeFloor)); // tenure 1 → siegeFloor (gentle opening)

  step(city, 11); // tenure 2
  step(city, 12); // tenure 3
  const e3 = siegeEscalation(city);
  assert.ok(e3 > e1); // escalates the longer the siege lasts

  // Cumulative cap: onsetPop=10, cap=0.5×10=5 → after 5 losses, the remnant digs in.
  for (let i = 0; i < 5; i++) recordWarLoss(city);
  assert.equal(siegeEscalation(city), 0);
  CONFIG.warSiege = false;
}

testPristineCityHasNoViolence();
testFreshAssaultSpikes();
testIdempotentWithinTurn();
testStandingSiegeSustainsButDecays();
testRepairLetsItFade();
testPillagedTilesAddPressureFogIndependently();
testSiegeOffIsNeutral();
testSiegeEscalatesWithDurationThenCaps();

console.log("violence harness passed");
