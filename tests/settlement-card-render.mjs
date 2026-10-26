// settlement-card-render.mjs
//
// The settlement card drawn against a fake DOM: the lines and buttons the 3.7.0 builds add to it (the "Siege
// stalled" line under the pressure gauge, the "Close to newcomers" / "Open to newcomers" switch in the Arriving
// pane and the pane's "Closed to newcomers" tag, the forecast line) and that none of them draws when its state is
// off. The model is null (before the first pass), which keeps the pies and ledger to their placeholders.

import assert from "node:assert/strict";

class FakeElement {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.className = "";
    this.textContent = "";
    this.style = {};
    this.title = "";
    this.handlers = {};
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const i = this.children.indexOf(child);
    if (i >= 0) this.children.splice(i, 1);
    return child;
  }

  insertBefore(child, ref) {
    const i = ref ? this.children.indexOf(ref) : -1;
    if (i < 0) return this.appendChild(child);
    this.children.splice(i, 0, child);
    return child;
  }

  setAttribute(k, v) {
    this[k] = String(v);
  }

  addEventListener(name, fn) {
    this.handlers[name] = fn;
  }

  click() {
    if (this.handlers.click) this.handlers.click({});
  }
}
globalThis.document = { createElement: (t) => new FakeElement(t), createElementNS: (_ns, t) => new FakeElement(t) };
globalThis.Locale = { compose: (k, ...a) => (typeof k === "string" ? k : "") + (a.length ? " " + a.join(" ") : "") };

const { settlementCard } = await import("/emigration/ui/emigration-settlement-card.js");

/** Every node under `root`, depth first. */
function walk(root, out = []) {
  out.push(root);
  for (const c of root.children) walk(c, out);
  return out;
}
const texts = (root) => walk(root).map((n) => n.textContent).filter((t) => !!t);
const byClass = (root, cls) => walk(root).filter((n) => n.className.split(" ").includes(cls));

const toggles = [];
const deps = {
  cardTitle: (c) => c.name,
  pieBody: () => [],
  dirTotal: () => 0,
  pressureBand: (bar) => ({ label: bar > 0.5 ? "High" : "Low", color: "#fff", stage: bar > 0.5 ? 4 : 2 }),
  pressureBar: () => new FakeElement("div"),
  actionButton: (label) => new FakeElement("div"),
  decide: () => ({ pending: false, open: () => false }),
  displacedRowEmpty: () => { const d = new FakeElement("div"); d.appendChild(new FakeElement("div")); return d; },
  toggleIntake: (key, on) => toggles.push([key, on]),
  after: () => toggles.push("after")
};
const empty = { civs: [], causes: {} };
const entry = (pressure) => ({ name: "Shomron", town: false, in: empty, out: empty, pressure });

// A live siege, open to newcomers: the switch offers to close, no stalled line, no closed tag.
{
  const card = settlementCard(entry({ bar: 0.2, flag: "", cityKey: "1:4", owner: 1, closed: false, stalled: false }), null, null, deps);
  const t = texts(card);
  assert.ok(t.includes("Close to newcomers"), "the switch offers to close an open settlement");
  assert.ok(!t.some((x) => /Siege stalled/.test(x)), "no stalled line for a live siege");
  assert.ok(!t.includes("Closed to newcomers"), "no closed tag while open");
  const btn = byClass(card, "emig-filter-btn")[0];
  assert.ok(btn && !btn.className.includes("active"), "the switch is drawn flat while open");
  btn.click();
  assert.deepEqual(toggles, [["1:4", true], "after"], "clicking closes the settlement and redraws");
}

// Closed, with a stalled siege: the tag in the Arriving heading, the active switch offering to open, the stalled line.
{
  toggles.length = 0;
  const card = settlementCard(entry({ bar: 0.7, flag: "", cityKey: "1:4", owner: 1, closed: true, stalled: true }), null, null, deps);
  const t = texts(card);
  assert.ok(t.includes("Closed to newcomers"), "the Arriving heading carries the tag");
  assert.ok(!t.some((x) => /likely to leave/.test(x)), "no forecast line without a forecast");
  assert.ok(t.includes("Open to newcomers"), "the switch offers to open");
  assert.ok(t.some((x) => /^Siege stalled: the besiegers aren't attacking/.test(x)), "the stalled line under the gauge");
  const btn = byClass(card, "emig-filter-btn")[0];
  assert.ok(btn.className.includes("active"), "the switch is drawn active while closed");
  btn.click();
  assert.deepEqual(toggles, [["1:4", false], "after"]);
}

// The forecast line under the gauge, worded as a projection, and the stable wording.
{
  const soon = settlementCard(entry({ bar: 0.5, flag: "", cityKey: "1:4", owner: 1,
    forecast: { stable: false, turns: 4, people: 3, rate: 0.12 } }), null, null, deps);
  assert.ok(texts(soon).includes("About 3 people are likely to leave in the next 4 turns"), "the forecast line");
  const calm = settlementCard(entry({ bar: 0.1, flag: "", cityKey: "1:4", owner: 1,
    forecast: { stable: true, turns: 0, people: 0, rate: 0 } }), null, null, deps);
  assert.ok(texts(calm).includes("Nobody is likely to leave soon"), "the stable wording");
}

// No switch without the dep (option off) or without a city key (a civilization's card, a displaced-only card).
{
  const off = settlementCard(entry({ bar: 0.2, flag: "", cityKey: "1:4", owner: 1, closed: false }), null, null,
    { ...deps, toggleIntake: undefined });
  assert.ok(!texts(off).includes("Close to newcomers"), "no switch when the option is off");
  const civ = settlementCard(entry({ bar: 0.2, flag: "" }), null, null, deps);
  assert.ok(!texts(civ).includes("Close to newcomers"), "no switch without a city key");
  const bare = settlementCard(entry(null), null, null, deps);
  assert.ok(texts(bare).length > 0, "a card with no pressure entry still draws");
}

console.log("settlement-card-render harness passed");
