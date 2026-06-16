// emigration-window.js
//
// Phase 3 (the in-game-legibility plan, L4): the standalone Emigration dashboard window. Gathers
// the world's migration state and mounts the shared render core (emigration-views.js) in a
// HUD-anchored panel — the rich surface that works even without the Demographics mod (the
// Demographics page, L3/Phase 4, will mount the same render core).
//
// Opened via the console (emigration.window() / emigration.closeWindow()); a HUD launcher button
// is the plan's probe-verification item, so for now the console is the entry point. Display-only
// (pointer-events:none), so closing is also via the console.

import { collectCitySignals } from "/emigration/ui/emigration-cities.js";
import { ownerCitySnapshots } from "/emigration/ui/emigration-city-readout-data.js";
import { borderStance } from "/emigration/ui/emigration-borders.js";
import { civAdjective } from "/emigration/ui/emigration-naming.js";
import { dashboardModel, renderDashboard } from "/emigration/ui/emigration-views.js";

/**
 * The local player id, or null.
 * @returns {number|null} The id.
 */
function localId() {
  try {
    return typeof GameContext !== "undefined" && typeof GameContext.localPlayerID === "number"
      ? GameContext.localPlayerID
      : null;
  } catch (_) {
    return null;
  }
}

/**
 * The player ids currently holding cities (the civs worth listing in the ledger).
 * @returns {number[]} Owner ids.
 */
function inPlayCivs() {
  /** @type {Set<number>} */
  const owners = new Set();
  try {
    for (const s of collectCitySignals()) {
      if (typeof s.owner === "number") owners.add(s.owner);
    }
  } catch (_) {
    /* ignore */
  }
  return [...owners];
}

/**
 * One civ's ledger row: cumulative tallies (from EmigrationData) plus its border stance.
 * @param {number} pid Player id.
 * @returns {*} The ledger row {pid, name, in, out, net, refugees, deaths, stance}.
 */
function civRow(pid) {
  const D = /** @type {*} */ (globalThis).EmigrationData || {};
  const read = (/** @type {string} */ fn) => (typeof D[fn] === "function" ? D[fn](pid) || 0 : 0);
  return {
    pid,
    name: civAdjective(pid),
    in: read("grossInCumFor"),
    out: read("grossOutCumFor"),
    net: read("netCumFor"),
    refugees: read("refugeesCumFor"),
    deaths: read("deathsCumFor"),
    stance: borderStance(pid)
  };
}

/**
 * Aggregate per-cause EMIGRATION across the given civs (the "why people move" breakdown).
 * @param {number[]} pids Player ids.
 * @returns {Record<string, number>} People per cause.
 */
function aggregateByCause(pids) {
  const D = /** @type {*} */ (globalThis).EmigrationData || {};
  /** @type {Record<string, number>} */
  const agg = {};
  if (typeof D.emigrationByCauseFor !== "function") return agg;
  for (const pid of pids) {
    const bc = D.emigrationByCauseFor(pid) || {};
    for (const c of Object.keys(bc)) agg[c] = (agg[c] || 0) + (bc[c] || 0);
  }
  return agg;
}

/**
 * Gather the dashboard inputs: per-civ ledger + stances, the world per-cause breakdown, and the
 * local player's per-city pressure snapshots. Shared by the standalone window and the Demographics
 * page (both mount the same render core).
 * @returns {{civs:*[], byCause:Record<string,number>, cities:*[]}} The inputs.
 */
export function gatherDashboard() {
  const pids = inPlayCivs();
  const me = localId();
  return {
    civs: pids.map(civRow),
    byCause: aggregateByCause(pids),
    cities: me != null ? ownerCitySnapshots(me) : []
  };
}

// Centered, scrollable HUD panel using the same dark-panel tones as the toast/readout.
const WINDOW_CSS =
  ".emig-window{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:100;" +
  "width:32rem;max-height:70vh;overflow:auto;padding:0.9rem 1.2rem;pointer-events:none;" +
  'font-family:"BodyFont","BodyFont-JP","BodyFont-KR","BodyFont-SC","BodyFont-TC";' +
  "font-size:0.85rem;color:#e5d2ac;" +
  "background:linear-gradient(180deg,rgba(18,21,31,0.96) 0%,rgba(5,7,13,0.96) 100%);" +
  "border:0.0555rem solid rgba(229,210,172,0.5);border-radius:0.4rem;" +
  "box-shadow:0 0.3rem 1rem rgba(0,0,0,0.7);}" +
  ".emig-window .emig-win-title{font-weight:bold;font-size:1rem;margin-bottom:0.5rem;}" +
  ".emig-window .emig-win-hint{opacity:0.6;font-size:0.75rem;margin-bottom:0.6rem;}" +
  ".emig-window .emig-dash-h{font-weight:bold;margin:0.5rem 0 0.15rem;color:#f0dca8;}" +
  ".emig-window .emig-dash-row{opacity:0.92;margin:0.05rem 0;}" +
  ".emig-window .emig-dash-empty{opacity:0.5;}";

/** @type {*} */
let _el = null;

/** Inject the window stylesheet once. */
function injectStyle() {
  try {
    if (document.getElementById("emig-window-style")) return;
    const st = document.createElement("style");
    st.id = "emig-window-style";
    st.textContent = WINDOW_CSS;
    document.head.appendChild(st);
  } catch (_) {
    /* ignore */
  }
}

/** The window element, created once. @returns {*} The element. */
function ensureEl() {
  if (!_el) {
    _el = document.createElement("div");
    _el.className = "emig-window";
    _el.id = "emig-window";
  }
  return _el;
}

/**
 * Append a header line (title or hint) to the window.
 * @param {*} el The window element.
 * @param {string} cls The class.
 * @param {string} text The text.
 */
function appendHeader(el, cls, text) {
  const d = document.createElement("div");
  d.className = cls;
  d.textContent = text;
  el.appendChild(d);
}

/**
 * Render the gathered model into the (created-on-demand) window element.
 * @param {{sections:*[]}} model The dashboard model.
 */
function renderWindow(model) {
  try {
    const root = document.body || document.documentElement;
    if (!root) return;
    injectStyle();
    const el = ensureEl();
    el.innerHTML = "";
    appendHeader(el, "emig-win-title", "Migration");
    appendHeader(el, "emig-win-hint", "console: emigration.window() refreshes, .closeWindow() closes");
    const content = document.createElement("div");
    el.appendChild(content);
    renderDashboard(content, model);
    if (!el.parentNode) root.appendChild(el);
  } catch (_) {
    /* ignore */
  }
}

/** Open (or refresh) the standalone Emigration dashboard window. */
export function showWindow() {
  renderWindow(dashboardModel(gatherDashboard()));
}

/** Close the standalone Emigration dashboard window. */
export function hideWindow() {
  try {
    if (_el && _el.parentNode) _el.remove();
  } catch (_) {
    /* ignore */
  }
}

/** Install the window: console commands (the guaranteed entry point). */
export function installEmigrationWindow() {
  try {
    const api = /** @type {*} */ (globalThis).emigration || ((globalThis).emigration = {});
    api.window = () => showWindow();
    api.closeWindow = () => hideWindow();
  } catch (_) {
    /* ignore */
  }
}
