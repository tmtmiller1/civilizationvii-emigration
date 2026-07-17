// emigration-network-timeline.js
//
// The migration-view TIMELINE control: an age-split band (one labelled segment per age), a
// full-width scrubber, a red vertical line at every age boundary, ~8 turn ticks (turns reset each
// age, mirroring the in-game per-age turn counter), and a controls row (play/pause, current-time
// label, playback speed). Styling lives in the orchestrator's injected stylesheet; this module just
// builds the DOM and returns goTo/setPlaying so the orchestrator's playback driver can move it.

import { causeAccent } from "/emigration/ui/emigration-causes.js";

// The timeline's stylesheet, concatenated into the network view's injected sheet (emigration-network-viz
// injectStyle). Co-located with the component it styles. GameFace-safe: hex/rgba, flexbox, explicit
// properties, and CSS-DRAWN play/pause + playhead (no glyphs — ⏸ renders as invisible tofu in-game).
export const TIMELINE_CSS =
  ".emig-netc-time{display:flex;flex-direction:column;gap:0.4rem;margin:0.5rem 0;width:90%;}" +
  ".emig-netc-tl{position:relative;background:rgba(8,10,16,0.5);border-radius:0.4rem;" +
  "border:0.0555rem solid rgba(201,162,76,0.35);padding:0.35rem 0.6rem 1.25rem;}" +
  ".emig-netc-ages{display:flex;width:100%;height:1rem;position:relative;z-index:1;}" +
  ".emig-netc-age{flex:1 1 0;text-align:center;font-size:var(--dg-fs-85);color:#f0dca8;opacity:0.92;" +
  "text-transform:uppercase;letter-spacing:0.06rem;white-space:nowrap;overflow:hidden;}" +
  // Rail: a visible track + gold progress fill + a bright playhead; the native range sits on top,
  // fully transparent, purely to handle click / drag / keyboard scrubbing.
  ".emig-netc-rail{position:relative;width:100%;height:1.2rem;margin:0.4rem 0 0;z-index:1;}" +
  ".emig-netc-track{position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);height:0.5rem;" +
  "border-radius:0.3rem;background:rgba(201,162,76,0.16);border:0.0555rem solid rgba(201,162,76,0.4);}" +
  ".emig-netc-fill{position:absolute;left:0;top:50%;transform:translateY(-50%);height:0.5rem;width:100%;" +
  "border-radius:0.3rem;background:linear-gradient(180deg,#f7cf5e,#c99a2e);" +
  "box-shadow:0 0 0.3rem rgba(243,195,76,0.45);}" +
  ".emig-netc-rail input{position:absolute;left:0;top:0;width:100%;height:100%;margin:0;padding:0;" +
  "background:transparent;-webkit-appearance:none;appearance:none;cursor:pointer;z-index:3;" +
  // Hide any text the native range renders as a fallback (GameFace draws its value/min — a stray "0" —
  // on the line once the slider track/thumb are transparent). Kept fully interactive.
  "color:transparent;font-size:0;text-indent:-999rem;overflow:hidden;}" +
  ".emig-netc-rail input::-webkit-slider-runnable-track{height:100%;background:transparent;border:none;}" +
  ".emig-netc-rail input::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;" +
  "width:1.2rem;height:1.2rem;background:transparent;border:none;}" +
  ".emig-netc-head{position:absolute;top:-0.32rem;bottom:-0.32rem;left:100%;width:0.16rem;" +
  "transform:translateX(-50%);background:#fff2cf;border-radius:0.08rem;z-index:2;pointer-events:none;" +
  "box-shadow:0 0 0.4rem rgba(255,238,180,0.85),0 0 0.12rem rgba(0,0,0,0.6);}" +
  ".emig-netc-head::before{content:'';position:absolute;left:50%;top:-0.36rem;width:0.62rem;height:0.62rem;" +
  "transform:translateX(-50%);border-radius:50%;background:#fff2cf;border:0.0833rem solid #7a5f1e;" +
  "box-shadow:0 0 0.32rem rgba(255,238,180,0.85);}" +
  ".emig-netc-marks{position:absolute;left:0.6rem;right:0.6rem;top:0;bottom:0;" +
  "pointer-events:none;z-index:1;}" +
  ".emig-netc-sep{position:absolute;top:0;bottom:1.05rem;width:0.14rem;transform:translateX(-50%);" +
  "background:#d8483f;opacity:0.85;}" +
  ".emig-netc-minor{position:absolute;bottom:0.62rem;transform:translateX(-50%);width:0.055rem;" +
  "height:0.28rem;background:rgba(201,162,76,0.45);}" +
  ".emig-netc-tick{position:absolute;bottom:0;transform:translateX(-50%);font-size:var(--dg-fs-72);" +
  "color:#cbb98f;white-space:nowrap;}" +
  ".emig-netc-tick::before{content:'';position:absolute;left:50%;top:-0.42rem;width:0.07rem;" +
  "height:0.34rem;background:rgba(201,162,76,0.7);transform:translateX(-50%);}" +
  // EVENT PINS: the wars/disasters that drove the migration, pinned at the frame they landed on.
  // The marks layer is pointer-events:none (it sits over the scrubber), so each pin re-enables
  // pointer events for itself to be clickable/hoverable without blocking scrubbing elsewhere.
  // The per-kind FILL is set inline from the shared causeAccent() taxonomy (the same colours the
  // notifications log and toasts theme with), so the palette has one source of truth — never
  // hard-code an event colour here.
  ".emig-netc-pin{position:absolute;top:0.1rem;width:0.62rem;height:0.62rem;" +
  "transform:translateX(-50%);border-radius:50%;cursor:pointer;pointer-events:auto;" +
  "border:0.0555rem solid rgba(8,10,16,0.75);box-shadow:0 0 0.22rem rgba(0,0,0,0.55);}" +
  ".emig-netc-pin:hover{transform:translateX(-50%) scale(1.25);}" +
  ".emig-netc-pin-tip{position:absolute;bottom:1.1rem;left:50%;transform:translateX(-50%);" +
  "display:none;white-space:nowrap;z-index:6;pointer-events:none;" +
  "background:rgba(8,10,16,0.95);border:0.0555rem solid rgba(201,162,76,0.5);border-radius:0.3rem;" +
  "padding:0.15rem 0.4rem;font-size:var(--dg-fs-85);color:#f0dca8;" +
  "box-shadow:0 0.1rem 0.4rem rgba(0,0,0,0.6);}" +
  ".emig-netc-pin:hover .emig-netc-pin-tip{display:block;}" +
  ".emig-netc-ctrl{display:flex;align-items:center;gap:0.5rem;}" +
  ".emig-netc-spacer{flex:1 1 auto;}" +
  // CSS-DRAWN play/pause: a triangle by default, two bars when .playing.
  ".emig-netc-play{position:relative;flex:0 0 auto;width:1.9rem;height:1.9rem;border-radius:50%;" +
  "cursor:pointer;user-select:none;background:linear-gradient(180deg,#f7cf5e,#c99a2e);" +
  "border:0.0833rem solid #7a5f1e;box-shadow:0 0.08rem 0.25rem rgba(0,0,0,0.5);}" +
  ".emig-netc-play:hover{background:linear-gradient(180deg,#ffdd78,#d9a838);}" +
  ".emig-netc-play::before{content:'';position:absolute;top:50%;left:50%;" +
  "transform:translate(-34%,-50%);width:0;height:0;border-style:solid;" +
  "border-width:0.42rem 0 0.42rem 0.66rem;border-color:transparent transparent transparent #241a08;}" +
  ".emig-netc-play::after{content:'';position:absolute;top:50%;left:50%;width:0;height:0;}" +
  ".emig-netc-play.playing::before{border-width:0;border-radius:0.05rem;width:0.2rem;height:0.85rem;" +
  "background:#241a08;transform:translate(-160%,-50%);}" +
  ".emig-netc-play.playing::after{width:0.2rem;height:0.85rem;border-radius:0.05rem;background:#241a08;" +
  "transform:translate(60%,-50%);}" +
  ".emig-netc-speed{display:flex;gap:0.2rem;}" +
  ".emig-netc-speed .emig-netc-chip{font-size:var(--dg-fs-85);padding:0.06rem 0.5rem;}" +
  ".emig-netc-time-lbl{font-size:var(--dg-fs-95);color:#f0dca8;opacity:0.9;min-width:8rem;}";

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
 * Localize a LOC key, falling back to `fallback` (substituting {1_X} placeholders with `args`).
 * @param {string} key LOC key.
 * @param {string} fallback English fallback.
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

/**
 * Pretty age label from an age type ("AGE_ANTIQUITY" → "Antiquity"), or "" when absent.
 * @param {string} [age] Age type.
 * @returns {string} Display label.
 */
function ageLabel(age) {
  if (!age) return "";
  const bare = String(age).replace(/^AGE_/, "").toLowerCase();
  return bare ? bare.charAt(0).toUpperCase() + bare.slice(1) : "";
}

/** Playback speed multipliers. */
const SPEEDS = [["0.5×", 0.5], ["1×", 1], ["2×", 2], ["4×", 4]];

/**
 * Build the playback-speed chips (set the shared speed multiplier).
 * @param {*} pb Playback state.
 * @returns {HTMLElement} The speed chip row.
 */
function makeSpeedChips(pb) {
  const row = el("div", "emig-netc-speed");
  /** @type {{mul:number, el:HTMLElement}[]} */
  const chips = [];
  for (const [label, mul] of SPEEDS) {
    const c = el("div", "emig-netc-chip" + (mul === 1 ? " active" : ""), String(label));
    c.addEventListener("click", () => {
      pb.speedMul = /** @type {number} */ (mul);
      chips.forEach((x) => x.el.classList.toggle("active", x.mul === mul));
    });
    row.appendChild(c);
    chips.push({ mul: /** @type {number} */ (mul), el: c });
  }
  return row;
}

/**
 * Build a 0..max range input set to max.
 * @param {number} max Max value.
 * @returns {HTMLInputElement} The range input.
 */
function makeRangeInput(max) {
  const input = document.createElement("input");
  input.type = "range";
  input.min = "0";
  input.max = String(max);
  input.value = String(max);
  return input;
}

/**
 * Group frames into contiguous age runs.
 * @param {*[]} frames Frames (in time order).
 * @returns {{age:string, start:number, end:number}[]} Segments (inclusive frame index ranges).
 */
function ageSegments(frames) {
  /** @type {{age:string, start:number, end:number}[]} */
  const segs = [];
  for (let i = 0; i < frames.length; i++) {
    const age = frames[i].age || "";
    const last = segs[segs.length - 1];
    if (last && last.age === age) last.end = i;
    else segs.push({ age, start: i, end: i });
  }
  return segs;
}

/**
 * Build the age band: one labelled segment per age, sized to its share of the timeline.
 * @param {*[]} frames Frames (in time order).
 * @returns {HTMLElement|null} The band, or null when no ages are known.
 */
function makeAgeBar(frames) {
  const segs = ageSegments(frames);
  if (!segs.some((s) => s.age)) return null;
  const bar = el("div", "emig-netc-ages");
  for (const s of segs) {
    const seg = el("div", "emig-netc-age", ageLabel(s.age) || "—");
    seg.style.flexGrow = String(s.end - s.start + 1);
    bar.appendChild(seg);
  }
  return bar;
}

/**
 * A timeline tick label for a frame: the in-game year (e.g. "1200 AD") when known, else the
 * per-age turn ("T30"), else "".
 * @param {*} f Frame.
 * @returns {string} Label.
 */
function tickLabel(f) {
  if (f.year) return f.year;
  return f.turn == null ? "" : "T" + f.turn;
}

/**
 * Add evenly-spaced marks along the timeline. `everyN` frames get a mark; `make(frame, leftPct)`
 * builds each one. The final frame always gets a mark too (so the end year is labelled).
 * @param {*[]} frames Frames. @param {HTMLElement} layer Target. @param {number} everyN Spacing.
 * @param {(f:*, leftPct:number)=>HTMLElement|null} make Mark builder.
 */
function addMarks(frames, layer, everyN, make) {
  const last = Math.max(1, frames.length - 1);
  const step = Math.max(1, everyN);
  for (let i = 0; i < frames.length; i += step) {
    const node = make(frames[i], (i / last) * 100);
    if (node) layer.appendChild(node);
  }
  if ((frames.length - 1) % step !== 0) {
    const node = make(frames[last], 100);
    if (node) layer.appendChild(node);
  }
}

/**
 * Build the overlay marks: a red line at every age boundary, a dense row of minor ticks, and ~12
 * major ticks labelled with the in-game year (turns as a fallback), so the scale reads richly.
 * @param {*[]} frames Frames (in time order).
 * @returns {HTMLElement} The marks overlay.
 */
function makeMarks(frames) {
  const last = Math.max(1, frames.length - 1);
  const layer = el("div", "emig-netc-marks");
  const segs = ageSegments(frames);
  for (let s = 1; s < segs.length; s++) {
    const sep = el("div", "emig-netc-sep");
    sep.style.left = (segs[s].start / last) * 100 + "%";
    layer.appendChild(sep);
  }
  // Minor, unlabelled ticks for a fine-grained scale (~24 across the timeline).
  addMarks(frames, layer, Math.round(frames.length / 24), (_f, leftPct) => {
    const m = el("div", "emig-netc-minor");
    m.style.left = leftPct + "%";
    return m;
  });
  // Major, year-labelled ticks (~12 across the timeline — denser than the old ~8).
  addMarks(frames, layer, Math.round(frames.length / 12), (f, leftPct) => {
    const label = tickLabel(f);
    if (!label) return null;
    const tick = el("div", "emig-netc-tick", label);
    tick.style.left = leftPct + "%";
    return tick;
  });
  return layer;
}

/**
 * Group events by the frame column they pin to, preserving each column's event order.
 * @param {*[]} events Event specs (each with a `from` frame index).
 * @param {number} last The final frame index (clamps out-of-range specs).
 * @returns {Map<number, *[]>} frame index → the events pinned there.
 */
export function clusterPinsByColumn(events, last) {
  /** @type {Map<number, *[]>} */
  const cols = new Map();
  for (const ev of events || []) {
    if (!ev || typeof ev.from !== "number" || !isFinite(ev.from)) continue;
    const col = Math.max(0, Math.min(last, Math.round(ev.from)));
    const at = cols.get(col);
    if (at) at.push(ev);
    else cols.set(col, [ev]);
  }
  return cols;
}

/**
 * The pin's class, colour + tooltip text for one frame column.
 *
 * Colour comes from the SHARED cause taxonomy (`causeAccent`, emigration-causes.js) — the same map
 * that themes the notifications log's rows and the toast accent bars — so a war pin is the same red
 * as a war notification and a disaster pin the same amber. A column holding more than one KIND has
 * no single honest type colour, so it takes the taxonomy's own `other` fallback rather than
 * arbitrarily picking one of its events' colours.
 * @param {*[]} at The column's events.
 * @returns {{cls:string, color:string, text:string}} Pin class suffix, fill colour + tooltip text.
 */
function pinFor(at) {
  const kinds = new Set(at.map((/** @type {*} */ e) => e.kind));
  const text = at.map((/** @type {*} */ e) => String(e.label || "")).filter(Boolean).join(" · ");
  if (at.length === 1) return { cls: at[0].kind === "war" ? "war" : "disaster", color: causeAccent(at[0].kind), text };
  // Same-kind crowding keeps its type colour; a mixed column falls back to the neutral accent.
  const only = kinds.size === 1 ? [...kinds][0] : null;
  return { cls: "multi", color: causeAccent(only || "other"), text };
}

/**
 * Build the event-pin layer: one pin per frame column that has wars/disasters, positioned as a % of
 * the timeline width (the same scale the age separators and ticks use), with a hover tooltip and
 * click-to-scrub. Events sharing a column merge into a single count-free "multi" pin listing them
 * all, so a busy turn can't stack unreadable pins on one pixel.
 * @param {*[]} frames Frames (in time order).
 * @param {*[]} events Event specs `{kind, label, from, to}` (frame indices).
 * @param {(i:number)=>void} [goTo] Scrub handler — clicking a pin jumps the timeline to its frame.
 * @returns {HTMLElement} The pin layer (empty when there are no placeable events).
 */
export function makeEventPins(frames, events, goTo) {
  const layer = el("div", "emig-netc-pins");
  const last = Math.max(1, frames.length - 1);
  for (const [col, at] of clusterPinsByColumn(events, last)) {
    const { cls, color, text } = pinFor(at);
    const pin = el("div", "emig-netc-pin " + cls);
    pin.style.left = (col / last) * 100 + "%";
    pin.style.backgroundColor = color;
    pin.appendChild(el("div", "emig-netc-pin-tip", text));
    pin.setAttribute("role", "button");
    pin.title = text; // native tooltip fallback if the CSS one is clipped
    if (goTo) pin.addEventListener("click", () => goTo(col));
    layer.appendChild(pin);
  }
  return layer;
}

/**
 * Build the timeline area: the age band, a rail (visible track + progress fill + a clear playhead
 * line, with the transparent scrubber on top for interaction), the year-tick overlay, and the
 * war/disaster event pins.
 * @param {*[]} frames Frames.
 * @param {*} o Bag of {input, fill, head, events, goTo}: `input` is the transparent scrubber that
 *   drives interaction, `fill`/`head` are the progress fill + playhead (goTo updates their geometry),
 *   `events` are the specs to pin (optional), and `goTo` scrubs when a pin is clicked.
 * @returns {HTMLElement} The timeline panel.
 */
function makeTimelineArea(frames, o) {
  const tl = el("div", "emig-netc-tl");
  const ageBar = makeAgeBar(frames);
  if (ageBar) tl.appendChild(ageBar);
  const rail = el("div", "emig-netc-rail");
  rail.appendChild(el("div", "emig-netc-track")); // the unplayed rail
  rail.appendChild(o.fill); // the played portion (gold), width set by goTo
  rail.appendChild(o.input); // transparent range on top — handles click/drag/keys
  rail.appendChild(o.head); // the bright playhead line + knob, left set by goTo
  tl.appendChild(rail);
  const marks = makeMarks(frames);
  if (o.events && o.events.length) marks.appendChild(makeEventPins(frames, o.events, o.goTo));
  tl.appendChild(marks);
  return tl;
}

/**
 * Build the controls row (play/pause button, current-time label, playback speed chips).
 * @param {HTMLElement} btn Play/pause button.
 * @param {HTMLElement} lbl Time label.
 * @param {*} pb Playback state.
 * @returns {HTMLElement} The controls row.
 */
function makeControlsRow(btn, lbl, pb) {
  const ctrl = el("div", "emig-netc-ctrl");
  ctrl.appendChild(btn);
  ctrl.appendChild(lbl);
  ctrl.appendChild(el("div", "emig-netc-spacer"));
  ctrl.appendChild(makeSpeedChips(pb));
  return ctrl;
}

/**
 * Wire the play button + scrubber and seed the visuals at the end frame (the default). Split out of
 * makeTimeline to keep it under the statement cap. @param {*} o Bag of {btn, input, fill, head, pb,
 * last, goTo, setPlaying, setLabel}.
 */
function wireAndSeed(o) {
  o.setPlaying(false); // initial icon = play triangle
  o.btn.addEventListener("click", () => {
    if (!o.pb.playing && o.pb.idx >= o.last) o.goTo(0); // restart from the beginning
    o.setPlaying(!o.pb.playing);
  });
  o.input.addEventListener("input", () => {
    o.setPlaying(false);
    o.goTo(parseInt(o.input.value, 10));
  });
  // Seed the visuals at the end (default frame) WITHOUT calling onSet (the driver owns the render).
  o.input.value = String(o.last);
  o.fill.style.width = "100%";
  o.head.style.left = "100%";
  o.setLabel(o.last);
}

/**
 * Build the timeline: an age-split bar, a full-width scrubber, and a controls row (play/pause, the
 * current-time label, playback speed). Omitted when there is only one frame. The returned
 * `goTo`/`setPlaying` let the driver move it; `pb` holds the shared play state.
 * @param {*[]} frames Frames.
 * @param {*} pb Playback state {playing, ticks, idx}.
 * @param {(i:number)=>void} onSet Apply a frame index.
 * @param {*[]} [events] War/disaster specs `{kind, label, from, to}` to pin onto the scrubber
 *   (default none — the signature stays backward-compatible with callers that pin nothing).
 * @returns {{root:HTMLElement, goTo:(i:number)=>void, setPlaying:(p:boolean)=>void}|null} Handle.
 */
export function makeTimeline(frames, pb, onSet, events) {
  if (frames.length < 2) return null;
  const last = frames.length - 1;
  const root = el("div", "emig-netc-time");
  // Play/pause is CSS-DRAWN (a triangle vs two bars via a `.playing` class), NOT a glyph — the ⏸
  // pause character renders as an invisible tofu box in the game font, which read as the button
  // "disappearing" when pressed.
  const btn = el("div", "emig-netc-play");
  btn.setAttribute("role", "button");
  const input = makeRangeInput(last);
  const fill = el("div", "emig-netc-fill");
  const head = el("div", "emig-netc-head");
  const lbl = el("div", "emig-netc-time-lbl", "now");
  const setLabel = (/** @type {number} */ i) => {
    const f = frames[i];
    const when = f.year || (f.turn == null ? "" : loc("LOC_EMIG_NETC_TURN_N", "turn {1_Turn}", f.turn));
    const now = loc("LOC_EMIG_NETC_NOW", "now");
    const parts = [ageLabel(f.age), when].filter(Boolean).join(" · ");
    lbl.textContent = i === last ? (when ? now + " · " + when : now) : (parts || loc("LOC_EMIG_NETC_START", "start"));
  };
  const goTo = (/** @type {number} */ i) => {
    pb.idx = i;
    input.value = String(i);
    const pct = (i / last) * 100;
    fill.style.width = pct + "%";
    head.style.left = pct + "%";
    setLabel(i);
    onSet(i);
  };
  const setPlaying = (/** @type {boolean} */ p) => {
    pb.playing = p;
    btn.classList.toggle("playing", !!p);
    btn.setAttribute("aria-label", p ? "Pause" : "Play");
    btn.title = p ? "Pause" : "Play";
  };
  // Pins scrub via `goTo` (defined above), so clicking a war/disaster jumps the timeline to it.
  root.appendChild(makeTimelineArea(frames, { input, fill, head, events, goTo }));
  root.appendChild(makeControlsRow(btn, lbl, pb));
  wireAndSeed({ btn, input, fill, head, pb, last, goTo, setPlaying, setLabel });
  return { root, goTo, setPlaying };
}
