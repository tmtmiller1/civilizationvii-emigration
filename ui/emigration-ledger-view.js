// emigration-ledger-view.js
//
// The "Net Migration Table": the per-civ ledger (net, movement counts, refugees, losses, border-stance
// impact) plus a per-cause "drivers" sub-line. Pure rendering; rows come from civLedgerRows.
// The counts come in three groups (Internal: own-settlement moves, which cancel in Net; External:
// cross-border moves, which Net measures; Total: both), each with the same Left / Arrived pair.

import { formatPeople } from "/emigration/ui/emigration-population.js";
import { getNumberMode, NumberMode } from "/emigration/ui/emigration-settings.js";
import { loc } from "/emigration/ui/emigration-loc.js";

// The table's stylesheet fragment, concatenated into the dashboard's injected CSS (DASH_CSS in
// emigration-views.js). Flexbox rows, because GameFace lays out neither <table> nor CSS grid: every
// row uses the same per-column flex ratios, so the columns line up, full width with no dead gap.
export const LEDGER_CSS =
  ".emig-led{display:flex;flex-direction:column;width:100%;}" +
  ".emig-led-row{display:flex;align-items:center;width:100%;}" +
  ".emig-led-c{flex:1 1 0;text-align:right;padding:0.62rem 0.6rem;font-size:var(--dg-fs-120);" +
  "overflow:hidden;white-space:nowrap;border-top:0.0277rem solid rgba(229,210,172,0.12);}" +
  // Column weights. ledgerGroupRow spans these in pairs, so its spans are sized from the SAME
  // numbers: name+net+bar = 2.2+1+1.3 = 4.5, each count pair = 2, and the trailing
  // stance+refugees+losses = 1.6+1+1 = 3.6. Change a weight here and change that span with it.
  ".emig-led-c.name{flex:2.2 1 0;text-align:left;color:#f0dca8;font-weight:bold;}" +
  ".emig-led-c.net{flex:1 1 0;}" +
  ".emig-led-c.net-bar{flex:1.3 1 0;}" +
  ".emig-led-c.stance{flex:1.6 1 0;}" +
  ".emig-led-head .emig-led-c{border-top:none;opacity:0.6;text-transform:uppercase;letter-spacing:0.03rem;font-size:var(--dg-fs-95);}" +
  // Group banding: a hairline before each count group (Internal / External / Total) so the paired
  // columns read as one block, plus the centered group labels above them.
  ".emig-led-c.grp-a,.emig-led-c.grp-b,.emig-led-c.grp-c{border-left:0.0277rem solid rgba(229,210,172,0.16);}" +
  ".emig-led-grp .emig-led-c{border-top:none;padding:0.3rem 0.6rem 0.05rem 0.6rem;text-align:center;" +
  "opacity:0.55;text-transform:uppercase;letter-spacing:0.04rem;font-size:var(--dg-fs-85);}" +
  ".emig-led-grp .emig-led-c.lbl{color:#e5d2ac;border-bottom:0.0277rem solid rgba(229,210,172,0.22);}" +
  ".emig-led-net{display:flex;align-items:center;justify-content:flex-end;gap:0.4rem;}" +
  ".emig-led-bar{height:0.7rem;border-radius:0.35rem;flex:0 0 auto;min-width:0.16rem;}" +
  // The divider sits on the ROW (one continuous full-width line) rather than each cell: the row is
  // align-items:center, so the empty net-bar cell is shorter than the text cells and a per-cell
  // border-top would land at a different height there, breaking the line at the graph column.
  ".emig-led-tot{border-top:0.0833rem solid rgba(201,162,76,0.45);}" +
  ".emig-led-tot .emig-led-c{border-top:none;font-weight:bold;}";

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
 * Exported so every count-bearing table reads identically under the shared Numbers toggle (the
 * diversity ranking's population column reuses this rather than growing a second formatter).
 * @param {number} people Scaled people.
 * @param {number} points Raw pop points.
 * @param {number} mode A NumberMode value.
 * @returns {string} Formatted.
 */
export function formatCount(people, points, mode) {
  if (mode === NumberMode.CIV) return String(Math.round(points || 0));
  if (mode === NumberMode.HISTORICAL) return formatPeople(people);
  return Math.round(points || 0) + " (" + formatPeople(people) + ")";
}

/**
 * Split one civ's gross movement into its internal (within-civ) and external (cross-border) halves.
 * The tallies record gross and internal; external is the remainder, floored at 0 so a backfilled
 * internal share can never read negative.
 * @param {*} c Civ tallies.
 * @returns {*} {intInP, intOutP, intInPts, intOutPts, extInP, extOutP, extInPts, extOutPts}.
 */
export function splitInternalExternal(c) {
  const n = (/** @type {*} */ v) => v || 0;
  const ext = (/** @type {*} */ gross, /** @type {*} */ internal) => Math.max(0, n(gross) - n(internal));
  return {
    intInP: n(c.intIn), intOutP: n(c.intOut), intInPts: n(c.intInPts), intOutPts: n(c.intOutPts),
    extInP: ext(c.in, c.intIn), extOutP: ext(c.out, c.intOut),
    extInPts: ext(c.inPts, c.intInPts), extOutPts: ext(c.outPts, c.intOutPts)
  };
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
 * The diverging Net BAR cell: a shared zero-centered axis so rows read against each other, a RED bar
 * grows LEFT of center for a net loss, a GREEN bar grows RIGHT for a net gain, scaled to the largest
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
  // Divide by the magnitude of the baseline and keep the sign from the impact (r.stInP), so a
  // negative baseline cannot flip the sign.
  return Math.round((r.stInP / Math.abs(neutral)) * 100);
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
 * The count columns right of the Net bar, in render order. `people`/`points` name the row fields the
 * cell formats (shared by header, data cell and Total row); `cls` carries the group separator. The
 * Stance-impact column is flagged because it renders a signed impact plus a percentage.
 * @type {{people:string, points:string, key:string, en:string, cls:string, stance?:boolean}[]}
 */
const COUNT_COLS = [
  { people: "intOutP", points: "intOutPts", key: "LOC_EMIG_LG_COL_INT_LEFT", en: "Left", cls: "grp-a" },
  { people: "intInP", points: "intInPts", key: "LOC_EMIG_LG_COL_INT_ARRIVED", en: "Arrived", cls: "grp-a-end" },
  { people: "extOutP", points: "extOutPts", key: "LOC_EMIG_LG_COL_EXT_OUT", en: "Left", cls: "grp-b" },
  { people: "extInP", points: "extInPts", key: "LOC_EMIG_LG_COL_EXT_IN", en: "Arrived", cls: "grp-b-end" },
  { people: "outP", points: "outPts", key: "LOC_EMIG_LG_COL_TOT_OUT", en: "Left", cls: "grp-c" },
  { people: "inP", points: "inPts", key: "LOC_EMIG_LG_COL_TOT_IN", en: "Arrived", cls: "grp-c-end" },
  { people: "", points: "", key: "LOC_EMIG_LG_COL_STANCE", en: "Stance impact", cls: "stance", stance: true },
  { people: "refP", points: "refPts", key: "LOC_EMIG_LG_COL_REFUGEES", en: "Refugees", cls: "" },
  { people: "lossP", points: "lossPts", key: "LOC_EMIG_LG_COL_LOSSES", en: "Losses", cls: "" }
];

/**
 * Build one ledger data row (flex): name, net, the net bar, then every count column.
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
  for (const c of COUNT_COLS) {
    row.appendChild(c.stance
      ? ledgerStanceCell(r, mode)
      : ledgerCell(formatCount(r[c.people], r[c.points], mode), c.cls));
  }
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
  const row = el("div", "emig-led-drivers", loc("LOC_EMIG_LG_DRIVERS", "Drivers: {1_Drivers}", r.drivers));
  row.style.cssText = "opacity:0.7;font-size:var(--dg-fs-85);padding:0 0 0.3rem 0.4rem;width:100%;";
  return row;
}

/**
 * The header or totals row: the leading name/net/net-bar cells plus one cell per count column. Every
 * cell carries the SAME class its data-row counterpart gets, so each column's flex basis matches.
 * @param {string} name The first (Civilization / Total) cell.
 * @param {string} net The Net cell.
 * @param {string[]} counts One string per COUNT_COLS entry, in order.
 * @param {string} cls Row class.
 * @returns {HTMLElement} The row.
 */
function ledgerTextRow(name, net, counts, cls) {
  const row = el("div", "emig-led-row " + cls);
  row.appendChild(ledgerCell(name, "name"));
  row.appendChild(ledgerCell(net, "net"));
  row.appendChild(ledgerCell("", "net-bar")); // align with the data rows' diverging-bar column
  COUNT_COLS.forEach((c, i) => row.appendChild(ledgerCell(counts[i] || "", c.cls)));
  return row;
}

/**
 * The spanning group header above the column headings: one centered label per count group (Internal /
 * External / Total), with spans sized by summing the flex weights of the columns they cover.
 * @returns {HTMLElement} The row.
 */
function ledgerGroupRow() {
  const row = el("div", "emig-led-row emig-led-grp");
  const span = (/** @type {number} */ flex, /** @type {string} */ text) => {
    const c = el("div", "emig-led-c" + (text ? " lbl" : ""), text);
    c.style.flex = flex + " 1 0";
    row.appendChild(c);
  };
  span(4.5, ""); // Civilization + Net + the net bar
  span(2, loc("LOC_EMIG_LG_GRP_INTERNAL", "Internal"));
  span(2, loc("LOC_EMIG_LG_GRP_EXTERNAL", "External"));
  span(2, loc("LOC_EMIG_LG_GRP_TOTAL", "Total"));
  span(3.6, ""); // Stance impact + Refugees + Losses
  return row;
}

/**
 * The Total row's cells: each count column summed across the rows (the Stance column keeps its own
 * signed/"—" treatment).
 * @param {*[]} rows Ledger rows.
 * @param {number} mode A NumberMode value.
 * @returns {string[]} One string per COUNT_COLS entry.
 */
function ledgerTotalCounts(rows, mode) {
  const sum = (/** @type {string} */ k) => rows.reduce((a, r) => a + (r[k] || 0), 0);
  return COUNT_COLS.map((c) => {
    if (!c.stance) return formatCount(sum(c.people), sum(c.points), mode);
    return sum("stInP") || sum("stOutP") ? signedCount(sum("stInP"), sum("stInPts"), mode) : "—";
  });
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
  body.appendChild(el("div", "emig-section-title", loc("LOC_EMIG_LG_TITLE", "Net Migration (Detail)")));
  const wrap = el("div", "emig-led");
  wrap.appendChild(ledgerGroupRow());
  wrap.appendChild(ledgerTextRow(
    loc("LOC_EMIG_LG_COL_CIV", "Civilization"), loc("LOC_EMIG_LG_COL_NET", "Net"),
    COUNT_COLS.map((c) => loc(c.key, c.en)), "emig-led-head"));
  const maxNet = rows.reduce((m, r) => Math.max(m, Math.abs(r.netP || 0)), 0) || 1;
  for (const r of rows) {
    wrap.appendChild(ledgerDataRow(r, maxNet, mode));
    const drivers = ledgerDriversRow(r);
    if (drivers) wrap.appendChild(drivers);
  }
  const netTot = rows.reduce((a, r) => a + (r.netP || 0), 0);
  const netTotPts = rows.reduce((a, r) => a + (r.netPts || 0), 0);
  wrap.appendChild(ledgerTextRow(loc("LOC_EMIG_LG_TOTAL", "Total"),
    signedCount(netTot, netTotPts, mode), ledgerTotalCounts(rows, mode), "emig-led-tot"));
  body.appendChild(wrap);
}
