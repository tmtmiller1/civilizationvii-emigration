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
