import assert from "node:assert/strict";

// Stub the gameplay surface the violence module polls
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
  // A city not under attack, even in a civ at war, registers nothing.
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

// Algorithm D: siege escalation (time-gated) + cumulative war-loss cap

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

// Minor-power raids are harassment, not an invasion
// A city-state or Independent Power besieging an Antiquity city was pushing the same refugee wave a major
// civilization's army does. The bar is now higher for being besieged by minors, while real damage still
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
// under attack but never by whom, so the only place the engine names an attacker is the district it holds.
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

// Who is attacking, read off the map: armed hostile units standing on or beside the city. This is the only
// source specific to one settlement; the at-war list reports every Independent Power permanently (mod test
// 109), so it cannot tell a raid on this city from hostility somewhere else on the map.
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

// Events and polling describe the same wounds, so the two readings are combined by taking the stronger,
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

  // Same 40% of the district wrecked, reported by both sources on the same turn.
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
// real value only for raids where every attacker is a minor power, by exactly the configured scale, and must
// track refugees who really left. This is what the in-game verdict probe reads.
{
  const { exposeViolenceAudit } = await import("/emigration/ui/emigration-violence.js");
  const { _resetCombatEvents } = await import("/emigration/ui/emigration-combat-events.js");
  exposeViolenceAudit();
  const audit = () => /** @type {*} */ (globalThis).EmigrationViolence.snapshot();
  const row = (/** @type {string} */ key) => audit().find((/** @type {*} */ r) => r.key === key);

  // Players 0-9 are majors, 10+ are minors, matching the ids seen in game.
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
  // counterfactual scores a raid as a major war under the current settings, so major raids still read identical.
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

// The siege stalemate rule (risks 2.3; 8.3a and 8.3b). The engine's besieged flag alone tops the intensity up
// every turn (vwSiege × siegeBesiegedFloor = 1.2) against a 0.55 decay, so a city nobody attacks stands at about
// 2.7, over the flee threshold of 2, for as long as a unit is parked beside it (the 2026-10-26 reads: Jeonju 27
// turns, Lāhainā 26, both at zero damage). After siegeStallTurns quiet turns the siege is stalled: the floor
// isn't applied, the standing level decays away, nobody dies for the siege, and the readout says so.
{
  const { siegeStalled, recordSiegeDeath, siegeDeathCapped } = await import("/emigration/ui/emigration-violence.js");
  const { lethalDistress } = await import("/emigration/ui/emigration-prosperity.js");
  const { _resetCombatEvents } = await import("/emigration/ui/emigration-combat-events.js");
  /** @type {Record<string, boolean>} */
  const FLAG = {};
  const prevGet = globalThis.Players.Districts.get;
  globalThis.Players.Districts.get = (/** @type {*} */ owner) =>
    Object.assign(prevGet(owner), {
      getDistrictIsBesieged: (/** @type {*} */ loc) => !!FLAG[`${owner}:${loc.x}:${loc.y}`]
    });
  /** @type {string[]} */
  const saved = [];
  globalThis.Configuration.editGame = () => ({ setValue: (/** @type {string} */ k, /** @type {string} */ v) => { saved.push(k + "=" + v); } });
  _resetCombatEvents();
  CONFIG.warSiege = true;
  CONFIG.violenceFleeThreshold = 2;
  CONFIG.siegeStallTurns = 3;
  CONFIG.siegeTotalLossCapPct = 0.8;
  CONFIG.siegeLossCapPct = 0.6;
  const city = { id: { owner: 0, id: 70 }, owner: 0, location: { x: 70, y: 0 }, population: 10 };
  const flagKey = "0:70:0";

  // The gate: flag only, no damage. Over the threshold on the third flagged turn, stalled on the fourth.
  FLAG[flagKey] = true;
  const v1 = step(city, 100);
  const v2 = step(city, 101);
  const v3 = step(city, 102);
  assert.ok(close(v1, CONFIG.vwSiege * CONFIG.siegeBesiegedFloor), "the flag alone adds vwSiege × floor");
  assert.ok(v2 > v1 && v3 > v2 && v3 >= CONFIG.violenceFleeThreshold,
    "the flag alone climbs over the flee threshold by the third turn (" + v3.toFixed(2) + ")");
  assert.equal(siegeStalled(city), false, "three turns in, the siege is still live");
  const v4 = step(city, 103);
  assert.equal(siegeStalled(city), true, "the fourth quiet turn stalls it");
  assert.ok(v4 < v3, "and the floor stops topping the intensity up: it decays (" + v4.toFixed(2) + ")");
  step(city, 104);
  const v6 = step(city, 105);
  assert.ok(v6 < CONFIG.violenceFleeThreshold, "a stalled siege falls back under the flee threshold");
  assert.equal(siegeStalled(city), true, "and stays stalled while the flag stays");
  assert.ok(saved.some((s) => s.includes("\"stalled\":{\"0:70\":1}") && s.includes("\"lastDamageTurn\":{\"0:70\":100}")),
    "the stall and its stamp persist with the rest of the violence state");

  // The death gate: a stalled siege contributes nothing to lethal distress; razing and famine still do.
  const sig = { city, violence: 5, disaster: 0, siege: false, starving: false, unrest: false, polity: null };
  assert.equal(lethalDistress(sig, false), 0, "the fighting's share of lethal distress drops while stalled");
  assert.ok(lethalDistress({ ...sig, starving: true }, false) > 0, "famine keeps its own weight");

  // Fresh damage ends the stall and the intensity spikes again. The fighting can kill again once it has been
  // sustained for violenceSustainTurns (2): the first turn of fresh fighting is tenure 1.
  CONFIG.violenceSustainTurns = 2;
  setHealth(0, city.location, 60, 100);
  const hit = step(city, 106);
  assert.equal(siegeStalled(city), false, "an attack ends the stall");
  assert.ok(hit > v6 + 4, "and the assault registers in full (" + hit.toFixed(2) + ")");
  assert.equal(lethalDistress(sig, false), 0, "one turn of fresh fighting can't kill yet");
  step(city, 107); // the damage stands: a second turn over the threshold
  assert.ok(lethalDistress(sig, false) > 0, "so the siege can kill again from its second sustained turn");

  // The flag lifting clears the stall bookkeeping.
  FLAG[flagKey] = false;
  setHealth(0, city.location, 100, 100);
  step(city, 108);
  assert.equal(siegeStalled(city), false);
  assert.ok(saved[saved.length - 1].includes("\"stalled\":{}"), "nothing stays behind for a lifted siege");

  // 8.3b: deaths under siege count into the siege's tally; at siegeTotalLossCapPct of the onset population the
  // siege kills nobody else; the tally clears with the siege.
  _resetCombatEvents();
  const town = { id: { owner: 0, id: 71 }, owner: 0, location: { x: 71, y: 0 }, population: 10 };
  setHealth(0, town.location, 20, 100); // heavy damage → tenure starts at onset population 10
  step(town, 110);
  assert.equal(siegeDeathCapped(town), false);
  for (let i = 0; i < 6; i++) recordWarLoss(town); // displacement reaches its own cap (0.6 × 10)
  assert.equal(siegeEscalation(town), 0, "displacement stops at siegeLossCapPct");
  assert.equal(siegeDeathCapped(town), false, "but the siege may still kill (0.8 × 10 = 8)");
  recordSiegeDeath(town);
  recordSiegeDeath(town);
  assert.equal(siegeDeathCapped(town), true, "six departures and two deaths reach the total cap");
  const dying = { city: town, violence: 5, disaster: 0, siege: false, starving: false, unrest: false, polity: null };
  assert.equal(lethalDistress(dying, false), 0, "and the death gate reads no distress from the fighting");
  setHealth(0, town.location, 100, 100);
  for (let t = 111; t < 125; t++) step(town, t); // the intensity decays below the threshold: the siege ends
  assert.equal(siegeDeathCapped(town), false, "the tally clears when the siege ends");
  // Uncapped (1) never gates.
  CONFIG.siegeTotalLossCapPct = 1;
  setHealth(0, town.location, 20, 100);
  step(town, 130);
  for (let i = 0; i < 20; i++) recordSiegeDeath(town);
  assert.equal(siegeDeathCapped(town), false, "a cap of 1 is uncapped");
  CONFIG.siegeTotalLossCapPct = 0.8;
  CONFIG.warSiege = false;
  globalThis.Players.Districts.get = prevGet;
  console.log("violence siege-stall harness passed");
}

// Flight waits for sustained violence (session 2j): one turn over the flee threshold sheds nobody, the second
// does, a lull resets the count; razing stays immediate; with the siege model off the threshold alone decides.
{
  const { violenceCrisis, siegeTenure } = await import("/emigration/ui/emigration-violence.js");
  const { __test: engine } = await import("/emigration/ui/emigration-engine.js");
  const { migrationCause } = await import("/emigration/ui/emigration-pull.js");
  const { lethalDistress } = await import("/emigration/ui/emigration-prosperity.js");
  CONFIG.warSiege = true;
  CONFIG.violenceFleeThreshold = 2;
  CONFIG.violenceSustainTurns = 2;
  CONFIG.disasterFleeThreshold = 1e9;
  CONFIG.unhappyCauseThreshold = -1e9;
  const city = { id: { owner: 0, id: 80 }, owner: 0, location: { x: 80, y: 0 }, population: 10 };
  setHealth(0, city.location, 20, 100); // a heavy assault: over the threshold on the first turn
  const v1 = step(city, 200);
  const sig = () => ({ city, violence: v1, siege: false, disaster: 0, starving: false, unrest: false, polity: null,
    happiness: 0 });
  assert.ok(v1 >= 2 && siegeTenure(city) === 1, "the first turn over the threshold: tenure 1");
  assert.equal(violenceCrisis(sig()), false, "one turn over the threshold is not yet a crisis");
  assert.equal(engine.inCrisis(sig()), false, "so the engine sheds nobody for it");
  assert.equal(migrationCause(sig()), "prosperity", "and the cause isn't war yet");
  assert.equal(lethalDistress(sig(), false), 0, "and the fighting can't kill yet");
  assert.equal(engine.inCrisis({ ...sig(), siege: true }), true, "razing is immediate");
  assert.equal(migrationCause({ ...sig(), siege: true }), "war");
  step(city, 201); // still damaged: tenure 2
  assert.equal(siegeTenure(city), 2);
  assert.equal(violenceCrisis(sig()), true, "the second turn over the threshold is a crisis");
  assert.equal(engine.inCrisis(sig()), true);
  assert.equal(migrationCause(sig()), "war");
  assert.ok(lethalDistress(sig(), false) > 0, "and the fighting can kill");
  // A lull: repaired, the intensity decays under the threshold and the tenure clears.
  setHealth(0, city.location, 100, 100);
  for (let t = 202; t < 210; t++) step(city, t);
  assert.equal(siegeTenure(city), 0, "a lull resets the count");
  setHealth(0, city.location, 20, 100);
  const again = step(city, 210);
  assert.equal(violenceCrisis({ ...sig(), violence: again }), false, "the next attack starts the count over");
  // Below the threshold it is never a crisis, whatever the tenure.
  assert.equal(violenceCrisis({ city, violence: 1 }), false);
  // The siege model off: no tenure, so the threshold alone decides (the old behaviour).
  CONFIG.warSiege = false;
  assert.equal(violenceCrisis({ city, violence: 5 }), true);
  CONFIG.violenceSustainTurns = 1;
  CONFIG.warSiege = true;
  assert.equal(violenceCrisis({ city, violence: 5 }), true, "a setting of 1 is the first turn, as before");
  CONFIG.violenceSustainTurns = 2;
  CONFIG.warSiege = false;
  console.log("violence sustained-flight harness passed");
}
