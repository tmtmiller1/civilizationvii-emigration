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

// The combat tracker subscribes through `engine`; capture its handlers so this harness can drive the
// event stream directly and test how event and polled damage combine.
/** @type {*} */
const HANDLERS = {};
globalThis.engine = {
  on: (/** @type {string} */ n, /** @type {*} */ fn) => { (HANDLERS[n] = HANDLERS[n] || []).push(fn); },
  off: () => {}
};
globalThis.GameplayMap.getOwningCityFromXY = () => null; // no city owns a plot unless a test says so

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
  // With warSiege off, escalation is a no-op multiplier (1) - legacy behavior.
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

// ── Minor-power raids are harassment, not an invasion ────────────────────────────────────────────────
// A city-state or Independent Power besieging an Antiquity city was pushing the same refugee wave a major
// civilization's army does. The bar is now higher for BEING BESIEGED by minors, while real damage still
// counts in full, and the downgrade requires positive evidence that every attacker is minor.
{
  const { CONFIG } = await import("/emigration/ui/emigration-config.js");
  assert.ok(CONFIG.minorSiegeBesiegedFloor < CONFIG.siegeBesiegedFloor,
    "a minor power besieging a city registers less than a major one");
  assert.ok(CONFIG.minorViolenceScale > 0 && CONFIG.minorViolenceScale < 1,
    "minor raids still register, but scaled down");
  // The knobs must be able to restore the old behavior exactly, so the change is reversible in Options.
  assert.ok(CONFIG.minorViolenceScale <= 1, "scale never amplifies");
}

// Who is attacking, read off the map rather than off the diplomacy layer. A besieged flag says a city is
// under attack but never by whom, so the only place the engine NAMES an attacker is the district it holds.
// This matters because a raiding Independent Power may never register as a formal war opponent.
{
  const { besiegingPlayers } = await import("/emigration/ui/emigration-violence-signals.js");
  const CID = { owner: 0, id: 1 };
  const city = { id: CID, owner: 0, location: { x: 1, y: 1 } };
  /** @type {*} */
  let DIST = {};
  globalThis.Districts = { get: (/** @type {*} */ id) => DIST[id] };
  const prevGet = globalThis.Players.Districts.get;
  globalThis.Players.Districts.get = (/** @type {*} */ owner) =>
    Object.assign({ getDistrictIds: () => Object.keys(DIST).map(Number) }, prevGet(owner));

  const district = (/** @type {*} */ controllingPlayer) =>
    ({ cityId: CID, location: { x: 1, y: 1 }, owner: 0, controllingPlayer });

  DIST = { 1: district(0), 2: district(0) };
  assert.equal(besiegingPlayers(city).size, 0, "a city holding its own districts names no attacker");

  DIST = { 1: district(0), 2: district(7) };
  const foes = besiegingPlayers(city);
  assert.equal(foes.size, 1, "one overrun district names one attacker");
  assert.ok(foes.has(7), "and it is whoever controls it, not the owner");

  DIST = { 1: district(7), 2: district(9) };
  assert.deepEqual([...besiegingPlayers(city)].sort(), [7, 9], "two occupiers are both named");

  // Districts belonging to another of the player's cities must never be read as this city's attackers.
  DIST = { 1: Object.assign(district(7), { cityId: { owner: 0, id: 99 } }) };
  assert.equal(besiegingPlayers(city).size, 0, "another city's siege is not this city's");

  globalThis.Players.Districts.get = prevGet;
  delete globalThis.Districts;
}

// Who is attacking, read off the MAP: armed hostile units standing on or beside the city. This is the only
// source specific to one settlement -- the at-war list reports every Independent Power permanently (watched,
// mod test 109), so it cannot tell a raid on this city from hostility somewhere else on the map.
{
  const { attackersNear } = await import("/emigration/ui/emigration-violence-signals.js");
  const CID = { owner: 0, id: 1 };
  const city = { id: CID, owner: 0, location: { x: 5, y: 5 } };
  /** @type {*} */
  let DIST = { 1: { cityId: CID, location: { x: 5, y: 5 }, owner: 0, controllingPlayer: 0 } };
  /** @type {*} */
  let UNITS = {};
  globalThis.Districts = { get: (/** @type {*} */ id) => DIST[id] };
  const prevGet = globalThis.Players.Districts.get;
  globalThis.Players.Districts.get = (/** @type {*} */ o) =>
    Object.assign({ getDistrictIds: () => Object.keys(DIST).map(Number) }, prevGet(o));
  globalThis.Players.get = (/** @type {*} */ pid) =>
    pid === 0 ? { Diplomacy: { isAtWarWith: (/** @type {*} */ o) => o !== 0 } } : null;
  globalThis.DirectionTypes = {
    DIRECTION_EAST: 0, DIRECTION_WEST: 1, DIRECTION_NORTHEAST: 2,
    DIRECTION_NORTHWEST: 3, DIRECTION_SOUTHEAST: 4, DIRECTION_SOUTHWEST: 5
  };
  const NEIGHBOURS = [{ x: 6, y: 5 }, { x: 4, y: 5 }, { x: 6, y: 4 }, { x: 4, y: 4 }, { x: 6, y: 6 }, { x: 4, y: 6 }];
  globalThis.GameplayMap.getAdjacentPlotLocation = (/** @type {*} */ l, /** @type {*} */ d) =>
    ({ x: l.x + (NEIGHBOURS[d].x - 5), y: l.y + (NEIGHBOURS[d].y - 5) });
  globalThis.MapUnits = { getUnits: (/** @type {*} */ x, /** @type {*} */ y) => UNITS[x + ":" + y] || [] };
  globalThis.Units = { get: (/** @type {*} */ c) => c };

  const army = (/** @type {*} */ owner) => ({ owner, Combat: { attack: 10 } });
  const civilian = (/** @type {*} */ owner) => ({ owner, Combat: null });

  UNITS = {};
  assert.equal(attackersNear(city).size, 0, "an undisturbed city names no attacker");

  UNITS = { "6:5": [army(7)] };
  const one = attackersNear(city);
  assert.deepEqual([...one], [7], "an enemy army on the next tile IS the attack");

  UNITS = { "5:5": [civilian(7)] };
  assert.equal(attackersNear(city).size, 0, "a civilian passing through is not a siege");

  UNITS = { "6:5": [army(0)] };
  assert.equal(attackersNear(city).size, 0, "our own garrison is not besieging us");

  UNITS = { "9:9": [army(7)] };
  assert.equal(attackersNear(city).size, 0, "an army across the map is not in contact");

  UNITS = { "6:5": [army(7)], "4:4": [army(9), civilian(11)] };
  assert.deepEqual([...attackersNear(city)].sort(), [7, 9], "every armed attacker in contact is named, once");

  globalThis.Players.Districts.get = prevGet;
  delete globalThis.Districts; delete globalThis.MapUnits; delete globalThis.Units; delete globalThis.DirectionTypes;
}

// Events and polling describe the SAME wounds, so the two readings are combined by taking the stronger,
// never by adding them. Summing would let one bombardment count twice and double the refugees it causes.
{
  const { startCombatEvents, _resetCombatEvents } =
    await import("/emigration/ui/emigration-combat-events.js");
  assert.equal(startCombatEvents(), true, "the tracker attached in this harness");
  assert.ok(HANDLERS.DistrictDamageChanged?.length, "district damage events are reachable");

  const cityE = { id: { owner: 0, id: 77 }, owner: 0, location: { x: 3, y: 3 } };
  const damage = (/** @type {*} */ cid, /** @type {number} */ from, /** @type {number} */ to) =>
    HANDLERS.DistrictDamageChanged.forEach((/** @type {*} */ f) =>
      f({ cityID: cid, maxDamage: 100, prevDamage: from, newDamage: to }));

  // Same 40% of the district wrecked, reported by BOTH sources on the same turn.
  _resetCombatEvents();
  setHealth(0, cityE.location, 60, 100);
  TURN = 40;
  damage(cityE.id, 0, 40);
  const both = step(cityE, 40);
  const ceiling = CONFIG.vwAssault * 0.4 + CONFIG.vwSiege * 0.4;
  assert.ok(both > 0, "the attack registers");
  assert.ok(both <= ceiling + 1e-6, `damage seen by both sources is scored once (got ${both}, max ${ceiling})`);

  // And the event stream alone carries harm that polling cannot see: damage inflicted and fully repaired
  // between two samples leaves district health identical, so the polled reading is a flat zero.
  _resetCombatEvents();
  const cityF = { id: { owner: 0, id: 78 }, owner: 0, location: { x: 4, y: 4 } };
  TURN = 41;
  damage(cityF.id, 0, 50);
  damage(cityF.id, 50, 0); // repaired within the same turn: net polled change is nothing at all
  const eventOnly = step(cityF, 41);
  assert.ok(eventOnly > 0, "harm that healed before the next sample still counts as violence");
}

// The balance audit: a counterfactual intensity per city under the pre-change rules. It must differ from the
// real value ONLY for raids where every attacker is a minor power, by exactly the configured scale, and must
// track refugees who really left. This is what the in-game verdict probe reads.
{
  const { exposeViolenceAudit } = await import("/emigration/ui/emigration-violence.js");
  const { _resetCombatEvents } = await import("/emigration/ui/emigration-combat-events.js");
  exposeViolenceAudit();
  const audit = () => /** @type {*} */ (globalThis).EmigrationViolence.snapshot();
  const row = (/** @type {string} */ key) => audit().find((/** @type {*} */ r) => r.key === key);

  // Players 0-9 are majors, 10+ are minors, matching the ids watched in game.
  globalThis.Players.get = (/** @type {number} */ pid) =>
    ({ isMajor: pid < 10, Diplomacy: { isAtWarWith: () => false } });
  /** @type {*} */
  const OWN = {};
  globalThis.GameplayMap.getOwningCityFromXY = (/** @type {number} */ x, /** @type {number} */ y) =>
    OWN[x + ":" + y] || null;
  globalThis.Units = { get: (/** @type {*} */ c) => c };
  const fight = (/** @type {*} */ cid, /** @type {number[]} */ foes, /** @type {number} */ x) => {
    OWN[x + ":0"] = cid;
    for (const f of foes) {
      HANDLERS.Combat.forEach((/** @type {*} */ h) => h({
        attacker: { owner: f, id: f * 100 + x, location: { x, y: 0 } },
        defender: { owner: cid.owner, id: 9000 + x, location: { x, y: 0 } }
      }));
    }
  };
  const close = (/** @type {number} */ a, /** @type {number} */ b) => Math.abs(a - b) < 1e-9;

  _resetCombatEvents();
  const minorCity = { id: { owner: 0, id: 90 }, owner: 0, location: { x: 90, y: 0 } };
  const majorCity = { id: { owner: 0, id: 91 }, owner: 0, location: { x: 91, y: 0 } };
  const mixedCity = { id: { owner: 0, id: 92 }, owner: 0, location: { x: 92, y: 0 } };
  fight(minorCity.id, [15], 90);
  fight(majorCity.id, [3], 91);
  fight(mixedCity.id, [15, 3], 92);
  TURN = 60;
  tickViolence();
  observeCity(minorCity);
  observeCity(majorCity);
  observeCity(mixedCity);

  const m = row("0:90");
  assert.ok(m && m.last, "a minor raid is audited");
  assert.equal(m.last.minorsOnly, true, "attacked only by player 15, a minor");
  assert.equal(m.last.source, "struck", "and it was named from the fighting itself, not a proxy");
  assert.deepEqual(m.last.named, [15]);
  assert.ok(m.intensity > 0 && m.counterfactual > m.intensity, "the downgrade lowered its intensity");
  assert.ok(close(m.intensity, m.counterfactual * CONFIG.minorViolenceScale),
    "by exactly the configured scale when no besieged floor is involved");

  const j = row("0:91");
  assert.equal(j.last.minorsOnly, false, "a major attacker is never downgraded");
  assert.ok(close(j.intensity, j.counterfactual), "so its real and counterfactual intensity are identical");

  const x = row("0:92");
  assert.equal(x.last.minorsOnly, false, "one major among minor attackers makes it a real war");
  assert.ok(close(x.intensity, x.counterfactual));

  // Both figures decay by the same factor, so the gap is the downgrade and nothing else.
  const ratio = m.intensity / m.counterfactual;
  step(minorCity, 62);
  const later = row("0:90");
  assert.ok(later.intensity < m.intensity, "intensity decays");
  assert.ok(close(later.intensity / later.counterfactual, ratio), "and the counterfactual decays in step");

  // The major-war slider scales raids with a major attacker and leaves minor-only raids alone. The audit's
  // counterfactual scores a raid as a major war under the CURRENT settings, so major raids still read identical.
  _resetCombatEvents();
  const wasMajor = CONFIG.majorViolenceScale;
  CONFIG.majorViolenceScale = 2;
  const war2 = { id: { owner: 0, id: 95 }, owner: 0, location: { x: 95, y: 0 } };
  const raid2 = { id: { owner: 0, id: 96 }, owner: 0, location: { x: 96, y: 0 } };
  fight(war2.id, [3], 95);
  fight(raid2.id, [15], 96);
  TURN = 70;
  observeCity(war2);
  observeCity(raid2);
  CONFIG.majorViolenceScale = wasMajor;
  const w2 = row("0:95");
  const r2 = row("0:96");
  assert.equal(w2.last.minorsOnly, false);
  assert.ok(close(w2.last.add, 2 * CONFIG.vwBattle), "a major attacker's battle is doubled at scale 2");
  assert.ok(close(w2.intensity, w2.counterfactual), "and still matches its counterfactual");
  assert.ok(close(r2.last.add, CONFIG.vwBattle * CONFIG.minorViolenceScale), "a minor-only raid ignores the major scale");

  // Refugees who actually leave are counted even with the siege-cap model switched off.
  const wasSiege = CONFIG.warSiege;
  CONFIG.warSiege = false;
  recordWarLoss(minorCity);
  recordWarLoss(minorCity);
  CONFIG.warSiege = wasSiege;
  assert.equal(row("0:90").refugees, 2, "each war departure is counted");
}

console.log("violence minor-power harness passed");
