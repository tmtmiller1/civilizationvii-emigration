// emigration-pies.js
//
// The "Why people move" CAUSES tab: a combined pie (all civs summed), an average-civ pie, and a
// pie per civ. Pure canvas pies (GameFace draws 2D canvas fine); styling lives in the dashboard's
// injected stylesheet (emigration-views.js). Split out to keep that render core under its size cap.

import { CAUSE_PALETTE } from "/emigration/ui/emigration-network-paint.js";
import { causeLabel } from "/emigration/ui/emigration-causes.js";
import { formatPeople } from "/emigration/ui/emigration-population.js";

// Cause slices in a stable display order.
const PIE_CAUSES = ["war", "disaster", "unhappiness", "prosperity", "conquest", "attrition", "other"];

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
 * Non-zero {cause, value} slices for a per-cause map, in display order.
 * @param {Record<string,number>} byCause Per-cause people.
 * @returns {{value:number, color:string, label:string}[]} Slices.
 */
function pieSlices(byCause) {
  const src = byCause || {};
  return PIE_CAUSES
    .map((c) => ({
      value: src[c] || 0, color: CAUSE_PALETTE[c] || CAUSE_PALETTE.other, label: causeLabel(c)
    }))
    .filter((e) => e.value > 0);
}

/**
 * Draw one pie slice and return the ending angle.
 * @param {CanvasRenderingContext2D} ctx Context.
 * @param {{cx:number, cy:number, r:number}} g Pie geometry.
 * @param {{value:number, color:string}} e Slice.
 * @param {number} a0 Start angle.
 * @param {number} total Sum of all slice values.
 * @returns {number} The end angle.
 */
function drawSlice(ctx, g, e, a0, total) {
  const a1 = a0 + (e.value / total) * Math.PI * 2;
  ctx.beginPath();
  ctx.moveTo(g.cx, g.cy);
  ctx.arc(g.cx, g.cy, g.r, a0, a1);
  ctx.closePath();
  ctx.fillStyle = e.color || "#9fb6c6";
  ctx.fill();
  return a1;
}

/**
 * Draw a pie onto a canvas (slice per cause, coloured by CAUSE_PALETTE); a faint ring when empty.
 * @param {HTMLCanvasElement} canvas The canvas.
 * @param {{value:number, color:string}[]} slices Slices.
 */
function drawPie(canvas, slices) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const g = {
    cx: canvas.width / 2, cy: canvas.height / 2,
    r: Math.min(canvas.width, canvas.height) / 2 - 3
  };
  const total = slices.reduce((a, e) => a + e.value, 0);
  ctx.beginPath();
  ctx.arc(g.cx, g.cy, g.r, 0, Math.PI * 2);
  if (total <= 0) {
    ctx.strokeStyle = "rgba(229,210,172,0.2)";
    ctx.stroke();
    return;
  }
  let a0 = -Math.PI / 2;
  for (const e of slices) a0 = drawSlice(ctx, g, e, a0, total);
}

/**
 * The slice under a cursor position over the pie (by angle from the top, clockwise), or null when
 * outside the disc.
 * @param {{value:number, label?:string}[]} slices Slices.
 * @param {number} total Sum of slice values.
 * @param {{mx:number, my:number, w:number, h:number}} p Cursor + canvas display size.
 * @returns {*} The slice, or null.
 */
function sliceAt(slices, total, p) {
  const cx = p.w / 2;
  const cy = p.h / 2;
  const dx = p.mx - cx;
  const dy = p.my - cy;
  if (Math.sqrt(dx * dx + dy * dy) > Math.min(cx, cy)) return null;
  let ang = Math.atan2(dy, dx) + Math.PI / 2; // 0 at top, clockwise (matches the draw order)
  if (ang < 0) ang += Math.PI * 2;
  const at = (ang / (Math.PI * 2)) * total;
  let acc = 0;
  for (const s of slices) {
    acc += s.value;
    if (at <= acc) return s;
  }
  return slices[slices.length - 1];
}

/**
 * Wire hover tooltips on a pie: hovering a slice shows its label + share.
 * @param {HTMLCanvasElement} canvas The pie canvas.
 * @param {{value:number, label?:string}[]} slices Slices.
 * @param {HTMLElement} tip Tooltip element.
 */
function attachPieHover(canvas, slices, tip) {
  const total = slices.reduce((a, s) => a + s.value, 0);
  if (total <= 0) return;
  canvas.addEventListener("mousemove", (/** @type {*} */ ev) => {
    const rect = canvas.getBoundingClientRect();
    const mx = ev.clientX - rect.left;
    const my = ev.clientY - rect.top;
    const s = sliceAt(slices, total, { mx, my, w: rect.width, h: rect.height });
    if (!s) {
      tip.style.display = "none";
      return;
    }
    tip.textContent = (s.label || "") + " ; " + Math.round((s.value / total) * 100) + "%";
    tip.style.left = mx + "px";
    tip.style.top = my + "px";
    tip.style.display = "block";
  });
  canvas.addEventListener("mouseleave", () => {
    tip.style.display = "none";
  });
}

/**
 * A pie "card" from explicit {value, color, label} slices: a canvas pie, a title beneath, and a
 * hover tooltip showing each slice's label + share.
 * @param {string} title Caption.
 * @param {{value:number, color:string, label?:string}[]} slices Slices.
 * @param {boolean} [big] Larger canvas + natural width.
 * @returns {HTMLElement} The card.
 */
export function pieCardSlices(title, slices, big) {
  const card = el("div", "emig-pie" + (big ? " big" : ""));
  const canvas = /** @type {HTMLCanvasElement} */ (document.createElement("canvas"));
  canvas.width = 320;
  canvas.height = 320;
  canvas.className = "emig-pie-c";
  card.appendChild(canvas);
  if (title) card.appendChild(el("div", "emig-pie-t", title));
  const tip = el("div", "emig-pie-tip");
  card.appendChild(tip);
  drawPie(canvas, slices);
  attachPieHover(canvas, slices, tip);
  return card;
}

/**
 * A pie card for a per-cause map.
 * @param {string} title Caption.
 * @param {Record<string,number>} byCause Per-cause people.
 * @param {boolean} [big] Larger canvas.
 * @returns {HTMLElement} The card.
 */
function pieCard(title, byCause, big) {
  return pieCardSlices(title, pieSlices(byCause), big);
}

/**
 * A colour key from {label, color} items.
 * @param {{label:string, color:string}[]} items Items.
 * @returns {HTMLElement} The legend.
 */
export function legendChips(items) {
  const box = el("div", "emig-pie-leg");
  for (const it of items) {
    const item = el("div", "emig-pie-leg-i");
    const sw = el("span", "emig-pie-sw");
    sw.style.backgroundColor = it.color;
    item.appendChild(sw);
    item.appendChild(el("span", "", it.label));
    box.appendChild(item);
  }
  return box;
}

/**
 * The shared cause colour key.
 * @param {Record<string,number>} byCause Per-cause people (which causes to list).
 * @returns {HTMLElement} The legend.
 */
function pieLegend(byCause) {
  return legendChips(pieSlices(byCause).map((e) => ({ label: e.label, color: e.color })));
}

/**
 * The "average civilization" cause profile: the mean of each civ's own cause distribution (so every
 * civ counts equally, regardless of size). Returns per-cause average shares.
 * @param {*[]} civs Civs (each with byCause).
 * @returns {Record<string,number>} Average per-cause share.
 */
function averageProfile(civs) {
  /** @type {Record<string,number>} */
  const sum = {};
  let n = 0;
  for (const c of civs || []) {
    const bc = c.byCause || {};
    const total = Object.keys(bc).reduce((a, k) => a + (bc[k] || 0), 0);
    if (total <= 0) continue;
    n++;
    for (const k of Object.keys(bc)) sum[k] = (sum[k] || 0) + (bc[k] || 0) / total;
  }
  if (!n) return {};
  for (const k of Object.keys(sum)) sum[k] /= n;
  return sum;
}

/**
 * A civ's overall in/out metrics: green ▲ immigration, red ▼ emigration.
 * @param {*} c Civ ({in, out}).
 * @returns {HTMLElement} The metrics row.
 */
function civMetrics(c) {
  const row = el("div", "emig-pie-metrics");
  row.appendChild(el("span", "emig-pie-in", "▲ " + formatPeople(c.in || 0)));
  row.appendChild(el("span", "emig-pie-out", "▼ " + formatPeople(c.out || 0)));
  return row;
}

/**
 * Render the Causes tab as pie charts: a combined pie (all civs summed), an average-civ pie, then
 * one pie per civ that produced migration.
 * @param {HTMLElement} body Card body.
 * @param {*} section The section ({combined, civs}).
 */
export function renderPies(body, section) {
  const combined = section.combined || {};
  const civs = section.civs || [];
  if (!pieSlices(combined).length) {
    body.appendChild(el("div", "emig-empty", "No migration causes yet."));
    return;
  }
  body.appendChild(pieLegend(combined));
  // Row 1: the two global pies (larger, natural width). Below: per-civ pies, three to a row, each
  // with its overall in/out metrics (green ▲ immigration, red ▼ emigration).
  const summary = el("div", "emig-pie-row");
  summary.appendChild(pieCard("All civilizations (total)", combined, true));
  summary.appendChild(pieCard("Average civilization", averageProfile(civs), true));
  body.appendChild(summary);
  const grid = el("div", "emig-pie-grid");
  for (const c of civs) {
    if (!pieSlices(c.byCause).length) continue;
    const card = pieCard(c.name, c.byCause);
    card.appendChild(civMetrics(c));
    grid.appendChild(card);
  }
  body.appendChild(grid);
}
