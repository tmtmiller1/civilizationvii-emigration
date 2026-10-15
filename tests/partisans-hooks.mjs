// partisans-hooks.mjs
//
// The optional reads from the Partisans mod (emigration-partisans.js), through the feature-detected
// globalThis.__towerPartisans: with the global absent or broken nothing changes; junk rows are dropped; an
// open rising near a city names war departures from it (without moving any figures between causes); and a
// settlement Partisans reports burned closes its enclave with its own Chronicle line.

import assert from "node:assert/strict";

const KV = {};
globalThis.Configuration = {
  getGame: () => ({ getValue: (k) => (k in KV ? KV[k] : null) }),
  editGame: () => ({ setValue: (k, v) => { KV[k] = v; } })
};
globalThis.Game = { age: 1, turn: 20 };
globalThis.GameContext = { localPlayerID: 0 };
globalThis.Players = { get: (pid) => ({ id: pid, isMajor: true }), getAlive: () => [] };
// Chebyshev distance stands in for the hex distance.
globalThis.GameplayMap = { getPlotDistance: (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by)) };
/** @type {Record<string, {owner:number, name:string}>} */
const CITIES = {};
globalThis.MapCities = { getCity: (x, y) => (CITIES[x + "," + y] ? x + "," + y : null) };
globalThis.Cities = {
  get: (id) => {
    const c = CITIES[id];
    if (!c) return null;
    const [x, y] = id.split(",").map(Number);
    return { location: { x, y }, owner: c.owner, name: c.name };
  }
};

const partisans = await import("/emigration/ui/emigration-partisans.js");
const attribution = await import("/emigration/ui/emigration-event-attribution.js");
const naming = await import("/emigration/ui/emigration-naming.js");
const hosts = await import("/emigration/ui/emigration-quarter-hosts.js");
const stateMod = await import("/emigration/ui/emigration-quarter-state.js");
const { chronicleLog } = await import("/emigration/ui/emigration-chronicle.js");
const { msgText } = await import("/emigration/ui/emigration-loc.js");

const G = /** @type {*} */ (globalThis);
const city = (x, y) => ({ location: { x, y } });
const good = { id: 7, at: "10,10", name: "Corinth", owner: 1, cause: "misery", ip: 4, start: 12 };
let calls = 0;
const publish = (rows, extra) => {
  G.__towerPartisans = { apiVersion: 1, risings: () => { calls++; return rows; }, ...extra };
  partisans.__test.reset();
};

// Without Partisans, every reader is null and war departures keep their war key
{
  delete G.__towerPartisans;
  partisans.__test.reset();
  assert.deepEqual(partisans.partisanRisings(), []);
  assert.equal(partisans.openRisingNear("10,10"), null);
  assert.equal(partisans.burnedChapterAt("10,10"), null);
  assert.equal(partisans.uprisingEventKey(city(10, 10)), null);
  assert.ok(!String(attribution.eventKeyForMove({ owner: 1, city: city(10, 10) }, "war")).startsWith("uprising:"));
  assert.equal(hosts.burnedEntry("10,10", { civ: 2, owner: 1 }, ""), null);
}

// A broken or too-old global is ignored
{
  G.__towerPartisans = { apiVersion: 0, risings: () => [good] };
  partisans.__test.reset();
  assert.deepEqual(partisans.partisanRisings(), [], "apiVersion 0 is ignored");
  G.__towerPartisans = { apiVersion: 1, risings: "nope" };
  partisans.__test.reset();
  assert.deepEqual(partisans.partisanRisings(), [], "risings must be a function");
  publish(null, { risings: () => { throw new Error("boom"); } });
  assert.deepEqual(partisans.partisanRisings(), [], "a throwing risings() reads as none");
  publish({ length: 1, 0: good });
  assert.deepEqual(partisans.partisanRisings(), [], "a non-array reads as none");
}

// Junk rows are dropped; good rows are trimmed to what Emigration reads
{
  publish([
    null, 3, "x",
    { ...good, name: "" },
    { ...good, at: "10;10" },
    { ...good, at: 1010 },
    { ...good, cause: "riot" },
    { ...good, owner: "1" },
    { ...good, start: NaN },
    { ...good, id: {} },
    { ...good, id: 8, outcome: "weird", end: "soon" },
    good
  ]);
  const rows = partisans.partisanRisings();
  assert.equal(rows.length, 2, "only the two well-formed rows survive");
  assert.deepEqual(rows[1], { id: "7", at: "10,10", name: "Corinth", start: 12, end: null, outcome: null });
  assert.equal(rows[0].outcome, null, "an unknown outcome is dropped");
  assert.equal(rows[0].end, null, "a non-numeric end reads as still open");
}

// The list is read at most once per turn
{
  publish([good]);
  calls = 0;
  partisans.openRisingNear("10,10");
  partisans.openRisingNear("11,11");
  partisans.burnedChapterAt("10,10");
  assert.equal(calls, 1, "one read serves the whole turn");
  Game.turn = 21;
  partisans.openRisingNear("10,10");
  assert.equal(calls, 2, "a new turn reads again");
}

// An open rising at or within 3 tiles names war departures from that city
{
  publish([good, { ...good, id: 9, at: "30,30", name: "Delphi", end: 18, outcome: "dispersed" }]);
  assert.equal(partisans.openRisingNear("10,10").name, "Corinth", "centred on the city");
  assert.equal(partisans.openRisingNear("13,12").name, "Corinth", "three tiles away");
  assert.equal(partisans.openRisingNear("14,10"), null, "four tiles is too far");
  assert.equal(partisans.openRisingNear("30,30"), null, "a rising that has ended doesn't count");
  const key = attribution.eventKeyForMove({ owner: 1, city: city(12, 11) }, "war");
  assert.equal(key, "uprising:7:Corinth");
  assert.equal(attribution.eventGroupCause(key), "war", "the figures stay under the war cause");
  assert.equal(naming.eventDisplayName(key), "Corinth Uprising");
  assert.equal(attribution.eventKeyForMove({ owner: 1, city: city(12, 11) }, "unhappiness"), "",
    "only war departures are relabelled");
  assert.equal(partisans.uprisingNameOf("war:1:2"), null);
  assert.equal(partisans.uprisingNameOf("uprising:7:"), null);
  assert.equal(partisans.uprisingNameOf("uprising:7:Saint: Paul"), "Saint: Paul", "a colon in the name survives");

  const withDest = naming.localDigestMessage({ cause: "war", people: "1,200 people", city: "Argos",
    destName: "Thebes", uprising: "Corinth" });
  assert.ok(withDest.startsWith("1,200 people fled the Corinth Uprising around Argos for the safety of Thebes."),
    withDest);
  const noDest = naming.localDigestMessage({ cause: "war", people: "300 people", city: "Argos", uprising: "Corinth" });
  assert.ok(noDest.startsWith("300 people fled the Corinth Uprising around Argos."), noDest);
  const plain = naming.localDigestMessage({ cause: "war", people: "300 people", city: "Argos", destName: "Thebes" });
  assert.ok(plain.startsWith("300 people fled the fighting around Argos"), "no rising: the usual war line");
}

// A burned settlement closes its enclave with a line about the families fleeing the fighting
{
  const rec = { civ: 2, owner: 0, optionId: "ignore", turn: 1, applied: {}, contested: false, contestedTurn: -999,
    recognized: true };
  publish([{ ...good, at: "20,20", name: "Argos", end: 19, outcome: "burned" }]);
  CITIES["20,20"] = { owner: 0, name: "Argos" };
  stateMod.putQuarter("20,20", rec);
  hosts.reconcileQuarterHosts();
  assert.ok(stateMod.quarterAt("20,20"), "a standing settlement keeps its enclave");
  delete CITIES["20,20"];
  hosts.reconcileQuarterHosts();
  assert.equal(stateMod.quarterAt("20,20"), null, "the burned settlement's enclave is closed");
  const line = chronicleLog().find((e) => e.dedupeKey === "quarter:burned:20,20");
  assert.ok(line, "the Chronicle records it once, keyed by the settlement");
  assert.equal(line.title, "Argos Burns");
  assert.ok(line.body.startsWith("When Argos burned in the uprising, the "), line.body);
  assert.ok(line.body.includes("families there scattered with everyone else"), line.body);
  const entry = hosts.burnedEntry("20,20", { ...rec, hostName: "Argos" }, "+2 Culture");
  assert.ok(msgText(entry.body).includes("+2 Culture"), "what the host stops receiving is appended");

  publish([{ ...good, at: "21,21", end: 19, outcome: "dispersed" }]);
  stateMod.putQuarter("21,21", rec);
  hosts.reconcileQuarterHosts();
  assert.ok(stateMod.quarterAt("21,21"), "a vanished settlement with no burned chapter keeps current behaviour");
}

console.log("partisans-hooks.mjs: all assertions passed");
