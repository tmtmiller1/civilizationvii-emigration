// emigration-ethnicity-lens.js
//
// A map LENS that paints every settlement's tiles by the ORIGIN civilization of its population ,
// the "ethnic composition" tracked in emigration-composition.js. Each settlement is filled with its
// DOMINANT origin civ's banner colour, and the fill INTENSITY (opacity) scales with that civ's
// share of the population: a near-homogeneous city reads vivid, a thoroughly mixed one reads faint.
// So a city founded by one civ, half-emptied by war, then captured and regrown shows the captor's
// colour strengthening over time as their share rises , the demographic shift, on the map. The full
// per-civ percentage breakdown lives in the city readout (hover/select); this lens is the at-a-
// glance heat map.
//
// Same self-registering UIScript pattern as emigration-prosperity-lens.js (LensManager layer +
// lens-panel decorate for the radio button, Shift+E hotkey). Loaded as its OWN <UIScripts> entry so
// it runs in the HUD context where LensManager/WorldUI live and can never break the gameplay pass.

import LensManager from "/core/ui/lenses/lens-manager.js";
import { collectCitySignals } from "/emigration/ui/emigration-cities.js";
import { compositionForCity } from "/emigration/ui/emigration-composition.js";
import { civDisplayColor } from "/emigration/ui/emigration-civ-colors.js";

const LENS = "emig-ethnicity-lens";
const LAYER = "emig-ethnicity-layer";
const HEX_GRID = 1; // OVERLAY_PRIORITY.HEX_GRID, inlined
const FALLBACK_HEX = "#888888"; // neutral grey when a civ colour can't be resolved
// Fill opacity ramps with the dominant civ's share: a 100%-one-origin city is vivid, a barely-
// dominant (heavily mixed) one is faint.
const MIN_ALPHA = 0.28;
const MAX_ALPHA = 0.82;

/**
 * Parse a `#RRGGBB` colour into an engine float4 {x,y,z,w} (channels 0-1) at the given alpha.
 * @param {string} hex Colour string.
 * @param {number} alpha Fill alpha (0-1).
 * @returns {{x:number, y:number, z:number, w:number}} Float4 RGBA.
 */
function hexToFloat4(hex, alpha) {
  const m = typeof hex === "string" ? hex.match(/^#?([0-9a-fA-F]{6})/) : null;
  const v = m ? m[1] : "888888";
  return {
    x: parseInt(v.slice(0, 2), 16) / 255,
    y: parseInt(v.slice(2, 4), 16) / 255,
    z: parseInt(v.slice(4, 6), 16) / 255,
    w: alpha
  };
}

/**
 * The fill colour for a settlement: its dominant origin civ's banner colour at an opacity that
 * scales with that civ's share.
 * @param {{civ:number, share:number}} dominant The dominant origin.
 * @returns {{x:number, y:number, z:number, w:number}} Float4 fill colour.
 */
function fillFor(dominant) {
  const alpha = MIN_ALPHA + (MAX_ALPHA - MIN_ALPHA) * Math.max(0, Math.min(1, dominant.share));
  return hexToFloat4(civDisplayColor(dominant.civ, FALLBACK_HEX), alpha);
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

/**
 * Per-settlement {city, fill} for every observable settlement with a known composition.
 * @returns {{city:*, fill:{x:number,y:number,z:number,w:number}}[]} Paint list.
 */
function cityFills() {
  let signals = [];
  try {
    signals = collectCitySignals() || [];
  } catch (_) {
    return [];
  }
  /** @type {{city:*, fill:*}[]} */
  const out = [];
  for (const s of signals) {
    const comp = compositionForCity(s.city);
    if (comp && comp.dominant) out.push({ city: s.city, fill: fillFor(comp.dominant) });
  }
  return out;
}

/** The lens layer: an overlay of per-settlement plot fills coloured by dominant origin civ. */
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

  /** Lens-layer lifecycle: paint every settlement's tiles by its dominant origin civ. */
  applyLayer() {
    this.clear();
    for (const c of cityFills()) {
      const plots = plotsOf(c.city);
      if (plots.length) this.overlay.addPlots(plots, { fillColor: c.fill });
    }
  }

  /** Lens-layer lifecycle: clear on deactivate. */
  removeLayer() {
    this.clear();
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
