import assert from "node:assert/strict";

const { readoutModel, installCityReadout } = await import("/emigration/ui/emigration-city-readout.js");

function testReadoutModelBuildsExpectedLines() {
  const model = readoutModel({
    cityName: "Rome",
    cause: "war",
    causeLabel: "War",
    causeMix: [{ label: "War", share: 60 }, { label: "Prosperity", share: 40 }],
    onCooldown: false,
    cooldown: 0,
    pressureToBar: 0.42,
    topDestinationName: "Memphis",
    crossCiv: true,
    assimLoad: 1,
    assimCostGold: 3.2,
    composition: {
      parts: [
        { name: "Roman", share: 0.62 },
        { name: "Egyptian", share: 0.23 },
        { name: "Greek", share: 0.1 },
        { name: "Maya", share: 0.05 }
      ]
    },
    ownerNet: -2500,
    attritionRisk: false,
    atRisk: true
  });

  assert.ok(model);
  assert.equal(model.title, "Rome - Migration");
  assert.ok(model.lines.some((l) => l.includes("Pressure: War 60%") && l.includes("42% to next move")));
  assert.ok(model.lines.some((l) => l.includes("Pulled toward Memphis (rival civ)")));
  assert.ok(model.lines.some((l) => l.includes("Assimilation cost: ~3 gold/turn")));
  assert.ok(model.lines.some((l) => l.includes("Origins: Roman 62%, Egyptian 23%, Greek 10% (+1 more)")));
  assert.ok(model.lines.some((l) => l.includes("Civ net migration: -3 thousand people")));
  assert.equal(model.warn, "Under distress - people are looking to leave");
}

function testReadoutModelCooldownAndAttritionPriority() {
  const model = readoutModel({
    cityName: "Sparta",
    cause: "attrition",
    causeLabel: "Attrition",
    causeMix: [{ label: "Attrition", share: 100 }],
    onCooldown: true,
    cooldown: 3,
    pressureToBar: 0.99,
    topDestinationName: "",
    crossCiv: false,
    assimLoad: 0,
    assimCostGold: 0,
    composition: null,
    ownerNet: 0,
    attritionRisk: true,
    atRisk: true
  });

  assert.ok(model.lines[0].includes("(resting 3)"));
  assert.ok(model.lines.some((l) => l.includes("Civ net migration: 0 people")));
  assert.equal(model.warn, "At risk: trapped with nowhere to flee");
}

function testReadoutModelNullInput() {
  assert.equal(readoutModel(null), null);
}

function testInstallCityReadoutWiresConsoleAndSelectionEvents() {
  delete globalThis.emigration;
  const seen = [];
  globalThis.engine = {
    on(name, handler) {
      seen.push({ name, handler });
    }
  };

  installCityReadout();

  assert.equal(typeof globalThis.emigration.city, "function");
  assert.equal(typeof globalThis.emigration.hideCity, "function");
  assert.equal(seen.length, 2);
  assert.deepEqual(seen.map((e) => e.name), ["CitySelectionChanged", "CitySelected"]);

  delete globalThis.engine;
  delete globalThis.emigration;
}

testReadoutModelBuildsExpectedLines();
testReadoutModelCooldownAndAttritionPriority();
testReadoutModelNullInput();
testInstallCityReadoutWiresConsoleAndSelectionEvents();

console.log("city-readout-model harness passed");
