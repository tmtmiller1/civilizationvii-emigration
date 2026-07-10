// city-panel.mjs
//
// Covers the pure City Details panel view-model (emigration-city-panel-data.js) plus the install
// wiring + lifecycle of the DOM decorator (emigration-city-panel.js). The pure model is the covered
// half; the decorator is exercised for no-throw correctness with a minimal fake panel + DOM (it is
// coverage-excluded like the other engine/DOM hosts).

import assert from "node:assert/strict";

const { cityPanelModel, __test } = await import("/emigration/ui/emigration-city-panel-data.js");

function testFullModelBuildsBothBlocks() {
  const model = cityPanelModel({
    cityName: "Rome",
    composition: {
      total: 100,
      parts: [
        { name: "Roman", share: 0.62 },
        { name: "Egyptian", share: 0.38 },
        { name: "", share: 0.1 }
      ]
    },
    outflows: [
      { place: "Memphis", civName: "Egyptian", people: 12000 },
      { place: "Athens", civName: "Greek", people: 3000 }
    ],
    inflows: [{ place: "Carthage", civName: "Phoenician", people: 8000 }],
    refugeePool: 5,
    quarter: {
      originName: "Egyptian Enclave",
      stanceLabel: "Embrace the quarter",
      contested: true,
      benefitYield: "YIELD_CULTURE",
      benefitAmount: 40,
      penaltyYield: "YIELD_HAPPINESS",
      penaltyAmount: 5
    }
  });

  assert.equal(model.population.title, "Migration - Rome");
  assert.equal(model.population.hasData, true);
  assert.deepEqual(model.population.originLines, ["Roman 62%", "Egyptian 38%"]);
  assert.equal(model.population.outflowLines[0], "Memphis (Egyptian): 12,000");
  assert.equal(model.population.inflowLines[0], "Carthage (Phoenician): 8,000");
  assert.equal(model.population.refugeeLine, "5 refugees await settlement here.");

  assert.equal(model.quarters.present, true);
  assert.ok(model.quarters.lines.some((l) => l.includes("Egyptian Enclave")));
  assert.ok(model.quarters.lines.some((l) => l.includes("Embrace the quarter")));
  assert.ok(model.quarters.lines.some((l) => l === "Grants 40 Culture to the city each turn."));
  assert.ok(model.quarters.lines.some((l) => l === "Costs 5 Happiness each turn."));
  assert.ok(model.quarters.lines.some((l) => l.includes("Contested")));
}

function testEmptyModelDegradesGracefully() {
  const model = cityPanelModel(null);
  assert.equal(model.population.title, "Migration - this settlement");
  assert.equal(model.population.hasData, false);
  assert.deepEqual(model.population.originLines, []);
  assert.deepEqual(model.population.outflowLines, []);
  assert.equal(model.population.refugeeLine, "");
  assert.equal(model.quarters.present, false);
  assert.deepEqual(model.quarters.lines, []);
}

function testPassiveQuarterHasNoYieldLines() {
  const lines = __test.quarterLines(__test.noCompose, {
    originName: "Greek Enclave",
    stanceLabel: "Let them be",
    contested: false,
    benefitYield: null,
    benefitAmount: 0,
    penaltyYield: null,
    penaltyAmount: 0
  });
  assert.deepEqual(lines, [
    "A Greek Enclave has taken root in this settlement.",
    "Your stance: Let them be."
  ]);
}

function testFlowRowsSortCapAndTail() {
  const flows = [];
  for (let i = 0; i < 8; i++) flows.push({ place: "City" + i, civName: "Civ", people: (i + 1) * 100 });
  const rows = __test.flowRows(__test.noCompose, flows);
  assert.equal(rows.length, 7, "six rows plus one (+N more) tail");
  assert.equal(rows[0], "City7 (Civ): 800", "sorted largest-first");
  assert.equal(rows[6], "(+2 more)");
  assert.deepEqual(__test.flowRows(__test.noCompose, [{ place: "X", civName: "C", people: 0 }]), []);
}

function testYieldAndRefugeeHelpers() {
  assert.equal(__test.yieldLabel(__test.noCompose, "YIELD_GOLD"), "Gold");
  assert.equal(__test.yieldLabel(__test.noCompose, "YIELD_MADE_UP"), "MADE_UP");
  assert.equal(__test.yieldLabel(__test.noCompose, null), "");
  assert.equal(__test.refugeeText(__test.noCompose, 0), "");
  assert.equal(__test.refugeeText(__test.noCompose, 1), "1 refugee awaits settlement here.");
  assert.equal(__test.refugeeText(__test.noCompose, 3), "3 refugees await settlement here.");
  assert.deepEqual(__test.originLines(null), []);
}

function testComposeLocalizesLabels() {
  // A stub resolver that echoes the LOC key so we can prove the model routes text through compose
  // (and substitutes args) rather than only ever emitting the English fallback.
  const compose = (key, ...args) => key + (args.length ? "[" + args.join(",") + "]" : "");
  const model = cityPanelModel({
    cityName: "Rome",
    outflows: [],
    inflows: [],
    refugeePool: 2,
    quarter: {
      originName: "Egyptian Enclave", stanceLabel: "Embrace", contested: false,
      benefitYield: "YIELD_CULTURE", benefitAmount: 40, penaltyYield: null, penaltyAmount: 0
    }
  }, compose);
  assert.equal(model.population.title, "LOC_EMIGRATION_PANEL_POP_TITLE[Rome]");
  assert.equal(model.population.originsHeading, "LOC_EMIGRATION_PANEL_ORIGINS");
  assert.equal(model.population.noDataText, "LOC_EMIGRATION_PANEL_NO_MIGRATION");
  assert.equal(model.population.refugeeLine, "LOC_EMIGRATION_PANEL_REFUGEE_MANY[2]");
  assert.equal(model.quarters.noQuarterText, "LOC_EMIGRATION_PANEL_NO_QUARTER");
  // The yield noun resolves via its base-game LOC key, then feeds the grants sentence's arg.
  assert.ok(model.quarters.lines.some((l) => l ===
    "LOC_EMIGRATION_PANEL_QUARTER_GRANTS[40,LOC_YIELD_CULTURE_NAME]"));
}

function testPendingEnclaveReplacesNoQuarterText() {
  // No settled quarter, but a foreign origin has crossed the bar → the "no enclave" line is replaced by
  // an "awaits your decision" readout carrying the share.
  const pending = cityPanelModel({
    cityName: "Rome", outflows: [], inflows: [], refugeePool: 0, quarter: null,
    enclave: { originName: "Egyptian", pending: true, sharePct: 41, thresholdPct: 30, stock: 6, minStock: 3 }
  });
  assert.equal(pending.quarters.present, false, "no settled quarter yet");
  assert.ok(pending.quarters.noQuarterText.includes("Egyptian"), "names the origin");
  assert.ok(pending.quarters.noQuarterText.includes("41%"), "shows the current share");
  assert.ok(/awaits your decision/i.test(pending.quarters.noQuarterText), "flags it as awaiting the decision");

  // A forming (foothold, below the bar) enclave shows progress toward the threshold instead.
  const forming = cityPanelModel({
    cityName: "Rome", outflows: [], inflows: [], refugeePool: 0, quarter: null,
    enclave: { originName: "Greek", pending: false, sharePct: 27, thresholdPct: 30, stock: 4, minStock: 3 }
  });
  assert.ok(forming.quarters.noQuarterText.includes("27%"), "shows the current share");
  assert.ok(forming.quarters.noQuarterText.includes("30%"), "shows the threshold it must reach");
  assert.ok(!/awaits your decision/i.test(forming.quarters.noQuarterText), "not yet awaiting a decision");

  // A settled quarter always wins over any progress readout.
  const settled = cityPanelModel({
    cityName: "Rome", outflows: [], inflows: [], refugeePool: 0,
    quarter: { originName: "Egyptian Enclave", stanceLabel: "Embrace", contested: false,
      benefitYield: null, benefitAmount: 0, penaltyYield: null, penaltyAmount: 0 },
    enclave: { originName: "Greek", pending: true, sharePct: 50, thresholdPct: 30, stock: 9, minStock: 3 }
  });
  assert.equal(settled.quarters.present, true, "the settled quarter is authoritative");
}

// ── Decorator install + lifecycle with a minimal fake panel + DOM. ──
function makeEl(tag) {
  return {
    tagName: tag, id: "", className: "", textContent: "",
    children: [], parentNode: null, parentElement: null,
    appendChild(c) { c.parentNode = this; c.parentElement = this; this.children.push(c); return c; },
    removeChild(c) {
      const i = this.children.indexOf(c);
      if (i >= 0) this.children.splice(i, 1);
      c.parentNode = null; c.parentElement = null;
    },
    remove() { if (this.parentNode) this.parentNode.removeChild(this); },
    querySelector(sel) {
      if (typeof sel !== "string" || sel[0] !== "#") return null;
      const id = sel.slice(1);
      const find = (node) => {
        for (const c of node.children) {
          if (c.id === id) return c;
          const deep = find(c);
          if (deep) return deep;
        }
        return null;
      };
      return find(this);
    }
  };
}

async function testInstallAndLifecycle() {
  const head = makeEl("head");
  globalThis.document = {
    head,
    createElement: makeEl,
    getElementById: (id) => head.children.find((e) => e.id === id) || null
  };
  const listeners = [];
  globalThis.window = {
    addEventListener: (n, h) => listeners.push({ n, h }),
    removeEventListener: (n, h) => {
      const i = listeners.findIndex((e) => e.n === n && e.h === h);
      if (i >= 0) listeners.splice(i, 1);
    }
  };
  globalThis.UI = { Player: { getHeadSelectedCity: () => null } };
  const decorated = [];
  globalThis.Controls = { decorate: (target, factory) => decorated.push({ target, factory }) };

  const { installEmigrationCityPanel, EmigrationCityDetailsDecorator } =
    await import("/emigration/ui/emigration-city-panel.js");

  installEmigrationCityPanel();
  assert.equal(decorated.length, 1, "decorator registered once");
  assert.equal(decorated[0].target, "panel-city-details");

  const growthScroll = makeEl("fxs-scrollable");
  const buildingsList = makeEl("div");
  const buildingsWrap = makeEl("div");
  buildingsWrap.appendChild(buildingsList);
  const root = makeEl("div");
  root.querySelector = (sel) => {
    if (sel.includes("fxs-scrollable")) return growthScroll;
    if (sel.includes(".buildings-list")) return buildingsList;
    return null;
  };

  const dec = decorated[0].factory({ Root: root });
  assert.ok(dec instanceof EmigrationCityDetailsDecorator);
  assert.doesNotThrow(() => dec.afterAttach());
  assert.equal(listeners.length, 1, "afterAttach subscribes to the update event");
  // Empty selection -> both sections render their fallback rows.
  assert.ok(growthScroll.children.some((c) => c.id === "emigration-city-growth"));
  assert.ok(buildingsWrap.children.some((c) => c.id === "emigration-city-quarters"));
  // A second refresh replaces rather than stacks.
  dec._refresh();
  assert.equal(growthScroll.children.filter((c) => c.id === "emigration-city-growth").length, 1);
  assert.doesNotThrow(() => dec.afterDetach());
  assert.equal(listeners.length, 0, "afterDetach unsubscribes");

  delete globalThis.document;
  delete globalThis.window;
  delete globalThis.UI;
  delete globalThis.Controls;
}

testFullModelBuildsBothBlocks();
testEmptyModelDegradesGracefully();
testPassiveQuarterHasNoYieldLines();
testFlowRowsSortCapAndTail();
testYieldAndRefugeeHelpers();
testComposeLocalizesLabels();
testPendingEnclaveReplacesNoQuarterText();
await testInstallAndLifecycle();

console.log("city-panel harness passed");
