// emigration-explain-view.js
//
// Feature L (roadmap §15.1): the "why did they leave / why there?" explainer. The first SURFACE over
// the §15.0a explain substrate - two labeled groups ("Why people are leaving" / "Where they're
// drawn"), each a row per factor with a relative-weight bar.
//
// This module is deliberately thin. It does NO reasoning: emigration-explain.js decomposes the
// scores, this formats the rows. If you find yourself computing a contribution here, it belongs
// there instead (that is the whole point of the substrate, and every later consumer - the forecast,
// the advisor, the policy preview - inherits the same split).
//
// Two layers, mirroring emigration-city-readout-data.js:
//   • buildExplainModel(o), PURE: resolved inputs → the view-model. Unit-tested.
//   • explainModel(cityId), IMPURE: gathers those inputs live (recompute-on-read, no new persisted
//     state) and calls the pure builder. Degrades to null on any read failure.
//
// THREE THINGS THIS RENDERS, AND WHY THEY ARE NOT THE SAME THING. The honesty rule in
// emigration-explain.js says a contribution may only reach a player as a RELATIVE WEIGHT among the
// other contributions. That forces a shape the roadmap's sketch did not anticipate: it listed
// "Prosperity, Open borders, Existing Roman community" as peer rows, but only the first is an
// addend, so they are separated here.
//
//   1. FACTORS (`leaving` / `drawnTo`) - the additive terms, as weights. These are the only rows
//      with a weight bar, because a weight is only meaningful against the other addends.
//   2. PERMEABILITY (`permeability`) - the multiplicative border channel. Reported as its literal
//      multiplier ("x1.5"), which the substrate documents as the honest number for it, and NOT as a
//      weight: it is not an addend, and `weigh()` already excludes it from the denominator.
//   3. COMMUNITY (`community`) - context, deliberately NOT a factor. A diaspora at the destination
//      does not move anyone today: chain migration is Feature K (roadmap §11), unbuilt and
//      off-by-default when it lands. Synthesizing a weighted row for it would be the exact failure
//      the honesty rule exists to prevent - and worse than a cosmetic lie, since a fabricated delta
//      enters `weigh()`'s denominator and silently falsifies every OTHER row's weight too. So it
//      renders as a plain note ("Roman community there: 24%"). When K ships it will fold into
//      `tiltFor`, and the `tilt` row will then carry it as a real, earned weight with no change here.

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { explainPull, explainPush, weigh } from "/emigration/ui/emigration-explain.js";
import { collectCitySignals } from "/emigration/ui/emigration-cities.js";
import { rankByProsperity, fieldContext } from "/emigration/ui/emigration-prosperity.js";
import { bestDestination, pullContext } from "/emigration/ui/emigration-pull.js";
import { ownerPopulations } from "/emigration/ui/emigration-state.js";
import { compositionForCity } from "/emigration/ui/emigration-composition.js";
import { civDisplayColor } from "/emigration/ui/emigration-civ-colors.js";
import { civAdjective } from "/emigration/ui/emigration-naming.js";
import { civHidden } from "/emigration/ui/emigration-governance.js";
import { registerCacheReset } from "/emigration/ui/emigration-cache-reset.js";
import { loc } from "/emigration/ui/emigration-loc.js";

// Rows past this add pixels, not understanding: the tail of a decomposition is a long list of
// near-zero terms. Truncating is honest here BECAUSE each weight is a share of the whole set, not of
// what survives the cut - a shown row means the same thing whether or not the tail is drawn.
const MAX_ROWS = 5;

// A row below this reads as "0%" once rounded; drawing a bar for it implies a precision the score
// does not have.
const MIN_WEIGHT = 0.005;

/**
 * One display row: a factor and its share of the total movement in the score.
 * @typedef {{key:string, label:string, weight:number, kind:"pull"|"push"}} ExplainRow
 */

/**
 * The explainer view-model for one city.
 * @typedef {Object} ExplainModel
 * @property {string} cityName Display name of the explained settlement.
 * @property {ExplainRow[]} leaving Why people are leaving it, biggest share first.
 * @property {ExplainRow[]} drawnTo Why they are drawn to `destName`, biggest share first.
 * @property {string} destName Where they are currently pulled ("" when nowhere is viable).
 * @property {boolean} crossCiv Whether that destination belongs to another civilization.
 * @property {{factor:number, label:string}|null} permeability The multiplicative border channel, as
 *   its literal multiplier, or null when the border changed nothing (or there is no destination).
 * @property {{name:string, share:number, color:string}|null} community An existing community of the
 *   movers' origin at the destination - CONTEXT, not a factor (see the file header). Null when the
 *   destination hosts none, when the origin is unknown, or when policy hides that civ.
 */

/**
 * Trim a weighed decomposition to the rows worth drawing (see {@link MAX_ROWS} / {@link MIN_WEIGHT}).
 * @param {*[]} rows Rows from `weigh()`.
 * @returns {ExplainRow[]} The display rows.
 */
function displayRows(rows) {
  /** @type {ExplainRow[]} */
  const out = [];
  for (const r of rows) {
    if (r.weight < MIN_WEIGHT) continue;
    out.push({ key: r.key, label: r.label, weight: r.weight, kind: r.kind });
    if (out.length >= MAX_ROWS) break;
  }
  return out;
}

/**
 * The permeability channel as a display value: its literal multiplier. Null when there is no scale
 * row (a neutral border has nothing to say).
 * @param {*[]} rows Raw rows from `explainPull()` (before `weigh()`, which drops the scale row).
 * @returns {{factor:number, label:string}|null} The multiplier, or null.
 */
function permeabilityOf(rows) {
  for (const r of rows) {
    if (r.kind === "scale" && typeof r.factor === "number") return { factor: r.factor, label: r.label };
  }
  return null;
}

/**
 * Build the explainer view-model from already-resolved inputs. Pure over its inputs: it scores with
 * the sim's own pure functions and does no engine reads of its own. The one impure thing it needs -
 * resolving the destination's diaspora, which reads composition state - is injected as
 * `communityOf`, so the destination is only chosen once (`bestDestination` walks every candidate;
 * calling it again just to look up a community would double the cost of every hover).
 * @param {{signal:*, ranked:*[], cityName?:string, ownerPop?:Record<number,number>|null,
 *   field?:{meanHappiness:number}|null,
 *   communityOf?:((dest:*, signal:*) => {name:string, share:number, color:string}|null)|null}} o Inputs.
 * @returns {ExplainModel|null} The model, or null when there is nothing to explain.
 */
export function buildExplainModel(o) {
  const sig = o.signal;
  if (!sig || !Array.isArray(o.ranked)) return null;
  const pop = o.ownerPop || null;
  const best = bestDestination(sig, o.ranked, pop);
  const pullRows = best ? explainPull(sig, best.dest, pullContext(sig, o.ranked, pop)) : [];
  return Object.assign({
    cityName: o.cityName || "",
    leaving: displayRows(weigh(explainPush(sig, o.field || null))),
    drawnTo: displayRows(weigh(pullRows)),
    permeability: permeabilityOf(pullRows)
  }, destFields(sig, best, o.communityOf));
}

/**
 * The destination-dependent half of the model. Every field here is null/empty when nothing is
 * viable: with nowhere to go there is no destination to name and no community to be drawn toward.
 * @param {*} sig The source signal.
 * @param {{dest:*}|null} best The chosen destination, or null.
 * @param {((dest:*, signal:*) => {name:string, share:number, color:string}|null)|null} [communityOf]
 *   The injected diaspora resolver.
 * @returns {{destName:string, crossCiv:boolean,
 *   community:{name:string, share:number, color:string}|null}} The fields.
 */
function destFields(sig, best, communityOf) {
  if (!best) return { destName: "", crossCiv: false, community: null };
  return {
    destName: destNameOf(best.dest),
    crossCiv: best.dest.owner !== sig.owner,
    community: communityOf ? communityOf(best.dest, sig) : null
  };
}

/**
 * A destination signal's display name, resolved off the signal the ranker carries.
 * @param {*} dest The destination signal.
 * @returns {string} The name (may be "").
 */
function destNameOf(dest) {
  try {
    const n = dest?.city?.name;
    if (typeof n !== "string" || !n) return "";
    return typeof Locale !== "undefined" && Locale.compose ? Locale.compose(n) : n;
  } catch (_) {
    return "";
  }
}

/**
 * The movers' origin: the dominant origin civ of the SOURCE's population, which is who a diaspora at
 * the destination would be a diaspora OF. Null when the settlement is untracked.
 * @param {*} sig The source signal.
 * @returns {number|null} The origin player id, or null.
 */
function originCivOf(sig) {
  const comp = compositionForCity(sig?.city);
  const dom = comp && comp.dominant;
  return dom && typeof dom.civ === "number" ? dom.civ : null;
}

/**
 * An existing community of `originCiv` at `dest`, for the context note. Null when the destination
 * hosts none, or when policy hides that civ from this player (never name a civ they haven't met -
 * the same masking `resolveComposition` applies in the readout).
 * @param {number|null} originCiv The movers' origin player id.
 * @param {*} dest The destination signal.
 * @returns {{name:string, share:number, color:string}|null} The note, or null.
 */
function communityAt(originCiv, dest) {
  if (originCiv == null || civHidden(originCiv)) return null;
  const comp = compositionForCity(dest?.city);
  if (!comp) return null;
  const hit = comp.civs.find((/** @type {*} */ c) => c.civ === originCiv);
  if (!hit || !(hit.share > 0)) return null;
  return { name: civAdjective(originCiv), share: hit.share, color: civDisplayColor(originCiv, "#e5d2ac") };
}

/**
 * Find the ranked signal matching `cityId` (a stable key, a city object, or a localId/id).
 * @param {*[]} ranked Ranked signals.
 * @param {*} cityId The key, city object, or numeric id.
 * @returns {*} The signal, or null.
 */
function findSignal(ranked, cityId) {
  for (const s of ranked) {
    if (s.key === cityId || s.city === cityId) return s;
    const lid = s.city && (s.city.localId ?? s.city.id);
    if (lid != null && lid === cityId) return s;
  }
  return null;
}

// Per-turn memo. Unlike the readout (one snapshot per city SELECTION), this feature is mounted on
// hover panels: a cursor crossing a civ's tiles asks for a model dozens of times a turn, and the
// gather below ranks EVERY settlement in the world. The inputs are per-pass constants, so they are
// computed once a turn and shared, the same `_loadedTurn` idiom emigration-composition.js uses.
// Registered with the cache-reset convention so a new game in a still-live isolate cannot be
// explained with the previous game's field.
let _passTurn = -1;
/** @type {{ranked:*[], ownerPop:Record<number,number>, field:{meanHappiness:number}}|null} */
let _pass = null;
/** @type {Map<string, ExplainModel|null>} */
const _models = new Map();

registerCacheReset(() => {
  _pass = null;
  _passTurn = -1;
  _models.clear();
});

/**
 * The current turn, or -1 when unreadable (which simply makes the memo a single-entry cache).
 * @returns {number} The turn.
 */
function gameTurn() {
  try {
    return typeof Game !== "undefined" && Game && typeof Game.turn === "number" ? Game.turn : -1;
  } catch (_) {
    return -1;
  }
}

/**
 * The per-pass gather (ranked field + populations + happiness mean), rebuilt once per turn.
 * @returns {{ranked:*[], ownerPop:Record<number,number>, field:{meanHappiness:number}}|null} The
 *   pass data, or null when the world has no settlements.
 */
function passData() {
  const turn = gameTurn();
  if (_pass && _passTurn === turn) return _pass;
  const signals = collectCitySignals();
  if (!signals.length) return null;
  const ranked = rankByProsperity(signals);
  _models.clear();
  _passTurn = turn;
  _pass = { ranked, ownerPop: ownerPopulations(ranked), field: fieldContext(signals) };
  return _pass;
}

/** Drop the per-turn memo (for tests and the cache-reset convention). */
export function resetExplainCache() {
  _pass = null;
  _passTurn = -1;
  _models.clear();
}

/**
 * Build a live explainer model for one city (recompute-on-read, memoized per turn). Null when the
 * option is off, the city can't be found, or any read fails.
 * @param {*} cityId A stable city key, a city object, or a numeric localId/id.
 * @returns {ExplainModel|null} The model, or null.
 */
export function explainModel(cityId) {
  if (!CONFIG.migrationExplainer) return null;
  try {
    const pass = passData();
    if (!pass) return null;
    const sig = findSignal(pass.ranked, cityId);
    if (!sig) return null;
    if (_models.has(sig.key)) return _models.get(sig.key) || null;
    const model = buildExplainModel({
      signal: sig,
      ranked: pass.ranked,
      cityName: destNameOf(sig),
      ownerPop: pass.ownerPop,
      field: pass.field,
      communityOf: (dest, src) => communityAt(originCivOf(src), dest)
    });
    _models.set(sig.key, model);
    return model;
  } catch (_) {
    return null;
  }
}

// Weight-bar colours, matching the flow view's convention: red = driving people out, green = drawing
// them in. A push row and a pull row can appear in the SAME group (the terms that retain people are
// pulls on the leaving side), so the colour reads the row's own kind, never its group.
const PUSH_COLOR = "#e0786b";
const PULL_COLOR = "#7fd08a";

const EXPLAIN_CSS =
  ".emig-explain{margin-top:0.3rem;}" +
  ".emig-explain .emig-ex-group{opacity:0.6;font-size:var(--dg-fs-72);margin-top:0.3rem;}" +
  ".emig-explain .emig-ex-row{display:flex;align-items:center;gap:0.3rem;margin:0.05rem 0;}" +
  ".emig-explain .emig-ex-label{flex:1 1 auto;opacity:0.92;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}" +
  ".emig-explain .emig-ex-track{flex:0 0 3.4rem;height:0.28rem;border-radius:0.14rem;background:rgba(229,210,172,0.18);}" +
  ".emig-explain .emig-ex-fill{height:100%;border-radius:0.14rem;}" +
  ".emig-explain .emig-ex-pct{flex:0 0 2rem;text-align:right;opacity:0.7;font-size:var(--dg-fs-72);}" +
  ".emig-explain .emig-ex-note{opacity:0.75;font-size:var(--dg-fs-72);margin:0.1rem 0;display:flex;align-items:center;gap:0.25rem;}" +
  ".emig-explain .emig-ex-swatch{width:0.4rem;height:0.4rem;border-radius:0.2rem;flex:0 0 auto;}";

/** Inject the explainer stylesheet once. */
function injectStyle() {
  try {
    if (document.getElementById("emig-explain-style")) return;
    const st = document.createElement("style");
    st.id = "emig-explain-style";
    st.textContent = EXPLAIN_CSS;
    document.head.appendChild(st);
  } catch (_) {
    /* ignore */
  }
}

/**
 * Remove every child of `el` (the GameFace-safe clear: no innerHTML reparse).
 * @param {*} el The element to empty.
 */
function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/**
 * Append a group heading.
 * @param {*} parent The container. @param {string} text The heading.
 */
function appendHeading(parent, text) {
  parent.appendChild(div("emig-ex-group", text));
}

/**
 * A `<div>` with a class and optional text.
 * @param {string} cls The class name. @param {string} [text] The text content.
 * @returns {*} The element.
 */
function div(cls, text) {
  const d = document.createElement("div");
  d.className = cls;
  if (text != null) d.textContent = text;
  return d;
}

/**
 * The weight bar for one row: a track with a proportional fill, coloured by the row's direction.
 * @param {ExplainRow} r The row.
 * @returns {*} The track element.
 */
function weightBar(r) {
  const track = div("emig-ex-track");
  const fill = div("emig-ex-fill");
  // Floor the width so a small-but-real factor stays visible as a sliver rather than vanishing (the
  // rows that round to 0% are already dropped upstream by MIN_WEIGHT).
  fill.style.width = Math.max(2, Math.round(r.weight * 100)) + "%";
  fill.style.background = r.kind === "push" ? PUSH_COLOR : PULL_COLOR;
  track.appendChild(fill);
  return track;
}

/**
 * Append one factor row: label, a weight bar, and the rounded share.
 * @param {*} parent The container. @param {ExplainRow} r The row.
 */
function appendRow(parent, r) {
  const row = div("emig-ex-row");
  row.appendChild(div("emig-ex-label", r.label));
  row.appendChild(weightBar(r));
  row.appendChild(div("emig-ex-pct", Math.round(r.weight * 100) + "%"));
  parent.appendChild(row);
}

/**
 * Append a plain context note (optionally with a civ colour swatch).
 * @param {*} parent The container. @param {string} text The note.
 * @param {string} [swatch] A hex colour for a leading swatch.
 */
function appendNote(parent, text, swatch) {
  const d = div("emig-ex-note");
  if (swatch) {
    const s = div("emig-ex-swatch");
    s.style.background = swatch;
    d.appendChild(s);
  }
  const t = document.createElement("span");
  t.textContent = text;
  d.appendChild(t);
  parent.appendChild(d);
}

/**
 * Append the "why they're leaving" group, if it has rows.
 * @param {*} root The container. @param {ExplainModel} m The model.
 */
function appendLeaving(root, m) {
  if (!m.leaving.length) return;
  appendHeading(root, loc("LOC_EMIG_EXPLAIN_LEAVING", "Why people are leaving"));
  for (const r of m.leaving) appendRow(root, r);
}

/**
 * Append the "where they're drawn" group with its permeability + community notes, if it has rows.
 * @param {*} root The container. @param {ExplainModel} m The model.
 */
function appendDrawn(root, m) {
  if (!m.drawnTo.length) return;
  appendHeading(root, m.destName
    ? loc("LOC_EMIG_EXPLAIN_DRAWN_TO", "Why they're drawn to {1_Dest}", m.destName)
    : loc("LOC_EMIG_EXPLAIN_DRAWN", "Where they're drawn"));
  for (const r of m.drawnTo) appendRow(root, r);
  if (m.permeability) {
    appendNote(root, loc("LOC_EMIG_EXPLAIN_PERMEABILITY_NOTE", "{1_Label}: x{2_Factor}",
      m.permeability.label, m.permeability.factor.toFixed(2)));
  }
  if (m.community) {
    appendNote(root, loc("LOC_EMIG_EXPLAIN_COMMUNITY", "{1_Civ} community there: {2_Pct}%",
      m.community.name, Math.round(m.community.share * 100)), m.community.color);
  }
}

/**
 * Render an explainer model into `parent`, replacing any previous render. No-op for a null model, an
 * absent parent, or a model with nothing to say - so a host can call this unconditionally.
 * @param {*} parent The host element.
 * @param {ExplainModel|null} model The model.
 * @returns {*} The rendered container, or null when nothing was rendered.
 */
export function renderExplain(parent, model) {
  try {
    if (!parent || !model || (!model.leaving.length && !model.drawnTo.length)) return null;
    injectStyle();
    const root = document.createElement("div");
    root.className = "emig-explain";
    clear(root);
    appendLeaving(root, model);
    appendDrawn(root, model);
    parent.appendChild(root);
    return root;
  } catch (_) {
    return null;
  }
}

/**
 * Build and render a city's explainer into `parent` in one step (the thin call every host uses, so a
 * mount point never re-implements the gather). No-op when the option is off or there is nothing to
 * explain.
 * @param {*} parent The host element.
 * @param {*} cityId A stable city key, a city object, or a numeric localId/id.
 * @returns {*} The rendered container, or null.
 */
export function mountExplain(parent, cityId) {
  return renderExplain(parent, explainModel(cityId));
}
