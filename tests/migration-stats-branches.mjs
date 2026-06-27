import assert from "node:assert/strict";

let KV = {};
globalThis.Configuration = {
  getGame: () => ({ getValue: (k) => (k in KV ? KV[k] : null) }),
  editGame: () => ({ setValue: (k, v) => (KV[k] = v) })
};

globalThis.Game = { turn: 10, age: 1, getTurnDate: () => "200 BC" };
globalThis.GameInfo = { Ages: { lookup: () => ({ AgeType: "AGE_ANTIQUITY" }) } };

const {
  accountLosses,
  markCityRemoved,
  recordDisasterEvent,
  recordStanceImpact,
  stanceImpactFor,
  recordMigrations,
  recentEventsFor,
  sampleOut,
  sampleIn,
  sampleRefugees,
  sampleRefugeesIn
} = await import("/emigration/ui/emigration-migration-stats.js");

function sig(owner, id, population, name = `City${id}`) {
  return {
    owner,
    key: `${owner}:${id}`,
    population,
    city: { name }
  };
}

function testAccountLossesAndRemovedCityCredit() {
  const D = globalThis.EmigrationData;

  accountLosses([sig(200, 1, 8, "Alpha")], []); // baseline
  const beforeDrop = D.externalLossesCumFor(200);
  accountLosses([sig(200, 1, 5, "Alpha")], []); // direct loss of 3 points (scaled to people)
  const afterDrop = D.externalLossesCumFor(200);
  assert.ok(afterDrop > beforeDrop, "population drop should increase external loss tally");

  markCityRemoved({ owner: 200, id: 1 });
  accountLosses([], []); // city removed from map, residual credited
  const afterRemoved = D.externalLossesCumFor(200);
  assert.ok(afterRemoved > afterDrop, "removed city should add residual external loss");
}

function testStanceImpactAggregation() {
  recordStanceImpact({
    7: { inP: 2, outP: -1, inPts: 1, outPts: -1 },
    8: { inP: 0, outP: 0, inPts: 0, outPts: 0 }
  });

  const s7 = stanceImpactFor(7);
  assert.equal(s7.in, 2);
  assert.equal(s7.out, -1);
  assert.equal(s7.inPts, 1);
  assert.equal(s7.outPts, -1);

  const d = globalThis.EmigrationData.stanceImpactFor(7);
  assert.equal(d.in, 2);
}

function testDisasterEventCapAndSnapshots() {
  for (let i = 0; i < 70; i++) {
    globalThis.Game.turn = 20 + i;
    recordDisasterEvent(`D${i}`, i % 3);
  }

  const ev = globalThis.EmigrationData.disasterEvents();
  assert.equal(ev.length, 64);
  assert.equal(ev[ev.length - 1].name, "D69");
  assert.equal(ev[0].name, "D6");
}

function testRecentFeedAndSamplingDeltas() {
  recordMigrations([
    { srcOwner: 300, destOwner: 301, people: 1000, points: 1, cause: "war" },
    { srcOwner: 300, destOwner: 301, people: 500, points: 1, cause: "prosperity" },
    { srcOwner: 301, destOwner: 300, people: 400, points: 1, cause: "disaster" }
  ]);

  const recent = recentEventsFor(300, 2);
  assert.equal(recent.length, 2);
  assert.ok(recent.every((m) => m.srcOwner === 300 || m.destOwner === 300));

  const firstOut = sampleOut(300);
  const firstIn = sampleIn(300);
  assert.ok(firstOut > 0);
  assert.ok(firstIn > 0);
  assert.equal(sampleOut(300), 0, "sample watermark should advance");
  assert.equal(sampleIn(300), 0, "sample watermark should advance");

  const firstRefOut = sampleRefugees(300);
  const firstRefIn = sampleRefugeesIn(300);
  assert.ok(firstRefOut >= 1000);
  assert.ok(firstRefIn >= 400);
  assert.equal(sampleRefugees(300), 0);
  assert.equal(sampleRefugeesIn(300), 0);
}

testAccountLossesAndRemovedCityCredit();
testStanceImpactAggregation();
testDisasterEventCapAndSnapshots();
testRecentFeedAndSamplingDeltas();

delete globalThis.Game;
delete globalThis.GameInfo;
delete globalThis.Configuration;

console.log("migration-stats-branches harness passed");
