// emigration-network-interact.js
//
// Pointer interaction for the migration view: the cursor-following tooltip, the hover ETHNICITY
// breakdown (a city or civ's make-up by origin civ), drag-to-rearrange the civ circles, and
// click-to-isolate a cluster. Kept apart from the orchestrator (emigration-network-viz.js) so that
// file stays focused on layout + chrome + playback.

/**
 * @typedef {import("/emigration/ui/emigration-network-dots.js").Dot} Dot
 * @typedef {import("/emigration/ui/emigration-network-dots.js").NetworkNode} NetworkNode
 * @typedef {import("/emigration/ui/emigration-network-viz.js").Scene} Scene
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
 * Localize a LOC key, falling back to `fallback` when unresolved/off-engine.
 * @param {string} key LOC key.
 * @param {string} fallback English fallback.
 * @returns {string} Localized (or fallback) string.
 */
function loc(key, fallback) {
  try {
    if (typeof Locale !== "undefined" && Locale.compose) {
      const v = Locale.compose(key);
      if (typeof v === "string" && v && !v.startsWith("LOC_")) return v;
    }
  } catch (_) {
    /* ignore */
  }
  return fallback;
}

/**
 * Escape a value for safe interpolation into tooltip HTML.
 * @param {*} s Value.
 * @returns {string} Escaped text.
 */
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Create the cursor-following tooltip.
 * @param {HTMLElement} wrap Wrapper.
 * @returns {*} Tooltip API.
 */
export function makeTooltip(wrap) {
  const tip = el("div", "emig-netc-tip");
  wrap.appendChild(tip);
  return {
    setHTML: (/** @type {string} */ h) => {
      tip.innerHTML = h;
    },
    show: () => {
      tip.style.display = "block";
    },
    hide: () => {
      tip.style.display = "none";
    },
    move: (/** @type {*} */ ev) => {
      const r = wrap.getBoundingClientRect();
      tip.style.left = ev.clientX - r.left + "px";
      tip.style.top = ev.clientY - r.top + "px";
    }
  };
}

/**
 * Map a pointer event to logical canvas coordinates (the wide rectangle the layout uses).
 * @param {HTMLCanvasElement} canvas Canvas.
 * @param {*} ev Event.
 * @param {number} WX Logical canvas width.
 * @param {number} WY Logical canvas height.
 * @returns {{x:number,y:number}} Logical coords.
 */
function toLogical(canvas, ev, WX, WY) {
  const r = canvas.getBoundingClientRect();
  return { x: ((ev.clientX - r.left) / r.width) * WX, y: ((ev.clientY - r.top) / r.height) * WY };
}

/**
 * The civ cluster whose disc contains (x,y), nearest first, or null.
 * @param {Scene} scene Scene.
 * @param {number} x Logical x.
 * @param {number} y Logical y.
 * @returns {NetworkNode|null} Centre or null.
 */
function nearestCluster(scene, x, y) {
  let best = null;
  let bd = 1e9;
  for (const c of scene.centers) {
    const dd = (c.x - x) * (c.x - x) + (c.y - y) * (c.y - y);
    const r = (c.clusterR || 6) + 14;
    if (dd <= r * r && dd < bd) {
      bd = dd;
      best = c;
    }
  }
  return best;
}

/**
 * Squared distance from (x,y) to a city sub-centre if the pointer is within its disc (and it's
 * founded at `now`), else Infinity.
 * @param {NetworkNode} c Civ centre.
 * @param {*} cm City meta.
 * @param {number} x Logical x.
 * @param {number} y Logical y.
 * @param {number} now Current frame index.
 * @returns {number} Squared distance, or Infinity.
 */
function cityHitDist(c, cm, x, y, now) {
  if (!((cm.subR || 0) > 0) || now < (cm.bornFrame == null ? 0 : cm.bornFrame)) return Infinity;
  const cx = c.x + (cm.sx || 0);
  const cy = c.y + (cm.sy || 0);
  const dd = (cx - x) * (cx - x) + (cy - y) * (cy - y);
  const r = (cm.subR || 0) + 5;
  return dd <= r * r ? dd : Infinity;
}

/**
 * The (civ, city) sub-cluster under (x,y), or null.
 * @param {Scene} scene Scene.
 * @param {number} x Logical x.
 * @param {number} y Logical y.
 * @returns {{ci:number, cityIdx:number, center:NetworkNode, city:*}|null} The city, or null.
 */
function nearestCity(scene, x, y) {
  const now = typeof scene.state.frameIdx === "number" ? scene.state.frameIdx : Infinity;
  let best = null;
  let bd = 1e9;
  for (let ci = 0; ci < scene.centers.length; ci++) {
    const c = scene.centers[ci];
    const cities = c.cities || [];
    for (let k = 0; k < cities.length; k++) {
      const dd = cityHitDist(c, cities[k], x, y, now);
      if (dd < bd) {
        bd = dd;
        best = { ci, cityIdx: k, center: c, city: cities[k] };
      }
    }
  }
  return best;
}

/**
 * Composition by ORIGIN civ ("ethnicity") of the visible dots matching a predicate, at the current
 * frame. Residents + internal movers count as the home civ; immigrants as their origin civ.
 * @param {Scene} scene Scene.
 * @param {(d:Dot)=>boolean} keep Dot predicate.
 * @returns {{counts:Map<number,number>, total:number}} Per-origin counts + total.
 */
function composition(scene, keep) {
  const now = typeof scene.state.frameIdx === "number" ? scene.state.frameIdx : Infinity;
  /** @type {Map<number,number>} */
  const counts = new Map();
  let total = 0;
  for (const d of scene.dots) {
    if (d.appearFrame > now || (d.disappearFrame != null && now >= d.disappearFrame)) continue;
    if (!keep(d)) continue;
    counts.set(d.originId, (counts.get(d.originId) || 0) + 1);
    total++;
  }
  return { counts, total };
}

/**
 * An ethnicity-breakdown tooltip (title + top origin civs by share, with colour swatches).
 * @param {Scene} scene Scene.
 * @param {string} title Heading.
 * @param {(d:Dot)=>boolean} keep Dot predicate.
 * @returns {string} Tooltip HTML.
 */
function breakdownTip(scene, title, keep) {
  const { counts, total } = composition(scene, keep);
  if (!total) {
    return `<b>${esc(title)}</b><br>${esc(loc("LOC_EMIG_NETC_NOPOP", "no population yet"))}`;
  }
  const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  let html = `<b>${esc(title)}</b>`;
  for (const [oid, n] of rows) {
    const node = scene.centers[scene.byId.get(oid) || 0];
    const color = (node && node.color) || "#9fb6c6";
    const name = (node && node.name) || ("#" + oid);
    html += `<br><span class="emig-netc-tip-sw" style="background:${esc(color)}"></span>` +
      `${esc(name)} ${Math.round((n / total) * 100)}%`;
  }
  return html;
}

/**
 * Show the ethnicity breakdown for whatever is under the pointer: a city, else a civ, else hide.
 * @param {*} ev Event.
 * @param {HTMLCanvasElement} canvas Canvas.
 * @param {*} holder Render holder.
 * @param {*} tip Tooltip API.
 */
function showHoverTip(ev, canvas, holder, tip) {
  tip.move(ev);
  const scene = holder.scene;
  const pt = toLogical(canvas, ev, scene.WX, scene.WY);
  const city = nearestCity(scene, pt.x, pt.y);
  if (city) {
    const title = city.city.name + " · " + city.center.name;
    tip.setHTML(breakdownTip(scene, title,
      (/** @type {Dot} */ d) => d.ci === city.ci && d.cityIdx === city.cityIdx));
    tip.show();
    return;
  }
  const c = nearestCluster(scene, pt.x, pt.y);
  if (c) {
    const ci = scene.byId.get(c.id);
    tip.setHTML(breakdownTip(scene, c.name, (/** @type {Dot} */ d) => d.ci === ci));
    tip.show();
  } else {
    tip.hide();
  }
}

/**
 * Pointer move: drag the grabbed cluster, else show the hover breakdown.
 * @param {*} ev Event.
 * @param {HTMLCanvasElement} canvas Canvas.
 * @param {*} holder Render holder.
 * @param {*} tip Tooltip API.
 * @param {*} drag Drag state.
 */
function onMove(ev, canvas, holder, tip, drag) {
  if (drag.node) {
    const pt = toLogical(canvas, ev, holder.scene.WX, holder.scene.WY);
    const r = drag.node.clusterR || 8;
    drag.node.x = Math.max(r, Math.min(holder.scene.WX - r, pt.x - drag.dx));
    drag.node.y = Math.max(r, Math.min(holder.scene.WY - r, pt.y - drag.dy));
    if (Math.abs(pt.x - drag.downX) + Math.abs(pt.y - drag.downY) > 3) drag.moved = true;
    holder.dirty = true;
    tip.hide();
    return;
  }
  showHoverTip(ev, canvas, holder, tip);
}

/**
 * Pointer down: grab the cluster under the cursor to drag it (pinned so the sim won't fight it).
 * @param {*} ev Event.
 * @param {HTMLCanvasElement} canvas Canvas.
 * @param {*} holder Render holder.
 * @param {*} drag Drag state.
 */
function onDown(ev, canvas, holder, drag) {
  const pt = toLogical(canvas, ev, holder.scene.WX, holder.scene.WY);
  const c = nearestCluster(holder.scene, pt.x, pt.y);
  if (!c) return;
  drag.node = c;
  drag.dx = pt.x - c.x;
  drag.dy = pt.y - c.y;
  drag.downX = pt.x;
  drag.downY = pt.y;
  drag.moved = false;
  c.pinned = true;
  canvas.style.cursor = "grabbing";
}

/**
 * Pointer up: end a drag. A press that didn't move is a click, toggle isolating that cluster.
 * @param {HTMLCanvasElement} canvas Canvas.
 * @param {*} holder Render holder.
 * @param {*} state Interaction state.
 * @param {*} drag Drag state.
 */
function onUp(canvas, holder, state, drag) {
  if (!drag.node) return;
  if (!drag.moved) {
    state.focusDest = state.focusDest !== drag.node.id ? drag.node.id : null;
  }
  drag.node.pinned = false;
  drag.node = null;
  holder.dirty = true;
  canvas.style.cursor = "grab";
}

/**
 * Wire canvas pointer events: hover breakdown + drag-to-rearrange + click-to-isolate.
 * @param {HTMLCanvasElement} canvas Canvas.
 * @param {*} holder Render holder.
 * @param {*} state Interaction state.
 * @param {*} tip Tooltip API.
 */
export function wireEvents(canvas, holder, state, tip) {
  /** @type {*} */
  const drag = { node: null, dx: 0, dy: 0, downX: 0, downY: 0, moved: false };
  canvas.style.cursor = "grab";
  canvas.addEventListener("mousedown", (/** @type {*} */ ev) => onDown(ev, canvas, holder, drag));
  canvas.addEventListener("mousemove", (/** @type {*} */ ev) => onMove(ev, canvas, holder, tip, drag));
  canvas.addEventListener("mouseup", () => onUp(canvas, holder, state, drag));
  canvas.addEventListener("mouseleave", () => {
    tip.hide();
    onUp(canvas, holder, state, drag);
  });
}
