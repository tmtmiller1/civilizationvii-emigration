// emigration-lens-hover-panel.js
//
// Shared cursor-following info panel for the mod's map lenses. A lens registers a panel with
// registerLensHoverPanel({...}); while that lens is the active lens and the cursor is over an
// observable, non-hidden settlement, the panel shows a small readout near (but offset from) the
// cursor. The Ethnicity and Prosperity lenses both use this so they look and behave identically -
// same styling, same cursor offset, same spoiler rules.
//
// Spoiler-safe: a policy-hidden owner is never indexed, so no panel appears for it. Reads only; the
// plot->settlement index is rebuilt on a short TTL and shared across every registered panel. Each
// lens supplies an optional per-pass snapshot builder (e.g. the prosperity field mean/spread) and a
// resolve(signal, snapshot) -> {title, rows} that turns the hovered settlement into display rows.

import LensManager from "/core/ui/lenses/lens-manager.js";
import PlotCursor from "/core/ui/input/plot-cursor.js";
import { collectCitySignals } from "/emigration/ui/emigration-cities.js";
import { civHidden } from "/emigration/ui/emigration-governance.js";

const CURSOR_OFFSET = 36; // px gap from the cursor so the panel sits clear of the tile being read
const INDEX_TTL = 3000; // ms a plot->settlement index is cached before a rebuild

/**
 * @typedef {Object} HoverRow A single panel row: a colour swatch, a label, and an optional value.
 * @property {string} color  Swatch colour (`#RRGGBB`).
 * @property {string} name   Row label.
 * @property {string} [value] Right-aligned value (e.g. "42%"); omitted/"" shows no value.
 */

/**
 * @typedef {Object} HoverPanelSpec
 * @property {string} lens     The lens id this panel shows for.
 * @property {string} panelId  The panel element id.
 * @property {string} styleId  The injected <style> id.
 * @property {(signals:*[])=>*} [buildSnapshot] Optional per-pass context from all signals.
 * @property {(signal:*, snapshot:*, plot?:{x:number,y:number})=>{title:string, rows:HoverRow[]}|null}
 *   resolve Hovered settlement (+ the hovered plot, for per-tile panels) -> display.
 */

/** @type {{spec:HoverPanelSpec, panel:HTMLElement|null, snapshot:*, curKey:string|null}[]} */
const _panels = [];
/** @type {Map<string, *>|null} Shared "x,y" -> CitySignal index. */
let _indexMap = null;
let _indexAt = -1e9;
let _mouseX = 0;
let _mouseY = 0;
let _rafPending = false;
let _wired = false;

/**
 * Escape a value for safe interpolation into panel HTML.
 * @param {*} s Value.
 * @returns {string} Escaped text.
 */
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * The panel stylesheet for a given element id (identical styling for every lens panel).
 * @param {string} id Panel element id.
 * @returns {string} CSS text.
 */
function cssFor(id) {
  return (
    "#" + id + "{position:fixed;pointer-events:none;z-index:9999;display:none;max-width:20rem;" +
    "background:rgba(8,10,16,0.96);border:0.0555rem solid rgba(201,162,76,0.5);border-radius:0.3rem;" +
    "padding:0.4rem 0.6rem;color:#e5d2ac;font-size:0.85rem;" +
    'font-family:"BodyFont","BodyFont-JP","BodyFont-KR","BodyFont-SC","BodyFont-TC";}' +
    "#" + id + " .t{color:#f3c34c;font-weight:bold;margin-bottom:0.2rem;}" +
    "#" + id + " .r{display:flex;align-items:center;gap:0.35rem;line-height:1.55;}" +
    "#" + id + " .sw{width:0.62rem;height:0.62rem;border-radius:50%;flex:0 0 auto;}" +
    "#" + id + " .pct{margin-left:auto;padding-left:0.6rem;}"
  );
}

/**
 * A city's owned plots as {x, y} (from its purchased plot indices) - the same source the lenses paint.
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
 * Rebuild the shared "x,y" -> CitySignal index over every observable, non-hidden settlement, and
 * refresh each registered panel's per-pass snapshot from the same signal set.
 * @returns {Map<string, *>} The index.
 */
function rebuildIndex() {
  /** @type {Map<string, *>} */
  const m = new Map();
  /** @type {*[]} */
  let signals = [];
  try {
    signals = collectCitySignals() || [];
  } catch (_) {
    signals = [];
  }
  for (const s of signals) {
    if (!s || typeof s.owner !== "number" || civHidden(s.owner)) continue; // hidden owner: no panel
    for (const p of plotsOf(s.city)) m.set(p.x + "," + p.y, s);
  }
  for (const e of _panels) {
    e.snapshot = e.spec.buildSnapshot ? e.spec.buildSnapshot(signals) : null;
  }
  return m;
}

/** The shared index, rebuilt on the TTL. @returns {Map<string, *>} The index. */
function freshIndex() {
  const now = Date.now();
  if (!_indexMap || now - _indexAt > INDEX_TTL) {
    _indexMap = rebuildIndex();
    _indexAt = now;
  }
  return _indexMap;
}

/** The currently hovered map plot {x, y}, or null. From the engine's PlotCursor singleton. */
function hoveredPlot() {
  try {
    const c = PlotCursor && PlotCursor.plotCursorCoords;
    return c && typeof c.x === "number" && typeof c.y === "number" ? c : null;
  } catch (_) {
    return null;
  }
}

/** Whether the given lens is the active lens right now. @param {string} lens Lens id. */
function lensActive(lens) {
  try {
    return typeof LensManager.getActiveLens === "function" && LensManager.getActiveLens() === lens;
  } catch (_) {
    return false;
  }
}

/**
 * Build a panel's inner HTML from a title and rows.
 * @param {string} title Panel title.
 * @param {HoverRow[]} rows Display rows.
 * @returns {string} HTML.
 */
function buildHTML(title, rows) {
  let h = `<div class="t">${esc(title)}</div>`;
  for (const r of rows) {
    const val = r.value != null && r.value !== "" ? `<span class="pct">${esc(r.value)}</span>` : "";
    h += `<div class="r"><span class="sw" style="background:${esc(r.color)}"></span>` +
      `<span class="nm">${esc(r.name)}</span>${val}</div>`;
  }
  return h;
}

/** Inject the stylesheet + create the (hidden) panel element once. @param {*} e Panel entry. */
function ensurePanel(e) {
  if (e.panel) return e.panel;
  if (typeof document === "undefined") return null;
  if (!document.getElementById(e.spec.styleId)) {
    const st = document.createElement("style");
    st.id = e.spec.styleId;
    st.textContent = cssFor(e.spec.panelId);
    (document.head || document.documentElement).appendChild(st);
  }
  e.panel = document.createElement("div");
  e.panel.id = e.spec.panelId;
  document.body.appendChild(e.panel);
  return e.panel;
}

/** Position a panel near the cursor (offset so it clears the tile), clamped on screen.
 * @param {HTMLElement} panel The panel element. */
function place(panel) {
  const w = panel.offsetWidth || 200;
  const h = panel.offsetHeight || 90;
  let x = _mouseX + CURSOR_OFFSET;
  let y = _mouseY + CURSOR_OFFSET;
  if (x + w > window.innerWidth) x = _mouseX - w - CURSOR_OFFSET;
  if (y + h > window.innerHeight) y = _mouseY - h - CURSOR_OFFSET;
  // Clamp BOTH edges to the viewport: flipping the anchor can still leave the panel off-screen on a
  // short/narrow viewport (or when the panel is wider than the cursor's margin), so pin it inside.
  const maxX = Math.max(0, window.innerWidth - w - 4);
  const maxY = Math.max(0, window.innerHeight - h - 4);
  panel.style.left = Math.min(Math.max(0, x), maxX) + "px";
  panel.style.top = Math.min(Math.max(0, y), maxY) + "px";
}

/** Hide a panel. @param {*} e Panel entry. */
function hidePanel(e) {
  if (e.panel) e.panel.style.display = "none";
  e.curKey = null;
}

/** Recompute + show/hide one panel for the currently hovered tile (lens-gated). @param {*} e Entry. */
function renderPanel(e) {
  if (!lensActive(e.spec.lens)) {
    hidePanel(e);
    return;
  }
  const plot = hoveredPlot();
  const sig = plot ? freshIndex().get(plot.x + "," + plot.y) : null;
  // Pass the hovered plot too, so a per-tile panel (the ethnicity lens) can read THAT tile's data;
  // settlement-level panels (prosperity) simply ignore the extra argument.
  const out = sig ? e.spec.resolve(sig, e.snapshot, plot) : null;
  if (!out || !out.rows || !out.rows.length || !plot) {
    hidePanel(e);
    return;
  }
  const panel = ensurePanel(e);
  if (!panel) return;
  const key = e.spec.lens + ":" + plot.x + "," + plot.y;
  if (key !== e.curKey) {
    panel.innerHTML = buildHTML(out.title, out.rows);
    e.curKey = key;
  }
  panel.style.display = "block";
  place(panel);
}

/** Render every registered panel (only the active lens's panel actually shows). */
function renderAll() {
  for (const e of _panels) renderPanel(e);
}

/** Coalesce renders to at most one per animation frame. */
function scheduleRender() {
  if (_rafPending) return;
  const raf = typeof window !== "undefined" && window.requestAnimationFrame;
  if (!raf) {
    renderAll();
    return;
  }
  _rafPending = true;
  raf(() => {
    _rafPending = false;
    renderAll();
  });
}

/** Wire the shared cursor/plot listeners once (the first time any panel registers). */
function wire() {
  if (_wired || typeof window === "undefined" || typeof document === "undefined") return;
  _wired = true;
  window.addEventListener("mousemove", (/** @type {*} */ ev) => {
    _mouseX = ev.clientX;
    _mouseY = ev.clientY;
    scheduleRender();
  }, true);
  // Plot/cursor changes (incl. camera pan under a stationary cursor) also refresh the panels.
  window.addEventListener("cursor-updated", scheduleRender);
  window.addEventListener("plot-cursor-coords-updated", scheduleRender);
}

/**
 * A settlement's localized display name, or a generic fallback. Shared so every lens panel titles
 * the same way.
 * @param {*} city City object.
 * @param {string} fallback Title to use when the name can't be resolved.
 * @returns {string} The title.
 */
export function cityTitle(city, fallback) {
  try {
    if (city && city.name && typeof Locale !== "undefined" && typeof Locale.compose === "function") {
      const n = Locale.compose(city.name);
      if (typeof n === "string" && n && !n.startsWith("LOC_")) return n;
    }
  } catch (_) {
    /* ignore */
  }
  return fallback;
}

/**
 * Register a cursor-following info panel for a lens. Safe to call once per lens at UIScript load.
 * @param {HoverPanelSpec} spec Panel spec.
 */
export function registerLensHoverPanel(spec) {
  _panels.push({ spec, panel: null, snapshot: null, curKey: null });
  wire();
}
