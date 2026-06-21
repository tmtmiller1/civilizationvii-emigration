// emigration-prosperity-lens.js
//
// A map LENS that paints every city's tiles by its PROSPERITY relative to the world average , the
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
  // The field (mean/spread) is computed over EVERY civ so a visible city is colored by its true
  // global standing, but only civs the visibility policy permits are PAINTED — otherwise toggling
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
 * A city's owned plots as {x, y, idx} (from its purchased plot indices). `idx` lets the tile-level
 * scoring read per-plot yields; `{x, y}` is what the overlay paints.
 * @param {*} city City object.
 * @returns {{x:number, y:number, idx:number}[]} Plot coordinates + index.
 */
function plotsOf(city) {
  /** @type {{x:number, y:number, idx:number}[]} */
  const out = [];
  try {
    const idx = city && typeof city.getPurchasedPlots === "function" ? city.getPurchasedPlots() : [];
    for (const i of idx || []) {
      const loc = GameplayMap.getLocationFromIndex(i);
      if (loc) out.push({ x: loc.x, y: loc.y, idx: i });
    }
  } catch (_) {
    /* ignore unreadable city */
  }
  return out;
}

/**
 * The amount from one `GameplayMap.getYields` entry — defensive across the engine's possible shapes:
 * a [yieldType, amount] tuple (the base UI's shape), a {amount}/{value} object, or a bare number.
 * @param {*} e A yields entry.
 * @returns {number} The numeric amount (0 if unreadable).
 */
function yieldAmount(e) {
  if (typeof e === "number") return isFinite(e) ? e : 0;
  if (Array.isArray(e)) return Number(e[1]) || 0;
  if (e && typeof e === "object") return Number(e.amount ?? e.value ?? 0) || 0;
  return 0;
}

/**
 * A TILE's desirability: the total yield output on that plot (read for the local player), so the lens
 * can shade tile-by-tile instead of one colour per city. Returns null when per-plot yields aren't
 * available (caller falls back to the per-city score).
 * @param {number} idx Plot index.
 * @returns {number|null} The tile score, or null.
 */
function plotScore(idx) {
  try {
    if (typeof GameplayMap === "undefined" || typeof GameplayMap.getYields !== "function") return null;
    const ys = GameplayMap.getYields(idx, GameContext.localPlayerID);
    if (!Array.isArray(ys)) return null;
    let s = 0;
    for (const y of ys) s += yieldAmount(y);
    return s;
  } catch (_) {
    return null;
  }
}

/**
 * Per-PLOT prosperity tiers: every visible city's plots scored by tile yield output and normalized to
 * a [-1, 1] deviation from the world PLOT field. Empty (→ per-city fallback) when no per-plot yields.
 * @returns {{x:number, y:number, t:number}[]} Per-plot {x, y, deviation}.
 */
function plotTiers() {
  let signals = [];
  try {
    signals = collectCitySignals() || [];
  } catch (_) {
    return [];
  }
  /** @type {{owner:number, x:number, y:number, score:number}[]} */
  const all = [];
  for (const s of signals) {
    for (const p of plotsOf(s.city)) {
      const score = plotScore(p.idx);
      if (score !== null) all.push({ owner: s.owner, x: p.x, y: p.y, score });
    }
  }
  if (!all.length) return [];
  const mean = all.reduce((a, r) => a + r.score, 0) / all.length;
  let spread = 0;
  for (const r of all) spread = Math.max(spread, Math.abs(r.score - mean));
  return all
    .filter((r) => !civHidden(r.owner))
    .map((r) => ({ x: r.x, y: r.y, t: spread > 0 ? clamp((r.score - mean) / spread, -1, 1) : 0 }));
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
  for (const [q, plots] of buckets) overlay.addPlots(plots, { fillColor: colorFor(q) });
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
   *  to one colour per city when per-plot yields aren't available. */
  applyLayer() {
    this.clear();
    const tiles = plotTiers();
    if (tiles.length) {
      paintTileBuckets(this.overlay, tiles); // tile-by-tile (bucketed to bound overlay calls)
    } else {
      for (const c of cityTiers()) { // fallback: one colour per city
        const plots = plotsOf(c.city);
        if (plots.length) this.overlay.addPlots(plots, { fillColor: colorFor(c.t) });
      }
    }
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
