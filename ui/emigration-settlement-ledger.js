// emigration-settlement-ledger.js
//
// The prosperity ledger of a settlement card (emigration-settlement-card.js): the score both flows read off, listed
// the way the game tallies a leader's opinion, a line per term with its sub-lines opening on a click.

import { loc } from "/emigration/ui/emigration-loc.js";

/** @typedef {import("/emigration/ui/emigration-settlement-model.js").SettlementModel} SettlementModel */

/** @param {string} tag @param {string} [cls] @param {string} [text] @returns {HTMLElement} */
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/** @param {number} n @returns {string} A signed score with one decimal: "+1.8", "−0.4". */
function signed(n) {
  const v = Math.round(n * 10) / 10;
  return (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(1);
}

/**
 * The prosperity ledger, a thin fifth card standing between the arrivals' side and the departures' side: the score
 * both flows read off (people arrive when it beats the neighbours', leave when it falls short), listed the way the
 * game tallies what another leader thinks of you (the owner, 2026-10-26: "the ledger version of this is more
 * readable... a thinner 5th card that sits vertically in between"). A line per term, biggest first, what holds
 * people in green and what pushes them out in red, the total under a rule. Rows that would print as 0.0 are left
 * out. Before the first pass the frame stays, with a dash and the waiting words.
 * @param {SettlementModel|null} m @returns {HTMLElement}
 */
export function prosperityLedger(m) {
  const box = el("div", "emig-sc-half ledger");
  const title = el("div", "emig-sc-ht emig-sc-ledger-t", loc("LOC_EMIG_SC_TALLY_TOTAL", "Prosperity score"));
  title.title = loc("LOC_EMIG_SC_LEDGER_TITLE_TIP", "Click a line for what is behind it; click here to open or close them all.");
  box.appendChild(title);
  const t = prosperityLedgerFor(m);
  if (!m) {
    box.appendChild(el("div", "emig-sc-dim", loc("LOC_EMIG_SC_NO_MODEL", "Scores appear after this turn's migration pass.")));
    box.appendChild(ledgerTotal(null));
    return box;
  }
  if (!t.rows.length) box.appendChild(el("div", "emig-sc-dim", loc("LOC_EMIG_SC_TALLY_NONE", "Nothing weighs on this settlement yet.")));
  const toggles = ledgerRows(box, t.rows);
  box.appendChild(ledgerTotal(t.total));
  let allOpen = false;
  title.addEventListener("click", () => {
    allOpen = !allOpen;
    for (const set of toggles) set(allOpen);
  });
  return box;
}

/**
 * The rows, each with the lines its accordion opens to (the owner, 2026-10-26: "a dropdown if you click on the
 * main heading, like a hidden accordion"); hidden until the row is clicked, the chevron turning.
 * @param {HTMLElement} box @param {import("/emigration/ui/emigration-explain.js").LedgerRow[]} rows
 * @returns {((open:boolean)=>void)[]} One setter per row that has lines, for the title's open-all.
 */
function ledgerRows(box, rows) {
  /** @type {((open:boolean)=>void)[]} */
  const setters = [];
  for (const r of rows) {
    const line = el("div", "emig-sc-trow" + (r.sub.length ? " has" : ""));
    // The game's own small gold plus/minus (fxs-minus-plus, the owner, 2026-10-26) opens the lines; a row without
    // lines keeps the slot empty so the labels line up.
    const slot = el("span", "emig-sc-tslot");
    const btn = r.sub.length ? plusMinus() : null;
    if (btn) slot.appendChild(btn);
    line.appendChild(slot);
    line.appendChild(el("span", "emig-sc-tlbl", r.label));
    line.appendChild(el("span", "emig-sc-tval " + (r.delta >= 0 ? "in" : "out"), signed(r.delta)));
    box.appendChild(line);
    if (btn) setters.push(wireRow(line, btn, subLines(r.sub), box));
  }
  return setters;
}

/**
 * Hangs a row's lines under it, closed, and wires the button and the row to open and close them.
 * @param {HTMLElement} line @param {HTMLElement} btn @param {HTMLElement} sub @param {HTMLElement} box
 * @returns {(open:boolean)=>void}
 */
function wireRow(line, btn, sub, box) {
  sub.style.display = "none";
  box.appendChild(sub);
  const set = (/** @type {boolean} */ open) => {
    sub.style.display = open ? "flex" : "none";
    line.classList.toggle("open", open);
    btn.setAttribute("data-type", open ? "minus" : "plus");
  };
  const flip = () => set(sub.style.display === "none");
  btn.addEventListener("action-activate", flip);
  line.addEventListener("click", flip);
  return set;
}

/** @returns {HTMLElement} The game's small plus/minus button, showing the plus. */
function plusMinus() {
  const b = document.createElement("fxs-minus-plus");
  b.className = "emig-sc-tpm";
  b.setAttribute("data-type", "plus");
  b.setAttribute("tabindex", "-1");
  return b;
}

/**
 * @param {import("/emigration/ui/emigration-explain.js").LedgerLine[]} lines
 * @returns {HTMLElement} The indented lines: a label, a dim note in parentheses when there is one, the points.
 */
function subLines(lines) {
  const sub = el("div", "emig-sc-tsub");
  for (const l of lines) {
    const line = el("div", "emig-sc-tsub-row");
    const lbl = el("span", "emig-sc-tlbl");
    lbl.appendChild(el("span", "", l.label));
    if (l.note) lbl.appendChild(el("span", "emig-sc-tnote", "(" + l.note + ")"));
    line.appendChild(lbl);
    if (typeof l.delta === "number") line.appendChild(el("span", "emig-sc-tval " + (l.delta >= 0 ? "in" : "out"), signed(l.delta)));
    sub.appendChild(line);
  }
  return sub;
}

/** @param {number|null} total @returns {HTMLElement} The ledger's last line: "Total" and the sum, or a dash. */
function ledgerTotal(total) {
  const sum = el("div", "emig-sc-trow total");
  sum.appendChild(el("span", "emig-sc-tlbl", loc("LOC_EMIG_SC_TALLY_SUM", "Total")));
  sum.appendChild(el("span", "emig-sc-tval " + (total == null || total >= 0 ? "in" : "out"), total == null ? "\u2014" : signed(total)));
  return sum;
}

/**
 * The ledger's rows and their total: the model's ledger (emigration-explain.js `explainLedger`), or, from an older
 * model without one, its score terms with no lines under them.
 * @param {SettlementModel|null} m
 * @returns {{total:number, rows:import("/emigration/ui/emigration-explain.js").LedgerRow[]}}
 */
export function prosperityLedgerFor(m) {
  if (!m) return { total: 0, rows: [] };
  /** @type {import("/emigration/ui/emigration-explain.js").LedgerRow[]} */
  const rows = Array.isArray(m.ledger) ? m.ledger
    : m.score.filter((r) => Math.abs(r.delta) >= 0.05)
      .map((r) => ({ key: r.key, label: r.label, delta: r.delta, kind: r.delta > 0 ? "pull" : "push", sub: [] }));
  return { total: rows.reduce((n, r) => n + r.delta, 0), rows };
}
