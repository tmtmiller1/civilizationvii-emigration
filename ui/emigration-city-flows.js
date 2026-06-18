// emigration-city-flows.js
//
// The per-entry "came from / left for" breakdown shared by two tabs: SETTLEMENTS (a card per the
// local player's settlements, with city/town kind + pressure) and CAUSES (a card per civ,
// with a centred title, a sorted cause-by-count list on the left, and the two pies tightened on the
// right). Each direction is a pie (by the other civ) + a one-line cause summary. Styling lives in
// the dashboard's injected stylesheet.

import { pieCardSlices, legendChips } from "/emigration/ui/emigration-pies.js";
import { civColorByIndex, CAUSE_PALETTE } from "/emigration/ui/emigration-network-paint.js";
import { causeLabel } from "/emigration/ui/emigration-causes.js";
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
 * A one-line "why" summary from a per-cause map: the top causes by share.
 * @param {Record<string,number>} causes Per-cause people.
 * @returns {string} e.g. "War 60%, Prosperity 30%".
 */
function causeText(causes) {
  const entries = Object.keys(causes || {})
    .map((c) => ({ c, n: causes[c] || 0 }))
    .filter((e) => e.n > 0)
    .sort((a, b) => b.n - a.n);
  const total = entries.reduce((a, e) => a + e.n, 0);
  if (!total) return "";
  return entries.slice(0, 3).map((e) => causeLabel(e.c) + " " + Math.round((e.n / total) * 100) + "%").join(", ");
}

/**
 * Pie slices for a direction's civ breakdown (coloured by the other civ).
 * @param {{id:number, name:string, people:number}[]} civs Civs.
 * @returns {{value:number, color:string, label:string}[]} Slices.
 */
function civSlices(civs) {
  return (civs || []).map((c) => ({
    value: c.people, color: civColorByIndex(c.id), label: c.name
  }));
}

/**
 * One direction column (Immigrants / Emigrants): subtitle, pie, civ key, and the cause summary.
 * @param {string} title Column heading.
 * @param {string} whyPrefix "Why" label.
 * @param {*} dir { civs, causes } for this direction.
 * @returns {HTMLElement} The column.
 */
function directionCol(title, whyPrefix, dir) {
  const col = el("div", "emig-city-col");
  col.appendChild(el("div", "emig-city-sub", title));
  const slices = civSlices(dir && dir.civs);
  if (!slices.length) {
    col.appendChild(el("div", "emig-empty", "none recorded"));
    return col;
  }
  col.appendChild(pieCardSlices("", slices, false));
  col.appendChild(legendChips(slices.map((s) => ({ label: s.label, color: s.color }))));
  const why = causeText(dir && dir.causes);
  if (why) col.appendChild(el("div", "emig-city-why", whyPrefix + " " + why));
  return col;
}

/**
 * A settlement's display title: name + (City)/(Town) when the kind is known (civ entries on the
 * Causes tab carry no `town` flag, so they get no suffix).
 * @param {*} c Entry.
 * @returns {string} Title.
 */
function cardTitle(c) {
  if (c.town === true) return c.name + " (Town)";
  if (c.town === false) return c.name + " (City)";
  return c.name;
}

// Emigration-pressure bands (proximity to shedding population, 0..1): number + a colour-coded label
// so you can read at a glance how high a settlement's pressure is.
const PR_BANDS = [
  { min: 0.9, label: "Critical", color: "#c25b54" },
  { min: 0.66, label: "High", color: "#e0913c" },
  { min: 0.33, label: "Moderate", color: "#d8b24a" },
  { min: 0, label: "Low", color: "#5fae6b" }
];

/**
 * The band (label + colour) for an emigration-pressure level.
 * @param {number} bar Pressure 0..1.
 * @returns {{label:string, color:string}} The band.
 */
function pressureBand(bar) {
  for (const b of PR_BANDS) {
    if (bar >= b.min) return b;
  }
  return PR_BANDS[PR_BANDS.length - 1];
}

/**
 * The pressure bar (track + coloured fill scaled to the level).
 * @param {number} pct Percentage 0..100.
 * @param {string} color Band colour.
 * @returns {HTMLElement} The bar.
 */
function pressureBar(pct, color) {
  const track = el("div", "emig-pr-track");
  const fill = el("div", "emig-pr-fill");
  fill.style.width = Math.max(3, pct) + "%";
  fill.style.background = color;
  track.appendChild(fill);
  return track;
}

/**
 * The Immigration-pressure column for a settlement: a labelled bar (aligned with the two pie
 * columns) showing the level as a percentage + a High/Low band + where its people would head.
 * @param {*} p Pressure {bar, cause, dest, flag} or null.
 * @returns {HTMLElement} The column.
 */
function pressureCol(p) {
  const col = el("div", "emig-city-col");
  col.appendChild(el("div", "emig-city-sub", "Emigration pressure"));
  if (!p) {
    col.appendChild(el("div", "emig-empty", "none recorded"));
    return col;
  }
  const pct = Math.round((p.bar || 0) * 100);
  const band = pressureBand(p.bar || 0);
  col.appendChild(pressureBar(pct, band.color));
  const flag = p.flag ? " (" + p.flag + ")" : "";
  const val = el("div", "emig-pr-value", pct + "% · " + band.label + flag);
  val.style.color = band.color;
  col.appendChild(val);
  const sub = (p.cause || "") + (p.dest ? " → " + p.dest : "");
  if (sub.trim()) col.appendChild(el("div", "emig-city-why", "Heading to: " + sub));
  return col;
}

/**
 * A centred civ title flanked by fading rule lines (the section-title embellishment).
 * @param {string} name Civ name.
 * @returns {HTMLElement} The header.
 */
function civHeader(name) {
  const h = el("div", "emig-civ-head");
  h.appendChild(el("span", "emig-civ-head-line"));
  h.appendChild(el("span", "emig-civ-head-name", name));
  h.appendChild(el("span", "emig-civ-head-line"));
  return h;
}

/**
 * Non-zero cause rows for a per-cause map, sorted by count descending.
 * @param {Record<string,number>} causes Per-cause people.
 * @returns {{label:string, color:string, n:number}[]} Rows.
 */
function causeRows(causes) {
  return Object.keys(causes || {})
    .map((c) => ({
      label: causeLabel(c), color: CAUSE_PALETTE[c] || CAUSE_PALETTE.other, n: causes[c] || 0
    }))
    .filter((r) => r.n > 0)
    .sort((a, b) => b.n - a.n);
}

/**
 * One cause row: swatch + label + proportional bar + count.
 * @param {{label:string, color:string, n:number}} r Cause row.
 * @param {number} max Largest count (bar scale).
 * @returns {HTMLElement} The row.
 */
function causeRow(r, max) {
  const row = el("div", "emig-cause-row");
  const sw = el("span", "emig-cause-sw");
  sw.style.backgroundColor = r.color;
  row.appendChild(sw);
  row.appendChild(el("span", "emig-cause-label", r.label));
  const track = el("div", "emig-cause-bar");
  const fill = el("div", "emig-cause-fill");
  fill.style.width = Math.max(4, (r.n / max) * 100) + "%";
  fill.style.backgroundColor = r.color;
  track.appendChild(fill);
  row.appendChild(track);
  row.appendChild(el("span", "emig-cause-num", formatPeople(r.n)));
  return row;
}

/**
 * The civ's cause-by-count list (left column on the Causes tab), sorted so the dominant driver is
 * obvious at a glance.
 * @param {Record<string,number>} causes Per-cause people.
 * @returns {HTMLElement} The list column.
 */
function causeList(causes) {
  const col = el("div", "emig-cause-list");
  col.appendChild(el("div", "emig-cause-list-h", "Causes by impact"));
  const rows = causeRows(causes);
  if (!rows.length) {
    col.appendChild(el("div", "emig-empty", "no migration yet"));
    return col;
  }
  const max = rows[0].n;
  for (const r of rows) col.appendChild(causeRow(r, max));
  return col;
}

/**
 * One card. CAUSES tab (civ entries, `causes` present): centred embellished title, a cause-by-count
 * list on the left, the two pies tightened on the right. SETTLEMENTS tab: name + (City)/(Town), the
 * two pies, then an emigration-pressure line.
 * @param {*} c Entry { name, town?, in, out, pressure?, causes? }.
 * @returns {HTMLElement} The card.
 */
function cityCard(c) {
  const card = el("div", "emig-city-card");
  const isCiv = !!c.causes;
  card.appendChild(isCiv ? civHeader(c.name) : el("div", "emig-city-name", cardTitle(c)));
  const cols = el("div", "emig-city-cols" + (isCiv ? " with-causes" : ""));
  if (isCiv) cols.appendChild(causeList(c.causes));
  cols.appendChild(directionCol("Immigrants ; came from", "Why:", c.in));
  cols.appendChild(directionCol("Emigrants ; left for", "Why:", c.out));
  // Settlements: the pressure becomes a third aligned graph column beside the two pies.
  if (!isCiv) cols.appendChild(pressureCol(c.pressure));
  card.appendChild(cols);
  return card;
}

/**
 * Per-civilization "Came from" / "Left for" entries (the Causes tab) , the same shape as the
 * Settlements rows but aggregated at the civ level, from the cross-civ flow edges.
 * @param {*[]} flows Named flow edges ({from,to,fromName,toName,people,byCause}).
 * @returns {*[]} Entries [{name, in:{civs,causes}, out:{civs,causes}}], busiest first.
 */
export function buildCivFlows(flows) {
  /** @type {Map<number,string>} */
  const names = new Map();
  /** @type {Map<number,*>} */
  const map = new Map();
  const get = (/** @type {number} */ id) => {
    let e = map.get(id);
    if (!e) {
      e = { in: { civs: {}, causes: {} }, out: { civs: {}, causes: {} } };
      map.set(id, e);
    }
    return e;
  };
  const add = (/** @type {*} */ d, /** @type {number} */ other, /** @type {*} */ e) => {
    d.civs[other] = (d.civs[other] || 0) + e.people;
    const bc = e.byCause || {};
    for (const k of Object.keys(bc)) d.causes[k] = (d.causes[k] || 0) + (bc[k] || 0);
  };
  for (const e of flows || []) {
    if (!(e.people > 0)) continue;
    names.set(e.from, e.fromName);
    names.set(e.to, e.toName);
    add(get(e.to).in, e.from, e);
    add(get(e.from).out, e.to, e);
  }
  const dir = (/** @type {*} */ d) => ({
    civs: Object.keys(d.civs).map((k) => ({ id: +k, name: names.get(+k) || ("#" + k), people: d.civs[k] }))
      .sort((a, b) => b.people - a.people),
    causes: d.causes
  });
  const total = (/** @type {*} */ c) =>
    c.in.civs.reduce((/** @type {number} */ a, /** @type {*} */ x) => a + x.people, 0)
    + c.out.civs.reduce((/** @type {number} */ a, /** @type {*} */ x) => a + x.people, 0);
  // Merge in + out per-cause people for the civ's cause-by-count list (its total migration by
  // cause, so you can see which cause drove the most movement involving the civ).
  const merge = (/** @type {*} */ a, /** @type {*} */ b) => {
    const out = Object.assign({}, a);
    for (const k of Object.keys(b)) out[k] = (out[k] || 0) + b[k];
    return out;
  };
  return [...map.keys()]
    .map((id) => {
      const e = map.get(id);
      return { name: names.get(id) || ("#" + id), in: dir(e.in), out: dir(e.out),
        causes: merge(e.in.causes, e.out.causes) };
    })
    .sort((a, b) => total(b) - total(a));
}

/**
 * Render the per-city breakdown for the local player's cities.
 * @param {HTMLElement} body Card body.
 * @param {*} section The section ({cities}).
 */
export function renderCityFlows(body, section) {
  const cities = section.cities || [];
  if (!cities.length) {
    body.appendChild(el("div", "emig-empty",
      "No city migration recorded yet , flows appear as people move in and out of your cities."));
    return;
  }
  for (const c of cities) body.appendChild(cityCard(c));
}
