// emigration-enclave-tooltip.js
//
// The enclave's OWN tooltip, on the ordinary map. Hovering an enclave's tile shows the mod's panel in
// place of the game's plot tooltip for that one tile, because the game's tooltip can only describe the
// borrowed improvement the enclave is drawn with ("Hidden Fortress") and has no way to say that this is
// the Norman Enclave, what stage it has reached, what stood here before, or why the tile yields what it
// does (see emigration-enclave-tooltip-data.js for the model and the reasoning).
//
// Both mechanisms are ones the mod's lenses already use and that have been watched working in game: the
// cursor-following panel (emigration-lens-hover-panel.js) and the plot-tooltip visibility signal
// (emigration-plot-tooltip-suppress.js). Nothing is injected into the game's own tooltip DOM, which in
// 1.5.0 is a SolidJS tree of utility classes with no stable hook to aim at.
//
// The base tooltip is hidden ONLY while the enclave panel is showing and restored the moment the cursor
// leaves the tile. While one of the mod's lenses is active this panel stands down entirely (the lens owns
// the cursor panel and the suppression flag), so the two can never fight over either.

import { CONFIG } from "/emigration/ui/emigration-config.js";
import LensManager from "/core/ui/lenses/lens-manager.js";
import { registerLensHoverPanel, cityTitle, PANEL_Z } from "/emigration/ui/emigration-lens-hover-panel.js";
import { setBasePlotTooltipHidden } from "/emigration/ui/emigration-plot-tooltip-suppress.js";
import { allQuarterEntries, dwellProgress } from "/emigration/ui/emigration-quarter-state.js";
import { enclaveStanding, enclaveTypeOf, nativeYieldsOf, plotYieldsAt } from "/emigration/ui/emigration-enclave-place.js";
import { stanceYields } from "/emigration/ui/emigration-enclave-yields.js";
import { contestedBenefitScale } from "/emigration/ui/emigration-quarter.js";
import { quarterOptionFor } from "/emigration/ui/emigration-quarter-registry.js";
import { quarterBonus } from "/emigration/ui/emigration-quarter-bonuses.js";
import { quarterName, narrativeCiv } from "/emigration/ui/emigration-naming.js";
import { monoTurn } from "/emigration/ui/emigration-migration-stats.js";
import { relaxFor } from "/emigration/ui/emigration-enclave-pacing.js";
import { loc } from "/emigration/ui/emigration-loc.js";
import { enclaveTipModel } from "/emigration/ui/emigration-enclave-tooltip-data.js";

const PANEL_KEY = "emig-enclave-tip";
const STAGE_COLORS = Object.freeze({
  established: "#d8b24a", recognized: "#5fae6b", contested: "#c25b54", fading: "#8a8a8a"
});

/** Run a read, returning `fb` on a throw. @param {() => *} fn The read. @param {*} fb Fallback. @returns {*} */
function safe(fn, fb) {
  try {
    return fn();
  } catch (_) {
    return fb;
  }
}

/** Whether one of the mod's own map lenses is active (it then owns the cursor panel). @returns {boolean} */
function modLensActive() {
  const id = safe(() => LensManager.getActiveLens(), "");
  return typeof id === "string" && id.startsWith("emig-");
}

/** @returns {boolean} Whether the enclave tooltip may show right now. */
function active() {
  return CONFIG.enclaveTooltipEnabled !== false && !!CONFIG.quartersEnabled && !modLensActive();
}

/**
 * The standing enclave record on a plot, or null.
 * @param {{x:number, y:number}} plot The hovered plot. @returns {{tileKey:string, rec:*}|null} The entry.
 */
function entryAt(plot) {
  const idx = safe(() => GameplayMap.getIndexFromLocation(plot), -1);
  if (!(idx >= 0)) return null;
  for (const e of safe(() => allQuarterEntries(), []) || []) {
    const placed = e.rec && e.rec.placed;
    if (placed && placed.plot === idx && safe(() => enclaveStanding(e.rec), false)) return e;
  }
  return null;
}

/**
 * A constructible type's display name, or "" when it cannot be named.
 * @param {string|undefined} type A ConstructibleType. @returns {string} The localized name.
 */
function constructibleName(type) {
  if (!type) return "";
  const tag = safe(() => GameInfo.Constructibles.lookup(type).Name, "");
  const name = tag ? safe(() => Locale.compose(tag), "") : "";
  return typeof name === "string" && name && !name.startsWith("LOC_") ? name : "";
}

/** The plot's terrain and biome as one label. @param {{x:number,y:number}} plot @returns {string} */
function terrainLabel(plot) {
  const parts = [];
  for (const [table, read] of /** @type {[string, string][]} */ ([["Biomes", "getBiomeType"], ["Terrains", "getTerrainType"]])) {
    const tag = safe(() => /** @type {*} */ (GameInfo)[table].lookup(/** @type {*} */ (GameplayMap)[read](plot.x, plot.y)).Name, "");
    const name = tag ? safe(() => Locale.compose(tag), "") : "";
    if (typeof name === "string" && name && !name.startsWith("LOC_")) parts.push(name);
  }
  return parts.join(" ");
}

/**
 * The stance's one-line reasoning, localized the way the decision modal localizes it.
 * @param {string|null} civType The origin CivilizationType. @param {string} optionId The stance id.
 * @returns {string} The reasoning, or "".
 */
function stanceWhy(civType, optionId) {
  const opt = safe(() => quarterBonus(civType).options.find((/** @type {*} */ o) => o.id === optionId), null);
  if (!opt || !opt.why) return "";
  const civKey = civType ? civType.replace(/^CIVILIZATION_/, "") : "NEUTRAL";
  return loc("LOC_EMIG_QTR_WHY_" + civKey + "_" + String(optionId).toUpperCase(), opt.why);
}

/**
 * The chosen stance's label and reasoning, or blanks before recognition and for "let be".
 * @param {*} rec The quarter record. @returns {{stanceLabel:string, why:string}} The stance's words.
 */
function stanceWords(rec) {
  const stanced = rec.recognized !== false && rec.optionId && rec.optionId !== "ignore";
  if (!stanced) return { stanceLabel: "", why: "" };
  return {
    stanceLabel: safe(() => quarterOptionFor(rec.originCiv, rec.optionId).label, ""),
    why: stanceWhy(rec.originCiv, rec.optionId)
  };
}

/**
 * The yield maps for one enclave: what stood before, the tile's own, the plot now, and the stance.
 * @param {*} rec The quarter record.
 * @returns {{before:Record<string,number>, native:Record<string,number>, now:Record<string,number>,
 *   stance:Record<string,number>, benefitScale:number}} The maps.
 */
function yieldMaps(rec) {
  const placed = rec.placed || {};
  return {
    before: placed.before || {},
    native: safe(() => nativeYieldsOf(placed.type), {}),
    now: safe(() => plotYieldsAt(placed.plot, rec.owner), {}),
    stance: safe(() => stanceYields(rec), {}),
    benefitScale: safe(() => contestedBenefitScale(rec), 1)
  };
}

/**
 * Gather everything the model needs for one enclave.
 * @param {{tileKey:string, rec:*}} entry The record. @param {*} sig The host settlement's signal.
 * @param {{x:number, y:number}} plot The hovered plot.
 * @returns {import("/emigration/ui/emigration-enclave-tooltip-data.js").EnclaveTipInput} The input.
 */
function gather(entry, sig, plot) {
  const rec = entry.rec;
  const placed = rec.placed || {};
  const turn = safe(() => monoTurn(), 0);
  const dwell = rec.recognized !== false
    ? null
    : safe(() => dwellProgress(entry.tileKey, rec.originCiv, rec.civ, turn, relaxFor(rec.owner)), null);
  return {
    rec,
    enclaveName: safe(() => quarterName(rec.civ), "") || loc("LOC_EMIG_QTR_EYEBROW", "Cultural Enclave"),
    originAdj: safe(() => narrativeCiv(rec.civ).adj, ""),
    cityName: cityTitle(sig && sig.city, ""),
    terrain: terrainLabel(plot),
    // A native-skin enclave IS its own improvement, so there is no borrowed name to mention.
    skinName: constructibleName(placed.type === enclaveTypeOf(rec) ? undefined : placed.type),
    replacedName: constructibleName(placed.replaced),
    ...yieldMaps(rec),
    ...stanceWords(rec),
    dwell,
    turn,
    fadeTurns: Number(CONFIG.quarterFadeTurns) || 12
  };
}

/** The model for the tile last resolved (read by `decorate`, which is not handed the plot). */
/** @type {import("/emigration/ui/emigration-enclave-tooltip-data.js").EnclaveTipModel|null} */
let _model = null;

/**
 * Hovered settlement + plot → the panel's title and stage row (the sources mount through `decorate`).
 * @param {*} sig The settlement's signal. @param {*} _snap Unused. @param {{x:number,y:number}} [plot] The plot.
 * @returns {{title:string, rows:{color:string, name:string}[]}|null} The display, or null off an enclave.
 */
function resolve(sig, _snap, plot) {
  _model = null;
  const entry = plot ? entryAt(plot) : null;
  if (!entry) return null;
  _model = enclaveTipModel(gather(entry, sig, /** @type {{x:number,y:number}} */ (plot)));
  if (!_model) return null;
  // One placeholder row keeps the shared panel's "has something to show" contract; `decorate` then
  // replaces the whole body with the structure above.
  return { title: _model.title, rows: [{ color: "#000000", name: _model.stage.text }] };
}

/** The panel's own stylesheet: the shared one knows only swatch rows, and fighting it with inline styles
 * is what let a long source name wrap INTO the reasoning line beneath it (watched 2026-09-17). Shaped to
 * sit alongside the game's own plot tooltip: dark panel, gold title, dim detail, hairline rules.
 * @param {string} id The panel element id. @returns {string} The CSS.
 */
function panelCss(id) {
  const P = "#" + id;
  return (
    // PANEL_Z, not a literal: the enclave tooltip stands in for the game's plot tooltip, so it has to
    // stack with the same layers the lens panels do (see emigration-lens-hover-panel.js).
    P + "{position:fixed;pointer-events:none;z-index:" + PANEL_Z + ";display:none;width:23rem;max-width:23rem;"
      + "background:rgba(8,10,16,0.96);border:0.0555rem solid rgba(201,162,76,0.5);border-radius:0.3rem;"
      + "padding:0.5rem 0.6rem;color:#e5d2ac;font-size:var(--dg-fs-85);"
      + 'font-family:"BodyFont","BodyFont-JP","BodyFont-KR","BodyFont-SC","BodyFont-TC";}'
    // The title and the settlement line.
    + P + " .t{color:#f3c34c;font-weight:bold;letter-spacing:0.02em;line-height:1.3;}"
    + P + " .sub{opacity:0.7;font-size:var(--dg-fs-75);margin-bottom:0.35rem;line-height:1.3;}"
    // The stage: a coloured dot, a headline, and its explanation under it.
    + P + " .stage{display:flex;align-items:baseline;}"
    + P + " .dot{width:0.5rem;height:0.5rem;border-radius:50%;flex:0 0 auto;margin-right:0.4rem;}"
    + P + " .stage-t{font-weight:bold;line-height:1.35;}"
    + P + " .stage-d{opacity:0.72;font-size:var(--dg-fs-75);line-height:1.35;margin:0.05rem 0 0 0.9rem;}"
    + P + " .rule{height:0.0555rem;background:rgba(201,162,76,0.28);margin:0.4rem 0;}"
    + P + " .hdr{opacity:0.6;font-size:var(--dg-fs-70);letter-spacing:0.08em;text-transform:uppercase;"
      + "margin-bottom:0.15rem;}"
    // A source: name on the left, its yields pinned right; the detail and the reasoning are their OWN
    // blocks under it, so a long name can never overlap them.
    + P + " .src{margin-top:0.35rem;}"
    + P + " .src-top{display:flex;align-items:baseline;justify-content:space-between;}"
    + P + " .src-n{flex:1 1 auto;padding-right:0.5rem;line-height:1.35;}"
    + P + " .src-d{opacity:0.68;font-size:var(--dg-fs-70);line-height:1.3;margin-top:0.02rem;}"
    + P + " .src-w{opacity:0.78;font-size:var(--dg-fs-75);line-height:1.35;margin-top:0.1rem;}"
    // The yield run: icon + amount pairs, like the game's own tooltips.
    + P + " .ys{display:flex;flex-direction:row;align-items:center;flex:0 0 auto;white-space:nowrap;}"
    + P + " .y{display:flex;flex-direction:row;align-items:center;margin-left:0.45rem;}"
    + P + " .y-i{width:1rem;height:1rem;background-size:contain;background-position:center;"
      + "background-repeat:no-repeat;margin-right:0.12rem;}"
    + P + " .y-n{font-variant-numeric:tabular-nums;}"
    + P + " .pos{color:#8fd08f;}" + P + " .neg{color:#e08585;}"
    + P + " .total{display:flex;align-items:baseline;justify-content:space-between;font-weight:bold;}"
  );
}

/**
 * An element with a class and optional text.
 * @param {string} cls Class name. @param {string} [text] Text content. @returns {HTMLElement} The element.
 */
function el(cls, text) {
  const d = document.createElement("div");
  if (cls) d.className = cls;
  if (text) d.textContent = text;
  return d;
}

/**
 * The game's own icon for a yield type, as a CSS background value.
 * @param {string} key A YieldType. @returns {string} A `url(...)` value, or "".
 */
function yieldIcon(key) {
  const url = safe(() => UI.getIconURL(key, "YIELD"), "");
  return typeof url === "string" && url ? "url('" + url + "')" : "";
}

/**
 * A signed yield map as the game draws it: an icon and a signed number per yield, sorted so the same
 * yields always appear in the same order.
 * @param {Record<string, number>} amounts Signed yields by type. @returns {HTMLElement} The run.
 */
function yieldRun(amounts) {
  const wrap = el("ys");
  for (const key of Object.keys(amounts || {}).sort()) {
    const n = Number(amounts[key]);
    if (!n) continue;
    const y = el("y");
    const icon = el("y-i");
    const bg = yieldIcon(key);
    if (bg) icon.style.backgroundImage = bg;
    y.appendChild(icon);
    y.appendChild(el("y-n " + (n > 0 ? "pos" : "neg"), (n > 0 ? "+" : "−") + Math.abs(n)));
    wrap.appendChild(y);
  }
  return wrap;
}

/**
 * The heading block: the enclave's name, its settlement and terrain, and the stage with its dot.
 * @param {*} m The model. @returns {HTMLElement[]} The elements, in order.
 */
function headBlock(m) {
  const out = [el("t", m.title)];
  if (m.subtitle) out.push(el("sub", m.subtitle));
  const stage = el("stage");
  const dot = el("dot");
  dot.style.background = /** @type {Record<string, string>} */ (STAGE_COLORS)[m.stage.key] || "#888888";
  stage.appendChild(dot);
  stage.appendChild(el("stage-t", m.stage.text));
  out.push(stage);
  if (m.stage.detail) out.push(el("stage-d", m.stage.detail));
  return out;
}

/**
 * One yield source: its name with the yields pinned right, then the detail and the reasoning as their
 * OWN blocks beneath — which is what keeps a long name from overlapping them.
 * @param {*} s The source row. @returns {HTMLElement} The block.
 */
function sourceBlock(s) {
  const src = el("src");
  const top = el("src-top");
  top.appendChild(el("src-n", s.label));
  top.appendChild(yieldRun(s.amounts));
  src.appendChild(top);
  if (s.detail) src.appendChild(el("src-d", s.detail));
  if (s.note) src.appendChild(el("src-w", s.note));
  return src;
}

/**
 * The total row.
 * @param {Record<string, number>} amounts The summed yields. @returns {HTMLElement} The row.
 */
function totalBlock(amounts) {
  const total = el("total");
  total.appendChild(el("", loc("LOC_EMIG_ETIP_TOTAL", "Total per turn")));
  total.appendChild(yieldRun(amounts));
  return total;
}

/**
 * Build the whole panel body, replacing the shared title/rows markup so the structure is ours.
 * @param {HTMLElement} panel The panel element (emptied first).
 */
function decorate(panel) {
  const m = _model;
  if (!m) return;
  panel.textContent = "";
  for (const node of headBlock(m)) panel.appendChild(node);
  if (!m.sources.length) return;
  panel.appendChild(el("rule"));
  panel.appendChild(el("hdr", loc("LOC_EMIG_ETIP_SOURCES", "Where the yields come from")));
  for (const s of m.sources) panel.appendChild(sourceBlock(s));
  if (m.totalAmounts && Object.keys(m.totalAmounts).length) {
    panel.appendChild(el("rule"));
    panel.appendChild(totalBlock(m.totalAmounts));
  }
}

try {
  registerLensHoverPanel({
    lens: PANEL_KEY, panelId: "emig-enclave-tip-panel", styleId: "emig-enclave-tip-style",
    active, resolve, decorate, css: panelCss,
    onShow: () => setBasePlotTooltipHidden(true),
    // Restore the game's tooltip only when no mod lens has since taken the flag over.
    onHide: () => { if (!modLensActive()) setBasePlotTooltipHidden(false); }
  });
} catch (e) {
  console.error("[Emigration.enclaveTip] failed to register", e);
}
