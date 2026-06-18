// emigration-detail-views.js
//
// The two flexbox "detail table" renderers for the migration dashboard , Border stances and the
// per-city pressure table. Split out of emigration-views.js to keep that render core under its size
// cap. GameFace lays out neither <table> nor CSS grid, so both are built from flexbox rows; styling
// lives in the dashboard's injected stylesheet (emigration-views.js).

import { formatPeople } from "/emigration/ui/emigration-population.js";

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
 * The stance-impact detail sentence for a civ's Borders row: how its border policy changed its
 * migration vs a neutral-borders baseline.
 * @param {*} r Stance row ({key, in, inImpact, outImpact}).
 * @returns {string} The detail text.
 */
function stanceDetailText(r) {
  if (r.key === "none") return "No border policy , migration unaffected.";
  const neutralIn = r.in - r.inImpact;
  const pct = Math.abs(neutralIn) > 0 ? Math.round((Math.abs(r.inImpact) / neutralIn) * 100) : 0;
  /** @type {string[]} */
  const parts = [];
  if (r.inImpact > 0) {
    parts.push("+" + formatPeople(r.inImpact) + " immigrants allowed beyond neutral"
      + (pct ? " (+" + pct + "%)" : ""));
  } else if (r.inImpact < 0) {
    parts.push(formatPeople(-r.inImpact) + " would-be immigrants turned away"
      + (pct ? " (−" + pct + "%)" : ""));
  }
  if (r.outImpact < 0) parts.push(formatPeople(-r.outImpact) + " of its own citizens kept home");
  return parts.length ? parts.join("; ") + "." : "Policy slotted, but no migration affected yet.";
}

/**
 * Render border stances: per civ a name + coloured Pro/Anti/Neutral tag, then a sentence
 * quantifying how the stance changed that civ's migration (the stance-impact counterfactual).
 * @param {HTMLElement} body Card body.
 * @param {*[]} rows Stance rows.
 */
export function renderStances(body, rows) {
  for (const r of rows) {
    const block = el("div", "emig-stance-block");
    const head = el("div", "emig-stance-row");
    head.appendChild(el("span", "emig-civ", r.name));
    head.appendChild(el("span", "emig-tag " + (r.key || "none"), r.stance));
    block.appendChild(head);
    block.appendChild(el("div", "emig-stance-detail", stanceDetailText(r)));
    body.appendChild(block);
  }
}

/**
 * A pressure-table cell.
 * @param {string} text Text (null for none).
 * @param {string} [extra] Extra class.
 * @returns {HTMLElement} The cell.
 */
function pressureCell(text, extra) {
  const c = el("div", "emig-pr-c" + (extra ? " " + extra : ""));
  if (text != null) c.textContent = text;
  return c;
}

/**
 * The pressure column cell: a bar plus the "% · flag" label.
 * @param {*} r Pressure row.
 * @returns {HTMLElement} The cell.
 */
function pressureBarCell(r) {
  const c = el("div", "emig-pr-c pres");
  const track = el("div", "emig-bar-track");
  const fill = el("div", "emig-bar-fill");
  fill.style.width = Math.max(2, parseInt(r.pressure, 10) || 0) + "%";
  track.appendChild(fill);
  c.appendChild(track);
  c.appendChild(el("span", "emig-flag", r.pressure + (r.flag ? " · " + r.flag : "")));
  return c;
}

// Pressure-table columns: [label, cell class].
const PRESSURE_COLS = [["City", "name"], ["Pressure", "pres"], ["Heading to", "dest"], ["Cause", ""]];

/**
 * Render the per-city pressure table as flexbox rows: pressure as a bar, plus destination + cause.
 * @param {HTMLElement} body Card body.
 * @param {*[]} rows Pressure rows.
 */
export function renderPressure(body, rows) {
  const wrap = el("div", "emig-pr");
  const head = el("div", "emig-pr-row emig-pr-head");
  for (const [label, cls] of PRESSURE_COLS) head.appendChild(pressureCell(label, cls));
  wrap.appendChild(head);
  for (const r of rows) {
    const row = el("div", "emig-pr-row");
    row.appendChild(pressureCell(r.city, "name"));
    row.appendChild(pressureBarCell(r));
    row.appendChild(pressureCell(r.dest, "dest"));
    row.appendChild(pressureCell(r.cause));
    wrap.appendChild(row);
  }
  body.appendChild(wrap);
}
