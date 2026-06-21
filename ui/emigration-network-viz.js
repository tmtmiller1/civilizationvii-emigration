// emigration-network-viz.js
//
// Orchestrates the destination-cluster migration view on a 2D canvas: a light force layout
// (emigration-network-sim.js) spreads the destination clusters apart; each cluster is a swarm of
// origin-coloured dots (emigration-network-paint.js) where one dot is a SCALED chunk of migrants;
// plus the chrome , an origin colour key, cause-filter chips, a timeline scrubber, click-to-isolate
// a destination, and hover tooltips.

import { formatPeople } from "/emigration/ui/emigration-population.js";
import { causeLabel } from "/emigration/ui/emigration-causes.js";
import { seedSim, stepSim } from "/emigration/ui/emigration-network-sim.js";
import {
  paint, civColorByIndex, CAUSE_PALETTE, MOVE_PALETTE
} from "/emigration/ui/emigration-network-paint.js";
import { buildChronoDots, totalPeople, totalPoints } from "/emigration/ui/emigration-network-dots.js";
import {
  getNumberMode,
  setNumberMode,
  NumberMode,
  getSampleData
} from "/emigration/ui/emigration-settings.js";
import { civDisplayColor } from "/emigration/ui/emigration-civ-colors.js";
import { makeTimeline } from "/emigration/ui/emigration-network-timeline.js";
import { makeTooltip, wireEvents } from "/emigration/ui/emigration-network-interact.js";

// Logical canvas size , a WIDE 2:1 rectangle so the draggable area spans the full window width
// (nodes seed clustered in the centre; the buffer is 2x these for crispness).
export const WX = 1120;
export const WY = 560;
// Scaled Pop mode: a FIXED people-per-dot so the dot count tracks REAL population size (a bigger civ /
// a bigger migration = more dots), rather than always squeezing the whole world into a fixed budget.
// Capped at SCALED_DOT_CAP so a huge late-game world can't spawn an unrenderable number of dots — past
// the cap the people-per-dot coarsens to hold the count. (Civ Pop mode stays 1 dot = 1 engine point.)
const SCALED_PEOPLE_PER_DOT = 2000;
const SCALED_DOT_CAP = 2000;

/**
 * @typedef {import("/emigration/ui/emigration-network-dots.js").Dot} Dot
 * @typedef {import("/emigration/ui/emigration-network-dots.js").Frame} Frame
 * @typedef {import("/emigration/ui/emigration-network-dots.js").Network} Network
 * @typedef {import("/emigration/ui/emigration-network-dots.js").NetworkNode} NetworkNode
 */
/**
 * @typedef {Object} VizState The shared interaction state.
 * @property {Set<string>} causes Isolated migrant causes (multi-select; empty = all).
 * @property {number|null} origin Isolated origin civ id, or null.
 * @property {number|null} focusDest Isolated destination civ id, or null.
 * @property {string|null} scope Isolated movement scope, or null.
 * @property {{resident:boolean, internal:boolean, immigrant:boolean}} show Per-scope visibility.
 * @property {boolean} showFlows Whether origin→destination flow lines are drawn.
 * @property {string} lens Active colour lens ("origin" | "cause" | "movement").
 * @property {number} frameIdx Current timeline frame index.
 */
/**
 * @typedef {Object} EventSpec A resolved timeline event (disaster/war).
 * @property {string} kind @property {string} label @property {number} from @property {number} to
 * @property {number[]} civs Affected civ ids. @property {number[]} cis Affected centre indices.
 */
/**
 * @typedef {Object} Scene The render scene the painter consumes.
 * @property {number} WX Logical canvas width. @property {number} WY Logical canvas height.
 * @property {NetworkNode[]} centers Civ centres.
 * @property {Dot[]} dots All dots (across the whole timeline).
 * @property {VizState} state Interaction state.
 * @property {Map<number,number>} byId Civ id → centre index.
 * @property {EventSpec[]} events Resolved events.
 */

/**
 * Make an element with an optional class + text.
 * @param {string} tag Tag.
 * @param {string} [cls] Class.
 * @param {string} [text] Text.
 * @returns {HTMLElement} Element.
 */
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/**
 * Localize a LOC key, falling back to `fallback` (off-engine or unresolved). Substitutes {1_X}
 * placeholders with `args` on both paths (Locale.compose in-game, manual on the fallback).
 * @param {string} key LOC key.
 * @param {string} fallback English fallback (may contain {1_X} placeholders).
 * @param {...*} args Substitution args.
 * @returns {string} The localized (or fallback) string.
 */
function loc(key, fallback, ...args) {
  try {
    if (typeof Locale !== "undefined" && Locale.compose) {
      const v = Locale.compose(key, ...args);
      if (typeof v === "string" && v && !v.startsWith("LOC_")) return v;
    }
  } catch (_) {
    /* ignore */
  }
  return String(fallback).replace(/\{(\d+)_[A-Za-z]+\}/g, (/** @type {string} */ m, /** @type {string} */ n) => {
    const a = args[Number(n) - 1];
    return a == null ? m : String(a);
  });
}

// Canvas + controls stylesheet, injected once (module-scope so injectStyle stays small).
const NETC_CSS =
    ".emig-netc-wrap{position:relative;display:flex;flex-direction:column;align-items:center;}" +
    ".emig-netc-time-note{align-self:center;margin:0.5rem 0;font-size:0.82rem;opacity:0.6;" +
    "font-style:italic;color:#e5d2ac;text-align:center;max-width:34rem;}" +
    // The canvas fills its stage, which is a full-width 2:1 box (padding-bottom gives it a real
    // height so the canvas's height:100% resolves , GameFace won't derive height from the buffer).
    ".emig-netc-stage{position:relative;width:100%;max-width:120rem;margin:0 auto;}" +
    ".emig-netc-stage::before{content:'';display:block;padding-bottom:50%;}" +
    ".emig-netc{position:absolute;top:0;left:0;width:100%;height:100%;display:block;}" +
    ".emig-netc-chips{display:flex;flex-wrap:wrap;gap:0.4rem;justify-content:center;margin:0.1rem 0 0.4rem;}" +
    ".emig-netc-chip{cursor:pointer;padding:0.16rem 0.7rem;border-radius:0.9rem;font-size:0.92rem;" +
    "border:0.0555rem solid rgba(229,210,172,0.35);color:#e5d2ac;background:rgba(229,210,172,0.06);}" +
    ".emig-netc-chip.active{background:#f3c34c;color:#1c1408;border-color:#f3c34c;font-weight:bold;}" +
    ".emig-lens-lbl{align-self:center;font-size:0.9rem;opacity:0.7;margin-right:0.2rem;" +
    "text-transform:uppercase;letter-spacing:0.04rem;}" +
    ".emig-lens-sep{width:0.0555rem;align-self:stretch;background:rgba(229,210,172,0.25);margin:0 0.1rem;}" +
    ".emig-legend{display:flex;flex-wrap:wrap;gap:0.25rem 0.9rem;justify-content:center;margin:0.4rem 0;}" +
    ".emig-leg{display:flex;align-items:center;gap:0.35rem;cursor:pointer;font-size:0.92rem;" +
    "color:#cbb994;opacity:0.85;}" +
    ".emig-leg:hover{opacity:1;}.emig-leg.active{color:#f3c34c;opacity:1;font-weight:bold;}" +
    ".emig-sw{width:0.74rem;height:0.74rem;border-radius:50%;display:inline-block;}" +
    ".emig-netc-time{display:flex;flex-direction:column;gap:0.35rem;margin:0.5rem 0;width:86%;}" +
    ".emig-netc-tl{position:relative;background:rgba(8,10,16,0.5);border-radius:0.35rem;" +
    "border:0.0555rem solid rgba(201,162,76,0.35);padding:0.3rem 0.5rem 1.05rem;}" +
    ".emig-netc-ages{display:flex;width:100%;height:1rem;position:relative;z-index:1;}" +
    ".emig-netc-age{flex:1 1 0;text-align:center;font-size:0.82rem;color:#f0dca8;opacity:0.92;" +
    "text-transform:uppercase;letter-spacing:0.06rem;white-space:nowrap;overflow:hidden;}" +
    ".emig-netc-tl input{width:100%;display:block;margin:0.2rem 0 0;background:transparent;" +
    "-webkit-appearance:none;appearance:none;accent-color:#f3c34c;height:0.9rem;cursor:pointer;" +
    "position:relative;z-index:1;}" +
    ".emig-netc-tl input::-webkit-slider-runnable-track{height:0.35rem;border-radius:0.3rem;" +
    "background:rgba(201,162,76,0.3);border:0.0555rem solid rgba(201,162,76,0.5);}" +
    ".emig-netc-tl input::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;" +
    "width:0.9rem;height:0.9rem;border-radius:50%;background:#f3c34c;" +
    "border:0.0833rem solid #1c1408;margin-top:-0.3rem;}" +
    ".emig-netc-marks{position:absolute;left:0.5rem;right:0.5rem;top:0;bottom:0;" +
    "pointer-events:none;z-index:2;}" +
    ".emig-netc-sep{position:absolute;top:0;bottom:0.85rem;width:0.14rem;transform:translateX(-50%);" +
    "background:#d8483f;opacity:0.9;}" +
    ".emig-netc-tick{position:absolute;bottom:0;transform:translateX(-50%);font-size:0.74rem;" +
    "color:#bfae86;white-space:nowrap;}" +
    ".emig-netc-tick::before{content:'';position:absolute;left:50%;top:-0.5rem;width:0.0555rem;" +
    "height:0.35rem;background:rgba(201,162,76,0.5);}" +
    ".emig-netc-ctrl{display:flex;align-items:center;gap:0.5rem;}" +
    ".emig-netc-spacer{flex:1 1 auto;}" +
    ".emig-netc-play{cursor:pointer;color:#f3c34c;font-size:1.15rem;user-select:none;padding:0 0.4rem;}" +
    ".emig-netc-speed{display:flex;gap:0.2rem;}" +
    ".emig-netc-speed .emig-netc-chip{font-size:0.82rem;padding:0.06rem 0.5rem;}" +
    ".emig-netc-time-lbl{font-size:0.95rem;color:#f0dca8;opacity:0.9;min-width:8rem;}" +
    ".emig-netc-tip{position:absolute;pointer-events:none;background:rgba(8,10,16,0.96);" +
    "border:0.0555rem solid rgba(201,162,76,0.5);border-radius:0.3rem;padding:0.3rem 0.55rem;" +
    "font-size:0.9rem;color:#e5d2ac;z-index:60;transform:translate(-50%,-115%);white-space:nowrap;" +
    "display:none;}" +
    ".emig-netc-tip-sw{display:inline-block;width:0.55rem;height:0.55rem;border-radius:50%;" +
    "margin-right:0.3rem;vertical-align:middle;}" +
    ".emig-netc-cap{opacity:0.62;font-size:0.95rem;text-align:center;margin-top:0.35rem;" +
    "max-width:66rem;line-height:1.35;}" +
    // A compact "?" help affordance in the stage corner, replacing the big caption: the explanation
    // lives in a hover popover so it doesn't eat vertical space.
    ".emig-help{position:absolute;top:0.4rem;right:0.4rem;z-index:30;}" +
    '.emig-help-q{width:1.25rem;height:1.25rem;border-radius:50%;border:0.0833rem solid ' +
    "rgba(201,162,76,0.6);background:rgba(9,12,19,0.85);color:#f0bc78;font-size:0.8rem;" +
    'font-family:"TitleFont";display:flex;align-items:center;justify-content:center;cursor:help;}' +
    ".emig-help-pop{display:none;position:absolute;top:1.6rem;right:0;width:24rem;max-width:80vw;" +
    "padding:0.55rem 0.75rem;text-align:left;font-size:0.82rem;line-height:1.42;color:#e8d8b4;" +
    "background:linear-gradient(180deg,rgba(28,32,44,0.98),rgba(9,12,19,0.98));" +
    "border:0.0833rem solid #8c7e62;border-radius:0.25rem;box-shadow:0 0.33rem 1rem rgba(0,0,0,0.7);}" +
    ".emig-help:hover .emig-help-pop{display:block;}";

/** Inject the canvas + controls stylesheet once (idempotent). */
export function injectStyle() {
  if (document.getElementById("emig-netc-style")) return;
  const st = document.createElement("style");
  st.id = "emig-netc-style";
  st.textContent = NETC_CSS;
  (document.head || document.documentElement).appendChild(st);
}

/**
 * Append the "nothing yet" note.
 * @param {HTMLElement} container Card body.
 */
function appendEmpty(container) {
  const note = el("div", "emig-empty",
    loc("LOC_EMIG_NETC_EMPTY", "No cross-civ migration yet ; flows appear once people cross borders."));
  container.appendChild(note);
}

/**
 * Stable civ-id → colour index map across all frames (first-seen order).
 * @param {Frame[]} frames Timeline frames.
 * @returns {Map<number, number>} id → palette index.
 */
export function buildColorMap(frames) {
  /** @type {Map<number, number>} */
  const map = new Map();
  for (const fr of frames) {
    for (const nd of fr.network.nodes) if (!map.has(nd.id)) map.set(nd.id, map.size);
  }
  // Also register ORIGIN civs that appear only as a captured city's residents (not as a node), so
  // their resident dots get a stable colour index rather than falling back to the owner's.
  for (const fr of frames) registerOriginCivs(map, fr.pops || {});
  return map;
}

/**
 * Register every ORIGIN civ that appears in a frame's per-city resident composition.
 * @param {Map<number,number>} map Colour-index map (mutated).
 * @param {Record<number,*>} pops Frame pops (civId → {cities:[{origins:[{civ}]}]}).
 */
function registerOriginCivs(map, pops) {
  for (const k of Object.keys(pops)) {
    for (const c of (pops[+k].cities || [])) {
      for (const o of (c.origins || [])) if (!map.has(o.civ)) map.set(o.civ, map.size);
    }
  }
}

/**
 * The distinct causes present across all frames, in display order.
 * @param {Frame[]} frames Timeline frames.
 * @returns {string[]} Cause keys.
 */
function causesPresent(frames) {
  const order = ["war", "disaster", "unhappiness", "prosperity", "conquest", "other"];
  const seen = new Set();
  for (const fr of frames) {
    for (const e of fr.network.edges) {
      const bc = e.byCause || {};
      for (const c of Object.keys(bc)) if (bc[c] > 0) seen.add(c);
    }
  }
  return order.filter((c) => seen.has(c));
}

/**
 * Create the (2x-resolution) canvas element.
 * @returns {HTMLCanvasElement} The canvas.
 */
function makeCanvas() {
  const cv = document.createElement("canvas");
  cv.className = "emig-netc";
  // Supersample the backing store for crisp text + edges. A flat 2x is too soft on Hi-DPI / large
  // panels (the canvas displays up to ~120rem wide), so scale the backing with devicePixelRatio,
  // clamped to 2..3 to keep per-frame fill cost sane. setupCanvas() reads .width/.height back and
  // applies the matching ctx.scale, so all drawing stays in logical WX/WY coords.
  const dpr = typeof window !== "undefined" && typeof window.devicePixelRatio === "number"
    && window.devicePixelRatio > 0 ? window.devicePixelRatio : 2;
  const f = Math.min(3, Math.max(2, Math.ceil(dpr * 1.5)));
  cv.width = WX * f;
  cv.height = WY * f;
  return cv;
}

/**
 * Build the cluster centres (one per civ) from the final cumulative frame; the force sim settles
 * them once and then freezes (so they never drift → no jitter).
 * @param {*} lastNet Final (cumulative) network.
 * @param {Map<number,number>} colorMap Colour-index map.
 * @returns {{sim:*, byId:Map<number,number>}} Sim + id→index.
 */
export function buildCenters(lastNet, colorMap) {
  const sim = seedSim({ nodes: lastNet.nodes, edges: [] }, WX, WY);
  // In SAMPLE mode the civ ids are synthetic (1..N) and don't map to real players, so reading real
  // banner colours by id gives a meaningless mix (some real civs, some grey). Use the distinct
  // synthetic palette there. Live: each civ's real, readable banner colour.
  let sample = false;
  try {
    sample = getSampleData();
  } catch (_) {
    /* off-engine: treat as live (palette fallback still applies in civDisplayColor) */
  }
  for (const nd of sim.nodes) {
    nd.color = civColorByIndex(colorMap.get(nd.id) || 0);
    // The circle FILL uses the civ's real banner colour (readable on the dark canvas), falling back
    // to the synthetic palette. The dots keep `color` (the palette) for their own scheme.
    nd.fillColor = sample ? nd.color : civDisplayColor(nd.id, nd.color);
  }
  const byId = new Map(sim.nodes.map((n, i) => [n.id, i]));
  return { sim, byId };
}

/**
 * A fly-in starting at a civ's city sub-centre, or null when that city index is unknown.
 * @param {*} center Civ centre.
 * @param {number|undefined} idx City index within the civ.
 * @returns {*} Anim {fromX, fromY, p} or null.
 */
function cityAnimFrom(center, idx) {
  const c = idx != null && center.cities ? center.cities[idx] : null;
  if (!c) return null;
  return { fromX: center.x + (c.sx || 0), fromY: center.y + (c.sy || 0), p: 0 };
}

/**
 * Start a dot's fly-in from where the people actually came from: internal movers travel from their
 * source CITY; immigrants travel from their ORIGIN civ's circle — their origin city sub-cluster when
 * known, else the origin civ's centre. (Residents never animate — the caller skips them so home-grown
 * population materializes in place; see `activate`.)
 * @param {Dot} d Dot.
 * @param {Scene} scene Scene.
 */
export function startAnim(d, scene) {
  const civ = scene.centers[d.ci];
  if (d.scope === "internal") {
    d.anim = cityAnimFrom(civ, d.fromCityIdx) || { fromX: civ.x, fromY: civ.y, p: 0 };
    return;
  }
  // The origin civ's centre. Use nullish-coalescing, NOT `||`: byId.get() returns 0 for the FIRST
  // node, and `0 || d.ci` would collapse to the DESTINATION — so an immigrant from that civ would fly
  // out of the civ it's moving TO and read as that civ's home-grown population. `??` keeps index 0.
  const oi = scene.byId.get(d.originId);
  const oc = scene.centers[oi != null ? oi : d.ci] || civ;
  d.anim = cityAnimFrom(oc, d.fromCivCityIdx) || { fromX: oc.x, fromY: oc.y, p: 0 };
}


/** Lens definitions: which dimension drives the dot colour + the legend. */
// Lens: [stateKey, LOC key, English fallback].
const LENSES = [
  ["origin", "LOC_EMIG_NETC_LENS_ORIGIN", "Origin"],
  ["cause", "LOC_EMIG_NETC_LENS_TYPE", "Type"],
  ["movement", "LOC_EMIG_NETC_LENS_MOVEMENT", "Movement"]
];

// The three movement scopes for the "Movement" lens legend: [scope, LOC key, English fallback].
const MOVE_KEYS = [
  ["resident", "LOC_EMIG_NETC_MOVE_RESIDENTS", "Residents"],
  ["internal", "LOC_EMIG_NETC_MOVE_INTERNAL", "Internal moves"],
  ["immigrant", "LOC_EMIG_NETC_MOVE_IMMIGRANTS", "Immigrants"]
];

// Per-scope show toggles: [scope, LOC key, English fallback].
const SHOW_TOGGLES = [
  ["resident", "LOC_EMIG_NETC_MOVE_RESIDENTS", "Residents"],
  ["internal", "LOC_EMIG_NETC_MOVE_INTERNAL", "Internal moves"],
  ["immigrant", "LOC_EMIG_NETC_MOVE_IMMIGRANTS", "Immigrants"]
];

/**
 * Append the "Show:" toggles , residents / internal movers / immigrants, each independently on or
 * off , so the player can view any combination (e.g. both migrant types without residents).
 * @param {HTMLElement} root The selector row.
 * @param {*} state Interaction state.
 * @param {()=>void} onChange Called after a toggle changes (requests a repaint).
 */
function addScopeToggles(root, state, onChange) {
  root.appendChild(el("span", "emig-lens-sep"));
  root.appendChild(el("span", "emig-lens-lbl", loc("LOC_EMIG_NETC_SHOW", "Show:")));
  for (const [scope, locKey, fallback] of SHOW_TOGGLES) {
    const c = el("div", "emig-netc-chip active", loc(locKey, fallback));
    c.addEventListener("click", () => {
      state.show[scope] = !state.show[scope];
      c.classList.toggle("active", state.show[scope]);
      onChange();
    });
    root.appendChild(c);
  }
}

/**
 * Append an "Origins" toggle: draw lines from each highlighted migrant back to where it came from
 * (its origin civ, or its source city for an internal move).
 * @param {HTMLElement} root The selector row.
 * @param {*} state Interaction state.
 * @param {()=>void} onChange Called after the toggle changes.
 */
function addFlowsToggle(root, state, onChange) {
  root.appendChild(el("span", "emig-lens-sep"));
  const c = el("div", "emig-netc-chip", loc("LOC_EMIG_NETC_ORIGINS", "Origins"));
  c.title = loc("LOC_EMIG_NETC_ORIGINS_TIP", "Show lines to where migrants came from");
  c.addEventListener("click", () => {
    state.showFlows = !state.showFlows;
    c.classList.toggle("active", state.showFlows);
    onChange();
  });
  root.appendChild(c);
}

// Number-mode units toggle (Civ Pop ↔ Scaled Pop), shared with the flow-map view so both surfaces of
// the combined Network tab carry the same "Units:" control.
const UNITS_CYCLE = [NumberMode.CIV, NumberMode.HISTORICAL];
/** @type {Record<number,string>} */
const UNITS_LABEL = { [NumberMode.CIV]: "Civ Pop", [NumberMode.HISTORICAL]: "Scaled Pop" };

/**
 * Append a "Units:" toggle (a labelled chip cycling Civ Pop ↔ Scaled Pop) to a controls row, styled
 * like the network's other labelled toggles. Number mode is a persisted global, and it changes the
 * scene's dot scaling, so a flip rebuilds the whole view via `rebuildAll`.
 * @param {HTMLElement} root The controls row.
 * @param {()=>void} [rebuildAll] Re-render the view after the mode changes.
 * @param {boolean} [withSep] Prepend a separator (true when trailing other toggles; false standalone).
 */
export function appendUnitsToggle(root, rebuildAll, withSep = true) {
  if (withSep) root.appendChild(el("span", "emig-lens-sep"));
  root.appendChild(el("span", "emig-lens-lbl", loc("LOC_EMIG_NETC_UNITS", "Units:")));
  const c = el("div", "emig-netc-chip", UNITS_LABEL[getNumberMode()] || "Scaled Pop");
  c.title = loc("LOC_EMIG_NETC_UNITS_TIP", "Switch between the Civ's own population numbers and scaled people");
  c.addEventListener("click", () => {
    const i = UNITS_CYCLE.indexOf(/** @type {*} */ (getNumberMode()));
    setNumberMode(UNITS_CYCLE[(i + 1) % UNITS_CYCLE.length]);
    if (typeof rebuildAll === "function") rebuildAll();
  });
  root.appendChild(c);
}

/**
 * Build the lens selector (Color by: Origin / Type / Movement) plus the Show + Origins + Units toggles.
 * @param {*} state Interaction state.
 * @param {()=>void} onChange Called after the lens (or toggle) changes.
 * @param {()=>void} [rebuildAll] Full re-render (for the Units toggle, which rescales the scene).
 * @returns {HTMLElement} The selector row.
 */
function makeLensTabs(state, onChange, rebuildAll) {
  const root = el("div", "emig-netc-chips");
  root.appendChild(el("span", "emig-lens-lbl", loc("LOC_EMIG_NETC_COLORBY", "Color by:")));
  /** @type {{key:string, el:HTMLElement}[]} */
  const chips = [];
  for (const [key, locKey, fallback] of LENSES) {
    const c = el("div", "emig-netc-chip" + (key === "origin" ? " active" : ""), loc(locKey, fallback));
    c.addEventListener("click", () => {
      state.lens = key;
      chips.forEach((x) => x.el.classList.toggle("active", x.key === key));
      onChange();
    });
    root.appendChild(c);
    chips.push({ key, el: c });
  }
  addScopeToggles(root, state, onChange);
  addFlowsToggle(root, state, onChange);
  appendUnitsToggle(root, rebuildAll);
  return root;
}

/**
 * Append one legend swatch+label that toggles a filter on click.
 * @param {HTMLElement} box Legend box.
 * @param {string} color Swatch colour.
 * @param {string} label Text.
 * @param {boolean} active Whether currently isolated.
 * @param {()=>void} onClick Toggle handler.
 */
function addLeg(box, color, label, active, onClick) {
  const chip = el("div", "emig-leg" + (active ? " active" : ""));
  const sw = el("span", "emig-sw");
  sw.style.backgroundColor = color;
  chip.appendChild(sw);
  chip.appendChild(el("span", "emig-leg-name", label));
  chip.addEventListener("click", onClick);
  box.appendChild(chip);
}

/**
 * Fill the legend for the active lens (a colour key whose items isolate that dimension on click;
 * isolations across lenses stack via the shared state).
 * @param {HTMLElement} box Legend box.
 * @param {{net:*, colorMap:Map<number,number>, causes:string[]}} ctx Legend data.
 * @param {*} state Interaction state.
 * @param {()=>void} rebuild Re-render the legend.
 */
function fillLegend(box, ctx, state, rebuild) {
  if (state.lens === "cause") {
    for (const c of ctx.causes) {
      const col = CAUSE_PALETTE[c] || CAUSE_PALETTE.other;
      addLeg(box, col, causeLabel(c), state.causes.has(c), () => {
        if (state.causes.has(c)) state.causes.delete(c); // multi-select: toggle each cause
        else state.causes.add(c);
        rebuild();
      });
    }
    return;
  }
  if (state.lens === "movement") {
    for (const [key, locKey, fallback] of MOVE_KEYS) {
      addLeg(box, MOVE_PALETTE[key], loc(locKey, fallback), state.scope === key, () => {
        state.scope = state.scope === key ? null : key;
        rebuild();
      });
    }
    return;
  }
  // Origin lens: every civ has its own-colour residents, so the key lists them all.
  for (const o of ctx.net.nodes) {
    addLeg(box, civColorByIndex(ctx.colorMap.get(o.id) || 0), o.name, state.origin === o.id, () => {
      state.origin = state.origin === o.id ? null : o.id;
      rebuild();
    });
  }
}

/**
 * Build the lens-aware colour key (rebuildable when the lens changes).
 * @param {*} net Network model.
 * @param {Map<number,number>} colorMap Colour-index map.
 * @param {*} state Interaction state.
 * @param {string[]} causes Causes present.
 * @param {()=>void} markDirty Request a canvas repaint (filters changed).
 * @returns {{box:HTMLElement, rebuild:()=>void}} Legend handle.
 */
function makeLegendBox(net, colorMap, state, causes, markDirty) {
  const box = el("div", "emig-legend");
  const ctx = { net, colorMap, causes };
  const rebuild = () => {
    box.innerHTML = "";
    fillLegend(box, ctx, state, rebuild);
    markDirty();
  };
  rebuild();
  return { box, rebuild };
}

/**
 * A compact "?" help affordance whose explanation appears on hover (so it doesn't take a big caption's
 * worth of vertical space). Drop it into a `position:relative` container (e.g. the canvas stage).
 * @param {string} text The help text.
 * @returns {HTMLElement} The help element.
 */
export function helpIcon(text) {
  const wrap = el("div", "emig-help");
  wrap.appendChild(el("div", "emig-help-q", "?"));
  wrap.appendChild(el("div", "emig-help-pop", text));
  return wrap;
}

/**
 * Assemble the chrome (cause chips, canvas, origin key, timeline) into the wrapper. The old verbose
 * caption is now a hover-only "?" in the stage corner (helpIcon), reclaiming the vertical space.
 * @param {*} parts {wrap, chipsRoot, canvas, legend, slider, unit}.
 */
function mountChrome(parts) {
  parts.wrap.appendChild(parts.lensTabs);
  const stage = el("div", "emig-netc-stage");
  stage.appendChild(parts.canvas);
  const capEn =
    "Each dot ≈ {1_People} people. A circle is one civilization, holding its cities and towns; its " +
    "dots are home-grown residents (its own colour), people who moved between its cities (a lighter " +
    "tint), and immigrants (their origin's colour). Recolour with \"Color by\", filter with the " +
    "Show/Origins toggles, click a swatch or circle to isolate it, and press ▶ or scrub the " +
    "timeline to replay history.";
  stage.appendChild(helpIcon(loc("LOC_EMIG_NETC_CAPTION", capEn, formatPeople(parts.unit))));
  parts.wrap.appendChild(stage);
  parts.wrap.appendChild(parts.legend);
  if (parts.slider) parts.wrap.appendChild(parts.slider);
}


const ANIM_STEP = 0.045; // per-frame progress for a new dot flying into its cluster
const PLAY_INTERVAL = 42; // rAF ticks between timeline frames while playing (~0.7s)

/**
 * Advance new-dot fly-in animations one frame (scaled by the playback speed multiplier).
 * @param {*} scene Scene.
 * @param {number} mul Speed multiplier.
 * @returns {boolean} True if any dot is still animating.
 */
function advanceAnims(scene, mul) {
  const step = ANIM_STEP * mul;
  let active = false;
  for (const d of scene.dots) {
    if (d.anim && d.anim.p < 1) {
      d.anim.p = Math.min(1, d.anim.p + step);
      active = true;
    }
  }
  return active;
}

/**
 * Whether the canvas needs repainting this tick: layout still settling, dots animating, playback
 * running, or an interaction flagged it dirty. Idle (none of these) → skip the repaint.
 * @param {*} holder Render holder.
 * @param {boolean} settling Sim still cooling.
 * @param {boolean} animating Any dot mid fly-in.
 * @returns {boolean} True to repaint.
 */
function needsPaint(holder, settling, animating) {
  return settling || animating || !!(holder.pb && holder.pb.playing) || holder.dirty;
}

/**
 * Run the animation loop: step layout, advance fly-ins, drive playback, repaint when needed.
 * Stops when detached.
 * @param {HTMLCanvasElement} canvas Canvas.
 * @param {CanvasRenderingContext2D} ctx Context.
 * @param {*} holder {sim, scene, tickPlayback}.
 */
function runLoop(canvas, ctx, holder) {
  const raf = /** @type {*} */ (globalThis).requestAnimationFrame;
  const tick = () => {
    if (!document.contains(canvas)) return;
    const settling = holder.sim.alpha > 0.02;
    if (settling) stepSim(holder.sim); // settle once, then freeze (no jitter)
    const animating = advanceAnims(holder.scene, (holder.pb && holder.pb.speedMul) || 1);
    if (holder.tickPlayback) holder.tickPlayback();
    if (needsPaint(holder, settling, animating)) {
      paint(ctx, holder.scene);
      holder.dirty = false;
    }
    if (raf) raf(tick);
  };
  if (raf) raf(tick);
  else paint(ctx, holder.scene);
}

/**
 * Create the 2x canvas + scaled 2D context (ctx is null if the environment has no 2D context).
 * @returns {{canvas:HTMLCanvasElement, ctx:CanvasRenderingContext2D|null}} Canvas + context.
 */
export function setupCanvas() {
  const canvas = makeCanvas();
  const ctx = canvas.getContext("2d");
  if (ctx) ctx.scale(canvas.width / WX, canvas.height / WY);
  return { canvas, ctx };
}

/**
 * Wire the playback driver: build the timeline and the per-tick frame-advance, stored on holder.
 * @param {*[]} frames Frames.
 * @param {*} holder Render holder (gets `tickPlayback`).
 * @param {(i:number)=>void} activate Apply a frame.
 * @returns {*} The timeline handle (or null for a single frame).
 */
function setupPlayback(frames, holder, activate) {
  /** @type {*} */
  const pb = { playing: false, ticks: 0, idx: frames.length - 1, speedMul: 1 };
  holder.pb = pb;
  const timeline = makeTimeline(frames, pb, activate);
  holder.tickPlayback = () => {
    if (!timeline || !pb.playing) return;
    const interval = Math.max(4, Math.round(PLAY_INTERVAL / (pb.speedMul || 1)));
    if (++pb.ticks < interval) return;
    pb.ticks = 0;
    if (pb.idx + 1 >= frames.length) timeline.setPlaying(false);
    else timeline.goTo(pb.idx + 1);
  };
  activate(pb.idx); // initial reveal: animate the latest frame's arrivals so they fly in on open
  return timeline;
}

/**
 * Resolve event specs (civ ids) to scene events (centre indices), dropping civs with no cluster.
 * @param {*[]} events Event specs.
 * @param {Map<number,number>} byId id → centre index.
 * @returns {EventSpec[]} Resolved events.
 */
export function resolveEvents(events, byId) {
  return (events || []).map((/** @type {*} */ ev) => ({
    kind: ev.kind, label: ev.label, from: ev.from, to: ev.to, civs: ev.civs || [],
    cis: (ev.civs || []).map((/** @type {number} */ id) => byId.get(id))
      .filter((/** @type {*} */ ci) => ci != null)
  }));
}

/**
 * Tag each migrant dot with the disaster/war it fled (matching cause + an affected origin civ), so
 * the painter can ring that cohort while the event's label is on the timeline.
 * @param {Dot[]} dots Dots.
 * @param {EventSpec[]} events Resolved events.
 */
function tagEventDots(dots, events) {
  for (const ev of events) {
    if (ev.kind !== "war" && ev.kind !== "disaster") continue;
    const origins = new Set(ev.civs);
    for (const d of dots) {
      if (d.scope !== "immigrant" || d.cause !== ev.kind || !origins.has(d.originId)) continue;
      d.evKind = ev.kind;
      d.evFrom = ev.from;
      d.evTo = ev.to;
    }
  }
}

/**
 * Build the force layout, the chronological dot set, and the scene for a set of frames. One
 * people-per-dot unit is derived from the final total (residents + arrivals); the unit reported to
 * the caption is recomputed from the dots ACTUALLY drawn, so it matches what's on screen.
 * @param {Frame[]} frames Usable timeline frames.
 * @param {Map<number,number>} colorMap Colour-index map.
 * @param {*[]} events Event specs.
 * @returns {*} {sim, byId, state, scene, shownUnit, lastNet}.
 */
function buildScene(frames, colorMap, events) {
  const lastFrame = frames[frames.length - 1];
  const lastNet = lastFrame.network;
  const total = totalPeople(lastNet, lastFrame.pops || {});
  /** @type {*} */
  const state = {
    causes: new Set(), origin: null, focusDest: null, scope: null,
    show: { resident: true, internal: true, immigrant: true }, showFlows: false,
    lens: "origin", frameIdx: frames.length - 1
  };
  const { sim, byId } = buildCenters(lastNet, colorMap);
  // Scaled Pop: a fixed ~SCALED_PEOPLE_PER_DOT people per dot (count tracks real size, capped at
  // SCALED_DOT_CAP). Civ Pop: ~1 dot per civ pop-point (the small "civilization population" reads as
  // one dot each) , set the unit to people-per-point.
  const civMode = getNumberMode() === NumberMode.CIV;
  const points = totalPoints(lastNet, lastFrame.pops || {});
  const unit = civMode
    ? Math.max(1, Math.round((total || 1) / Math.max(1, points)))
    : Math.max(SCALED_PEOPLE_PER_DOT, Math.ceil((total || 1) / SCALED_DOT_CAP));
  const dots = buildChronoDots(frames, sim.nodes, byId, colorMap, unit);
  const shownUnit = Math.max(1, Math.round(total / Math.max(1, dots.length)));
  const evs = resolveEvents(events, byId);
  tagEventDots(dots, evs);
  /** @type {*} */
  const scene = { WX, WY, centers: sim.nodes, dots, state, byId, events: evs, civMode };
  return { sim, byId, state, dots, scene, shownUnit, lastNet, civMode };
}

/**
 * Placeholder shown where the playback scrubber would be, until there's enough recorded migration
 * history to build a timeline (makeTimeline needs >= 2 frames). Keeps the control's slot occupied so
 * the player knows the feature exists and why it isn't there yet.
 * @returns {HTMLElement} The note element.
 */
export function timelineNote() {
  return el("div", "emig-netc-time-note", loc("LOC_EMIG_NETC_TIMELINE_PENDING",
    "Playback timeline appears after a couple of turns, once there's population history to scrub through."));
}

/**
 * Build the full viz (canvas + controls + loop) for a usable set of frames.
 * @param {HTMLElement} container Card body.
 * @param {*[]} frames Usable timeline frames.
 * @param {*[]} events Event specs (disaster/war labels).
 * @param {()=>void} [rebuildAll] Full re-render hook (for the Units toggle, which rescales the scene).
 */
function buildViz(container, frames, events, rebuildAll) {
  const wrap = el("div", "emig-netc-wrap");
  const colorMap = buildColorMap(frames);
  const { canvas, ctx } = setupCanvas();
  if (!ctx) {
    appendEmpty(container);
    return;
  }
  const built = buildScene(frames, colorMap, events);
  const { sim, state, dots, scene, shownUnit, lastNet } = built;
  /** @type {*} */
  const holder = { sim, scene, unit: shownUnit, prevIdx: null, dirty: true };
  const markDirty = () => {
    holder.dirty = true;
  };
  const activate = (/** @type {number} */ i) => {
    // Fly in the MOVERS that first appear at frame `i` (cross-civ immigrants travel from their ORIGIN
    // civ/settlement; internal movers from their source city — see startAnim) — on every activation:
    // continuous playback, a scrub that lands on a frame, AND the initial reveal. Without this, arrivals
    // only animated on a +1 advance, so on load a cross-civ immigrant sat in the destination cluster and
    // read as home-grown. RESIDENTS (home-grown population) are deliberately excluded: they MATERIALIZE
    // in place inside their own city/town rather than flying from the civ's nebulous centre.
    for (const d of dots) {
      if (d.appearFrame === i && d.scope !== "resident") startAnim(d, holder.scene);
      else d.anim = null;
    }
    state.frameIdx = i;
    holder.prevIdx = i;
    markDirty();
  };
  const tip = makeTooltip(wrap);
  const legendBox = makeLegendBox(lastNet, colorMap, state, causesPresent(frames), markDirty);
  const timeline = setupPlayback(frames, holder, activate);
  mountChrome({
    wrap, lensTabs: makeLensTabs(state, legendBox.rebuild, rebuildAll), canvas,
    legend: legendBox.box, slider: (timeline && timeline.root) || timelineNote(), unit: holder.unit
  });
  wireEvents(canvas, holder, state, tip);
  container.appendChild(wrap);
  runLoop(canvas, ctx, holder);
}

/**
 * Render the destination-cluster migration view into `container`.
 * @param {HTMLElement} container Card body.
 * @param {*} section The dashboard section ({network, frames}).
 */
export function renderNetworkViz(container, section) {
  // Drop any prior render (and let its detached-canvas rAF loop stop) before building a fresh one.
  // NB: use removeChild, NOT replaceChildren — Coherent GameFace doesn't implement replaceChildren, so
  // on a re-render (e.g. the Units toggle) the old view would NOT clear and the chrome would double up.
  if (container) while (container.firstChild) container.removeChild(container.firstChild);
  const all = (section && section.frames) || [];
  // Keep any frame with civs to show , a frame can have residents (native population) before any
  // cross-civ migration has happened, so we no longer require edges.
  const frames = all.filter((/** @type {*} */ f) => f.network && f.network.nodes.length);
  if (!frames.length) {
    appendEmpty(container);
    return;
  }
  injectStyle();
  buildViz(container, frames, (section && section.events) || [],
    () => renderNetworkViz(container, section));
}
