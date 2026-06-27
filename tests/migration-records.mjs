import assert from "node:assert/strict";

const {
  cityName,
  moveRecord,
  departRecord,
  arriveRecord
} = await import("/emigration/ui/emigration-migration-records.js");

function testCityNameUsesLocaleComposeWhenAvailable() {
  globalThis.Locale = { compose: (s) => "L:" + s };
  assert.equal(cityName({ name: "LOC_CITY_ROME" }), "L:LOC_CITY_ROME");
}

function testCityNameFallsBackWhenUnreadable() {
  globalThis.Locale = { compose: () => { throw new Error("compose failed"); } };
  assert.equal(cityName({ name: "LOC_CITY_FAILED" }), "a settlement");
  assert.equal(cityName({}), "a settlement");
}

function testMoveRecordCarriesBothOwnersAndMeta() {
  globalThis.Locale = { compose: (s) => s };
  const src = { owner: 1, city: { name: "SRC" } };
  const dest = { owner: 2, city: { name: "DEST" } };
  const rec = moveRecord(src, dest, 42000, "war", { destPaidCost: 3.25, eventKey: "war:1:2" });

  assert.deepEqual(rec, {
    srcName: "SRC",
    destName: "DEST",
    srcOwner: 1,
    destOwner: 2,
    crossCiv: true,
    points: 1,
    people: 42000,
    cause: "war",
    eventKey: "war:1:2",
    destPaidCost: 3.25,
    phase: "move"
  });
}

function testDepartRecordUsesEdgeDestOwnerWithoutCreditingImmigration() {
  globalThis.Locale = { compose: (s) => s };
  const src = { owner: 9, city: { name: "SRC" } };
  const dest = { owner: 10, city: { name: "DEST" } };
  const rec = departRecord(src, dest, 111, "disaster", "disaster:eruption");

  assert.equal(rec.srcOwner, 9);
  assert.equal(rec.destOwner, undefined);
  assert.equal(rec.edgeDestOwner, 10);
  assert.equal(rec.crossCiv, true);
  assert.equal(rec.phase, "depart");
  assert.equal(rec.eventKey, "disaster:eruption");
}

function testArriveRecordSuccessAndAttritionShapes() {
  const transit = {
    srcName: "From",
    destName: "To",
    srcOwner: 1,
    destOwner: 2,
    crossCiv: true,
    people: 5000,
    cause: "prosperity",
    eventKey: ""
  };

  const ok = arriveRecord(transit, true, 1.5);
  assert.equal(ok.destOwner, 2);
  assert.equal(ok.srcOwner, undefined);
  assert.equal(ok.cause, "prosperity");
  assert.equal(ok.phase, "arrive");
  assert.equal(ok.destPaidCost, 1.5);

  const lost = arriveRecord(transit, false);
  assert.equal(lost.srcOwner, 1);
  assert.equal(lost.destOwner, undefined);
  assert.equal(lost.cause, "attrition");
  assert.equal(lost.crossCiv, false);
  assert.equal(lost.phase, "arrive");
}

testCityNameUsesLocaleComposeWhenAvailable();
testCityNameFallsBackWhenUnreadable();
testMoveRecordCarriesBothOwnersAndMeta();
testDepartRecordUsesEdgeDestOwnerWithoutCreditingImmigration();
testArriveRecordSuccessAndAttritionShapes();

console.log("migration-records harness passed");