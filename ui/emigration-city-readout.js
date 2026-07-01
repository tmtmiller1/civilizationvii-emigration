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
import { formatPeople } from "/emigration/ui/emigration-population.js";

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
  if (s.onCooldown) return " (resting " + s.cooldown + ")";
  if (s.pressureToBar > 0) return " (" + Math.round(s.pressureToBar * 100) + "% to next move)";
  return "";
}

/**
 * The warning line, if any: trapped-with-no-refuge outranks ordinary distress.
 * @param {*} s The snapshot.
 * @returns {string|null} The warning, or null.
 */
function warnText(s) {
  if (s.attritionRisk) return "At risk: trapped with nowhere to flee";
  if (s.atRisk) return "Under distress - people are looking to leave";
  return null;
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
  return "Origins: " + top.join(", ") + (extra > 0 ? " (+" + extra + " more)" : "");
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
    return mix.map((/** @type {*} */ c) => c.label + " " + c.share + "%").join(" · ");
  }
  return s.causeLabel;
}

/**
 * Build the readout view-model (title + lines + optional warning) from a CitySnapshot. Pure.
 * @param {*} s A CitySnapshot (from citySnapshot()), or null.
 * @returns {{title:string, lines:string[], warn:(string|null)}|null} The model, or null.
 */
export function readoutModel(s) {
  if (!s) return null;
  const lines = [];
  lines.push("Pressure: " + pressureText(s) + statusSuffix(s));
  if (s.topDestinationName) {
    lines.push("Pulled toward " + s.topDestinationName + (s.crossCiv ? " (rival civ)" : ""));
  }
  if (s.assimLoad > 0) lines.push("Assimilation cost: ~" + Math.round(s.assimCostGold) + " gold/turn");
  const origins = originsLine(s.composition);
  if (origins) lines.push(origins);
  lines.push("Civ net migration: " + signedPeople(s.ownerNet) + " people");
  const hint = actionHint(s.cause);
  if (hint) lines.push(hint);
  const perm = permanenceCue(s.cause);
  if (perm) lines.push(perm);
  return { title: (s.cityName || "Settlement") + " - Migration", lines, warn: warnText(s) };
}

// Panel styling reuses the feedback toast's HUD tones (dark panel + parchment text).
const PANEL_CSS =
  ".emig-readout{position:fixed;z-index:98;min-width:16rem;max-width:24rem;" +
  "padding:0.5rem 0.8rem;pointer-events:none;" +
  'font-family:"BodyFont","BodyFont-JP","BodyFont-KR","BodyFont-SC","BodyFont-TC";' +
  "font-size:0.85rem;color:#e5d2ac;" +
  "background:linear-gradient(180deg,rgba(18,21,31,0.94) 0%,rgba(5,7,13,0.94) 100%);" +
  "border:0.0555rem solid rgba(229,210,172,0.4);border-radius:0.333rem;" +
  "box-shadow:0 0.166rem 0.5rem rgba(0,0,0,0.6);}" +
  ".emig-readout .emig-rt-title{font-weight:bold;margin-bottom:0.25rem;}" +
  ".emig-readout .emig-rt-line{opacity:0.92;margin:0.05rem 0;}" +
  ".emig-readout .emig-rt-warn{color:#f0a868;margin-top:0.2rem;}";

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
 * Render the model into the (created-on-demand) panel element.
 * @param {{title:string, lines:string[], warn:(string|null)}} model The view-model.
 */
function renderPanel(model) {
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
    appendLine(_el, "emig-rt-title", model.title);
    for (const line of model.lines) appendLine(_el, "emig-rt-line", line);
    if (model.warn) appendLine(_el, "emig-rt-warn", model.warn);
    positionPanel(_el);
    if (!_el.parentNode) root.appendChild(_el);
  } catch (_) {
    /* ignore */
  }
}

/**
 * Show the readout for a city (a stable key, a city object, or a numeric localId/id). No-op when
 * disabled or when no snapshot can be built (hides any stale panel in the latter case).
 * @param {*} cityId The city identifier.
 */
function showCityReadout(cityId) {
  if (!CONFIG.cityReadoutEnabled) return;
  const model = readoutModel(citySnapshot(cityId));
  if (!model) {
    hideCityReadout();
    return;
  }
  renderPanel(model);
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
