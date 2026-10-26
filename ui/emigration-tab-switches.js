// emigration-tab-switches.js
//
// Two tabs that each carry a second view behind a row of pills under the tab bar, so the dashboard has six tabs a
// player acts on instead of nine (2026-10-25, the owner: "keep only what is truly useful"): the Network tab shows
// the migration diagram or the Net Migration table ("Diagram | Table"), and the Cities tab shows the player's
// settlements or every civilization's cards, the old Causes tab ("Mine | All civilizations"). The choice is
// remembered for the session, per tab. The renderers and the pill builder come from emigration-views.js, which
// owns them; this module only decides which to call.

import { loc } from "/emigration/ui/emigration-loc.js";

/** @param {string} tag @param {string} [cls] @param {string} [text] @returns {HTMLElement} */
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/**
 * A row of rounded gold pills for choosing a view, the Demographics screen's own shape (view-pills.js there):
 * no label, the chosen one filled.
 * @param {{key:*, label:string}[]} items The views. @param {*} current The one showing.
 * @param {(key:*)=>void} onSelect Called with the chosen key (only when it differs from current).
 * @returns {HTMLElement} The row.
 */
function viewPills(items, current, onSelect) {
  const row = el("div", "emig-view-pills");
  for (const it of items) {
    const pill = el("div", "emig-view-pill" + (it.key === current ? " active" : ""), it.label);
    pill.addEventListener("click", () => {
      if (it.key !== current) onSelect(it.key);
    });
    row.appendChild(pill);
  }
  return row;
}

/** @type {{network:string, cities:string, sort:string}} The switches' positions this session. */
const chosen = { network: "diagram", cities: "mine", sort: "pressure" };

/**
 * @typedef {Object} SwitchDeps What the views module hands over.
 * @property {(body:HTMLElement, section:*, controlsHost?:HTMLElement)=>void} renderNetworkViz
 * @property {(body:HTMLElement, rows:*[])=>void} renderLedger
 * @property {(body:HTMLElement, section:*)=>void} renderCityFlows
 */

/** Test seam: the current positions. @returns {{network:string, cities:string, sort:string}} */
export function switchPositions() {
  return { ...chosen };
}

/** Test seam: reset both switches. */
export function _resetSwitches() {
  chosen.network = "diagram";
  chosen.cities = "mine";
  chosen.sort = "pressure";
}

/** Test seam: set one switch. @param {"network"|"cities"|"sort"} key @param {string} view */
export function _setSwitch(key, view) {
  chosen[key] = view;
}

/**
 * Mount a switch above the control row (or above the body when there is none) and draw the chosen view; a change
 * redraws the body in place.
 * @param {HTMLElement} body @param {HTMLElement|undefined} host The shared control host.
 * @param {{key:keyof typeof chosen, items:{key:string, label:string}[]}} spec
 * @param {(view:string)=>void} draw Draws one view into the (emptied) body.
 */
function mountSwitch(body, host, spec, draw) {
  const redraw = () => {
    body.innerHTML = "";
    draw(chosen[spec.key]);
  };
  mountPills(body, host, spec, redraw);
  redraw();
}

/**
 * The pills of one switch, placed where the Demographics screen puts its view pills (under the tabs, above the
 * controls and the content); picking another remembers it and calls `redraw`. Draws nothing itself.
 * @param {HTMLElement} body @param {HTMLElement|undefined} host
 * @param {{key:keyof typeof chosen, items:{key:string, label:string}[]}} spec @param {()=>void} redraw
 */
function mountPills(body, host, spec, redraw) {
  /** @type {HTMLElement} */
  let pill;
  /** @returns {HTMLElement} A group reflecting the current choice; picking another redraws the body. */
  const group = () => viewPills(spec.items, chosen[spec.key], (key) => {
    chosen[spec.key] = key;
    const next = group();
    // replaceChild, not replaceWith: the game's DOM has no replaceWith, and a throw here left the switch set
    // but the pill and the body unchanged (watched 2026-10-25).
    if (pill.parentNode) pill.parentNode.replaceChild(next, pill);
    pill = next;
    redraw();
  });
  pill = group();
  if (host) host.insertBefore(pill, host.firstChild);
  else if (body.parentElement) body.parentElement.insertBefore(pill, body);
}

/**
 * The Network tab: the diagram, or the Net Migration table behind "View: Table".
 * @param {HTMLElement} body @param {*} section The flow section, with `table` (the ledger rows).
 * @param {HTMLElement|undefined} host The control row. @param {SwitchDeps} deps
 */
export function renderNetworkTab(body, section, host, deps) {
  const items = [
    { key: "diagram", label: loc("LOC_EMIG_VIEW_NET_DIAGRAM", "Diagram") },
    { key: "table", label: loc("LOC_EMIG_VIEW_NET_TABLE_VIEW", "Table") }
  ];
  mountSwitch(body, host, { key: "network", items }, (view) => {
    if (view === "table") deps.renderLedger(body, section.table || []);
    else deps.renderNetworkViz(body, section);
  });
}

/**
 * The Cities tab: the player's settlements, or every civilization's cards (the old Causes tab) behind "Show: All".
 * @param {HTMLElement} body @param {*} section The cityflows section, with `civCards` (the per-civ cards).
 * @param {HTMLElement|undefined} host The control row. @param {SwitchDeps} deps
 */
export function renderCitiesTab(body, section, host, deps) {
  const items = [
    { key: "mine", label: loc("LOC_EMIG_VIEW_CITIES_MINE", "Your settlements") },
    { key: "all", label: loc("LOC_EMIG_VIEW_CITIES_ALL", "All civilizations") }
  ];
  const redraw = () => {
    body.innerHTML = "";
    const sort = chosen.sort;
    if (chosen.cities === "all") {
      deps.renderCityFlows(body, { kind: "pies", cities: section.civCards || [], diversity: section.diversity || [], sort });
    } else deps.renderCityFlows(body, { ...section, kind: "cityflows", cities: section.cities || [], sort });
  };
  mountPills(body, host, { key: "cities", items }, redraw);
  mountSortButtons(host, redraw);
  redraw();
}

/**
 * The sort (the owner, 2026-10-26: "sort by pressure rating", then "square filter buttons on the same level as
 * Scaled and Civ with a vertical line separating the two"): "By pressure" and "By name" as filter buttons on the
 * control row after a divider; the most pressed settlements first, or by name.
 * @param {HTMLElement|undefined} host The control host, holding the Scaled / Civ row. @param {()=>void} redraw
 */
function mountSortButtons(host, redraw) {
  if (!host) return;
  let row = host.querySelector(".emig-ctrl-row");
  if (!row) {
    row = el("div", "emig-ctrl-row");
    host.appendChild(row);
  }
  const items = [
    { key: "pressure", label: loc("LOC_EMIG_VIEW_SORT_PRESSURE", "By pressure") },
    { key: "name", label: loc("LOC_EMIG_VIEW_SORT_NAME", "By name") }
  ];
  const sep = el("span", "emig-ctrl-sep", "|");
  /** @type {HTMLElement} */
  let grp;
  const group = () => {
    const g = el("div", "emig-pill-grp emig-sort-grp");
    for (const it of items) {
      const btn = el("div", "emig-filter-btn" + (it.key === chosen.sort ? " active" : ""), it.label);
      btn.addEventListener("click", () => {
        if (it.key === chosen.sort) return;
        chosen.sort = it.key;
        const next = group();
        if (grp.parentNode) grp.parentNode.replaceChild(next, grp);
        grp = next;
        redraw();
      });
      g.appendChild(btn);
    }
    return g;
  };
  grp = group();
  row.appendChild(sep);
  row.appendChild(grp);
}
