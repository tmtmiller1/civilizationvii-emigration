// city-readout-panel.mjs
//
// The DOM-panel half of the city readout (emigration-city-readout.js). city-readout.mjs covers the
// pure readoutModel; this drives the rendering + wiring that needs a document + a live world:
// installCityReadout (console API + selection subscription), showCityReadout / hideCityReadout,
// renderPanel / injectStyle / positionPanel / appendLine, and onSelection / selectedCityId.
//
// We supply a tiny self-contained DOM (with parentNode + remove, which the shared dom-stub lacks) so
// renderPanel actually mounts, a captured engine.on so the selection handler is invokable, and the
// same fake world the snapshot readers use so citySnapshot returns a real model.

import assert from "node:assert/strict";
import { CONFIG } from "/emigration/ui/emigration-config.js";

// ── A minimal DOM: elements track parentNode and support remove() + id lookup. ──
function makeEl(tag) {
  return {
    tagName: tag, id: "", className: "", textContent: "", innerHTML: "", style: {},
    children: [], parentNode: null,
    appendChild(c) { c.parentNode = this; this.children.push(c); return c; },
    removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; },
    remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  };
}
const head = makeEl("head");
const body = makeEl("body");
const documentElement = makeEl("html");
globalThis.document = {
  head, body, documentElement,
  createElement: makeEl,
  getElementById: (id) =>
    [...head.children, ...body.children, ...documentElement.children].find((e) => e.id === id) || null
};

// ── Captured selection subscription. ──
const handlers = [];
globalThis.engine = { on: (name, cb) => handlers.push({ name, cb }) };

// ── Fake world so citySnapshot resolves a model. ──
globalThis.YieldTypes = { YIELD_FOOD: "YIELD_FOOD", YIELD_PRODUCTION: "YIELD_PRODUCTION", YIELD_GOLD: "YIELD_GOLD", YIELD_SCIENCE: "YIELD_SCIENCE", YIELD_CULTURE: "YIELD_CULTURE", YIELD_HAPPINESS: "YIELD_HAPPINESS" };
globalThis.GameplayMap = { getPlotDistance: (ax, ay, bx, by) => Math.abs(ax - bx) + Math.abs(ay - by) };
globalThis.Culture = { isTraditionActive: () => false };
globalThis.Database = { makeHash: (t) => t };
globalThis.GameContext = { localPlayerID: 1 };
globalThis.Locale = { compose: (s) => s };
globalThis.Game = { turn: 1 };
globalThis.EmigrationData = { netCumFor: () => -3000, grossInCumFor: () => 10, grossOutCumFor: () => 30, cityNetSeries: () => [-2, 1, 3, -1, 2] };
const kv = {};
globalThis.Configuration = { getGame: () => ({ getValue: (k) => kv[k] }), editGame: () => ({ setValue: (k, v) => (kv[k] = v) }) };

const poor = { owner: 1, localId: 1, name: "Poorholm", isTown: false, isBeingRazed: false, isInfected: false, urbanPopulation: 0, population: 8, ruralPopulation: 8, location: { x: 0, y: 0 }, addRuralPopulation(d) { this.ruralPopulation += d; this.population += d; }, Yields: { getYield: () => 1 }, Happiness: { netHappinessPerTurn: 0, hasUnrest: false } };
const rich = { owner: 1, localId: 2, name: "Richberg", isTown: false, isBeingRazed: false, isInfected: false, urbanPopulation: 0, population: 3, ruralPopulation: 3, location: { x: 2, y: 0 }, addRuralPopulation(d) { this.ruralPopulation += d; this.population += d; }, Yields: { getYield: () => 1000 }, Happiness: { netHappinessPerTurn: 0, hasUnrest: false } };
const civ = { isAlive: true, isMajor: true, isMinor: false, Cities: { getCities: () => [poor, rich] }, Diplomacy: { hasMet: () => true, getWarCount: () => 0, isAtWar: () => false }, Culture: { isTraditionActive: () => false } };
globalThis.Players = { get: (pid) => (pid === 1 ? civ : null), getAlive: () => [civ] };
Object.assign(CONFIG, {
  maxMovesPerTurn: 100, emigrationBar: 1, minRuralToEmigrate: 1, requireMet: false, includeCityStates: false,
  crossCivEnabled: true, foodFactor: 1, productionFactor: 0, goldFactor: 0, scienceFactor: 0, cultureFactor: 0,
  populationFactor: 0, bordersEnabled: false, distanceFactor: 0, splitTracksEnabled: true, attritionEnabled: false
});

const { installCityReadout } = await import("/emigration/ui/emigration-city-readout.js");

// ── installCityReadout: console API + selection subscription. ──
CONFIG.cityReadoutEnabled = true;
CONFIG.cityReadoutSparkline = true;
installCityReadout();
const api = /** @type {*} */ (globalThis).emigration;
assert.equal(typeof api.city, "function", "console api.city installed");
assert.equal(typeof api.hideCity, "function", "console api.hideCity installed");
assert.ok(handlers.length >= 1, "subscribed to at least one selection event");

const panelMounted = () => body.children.some((c) => c.id === "emig-readout");

// ── Show by object → renders + mounts the panel; style injected once. ──
CONFIG.cityReadoutCorner = "top-right";
api.city(poor);
assert.ok(panelMounted(), "showing a city mounts the readout panel");
assert.ok(document.getElementById("emig-readout-style"), "the stylesheet is injected");
const panel = body.children.find((c) => c.id === "emig-readout");
assert.ok(panel.children.length >= 2, "panel has a title + at least one line");
assert.equal(panel.style.right, "1rem", "top-right corner positions to the right");
assert.equal(panel.style.top, "9rem", "top-right corner positions to the top");

// ── Feature E: the readout renders a net-migration sparkline when enabled + history exists. ──
const spark = panel.children.find((c) => c.className === "emig-rt-spark");
assert.ok(spark, "a sparkline strip is rendered");
assert.equal(spark.children.length, 5, "one bar per net value in the series");
assert.ok(spark.children.every((b) => b.className === "emig-rt-bar" && b.style.height), "each bar has a height");
assert.ok(panel.children.some((c) => c.className === "emig-rt-sparklabel"), "the sparkline has a caption");

// ── Re-show with a different corner → repositions, reuses the element (no duplicate mount). ──
CONFIG.cityReadoutCorner = "bottom-left";
api.city(2); // by localId (findSignal localId path)
const mountedCount = body.children.filter((c) => c.id === "emig-readout").length;
assert.equal(mountedCount, 1, "re-showing reuses the one panel element");
assert.equal(panel.style.left, "1rem", "bottom-left corner positions to the left");
assert.equal(panel.style.bottom, "9rem", "bottom-left corner positions to the bottom");

// ── Show an unknown city → no model → hides the stale panel. ──
api.city("no-such-city");
assert.ok(!panelMounted(), "showing an unresolvable city hides the panel");

// ── Selection events: a payload with a city shows; an empty/None payload hides. ──
const handler = handlers[0].cb;
handler({ city: poor });
assert.ok(panelMounted(), "a city-selection event shows the readout");
handler({}); // selectedCityId → null → hide
assert.ok(!panelMounted(), "an empty selection hides the readout");
handler(null); // selectedCityId(null) → null → hide (no throw)
assert.ok(!panelMounted(), "a null selection payload is handled");

// ── Explicit hide is idempotent. ──
api.city(poor);
assert.ok(panelMounted(), "shown again");
api.hideCity();
assert.ok(!panelMounted(), "hideCity removes the panel");
api.hideCity();
assert.ok(!panelMounted(), "hideCity is idempotent when already hidden");

// ── Disabled → showCityReadout is a no-op (the gate branch). ──
CONFIG.cityReadoutEnabled = false;
api.city(poor);
assert.ok(!panelMounted(), "with the readout disabled, nothing renders");

// ── dockInset: the readout moves beside a city-screen panel that holds its corner. ──
const { dockInset } = await import("/emigration/ui/emigration-city-readout.js");
const VW = 2880;
const cornerBox = { left: 2481, right: 2864, top: 146, bottom: 431 }; // top-right, 16 px inset (watched in game)
const cityDetails = { left: 2419, right: 2880, top: 29, bottom: 1800 };
assert.equal(dockInset(false, VW, cornerBox, []), 16, "no panel: the corner inset stands");
assert.equal(dockInset(false, VW, cornerBox, [cityDetails]), 2880 - 2419 + 8, "City Details open: docks just left of it");
const chooser = { left: 0, right: 470, top: 29, bottom: 1800 };
const leftBox = { left: 16, right: 399, top: 146, bottom: 431 };
assert.equal(dockInset(true, VW, leftBox, [chooser]), 478, "left corner: docks just right of the production list");
assert.equal(dockInset(false, VW, cornerBox, [chooser]), 16, "a panel on the other side does not move it");
const below = { left: 2419, right: 2880, top: 500, bottom: 1800 };
assert.equal(dockInset(false, VW, cornerBox, [below]), 16, "a panel that does not reach the readout's rows does not move it");
const wide = { left: 200, right: 2880, top: 0, bottom: 1800 };
assert.equal(dockInset(false, VW, cornerBox, [wide]), null, "no room beside the panel: hide");
assert.equal(dockInset(false, VW, cornerBox, [cityDetails, { left: 2300, right: 2600, top: 100, bottom: 300 }]), 2880 - 2300 + 8,
  "overlapping panels: clears the farthest one");

// ── In the DOM: a visible City Details moves the mounted readout; a hidden one does not. ──
CONFIG.cityReadoutEnabled = true;
CONFIG.cityReadoutCorner = "top-right";
globalThis.window = { innerWidth: VW };
const detailsEl = { classList: { contains: (c) => c === "hidden" && detailsHidden }, getBoundingClientRect: () => ({ ...cityDetails, width: 461, height: 1771 }) };
let detailsHidden = false;
document.querySelector = (sel) => (sel === "panel-city-details" ? detailsEl : null);
const readoutRect = () => ({ ...cornerBox, width: 383, height: 285 });
api.city(poor);
const shown = body.children.find((c) => c.id === "emig-readout");
shown.getBoundingClientRect = readoutRect;
api.city(poor); // re-render now that the stub element can be measured
assert.equal(shown.style.right, 2880 - 2419 + 8 + "px", "City Details open: the readout sits beside it");
assert.equal(shown.style.visibility, "", "and stays visible");
// A repeat check with nothing changed writes no style at all (rewriting made it blink in game).
let writes = 0;
const plainStyle = shown.style;
shown.style = new Proxy(plainStyle, { set(t, k, v) { writes++; t[k] = v; return true; } });
api.city(poor);
assert.equal(writes, 0, "an unchanged dock rewrites no inline style");
detailsHidden = true;
api.city(poor);
assert.equal(shown.style.right, "1rem", "City Details closed: back in its corner");

// The production list's host spans up to City Details; only its drawn frame counts.
CONFIG.cityReadoutCorner = "top-left";
const leftRect = { ...leftBox, width: 383, height: 285 };
shown.getBoundingClientRect = () => leftRect;
const chooserFrame = { getBoundingClientRect: () => ({ ...chooser, width: 470, height: 1771 }) };
const chooserHost = {
  classList: { contains: () => false },
  getBoundingClientRect: () => ({ left: 0, right: 2419, top: 29, bottom: 1800, width: 2419, height: 1771 }),
  querySelector: (sel) => (sel === "fxs-subsystem-frame" ? chooserFrame : null)
};
document.querySelector = (sel) => (sel === "panel-production-chooser" ? chooserHost : null);
api.city(poor);
assert.equal(shown.style.left, "478px", "docks beside the drawn production frame, not its wide host");
assert.equal(shown.style.visibility, "", "and is not hidden for lack of room");
api.hideCity();
delete document.querySelector;

console.log("city-readout-panel harness passed");
