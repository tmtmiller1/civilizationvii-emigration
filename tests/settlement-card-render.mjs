// settlement-card-render.mjs
//
// The settlement card drawn against a fake DOM: the lines and buttons the 3.7.0 builds add to it (the "Siege
// stalled" line under the pressure gauge, the "Dissuade newcomers" / "Welcome newcomers" switch in the Arriving
// pane and the pane's "Dissuading newcomers" tag, the forecast line) and that none of them draws when its state is
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
  assert.ok(t.includes("Dissuade newcomers"), "the switch offers to dissuade newcomers in an open settlement");
  assert.ok(!t.some((x) => /Siege stalled/.test(x)), "no stalled line for a live siege");
  assert.ok(!t.includes("Dissuading newcomers"), "no tag while open");
  const btn = byClass(card, "emig-dp-btn")[0];
  assert.ok(btn && !btn.className.includes("emig-sc-intake-closed"), "the card's standard button, unmarked while open");
  btn.click();
  assert.deepEqual(toggles, [["1:4", true], "after"], "clicking closes the settlement and redraws");
}

// Closed, with a stalled siege: the tag in the Arriving heading, the active switch offering to open, the stalled line.
{
  toggles.length = 0;
  const card = settlementCard(entry({ bar: 0.7, flag: "", cityKey: "1:4", owner: 1, closed: true, stalled: true }), null, null, deps);
  const t = texts(card);
  assert.ok(t.includes("Dissuading newcomers"), "the Arriving heading carries the tag");
  assert.ok(!t.some((x) => /likely to leave/.test(x)), "no forecast line without a forecast");
  assert.ok(t.includes("Welcome newcomers"), "the switch offers to welcome them again");
  assert.ok(t.some((x) => /^Siege stalled: the besiegers aren't attacking/.test(x)), "the stalled line under the gauge");
  const btn = byClass(card, "emig-dp-btn")[0];
  assert.ok(btn.className.includes("emig-sc-intake-closed"), "marked while closed");
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

// The price under the switch, and the switch greyed with the shortfall on hover when a turn can't be covered.
{
  toggles.length = 0;
  const priced = settlementCard(entry({ bar: 0.2, flag: "", cityKey: "1:4", owner: 1, closed: false, intakeCost: 1, influence: 40 }),
    null, null, deps);
  const pricedBtn = byClass(priced, "emig-dp-btn")[0];
  assert.equal(byClass(pricedBtn, "emig-y-n")[0].textContent, "1", "the Influence price inside the button");
  assert.ok(texts(pricedBtn).includes("a turn"), "a turn");
  const paying = settlementCard(entry({ bar: 0.2, flag: "", cityKey: "1:4", owner: 1, closed: true, intakeCost: 1, influence: 40 }),
    null, null, deps);
  assert.ok(texts(paying).includes("Paying 1 Influence a turn."), "what it's costing while it's on");
  const short = settlementCard(entry({ bar: 0.2, flag: "", cityKey: "1:4", owner: 1, closed: false, intakeCost: 2, influence: 1.6 }),
    null, null, deps);
  const btn = byClass(short, "emig-dp-btn")[0];
  assert.ok(btn.className.split(" ").includes("off"), "greyed when the treasury can't cover a turn");
  assert.equal(btn.title, "Not enough Influence: dissuading newcomers costs 2 a turn and we have 1.");
  btn.click();
  assert.deepEqual(toggles, [], "and it doesn't close anything");
  const free = settlementCard(entry({ bar: 0.2, flag: "", cityKey: "1:4", owner: 1, closed: false, intakeCost: 0 }), null, null, deps);
  assert.ok(!texts(free).some((t) => /a turn/.test(t)), "no price when it\x27s free");
}

// No switch without the dep (option off) or without a city key (a civilization's card, a displaced-only card).
{
  const off = settlementCard(entry({ bar: 0.2, flag: "", cityKey: "1:4", owner: 1, closed: false }), null, null,
    { ...deps, toggleIntake: undefined });
  assert.ok(!texts(off).includes("Dissuade newcomers"), "no switch when the option is off");
  const civ = settlementCard(entry({ bar: 0.2, flag: "" }), null, null, deps);
  assert.ok(!texts(civ).includes("Dissuade newcomers"), "no switch without a city key");
  const bare = settlementCard(entry(null), null, null, deps);
  assert.ok(texts(bare).length > 0, "a card with no pressure entry still draws");
}

console.log("settlement-card-render harness passed");
