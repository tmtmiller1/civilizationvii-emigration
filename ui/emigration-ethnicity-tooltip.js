// emigration-ethnicity-tooltip.js
//
// Adds an ETHNIC-COMPOSITION section (per-origin-civ percentages, with the same banner-colour
// swatches the Ethnicity lens paints) to the game's plot tooltip — ADDITIVELY, without replacing it,
// so it coexists with the vanilla tooltip and with full-tooltip mods (bz-map-trix, TCS Improved
// Plot Tooltip, …).
//
// Why DOM injection rather than registration: the plot-tooltip registration API
// (TooltipManager.registerPlotType / PlotTooltipPriority) is winner-take-all — each registrant
// supplies a COMPLETE tooltip and the highest priority wins (bz / TCS even detect each other to
// avoid colliding). Registering our own would fight whichever tooltip mod is active, not add to it.
// Instead we watch the rendered tooltip DOM and append one extra section into its `.tooltip__content`
// (the stable base class every implementation builds), re-applying it whenever the tooltip
// re-renders. Other mods appending their own nodes never collide with ours.
//
// Spoiler-safe (same rule as the lens + city readout): a policy-hidden owner shows nothing, and
// hidden origin civs merge into one neutral "Unknown" bucket. Reads only; never touches the pass.
// Loaded as its own <UIScripts> entry so it runs in the HUD context (LensManager + cursor signals)
// and can never break the gameplay loop. Only renders while the Ethnicity lens is the active lens.

import LensManager from "/core/ui/lenses/lens-manager.js";
import { collectCitySignals } from "/emigration/ui/emigration-cities.js";
import { compositionForCity } from "/emigration/ui/emigration-composition.js";
import { civDisplayColor } from "/emigration/ui/emigration-civ-colors.js";
import { civAdjective } from "/emigration/ui/emigration-naming.js";
import { civHidden } from "/emigration/ui/emigration-governance.js";

const LENS = "emig-ethnicity-lens"; // must match emigration-ethnicity-lens.js
const STYLE_ID = "emig-ethtip-style";
const SEC_ID = "emig-eth-sec"; // our injected node's id (idempotency marker)
const FALLBACK_HEX = "#888888"; // neutral grey (matches the lens fallback / masked origins)
const INDEX_TTL = 750; // ms a plot→settlement index is cached before a rebuild
const MAX_ROWS = 6; // cap the breakdown so the section stays compact

const CSS =
  "." + SEC_ID + "{margin-top:0.4rem;padding-top:0.3rem;border-top:0.0555rem solid rgba(201,162,76,0.4);}" +
  "." + SEC_ID + " .h{color:#f3c34c;font-weight:bold;font-size:0.82rem;margin-bottom:0.15rem;}" +
  "." + SEC_ID + " .r{display:flex;align-items:center;gap:0.35rem;line-height:1.5;font-size:0.82rem;}" +
  "." + SEC_ID + " .sw{width:0.6rem;height:0.6rem;border-radius:50%;flex:0 0 auto;display:inline-block;}" +
  "." + SEC_ID + " .pct{margin-left:auto;padding-left:0.6rem;}";

/** @type {MutationObserver|null} */
let _observer = null;
/** @type {string|null} The plot key the section currently describes. */
let _curKey = null;
/** @type {string|null} The section's inner HTML for the current plot (null = nothing to show). */
let _curHTML = null;
/** @type {Map<string, *>|null} */
let _index = null;
let _indexAt = -1e9;

/**
 * Escape a value for safe interpolation into the section HTML.
 * @param {*} s Value.
 * @returns {string} Escaped text.
 */
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Whether the Ethnicity lens is the active lens right now. */
function isLensActive() {
  try {
    return typeof LensManager.getActiveLens === "function" && LensManager.getActiveLens() === LENS;
  } catch (_) {
    return false;
  }
}

/**
 * A city's owned plots as {x, y} (from its purchased plot indices) — same source the lens paints,
 * so the section and the painted tiles always agree on which hex belongs to which settlement.
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
 * A "x,y" → city index over every observable, non-hidden settlement's plots, rebuilt on a short TTL.
 * @returns {Map<string, *>} The index.
 */
function buildIndex() {
  /** @type {Map<string, *>} */
  const m = new Map();
  let signals = [];
  try {
    signals = collectCitySignals() || [];
  } catch (_) {
    return m;
  }
  for (const s of signals) {
    if (!s || typeof s.owner !== "number" || civHidden(s.owner)) continue; // hidden owner: no section
    for (const p of plotsOf(s.city)) m.set(p.x + "," + p.y, s.city);
  }
  return m;
}

/**
 * The settlement owning plot (x,y), or null.
 * @param {number} x Plot x.
 * @param {number} y Plot y.
 * @returns {*} City object or null.
 */
function cityAt(x, y) {
  const now = Date.now();
  if (!_index || now - _indexAt > INDEX_TTL) {
    _index = buildIndex();
    _indexAt = now;
  }
  return _index.get(x + "," + y) || null;
}

/**
 * The display breakdown for a settlement: origin civ adjective + banner colour + share, largest
 * first, with policy-hidden origins merged into a neutral "Unknown" bucket. Null when untracked.
 * @param {*} city City object.
 * @returns {{name:string, color:string, share:number}[]|null} Rows (capped), or null.
 */
function resolveParts(city) {
  const comp = compositionForCity(city);
  if (!comp || !comp.civs || !comp.civs.length) return null;
  /** @type {{name:string, color:string, share:number}[]} */
  const parts = [];
  let unknown = 0;
  for (const c of comp.civs) {
    if (civHidden(c.civ)) unknown += c.share;
    else parts.push({ name: civAdjective(c.civ), color: civDisplayColor(c.civ, FALLBACK_HEX), share: c.share });
  }
  if (unknown > 0) parts.push({ name: "Unknown", color: FALLBACK_HEX, share: unknown });
  parts.sort((a, b) => b.share - a.share);
  return parts.slice(0, MAX_ROWS);
}

/** The localized section header ("Ethnic Composition"), with a plain fallback. */
function headerText() {
  try {
    if (typeof Locale !== "undefined" && typeof Locale.compose === "function") {
      return Locale.compose("LOC_EMIG_LENS_ETHNICITY") || "Ethnic Composition";
    }
  } catch (_) {
    /* ignore */
  }
  return "Ethnic Composition";
}

/**
 * Build the section's inner HTML: a header, then one swatch + name + percent row per origin civ.
 * @param {{name:string, color:string, share:number}[]} parts Breakdown rows.
 * @returns {string} HTML.
 */
function buildSectionHTML(parts) {
  let h = `<div class="h">${esc(headerText())}</div>`;
  for (const p of parts) {
    h += `<div class="r"><span class="sw" style="background:${esc(p.color)}"></span>` +
      `<span class="nm">${esc(p.name)}</span>` +
      `<span class="pct">${Math.round(p.share * 100)}%</span></div>`;
  }
  return h;
}

/** Inject the section stylesheet once. */
function injectStyle() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const st = document.createElement("style");
  st.id = STYLE_ID;
  st.textContent = CSS;
  (document.head || document.documentElement).appendChild(st);
}

/**
 * The content element of the currently-visible plot tooltip, or null. `.plot-tooltip` /
 * `.tooltip__content` are stable base classes every plot-tooltip implementation renders into.
 * @returns {HTMLElement|null} The content element to append into.
 */
function visiblePlotContent() {
  if (typeof document === "undefined") return null;
  const nodes = document.querySelectorAll(".plot-tooltip");
  for (let i = 0; i < nodes.length; i++) {
    const n = /** @type {HTMLElement} */ (nodes[i]);
    // Tooltips are fixed/absolute (offsetParent is null even when shown), so test laid-out width +
    // the manager's `invisible` toggle rather than offsetParent. There can be cached hidden copies.
    if (n.classList.contains("invisible") || n.offsetWidth === 0) continue;
    return /** @type {HTMLElement} */ (n.querySelector(".tooltip__content")) || n;
  }
  return null;
}

/**
 * Reconcile our section with the live tooltip: add/update it when the lens is active and the hovered
 * plot has a tracked composition; remove it otherwise. Idempotent (keyed by plot), so re-renders and
 * our own insertions don't loop.
 */
function sync() {
  try {
    const host = visiblePlotContent();
    if (!host) return;
    let node = /** @type {HTMLElement|null} */ (host.querySelector("#" + SEC_ID));
    if (!_curHTML || !isLensActive()) {
      if (node) node.remove();
      return;
    }
    if (node && node.getAttribute("data-key") === _curKey) return; // already current
    if (!node) {
      node = document.createElement("div");
      node.id = SEC_ID;
      node.className = SEC_ID;
      host.appendChild(node);
    }
    node.setAttribute("data-key", _curKey || "");
    node.innerHTML = _curHTML;
  } catch (_) {
    /* a tooltip-injection failure must never break the host UI */
  }
}

/**
 * React to the hovered plot changing: recompute the section for the new plot, then reconcile.
 * @param {*} plot The hovered plot {x, y}, or null.
 */
function onPlotChange(plot) {
  if (!plot || typeof plot.x !== "number" || !isLensActive()) {
    _curKey = null;
    _curHTML = null;
    sync();
    return;
  }
  _curKey = plot.x + "," + plot.y;
  const city = cityAt(plot.x, plot.y);
  const parts = city ? resolveParts(city) : null;
  _curHTML = parts && parts.length ? buildSectionHTML(parts) : null;
  sync();
}

// ── Self-registration (runs on UIScript load, in the HUD context) ───────────────────────
try {
  if (typeof document !== "undefined" && typeof window !== "undefined") {
    injectStyle();
    if (typeof MutationObserver !== "undefined") {
      const root = document.getElementById("tooltips")
        || document.getElementById("tooltip-container") || document.body;
      _observer = new MutationObserver(() => sync());
      _observer.observe(root, { childList: true, subtree: true });
    }
    window.addEventListener("cursor-updated",
      (/** @type {*} */ ev) => onPlotChange(ev && ev.detail ? ev.detail.plot : null));
    window.addEventListener("plot-cursor-coords-updated",
      (/** @type {*} */ ev) => onPlotChange(ev && ev.detail ? ev.detail.plotCoords : null));
  }
} catch (e) {
  console.error("[Emigration.ethtip] init failed", e);
}
