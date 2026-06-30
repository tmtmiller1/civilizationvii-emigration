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
globalThis.EmigrationData = { netCumFor: () => -3000, grossInCumFor: () => 10, grossOutCumFor: () => 30 };
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

console.log("city-readout-panel harness passed");
