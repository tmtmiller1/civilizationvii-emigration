// emigration-ledger-view.js
//
// The "Net Migration Table": the per-civ ledger (net, gross in/out, refugees, losses, border-stance
// impact) plus a per-cause "drivers" sub-line that explains each civ's net. Split out of
// emigration-views.js (which renders the rest of the dashboard) so each stays within its line budget.
// Pure rendering; the row data is gathered in emigration-window.js and shaped by civLedgerRows.

import { formatPeople } from "/emigration/ui/emigration-population.js";
import { getNumberMode, NumberMode } from "/emigration/ui/emigration-settings.js";

/**
 * Create an element with an optional class + text.
 * @param {string} tag Tag name.
 * @param {string} [cls] Class.
 * @param {string} [text] Text content.
 * @returns {HTMLElement} The element.
 */
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/**
 * Format a value per the active number mode: Civ pop-points, scaled people, or both.
 * @param {number} people Scaled people.
 * @param {number} points Raw pop points.
 * @param {number} mode A NumberMode value.
 * @returns {string} Formatted.
 */
function formatCount(people, points, mode) {
  if (mode === NumberMode.CIV) return String(Math.round(points || 0));
  if (mode === NumberMode.HISTORICAL) return formatPeople(people);
  return Math.round(points || 0) + " (" + formatPeople(people) + ")";
}

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
 * A signed value per the active number mode.
 * @param {number} people Scaled people (sets the sign).
 * @param {number} points Raw pop points.
 * @param {number} mode A NumberMode value.
 * @returns {string} Signed, formatted.
 */
function signedCount(people, points, mode) {
  const sgn = (/** @type {number} */ v) => (v > 0 ? "+" : v < 0 ? "-" : "");
  if (mode === NumberMode.CIV) return sgn(points) + Math.round(Math.abs(points || 0));
  if (mode === NumberMode.HISTORICAL) return signedPeople(people);
  return sgn(points) + Math.round(Math.abs(points || 0)) + " (" + signedPeople(people) + ")";
}

/**
 * A ledger cell (string text or an element child), with optional extra classes (e.g. "name"/"net").
 * @param {string|HTMLElement} content Text or node.
 * @param {string} [extra] Extra class(es).
 * @returns {HTMLElement} The cell.
 */
function ledgerCell(content, extra) {
  const c = el("div", "emig-led-c" + (extra ? " " + extra : ""));
  if (typeof content === "string") c.textContent = content;
  else c.appendChild(content);
  return c;
}

/**
 * The Net cell: the signed number only (formatted per the active number mode). The magnitude is shown
 * separately in the diverging bar column (ledgerNetBarCell) so the bars share one zero axis.
 * @param {*} r Ledger row.
 * @param {number} mode A NumberMode value.
 * @returns {HTMLElement} The cell.
 */
function ledgerNetCell(r, mode) {
  const num = el("span", r.netP > 0 ? "emig-pos" : r.netP < 0 ? "emig-neg" : "",
    signedCount(r.netP, r.netPts, mode));
  return ledgerCell(num, "net");
}

/**
 * The diverging Net BAR cell: a shared zero-centred axis so rows read against each other, a RED bar
 * grows LEFT of centre for a net loss, a GREEN bar grows RIGHT for a net gain, scaled to the largest
 * mover. The signed number itself stays in the "Net" column.
 * @param {*} r Ledger row.
 * @param {number} maxNet Largest absolute net (people) across the rows.
 * @returns {HTMLElement} The cell.
 */
function ledgerNetBarCell(r, maxNet) {
  const track = el("div");
  track.style.cssText = "position:relative;width:100%;height:0.7rem;";
  const centre = el("div");
  centre.style.cssText =
    "position:absolute;left:50%;top:-0.12rem;bottom:-0.12rem;width:0.06rem;background:rgba(210,194,165,0.35);";
  track.appendChild(centre);
  const frac = Math.min(1, Math.abs(r.netP || 0) / (maxNet || 1));
  if (frac > 0) {
    const bar = el("div");
    const side = r.netP >= 0 ? "left:50%;" : "right:50%;";
    const col = r.netP >= 0 ? "#5fae6b" : "#c25b54";
    bar.style.cssText = "position:absolute;top:0;height:100%;border-radius:0.2rem;" +
      side + "width:" + (frac * 50) + "%;background:" + col + ";";
    track.appendChild(bar);
  }
  return ledgerCell(track, "net-bar");
}

/**
 * The proportion (%) the stance changed immigration vs the neutral baseline (in − impact): +Pro
 * allowed beyond, −Anti prevented. 0 when neutral or no baseline.
 * @param {*} r Ledger row.
 * @returns {number} Signed percentage.
 */
function stancePct(r) {
  const neutral = r.inP - r.stInP; // estimated immigration with a neutral stance
  if (!(Math.abs(neutral) > 0)) return 0;
  return Math.round((r.stInP / neutral) * 100);
}

/**
 * The "Stance impact" cell: how a civ's border policy changed its immigration IN, signed people
 * (allowed beyond / prevented) plus the proportion vs a neutral baseline. "-" when neutral.
 * @param {*} r Ledger row.
 * @param {number} mode A NumberMode value.
 * @returns {HTMLElement} The cell.
 */
function ledgerStanceCell(r, mode) {
  if (!r.stInP && !r.stOutP) return ledgerCell("—", "stance");
  const pct = stancePct(r);
  const txt = signedCount(r.stInP, r.stInPts, mode) + (pct ? " (" + (pct > 0 ? "+" : "") + pct + "%)" : "");
  return ledgerCell(txt, "stance " + (r.stInP > 0 ? "emig-pos" : r.stInP < 0 ? "emig-neg" : ""));
}

/**
 * Build one ledger data row (flex), name, net, In / Out / Stance impact / Refugees / Losses.
 * @param {*} r Ledger row.
 * @param {number} maxNet Largest absolute net (people).
 * @param {number} mode A NumberMode value.
 * @returns {HTMLElement} The row.
 */
function ledgerDataRow(r, maxNet, mode) {
  const row = el("div", "emig-led-row");
  row.appendChild(ledgerCell(r.name, "name"));
  row.appendChild(ledgerNetCell(r, mode));
  row.appendChild(ledgerNetBarCell(r, maxNet));
  row.appendChild(ledgerCell(formatCount(r.inP, r.inPts, mode)));
  row.appendChild(ledgerCell(formatCount(r.outP, r.outPts, mode)));
  row.appendChild(ledgerStanceCell(r, mode));
  row.appendChild(ledgerCell(formatCount(r.refP, r.refPts, mode)));
  row.appendChild(ledgerCell(formatCount(r.lossP, r.lossPts, mode)));
  return row;
}

/**
 * The per-cause "drivers" sub-line shown under a civ's row: the signed net-by-cause that explains its
 * net. Full width, muted; omitted when there's no migration.
 * @param {*} r Ledger row (carries `drivers`).
 * @returns {HTMLElement|null} The sub-line, or null.
 */
function ledgerDriversRow(r) {
  if (!r.drivers) return null;
  const row = el("div", "emig-led-drivers", "Drivers: " + r.drivers);
  row.style.cssText = "opacity:0.7;font-size:0.85rem;padding:0 0 0.3rem 0.4rem;width:100%;";
  return row;
}

/**
 * The header or totals row (plain text cells). cells: name, net, in, out, stance, refugees, losses.
 * @param {string[]} cells Cell strings.
 * @param {string} cls Row class.
 * @returns {HTMLElement} The row.
 */
function ledgerTextRow(cells, cls) {
  const row = el("div", "emig-led-row " + cls);
  row.appendChild(ledgerCell(cells[0], "name"));
  row.appendChild(ledgerCell(cells[1], "net"));
  row.appendChild(ledgerCell("", "net-bar")); // align with the data rows' diverging-bar column
  for (let i = 2; i < cells.length; i++) row.appendChild(ledgerCell(cells[i]));
  return row;
}

/**
 * Render the per-civ Net Migration Table as flexbox rows (proper columns + full width), sorted by
 * net, with a magnitude bar on Net, a per-cause drivers sub-line under each civ, a totals row, and
 * numbers in the active mode (Civ pop / people / both).
 * @param {HTMLElement} body Card body.
 * @param {*[]} rows Ledger rows.
 */
export function renderLedger(body, rows) {
  const mode = getNumberMode();
  body.appendChild(el("div", "emig-section-title", "Net Migration (Detail)"));
  const wrap = el("div", "emig-led");
  wrap.appendChild(ledgerTextRow(
    ["Civilization", "Net", "In", "Out", "Stance impact", "Refugees", "Losses"], "emig-led-head"));
  const maxNet = rows.reduce((m, r) => Math.max(m, Math.abs(r.netP || 0)), 0) || 1;
  for (const r of rows) {
    wrap.appendChild(ledgerDataRow(r, maxNet, mode));
    const drivers = ledgerDriversRow(r);
    if (drivers) wrap.appendChild(drivers);
  }
  const sum = (/** @type {string} */ k) => rows.reduce((a, r) => a + (r[k] || 0), 0);
  const stTot = sum("stInP") || sum("stOutP")
    ? signedCount(sum("stInP"), sum("stInPts"), mode) : "—";
  wrap.appendChild(ledgerTextRow([
    "Total", signedCount(sum("netP"), sum("netPts"), mode),
    formatCount(sum("inP"), sum("inPts"), mode), formatCount(sum("outP"), sum("outPts"), mode),
    stTot, formatCount(sum("refP"), sum("refPts"), mode), formatCount(sum("lossP"), sum("lossPts"), mode)
  ], "emig-led-tot"));
  body.appendChild(wrap);
}
