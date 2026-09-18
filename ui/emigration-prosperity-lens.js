// emigration-prosperity-lens.js
//
// A map LENS that paints every city's tiles by its PROSPERITY relative to the world average, the
// same score that drives migration (emigration-prosperity.js). Red = below average (a city shedding
// people), grey = about average, green = above average (a magnet). Towns and cities alike; unowned
// tiles are left uncoloured.
//
// Follows the base-game + community lens pattern (see general-appeal-layer.js and the "More Lenses"
// mod): a self-registering UIScript that builds an overlay group of plot fills, registers a lens
// layer + lens with LensManager, and decorates the `lens-panel` to add a "Prosperity" radio button
// next to the built-in lenses. Loaded as its OWN <UIScripts> entry (NOT imported by the gameplay
// bootstrap), so it runs in the HUD context where LensManager/WorldUI live and a failure here can
// never break the rest of the mod. The HexToFloat4 colour + HEX_GRID priority are inlined so the
// only base-game import is LensManager.

import LensManager from "/core/ui/lenses/lens-manager.js";
import { collectCitySignals } from "/emigration/ui/emigration-cities.js";
import { fieldContext, prosperity } from "/emigration/ui/emigration-prosperity.js";
import { civHidden } from "/emigration/ui/emigration-governance.js";
import { setBasePlotTooltipHidden } from "/emigration/ui/emigration-plot-tooltip-suppress.js";
import { CONFIG } from "/emigration/ui/emigration-config.js";
import { refugeePoolTotal } from "/emigration/ui/emigration-refugee-pool.js";
import { clamp, plotsOf, cityTileTiers, cityLandmarks, tierFill, landmarkFill } from "/emigration/ui/emigration-tile-score.js";

const LENS = "emig-prosperity-lens";
const LAYER = "emig-prosperity-layer";
const HEX_GRID = 1; // OVERLAY_PRIORITY.HEX_GRID, inlined
const HOLD_MARKER_LOW = { x: 0.39, y: 0.78, z: 0.85, w: 0.88 };
const HOLD_MARKER_MED = { x: 0.96, y: 0.71, z: 0.26, w: 0.9 };
const HOLD_MARKER_HIGH = { x: 0.92, y: 0.35, z: 0.35, w: 0.92 };

/**
 * Each city's prosperity normalized to a [-1, 1] deviation from the world mean (so the gradient
 * saturates at the most and least prosperous cities). Empty if no cities are observable.
 * @returns {{city:*, t:number}[]} Per-city {city, deviation}.
 */
function cityTiers() {
  let signals = [];
  try {
    signals = collectCitySignals() || [];
  } catch (_) {
    return [];
  }
  if (!signals.length) return [];
  // The field (mean/spread) is computed over EVERY civ so a visible city is colored by its true
  // global standing, but only civs the visibility policy permits are PAINTED, otherwise toggling
  // this lens would reveal unmet civs' settlement locations + prosperity. Mirrors the ethnicity lens
  // (emigration-ethnicity-lens.js), which skips hidden owners for the same spoiler-protection reason.
  const ctx = fieldContext(signals);
  const rows = signals.map((s) => ({ owner: s.owner, city: s.city, p: prosperity(s, ctx) }));
  const mean = rows.reduce((a, r) => a + r.p, 0) / rows.length;
  let spread = 0;
  for (const r of rows) spread = Math.max(spread, Math.abs(r.p - mean));
  return rows
    .filter((r) => !civHidden(r.owner))
    .map((r) => ({ city: r.city, t: spread > 0 ? clamp((r.p - mean) / spread, -1, 1) : 0 }));
}

/**
 * Per-PLOT prosperity tiers: every visible city's plots scored by tile yield output and normalized
 * WITHIN THEIR OWN CITY, so a tile reads against its city's own best and worst rather than against the
 * whole map. Scaling every tile to the world's most extreme plot left 94% of tiles inside 15% of the
 * mean and 1120 of 1775 in one grey bucket (mod test 77). Empty (→ per-city fallback) with no per-plot
 * yields.
 * @returns {{x:number, y:number, t:number}[]} Per-plot {x, y, deviation}.
 */
function plotTiers() {
  let signals = [];
  try {
    signals = collectCitySignals() || [];
  } catch (_) {
    return [];
  }
  /** @type {{x:number, y:number, t:number}[]} */
  const out = [];
  for (const s of signals) {
    if (!civHidden(s.owner)) out.push(...cityTileTiers(s.city));
  }
  return out;
}

/**
 * Every visible settlement's landmark plots (its wonders): painted in one amber, over whatever the yield scale
 * painted, because a wonder's worth is not its tile yield (emigration-tile-score.js, `landmarkAt`).
 * @returns {{x:number, y:number}[]} Landmark plots.
 */
function plotLandmarks() {
  let signals = [];
  try {
    signals = collectCitySignals() || [];
  } catch (_) {
    return [];
  }
  /** @type {{x:number, y:number}[]} */
  const out = [];
  for (const s of signals) {
    if (!civHidden(s.owner)) out.push(...cityLandmarks(s.city));
  }
  return out;
}

/** @param {*} s @returns {{x:number,y:number,pool:number}|null} */
function markerEntry(s) {
  if (!s || civHidden(s.owner)) return null;
  const pool = refugeePoolTotal(s.key);
  if (!(pool > 0)) return null;
  const loc = s.city && s.city.location;
  if (!loc || typeof loc.x !== "number" || typeof loc.y !== "number") return null;
  return { x: loc.x, y: loc.y, pool };
}

/** @param {number} pool @returns {"low"|"medium"|"high"} */
function markerBucket(pool) {
  if (pool >= 8) return "high";
  if (pool >= 4) return "medium";
  return "low";
}

/**
 * Group visible city-center plots by holding-pool severity.
 * @returns {{low:{x:number,y:number}[], medium:{x:number,y:number}[], high:{x:number,y:number}[]}} Buckets.
 */
function refugeeMarkerBuckets() {
  /** @type {{low:{x:number,y:number}[], medium:{x:number,y:number}[], high:{x:number,y:number}[]}} */
  const out = { low: [], medium: [], high: [] };
  let signals = [];
  try {
    signals = collectCitySignals() || [];
  } catch (_) {
    return out;
  }
  for (const s of signals) {
    const e = markerEntry(s);
    if (!e) continue;
    out[markerBucket(e.pool)].push({ x: e.x, y: e.y });
  }
  return out;
}

/**
 * Paint city-center markers for active refugee holding pools.
 * @param {*} overlay The prosperity overlay.
 */
function paintRefugeeMarkers(overlay) {
  if (!CONFIG.refugeePoolLensMarkers) return;
  const buckets = refugeeMarkerBuckets();
  if (buckets.low.length) overlay.addPlots(buckets.low, { fillColor: HOLD_MARKER_LOW });
  if (buckets.medium.length) overlay.addPlots(buckets.medium, { fillColor: HOLD_MARKER_MED });
  if (buckets.high.length) overlay.addPlots(buckets.high, { fillColor: HOLD_MARKER_HIGH });
}

/**
 * Paint per-plot tiles, grouping them into a few quantized colour buckets so the overlay takes a
 * handful of addPlots calls instead of one per tile.
 * @param {*} overlay The plot overlay.
 * @param {{x:number, y:number, t:number}[]} tiles Per-plot tiers.
 */
function paintTileBuckets(overlay, tiles) {
  /** @type {Map<number, {x:number, y:number}[]>} */
  const buckets = new Map();
  for (const t of tiles) {
    const q = Math.round(t.t * 10) / 10; // ~21 buckets across [-1, 1]
    let arr = buckets.get(q);
    if (!arr) {
      arr = [];
      buckets.set(q, arr);
    }
    arr.push({ x: t.x, y: t.y });
  }
  for (const [q, plots] of buckets) overlay.addPlots(plots, { fillColor: tierFill(q) });
}

/** The lens layer: an overlay of plot fills coloured by TILE-level prosperity vs the world mean. */
class ProsperityLensLayer {
  constructor() {
    this.group = WorldUI.createOverlayGroup("EmigProsperityOverlay", HEX_GRID);
    this.overlay = this.group.addPlotOverlay();
  }

  /** Clear the overlay. */
  clear() {
    this.group.clearAll();
    this.overlay.clear();
  }

  /** Lens-layer lifecycle: init (no-op; built in the constructor). */
  initLayer() {}

  /** Lens-layer lifecycle: paint plots by TILE-LEVEL prosperity (per-plot yield output), falling back
   *  to one colour per city when per-plot yields aren't available; wonders in the landmark colour over both. */
  applyLayer() {
    this.clear();
    const tiles = plotTiers();
    if (tiles.length) {
      paintTileBuckets(this.overlay, tiles); // tile-by-tile (bucketed to bound overlay calls)
    } else {
      for (const c of cityTiers()) { // fallback: one colour per city
        const plots = plotsOf(c.city);
        if (plots.length) this.overlay.addPlots(plots, { fillColor: tierFill(c.t) });
      }
    }
    // Landmarks after the land, so a wonder plot the per-city fallback painted is re-covered in amber.
    const landmarks = plotLandmarks();
    if (landmarks.length) this.overlay.addPlots(landmarks, { fillColor: landmarkFill() });
    paintRefugeeMarkers(this.overlay);
    // Hide the base plot tooltip while this lens is active so it doesn't clash with the mod's own
    // prosperity panel (emigration-prosperity-tooltip.js).
    setBasePlotTooltipHidden(true);
  }

  /** Lens-layer lifecycle: clear on deactivate + restore the base plot tooltip. */
  removeLayer() {
    this.clear();
    setBasePlotTooltipHidden(false);
  }
}

/** The lens: just our prosperity layer plus the hex grid. */
class ProsperityLens {
  constructor() {
    this.activeLayers = new Set([LAYER, "fxs-hexgrid-layer"]);
    this.allowedLayers = new Set([]);
  }
}

/**
 * Decorates the base `lens-panel` to add a "Prosperity" radio button next to the built-in lenses
 * (the exact hook the community "More Lenses" mod uses).
 */
class ProsperityLensPanelDecorator {
  /** @param {*} component The lens-panel component. */
  constructor(component) {
    this.component = component;
  }

  /** No-op lifecycle hook. */
  beforeAttach() {}

  /** Add the Prosperity lens button once the panel exists. */
  afterAttach() {
    try {
      this.component.createLensButton("LOC_EMIG_LENS_PROSPERITY", LENS, "lens-group");
    } catch (e) {
      console.error("[Emigration.lens] createLensButton failed", e);
    }
  }

  /** No-op lifecycle hook. */
  beforeDetach() {}

  /** No-op lifecycle hook. */
  afterDetach() {}
}

/** Toggle the prosperity lens on/off (Shift+P); falls back to the default lens when off. */
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
  LensManager.registerLensLayer(LAYER, new ProsperityLensLayer());
  LensManager.registerLens(LENS, new ProsperityLens());
} catch (e) {
  console.error("[Emigration.lens] registration failed", e);
}
try {
  if (typeof Controls !== "undefined" && typeof Controls.decorate === "function") {
    Controls.decorate("lens-panel", (/** @type {*} */ c) => new ProsperityLensPanelDecorator(c));
  }
} catch (e) {
  console.error("[Emigration.lens] lens-panel decorate failed", e);
}
try {
  window.addEventListener("keydown", (/** @type {*} */ ev) => {
    if (ev && ev.shiftKey && (ev.key === "P" || ev.key === "p")) toggleLens();
  });
} catch (_) {
  /* ignore */
}
