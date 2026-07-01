import assert from "node:assert/strict";

// Per-settlement ethnic-composition ledger (the ethnicity lens / readout data core). No engine
// globals needed, Configuration/Game/Locale are absent, so persistence no-ops and cityName falls
// back to city.name. The internal state is reset between cases via the __test surface.
const { __test } = await import("/emigration/ui/emigration-composition.js");
const { CONFIG } = await import("/emigration/ui/emigration-config.js");
// The exact-share scenarios below predate ethnic integration; run them without the per-turn drift so
// their assertions stay deterministic. The dedicated integration case re-enables it locally.
CONFIG.integrationEnabled = false;

/** A city signal with a stable centre location. */
function city(x, y, name, owner, population) {
  return { city: { location: { x, y }, name }, owner, population };
}

/** An instantaneous cross-civ move record (both owners present). */
function move(srcOwner, srcName, destOwner, destName, points) {
  return { srcOwner, srcName, destOwner, destName, points, cause: "opportunity" };
}

/** A pure departure (source side only, the lagged-move shape). */
function departure(srcOwner, srcName, destName, points) {
  return { srcOwner, srcName, destName, points, cause: "war" };
}

function shareOf(comp, civ) {
  const e = comp.civs.find((c) => c.civ === civ);
  return e ? e.share : 0;
}

/** Sum the per-origin points in a composition summary. */
function sumPts(comp) {
  return comp.civs.reduce((a, c) => a + c.pts, 0);
}

/**
 * Consistency invariants every composition summary must hold: the per-origin points sum EXACTLY to
 * the reported total (the city/empire population), and the shares sum to 1.
 */
function assertConsistent(comp, expectedTotal) {
  assert.ok(Math.abs(comp.total - expectedTotal) < 1e-6, "total matches reported population");
  assert.ok(Math.abs(sumPts(comp) - comp.total) < 1e-6, "origin points sum to the total");
  const shareSum = comp.civs.reduce((a, c) => a + c.share, 0);
  assert.ok(Math.abs(shareSum - 1) < 1e-6, "shares sum to 1");
}

// The user's scenario: civ 0 founds Rome (pop 10), war empties 6, civ 1 conquers it, then it grows
// to 12. Expect the original 4 to read as civ 0 and the +8 growth as civ 1.
function testFoundWarConquestRegrowth() {
  __test.reset();
  const loc = { x: 5, y: 7 };
  const rome = (owner, pop) => ({ city: { location: loc, name: "Rome" }, owner, population: pop });

  __test.recordCompositionPass([rome(0, 10)], []); // founded, all civ 0
  let comp = __test.compositionForCity({ location: loc });
  assert.equal(comp.total, 10);
  assert.equal(shareOf(comp, 0), 1);

  // War: 6 leave Rome (proportional removal); pop drops to 4.
  __test.recordCompositionPass([rome(0, 4)], [departure(0, "Rome", "Refuge", 6)]);
  comp = __test.compositionForCity({ location: loc });
  assert.equal(comp.total, 4);
  assert.equal(shareOf(comp, 0), 1); // still all civ 0

  // Civ 1 conquers Rome (owner flips, population unchanged, no migration). The pass reports the
  // capture so the conqueror can be credited the absorbed population in the net-migration tally.
  const conquests = __test.recordCompositionPass([rome(1, 4)], []);
  assert.deepEqual(conquests, [{ prevOwner: 0, newOwner: 1, name: "Rome", points: 4 }]);
  comp = __test.compositionForCity({ location: loc });
  assert.equal(comp.owner, 1);
  assert.equal(shareOf(comp, 0), 1); // conquered populace keeps its origin

  // A pass with no ownership change reports no captures.
  assert.deepEqual(__test.recordCompositionPass([rome(1, 4)], []), []);

  // Held a while, grows 4 → 12 (natural growth → current owner civ 1).
  __test.recordCompositionPass([rome(1, 12)], []);
  comp = __test.compositionForCity({ location: loc });
  assert.equal(comp.total, 12);
  assertConsistent(comp, 12); // total + shares reconcile to the real population
  assert.equal(Math.round(shareOf(comp, 0) * 100), 33); // original 4 of 12
  assert.equal(Math.round(shareOf(comp, 1) * 100), 67); // grown 8 of 12
  assert.equal(comp.dominant.civ, 1);
}

// An immigrant arrival adds the migrant's ORIGIN civ to the destination mix.
function testImmigrationAddsOriginCiv() {
  __test.reset();
  __test.recordCompositionPass(
    [city(1, 1, "Athens", 0, 10), city(2, 2, "Memphis", 2, 20)],
    []
  ); // seed both (Athens 10 = all civ 0)
  // 3 people migrate Memphis → Athens; Athens grows 10 → 13 by that arrival.
  __test.recordCompositionPass(
    [city(1, 1, "Athens", 0, 13), city(2, 2, "Memphis", 2, 17)],
    [move(2, "Memphis", 0, "Athens", 3)]
  );
  const comp = __test.compositionForCity({ location: { x: 1, y: 1 } });
  assert.equal(comp.total, 13);
  assert.equal(shareOf(comp, 2) > 0, true, "civ 2 minority present");
  assert.equal(Math.round(shareOf(comp, 2) * 100), 23); // 3 of 13
  assert.equal(comp.dominant.civ, 0);
}

// Emigration removes proportionally across a mixed population.
function testProportionalEmigration() {
  __test.reset();
  // Seed a mixed city by founding (civ 0), immigration (civ 2), then emigrate proportionally.
  __test.recordCompositionPass([city(3, 3, "Tyre", 0, 6)], []);
  __test.recordCompositionPass(
    [city(3, 3, "Tyre", 0, 10), city(9, 9, "Carthage", 2, 5)],
    [move(2, "Carthage", 0, "Tyre", 4)]
  );
  let comp = __test.compositionForCity({ location: { x: 3, y: 3 } });
  assert.equal(comp.total, 10); // 6 civ0 + 4 civ2
  // Now 5 emigrate (proportional): expect ~3 civ0, ~2 civ2 remain.
  __test.recordCompositionPass([city(3, 3, "Tyre", 0, 5)], [departure(0, "Tyre", "Away", 5)]);
  comp = __test.compositionForCity({ location: { x: 3, y: 3 } });
  assert.equal(comp.total, 5);
  assert.equal(Math.round(shareOf(comp, 0) * 100), 60); // 6/10 preserved
  assert.equal(Math.round(shareOf(comp, 2) * 100), 40); // 4/10 preserved
}

// Untracked settlement → null (no crash).
function testUntrackedIsNull() {
  __test.reset();
  assert.equal(__test.compositionForCity({ location: { x: 0, y: 0 } }), null);
  assert.equal(__test.compositionForCity({}), null);
  assert.equal(__test.compositionForOwner(0), null);
}

// A whole-population departure leaves no phantom dust origins, and the total tracks the population.
function testNoPhantomDust() {
  __test.reset();
  __test.recordCompositionPass([city(4, 4, "Sparta", 0, 3)], []);
  // 2 of 3 leave: total 1, still 100% civ 0 (no float-crumb minorities).
  __test.recordCompositionPass([city(4, 4, "Sparta", 0, 1)], [departure(0, "Sparta", "Away", 2)]);
  const comp = __test.compositionForCity({ location: { x: 4, y: 4 } });
  assertConsistent(comp, 1);
  assert.equal(comp.civs.length, 1);
  assert.equal(comp.civs[0].civ, 0);
}

// The per-civ (empire-wide) aggregate is consistent with the sum of that civ's city populations.
function testOwnerAggregateConsistency() {
  __test.reset();
  // Civ 0 holds two cities; one is mixed (took an immigrant from civ 2).
  __test.recordCompositionPass(
    [city(1, 1, "A", 0, 10), city(2, 2, "B", 0, 6), city(8, 8, "Z", 2, 9)],
    []
  );
  __test.recordCompositionPass(
    [city(1, 1, "A", 0, 14), city(2, 2, "B", 0, 6), city(8, 8, "Z", 2, 5)],
    [move(2, "Z", 0, "A", 4)] // 4 civ-2 people settle in A; A grows 10 → 14
  );
  const a = __test.compositionForCity({ location: { x: 1, y: 1 } });
  const b = __test.compositionForCity({ location: { x: 2, y: 2 } });
  assertConsistent(a, 14);
  assertConsistent(b, 6);
  // Empire aggregate for civ 0 = A (14) + B (6) = 20, mix = 16 civ-0 + 4 civ-2.
  const emp = __test.compositionForOwner(0);
  assertConsistent(emp, 20);
  assert.equal(emp.total, a.total + b.total); // matches the sum of its cities' populations
  assert.equal(Math.round(shareOf(emp, 2) * 100), 20); // 4 of 20
  assert.equal(Math.round(shareOf(emp, 0) * 100), 80);
}

/**
 * Ethnic integration: a non-owner minority drifts toward the host over time, held apart by war and
 * preserving the population total. Uses the pure integrateCity directly (no engine needed).
 */
function testIntegrationDrift() {
  // A city that is 80 owner (1) / 20 foreign (9). One peaceful step at rate 0.25 moves a quarter of
  // the minority into the owner; the total is unchanged.
  const e = { owner: 1, byCiv: { 1: 80, 9: 20 }, total: 100, name: "Host", seenTurn: 0 };
  __test.integrateCity(e, 1, () => 0.25);
  assert.ok(Math.abs(e.byCiv[9] - 15) < 1e-9, "a quarter of the minority integrated (20 → 15)");
  assert.ok(Math.abs(e.byCiv[1] - 85) < 1e-9, "the host absorbed them (80 → 85)");
  assert.ok(Math.abs(e.byCiv[1] + e.byCiv[9] - 100) < 1e-9, "the population total is preserved");

  // War holds them fully apart: rate 0 for the hostile origin → no drift.
  const w = { owner: 1, byCiv: { 1: 80, 9: 20 }, total: 100, name: "Host", seenTurn: 0 };
  __test.integrateCity(w, 1, (o) => (o === 9 ? 0 : 0.25));
  assert.equal(w.byCiv[9], 20, "a homeland-at-war minority does not integrate");

  // A minority drained below DUST is dropped entirely.
  const d = { owner: 1, byCiv: { 1: 100, 9: 0.04 }, total: 100.04, name: "Host", seenTurn: 0 };
  __test.integrateCity(d, 1, () => 1);
  assert.ok(!(9 in d.byCiv), "a fully-integrated trace minority is pruned");
}

/**
 * Return migration attributes the move to the returnees' TRUE origin: the host loses that origin
 * specifically, and the homeland gains that origin (never the host's). Drives the "return" cause.
 */
function testReturnAttribution() {
  __test.reset();
  // Found a host H (owner 0) and a homeland G (owner 9).
  __test.recordCompositionPass([city(1, 1, "H", 0, 10), city(2, 2, "G", 9, 6)], []);
  // 4 people of origin 9 immigrate into H (its population grows to 14).
  __test.recordCompositionPass(
    [city(1, 1, "H", 0, 14), city(2, 2, "G", 9, 6)],
    [{ srcOwner: 9, srcName: "elsewhere", destOwner: 0, destName: "H", points: 4, cause: "war" }]
  );
  const hMix = __test.compositionForCity({ location: { x: 1, y: 1 } });
  assert.equal(Math.round(shareOf(hMix, 9) * 100), Math.round((4 / 14) * 100), "H is ~29% origin-9 before the return");

  // One origin-9 point returns home: H → G, attributed to origin 9. Populations reflect the move
  // (H 14 → 13, G 6 → 7), exactly as the engine's removeRural/addRural would leave them.
  __test.recordCompositionPass(
    [city(1, 1, "H", 0, 13), city(2, 2, "G", 9, 7)],
    [{ srcOwner: 0, srcName: "H", destOwner: 9, destName: "G", originCiv: 9, points: 1, cause: "return" }]
  );
  const h = __test.compositionForCity({ location: { x: 1, y: 1 } });
  const g = __test.compositionForCity({ location: { x: 2, y: 2 } });
  assert.equal(Math.round(shareOf(h, 9) * 14), 3, "the host lost one origin-9 point (4 → 3)");
  assertConsistent(h, 13);
  // The homeland gained the returnee as origin 9, NOT as the host's civ 0 (the origin override).
  assert.equal(shareOf(g, 0), 0, "the homeland gains no host-origin people from a return");
  assert.equal(shareOf(g, 9), 1, "the returnee is home as its own origin");
  assertConsistent(g, 7);
}

testFoundWarConquestRegrowth();
testImmigrationAddsOriginCiv();
testProportionalEmigration();
testUntrackedIsNull();
testNoPhantomDust();
testOwnerAggregateConsistency();
testIntegrationDrift();
testReturnAttribution();

console.log("composition harness passed");
