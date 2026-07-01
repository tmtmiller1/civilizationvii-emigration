// emigration-network-paint.js
//
// Destination-cluster dot rendering on a 2D canvas (clean, flat ; no glow/sparks). Each
// civilization is a CLUSTER; the migrants who arrived there are drawn as a swarm of small dots
// packed (phyllotaxis) around the cluster centre, each dot coloured by its ORIGIN civ. So a
// cluster shows where people went (its position/size) and where they came from (the dot colours).
// One dot represents a scaled chunk of people (see the unit in the caption), not one person.
// Pure drawing; the orchestrator owns layout, the dot set, state, and interaction.

import { withAlpha } from "/emigration/ui/emigration-civ-colors.js";

/**
 * @typedef {import("/emigration/ui/emigration-network-dots.js").Dot} Dot
 * @typedef {import("/emigration/ui/emigration-network-dots.js").NetworkNode} NetworkNode
 * @typedef {import("/emigration/ui/emigration-network-viz.js").Scene} Scene
 * @typedef {import("/emigration/ui/emigration-network-viz.js").VizState} VizState
 */

const CIV_PALETTE = [
  "#5aa9e6", "#f4a259", "#76c893", "#e5616b", "#b39ddb",
  "#c9a66b", "#7fb0d6", "#e29bbd", "#7fccc0", "#cbb994"
];
// Migrant-type (cause) colours for the "Type" lens. "native" is the resident (home-grown)
// population, drawn in each civ's own colour, shown muted-grey under the Type lens.
// These are canvas DOT FILLS, tuned to harmonize with `CIV_PALETTE` above (brighter, e.g. war
// #e5616b). They deliberately DIVERGE from `ACCENTS` in emigration-causes.js, which are the darker,
// more saturated tones used for text-adjacent toast/log accents (war #d24b3e). Keep them separate; a
// NEW cause needs a colour in BOTH maps.
/** @type {Record<string,string>} */
export const CAUSE_PALETTE = {
  war: "#e5616b", disaster: "#f4a259", unhappiness: "#b39ddb",
  prosperity: "#76c893", conquest: "#e29bbd", native: "#8a96a3", other: "#9fb6c6"
};

// Movement-scope colours for the "Movement" lens: home-grown residents vs people who moved BETWEEN
// this civ's own cities (internal) vs people who arrived from ANOTHER civ (immigrants).
/** @type {Record<string,string>} */
export const MOVE_PALETTE = { resident: "#6b7686", internal: "#7fb0d6", immigrant: "#f4a259" };

/**
 * Civ colour by index (cycled).
 * @param {number} i Index.
 * @returns {string} Hex colour.
 */
export function civColorByIndex(i) {
  return CIV_PALETTE[((i % CIV_PALETTE.length) + CIV_PALETTE.length) % CIV_PALETTE.length];
}

/**
 * Lighten a #rrggbb colour by mixing it toward white (used for the lighter intra-civ tint).
 * @param {string} hex A #rrggbb colour.
 * @param {number} amt 0 (unchanged) .. 1 (white).
 * @returns {string} The lightened colour.
 */
export function lighten(hex, amt) {
  const h = hex.replace("#", "");
  const mix = (/** @type {number} */ c) => Math.round(c + (255 - c) * amt);
  const to2 = (/** @type {number} */ c) => mix(c).toString(16).padStart(2, "0");
  return "#" + to2(parseInt(h.slice(0, 2), 16)) + to2(parseInt(h.slice(2, 4), 16)) + to2(parseInt(h.slice(4, 6), 16));
}

/**
 * Whether the multi-select cause filter hides this immigrant (its cause isn't among the selected).
 * @param {Dot} d Dot.
 * @param {VizState} state Interaction state.
 * @returns {boolean} True if filtered out.
 */
function causeFiltered(d, state) {
  return !!(state.causes && state.causes.size) && d.scope === "immigrant" && !state.causes.has(d.cause);
}

/**
 * Whether a dot passes the current filters (cause / origin / destination cluster / movement scope).
 * @param {Dot} d Dot.
 * @param {VizState} state Interaction state.
 * @returns {boolean} Visible.
 */
function dotActive(d, state) {
  // The cause filter (multi-select) only constrains immigrants; residents + internal are context.
  if (causeFiltered(d, state)) return false;
  if (state.origin != null && d.originId !== state.origin) return false;
  if (state.focusDest != null && d.destId !== state.focusDest) return false;
  if (state.scope && d.scope !== state.scope) return false;
  return true;
}

/**
 * Draw the faint per-city sub-cluster discs inside a civ circle (only once each city has been
 * founded at the current time).
 * @param {CanvasRenderingContext2D} ctx Context.
 * @param {*} c Civ centre.
 * @param {number} now Current frame index.
 */
export function drawCityDiscs(ctx, c, now) {
  // City/town discs are a BRIGHTER shade of the civ's colour than the civ-circle fill, so they read
  // as distinct patches inside it (towns dotted, cities solid).
  const fill = withAlpha(lighten(c.fillColor || "#e5d2ac", 0.18), 0.34);
  for (const city of c.cities || []) {
    if (!(city.subR > 0) || now < (city.bornFrame == null ? 0 : city.bornFrame)) continue;
    ctx.fillStyle = fill;
    ctx.strokeStyle = "rgba(229,210,172,0.28)";
    ctx.lineWidth = 0.9; // city/town lines are thinner than the civ boundary
    ctx.setLineDash(city.town ? [2.4, 2.4] : []); // towns dotted, cities solid
    ctx.beginPath();
    ctx.arc(c.x + city.sx, c.y + city.sy, city.subR + 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

/**
 * Draw a civ's boundary circle: a translucent fill in the civ's own (readable) colour, then a solid
 * gold stroke a little thicker than the city/town lines.
 * @param {CanvasRenderingContext2D} ctx Context.
 * @param {*} c Civ centre.
 */
export function drawCivCircle(ctx, c) {
  if (!(c.clusterR > 0)) return;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(c.x, c.y, c.clusterR + 6, 0, Math.PI * 2);
  if (c.fillColor) {
    ctx.fillStyle = withAlpha(c.fillColor, 0.16);
    ctx.fill();
  }
  ctx.strokeStyle = "rgba(201,162,76,0.32)";
  ctx.lineWidth = 1.8; // civ boundary is the thickest of the three (civ > city > town-by-dash)
  ctx.stroke();
}

/**
 * Draw the civ boundary discs plus their city sub-discs behind the dots.
 * @param {CanvasRenderingContext2D} ctx Context.
 * @param {*} scene Scene.
 */
function drawClusterDiscs(ctx, scene) {
  const now = typeof scene.state.frameIdx === "number" ? scene.state.frameIdx : Infinity;
  for (const c of scene.centers) {
    if (!(c.clusterR > 0)) continue;
    drawCivCircle(ctx, c);
    drawCityDiscs(ctx, c, now);
  }
}

// Event-cause colours (also used by the timeline badges below).
/** @type {Record<string,string>} */
const EVENT_COLOR = { disaster: "#e0913c", war: "#e5616b" };
const EVENT_FADE = 8; // frames the cohort highlight lingers + fades after an event ends

/**
 * Highlight strength (0..1) for an event-caused dot at the current time: full while the event's
 * label is on the timeline, then fading out over the next EVENT_FADE frames.
 * @param {number} now Current frame index.
 * @param {*} d Dot (carries evFrom/evTo).
 * @returns {number} Strength 0..1.
 */
function eventGlow(now, d) {
  if (now < d.evFrom) return 0;
  if (now <= d.evTo) return 1;
  if (now <= d.evTo + EVENT_FADE) return 1 - (now - d.evTo) / EVENT_FADE;
  return 0;
}

/**
 * Ring a dot in its event's colour while that event is active (and briefly after, fading), so the
 * migrants a disaster/war drove are visually tied to its timeline popup.
 * @param {CanvasRenderingContext2D} ctx Context.
 * @param {*} d Dot (carries evKind/evFrom/evTo).
 * @param {*} p Position {x, y, on}.
 * @param {number} now Current frame index.
 */
function drawEventRing(ctx, d, p, now) {
  const g = eventGlow(now, d);
  if (g <= 0) return;
  ctx.globalAlpha = g * (p.on ? 0.95 : 0.4);
  ctx.strokeStyle = EVENT_COLOR[d.evKind] || EVENT_COLOR.disaster;
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.arc(p.x, p.y, (p.on ? 1.5 : 1.0) + 1.9, 0, Math.PI * 2);
  ctx.stroke();
}

/**
 * A dot's current canvas position. Its target is the settled slot in its destination cluster;
 * while a new arrival is animating in (anim.p < 1) it travels from its origin toward that slot,
 * ease-in (starts slow, accelerates into the destination) so playback shows people move.
 * @param {Dot} d Dot.
 * @param {NetworkNode} c The dot's destination centre.
 * @returns {{x:number, y:number}} Canvas position.
 */
function dotXY(d, c) {
  let x = c.x + d.ox;
  let y = c.y + d.oy;
  if (d.anim && d.anim.p < 1) {
    const e = d.anim.p * d.anim.p; // ease-in
    x = d.anim.fromX + (x - d.anim.fromX) * e;
    y = d.anim.fromY + (y - d.anim.fromY) * e;
  }
  return { x, y };
}

/**
 * Whether a dot is not on screen at frame `now`: not yet arrived, already gone (declined), or a
 * resident while residents are toggled off.
 * @param {Dot} d Dot.
 * @param {VizState} state Interaction state.
 * @param {number} now Current frame index.
 * @returns {boolean} True if it should be skipped.
 */
function dotHidden(d, state, now) {
  if (d.appearFrame > now) return true;
  if (d.disappearFrame != null && now >= d.disappearFrame) return true;
  return !!(state.show && state.show[d.scope] === false); // scope toggled off
}

/**
 * Draw the migrant dots (origin-coloured) packed around their destination clusters.
 * @param {CanvasRenderingContext2D} ctx Context.
 * @param {Scene} scene Scene.
 */
function drawDots(ctx, scene) {
  const { centers, dots, state } = scene;
  const now = typeof state.frameIdx === "number" ? state.frameIdx : Infinity;
  for (const d of dots) {
    if (dotHidden(d, state, now)) continue;
    const on = dotActive(d, state);
    const { x, y } = dotXY(d, centers[d.ci]);
    ctx.globalAlpha = on ? 0.92 : 0.05;
    ctx.fillStyle = d.colors[state.lens] || d.colors.origin;
    ctx.beginPath();
    ctx.arc(x, y, on ? 1.5 : 1.0, 0, Math.PI * 2);
    ctx.fill();
    if (d.evKind) drawEventRing(ctx, d, { x, y, on }, now);
  }
  ctx.globalAlpha = 1;
}

/**
 * Draw one civ/place name label to match the Demographics global-relations node labels
 * (.demographics-relations-node-label): the UI BODY font (BodyFont, the same family the
 * historical-data chart labels use), weight 600, the secondary parchment colour
 * (--ia-text-secondary = #e5d2ac), and NOTHING else, no glow, no outline, no double-draw. The
 * relations labels are crisp plain text on a dark backdrop; the old soft glow + doubled fill is
 * exactly what made these read fuzzy by comparison. Crispness now comes from the Hi-DPI canvas
 * backing (makeCanvas) rendering the text at device resolution, like the DOM labels.
 * @param {CanvasRenderingContext2D} ctx Context.
 * @param {string} name Label text.
 * @param {number} x Centre x. @param {number} y Centre y.
 * @param {number} [size] Font px (default 15).
 */
function drawCivLabel(ctx, name, x, y, size) {
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = labelFont(size);
  ctx.fillStyle = "#e5d2ac";
  ctx.fillText(name, x, y);
  ctx.restore();
}

/**
 * The label font string for a given size. BodyFont stack (with CJK + TitilliumWeb fallbacks),
 * matching chart-line.js / the relations labels, NOT TitleFont (the display face reads differently).
 * @param {number} [size] Font px (default 15).
 * @returns {string} A CSS font string.
 */
function labelFont(size) {
  return "600 " + (size || 15)
    + "px BodyFont, BodyFont-SC, BodyFont-TC, BodyFont-JP, BodyFont-KR, TitilliumWeb, sans-serif";
}

/**
 * @typedef {Object} LabelReq A label placement request.
 * @property {string} text  Label text.
 * @property {number} x     Centre x (fixed; only the y is nudged to avoid overlap).
 * @property {number} y     Preferred centre y.
 * @property {number} [size] Font px.
 * @property {number} priority Higher = placed first (anchors); lower nudges around it.
 */

/** Axis-aligned box overlap test. */
function boxesOverlap(/** @type {*} */ a, /** @type {*} */ b) {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
}

/** Whether a box overlaps any already-placed box. @param {*} b @param {*[]} placed */
function overlapsAny(b, placed) {
  for (const p of placed) if (boxesOverlap(b, p)) return true;
  return false;
}

/**
 * A non-overlapping centre-y for a label: its preferred y if free, else nudged outward in 2px rings
 * (up first, then down) until clear. Gives up at the preferred y after a bounded search.
 * @param {(y:number)=>*} makeBox Builds the label box at a candidate y.
 * @param {number} y0 Preferred centre y.
 * @param {*[]} placed Already-placed boxes.
 * @returns {number} The chosen centre y.
 */
function resolveY(makeBox, y0, placed) {
  if (!overlapsAny(makeBox(y0), placed)) return y0;
  for (let i = 1; i <= 18; i++) {
    for (const dir of [-1, 1]) {
      const y = y0 + dir * 2 * i;
      if (!overlapsAny(makeBox(y), placed)) return y;
    }
  }
  return y0;
}

/**
 * Draw a set of labels with greedy overlap avoidance: higher-priority labels (civilizations) anchor
 * at their preferred spot, and lower-priority ones (settlements) are nudged vertically so labels
 * never physically collide. Same crisp styling as drawCivLabel.
 * @param {CanvasRenderingContext2D} ctx Context.
 * @param {LabelReq[]} labels Label requests.
 */
export function drawLabelsNoOverlap(ctx, labels) {
  const order = labels.slice().sort((a, b) => (b.priority - a.priority) || (a.y - b.y));
  /** @type {*[]} */
  const placed = [];
  for (const L of order) {
    ctx.font = labelFont(L.size);
    const halfW = ctx.measureText(L.text).width / 2 + 1;
    const halfH = (L.size || 15) * 0.6;
    const makeBox = (/** @type {number} */ yy) =>
      ({ x0: L.x - halfW, y0: yy - halfH, x1: L.x + halfW, y1: yy + halfH });
    const y = resolveY(makeBox, L.y, placed);
    placed.push(makeBox(y));
    drawCivLabel(ctx, L.text, L.x, y, L.size);
  }
}

/**
 * Draw destination name labels above each cluster.
 * @param {CanvasRenderingContext2D} ctx Context.
 * @param {*[]} centers Cluster centres.
 */
function drawLabels(ctx, centers) {
  /** @type {*[]} */
  const labels = [];
  for (const c of centers) {
    if (c.name) labels.push({ text: c.name, x: c.x, y: c.y - (c.clusterR || 6) - 10, size: 15, priority: 2 });
  }
  drawLabelsNoOverlap(ctx, labels);
}

/**
 * Draw a small event badge (coloured dot + label) just below a cluster.
 * @param {CanvasRenderingContext2D} ctx Context.
 * @param {*} c Cluster centre.
 * @param {*} ev Resolved event.
 */
function drawEventBadge(ctx, c, ev) {
  const color = EVENT_COLOR[ev.kind] || EVENT_COLOR.disaster;
  const y = c.y + (c.clusterR || 6) + 13;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.font = "600 10px BodyFont, sans-serif";
  const text = "⚑ " + ev.label;
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#10131b";
  ctx.strokeText(text, c.x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, c.x, y);
}

/**
 * Draw the event labels active at the current time, near each affected cluster.
 * @param {CanvasRenderingContext2D} ctx Context.
 * @param {*} scene Scene.
 */
function drawEvents(ctx, scene) {
  const now = typeof scene.state.frameIdx === "number" ? scene.state.frameIdx : Infinity;
  for (const ev of scene.events || []) {
    if (now < ev.from || now > ev.to) continue;
    for (const ci of ev.cis) {
      const c = scene.centers[ci];
      if (c) drawEventBadge(ctx, c, ev);
    }
  }
}

/**
 * Coerce an optional number to 0.
 * @param {number|undefined} v Value.
 * @returns {number} v or 0.
 */
function n0(v) {
  return v || 0;
}

/**
 * The city→city segment for an internal mover, or null.
 * @param {Dot} d Dot.
 * @param {NetworkNode} dest The civ centre.
 * @returns {*} Segment or null.
 */
function internalSegment(d, dest) {
  const cs = dest.cities || [];
  const fc = d.fromCityIdx != null ? cs[d.fromCityIdx] : null;
  const tc = cs[d.cityIdx];
  if (!fc || !tc || d.fromCityIdx === d.cityIdx) return null;
  return {
    x0: dest.x + n0(fc.sx), y0: dest.y + n0(fc.sy),
    x1: dest.x + n0(tc.sx), y1: dest.y + n0(tc.sy),
    color: d.colors.origin, key: "n" + d.ci + ":" + d.fromCityIdx + ">" + d.cityIdx
  };
}

/**
 * A point at a civ centre, offset to one of its city sub-centres when that index is known.
 * @param {NetworkNode} center Civ centre.
 * @param {number|undefined} idx City index.
 * @returns {{x:number, y:number}} Point.
 */
function cityXYOr(center, idx) {
  const cs = center.cities || [];
  if (idx != null && cs[idx]) return { x: center.x + n0(cs[idx].sx), y: center.y + n0(cs[idx].sy) };
  return { x: center.x, y: center.y };
}

/**
 * The origin-city→destination-city segment for an immigrant (falls back to civ centres when the
 * cities aren't known), or null.
 * @param {Dot} d Dot.
 * @param {Scene} scene Scene.
 * @returns {*} Segment or null.
 */
function immigrantSegment(d, scene) {
  const dest = scene.centers[d.ci];
  const oi = scene.byId.get(d.originId);
  const oc = oi != null ? scene.centers[oi] : null;
  if (!oc || oc === dest) return null;
  const o = cityXYOr(oc, d.fromCivCityIdx);
  const t = cityXYOr(dest, d.cityIdx);
  return { x0: o.x, y0: o.y, x1: t.x, y1: t.y, color: d.colors.origin,
    key: "i" + d.originId + ":" + (d.fromCivCityIdx == null ? "" : d.fromCivCityIdx) +
      ">" + d.destId + ":" + d.cityIdx };
}

/**
 * The origin→destination segment for a migration dot (city→city internal, civ→civ immigrant), or
 * null for residents.
 * @param {Dot} d Dot.
 * @param {Scene} scene Scene.
 * @returns {*} Segment {x0,y0,x1,y1,color,key} or null.
 */
function flowSegment(d, scene) {
  if (d.scope === "internal") return internalSegment(d, scene.centers[d.ci]);
  if (d.scope === "immigrant") return immigrantSegment(d, scene);
  return null;
}

/**
 * Draw one aggregated flow as a gently-curved line, thickness scaled to how many migrants it
 * carries, with a dot marking the ORIGIN end (where they came from).
 * @param {CanvasRenderingContext2D} ctx Context.
 * @param {*} f Aggregated segment {x0,y0,x1,y1,color,count}.
 */
function drawFlowLine(ctx, f) {
  const dx = f.x1 - f.x0;
  const dy = f.y1 - f.y0;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const off = Math.min(38, len * 0.16);
  const cx = (f.x0 + f.x1) / 2 - (dy / len) * off;
  const cy = (f.y0 + f.y1) / 2 + (dx / len) * off;
  ctx.strokeStyle = f.color;
  ctx.lineWidth = Math.min(4.5, 0.7 + Math.sqrt(f.count) * 0.5);
  ctx.globalAlpha = 0.6;
  ctx.beginPath();
  ctx.moveTo(f.x0, f.y0);
  ctx.quadraticCurveTo(cx, cy, f.x1, f.y1);
  ctx.stroke();
  ctx.fillStyle = f.color;
  ctx.beginPath();
  ctx.arc(f.x0, f.y0, 2.6, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Draw the currently-active migration as aggregated origin→destination lines (toggle: showFlows).
 * Only visible, non-dimmed migrants count, so isolating a cause/origin shows just those paths.
 * @param {CanvasRenderingContext2D} ctx Context.
 * @param {Scene} scene Scene.
 */
function drawFlows(ctx, scene) {
  const { dots, state } = scene;
  const now = typeof state.frameIdx === "number" ? state.frameIdx : Infinity;
  /** @type {Map<string,*>} */
  const agg = new Map();
  for (const d of dots) {
    if (dotHidden(d, state, now) || !dotActive(d, state)) continue;
    const seg = flowSegment(d, scene);
    if (!seg) continue;
    const a = agg.get(seg.key);
    if (a) a.count++;
    else {
      seg.count = 1;
      agg.set(seg.key, seg);
    }
  }
  for (const f of agg.values()) drawFlowLine(ctx, f);
  ctx.globalAlpha = 1;
}

/**
 * Paint one frame: cluster discs, dots, optional origin-flow lines, labels, then events.
 * @param {CanvasRenderingContext2D} ctx Context.
 * @param {Scene} scene Scene.
 */
export function paint(ctx, scene) {
  ctx.clearRect(0, 0, scene.WX, scene.WY);
  drawClusterDiscs(ctx, scene);
  drawDots(ctx, scene);
  if (scene.state.showFlows) drawFlows(ctx, scene);
  drawLabels(ctx, scene.centers);
  drawEvents(ctx, scene);
}
