// composition-identity.mjs
//
// Migrants keep who they are (ethnicity audit item 2) and land in the right city (item O3).
//
// Item 2: Rome is one-third Carthaginian and 3 people leave for Athens. Rome loses 1 Carthaginian and 2 Romans
// (they are a slice of Rome's mix), so Athens must gain 1 Carthaginian and 2 Romans, not 3 Romans. Checked for
// the instant move and for the lagged depart/arrive pair, whose halves land on different passes, with the
// records built by the real builders and the transit entry round-tripped through state normalization.
//
// Item O3: two cities with the same display name. A move into one of them must land in that one, and a record
// from before the location keys (name only) still resolves by name.

import assert from "node:assert/strict";

let _turn = 1;
globalThis.Game = { get turn() { return _turn; } };

const { __test, originMixForCity } = await import("/emigration/ui/emigration-composition.js");
const { moveRecord, departRecord, arriveRecord } = await import("/emigration/ui/emigration-migration-records.js");
const { __test: stateTest } = await import("/emigration/ui/emigration-state.js");
const { CONFIG } = await import("/emigration/ui/emigration-config.js");
CONFIG.integrationEnabled = false;

const ROME = 0, CARTHAGE = 1, ATHENS = 2;
const romeCity = { location: { x: 1, y: 1 }, name: "Rome" };
const athensCity = { location: { x: 9, y: 9 }, name: "Athens" };
const sig = (city, owner, population) => ({ city, owner, population });
const pts = (city, civ) => {
  const c = __test.compositionForCity(city);
  const e = c && c.civs.find((x) => x.civ === civ);
  return e ? e.pts : 0;
};
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} vs ${b}`);

/** Seed Rome as 20 Romans + 10 Carthaginians and Athens as 30 Athenians. */
function seed() {
  __test.reset();
  _turn = 1;
  __test.recordCompositionPass([sig(romeCity, ROME, 30), sig(athensCity, ATHENS, 30)], []);
  const s = __test.state();
  s.cities["1,1"].byCiv = { [ROME]: 20, [CARTHAGE]: 10 };
}

// ── Item 2, instant path ─────────────────────────────────────────────────────────────────────
seed();
{
  const mix = originMixForCity(romeCity);
  near(mix[CARTHAGE], 1 / 3, "Rome's mix is one-third Carthaginian");
  const recs = [1, 2, 3].map(() =>
    moveRecord(sig(romeCity, ROME, 30), sig(athensCity, ATHENS, 30), 1000, "opportunity", { destPaidCost: 0, originMix: mix }));
  _turn = 2;
  __test.recordCompositionPass([sig(romeCity, ROME, 27), sig(athensCity, ATHENS, 33)], recs);
  near(pts(romeCity, CARTHAGE), 9, "Rome loses 1 Carthaginian");
  near(pts(romeCity, ROME), 18, "Rome loses 2 Romans");
  near(pts(athensCity, CARTHAGE), 1, "Athens gains 1 Carthaginian");
  near(pts(athensCity, ROME), 2, "Athens gains 2 Romans");
}

// ── Item 2, lagged depart/arrive pair ───────────────────────────────────────────────────────
seed();
{
  const mix = originMixForCity(romeCity);
  const src = sig(romeCity, ROME, 30), dest = sig(athensCity, ATHENS, 30);
  const departs = [1, 2, 3].map(() => departRecord(src, dest, 1000, "war", "", [], mix));
  // The transit entry as the engine queues it, then persisted and reloaded.
  const raw = { destKey: "2:1", arriveTurn: 5, people: 1000, srcOwner: ROME, destOwner: ATHENS, crossCiv: true,
    cause: "war", srcName: "Rome", destName: "Athens", originMix: mix, srcLoc: "1,1", destLoc: "9,9" };
  const entry = stateTest.normalizeTransitEntry(JSON.parse(JSON.stringify(raw)));
  assert.ok(entry && entry.originMix, "the transit entry keeps its origin mix across save and load");
  assert.equal(entry.destLoc, "9,9", "and its destination location");
  _turn = 2;
  __test.recordCompositionPass([sig(romeCity, ROME, 27), sig(athensCity, ATHENS, 30)], departs);
  near(pts(romeCity, CARTHAGE), 9, "the departures take 1 Carthaginian");
  near(pts(romeCity, ROME), 18, "and 2 Romans");
  _turn = 5;
  const arrives = [1, 2, 3].map(() => arriveRecord(entry, true, 0));
  __test.recordCompositionPass([sig(romeCity, ROME, 27), sig(athensCity, ATHENS, 33)], arrives);
  near(pts(athensCity, CARTHAGE), 1, "the lagged arrivals bring 1 Carthaginian");
  near(pts(athensCity, ROME), 2, "and 2 Romans");
}

// ── Old transit entries (no originMix) keep today's attribution ──────────────────────────────
seed();
{
  const legacy = stateTest.normalizeTransitEntry({ destKey: "2:1", arriveTurn: 5, people: 1, srcOwner: ROME,
    destOwner: ATHENS, crossCiv: true, cause: "war", srcName: "Rome", destName: "Athens" });
  assert.equal(legacy.originMix, undefined, "a legacy transit entry has no mix");
  _turn = 5;
  __test.recordCompositionPass([sig(romeCity, ROME, 30), sig(athensCity, ATHENS, 31)], [arriveRecord(legacy, true, 0)]);
  near(pts(athensCity, ROME), 1, "a legacy arrival counts as the source owner's people");
}

// ── Returnees keep their specific origin over any mix ────────────────────────────────────────
seed();
{
  const ret = { srcOwner: ROME, srcName: "Rome", srcLoc: "1,1", destOwner: CARTHAGE, destName: "Carthage",
    originCiv: CARTHAGE, originMix: { [ROME]: 1 }, points: 1, people: 1, cause: "return", crossCiv: true };
  _turn = 2;
  __test.recordCompositionPass([sig(romeCity, ROME, 29), sig(athensCity, ATHENS, 30)], [ret]);
  near(pts(romeCity, CARTHAGE), 9, "a returnee leaves from their own bucket");
  near(pts(romeCity, ROME), 20, "and no Roman leaves with them");
}

// ── O3: two cities with one display name ─────────────────────────────────────────────────────
{
  __test.reset();
  const alexA = { location: { x: 2, y: 2 }, name: "Alexandria" };
  const alexB = { location: { x: 7, y: 7 }, name: "Alexandria" };
  _turn = 1;
  __test.recordCompositionPass([sig(romeCity, ROME, 30), sig(alexA, ATHENS, 10), sig(alexB, CARTHAGE, 10)], []);
  // Into the FIRST Alexandria; the name map would resolve to whichever was listed last (the second).
  const rec = moveRecord(sig(romeCity, ROME, 30), sig(alexA, ATHENS, 10), 1000, "opportunity",
    { destPaidCost: 0, originMix: { [ROME]: 1 } });
  _turn = 2;
  __test.recordCompositionPass([sig(romeCity, ROME, 29), sig(alexA, ATHENS, 11), sig(alexB, CARTHAGE, 10)], [rec]);
  near(pts(alexA, ROME), 1, "the arrival lands in the Alexandria it was sent to");
  near(pts(alexB, ROME), 0, "not the other one");
  // A name-only record (made before the location keys) still resolves by name.
  const old = { srcOwner: ROME, srcName: "Rome", destOwner: ATHENS, destName: "Athens", points: 1, cause: "opportunity" };
  __test.recordCompositionPass([sig(romeCity, ROME, 28), sig(athensCity, ATHENS, 31), sig(alexA, ATHENS, 11), sig(alexB, CARTHAGE, 10)], []);
  _turn = 3;
  __test.recordCompositionPass([sig(romeCity, ROME, 27), sig(athensCity, ATHENS, 32), sig(alexA, ATHENS, 11), sig(alexB, CARTHAGE, 10)], [old]);
  near(pts(athensCity, ROME), 1, "a name-only record still lands by name");
}

console.log("composition-identity: all assertions passed");
