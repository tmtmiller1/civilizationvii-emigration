// emigration-enclave-markers.js
//
// Paints an ON-MAP marker for every built enclave (IMPROVEMENT_EMIG_ENCLAVE_<CIV>): the civ's symbol icon
// (the same one the build menu uses) plus a "<Civ> Enclave" label, floating over the enclave's tile. This
// is the mod's substitute for a 3D model — Civ VII gives modders NO way to bind a real model to a custom
// constructible (VisualRemap works only for units; there's no asset SDK), so we render the presence
// ourselves from our OWN WorldUI overlay group, exactly like the geographic-labels probe proved out.
//
// Reads only (scans the local player's cities for placed enclave constructibles); never mutates game
// state. Repaints on the events that can change where enclaves are: a constructible added to the map, a
// turn starting, and load complete. Fully self-contained + self-guarding: any failure degrades to "no
// marker", never throws into the game.

import { dlog } from "/emigration/ui/emigration-log.js";
import { allQuarterEntries } from "/emigration/ui/emigration-quarter-state.js";
import { enclaveTypeOf } from "/emigration/ui/emigration-enclave-place.js";
import { stanceYields } from "/emigration/ui/emigration-enclave-yields.js";
import { markerStageLine } from "/emigration/ui/emigration-enclave-tooltip-data.js";

/** Matches our generated enclave improvement types. */
const ENCLAVE_RE = /^IMPROVEMENT_EMIG_ENCLAVE_/;
/** Title-font stack (matches core global-scaling TITLE_FONTS); avoids a fragile import. */
const FONTS = ["TitleFont", "TitleFont-SC", "TitleFont-TC", "TitleFont-JP", "TitleFont-KR"];
/** OVERLAY_PRIORITY.MAX_PRIORITY — paint above the lens layers. */
const OVERLAY_MAX_PRIORITY = 10;
/** Label opacity (ABGR high byte) + white body. */
const LABEL_ALPHA = 0xE0;
/** Icon world height above the tile, and the label clearly BELOW it (lower z = lower on screen). */
const ICON_Z = 13;
const TEXT_Z = 1;
/** World-space offsets so the marker leaves the plot CENTRE to the game's yield icons (the yields layer
 * draws its row at y 0, z 5; watched 2026-09-13: a centred marker hid the enclave tile's yields). */
const ICON_Y = 11;
const TEXT_Y = -9;
const ICON_SCALE = 0.6;
const TEXT_FONT_SIZE = 3.5;
/** The stage line sits under the name, smaller, so the name still reads first. */
const STAGE_Y = -13;
const STAGE_FONT_SIZE = 2.6;

const g = /** @type {*} */ (globalThis);
/** @type {*} */ let _group = null;
/** @type {*} */ let _grid = null;

/**
 * One diagnostic line through the mod's debug logger. (The earlier "invalid CSS value" trick wrote an
 * "Unable to parse declaration" line into UI.log on EVERY repaint, about 1,400 lines a session; watched
 * 2026-09-13. console.error does reach UI.log, and dlog is gated by the debug option.)
 * @param {*} s The message.
 */
function logEmit(s) {
  dlog("enclave markers: " + String(s));
}

/** Run fn(), swallowing throws (returns undefined on error). @param {()=>*} fn @returns {*} */
function safe(fn) {
  try {
    return fn();
  } catch (_) {
    return undefined;
  }
}

/** ABGR fill: white body at LABEL_ALPHA. @returns {number} */
function labelFill() {
  return (LABEL_ALPHA & 0xff) * 0x1000000 + 0xffffff;
}

/** Create our overlay group + sprite grid once. @returns {boolean} ready */
function ensureOverlay() {
  if (_group && _grid) return true;
  const ok = safe(() => {
    _group = WorldUI.createOverlayGroup("EMIG_EnclaveOverlay", OVERLAY_MAX_PRIORITY);
    _grid = WorldUI.createSpriteGrid("EMIG_EnclaveGrid", true);
    return true;
  });
  if (ok !== true) {
    logEmit("overlay unavailable — WorldUI.createOverlayGroup/SpriteGrid failed");
    return false;
  }
  return true;
}

/**
 * Remove all painted markers. The icons and labels live on the SPRITE GRID, so the grid is what has to
 * be cleared. This used to clear only the overlay group, which the grid was never attached to, so nothing
 * was ever removed: every repaint stacked another icon and another label on the tile (watched 2026-09-17:
 * a doubled "NORMAN ENCLAVE" label on screen, and 63 leaked marker pairs in a six-minute session). The
 * base game's layers and the geographic-labels mod both clear their grids this way.
 */
function clearMarkers() {
  safe(() => {
    if (_grid) _grid.clear();
  });
  safe(() => {
    if (_group) _group.clearAll();
  });
}

/**
 * The constructible types on a plot, or NULL when the map could not be read.
 *
 * The difference matters: mid turn-transition these reads come back empty for a moment, and treating
 * that as "the enclave is gone" wipes every marker off the map until the next event (watched 2026-09-17,
 * the labels vanishing during the turn transition). An empty ARRAY means the plot really is bare.
 * @param {number} x Plot x. @param {number} y Plot y. @returns {string[]|null} The types, or null.
 */
function plotTypes(x, y) {
  let cons;
  try {
    cons = MapConstructibles.getConstructibles(x, y);
  } catch (_) {
    return null;
  }
  if (!cons) return null;
  const out = [];
  for (const c of cons) {
    const inst = safe(() => Constructibles.getByComponentID(c));
    const def = inst ? safe(() => GameInfo.Constructibles.lookup(inst.type)) : null;
    if (def && def.ConstructibleType) out.push(String(def.ConstructibleType));
  }
  return out;
}

/**
 * The enclave constructible type on a plot (x,y), or null.
 * @param {number} x @param {number} y @returns {string|null}
 */
function enclaveTypeAt(x, y) {
  const cons = safe(() => MapConstructibles.getConstructibles(x, y)) || [];
  for (const c of cons) {
    const inst = safe(() => Constructibles.getByComponentID(c));
    if (!inst) continue;
    const def = safe(() => GameInfo.Constructibles.lookup(inst.type));
    const t = def && def.ConstructibleType;
    if (t && ENCLAVE_RE.test(String(t))) return String(t);
  }
  return null;
}

/**
 * Every enclave tile in the local player's cities: {idx, type}, where `type` is the enclave improvement
 * the marker stands for (icon + label). Two sources, merged by plot: the player's quarter RECORDS whose
 * placed tile still stands (this is how a Village-skinned enclave is known, since on the map it is a
 * plain Village), and a scan of the player's plots for native-skin enclave improvements.
 * @returns {{idx:number, type:string}[]}
 */
function localEnclaveTiles() {
  /** @type {Map<number, string>} */
  const byPlot = new Map();
  /** @type {Map<number, string>} */
  const stageByPlot = new Map();
  const pid = safe(() => GameContext.localPlayerID);
  recordTiles(pid, byPlot, stageByPlot);
  scannedTiles(pid, byPlot);
  return Array.from(byPlot, ([idx, type]) => ({ idx, type, stage: stageByPlot.get(idx) || "" }));
}

/**
 * The player's standing placed enclaves from their quarter records.
 * @param {number} pid Local player id. @param {Map<number,string>} byPlot Plot index → enclave type (mutated).
 * @param {Map<number,string>} stageByPlot Plot index → the stage line for the marker (mutated). Only a
 *   RECORD knows its stage, so a tile found by the map scan alone carries a name and no stage.
 */
function recordTiles(pid, byPlot, stageByPlot) {
  // Every host's records (AI cities host enclaves under automatic recognition), but only on plots the
  // local player has revealed, so the overlay never shows what lies under fog.
  for (const { rec } of safe(() => allQuarterEntries()) || []) {
    const type = enclaveTypeOf(rec);
    if (!type || !rec.placed || !revealed(pid, rec.placed.plot)) continue;
    if (!recordTileStands(rec)) continue;
    byPlot.set(rec.placed.plot, type);
    // The tile's yield icons cannot change when an enclave is recognized (the stance is paid to the city,
    // not written to the tile), so the marker says what stage it has reached and what the stance pays.
    stageByPlot.set(rec.placed.plot, safe(() => markerStageLine(rec, stanceYields(rec))) || "");
  }
}

/**
 * Whether a record's tile should still be marked.
 *
 * A RECORD is the authority on whether an enclave exists: it is dropped the moment one fades, which is
 * how the marker disappears. The map is only consulted to notice a tile that was built over — and when
 * that read fails (mid turn-transition), a tile already seen standing keeps its marker rather than
 * blinking out. Without this the markers vanish every turn transition and come back on the next event.
 * @param {*} rec A quarter record. @returns {boolean} True when the marker should be painted.
 */
function recordTileStands(rec) {
  const p = rec.placed;
  const loc = safe(() => GameplayMap.getLocationFromIndex(p.plot));
  if (!loc) return !!p.stood; // unreadable location: trust a tile we have already seen standing
  const types = plotTypes(loc.x, loc.y);
  if (types === null) return !!p.stood; // unreadable plot: same
  return types.includes(p.type);
}

/**
 * Whether a plot is revealed to a player (unreadable reads as revealed only for the player's own cities'
 * plots, which the map scan covers anyway).
 * @param {number} pid Player id. @param {number} plot Plot index. @returns {boolean} True when revealed.
 */
function revealed(pid, plot) {
  return safe(() => {
    const loc = GameplayMap.getLocationFromIndex(plot);
    const state = GameplayMap.getRevealedState(pid, loc.x, loc.y);
    return state !== RevealedStates.HIDDEN;
  }) === true;
}

/**
 * Native-skin enclave improvements found on the player's plots.
 * @param {number} pid Local player id. @param {Map<number,string>} byPlot Plot index → enclave type (mutated).
 */
function scannedTiles(pid, byPlot) {
  const cities = safe(() => Players.get(pid).Cities.getCities()) || [];
  for (const city of cities) {
    for (const idx of safe(() => city.getPurchasedPlots()) || []) {
      if (byPlot.has(idx)) continue;
      const loc = safe(() => GameplayMap.getLocationFromIndex(idx));
      const type = loc ? enclaveTypeAt(loc.x, loc.y) : null;
      if (type) byPlot.set(idx, type);
    }
  }
}

/**
 * "<Civ> Enclave" for an enclave type, from its localized NAME (falls back to the short civ name).
 * @param {string} type
 */
function enclaveLabel(type) {
  const composed = safe(() => Locale.compose("LOC_" + type + "_NAME"));
  if (typeof composed === "string" && composed && !/^LOC_/.test(composed)) return composed;
  // No generated text (a civilization outside the stance registry): "<Civ> Enclave" from the type,
  // dropping the stance suffix (IMPROVEMENT_EMIG_ENCLAVE_GORYEO_A → "Goryeo").
  const short = civShortOf(type);
  const civName = safe(() => Locale.compose("LOC_CIVILIZATION_" + short + "_NAME"));
  const name = typeof civName === "string" && civName && !/^LOC_/.test(civName)
    ? civName
    : short.charAt(0) + short.slice(1).toLowerCase().replace(/_/g, " ");
  return name + " Enclave";
}

/**
 * The civilization short name inside an enclave type (ROME from IMPROVEMENT_EMIG_ENCLAVE_ROME_A).
 * @param {string} type The enclave type. @returns {string} The short name.
 */
function civShortOf(type) {
  return type.replace(ENCLAVE_RE, "").replace(/_(A|B)$/, "");
}

/**
 * The civ-symbol icon for an enclave type: the generated per-enclave icon, else the civilization's own
 * icon, else the symbol asset by name.
 * @param {string} type The enclave type. @returns {*} An icon handle or asset name, or null.
 */
function enclaveIcon(type) {
  const direct = safe(() => UI.getIconBLP(type));
  if (direct) return direct;
  const civ = safe(() => UI.getIconBLP("CIVILIZATION_" + civShortOf(type)));
  if (civ) return civ;
  return "fs://game/civ_sym_" + civShortOf(type).toLowerCase();
}

/**
 * Paint the civ icon, the "<Civ> Enclave" label and (when known) the stage line on one enclave tile.
 * @param {{idx:number, type:string, stage?:string}} tile The tile to mark.
 */
function paintOne(tile) {
  const icon = enclaveIcon(tile.type);
  if (icon) safe(() => _grid.addSprite(tile.idx, icon, { x: 0, y: ICON_Y, z: ICON_Z }, { scale: ICON_SCALE }));
  const label = enclaveLabel(tile.type).toUpperCase();
  const params = { fonts: FONTS, fontSize: TEXT_FONT_SIZE, fill: labelFill(), faceCamera: true };
  safe(() => _grid.addText(tile.idx, label, { x: 0, y: TEXT_Y, z: TEXT_Z }, params));
  if (tile.stage) {
    const small = { ...params, fontSize: STAGE_FONT_SIZE };
    safe(() => _grid.addText(tile.idx, tile.stage, { x: 0, y: STAGE_Y, z: TEXT_Z }, small));
  }
}

/**
 * Repaint every enclave marker. The tiles are gathered BEFORE anything is cleared, so a scan that throws
 * leaves the current markers alone instead of blanking the map.
 * @param {string} reason What asked for the repaint (logged).
 */
function repaint(reason) {
  if (!ensureOverlay()) return;
  if (!worldReadable()) {
    logEmit("repaint(" + reason + ") skipped: world not readable yet");
    return;
  }
  let tiles;
  try {
    tiles = localEnclaveTiles();
  } catch (e) {
    logEmit("repaint(" + reason + ") skipped: scan threw " + e);
    return;
  }
  clearMarkers();
  for (const tile of tiles) paintOne(tile);
  logEmit("repaint(" + reason + ") painted=" + tiles.length);
}

/**
 * Whether the world can be read at all right now. During a turn transition the player and its cities are
 * briefly unavailable; repainting then would clear every marker and paint nothing back.
 * @returns {boolean} True when a scan is worth doing.
 */
function worldReadable() {
  const pid = safe(() => GameContext.localPlayerID);
  if (typeof pid !== "number" || pid < 0) return false;
  return !!safe(() => Players.get(pid));
}

/** How long a burst of map events is allowed to settle before ONE repaint answers all of it. */
const REPAINT_DEBOUNCE_MS = 200;
/** @type {*} The pending coalesced repaint, or null. */
let _pending = null;

/**
 * Ask for a repaint, coalescing bursts. The events that move enclaves arrive in floods: one turn raises
 * `PlayerTurnActivated` once per player and a single placement raised `ConstructibleAddedToMap` 36 times
 * inside one second (watched 2026-09-17: 298 repaints in six minutes), and each repaint rescans every plot
 * of every local city. One paint shortly after the burst shows exactly the same thing.
 * @param {string} reason What asked (logged with the paint).
 */
function scheduleRepaint(reason) {
  if (typeof setTimeout !== "function") {
    repaint(reason);
    return;
  }
  if (_pending) return;
  _pending = setTimeout(() => {
    _pending = null;
    repaint(reason);
  }, REPAINT_DEBOUNCE_MS);
}

/** Subscribe to the events that can change where enclaves are, plus an initial paint. */
function wire() {
  const eng = g.engine;
  if (!eng || typeof eng.on !== "function") {
    logEmit("engine.on unavailable — markers will not auto-refresh");
    return;
  }
  safe(() => eng.on("ConstructibleAddedToMap", () => scheduleRepaint("ConstructibleAddedToMap")));
  safe(() => eng.on("PlayerTurnActivated", () => scheduleRepaint("PlayerTurnActivated")));
  safe(() => eng.on("LoadComplete", () => scheduleRepaint("LoadComplete")));
  // Initial paint shortly after load (the map/overlay may not be ready at import time).
  if (typeof setTimeout === "function") setTimeout(() => repaint("init"), 1500);
  else repaint("init");
}

/** Test seam: the paint cycle, without waiting on engine events or timers. */
export const __test = { repaint, clearMarkers, scheduleRepaint, recordTileStands, plotTypes };

try {
  wire();
  logEmit("enclave markers wired");
} catch (e) {
  logEmit("wire threw " + e);
}
