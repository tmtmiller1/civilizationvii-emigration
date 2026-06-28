// emigration-ethnicity-lens.js
//
// A map LENS that paints every settlement's tiles by the ORIGIN civilization of its population ,
// the "ethnic composition" tracked in emigration-composition.js. Each settlement is rendered as a
// per-tile mosaic (emigration-ethnicity-distribution.js): the dominant origin holds most tiles in its
// banner colour, while each diaspora claims a share-proportional set of tiles spread across the city,
// in its own origin civ's colour. Tile OPACITY ramps with population density (the built-up core reads
// vivid, the rural fringe fainter), with a floor under minority tiles so a diaspora is never lost.
// So a city founded by one civ, half-emptied by war, then captured and regrown shows the captor's
// colour spreading over time as their share rises , the demographic shift, on the map. The full
// per-civ percentage breakdown lives in the city readout (hover/select); this lens is the at-a-
// glance map.
//
// Same self-registering UIScript pattern as emigration-prosperity-lens.js (LensManager layer +
// lens-panel decorate for the radio button, Shift+E hotkey). Loaded as its OWN <UIScripts> entry so
// it runs in the HUD context where LensManager/WorldUI live and can never break the gameplay pass.

import LensManager from "/core/ui/lenses/lens-manager.js";
import { collectCitySignals } from "/emigration/ui/emigration-cities.js";
import { compositionForCity } from "/emigration/ui/emigration-composition.js";
import { civDisplayColor } from "/emigration/ui/emigration-civ-colors.js";
import { civHidden } from "/emigration/ui/emigration-governance.js";
import { setBasePlotTooltipHidden } from "/emigration/ui/emigration-plot-tooltip-suppress.js";
import { distributeTiles } from "/emigration/ui/emigration-ethnicity-distribution.js";
import { scaleCityPopulation } from "/emigration/ui/emigration-population.js";
import { monoTurn } from "/emigration/ui/emigration-migration-stats.js";

const LENS = "emig-ethnicity-lens";
const LAYER = "emig-ethnicity-layer";
const HEX_GRID = 1; // OVERLAY_PRIORITY.HEX_GRID, inlined
const FALLBACK_HEX = "#888888"; // neutral grey when a civ colour can't be resolved
// Per-tile opacity ramps with the tile's POPULATION DENSITY (emigration-ethnicity-distribution): the
// built-up urban core reads vivid, the sparse rural fringe fainter, so a city reads as a textured
// population mosaic rather than a single flat wash. The floor is kept high enough that even a sparse
// fringe tile is clearly tinted — the lens is an ETHNIC map first, a density heat-map second.
const MIN_ALPHA = 0.4;
const MAX_ALPHA = 0.85;
// A non-dominant origin (a settled diaspora) is spread across the city's tiles, including sparse ones
// where a pure density ramp would render it nearly invisible. Floor every minority tile's opacity so
// it always reads as a distinct colour on the map, which is the whole point of the lens — to SEE
// where a minority has taken root, whether downtown or out on the rural fringe.
const MINORITY_ALPHA_FLOOR = 0.62;

// Per-tile density weights by district class — "urban districts have higher populations". A tile's
// final weight is its class weight times a build-up bonus (constructibles on the tile).
const W_CITY_CENTER = 3.6;
const W_URBAN = 2.4;
const W_RURAL = 1.0;
const W_WILDERNESS = 0.4;
const BUILDUP_PER = 0.18; // weight bonus per constructible on the tile…
const BUILDUP_CAP = 4; // …capped, so a wonder-stacked tile doesn't dominate everything

/**
 * Parse a `#RRGGBB` colour into an engine float4 {x,y,z,w} (channels 0-1) at the given alpha.
 * @param {string} hex Colour string.
 * @param {number} alpha Fill alpha (0-1).
 * @returns {{x:number, y:number, z:number, w:number}} Float4 RGBA.
 */
function hexToFloat4(hex, alpha) {
  const m = typeof hex === "string" ? hex.match(/^#?([0-9a-fA-F]{6})/) : null;
  const v = m ? m[1] : "888888";
  // Every channel is clamped to a finite [0,1]: a NaN/out-of-range value reaching the Metal plot
  // overlay is a known crash vector on the Mac build, so never let one through.
  return {
    x: channel(v, 0),
    y: channel(v, 2),
    z: channel(v, 4),
    w: unit(alpha)
  };
}

/**
 * Clamp a number to a finite [0,1] (NaN / non-finite → 0), for overlay-safe colour channels.
 * @param {number} n A value. @returns {number} The clamped value.
 */
function unit(n) {
  return typeof n === "number" && isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}

/**
 * One 0-1 colour channel parsed from a 2-hex pair at offset `i`, finite-guarded.
 * @param {string} v A 6-hex string. @param {number} i The byte offset (0/2/4).
 * @returns {number} The channel in [0,1].
 */
function channel(v, i) {
  return unit(parseInt(v.slice(i, i + 2), 16) / 255);
}

/**
 * The number of constructibles on a tile (its build-up), capped — a denser-built tile holds more
 * people. 0 when unreadable.
 * @param {number} x Plot x. @param {number} y Plot y.
 * @returns {number} Constructible count (0..BUILDUP_CAP-ish, uncapped here; capped by the caller).
 */
function constructibleCount(x, y) {
  try {
    const cs = typeof MapConstructibles !== "undefined" && MapConstructibles.getConstructibles
      ? MapConstructibles.getConstructibles(x, y) : null;
    return Array.isArray(cs) ? cs.length : (cs && typeof cs.length === "number" ? cs.length : 0);
  } catch (_) {
    return 0;
  }
}

/**
 * A tile's district-class base density weight (city centre ≫ urban > rural > wilderness). Defaults to
 * the rural weight when the district can't be read, so an unclassifiable tile still carries people.
 * @param {number} x Plot x. @param {number} y Plot y.
 * @returns {number} The base weight.
 */
function districtWeight(x, y) {
  try {
    const d = typeof Districts !== "undefined" && Districts.getAtLocation
      ? Districts.getAtLocation({ x, y }) : null;
    const t = d ? d.type : null;
    if (t != null && typeof DistrictTypes !== "undefined") {
      if (t === DistrictTypes.CITY_CENTER) return W_CITY_CENTER;
      if (t === DistrictTypes.URBAN) return W_URBAN;
      if (t === DistrictTypes.WILDERNESS) return W_WILDERNESS;
    }
  } catch (_) {
    /* ignore */
  }
  return W_RURAL;
}

/**
 * A settlement's owned tiles with their population-density weights (district class × build-up bonus),
 * for {@link distributeTiles}. Empty when the city has no readable plots.
 * @param {*} city City object.
 * @returns {{x:number, y:number, weight:number}[]} Weighted plots.
 */
function classifyPlots(city) {
  /** @type {{x:number, y:number, weight:number}[]} */
  const out = [];
  try {
    const idx = city && typeof city.getPurchasedPlots === "function" ? city.getPurchasedPlots() : [];
    for (const i of idx || []) {
      const loc = GameplayMap.getLocationFromIndex(i);
      if (!loc) continue;
      const buildUp = 1 + BUILDUP_PER * Math.min(constructibleCount(loc.x, loc.y), BUILDUP_CAP);
      out.push({ x: loc.x, y: loc.y, weight: districtWeight(loc.x, loc.y) * buildUp });
    }
  } catch (_) {
    /* ignore unreadable city */
  }
  return out;
}

/**
 * The settlement's scaled population (people) for the density model. Unseeded (a standing TOTAL, like
 * the rest of the mod's totals), so it stays on the shared base curve.
 * @param {number} points The settlement's population in points.
 * @returns {number} Scaled people.
 */
function scaledPeopleFor(points) {
  try {
    return scaleCityPopulation(points, monoTurn());
  } catch (_) {
    return points * 40000; // rough fallback so density still varies by tile weight
  }
}

/**
 * The float4 fill for one distributed tile: its assigned origin civ's colour (neutral grey when that
 * origin is a policy-hidden civ) at an opacity that ramps with the tile's population density. A tile
 * whose origin is NOT the settlement's dominant civ (a diaspora) is given an opacity floor so its
 * fringe quarter stays clearly visible on the map.
 * @param {{civ:number, density:number}} tile A distributed tile.
 * @param {number} dominantCiv The settlement's dominant origin civ id (-1 when unknown).
 * @returns {{x:number, y:number, z:number, w:number}} Float4 fill.
 */
function tileFill(tile, dominantCiv) {
  const ramp = MIN_ALPHA + (MAX_ALPHA - MIN_ALPHA) * Math.max(0, Math.min(1, tile.density));
  const isMinority = typeof dominantCiv === "number" && dominantCiv >= 0 && tile.civ !== dominantCiv;
  const alpha = isMinority ? Math.max(ramp, MINORITY_ALPHA_FLOOR) : ramp;
  const hex = civHidden(tile.civ) ? FALLBACK_HEX : civDisplayColor(tile.civ, FALLBACK_HEX);
  return hexToFloat4(hex, alpha);
}

/**
 * The settlement's dominant origin civ id, or -1 when it can't be read. Tiles whose origin differs
 * from this are diasporas and get a visibility floor in {@link tileFill}.
 * @param {*} comp A composition record. @returns {number} The dominant civ id, or -1.
 */
function dominantCivOf(comp) {
  return comp && comp.dominant && typeof comp.dominant.civ === "number" ? comp.dominant.civ : -1;
}

/**
 * Every observable settlement's PER-TILE paints: each owned tile coloured by the origin civ assigned
 * to it (density-weighted ethnic mosaic) at a population-density opacity. A policy-hidden owner's
 * settlements are skipped entirely (never revealed on the map).
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
    const comp = compositionForCity(s.city);
    if (!comp || !comp.dominant) continue;
    const plots = classifyPlots(s.city);
    if (!plots.length) continue;
    const tiles = distributeTiles(plots, comp, scaledPeopleFor(comp.total));
    const dominantCiv = dominantCivOf(comp);
    for (const t of tiles) out.push({ x: t.x, y: t.y, fill: tileFill(t, dominantCiv) });
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
    // Quantize the alpha into the key so near-identical opacities share a batch (bounded group count).
    const key = f.x + "," + f.y + "," + f.z + ":" + Math.round(f.w * 50);
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
 * The batched per-tile paints, memoized for the current turn: the expensive per-plot Districts /
 * MapConstructibles walk runs once per turn, so toggling the lens off and back on within the same turn
 * (the common case on a big empire) reuses the result instead of re-scanning every owned tile.
 * @returns {*[]} The fill batches.
 */
function cachedBatches() {
  const t = lensTurn();
  if (_paintCache && _paintCache.turn === t) return _paintCache.batches;
  const batches = batchByFill(tilePaints());
  _paintCache = { turn: t, batches };
  return batches;
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

  /** Lens-layer lifecycle: paint every settlement's tiles by per-tile origin + population density. */
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
