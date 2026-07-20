// emigration-city-readout.js
//
// Phase 2 (the in-game-legibility plan): the per-city "why is THIS settlement gaining/losing
// population?" readout. A small HUD-anchored panel (the same fixed-position DOM-injection
// technique as the feedback toast, so it ships without Demographics and without a native
// city-banner hook), populated from the Phase-0 `citySnapshot` recompute-on-read data core.
//
// Two layers, mirroring the rest of the legibility work:
//   • readoutModel(snapshot), PURE: turns a CitySnapshot into a title + display lines + an
//     optional warning. DOM-free, unit-tested.
//   • the DOM host, show/hide a styled panel, thin and untested like toast().
//
// Trigger: the guaranteed path is the console command (emigration.city(id) / .hideCity()).
// A best-effort `CitySelectionChanged` listener auto-shows it on selection; the exact UI-VM
// selection event is a probe-verification item (docs/in-game-legibility-plan.md, Phase 2), so the
// listener is defensive and the console command stands in until it's confirmed in-engine.

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { citySnapshot } from "/emigration/ui/emigration-city-readout-data.js";
import { actionHint, permanenceCue } from "/emigration/ui/emigration-naming.js";
import { formatPeople, localeNumber } from "/emigration/ui/emigration-population.js";
import { reasonsPhrase, pullReasonsPhrase } from "/emigration/ui/emigration-move-reasons.js";
import { mountExplain } from "/emigration/ui/emigration-explain-view.js";
import { toast } from "/emigration/ui/emigration-feedback.js";
import { loc } from "/emigration/ui/emigration-loc.js";

const POOL_SEVERITY_MEDIUM = 4;
const POOL_SEVERITY_HIGH = 8;
const MAX_TRACKED_CITIES = 2048;

/**
 * A signed people count ("+12 thousand" / "-5 thousand" / "0").
 * @param {number} n Net people.
 * @returns {string} The display string.
 */
function signedPeople(n) {
  if (!n) return "0";
  return (n > 0 ? "+" : "-") + formatPeople(Math.abs(n));
}

/**
 * The status suffix for the cause line: resting (cooldown) or building pressure toward a move.
 * @param {*} s The snapshot.
 * @returns {string} The suffix (may be "").
 */
function statusSuffix(s) {
  if (s.onCooldown) return loc("LOC_EMIG_RO_STATUS_RESTING", " (resting {1_Cooldown})", s.cooldown);
  if (s.pressureToBar > 0) {
    return loc("LOC_EMIG_RO_STATUS_TO_MOVE", " ({1_Pct}% to next move)", Math.round(s.pressureToBar * 100));
  }
  return "";
}

/**
 * The warning line, if any: trapped-with-no-refuge outranks ordinary distress.
 * @param {*} s The snapshot.
 * @returns {string|null} The warning, or null.
 */
function warnText(s) {
  if (s.refugeePool > 0) return loc("LOC_EMIG_RO_WARN_HOLDING", "Refugee holding active in this settlement");
  const why = reasonsPhrase(s.riskReasons); // crisis-type "why" for the at-risk line (P0.2)
  const suffix = why ? " (" + why + ")" : "";
  if (s.attritionRisk) return loc("LOC_EMIG_RO_WARN_TRAPPED", "At risk: trapped with nowhere to flee{1_Why}", suffix);
  if (s.atRisk) return loc("LOC_EMIG_RO_WARN_DISTRESS", "Under distress - people are looking to leave{1_Why}", suffix);
  return null;
}

/**
 * Holding-pool severity bucket for badge + markers.
 * @param {number} pool Refugee holding points.
 * @returns {"low"|"medium"|"high"|"none"} Severity.
 */
function poolSeverity(pool) {
  if (!(pool > 0)) return "none";
  if (pool >= POOL_SEVERITY_HIGH) return "high";
  if (pool >= POOL_SEVERITY_MEDIUM) return "medium";
  return "low";
}

/**
 * Label text for the readout title badge.
 * @param {"low"|"medium"|"high"|"none"} severity Severity bucket.
 * @returns {string} Badge label (or empty when none).
 */
function poolBadgeLabel(severity) {
  if (severity === "high") return loc("LOC_EMIG_RO_BADGE_HIGH", "Holding: High");
  if (severity === "medium") return loc("LOC_EMIG_RO_BADGE_MEDIUM", "Holding: Medium");
  if (severity === "low") return loc("LOC_EMIG_RO_BADGE_LOW", "Holding: Low");
  return "";
}

/**
 * The ethnic-composition line ("Origins: Roman 62%, Egyptian 38%"), or null when untracked. Shows
 * the top three origins by share, with a "(+N more)" tail when there are more. Pure.
 * @param {{parts:{name:string, share:number}[]}|null|undefined} comp The display composition.
 * @returns {string|null} The line, or null.
 */
function originsLine(comp) {
  const parts = comp && Array.isArray(comp.parts) ? comp.parts : [];
  if (!parts.length) return null;
  const top = parts.slice(0, 3).map((p) => p.name + " " + Math.round(p.share * 100) + "%");
  const extra = parts.length - 3;
  const tail = extra > 0 ? loc("LOC_EMIG_RO_ORIGINS_MORE", " (+{1_Count} more)", extra) : "";
  return loc("LOC_EMIG_RO_ORIGINS", "Origins: {1_List}{2_Tail}", top.join(", "), tail);
}

/**
 * The "Pressure:" value: the concurrent-cause breakdown ("War 60% · Prosperity 40%") when >1 cause is
 * active (the engine's voluntary/crisis split, CONFIG.splitUiReadoutEnabled), else the single dominant
 * label.
 * @param {*} s The readout snapshot.
 * @returns {string} The pressure text.
 */
function pressureText(s) {
  const mix = s.causeMix;
  if (mix && mix.length > 1) {
    return mix.map((/** @type {*} */ c) => loc("LOC_EMIG_RO_CAUSE_ITEM", "{1_Label} {2_Share}%", c.label, c.share)).join(" · ");
  }
  return s.causeLabel;
}

/**
 * Refugee holding-pool display line, or empty when none.
 * @param {*} s Readout snapshot.
 * @returns {string} Line text or empty.
 */
function refugeePoolLine(s) {
  if (!(s.refugeePool > 0)) return "";
  return s.refugeePool === 1
    ? loc("LOC_EMIG_RO_POOL_ONE", "Refugee holding pool: {1_Count} point", s.refugeePool)
    : loc("LOC_EMIG_RO_POOL_MANY", "Refugee holding pool: {1_Count} points", s.refugeePool);
}

/**
 * Refugee support burden display line, or empty when none.
 * @param {*} s Readout snapshot.
 * @returns {string} Line text or empty.
 */
function refugeeBurdenLine(s) {
  if (!(s.refugeeBurdenGold > 0 || s.refugeeBurdenHappiness > 0)) return "";
  return loc(
    "LOC_EMIG_RO_BURDEN",
    "Refugee support burden: ~{1_Gold} gold/turn, {2_Happiness} happiness/turn",
    localeNumber(Math.round(s.refugeeBurdenGold), "", String(Math.round(s.refugeeBurdenGold))),
    localeNumber(s.refugeeBurdenHappiness, "0.0", s.refugeeBurdenHappiness.toFixed(1))
  );
}

/**
 * The "Why there:" explanation line for the current pull target (P0.1), or empty when there are no
 * reason tags.
 * @param {string[]|undefined} destReasons The pull target's reason-tag keys.
 * @returns {string} Line text or empty.
 */
function whyThereLine(destReasons) {
  const why = pullReasonsPhrase(destReasons);
  return why ? loc("LOC_EMIG_RO_WHY_THERE", "Why there: {1_Why}", why) : "";
}

/**
 * Push a line when non-empty.
 * @param {string[]} lines Readout lines.
 * @param {string|null|undefined} line Candidate line.
 */
function pushLineIf(lines, line) {
  if (line) lines.push(line);
}

/**
 * Build the readout view-model (title + lines + optional warning) from a CitySnapshot. Pure.
 * @param {*} s A CitySnapshot (from citySnapshot()), or null.
 * @returns {{title:string, titleBadge?:string, titleBadgeTone?:string,
 *   lines:string[], warn:(string|null), spark:(number[]|null)}|null} The model, or null.
 */
export function readoutModel(s) {
  if (!s) return null;
  const poolLevel = poolSeverity(s.refugeePool);
  const lines = [];
  lines.push(loc("LOC_EMIG_RO_PRESSURE", "Pressure: {1_Val}{2_Status}", pressureText(s), statusSuffix(s)));
  pushLineIf(lines, s.topDestinationName
    ? loc("LOC_EMIG_RO_PULLED_TOWARD", "Pulled toward {1_Name}{2_Rival}", s.topDestinationName,
      s.crossCiv ? loc("LOC_EMIG_RO_RIVAL_CIV", " (rival civ)") : "")
    : "");
  pushLineIf(lines, s.topDestinationName ? whyThereLine(s.destReasons) : "");
  pushLineIf(lines, refugeePoolLine(s));
  pushLineIf(lines, refugeeBurdenLine(s));
  pushLineIf(lines, s.assimLoad > 0
    ? loc("LOC_EMIG_RO_ASSIM_COST", "Assimilation cost: ~{1_Gold} gold/turn", Math.round(s.assimCostGold))
    : "");
  pushLineIf(lines, originsLine(s.composition));
  lines.push(loc("LOC_EMIG_RO_CIV_NET", "Civ net migration: {1_People} people", signedPeople(s.ownerNet)));
  // Pass the settlement name so the prosperity hint's {1_City} placeholder resolves (it names the
  // settlement being out-prospered); other hints ignore the arg.
  pushLineIf(lines, actionHint(s.cause, s.cityName || loc("LOC_EMIG_RO_DEFAULT_CITY", "Settlement")));
  pushLineIf(lines, permanenceCue(s.cause));
  return {
    title: loc("LOC_EMIG_RO_TITLE", "{1_City} - Migration", s.cityName || loc("LOC_EMIG_RO_DEFAULT_CITY", "Settlement")),
    titleBadge: poolBadgeLabel(poolLevel),
    titleBadgeTone: poolLevel,
    lines,
    warn: warnText(s),
    spark: sparkSeries(s)
  };
}

/**
 * The recent net-migration series to draw, or null when the sparkline is off or the city has no
 * history yet (Feature E). Kept out of readoutModel to hold its branch complexity down.
 * @param {*} s The city snapshot.
 * @returns {number[]|null} A copy of the series, or null.
 */
function sparkSeries(s) {
  if (!CONFIG.cityReadoutSparkline) return null;
  return Array.isArray(s.netSeries) && s.netSeries.length ? s.netSeries.slice() : null;
}

// Panel styling reuses the feedback toast's HUD tones (dark panel + parchment text).
const PANEL_CSS =
  ".emig-readout{position:fixed;z-index:98;min-width:16rem;max-width:24rem;" +
  "padding:0.5rem 0.8rem;pointer-events:none;" +
  'font-family:"BodyFont","BodyFont-JP","BodyFont-KR","BodyFont-SC","BodyFont-TC";' +
  "font-size:var(--dg-fs-85);color:#e5d2ac;" +
  "background:linear-gradient(180deg,rgba(18,21,31,0.94) 0%,rgba(5,7,13,0.94) 100%);" +
  "border:0.0555rem solid rgba(229,210,172,0.4);border-radius:0.333rem;" +
  "box-shadow:0 0.166rem 0.5rem rgba(0,0,0,0.6);}" +
  ".emig-readout .emig-rt-title{display:flex;align-items:center;gap:0.35rem;font-weight:bold;margin-bottom:0.25rem;}" +
  ".emig-readout .emig-rt-badge{font-size:var(--dg-fs-65);letter-spacing:0.08em;text-transform:uppercase;padding:0.04rem 0.28rem;border-radius:0.14rem;border:0.0555rem solid transparent;}" +
  ".emig-readout .emig-rt-badge.low{color:#9dd6d9;border-color:rgba(157,214,217,0.6);background:rgba(46,86,92,0.45);}" +
  ".emig-readout .emig-rt-badge.medium{color:#f4d085;border-color:rgba(244,208,133,0.65);background:rgba(120,84,28,0.4);}" +
  ".emig-readout .emig-rt-badge.high{color:#f3a2a2;border-color:rgba(243,162,162,0.68);background:rgba(126,42,42,0.45);}" +
  ".emig-readout .emig-rt-line{opacity:0.92;margin:0.05rem 0;}" +
  ".emig-readout .emig-rt-warn{color:#f0a868;margin-top:0.2rem;}" +
  ".emig-readout .emig-rt-sparklabel{opacity:0.6;font-size:var(--dg-fs-72);margin-top:0.3rem;}" +
  ".emig-readout .emig-rt-spark{display:flex;align-items:flex-end;gap:0.06rem;height:1.1rem;margin-top:0.1rem;}" +
  ".emig-readout .emig-rt-bar{width:0.16rem;min-height:0.05rem;border-radius:0.02rem;}";

// Sparkline bar colours: green = a net-gaining pass, red = net-losing, faint = no net change.
const SPARK_UP = "#7fd08a";
const SPARK_DOWN = "#e0786b";
const SPARK_ZERO = "rgba(229,210,172,0.35)";

/**
 * Build a tiny bottom-aligned bar strip from a net-migration series: one bar per pass, height by
 * magnitude (relative to the largest swing) and colour by direction. GameFace-safe (plain divs).
 * @param {number[]} values Recent net pop-point changes, oldest first.
 * @returns {*} A `<div>` bar strip element.
 */
function sparkline(values) {
  const row = document.createElement("div");
  row.className = "emig-rt-spark";
  const maxAbs = values.reduce((m, v) => Math.max(m, Math.abs(v)), 0) || 1;
  for (const v of values) {
    const bar = document.createElement("div");
    bar.className = "emig-rt-bar";
    bar.style.height = (v === 0 ? 8 : Math.max(15, Math.round((Math.abs(v) / maxAbs) * 100))) + "%";
    bar.style.background = v > 0 ? SPARK_UP : v < 0 ? SPARK_DOWN : SPARK_ZERO;
    row.appendChild(bar);
  }
  return row;
}

/** @type {*} */
let _el = null;

/** Inject the panel stylesheet once. */
function injectStyle() {
  try {
    if (document.getElementById("emig-readout-style")) return;
    const st = document.createElement("style");
    st.id = "emig-readout-style";
    st.textContent = PANEL_CSS;
    document.head.appendChild(st);
  } catch (_) {
    /* ignore */
  }
}

/**
 * Inline-position the panel by configured corner (default top-right).
 * @param {*} el The panel element.
 */
function positionPanel(el) {
  const corner = typeof CONFIG.cityReadoutCorner === "string" ? CONFIG.cityReadoutCorner : "top-right";
  const top = corner.indexOf("bottom") < 0;
  const left = corner.indexOf("left") >= 0;
  el.style.top = top ? "9rem" : "";
  el.style.bottom = top ? "" : "9rem";
  el.style.left = left ? "1rem" : "";
  el.style.right = left ? "" : "1rem";
}

/**
 * Append a child div with text to the panel.
 * @param {*} parent The panel element.
 * @param {string} cls The class name.
 * @param {string} text The text content.
 */
function appendLine(parent, cls, text) {
  const d = document.createElement("div");
  d.className = cls;
  d.textContent = text;
  parent.appendChild(d);
}

/**
 * Append the title row with optional severity badge.
 * @param {*} parent The panel element.
 * @param {string} title Readout title.
 * @param {string|undefined} badge Badge label.
 * @param {string|undefined} badgeTone Badge tone class.
 */
function appendTitle(parent, title, badge, badgeTone) {
  const row = document.createElement("div");
  row.className = "emig-rt-title";
  const titleEl = document.createElement("span");
  titleEl.textContent = title;
  row.appendChild(titleEl);
  if (badge) {
    const b = document.createElement("span");
    b.className = "emig-rt-badge " + (badgeTone || "low");
    b.textContent = badge;
    row.appendChild(b);
  }
  parent.appendChild(row);
}

/**
 * Append the panel's own content: title, lines, warning, sparkline. Split out of renderPanel so both
 * stay within the complexity cap now that the panel also hosts the Feature L explainer.
 * @param {*} el The panel element.
 * @param {{title:string, titleBadge?:string, titleBadgeTone?:string,
 *   lines:string[], warn:(string|null), spark:(number[]|null)}} model The view-model.
 */
function appendBody(el, model) {
  appendTitle(el, model.title, model.titleBadge, model.titleBadgeTone);
  for (const line of model.lines) appendLine(el, "emig-rt-line", line);
  if (model.warn) appendLine(el, "emig-rt-warn", model.warn);
  if (model.spark && model.spark.length) {
    appendLine(el, "emig-rt-sparklabel", loc("LOC_EMIG_RO_SPARK_LABEL", "Recent net migration"));
    el.appendChild(sparkline(model.spark));
  }
}

/**
 * Render the model into the (created-on-demand) panel element.
 * @param {{title:string, titleBadge?:string, titleBadgeTone?:string,
 *   lines:string[], warn:(string|null), spark:(number[]|null)}} model The view-model.
 * @param {string} [cityKey] The rendered settlement's stable key, for the Feature L explainer (the
 *   readout's own model can't carry its rows: they are decomposed from the live signal, not the
 *   snapshot).
 */
function renderPanel(model, cityKey) {
  try {
    const root = document.body || document.documentElement;
    if (!root) return;
    injectStyle();
    if (!_el) {
      _el = document.createElement("div");
      _el.className = "emig-readout";
      _el.id = "emig-readout";
    }
    _el.innerHTML = "";
    appendBody(_el, model);
    if (cityKey) mountExplain(_el, cityKey); // no-op when the explainer is off
    positionPanel(_el);
    if (!_el.parentNode) root.appendChild(_el);
  } catch (_) {
    /* ignore */
  }
}

/** @type {Map<string, boolean>} */
const _holdingActiveByCity = new Map();

/**
 * Track selected-city refugee holding transitions and toast threshold crossings.
 * @param {*} snap City snapshot.
 */
function maybeToastHoldingTransition(snap) {
  if (!CONFIG.cityReadoutPoolToasts || !snap || !snap.cityKey) return;
  const key = snap.cityKey;
  const nowActive = snap.refugeePool > 0;
  const prev = _holdingActiveByCity.get(key);
  _holdingActiveByCity.set(key, nowActive);
  if (_holdingActiveByCity.size > MAX_TRACKED_CITIES) _holdingActiveByCity.clear();
  if (typeof prev !== "boolean" || prev === nowActive) return;
  if (nowActive) {
    toast(
      loc("LOC_EMIG_RO_TOAST_ESTABLISHED", "{1_City} established refugee holding ({2_Pts} pts)",
        snap.cityName || loc("LOC_EMIG_RO_A_SETTLEMENT", "A settlement"), snap.refugeePool),
      "crisis"
    );
    return;
  }
  toast(
    loc("LOC_EMIG_RO_TOAST_CLEARED", "{1_City} cleared its refugee holding pool",
      snap.cityName || loc("LOC_EMIG_RO_A_SETTLEMENT", "A settlement")),
    "crisis"
  );
}

/**
 * Show the readout for a city (a stable key, a city object, or a numeric localId/id). No-op when
 * disabled or when no snapshot can be built (hides any stale panel in the latter case).
 * @param {*} cityId The city identifier.
 */
function showCityReadout(cityId) {
  if (!CONFIG.cityReadoutEnabled) return;
  const snap = citySnapshot(cityId);
  const model = readoutModel(snap);
  if (!model) {
    hideCityReadout();
    return;
  }
  maybeToastHoldingTransition(snap);
  renderPanel(model, snap?.cityKey);
}

/** Hide the readout panel. */
function hideCityReadout() {
  try {
    if (_el && _el.parentNode) _el.remove();
  } catch (_) {
    /* ignore */
  }
}

/** Candidate UI-VM city-selection events (probe-verification item; subscribed defensively). */
const SELECTION_EVENTS = ["CitySelectionChanged", "CitySelected"];

/**
 * Resolve a city identifier from a selection-event payload (best-effort across payload shapes).
 * @param {*} d The event payload.
 * @returns {*} A city id/object, or null.
 */
function selectedCityId(d) {
  if (!d) return null;
  return d.city ?? d.cityID ?? d.id ?? null;
}

/**
 * Handle a city-selection event: show the readout for the selected city, else hide.
 * @param {*} d The event payload.
 */
function onSelection(d) {
  const id = selectedCityId(d);
  if (id == null) {
    hideCityReadout();
    return;
  }
  showCityReadout(id);
}

/** Extend the console API with the readout commands (the guaranteed manual trigger). */
function extendConsoleApi() {
  try {
    const api = /** @type {*} */ (globalThis).emigration || ((globalThis).emigration = {});
    api.city = (/** @type {*} */ id) => showCityReadout(id);
    api.hideCity = () => hideCityReadout();
  } catch (_) {
    /* ignore */
  }
}

/** Best-effort subscribe to the candidate selection events. */
function wireSelection() {
  try {
    if (typeof engine === "undefined" || typeof engine.on !== "function") return;
    for (const name of SELECTION_EVENTS) {
      try {
        engine.on(name, (/** @type {*} */ d) => onSelection(d));
      } catch (_) {
        /* ignore - this event name may not exist on this build */
      }
    }
  } catch (_) {
    /* ignore */
  }
}

/** Install the city readout: console commands + best-effort selection auto-show. */
export function installCityReadout() {
  extendConsoleApi();
  wireSelection();
}
