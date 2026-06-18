// emigration-network-flow.js
//
// The "Flows" tab — the SAME civ layout as the migration network, but instead of dots it draws
// directed arrows between civilizations: each arrow runs red (where people LEAVE, an outflow) to
// green (where they ARRIVE, an inflow), thickness scaled to how many migrants it carries. Click a
// civilization circle to EXPAND it: its cities and towns appear as sub-nodes and the flows route to
// them (intra-civ city→city moves are drawn too). Click again to collapse. Multiple civs can be
// expanded at once.
//
// Reuses the network's force layout + city sub-cluster placement (buildCenters + buildChronoDots)
// and the shared timeline scrubber, so positions match the dot view exactly. Node-circle styling
// (towns dotted, cities solid, civ boundary solid + thicker) is shared via the painter.

import {
  buildColorMap, buildCenters, setupCanvas, injectStyle, WX, WY
} from "/emigration/ui/emigration-network-viz.js";
import { buildChronoDots, totalPeople } from "/emigration/ui/emigration-network-dots.js";
import { drawCivCircle, drawCityDiscs, drawCivLabel } from "/emigration/ui/emigration-network-paint.js";
import { stepSim } from "/emigration/ui/emigration-network-sim.js";
import { makeTimeline } from "/emigration/ui/emigration-network-timeline.js";
import { makeTooltip } from "/emigration/ui/emigration-network-interact.js";
import { formatPeople } from "/emigration/ui/emigration-population.js";
import { getNumberMode, NumberMode } from "/emigration/ui/emigration-settings.js";

const TARGET_DOTS = 1500; // matches the network view, so city sub-cluster sizes line up
const PLAY_INTERVAL = 42; // rAF ticks between timeline frames while playing
const OUTFLOW = "#e0786b"; // red — people leaving (the arrow's tail end)
const INFLOW = "#7fd08a"; // green — people arriving (the arrow's head end)
// Line thickness scales LINEARLY with the migrant count relative to the busiest flow, between a
// floor (always visible + easy to hover) and a cap (so the biggest arrow stays sane).
const FLOW_MIN_W = 1.6;
const FLOW_MAX_W = 8;

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

const FLOW_CSS =
  ".emig-flow-leg{display:flex;flex-wrap:wrap;gap:0.3rem 1.1rem;justify-content:center;" +
  "align-items:center;margin:0.2rem 0 0.3rem;font-size:0.78rem;color:#cbb994;}" +
  ".emig-flow-leg-i{display:flex;align-items:center;gap:0.35rem;}" +
  ".emig-flow-sw{width:1.1rem;height:0.32rem;border-radius:0.16rem;display:inline-block;}" +
  ".emig-flow-hint{opacity:0.72;font-style:italic;flex-basis:100%;text-align:center;}" +
  ".emig-flow-cap{opacity:0.55;font-size:0.78rem;text-align:center;margin-top:0.3rem;max-width:34rem;}";

/** Inject the flow-tab stylesheet once (idempotent). */
function injectFlowStyle() {
  if (document.getElementById("emig-flow-style")) return;
  const st = document.createElement("style");
  st.id = "emig-flow-style";
  st.textContent = FLOW_CSS;
  (document.head || document.documentElement).appendChild(st);
}

/**
 * One endpoint for a flow line at a civ: the civ centre (collapsed) or its capital city's
 * sub-centre (expanded), plus the disc radius to trim the line back to.
 * @param {*} center Civ centre.
 * @param {boolean} expanded Whether this civ is expanded.
 * @returns {{x:number, y:number, r:number}} Point + radius.
 */
function endpoint(center, expanded) {
  if (expanded && center.cities && center.cities.length) {
    const cap = center.cities[0];
    return { x: center.x + (cap.sx || 0), y: center.y + (cap.sy || 0), r: (cap.subR || 4) + 3 };
  }
  return { x: center.x, y: center.y, r: (center.clusterR || 8) + 6 };
}

/**
 * A named city's sub-centre within an expanded civ, or null.
 * @param {*} center Civ centre.
 * @param {string} name City name.
 * @returns {{x:number, y:number, r:number}|null} Point + radius.
 */
function cityPoint(center, name) {
  for (const ct of center.cities || []) {
    if (ct.name === name) {
      return { x: center.x + (ct.sx || 0), y: center.y + (ct.sy || 0), r: (ct.subR || 4) + 3 };
    }
  }
  return null;
}

/**
 * Trim a straight segment back to each endpoint's disc edge (so arrows touch circles, not centres),
 * or null when the discs are too close to draw a sensible arrow between. Carries the flow's amounts
 * (people + pop-points) and a hover label.
 * @param {*} a Source point {x, y, r}.
 * @param {*} b Destination point {x, y, r}.
 * @param {{people:number, points:number, label:string}} meta Flow amounts + label.
 * @returns {*} Segment {x0, y0, x1, y1, people, points, label} or null.
 */
function trimmed(a, b, meta) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len <= a.r + b.r + 6) return null;
  const ux = dx / len;
  const uy = dy / len;
  return { x0: a.x + ux * a.r, y0: a.y + uy * a.r, x1: b.x - ux * b.r, y1: b.y - uy * b.r,
    people: meta.people, points: meta.points || 0, label: meta.label || "" };
}

/**
 * The city-level flow edges for a frame (fall back to civ-level edges when no city detail exists,
 * e.g. an older save recorded before settlement tracking).
 * @param {*} fr Current frame.
 * @returns {*[]} Edges.
 */
function flowEdges(fr) {
  const net = fr.network || {};
  return net.cityEdges && net.cityEdges.length ? net.cityEdges : net.edges || [];
}

/**
 * One endpoint, routed to a specific city when that civ is expanded (else the civ centre, or its
 * capital when expanded but the city is unknown).
 * @param {*} center Civ centre.
 * @param {boolean} expanded Whether the civ is expanded.
 * @param {string} city Origin/destination city name ("" when unknown).
 * @returns {{x:number, y:number, r:number}} Point + radius.
 */
function endCity(center, expanded, city) {
  if (expanded && city) {
    const p = cityPoint(center, city);
    if (p) return p;
  }
  return endpoint(center, expanded);
}

/**
 * Accumulate a collapsed (neither end expanded) civ→civ arrow, summing people across its city pairs
 * so two collapsed civs get ONE clean arrow rather than many overlapping ones.
 * @param {Map<string,*>} map Civ-pair accumulator.
 * @param {*} e Edge.
 * @param {number} fi Source centre index.
 * @param {number} ti Destination centre index.
 */
function sumCollapsed(map, e, fi, ti) {
  const k = e.from + ">" + e.to;
  let a = map.get(k);
  if (!a) {
    a = { fi, ti, people: 0, points: 0, label: e.fromName + " → " + e.toName };
    map.set(k, a);
  }
  a.people += e.people;
  a.points += e.points || 0;
}

/**
 * The hover label for a city-level edge — origin → destination, using the real settlement name on
 * any expanded end and the civ name otherwise.
 * @param {*} e Edge.
 * @param {boolean} se Source civ expanded.
 * @param {boolean} de Destination civ expanded.
 * @returns {string} Label.
 */
function edgeLabel(e, se, de) {
  const from = se && e.fromCity ? e.fromCity : e.fromName;
  const to = de && e.toCity ? e.toCity : e.toName;
  return from + " → " + to;
}

/**
 * Add one cross-civ edge: a collapsed arrow (neither end expanded) accumulates into `collapsed`;
 * otherwise a city→city arrow routed to the real origin/destination settlement(s).
 * @param {*} e Edge.
 * @param {*} holder Render holder.
 * @param {Map<string,*>} collapsed Collapsed-pair accumulator.
 * @param {*[]} segs Output list.
 */
function addInterEdge(e, holder, collapsed, segs) {
  if (!(e.people > 0)) return;
  const { state, centers, byId } = holder;
  const fi = byId.get(e.from);
  const ti = byId.get(e.to);
  if (fi == null || ti == null || fi === ti) return;
  const se = state.expanded.has(e.from);
  const de = state.expanded.has(e.to);
  if (!se && !de) {
    sumCollapsed(collapsed, e, fi, ti);
    return;
  }
  const a = endCity(centers[fi], se, e.fromCity);
  const b = endCity(centers[ti], de, e.toCity);
  const seg = trimmed(a, b, { people: e.people, points: e.points, label: edgeLabel(e, se, de) });
  if (seg) segs.push(seg);
}

/**
 * Append the cross-civ flow segments for the current frame. City→city when an endpoint civ is
 * expanded (routed to the real settlement); otherwise an aggregated civ→civ arrow.
 * @param {*} fr Current frame.
 * @param {*} holder Render holder.
 * @param {*[]} segs Output list.
 */
function interSegments(fr, holder, segs) {
  const { centers } = holder;
  /** @type {Map<string,*>} */
  const collapsed = new Map();
  for (const e of flowEdges(fr)) addInterEdge(e, holder, collapsed, segs);
  for (const a of collapsed.values()) {
    const seg = trimmed(endpoint(centers[a.fi], false), endpoint(centers[a.ti], false),
      { people: a.people, points: a.points, label: a.label });
    if (seg) segs.push(seg);
  }
}

/**
 * Append the intra-civ (city→city) flow segments for expanded civs at the current frame.
 * @param {*} fr Current frame.
 * @param {*} holder Render holder.
 * @param {*[]} segs Output list.
 */
function intraSegments(fr, holder, segs) {
  const { state, centers, byId } = holder;
  for (const m of fr.intra || []) {
    if (!state.expanded.has(m.civId) || !(m.people > 0)) continue;
    const ci = byId.get(m.civId);
    if (ci == null) continue;
    const a = cityPoint(centers[ci], m.fromCity);
    const b = cityPoint(centers[ci], m.toCity);
    if (!a || !b) continue;
    const seg = trimmed(a, b,
      { people: m.people, points: m.points || 0, label: m.fromCity + " → " + m.toCity });
    if (seg) segs.push(seg);
  }
}

/**
 * All flow segments to draw for the current frame (cross-civ everywhere, plus city→city inside any
 * expanded civ).
 * @param {*} holder Render holder.
 * @returns {*[]} Segments.
 */
function frameSegments(holder) {
  const fr = holder.frames[holder.state.frameIdx] || {};
  /** @type {*[]} */
  const segs = [];
  interSegments(fr, holder, segs);
  intraSegments(fr, holder, segs);
  return segs;
}

/**
 * Draw the arrowhead (green) at a segment's destination, oriented along the curve's end tangent.
 * @param {CanvasRenderingContext2D} ctx Context.
 * @param {*} p {cx, cy, x1, y1} control point + tip.
 * @param {number} w Line width.
 */
function drawArrowhead(ctx, p, w) {
  const ang = Math.atan2(p.y1 - p.cy, p.x1 - p.cx);
  const size = 4.5 + w * 1.1;
  ctx.fillStyle = INFLOW;
  ctx.globalAlpha = 0.95;
  ctx.beginPath();
  ctx.moveTo(p.x1, p.y1);
  ctx.lineTo(p.x1 - size * Math.cos(ang - 0.42), p.y1 - size * Math.sin(ang - 0.42));
  ctx.lineTo(p.x1 - size * Math.cos(ang + 0.42), p.y1 - size * Math.sin(ang + 0.42));
  ctx.closePath();
  ctx.fill();
}

/**
 * The quadratic-curve control point for a segment (a gentle sideways bow).
 * @param {*} s Segment {x0, y0, x1, y1}.
 * @returns {{cx:number, cy:number}} Control point.
 */
function curveControl(s) {
  const dx = s.x1 - s.x0;
  const dy = s.y1 - s.y0;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const off = Math.min(40, len * 0.16);
  return { cx: (s.x0 + s.x1) / 2 - (dy / len) * off, cy: (s.y0 + s.y1) / 2 + (dx / len) * off };
}

/**
 * Set the red→green gradient stroke style for a flow line.
 * @param {CanvasRenderingContext2D} ctx Context.
 * @param {*} s Segment {x0, y0, x1, y1}.
 * @param {number} w Line width.
 */
function setFlowStroke(ctx, s, w) {
  const grad = ctx.createLinearGradient(s.x0, s.y0, s.x1, s.y1);
  grad.addColorStop(0, OUTFLOW);
  grad.addColorStop(1, INFLOW);
  ctx.strokeStyle = grad;
  ctx.lineWidth = w;
  ctx.lineCap = "round";
  ctx.globalAlpha = 0.82;
}

/**
 * Draw one flow as a gently-curved arrow: red (leaving) → green (arriving) gradient, thickness
 * scaled to its share of the busiest flow, an arrowhead at the destination.
 * @param {CanvasRenderingContext2D} ctx Context.
 * @param {*} s Segment {x0, y0, x1, y1, people}.
 * @param {number} maxP Busiest flow's people (for thickness scaling).
 */
function drawArrow(ctx, s, maxP) {
  const { cx, cy } = curveControl(s);
  const frac = maxP > 0 ? Math.min(1, s.people / maxP) : 0;
  const w = FLOW_MIN_W + frac * (FLOW_MAX_W - FLOW_MIN_W);
  setFlowStroke(ctx, s, w);
  ctx.beginPath();
  ctx.moveTo(s.x0, s.y0);
  ctx.quadraticCurveTo(cx, cy, s.x1, s.y1);
  ctx.stroke();
  drawArrowhead(ctx, { cx, cy, x1: s.x1, y1: s.y1 }, w);
  ctx.globalAlpha = 1;
}

/**
 * Draw each civ's name label above its circle (Demographics-relations styling, via drawCivLabel).
 * @param {CanvasRenderingContext2D} ctx Context.
 * @param {*[]} centers Civ centres.
 */
function drawCivNames(ctx, centers) {
  for (const c of centers) {
    if (!c.name) continue;
    drawCivLabel(ctx, c.name, c.x, c.y - (c.clusterR || 6) - 10);
  }
}

/**
 * Draw the city/town name labels inside one expanded civ (smaller, same styling).
 * @param {CanvasRenderingContext2D} ctx Context.
 * @param {*} c Civ centre.
 * @param {number} now Current frame index.
 */
function drawCityNames(ctx, c, now) {
  for (const ct of c.cities || []) {
    if (!(ct.subR > 0) || now < (ct.bornFrame == null ? 0 : ct.bornFrame)) continue;
    const x = c.x + (ct.sx || 0);
    const y = c.y + (ct.sy || 0) - (ct.subR || 4) - 5;
    drawCivLabel(ctx, ct.name, x, y, 10);
  }
}

/**
 * Paint one frame: civ circles (+ city/town sub-discs for expanded civs), the flow arrows, labels.
 * @param {CanvasRenderingContext2D} ctx Context.
 * @param {*} holder Render holder.
 */
function paintFlow(ctx, holder) {
  const { centers, state } = holder;
  const now = state.frameIdx;
  ctx.clearRect(0, 0, WX, WY);
  for (const c of centers) {
    if (!(c.clusterR > 0)) continue;
    drawCivCircle(ctx, c);
    if (state.expanded.has(c.id)) drawCityDiscs(ctx, c, now);
  }
  const segs = frameSegments(holder);
  holder.segs = segs; // kept for hover hit-testing (amount tooltips)
  const maxP = segs.reduce((a, s) => Math.max(a, s.people), 1);
  for (const s of segs) drawArrow(ctx, s, maxP);
  drawCivNames(ctx, centers);
  for (const c of centers) if (state.expanded.has(c.id)) drawCityNames(ctx, c, now);
}

/**
 * Cursor position in logical (W-space) canvas coordinates.
 * @param {HTMLCanvasElement} canvas Canvas.
 * @param {*} ev Mouse event.
 * @returns {{mx:number, my:number}} Logical position.
 */
function logicalXY(canvas, ev) {
  const rect = canvas.getBoundingClientRect();
  const mx = ((ev.clientX - rect.left) / rect.width) * WX;
  const my = ((ev.clientY - rect.top) / rect.height) * WY;
  return { mx, my };
}

/**
 * The civ whose circle is under the cursor (nearest centre within its radius), or null.
 * @param {*[]} centers Civ centres.
 * @param {number} mx Logical x.
 * @param {number} my Logical y.
 * @returns {*} Civ centre or null.
 */
function hitCiv(centers, mx, my) {
  let best = null;
  let bd = Infinity;
  for (const c of centers) {
    const d = Math.sqrt((mx - c.x) * (mx - c.x) + (my - c.y) * (my - c.y));
    if (d <= (c.clusterR || 10) + 8 && d < bd) {
      bd = d;
      best = c;
    }
  }
  return best;
}

/**
 * Toggle a civ's cities/towns open or closed.
 * @param {*} holder Render holder.
 * @param {*} c Civ centre.
 */
function toggleExpand(holder, c) {
  if (holder.state.expanded.has(c.id)) holder.state.expanded.delete(c.id);
  else holder.state.expanded.add(c.id);
}

/**
 * Begin dragging the civ circle under the cursor (pinned so the layout won't fight it).
 * @param {HTMLCanvasElement} canvas Canvas.
 * @param {*} holder Render holder.
 * @param {*} drag Drag state.
 * @param {*} ev Event.
 */
function flowDown(canvas, holder, drag, ev) {
  const { mx, my } = logicalXY(canvas, ev);
  const c = hitCiv(holder.centers, mx, my);
  if (!c) return;
  drag.node = c;
  drag.dx = mx - c.x;
  drag.dy = my - c.y;
  drag.downX = mx;
  drag.downY = my;
  drag.moved = false;
  c.pinned = true;
  canvas.style.cursor = "grabbing";
}

/**
 * A flow amount formatted for the active number mode: Civ pop-points, scaled people, or both. Falls
 * back to people when the points figure is unknown (e.g. intra-civ moves).
 * @param {number} people Scaled people.
 * @param {number} points Raw pop points.
 * @returns {string} The amount string.
 */
function amountText(people, points) {
  const pts = Math.round(points || 0);
  if (getNumberMode() === NumberMode.CIV) return pts > 0 ? String(pts) : formatPeople(people);
  return formatPeople(people);
}

/** Escape text for tooltip HTML. @param {string} s Text. @returns {string} Escaped. */
function escFlow(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Minimum distance from a cursor to a segment's drawn curve (sampled along the quadratic).
 * @param {*} seg Segment.
 * @param {number} mx Cursor x. @param {number} my Cursor y.
 * @returns {number} Distance.
 */
function segDistance(seg, mx, my) {
  const { cx, cy } = curveControl(seg);
  let min = Infinity;
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const u = 1 - t;
    const x = u * u * seg.x0 + 2 * u * t * cx + t * t * seg.x1;
    const y = u * u * seg.y0 + 2 * u * t * cy + t * t * seg.y1;
    const d = (x - mx) * (x - mx) + (y - my) * (y - my);
    if (d < min) min = d;
  }
  return Math.sqrt(min);
}

/**
 * The flow segment nearest the cursor within the hover threshold, or null.
 * @param {*[]} segs Segments. @param {number} mx Cursor x. @param {number} my Cursor y.
 * @returns {*} Segment or null.
 */
function nearestSeg(segs, mx, my) {
  let best = null;
  let bd = 11; // logical-px hover threshold
  for (const s of segs || []) {
    const d = segDistance(s, mx, my);
    if (d < bd) {
      bd = d;
      best = s;
    }
  }
  return best;
}

/**
 * Show the amount tooltip for the flow line under the cursor (or hide it).
 * @param {HTMLCanvasElement} canvas Canvas.
 * @param {*} holder Render holder.
 * @param {*} ev Event.
 */
function hoverFlow(canvas, holder, ev) {
  const tip = holder.tip;
  if (!tip) return;
  const { mx, my } = logicalXY(canvas, ev);
  const seg = nearestSeg(holder.segs, mx, my);
  if (!seg) {
    tip.hide();
    return;
  }
  tip.move(ev);
  tip.setHTML(escFlow(seg.label) + " — " + escFlow(amountText(seg.people, seg.points)));
  tip.show();
}

/**
 * Drag the grabbed civ circle (clamped to the canvas), or — when not dragging — show the amount
 * tooltip for the flow line under the cursor.
 * @param {HTMLCanvasElement} canvas Canvas.
 * @param {*} holder Render holder.
 * @param {*} drag Drag state.
 * @param {*} ev Event.
 */
function flowMove(canvas, holder, drag, ev) {
  if (!drag.node) {
    hoverFlow(canvas, holder, ev);
    return;
  }
  const { mx, my } = logicalXY(canvas, ev);
  const r = drag.node.clusterR || 8;
  drag.node.x = Math.max(r, Math.min(WX - r, mx - drag.dx));
  drag.node.y = Math.max(r, Math.min(WY - r, my - drag.dy));
  if (Math.abs(mx - drag.downX) + Math.abs(my - drag.downY) > 3) drag.moved = true;
  if (holder.tip) holder.tip.hide();
  holder.dirty = true;
}

/**
 * End a drag. A press that didn't move is a click → toggle expand on that civ.
 * @param {HTMLCanvasElement} canvas Canvas.
 * @param {*} holder Render holder.
 * @param {*} drag Drag state.
 */
function flowUp(canvas, holder, drag) {
  if (!drag.node) return;
  if (!drag.moved) toggleExpand(holder, drag.node);
  drag.node.pinned = false;
  drag.node = null;
  holder.dirty = true;
  canvas.style.cursor = "grab";
}

/**
 * Wire drag-to-rearrange the civ circles + click-to-expand their cities/towns.
 * @param {HTMLCanvasElement} canvas Canvas.
 * @param {*} holder Render holder.
 */
function wireFlowInteract(canvas, holder) {
  /** @type {*} */
  const drag = { node: null, dx: 0, dy: 0, downX: 0, downY: 0, moved: false };
  canvas.style.cursor = "grab";
  canvas.addEventListener("mousedown", (/** @type {*} */ ev) => flowDown(canvas, holder, drag, ev));
  canvas.addEventListener("mousemove", (/** @type {*} */ ev) => flowMove(canvas, holder, drag, ev));
  canvas.addEventListener("mouseup", () => flowUp(canvas, holder, drag));
  canvas.addEventListener("mouseleave", () => {
    flowUp(canvas, holder, drag);
    if (holder.tip) holder.tip.hide();
  });
}

/**
 * Run the animation loop: settle the layout once, drive playback, repaint when needed; stop when
 * the canvas is detached (tab switched away).
 * @param {HTMLCanvasElement} canvas Canvas.
 * @param {CanvasRenderingContext2D} ctx Context.
 * @param {*} holder Render holder.
 */
function runFlowLoop(canvas, ctx, holder) {
  const raf = /** @type {*} */ (globalThis).requestAnimationFrame;
  const tick = () => {
    if (!document.contains(canvas)) return;
    const settling = holder.sim.alpha > 0.02;
    if (settling) stepSim(holder.sim);
    if (holder.tickPlayback) holder.tickPlayback();
    if (settling || (holder.pb && holder.pb.playing) || holder.dirty) {
      paintFlow(ctx, holder);
      holder.dirty = false;
    }
    if (raf) raf(tick);
  };
  if (raf) raf(tick);
  else paintFlow(ctx, holder);
}

/**
 * Wire the timeline scrubber + playback (null for a single frame).
 * @param {*[]} frames Frames.
 * @param {*} holder Render holder (gets pb + tickPlayback).
 * @param {(i:number)=>void} activate Apply a frame.
 * @returns {*} Timeline handle or null.
 */
function setupFlowPlayback(frames, holder, activate) {
  if (frames.length <= 1) return null;
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
  return timeline;
}

/**
 * A flow-colour key swatch + label.
 * @param {string} color Swatch colour.
 * @param {string} label Text.
 * @returns {HTMLElement} The item.
 */
function swatch(color, label) {
  const item = el("div", "emig-flow-leg-i");
  const sw = el("span", "emig-flow-sw");
  sw.style.backgroundColor = color;
  item.appendChild(sw);
  item.appendChild(el("span", "", label));
  return item;
}

/** @returns {HTMLElement} The flow legend (red leaving / green arriving + the expand hint). */
function flowLegend() {
  const box = el("div", "emig-flow-leg");
  box.appendChild(swatch(OUTFLOW, "Leaving (outflow)"));
  box.appendChild(swatch(INFLOW, "Arriving (inflow)"));
  box.appendChild(el("span", "emig-flow-hint",
    "Hover a line for its amount. Drag a civilization to rearrange it; click it to expand its " +
    "cities & towns (click again to collapse)."));
  return box;
}

/** @returns {HTMLElement} The caption. */
function flowCaption() {
  return el("div", "emig-flow-cap",
    "Each arrow is migration between civilizations — red where people leave (outflow) fading to " +
    "green where they arrive (inflow); thicker arrows carry more people. Flows are tracked by their " +
    "origin AND destination settlement: expand a civilization to fan its arrows out to the actual " +
    "cities and towns people left and arrived at, plus the moves between its own cities. Towns are " +
    "circled with dotted lines, cities and civilizations with solid lines. Scrub the timeline to " +
    "replay how the flows change over history.");
}

/**
 * Build the layout (reusing the network's force sim + city placement) for the flow view.
 * @param {*[]} frames Usable frames.
 * @returns {{sim:*, byId:Map<number,number>}} Sim + id→index.
 */
function buildFlowScene(frames) {
  const colorMap = buildColorMap(frames);
  const lastFrame = frames[frames.length - 1];
  const { sim, byId } = buildCenters(lastFrame.network, colorMap);
  const total = totalPeople(lastFrame.network, lastFrame.pops || {}) || 1;
  const unit = Math.max(1, Math.round(total / TARGET_DOTS));
  buildChronoDots(frames, sim.nodes, byId, colorMap, unit); // positions centers[].cities + clusterR
  return { sim, byId };
}

/**
 * Mount the chrome (legend, canvas, timeline, caption) into the wrapper.
 * @param {HTMLElement} wrap Wrapper.
 * @param {HTMLCanvasElement} canvas Canvas.
 * @param {*} timeline Timeline handle or null.
 */
function mountFlowChrome(wrap, canvas, timeline) {
  wrap.appendChild(flowLegend());
  const stage = el("div", "emig-netc-stage");
  stage.appendChild(canvas);
  wrap.appendChild(stage);
  if (timeline) wrap.appendChild(timeline.root);
  wrap.appendChild(flowCaption());
}

/**
 * Build the full flow viz (layout + chrome + loop).
 * @param {HTMLElement} container Card body.
 * @param {*[]} frames Usable frames.
 */
function buildFlowViz(container, frames) {
  const wrap = el("div", "emig-netc-wrap");
  const { canvas, ctx } = setupCanvas();
  if (!ctx) {
    container.appendChild(el("div", "emig-empty", "No migration flows yet."));
    return;
  }
  const { sim, byId } = buildFlowScene(frames);
  /** @type {*} */
  const state = { frameIdx: frames.length - 1, expanded: new Set() };
  /** @type {*} */
  const holder = { sim, centers: sim.nodes, state, frames, byId, dirty: true };
  holder.tip = makeTooltip(wrap); // amount tooltip on flow-line hover
  const timeline = setupFlowPlayback(frames, holder, (/** @type {number} */ i) => {
    state.frameIdx = i;
    holder.dirty = true;
  });
  mountFlowChrome(wrap, canvas, timeline);
  wireFlowInteract(canvas, holder);
  container.appendChild(wrap);
  runFlowLoop(canvas, ctx, holder);
}

/**
 * Render the civ-to-civ flow view (arrows; click to drill into cities/towns) into `container`.
 * @param {HTMLElement} container Card body.
 * @param {*} section The dashboard section ({frames}).
 */
export function renderFlowMap(container, section) {
  if (container && container.replaceChildren) container.replaceChildren();
  const all = (section && section.frames) || [];
  const frames = all.filter((/** @type {*} */ f) => f.network && f.network.nodes.length);
  if (!frames.length) {
    container.appendChild(el("div", "emig-empty",
      "No cross-civ migration yet — flows appear once people cross borders."));
    return;
  }
  injectStyle();
  injectFlowStyle();
  buildFlowViz(container, frames);
}
