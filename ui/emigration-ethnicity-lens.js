// emigration-ethnicity-lens.js
//
// A map LENS that paints every settlement's tiles by the ORIGIN civilization of its population,
// the "ethnic composition" tracked in emigration-composition.js. Each owned tile is drawn two ways at
// once (emigration-ethnicity-tiles.js + emigration-ethnicity-distribution.js supply the per-tile mix):
//   • BORDER — the settlement's MAIN (dominant) origin's banner colour at full strength, so you always
//     read whose city it is regardless of the fill.
//   • FILL — a DIVERGING colour scale on how non-host the tile is: all-host reads the host's colour, a
//     50/50 tile reads GREY (clearly "mixed", never a muddy host tint), and a tile dominated by an
//     incomer reads that origin's colour. A diaspora concentrates into a cluster (distribution model), so
//     its neighbourhood reads grey→other while the rest of the city reads host.
// Tile OPACITY ramps with population density (built-up core vivid, rural fringe faint), normalized per
// city and jittered per tile so a district reads as a textured mosaic. The hover panel gives the numbers.
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
// reads vivid, the sparse rural fringe faint, so a city reads as a textured population mosaic. Opacity
// is normalized PER CITY (each settlement's sparsest tile → MIN_ALPHA, its densest → MAX_ALPHA), so the
// contrast reads dramatically whether the city is a hamlet or a megacity instead of squeezing every
// tile's small absolute density into a narrow band. The ETHNIC information is carried by the tile's
// blended HUE (not opacity), so a diaspora reads by colour at any density.
const MIN_ALPHA = 0.5;
const MAX_ALPHA = 1.0;
// Contrast curve on the per-city normalized density (< 1 lifts the bunched mid/low tiles toward the core
// so the whole city reads BOLD while the densest core still pops to full opacity; > 1 does the reverse).
const OPACITY_CONTRAST = 0.75;
// A deterministic per-tile opacity wobble so a district of identical-density tiles (e.g. a rural belt)
// still reads as a TEXTURED mosaic instead of one flat slab — the mod's "textured population mosaic".
const OPACITY_JITTER = 0.14;
// Each tile's FILL is a diverging colour scale on how non-host the tile is: 0% other → the host's colour,
// 50/50 → grey (a "mixed" tile), 100% other → the other origin's colour. Grey at the midpoint keeps a
// mixed tile from reading as a muddy host-tinted blend. GREY_LEVEL is the midpoint's brightness.
const GREY_LEVEL = 0.5;
// Each tile's BORDER is the settlement's main (dominant) origin colour at full strength, so you always
// read whose city it is regardless of the fill; EDGE_ALPHA is that border's opacity.
const EDGE_ALPHA = 1.0;

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
 * A civ's banner RGB in 0-1 channels (policy-hidden → neutral grey fallback).
 * @param {number} civ Origin civ id. @returns {{r:number, g:number, b:number}} Channels in [0,1].
 */
function civRGB(civ) {
  return parseRGB(civHidden(civ) ? FALLBACK_HEX : civDisplayColor(civ, FALLBACK_HEX));
}

/**
 * Linear interpolate between two RGB colours.
 * @param {{r:number,g:number,b:number}} a From. @param {{r:number,g:number,b:number}} b To.
 * @param {number} k Fraction 0..1. @returns {{r:number,g:number,b:number}} The blend.
 */
function lerpRGB(a, b, k) {
  return { r: a.r + (b.r - a.r) * k, g: a.g + (b.g - a.g) * k, b: a.b + (b.b - a.b) * k };
}

/** A tile origin's local share of the tile, or 0. @param {*[]} shares @param {number} civ @returns {number} */
function shareOf(shares, civ) {
  for (const s of shares || []) if (s.civ === civ) return s.share;
  return 0;
}

/**
 * The tile's largest NON-host origin (its "other" colour), or the host when there is none.
 * @param {{civ:number, share:number}[]} shares The tile's local shares. @param {number} hostCiv The host origin.
 * @returns {number} The other origin's civ id.
 */
function topOther(shares, hostCiv) {
  let best = hostCiv;
  let bestShare = -1;
  for (const s of shares || []) {
    if (s.civ !== hostCiv && s.share > bestShare) {
      bestShare = s.share;
      best = s.civ;
    }
  }
  return best;
}

/**
 * A tile's DIVERGING fill colour: host colour when the tile is all-host, fading to grey at 50% non-host,
 * then to the tile's other origin's colour toward all-other. So a mixed tile reads as a desaturated
 * "grey-ish" tile (clearly not the host), not a muddy host tint.
 * @param {*[]} shares The tile's local shares. @param {number} hostCiv The settlement's main origin.
 * @returns {{r:number, g:number, b:number}} The fill channels in [0,1].
 */
function divergingFill(shares, hostCiv) {
  const t = Math.max(0, Math.min(1, 1 - shareOf(shares, hostCiv)));
  const host = civRGB(hostCiv);
  if (t <= 0) return host;
  const grey = { r: GREY_LEVEL, g: GREY_LEVEL, b: GREY_LEVEL };
  if (t <= 0.5) return lerpRGB(host, grey, t / 0.5);
  return lerpRGB(grey, civRGB(topOther(shares, hostCiv)), (t - 0.5) / 0.5);
}

/**
 * The per-city normalized opacity for a tile's density: the settlement's sparsest tile reads MIN_ALPHA,
 * its densest MAX_ALPHA, with a contrast curve between, so the density gradient reads dramatically at any
 * city size. `minD`/`maxD` are the density range across the settlement's tiles.
 * @param {number} density The tile's density. @param {number} minD City min density. @param {number} maxD City max.
 * @returns {number} The alpha in [MIN_ALPHA, MAX_ALPHA].
 */
function cityAlpha(density, minD, maxD) {
  const span = maxD - minD;
  const norm = span > 1e-6 ? (density - minD) / span : 1;
  const curved = Math.pow(unit(norm), OPACITY_CONTRAST);
  return MIN_ALPHA + (MAX_ALPHA - MIN_ALPHA) * curved;
}

/**
 * A deterministic per-tile opacity wobble in [-OPACITY_JITTER, +OPACITY_JITTER], so identical-density
 * tiles don't render as one flat slab. Stable per coordinate (no RNG), so the texture never flickers.
 * @param {number} x Plot x. @param {number} y Plot y. @returns {number} The alpha offset.
 */
function tileJitter(x, y) {
  const h = (Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263)) >>> 0;
  return ((h % 1024) / 1023 - 0.5) * 2 * OPACITY_JITTER;
}

/**
 * The float4 fill for one tile: its diverging host↔grey↔other colour at a (pre-computed, per-city
 * normalized) opacity. Every channel is finite-clamped, a NaN reaching the Metal plot overlay is a known
 * Mac crash vector.
 * @param {import("/emigration/ui/emigration-ethnicity-distribution.js").TilePaint} tile A tile.
 * @param {number} hostCiv The settlement's main origin (the fill's host anchor).
 * @param {number} alpha The tile's opacity (from cityAlpha).
 * @returns {{x:number, y:number, z:number, w:number}} Float4 RGBA.
 */
function tileFill(tile, hostCiv, alpha) {
  const c = divergingFill(tile.shares, hostCiv);
  return { x: unit(c.r), y: unit(c.g), z: unit(c.b), w: unit(alpha) };
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
    if (civHidden(s.owner)) continue; // don't reveal a policy-hidden civ's settlements on the map
    const data = tilesForCity(s.city);
    if (!data || !data.tiles.length) continue;
    const hostCiv = data.comp && data.comp.dominant ? data.comp.dominant.civ : s.owner;
    const edge = edgeFill(hostCiv);
    // Normalize opacity ACROSS this settlement's tiles so the densest reads full and the sparsest faint,
    // plus a per-tile jitter so a uniform-density district still reads as a textured mosaic.
    const { minD, maxD } = densityRange(data.tiles);
    for (const t of data.tiles) {
      const alpha = cityAlpha(t.density, minD, maxD) + tileJitter(t.x, t.y);
      out.push({ x: t.x, y: t.y, fill: tileFill(t, hostCiv, alpha), edge });
    }
  }
  return out;
}

/**
 * The min/max tile density across a settlement's tiles, for per-city opacity normalization.
 * @param {{density:number}[]} tiles The settlement's tiles.
 * @returns {{minD:number, maxD:number}} The density range.
 */
function densityRange(tiles) {
  let minD = Infinity;
  let maxD = -Infinity;
  for (const t of tiles) {
    if (t.density < minD) minD = t.density;
    if (t.density > maxD) maxD = t.density;
  }
  return { minD, maxD };
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
