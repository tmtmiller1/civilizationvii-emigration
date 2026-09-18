// enclave-markers.mjs
//
// The on-map enclave marker (emigration-enclave-markers.js) had no test at all, which is how it shipped
// clearing the wrong object: it cleared an overlay group the sprite grid was never attached to, so every
// repaint stacked another icon and another label on the tile (watched in game 2026-09-17 as a doubled
// "NORMAN ENCLAVE" label; 63 leaked marker pairs in six minutes). This fakes just enough of WorldUI to
// count what is actually on the grid after each repaint.

import assert from "node:assert/strict";

/** A sprite grid that remembers what it holds, like the engine's does. */
const grid = {
  sprites: [], texts: [],
  addSprite(idx, icon) { this.sprites.push({ idx, icon }); },
  addText(idx, label) { this.texts.push({ idx, label }); },
  clear() { this.sprites = []; this.texts = []; }
};
const group = { cleared: 0, clearAll() { this.cleared++; } };
const handlers = {};
globalThis.WorldUI = { createOverlayGroup: () => group, createSpriteGrid: () => grid };
globalThis.engine = { on: (name, fn) => { (handlers[name] || (handlers[name] = [])).push(fn); } };
globalThis.GameContext = { localPlayerID: 0 };
globalThis.RevealedStates = { HIDDEN: 0 };
globalThis.GameplayMap = { getLocationFromIndex: (i) => ({ x: i, y: 0 }), getRevealedState: () => 2 };
globalThis.MapConstructibles = { getConstructibles: (x) => (x === 7 ? [{ id: 1 }] : []) };
globalThis.Constructibles = { getByComponentID: () => ({ type: 1 }) };
globalThis.GameInfo = { Constructibles: { lookup: () => ({ ConstructibleType: "IMPROVEMENT_EMIG_ENCLAVE_NORMAN_A" }) } };
globalThis.Players = { get: () => ({ Cities: { getCities: () => [{ getPurchasedPlots: () => [5, 6, 7] }] } }) };
globalThis.UI = { getIconBLP: () => "icon" };
globalThis.Locale = { compose: (k) => (k === "LOC_IMPROVEMENT_EMIG_ENCLAVE_NORMAN_A_NAME" ? "Norman Enclave" : k) };
const kv = {};
globalThis.Configuration = { getGame: () => ({ getValue: (k) => kv[k] }), editGame: () => ({ setValue: (k, v) => (kv[k] = v) }) };

// Timers are captured, not run, so the debounce is driven by hand.
const timers = [];
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn) => { timers.push(fn); return timers.length; };
const { __test: M } = await import("/emigration/ui/emigration-enclave-markers.js");
function flush() { while (timers.length) timers.shift()(); }

// ── one enclave, one marker ──
M.repaint("test");
assert.equal(grid.texts.length, 1, "one enclave tile paints one label");
assert.equal(grid.sprites.length, 1, "and one icon");
assert.equal(grid.texts[0].label, "NORMAN ENCLAVE", "labelled with the enclave's name, upper-cased");
assert.equal(grid.texts[0].idx, 7, "on the enclave's own plot");

// ── THE BUG: repainting must REPLACE the marker, never stack a second copy ──
for (let i = 0; i < 25; i++) M.repaint("again");
assert.equal(grid.texts.length, 1, "after 26 repaints the tile still carries ONE label, not 26");
assert.equal(grid.sprites.length, 1, "and ONE icon");

// ── a vanished enclave takes its marker with it ──
const before = globalThis.MapConstructibles.getConstructibles;
globalThis.MapConstructibles.getConstructibles = () => [];
M.repaint("gone");
assert.equal(grid.texts.length, 0, "no enclave, no label left behind");
assert.equal(grid.sprites.length, 0, "and no icon left behind");
globalThis.MapConstructibles.getConstructibles = before;

// ── a RECORDED enclave also carries its stage, and what its stance pays ──
// The tile's yield icons cannot change on recognition (the stance is paid to the city), so the marker is
// where the map says an enclave has moved on from "established".
{
  const { putQuarter, dropQuarter } = await import("/emigration/ui/emigration-quarter-state.js");
  const base = { civ: 4, originCiv: "CIVILIZATION_NORMAN", owner: 0, turn: 1, contested: false, contestedTurn: -999,
    placed: { type: "IMPROVEMENT_EMIG_ENCLAVE_NORMAN_A", plot: 7, enclave: "IMPROVEMENT_EMIG_ENCLAVE_NORMAN_A" } };
  putQuarter("7,0", { ...base, optionId: "ignore", recognized: false, applied: {} });
  M.repaint("established");
  assert.deepEqual(grid.texts.map((t) => t.label), ["NORMAN ENCLAVE", "Established"], "an established enclave says so under its name");
  putQuarter("7,0", { ...base, optionId: "a", recognized: true,
    applied: { benefitYield: "YIELD_PRODUCTION", benefitAmount: 2, penaltyYield: "YIELD_HAPPINESS", penaltyAmount: 1 } });
  M.repaint("recognized");
  assert.deepEqual(grid.texts.map((t) => t.label), ["NORMAN ENCLAVE", "Recognized  −1 Happiness, +2 Production"],
    "recognition CHANGES what the map shows: the stage and the stance's yields");
  dropQuarter("7,0");
  M.repaint("scan-only");
  assert.deepEqual(grid.texts.map((t) => t.label), ["NORMAN ENCLAVE"], "a tile known only from the map scan has a name and no stage");
}

// ── THE TURN-TRANSITION BLANK: an unreadable map must not wipe the markers ──
// Clearing the grid properly (above) exposed this: mid turn-transition the map reads come back empty for
// a moment, and a repaint then cleared every marker and painted nothing back, so the labels vanished
// each turn and returned on the next event.
{
  const { putQuarter, dropQuarter } = await import("/emigration/ui/emigration-quarter-state.js");
  const rec = { civ: 4, originCiv: "CIVILIZATION_NORMAN", owner: 0, turn: 1, optionId: "a", recognized: true,
    contested: false, contestedTurn: -999, applied: {},
    placed: { type: "IMPROVEMENT_EMIG_ENCLAVE_NORMAN_A", plot: 7, enclave: "IMPROVEMENT_EMIG_ENCLAVE_NORMAN_A", stood: true } };
  putQuarter("7,0", rec);
  M.repaint("normal");
  const names = () => grid.texts.filter((t) => t.label === "NORMAN ENCLAVE").length;
  assert.equal(names(), 1, "the marker is painted normally");

  const realCons = globalThis.MapConstructibles.getConstructibles;
  globalThis.MapConstructibles.getConstructibles = () => { throw new Error("mid-transition"); };
  M.repaint("transition-throw");
  assert.equal(names(), 1, "a map read that THROWS keeps the marker (kills the blank-out)");
  globalThis.MapConstructibles.getConstructibles = () => null;
  M.repaint("transition-null");
  assert.equal(names(), 1, "an unreadable plot keeps a tile already seen standing");
  globalThis.MapConstructibles.getConstructibles = realCons;

  // An unreadable PLAYER skips the repaint entirely rather than clearing to nothing.
  const realPlayers = globalThis.Players.get;
  globalThis.Players.get = () => null;
  M.repaint("no-player");
  assert.equal(names(), 1, "an unreadable player leaves the markers alone");
  globalThis.Players.get = realPlayers;

  // But a plot that really IS bare drops the marker: this is how a built-over tile stops being marked.
  globalThis.MapConstructibles.getConstructibles = () => [];
  M.repaint("really-empty");
  assert.equal(names(), 0, "a readable, genuinely empty plot does drop the marker");
  globalThis.MapConstructibles.getConstructibles = realCons;

  // And a dropped RECORD removes it, which is what a fade does.
  M.repaint("restored");
  assert.equal(names(), 1, "restored");
  // A fade drops the record AND destroys the tile, so nothing is left for either source to find.
  dropQuarter("7,0");
  globalThis.MapConstructibles.getConstructibles = () => [];
  M.repaint("faded");
  assert.equal(names(), 0, "a faded enclave's record is gone and its tile destroyed, so its marker is too");
  globalThis.MapConstructibles.getConstructibles = realCons;
}

// ── a burst of map events is answered by ONE repaint ──
flush(); // drain the module's own initial paint
grid.clear();
let paints = 0;
const realAdd = grid.addText.bind(grid);
grid.addText = (idx, label) => { paints++; realAdd(idx, label); };
for (let i = 0; i < 36; i++) for (const fn of handlers.ConstructibleAddedToMap) fn();
for (let i = 0; i < 10; i++) for (const fn of handlers.PlayerTurnActivated) fn();
assert.equal(timers.length, 1, "46 events in a burst schedule ONE repaint");
flush();
assert.equal(paints, 1, "and that one repaint paints the label once");
for (const fn of handlers.PlayerTurnActivated) fn();
assert.equal(timers.length, 1, "after the burst settles, the next event schedules a fresh repaint");
flush();

globalThis.setTimeout = realSetTimeout;
console.log("enclave-markers tests passed");
