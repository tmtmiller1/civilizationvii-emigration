import assert from "node:assert/strict";

class FakeElement {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.className = "";
    this.textContent = "";
    this.innerHTML = "";
    this.style = {};
    this.attributes = {};
    this.eventHandlers = {};
    this.parentNode = null;
    this.id = "";
    this.classList = {
      add: (...names) => {
        const have = new Set((this.className || "").split(/\s+/).filter(Boolean));
        for (const n of names) have.add(n);
        this.className = [...have].join(" ");
      },
      toggle: (name, on) => {
        const have = new Set((this.className || "").split(/\s+/).filter(Boolean));
        if (on) have.add(name);
        else have.delete(name);
        this.className = [...have].join(" ");
      }
    };
  }

  appendChild(child) {
    if (child) {
      child.parentNode = this;
      this.children.push(child);
    }
    return child;
  }

  setAttribute(k, v) {
    this.attributes[k] = String(v);
  }

  addEventListener(name, handler) {
    this.eventHandlers[name] = handler;
  }
}

const fakeHead = new FakeElement("head");
const fakeRoot = new FakeElement("html");

const fakeDocument = {
  head: fakeHead,
  documentElement: fakeRoot,
  createElement: (tag) => new FakeElement(tag),
  getElementById: () => null
};

globalThis.document = fakeDocument;
globalThis.window = { document: fakeDocument };

// settings module probes localStorage in some paths
globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};

const {
  renderDashboardTabbed,
  renderDashboardSubtab
} = await import("/emigration/ui/emigration-views.js");

const model = {
  sample: true,
  sections: [
    { title: "Custom", kind: "custom", rows: [] },
    { title: "Guide", kind: "guide", rows: [] },
    {
      title: "Ledger",
      kind: "ledger",
      rows: [{
        name: "Rome",
        netP: 2,
        netPts: 1,
        inP: 4,
        inPts: 2,
        outP: 2,
        outPts: 1,
        intInP: 1,
        intInPts: 1,
        intOutP: 1,
        intOutPts: 1,
        extInP: 3,
        extInPts: 1,
        extOutP: 1,
        extOutPts: 0,
        refP: 0,
        refPts: 0,
        lossP: 0,
        lossPts: 0,
        stInP: 0,
        stInPts: 0,
        stOutP: 0,
        stOutPts: 0,
        drivers: "War +2"
      }]
    }
  ]
};

const target = new FakeElement("div");
assert.doesNotThrow(() => renderDashboardTabbed(target, model));
assert.ok(target.children.length > 0, "tabbed render should append dashboard root");

// Exercise makeTabBar Controls-present branch
globalThis.Controls = {};
const targetControls = new FakeElement("div");
assert.doesNotThrow(() => renderDashboardTabbed(targetControls, model));
assert.ok(targetControls.children.length > 0);
delete globalThis.Controls;

// A start kind opens on that tab (a train click opens on Notifications, not the network diagram); an
// unknown kind falls back to the first tab.
function activeTabLabels(root) {
  return collect(root).filter((n) => /\bemig-tab\b/.test(n.className) && /\bactive\b/.test(n.className))
    .map((n) => n.textContent);
}
const targetStart = new FakeElement("div");
renderDashboardTabbed(targetStart, model, undefined, "ledger");
assert.equal(activeTabLabels(targetStart).length, 1, "exactly one tab is active");
assert.notEqual(activeTabLabels(targetStart)[0], activeTabLabels(target)[0], "the start kind moves the active tab");
const targetUnknown = new FakeElement("div");
renderDashboardTabbed(targetUnknown, model, undefined, "no-such-tab");
assert.deepEqual(activeTabLabels(targetUnknown), activeTabLabels(target), "an unknown kind opens the first tab");

// The rebuild callback gets the active tab's kind, so a rebuilt view stays on it.
const tabbedRebuilt = [];
const targetRebuild = new FakeElement("div");
renderDashboardTabbed(targetRebuild, model, (kind) => tabbedRebuilt.push(kind), "ledger");
const numbersBtn = collect(targetRebuild).find((n) => /\bemig-filter-btn\b/.test(n.className)
  && !/\bactive\b/.test(n.className) && n.textContent !== "Advanced");
assert.ok(numbersBtn, "the ledger tab shows a Numbers choice");
numbersBtn.eventHandlers.click();
assert.deepEqual(tabbedRebuilt, ["ledger"], "a Numbers change rebuilds onto the same tab");

// The game's tab bar announces its starting tab after the first build; that announcement doesn't build the
// tab again, while a pick of another tab does.
globalThis.Controls = {};
const targetBar = new FakeElement("div");
renderDashboardTabbed(targetBar, model, undefined, "ledger");
const bar = collect(targetBar).find((n) => n.tagName === "fxs-tab-bar");
const tabBody = collect(targetBar).find((n) => n.className === "emig-tabbody");
const builtBefore = tabBody.children.length;
bar.eventHandlers["tab-selected"]({ detail: { selectedItem: { id: "2" } } });
assert.equal(tabBody.children.length, builtBefore, "the starting tab's announcement doesn't rebuild it");
bar.eventHandlers["tab-selected"]({ detail: { selectedItem: { id: "0" } } });
assert.ok(tabBody.children.length > builtBefore, "picking another tab builds it");
delete globalThis.Controls;

// Subtab render with controlsHost path and no-rebuild fallback
const subTarget = new FakeElement("div");
const controlsHost = new FakeElement("div");
assert.doesNotThrow(() =>
  renderDashboardSubtab(subTarget, model, "ledger", {
    controlsHost,
    hideUnitsToggle: false
  })
);
assert.ok(subTarget.children.length > 0, "subtab render should append content");

// The Net Migration Table renders its Internal / External / Total groups: the spanning group header
// above the column headings, and one cell per count column on the data row.
function collect(node, out = []) {
  out.push(node);
  for (const c of node.children || []) collect(c, out);
  return out;
}
const nodes = collect(subTarget);
const text = nodes.map((n) => n.textContent).filter((t) => typeof t === "string");
for (const label of ["Internal", "External", "Total", "Left", "Arrived"]) {
  assert.ok(text.includes(label), `ledger renders the "${label}" heading`);
}
const groupRow = nodes.find((n) => (n.className || "").includes("emig-led-grp"));
assert.ok(groupRow, "group header row rendered");
assert.equal(groupRow.children.length, 5, "one span per group, plus the two blank spans");
const dataRow = nodes.find((n) => (n.children || []).some((c) => c.textContent === "Rome"));
// name + net + net-bar + the nine count columns (6 grouped counts, stance, refugees, losses).
assert.equal(dataRow.children.length, 12, "data row carries every column");

// Subtab render guide branch where control-row is skipped
const guideTarget = new FakeElement("div");
assert.doesNotThrow(() => renderDashboardSubtab(guideTarget, model, "guide"));

// Null safety guard
assert.doesNotThrow(() => renderDashboardSubtab(null, model, "ledger"));
assert.doesNotThrow(() => renderDashboardTabbed(null, model));

delete globalThis.window;
delete globalThis.document;
delete globalThis.localStorage;

console.log("views-render-branches harness passed");
