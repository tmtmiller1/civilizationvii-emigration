// emigration-prosperity-lens.js
//
// A map LENS that paints every city's tiles by its PROSPERITY relative to the world average — the
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

const LENS = "emig-prosperity-lens";
const LAYER = "emig-prosperity-layer";
const FILL_ALPHA = 0.6;
const HEX_GRID = 1; // OVERLAY_PRIORITY.HEX_GRID, inlined
// Gradient endpoints (0-255): grey (neutral) → green (above average) / red (below average).
const GREY = [140, 140, 140];
const GREEN = [60, 200, 90];
const RED = [212, 72, 60];

/**
 * Clamp v into [lo, hi].
 * @param {number} v Value. @param {number} lo Min. @param {number} hi Max.
 * @returns {number} Clamped.
 */
function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * A plot fill colour (the engine's float4 {x,y,z,w}) for a normalized prosperity deviation
 * t ∈ [-1, 1]: grey→green for t ≥ 0, grey→red for t < 0.
 * @param {number} t Normalized deviation.
 * @returns {{x:number, y:number, z:number, w:number}} Float4 RGBA (0-1).
 */
function colorFor(t) {
  const to = t >= 0 ? GREEN : RED;
  const k = Math.abs(t);
  const mix = (/** @type {number} */ i) => (GREY[i] + (to[i] - GREY[i]) * k) / 255;
  return { x: mix(0), y: mix(1), z: mix(2), w: FILL_ALPHA };
}

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
  const ctx = fieldContext(signals);
  const rows = signals.map((s) => ({ city: s.city, p: prosperity(s, ctx) }));
  const mean = rows.reduce((a, r) => a + r.p, 0) / rows.length;
  let spread = 0;
  for (const r of rows) spread = Math.max(spread, Math.abs(r.p - mean));
  return rows.map((r) => ({
    city: r.city, t: spread > 0 ? clamp((r.p - mean) / spread, -1, 1) : 0
  }));
}

/**
 * A city's owned plots as {x, y} coordinates (from its purchased plot indices).
 * @param {*} city City object.
 * @returns {{x:number, y:number}[]} Plot coordinates.
 */
function plotsOf(city) {
  /** @type {{x:number, y:number}[]} */
  const out = [];
  try {
    const idx = city && typeof city.getPurchasedPlots === "function" ? city.getPurchasedPlots() : [];
    for (const i of idx || []) {
      const loc = GameplayMap.getLocationFromIndex(i);
      if (loc) out.push({ x: loc.x, y: loc.y });
    }
  } catch (_) {
    /* ignore unreadable city */
  }
  return out;
}

/** The lens layer: an overlay of per-city plot fills coloured by prosperity vs the world mean. */
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

  /** Lens-layer lifecycle: paint every city's tiles by its prosperity tier. */
  applyLayer() {
    this.clear();
    for (const c of cityTiers()) {
      const plots = plotsOf(c.city);
      if (plots.length) this.overlay.addPlots(plots, { fillColor: colorFor(c.t) });
    }
  }

  /** Lens-layer lifecycle: clear on deactivate. */
  removeLayer() {
    this.clear();
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
