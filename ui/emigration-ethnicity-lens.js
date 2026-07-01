// emigration-ethnicity-lens.js
//
// A map LENS that paints every settlement's tiles by the ORIGIN civilization of its population,
// the "ethnic composition" tracked in emigration-composition.js. Each settlement is rendered as a
// per-tile mosaic (emigration-ethnicity-tiles.js + emigration-ethnicity-distribution.js): every owned
// tile carries its OWN local origin mix, and the lens paints each tile a colour BLENDED from its
// origins weighted by their local shares. So a tile that's 60% a diaspora reads 60% of the way toward
// that diaspora's banner colour, an all-dominant tile reads pure dominant, and the colour you see is
// the same per-tile data the hover tooltip lists as percentages. Tile OPACITY ramps with population
// density (the built-up core vivid, the rural fringe fainter).
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

const LENS = "emig-ethnicity-lens";
const LAYER = "emig-ethnicity-layer";
const HEX_GRID = 1; // OVERLAY_PRIORITY.HEX_GRID, inlined
const FALLBACK_HEX = "#888888"; // neutral grey when a civ colour can't be resolved
// Per-tile opacity ramps with POPULATION DENSITY (emigration-ethnicity-tiles): the built-up urban core
// reads vivid, the sparse rural fringe fainter, so a city reads as a textured population mosaic. The
// floor is kept high enough that even a sparse fringe tile is clearly tinted. The ETHNIC information is
// carried by the tile's blended HUE (not opacity), so a diaspora reads by colour at any density.
const MIN_ALPHA = 0.4;
const MAX_ALPHA = 0.85;

/**
 * Clamp a number to a finite [0,1] (NaN / non-finite → 0), for overlay-safe colour channels.
 * @param {number} n A value. @returns {number} The clamped value.
 */
function unit(n) {
  return typeof n === "number" && isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}

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
 * A tile's blended RGB: each origin's banner colour weighted by its LOCAL share on the tile (a
 * policy-hidden origin contributes neutral grey). So the colour directly encodes the tile's mix.
 * @param {{civ:number, share:number}[]} shares The tile's local origin shares.
 * @returns {{r:number, g:number, b:number}} Blended channels in [0,1].
 */
function blendShares(shares) {
  let r = 0;
  let g = 0;
  let b = 0;
  let tot = 0;
  for (const s of shares || []) {
    const hex = civHidden(s.civ) ? FALLBACK_HEX : civDisplayColor(s.civ, FALLBACK_HEX);
    const c = parseRGB(hex);
    const w = s.share > 0 ? s.share : 0;
    r += w * c.r;
    g += w * c.g;
    b += w * c.b;
    tot += w;
  }
  if (!(tot > 0)) return parseRGB(FALLBACK_HEX);
  return { r: r / tot, g: g / tot, b: b / tot };
}

/**
 * The float4 fill for one tile: its origins blended by local share (the mix as a colour) at an opacity
 * that ramps with population density. Every channel is finite-clamped, a NaN reaching the Metal plot
 * overlay is a known Mac crash vector.
 * @param {import("/emigration/ui/emigration-ethnicity-distribution.js").TilePaint} tile A tile.
 * @returns {{x:number, y:number, z:number, w:number}} Float4 RGBA.
 */
function tileFill(tile) {
  const c = blendShares(tile.shares);
  const alpha = MIN_ALPHA + (MAX_ALPHA - MIN_ALPHA) * Math.max(0, Math.min(1, tile.density));
  return { x: unit(c.r), y: unit(c.g), z: unit(c.b), w: unit(alpha) };
}

/**
 * Every observable settlement's PER-TILE paints: each owned tile coloured by its blended local origin
 * mix at a population-density opacity. A policy-hidden owner's settlements are skipped entirely.
 * @returns {{x:number, y:number, fill:{x:number,y:number,z:number,w:number}}[]} Per-tile paints.
 */
function tilePaints() {
  let signals = [];
  try {
    signals = collectCitySignals() || [];
  } catch (_) {
    return [];
  }
  /** @type {{x:number, y:number, fill:*}[]} */
  const out = [];
  for (const s of signals) {
    if (civHidden(s.owner)) continue; // don't reveal a policy-hidden civ's settlements on the map
    const data = tilesForCity(s.city);
    if (!data) continue;
    for (const t of data.tiles) out.push({ x: t.x, y: t.y, fill: tileFill(t) });
  }
  return out;
}

/**
 * Group per-tile paints by fill colour, so the overlay is painted in a handful of addPlots batches
 * (one per distinct colour+opacity) instead of one call per tile.
 * @param {{x:number, y:number, fill:*}[]} paints Per-tile paints.
 * @returns {{fill:*, plots:{x:number,y:number}[]}[]} Batches.
 */
function batchByFill(paints) {
  /** @type {Map<string, {fill:*, plots:{x:number,y:number}[]}>} */
  const groups = new Map();
  for (const p of paints) {
    const f = p.fill;
    // Quantize colour + alpha into the key so near-identical fills share a batch (bounded group count).
    const key = Math.round(f.x * 50) + "," + Math.round(f.y * 50) + "," + Math.round(f.z * 50)
      + ":" + Math.round(f.w * 50);
    let g = groups.get(key);
    if (!g) {
      g = { fill: f, plots: [] };
      groups.set(key, g);
    }
    g.plots.push({ x: p.x, y: p.y });
  }
  return [...groups.values()];
}

/** @type {{turn:number, batches:*[]}|null} Per-turn cache of the batched paints. */
let _paintCache = null;

/** The current game turn for the lens cache key, or -1. @returns {number} The turn. */
function lensTurn() {
  try {
    return typeof Game !== "undefined" && typeof Game.turn === "number" ? Game.turn : -1;
  } catch (_) {
    return -1;
  }
}

/**
 * The batched per-tile paints, memoized for the current turn, so toggling the lens off and back on
 * within the same turn reuses the result instead of re-scanning every owned tile.
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

  /** Lens-layer lifecycle: paint every settlement's tiles by per-tile blended mix + density. */
  applyLayer() {
    this.clear();
    for (const b of cachedBatches()) {
      if (!b.plots.length) continue;
      try {
        this.overlay.addPlots(b.plots, { fillColor: b.fill });
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

// ── Self-registration (runs on UIScript load, in the HUD context) ──────────────────────
try {
  LensManager.registerLensLayer(LAYER, new EthnicityLensLayer());
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
