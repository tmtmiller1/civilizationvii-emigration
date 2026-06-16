// emigration-views.js
//
// The shared RENDER CORE for the migration dashboards (the in-game-legibility plan, Phases 3-4):
// the standalone window (emigration-window.js) and — later — the Demographics page both mount these
// same widgets, so the content is built once here.
//
//   • Pure view-model builders (civ ledger, per-cause breakdown, border stances, the per-city
//     pressure table, and the top-level `dashboardModel`) — DOM-free, unit-tested.
//   • `renderDashboard(target, model)` — a DOM-light renderer the hosts reuse (untested, like the
//     toast/readout DOM).

import { formatPeople } from "/emigration/ui/emigration-population.js";
import { causeLabel } from "/emigration/ui/emigration-causes.js";

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
 * Per-civ ledger rows (gross in/out, net, refugees, deaths), formatted as people.
 * @param {*[]} civs Per-civ tallies: {name, in, out, net, refugees, deaths}.
 * @returns {*[]} Formatted ledger rows.
 */
export function civLedgerRows(civs) {
  return (civs || []).map((c) => ({
    name: c.name,
    in: formatPeople(c.in || 0),
    out: formatPeople(c.out || 0),
    net: signedPeople(c.net || 0),
    refugees: formatPeople(c.refugees || 0),
    deaths: formatPeople(c.deaths || 0)
  }));
}

/**
 * Per-cause breakdown rows, sorted by magnitude, with each cause's share of the total.
 * @param {Record<string, number>} byCause People per cause.
 * @returns {{label:string, people:string, pct:number}[]} Rows (descending).
 */
export function causeBreakdownRows(byCause) {
  const src = byCause || {};
  const entries = Object.keys(src)
    .map((c) => ({ cause: c, n: src[c] || 0 }))
    .filter((e) => e.n > 0);
  const total = entries.reduce((a, e) => a + e.n, 0);
  entries.sort((a, b) => b.n - a.n);
  return entries.map((e) => ({
    label: causeLabel(e.cause),
    people: formatPeople(e.n),
    pct: total > 0 ? Math.round((e.n / total) * 100) : 0
  }));
}

/** Stance code → display label. */
/** @type {Record<string,string>} */
const STANCE_LABEL = { pro: "Pro-Immigration", anti: "Anti-Immigration", none: "-" };

/**
 * Border-stance rows (only civs that hold a stance are worth listing).
 * @param {{name:string, stance?:string}[]} civs Civs.
 * @returns {{name:string, stance:string}[]} Rows.
 */
export function stanceRows(civs) {
  return (civs || [])
    .filter((c) => c.stance === "pro" || c.stance === "anti")
    .map((c) => ({ name: c.name, stance: STANCE_LABEL[c.stance || "none"] || STANCE_LABEL.none }));
}

/**
 * Per-city pressure rows, sorted by how close each is to shedding population.
 * @param {*[]} snapshots CitySnapshots.
 * @returns {{city:string, cause:string, pressure:string, dest:string, flag:string}[]} Rows.
 */
export function pressureRows(snapshots) {
  const rows = (snapshots || []).slice();
  rows.sort((a, b) => (b.pressureToBar || 0) - (a.pressureToBar || 0));
  return rows.map((s) => ({
    city: s.cityName,
    cause: s.causeLabel,
    pressure: Math.round((s.pressureToBar || 0) * 100) + "%",
    dest: s.topDestinationName || "-",
    flag: s.attritionRisk ? "at risk" : s.onCooldown ? "resting" : ""
  }));
}

/**
 * The full dashboard view-model: the four shared sections built from the gathered inputs.
 * @param {{civs?:*[], byCause?:Record<string,number>, cities?:*[]}} input Gathered data.
 * @returns {{sections:{title:string, kind:string, rows:*[]}[]}} The model.
 */
export function dashboardModel(input) {
  const d = input || {};
  return {
    sections: [
      { title: "Civilizations", kind: "ledger", rows: civLedgerRows(d.civs || []) },
      { title: "Why people move", kind: "bars", rows: causeBreakdownRows(d.byCause || {}) },
      { title: "Border stances", kind: "stances", rows: stanceRows(d.civs || []) },
      { title: "Your cities under pressure", kind: "pressure", rows: pressureRows(d.cities || []) }
    ]
  };
}

/**
 * Format one row of a section into a single display line (by section kind).
 * @param {string} kind The section kind.
 * @param {*} r The row.
 * @returns {string} The line.
 */
function formatRow(kind, r) {
  switch (kind) {
    case "ledger":
      return `${r.name}: net ${r.net} (in ${r.in} / out ${r.out}, refugees ${r.refugees}, deaths ${r.deaths})`;
    case "bars":
      return `${r.label}: ${r.people} (${r.pct}%)`;
    case "stances":
      return `${r.name}: ${r.stance}`;
    case "pressure":
      return `${r.city}: ${r.pressure} → ${r.dest} [${r.cause}]${r.flag ? " - " + r.flag : ""}`;
    default:
      return "";
  }
}

/**
 * Append a child div with text + class to a parent.
 * @param {*} parent Parent element.
 * @param {string} cls Class name.
 * @param {string} text Text content.
 */
function appendLine(parent, cls, text) {
  const d = document.createElement("div");
  d.className = cls;
  d.textContent = text;
  parent.appendChild(d);
}

/**
 * Render one section (title + its rows, or an "empty" note) into the target.
 * @param {*} target The container element.
 * @param {{title:string, kind:string, rows:*[]}} section The section model.
 */
function renderSection(target, section) {
  appendLine(target, "emig-dash-h", section.title);
  if (!section.rows.length) {
    appendLine(target, "emig-dash-row emig-dash-empty", "(none)");
    return;
  }
  for (const r of section.rows) appendLine(target, "emig-dash-row", formatRow(section.kind, r));
}

/**
 * Render the dashboard model into a target element (clears it first). DOM-light: one line per row.
 * @param {*} target The container element.
 * @param {{sections:{title:string, kind:string, rows:*[]}[]}} model The view-model.
 */
export function renderDashboard(target, model) {
  try {
    if (!target) return;
    target.innerHTML = "";
    for (const section of model.sections) renderSection(target, section);
  } catch (_) {
    /* ignore */
  }
}
