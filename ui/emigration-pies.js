// emigration-pies.js
//
// Canvas pie-chart building blocks for the migration dashboard: a pie "card" from explicit slices
// (`pieCardSlices`) and a colour-key legend (`legendChips`), both consumed by emigration-city-flows.js.
// Pure canvas pies (GameFace draws 2D canvas fine); styling lives in the dashboard's injected
// stylesheet (emigration-views.js). Split out to keep that render core under its size cap.

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
    const pct = Math.round((s.value / total) * 100);
    const ct = s.countText != null ? s.countText + " " : "";
    tip.textContent = (s.label || "") + " ; " + ct + "(" + pct + "%)";
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
 * A colour key from {label, color} items. When an item carries `countText` (and optionally `pct`),
 * the chip reads "Label  count (pct%)" so each slice's magnitude and share show beside its swatch.
 * @param {{label:string, color:string, countText?:string, pct?:number}[]} items Items.
 * @returns {HTMLElement} The legend.
 */
export function legendChips(items) {
  const box = el("div", "emig-pie-leg");
  for (const it of items) {
    const item = el("div", "emig-pie-leg-i");
    const sw = el("span", "emig-pie-sw");
    sw.style.backgroundColor = it.color;
    item.appendChild(sw);
    let text = it.label;
    if (it.countText != null) {
      text += "  " + it.countText + (it.pct != null ? " (" + it.pct + "%)" : "");
    }
    item.appendChild(el("span", "", text));
    box.appendChild(item);
  }
  return box;
}

