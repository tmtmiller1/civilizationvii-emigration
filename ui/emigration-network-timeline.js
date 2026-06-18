// emigration-network-timeline.js
//
// The migration-view TIMELINE control: an age-split band (one labelled segment per age), a
// full-width scrubber, a red vertical line at every age boundary, ~8 turn ticks (turns reset each
// age, mirroring the in-game per-age turn counter), and a controls row (play/pause, current-time
// label, playback speed). Styling lives in the orchestrator's injected stylesheet; this module just
// builds the DOM and returns goTo/setPlaying so the orchestrator's playback driver can move it.

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
 * Build the overlay marks: a red vertical line at every age boundary, plus ~8 ticks along the
 * timeline labelled with the in-game year (turns as a fallback).
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
  const stepN = Math.max(1, Math.round(frames.length / 8));
  for (let i = 0; i < frames.length; i += stepN) {
    const label = tickLabel(frames[i]);
    if (!label) continue;
    const tick = el("div", "emig-netc-tick", label);
    tick.style.left = (i / last) * 100 + "%";
    layer.appendChild(tick);
  }
  return layer;
}

/**
 * Build the timeline area: the age band, the scrubber, and the red-line + turn-tick overlay,
 * wrapped in a bordered panel so the timeline reads as a distinct, legible control.
 * @param {*[]} frames Frames.
 * @param {HTMLInputElement} input The scrubber.
 * @returns {HTMLElement} The timeline panel.
 */
function makeTimelineArea(frames, input) {
  const tl = el("div", "emig-netc-tl");
  const ageBar = makeAgeBar(frames);
  if (ageBar) tl.appendChild(ageBar);
  tl.appendChild(input);
  tl.appendChild(makeMarks(frames));
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
 * Build the timeline: an age-split bar, a full-width scrubber, and a controls row (play/pause, the
 * current-time label, playback speed). Omitted when there is only one frame. The returned
 * `goTo`/`setPlaying` let the driver move it; `pb` holds the shared play state.
 * @param {*[]} frames Frames.
 * @param {*} pb Playback state {playing, ticks, idx}.
 * @param {(i:number)=>void} onSet Apply a frame index.
 * @returns {{root:HTMLElement, goTo:(i:number)=>void, setPlaying:(p:boolean)=>void}|null} Handle.
 */
export function makeTimeline(frames, pb, onSet) {
  if (frames.length < 2) return null;
  const last = frames.length - 1;
  const root = el("div", "emig-netc-time");
  const btn = el("div", "emig-netc-play", "▶");
  const input = makeRangeInput(last);
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
    setLabel(i);
    onSet(i);
  };
  const setPlaying = (/** @type {boolean} */ p) => {
    pb.playing = p;
    btn.textContent = p ? "⏸" : "▶";
  };
  btn.addEventListener("click", () => {
    if (!pb.playing && pb.idx >= last) goTo(0); // restart from the beginning
    setPlaying(!pb.playing);
  });
  input.addEventListener("input", () => {
    setPlaying(false);
    goTo(parseInt(input.value, 10));
  });
  root.appendChild(makeTimelineArea(frames, input));
  root.appendChild(makeControlsRow(btn, lbl, pb));
  return { root, goTo, setPlaying };
}
