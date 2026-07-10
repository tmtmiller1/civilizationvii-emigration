// emigration-network-flow-arrows.js
//
// The green/red migrant-flow ARROW overlay. Lifted out of the former standalone "Flows" sub-view so it
// can draw ON TOP of the Dots network (the "Migrant flows" toggle) — one diagram, dots + toggleable
// flows. Each arrow runs red where people LEAVE (outflow) → green where they ARRIVE (inflow), thickness
// scaled to volume. It reads the SAME scene coordinates the dots use (centers + city sub-clusters from
// buildCenters/buildChronoDots), so arrows land on the same nodes with no reconciliation. It respects
// the Dots view's origin-isolate / focus-destination / scope filters.

const OUTFLOW = "#e0786b"; // red, people leaving (the arrow's tail end)
const INFLOW = "#7fd08a"; // green, people arriving (the arrow's head end)
const FLOW_MIN_W = 1.6; // thinnest arrow (always visible)
const FLOW_MAX_W = 8; // thickest arrow (the busiest flow)

/** Whether a civ is expanded (routes arrows to city sub-nodes). @param {*} state @param {number} id */
function expandedHas(state, id) {
  return !!(state.expanded && state.expanded.has(id));
}

// ── segment geometry ─────────────────────────────────────────────────────────────────────────────

/**
 * One endpoint for a flow at a civ: the civ centre (collapsed) or its capital's sub-centre (expanded),
 * plus the disc radius to trim the line back to. @param {*} center @param {boolean} expanded
 * @returns {{x:number, y:number, r:number}}
 */
function endpoint(center, expanded) {
  if (expanded && center.cities && center.cities.length) {
    const cap = center.cities[0];
    return { x: center.x + (cap.sx || 0), y: center.y + (cap.sy || 0), r: (cap.subR || 4) + 3 };
  }
  return { x: center.x, y: center.y, r: (center.clusterR || 8) + 6 };
}

/** A named city's sub-centre within an expanded civ, or null. @param {*} center @param {string} name */
function cityPoint(center, name) {
  for (const ct of center.cities || []) {
    if (ct.name === name) {
      return { x: center.x + (ct.sx || 0), y: center.y + (ct.sy || 0), r: (ct.subR || 4) + 3 };
    }
  }
  return null;
}

/**
 * Trim a straight segment back to each endpoint's disc edge, or null when the discs are too close.
 * @param {*} a Source {x,y,r}. @param {*} b Dest {x,y,r}. @param {{people:number}} meta @returns {*}
 */
function trimmed(a, b, meta) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len <= a.r + b.r + 6) return null;
  const ux = dx / len;
  const uy = dy / len;
  return { x0: a.x + ux * a.r, y0: a.y + uy * a.r, x1: b.x - ux * b.r, y1: b.y - uy * b.r, people: meta.people };
}

/** The city-level flow edges for a frame (fall back to civ-level for pre-city-tracking saves). @param {*} fr */
function flowEdges(fr) {
  const net = fr.network || {};
  return net.cityEdges && net.cityEdges.length ? net.cityEdges : net.edges || [];
}

/**
 * One endpoint, routed to a city when the civ is expanded (else the civ centre / capital).
 * @param {*} center @param {boolean} expanded @param {string} city @returns {{x:number,y:number,r:number}}
 */
function endCity(center, expanded, city) {
  if (expanded && city) {
    const p = cityPoint(center, city);
    if (p) return p;
  }
  return endpoint(center, expanded);
}

/**
 * Accumulate a collapsed civ→civ arrow (sum people across its city pairs).
 * @param {Map<string,*>} map @param {*} e @param {number} fi @param {number} ti
 */
function sumCollapsed(map, e, fi, ti) {
  const k = e.from + ">" + e.to;
  let a = map.get(k);
  if (!a) {
    a = { fi, ti, people: 0 };
    map.set(k, a);
  }
  a.people += e.people;
}

/** Whether the Dots filters exclude a cross-civ edge from `from` to `to`. @param {*} state @param {*} e */
function interFiltered(state, e) {
  if (state.show && state.show.immigrant === false) return true; // scope: immigrants hidden
  if (state.origin != null && e.from !== state.origin) return true; // isolate origin
  if (state.focusDest != null && e.to !== state.focusDest) return true; // focus a destination
  return false;
}

/**
 * Add one cross-civ edge (a collapsed accumulator entry, or a routed city→city arrow).
 * @param {*} e @param {*} holder @param {Map<string,*>} collapsed @param {*[]} segs
 */
function addInterEdge(e, holder, collapsed, segs) {
  if (!(e.people > 0)) return;
  const { state, centers, byId } = holder;
  if (interFiltered(state, e)) return;
  const fi = byId.get(e.from);
  const ti = byId.get(e.to);
  if (fi == null || ti == null || fi === ti) return;
  const se = expandedHas(state, e.from);
  const de = expandedHas(state, e.to);
  if (!se && !de) {
    sumCollapsed(collapsed, e, fi, ti);
    return;
  }
  const seg = trimmed(endCity(centers[fi], se, e.fromCity), endCity(centers[ti], de, e.toCity),
    { people: e.people });
  if (seg) segs.push(seg);
}

/** Append the cross-civ flow segments for a frame. @param {*} fr @param {*} holder @param {*[]} segs */
function interSegments(fr, holder, segs) {
  const { centers } = holder;
  /** @type {Map<string,*>} */
  const collapsed = new Map();
  for (const e of flowEdges(fr)) addInterEdge(e, holder, collapsed, segs);
  for (const a of collapsed.values()) {
    const seg = trimmed(endpoint(centers[a.fi], false), endpoint(centers[a.ti], false), { people: a.people });
    if (seg) segs.push(seg);
  }
}

/** One intra-civ move's segment, or null when filtered/unroutable. @param {*} m @param {*} holder @returns {*} */
function intraSeg(m, holder) {
  const { state, centers, byId } = holder;
  if (!expandedHas(state, m.civId) || !(m.people > 0)) return null;
  if (state.origin != null && m.civId !== state.origin) return null; // isolate: only that civ's internal moves
  const ci = byId.get(m.civId);
  if (ci == null) return null;
  const a = cityPoint(centers[ci], m.fromCity);
  const b = cityPoint(centers[ci], m.toCity);
  if (!a || !b) return null;
  return trimmed(a, b, { people: m.people });
}

/**
 * Append the intra-civ (city→city) flow segments for expanded civs.
 * @param {*} fr @param {*} holder @param {*[]} segs
 */
function intraSegments(fr, holder, segs) {
  if (holder.state.show && holder.state.show.internal === false) return; // scope: internal moves hidden
  for (const m of fr.intra || []) {
    const seg = intraSeg(m, holder);
    if (seg) segs.push(seg);
  }
}

/**
 * All flow segments to draw for the current frame (cross-civ everywhere, plus city→city inside any
 * expanded civ), filtered by the Dots view's origin-isolate / focus-destination / scope state.
 * @param {*} holder {state:{frameIdx, expanded, origin, focusDest, show}, centers, byId, frames}
 * @returns {*[]} Segments.
 */
export function buildFlowSegments(holder) {
  const fr = (holder.frames && holder.frames[holder.state.frameIdx]) || {};
  /** @type {*[]} */
  const segs = [];
  interSegments(fr, holder, segs);
  intraSegments(fr, holder, segs);
  return segs;
}

// ── arrow drawing ────────────────────────────────────────────────────────────────────────────────

/**
 * Draw the green arrowhead at a segment's tip, along the curve's end tangent.
 * @param {*} ctx @param {*} p {cx,cy,x1,y1} @param {number} w Line width.
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

/** The quadratic control point for a segment (a gentle sideways bow). @param {*} s @returns {{cx:number,cy:number}} */
function curveControl(s) {
  const dx = s.x1 - s.x0;
  const dy = s.y1 - s.y0;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const off = Math.min(40, len * 0.16);
  return { cx: (s.x0 + s.x1) / 2 - (dy / len) * off, cy: (s.y0 + s.y1) / 2 + (dx / len) * off };
}

/** Set the red→green gradient stroke for a flow line. @param {*} ctx @param {*} s @param {number} w */
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
 * Draw one flow as a curved red→green arrow, thickness ∝ its share of the busiest flow.
 * @param {*} ctx @param {*} s @param {number} maxP Busiest flow's people.
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

/** Draw all flow arrows for a frame (thickness relative to the busiest). @param {*} ctx @param {*[]} segs */
export function drawFlowArrows(ctx, segs) {
  const maxP = segs.reduce((/** @type {number} */ a, /** @type {*} */ s) => Math.max(a, s.people), 1);
  for (const s of segs) drawArrow(ctx, s, maxP);
}
