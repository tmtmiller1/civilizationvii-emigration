// emigration-ethnicity-lens.js
//
// A map LENS that paints every settlement's tiles by the ORIGIN civilization of its population,
// the "ethnic composition" tracked in emigration-composition.js. Each owned tile is drawn two ways at
// once (emigration-ethnicity-tiles.js + emigration-ethnicity-distribution.js supply the per-tile mix):
//   • BORDER — the settlement's MAIN (dominant) origin's banner colour at full strength, so you always
//     read whose city it is regardless of the fill.
//   • FILL — the BLEND of every origin living on the tile, weighted by its share (emigration-ethnicity-
//     colour.js), so the map is a continuous gradient between banner colours rather than one colour or
//     another. The tile's population density sets its SATURATION (grey → that blend) and opacity together,
//     the same ramp the Prosperity lens uses, so a dense core is vivid and a sparse fringe is washed out.
//     A diaspora concentrates into a cluster (distribution model), strongest where an enclave stands, so
//     its neighbourhood shades toward its own colour and fades into the host's.
// The hover panel gives the numbers.
//
// Same self-registering UIScript pattern as emigration-prosperity-lens.js (LensManager layer +
// lens-panel decorate for the radio button, Shift+E hotkey). Loaded as its OWN <UIScripts> entry so
// it runs in the HUD context where LensManager/WorldUI live and can never break the gameplay pass.

import LensManager from "/core/ui/lenses/lens-manager.js";
import { collectCitySignals } from "/emigration/ui/emigration-cities.js";
import { civDisplayColor } from "/emigration/ui/emigration-civ-colors.js";
import { civHidden } from "/emigration/ui/emigration-governance.js";
import { setBasePlotTooltipHidden } from "/emigration/ui/emigration-plot-tooltip-suppress.js";
import { tilesForCity } from "/emigration/ui/emigration-ethnicity-tiles.js";
import { compositionVersion } from "/emigration/ui/emigration-composition.js";
import { tileFill, unit } from "/emigration/ui/emigration-ethnicity-colour.js";

const LENS = "emig-ethnicity-lens";
const LAYER = "emig-ethnicity-layer";
const HEX_GRID = 1; // OVERLAY_PRIORITY.HEX_GRID, inlined
const FALLBACK_HEX = "#888888"; // neutral grey when a civ colour can't be resolved
// Contrast curve on a tile's density within its settlement (< 1 lifts the middle, so the many mid-density
// tiles still read instead of washing out). Same shape the Prosperity lens uses. The fill's saturation and
// opacity constants live with the blend, in emigration-ethnicity-colour.js.
const CONTRAST_GAMMA = 0.55;
// Each tile's BORDER is the settlement's main (dominant) origin colour at full strength, so you always
// read whose city it is regardless of the fill; EDGE_ALPHA is that border's opacity.
const EDGE_ALPHA = 1.0;

/**
 * Parse a `#RRGGBB` colour into 0-1 RGB channels (neutral grey on failure).
 * @param {string} hex Colour string. @returns {{r:number, g:number, b:number}} Channels in [0,1].
 */
function parseRGB(hex) {
  const m = typeof hex === "string" ? hex.match(/^#?([0-9a-fA-F]{6})/) : null;
  const v = m ? m[1] : "888888";
  return {
    r: unit(parseInt(v.slice(0, 2), 16) / 255),
    g: unit(parseInt(v.slice(2, 4), 16) / 255),
    b: unit(parseInt(v.slice(4, 6), 16) / 255)
  };
}

/**
 * A civ's banner RGB in 0-1 channels (policy-hidden → neutral grey fallback).
 * @param {number} civ Origin civ id. @returns {{r:number, g:number, b:number}} Channels in [0,1].
 */
function civRGB(civ) {
  return parseRGB(civHidden(civ) ? FALLBACK_HEX : civDisplayColor(civ, FALLBACK_HEX));
}

/**
 * Each tile's density normalized ACROSS ITS OWN settlement (sparsest 0, densest 1, on a curve), so the core-to-
 * fringe ramp reads the same in a hamlet and a megacity.
 * @param {{density:number}[]} tiles The settlement's tiles.
 * @returns {number[]} One normalized density per tile, in order.
 */
function densityNorms(tiles) {
  let minD = Infinity;
  let maxD = -Infinity;
  for (const t of tiles) {
    if (t.density < minD) minD = t.density;
    if (t.density > maxD) maxD = t.density;
  }
  const span = maxD - minD;
  return tiles.map((t) => (span > 1e-6 ? Math.pow(unit((t.density - minD) / span), CONTRAST_GAMMA) : 1));
}

/**
 * The float4 BORDER colour for a settlement: its main origin's banner colour at full strength, so every
 * tile is framed in the owner's colour regardless of the (diverging) fill.
 * @param {number} hostCiv The settlement's main origin. @returns {{x:number,y:number,z:number,w:number}}
 */
function edgeFill(hostCiv) {
  const c = civRGB(hostCiv);
  return { x: unit(c.r), y: unit(c.g), z: unit(c.b), w: EDGE_ALPHA };
}

/**
 * Every observable settlement's PER-TILE paints: each owned tile filled by the diverging host↔grey↔other
 * scale at a population-density opacity, bordered in the settlement's main origin colour. A policy-hidden
 * owner's settlements are skipped entirely.
 * @returns {{x:number, y:number, fill:*, edge:*}[]} Per-tile paints.
 */
function tilePaints() {
  let signals = [];
  try {
    signals = collectCitySignals() || [];
  } catch (_) {
    return [];
  }
  /** @type {{x:number, y:number, fill:*, edge:*}[]} */
  const out = [];
  for (const s of signals) {
    // Never reveal a policy-hidden civ's settlements on the map.
    if (!civHidden(s.owner)) out.push(...settlementPaints(s));
  }
  return out;
}

/**
 * One settlement's per-tile paints: each tile in the blend of the origins living on it, at a saturation and opacity
 * carrying the tile's density within this settlement. Empty only when the settlement is unreadable, since the
 * mosaic itself is always built (an unrecorded settlement counts as all-host).
 * @param {*} s A city signal.
 * @returns {{x:number, y:number, fill:*, edge:*}[]} Per-tile paints.
 */
function settlementPaints(s) {
  const data = tilesForCity(s.city);
  if (!data || !data.tiles.length) return [];
  const hostCiv = data.comp && data.comp.dominant ? data.comp.dominant.civ : s.owner;
  const edge = edgeFill(hostCiv);
  const norms = densityNorms(data.tiles);
  return data.tiles.map((t, i) => ({
    x: t.x, y: t.y, fill: tileFill(t, civRGB, { hostCiv, densityNorm: norms[i] }), edge
  }));
}

/** Quantize a float4 colour into a short key so near-identical colours share a batch. @param {*} f @returns {string} */
function fillKey(f) {
  return Math.round(f.x * 50) + "," + Math.round(f.y * 50) + "," + Math.round(f.z * 50) + ":" + Math.round(f.w * 50);
}

/**
 * Group per-tile paints by (fill, edge) colour, so the overlay is painted in a handful of addPlots
 * batches (one per distinct fill+border) instead of one call per tile.
 * @param {{x:number, y:number, fill:*, edge:*}[]} paints Per-tile paints.
 * @returns {{fill:*, edge:*, plots:{x:number,y:number}[]}[]} Batches.
 */
function batchByFill(paints) {
  /** @type {Map<string, {fill:*, edge:*, plots:{x:number,y:number}[]}>} */
  const groups = new Map();
  for (const p of paints) {
    const key = fillKey(p.fill) + "|" + fillKey(p.edge);
    let g = groups.get(key);
    if (!g) {
      g = { fill: p.fill, edge: p.edge, plots: [] };
      groups.set(key, g);
    }
    g.plots.push({ x: p.x, y: p.y });
  }
  return [...groups.values()];
}

/** @type {{turn:string, batches:*[]}|null} Cache of the batched paints, per ledger version. */
let _paintCache = null;

/**
 * The lens cache key: the ledger's version (turn plus the recorder's pass stamp), so a pass that saved after the
 * lens first painted this turn is picked up instead of waiting a turn. "" when unreadable.
 * @returns {string} The key.
 */
function lensTurn() {
  try {
    return compositionVersion();
  } catch (_) {
    return "";
  }
}

/**
 * The batched per-tile paints, memoized for the ledger's current version, so toggling the lens off and back on
 * with nothing new recorded reuses the result instead of re-scanning every owned tile.
 * @returns {*[]} The fill batches.
 */
function cachedBatches() {
  const t = lensTurn();
  if (_paintCache && _paintCache.turn === t) return _paintCache.batches;
  const batches = batchByFill(tilePaints());
  _paintCache = { turn: t, batches };
  return batches;
}

/** The lens layer: an overlay of per-settlement plot fills coloured by each tile's blended origin mix. */
class EthnicityLensLayer {
  constructor() {
    this.group = WorldUI.createOverlayGroup("EmigEthnicityOverlay", HEX_GRID);
    this.overlay = this.group.addPlotOverlay();
  }

  /** Clear the overlay. */
  clear() {
    this.group.clearAll();
    this.overlay.clear();
  }

  /** Lens-layer lifecycle: init (no-op; built in the constructor). */
  initLayer() {}

  /** Lens-layer lifecycle: paint every settlement's tiles by the diverging fill + main-origin border. */
  applyLayer() {
    this.clear();
    for (const b of cachedBatches()) {
      if (!b.plots.length) continue;
      try {
        this.overlay.addPlots(b.plots, { fillColor: b.fill, edgeColor: b.edge });
      } catch (e) {
        console.error("[Emigration.lens] addPlots failed", e); // one bad batch must not kill the lens
      }
    }
    // Hide the base plot tooltip while this lens is active so it doesn't clash with the mod's own
    // ethnic-composition panel (emigration-ethnicity-tooltip.js).
    setBasePlotTooltipHidden(true);
  }

  /** Lens-layer lifecycle: clear on deactivate + restore the base plot tooltip. */
  removeLayer() {
    this.clear();
    setBasePlotTooltipHidden(false);
  }
}

/** The lens: the ethnicity layer plus the hex grid. */
class EthnicityLens {
  constructor() {
    this.activeLayers = new Set([LAYER, "fxs-hexgrid-layer"]);
    this.allowedLayers = new Set([]);
  }
}

/** Decorates the base `lens-panel` to add an "Ethnic Composition" radio button. */
class EthnicityLensPanelDecorator {
  /** @param {*} component The lens-panel component. */
  constructor(component) {
    this.component = component;
  }

  /** No-op lifecycle hook. */
  beforeAttach() {}

  /** Add the Ethnicity lens button once the panel exists. */
  afterAttach() {
    try {
      this.component.createLensButton("LOC_EMIG_LENS_ETHNICITY", LENS, "lens-group");
    } catch (e) {
      console.error("[Emigration.lens] createLensButton failed", e);
    }
  }

  /** No-op lifecycle hook. */
  beforeDetach() {}

  /** No-op lifecycle hook. */
  afterDetach() {}
}

/** Toggle the ethnicity lens on/off (Shift+E); falls back to the default lens when off. */
function toggleLens() {
  try {
    const cur = LensManager.getActiveLens ? LensManager.getActiveLens() : void 0;
    LensManager.setActiveLens(cur === LENS ? "fxs-default-lens" : LENS);
  } catch (_) {
    /* ignore */
  }
}

/**
 * Repaint the open lens when the ledger has changed since it last painted. The lens otherwise paints only when
 * LensManager applies it, so one left open across End Turn kept last turn's colours until it was toggled
 * (ethnicity audit item O1). Painting the layer from outside LensManager's apply call does show on the map, from
 * a timer and from inside a PlayerTurnActivated handler (mod test 148).
 * @param {EthnicityLensLayer} layer The registered layer.
 */
function repaintIfStale(layer) {
  try {
    if (LensManager.activeLens !== LENS) return;
    if (_paintCache && _paintCache.turn === lensTurn()) return;
    layer.applyLayer();
  } catch (e) {
    console.error("[Emigration.lens] repaint failed", e);
  }
}

/**
 * Check for a new ledger after the local player's turn starts. The mod's pass runs inside its own handler for
 * the same event, and handler order is not guaranteed, so the check runs after the event's handlers have
 * finished and once more a little later.
 * @param {EthnicityLensLayer} layer The registered layer.
 */
function repaintAfterPasses(layer) {
  try {
    engine.on("PlayerTurnActivated", (/** @type {*} */ d) => {
      const who = d && (d.player ?? d.Player);
      if (who !== GameContext.localPlayerID) return;
      setTimeout(() => repaintIfStale(layer), 0);
      setTimeout(() => repaintIfStale(layer), 3000);
    });
  } catch (e) {
    console.error("[Emigration.lens] turn hook failed", e);
  }
}

// ── Self-registration (runs on UIScript load, in the HUD context) ──────────────────────
try {
  const layer = new EthnicityLensLayer();
  LensManager.registerLensLayer(LAYER, layer);
  repaintAfterPasses(layer);
  LensManager.registerLens(LENS, new EthnicityLens());
} catch (e) {
  console.error("[Emigration.lens] ethnicity registration failed", e);
}
try {
  if (typeof Controls !== "undefined" && typeof Controls.decorate === "function") {
    Controls.decorate("lens-panel", (/** @type {*} */ c) => new EthnicityLensPanelDecorator(c));
  }
} catch (e) {
  console.error("[Emigration.lens] ethnicity lens-panel decorate failed", e);
}
try {
  window.addEventListener("keydown", (/** @type {*} */ ev) => {
    if (ev && ev.shiftKey && (ev.key === "E" || ev.key === "e")) toggleLens();
  });
} catch (_) {
  /* ignore */
}
