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
import { eventDisplayName } from "/emigration/ui/emigration-naming.js";
import { eventGroupCause } from "/emigration/ui/emigration-event-attribution.js";
import { getNumberMode, setNumberMode, NumberMode } from "/emigration/ui/emigration-settings.js";

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

// Synthetic slice id for the "Died" wedge (population lost to death, no destination) in the Emigrants
// pie. Other negative ids are the anonymous "Unmet" bucket (a civ the policy hides).
const DIED_ID = -3;

/**
 * Pie slices for a direction's civ breakdown (coloured by the other civ; "Died" dark red, "Unmet"
 * grey). The slice value + count follow the active number mode (Scaled Pop people / Civ Pop points),
 * and each slice carries a preformatted count string for the legend and tooltip.
 * @param {{id:number, name:string, people:number, points:number}[]} civs Civs.
 * @returns {{value:number, people:number, points:number, countText:string, color:string,
 *   label:string}[]} Slices.
 */
function civSlices(civs) {
  const civMode = getNumberMode() === NumberMode.CIV;
  return (civs || []).map((c) => {
    const people = c.people || 0;
    const points = c.points || 0;
    return {
      value: civMode ? points : people, people, points,
      countText: civMode ? String(Math.round(points)) : formatPeople(people),
      label: c.name,
      color: c.id === DIED_ID ? "#9a3b3b" : c.id < 0 ? "#8c8064" : civColorByIndex(c.id)
    };
  });
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
    // A matching-size dashed placeholder, so a civ with only one active direction still reads as a
    // complete card (rather than a missing pie).
    const ph = el("div", "emig-pie-empty");
    ph.appendChild(el("span", "emig-pie-empty-t",
      title.indexOf("Immigrants") === 0 ? "No arrivals yet" : "No departures yet"));
    col.appendChild(ph);
    return col;
  }
  col.appendChild(pieCardSlices("", slices, false));
  const total = slices.reduce((a, s) => a + s.value, 0);
  col.appendChild(legendChips(slices.map((s) => ({
    label: s.label, color: s.color, countText: s.countText,
    pct: total > 0 ? Math.round((s.value / total) * 100) : 0
  }))));
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
 * @returns {{cause:string, label:string, color:string, n:number}[]} Rows.
 */
function causeRows(causes) {
  return Object.keys(causes || {})
    .map((c) => ({
      cause: c, label: causeLabel(c), color: CAUSE_PALETTE[c] || CAUSE_PALETTE.other, n: causes[c] || 0
    }))
    .filter((r) => r.n > 0)
    .sort((a, b) => b.n - a.n);
}

/**
 * Group a civ's per-event tallies under their parent cause, named and sorted by impact, for the
 * cause-list drill-down. Events with no parent cause (or zero impact) are dropped.
 * @param {Record<string, {people:number, deaths:number}>} events Per-event {people, deaths}.
 * @returns {Record<string, {name:string, people:number, deaths:number}[]>} Events by cause.
 */
function groupEventsByCause(events) {
  /** @type {Record<string, *[]>} */
  const by = {};
  for (const k of Object.keys(events || {})) pushEvent(by, k, events[k] || {});
  for (const c of Object.keys(by)) by[c].sort((a, b) => b.people + b.deaths - (a.people + a.deaths));
  return by;
}

/**
 * Push one event into its parent cause bucket (dropping unattributed / zero-impact events).
 * @param {Record<string, *[]>} by Cause → events (mutated).
 * @param {string} key The event key.
 * @param {{people?:number, deaths?:number}} v The event's tallies.
 */
function pushEvent(by, key, v) {
  const cause = eventGroupCause(key);
  const people = v.people || 0;
  const deaths = v.deaths || 0;
  if (!cause || people + deaths <= 0) return;
  (by[cause] = by[cause] || []).push({ name: eventDisplayName(key) || key, people, deaths });
}

/**
 * One specific-event sub-row under a cause: "↳ Roman–Greek War  1.9k · 0.3k died".
 * @param {{name:string, people:number, deaths:number}} ev The event.
 * @returns {HTMLElement} The row.
 */
function eventSubRow(ev) {
  const row = el("div", "emig-event-row");
  row.appendChild(el("span", "emig-event-name", "↳ " + ev.name));
  let num = formatPeople(ev.people);
  if (ev.people > 0 && ev.deaths > 0) num += " · " + formatPeople(ev.deaths) + " died";
  else if (ev.deaths > 0) num = formatPeople(ev.deaths) + " died";
  row.appendChild(el("span", "emig-event-num", num));
  return row;
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
 * obvious at a glance. Each cause expands to the SPECIFIC events behind it (the wars/disasters/
 * crises, with their emigration + deaths), when `events` carries them.
 * @param {Record<string,number>} causes Per-cause people.
 * @param {Record<string, {people:number, deaths:number}>} [events] Per-event {people, deaths}.
 * @returns {HTMLElement} The list column.
 */
function causeList(causes, events) {
  const col = el("div", "emig-cause-list");
  col.appendChild(el("div", "emig-cause-list-h", "Causes by impact"));
  const rows = causeRows(causes);
  if (!rows.length) {
    col.appendChild(el("div", "emig-empty", "no migration yet"));
    return col;
  }
  const max = rows[0].n;
  const byCause = groupEventsByCause(events || {});
  for (const r of rows) {
    col.appendChild(causeRow(r, max));
    for (const ev of byCause[r.cause] || []) col.appendChild(eventSubRow(ev));
  }
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
  if (isCiv) cols.appendChild(causeList(c.causes, c.events));
  cols.appendChild(directionCol("Immigrants ; came from", "Why:", c.in));
  cols.appendChild(directionCol("Emigrants ; left for/died", "Why:", c.out));
  // Settlements: the pressure becomes a third aligned graph column beside the two pies.
  if (!isCiv) cols.appendChild(pressureCol(c.pressure));
  card.appendChild(cols);
  return card;
}

/**
 * Index the cross-civ flow edges into per-civ "came from" / "left for" civ tallies (for the pies),
 * plus a civ id → name map.
 * @param {*[]} flows Named flow edges ({from,to,fromName,toName,people,byCause}).
 * @returns {{names:Map<number,string>, map:Map<number,*>}} Names + per-civ {in,out} flow tallies.
 */
function indexFlowsByCiv(flows) {
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
    const c = d.civs[other] || (d.civs[other] = { people: 0, points: 0 });
    c.people += e.people || 0;
    c.points += e.points || 0;
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
  return { names, map };
}

/**
 * One direction's pie payload: the other civs sorted by people (each carrying people + points),
 * plus this direction's flow causes.
 * @param {*} d A {civs, causes} flow tally.
 * @param {Map<number,string>} names Civ id → name.
 * @returns {{civs:{id:number,name:string,people:number,points:number}[], causes:Record<string,number>}} Payload.
 */
function flowDir(d, names) {
  return {
    civs: Object.keys(d.civs).map((k) => ({
      id: +k, name: names.get(+k) || ("#" + k), people: d.civs[k].people, points: d.civs[k].points
    })).sort((a, b) => b.people - a.people),
    causes: d.causes
  };
}

/**
 * Merge a civ's emigration-by-cause and immigration-by-cause into one per-cause people map.
 * @param {Record<string,number>} a Emigration by cause. @param {Record<string,number>} b Immigration.
 * @returns {Record<string,number>} Merged people per cause.
 */
function mergeCauses(a, b) {
  const out = Object.assign({}, a || {});
  for (const k of Object.keys(b || {})) out[k] = (out[k] || 0) + (b[k] || 0);
  return out;
}

/**
 * Per-civilization Causes-tab entries: a card for EVERY in-play civ that has migration/death activity
 * (not just cross-civ flow endpoints, so a civ at war you've met still appears). The cause list uses
 * the civ's real per-cause tallies (emigration + immigration, so RECEIVED refugees are attributed);
 * the pies come from the cross-civ flow edges (empty when a direction has no cross-civ flow).
 * @param {*[]} flows Named flow edges.
 * @param {*[]} civs Per-civ ledger rows ({pid, name, in, out, deaths, byCause, inByCause}).
 * @param {Record<number, Record<string, {people:number, deaths:number}>>} [eventsByOwner] Per-civ
 *   specific events behind its causes, for the drill-down.
 * @returns {*[]} Entries [{name, in, out, causes, events}], busiest first.
 */
export function buildCivFlows(flows, civs, eventsByOwner) {
  const { names, map } = indexFlowsByCiv(flows);
  const events = eventsByOwner || {};
  const empty = { civs: {}, causes: {} };
  return (civs || [])
    .filter((r) => (r.in || 0) + (r.out || 0) + (r.deaths || 0) > 0)
    .map((r) => {
      const f = map.get(r.pid) || { in: empty, out: empty };
      const out = flowDir(f.out, names);
      // Deaths are population LOST with no destination — show them as a "Died" wedge in the
      // Emigrants ("left for/died") pie, so a civ whose loss was deaths isn't a blank pie.
      if ((r.deaths || 0) > 0) {
        out.civs.push({ id: DIED_ID, name: "Died", people: r.deaths, points: r.deathsPts || 0 });
        out.civs.sort((a, b) => b.people - a.people);
      }
      return {
        name: r.name, in: flowDir(f.in, names), out,
        causes: mergeCauses(r.byCause, r.inByCause), events: events[r.pid] || null,
        _total: (r.in || 0) + (r.out || 0) + (r.deaths || 0)
      };
    })
    .sort((a, b) => b._total - a._total);
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
  body.appendChild(numbersBar(() => {
    while (body.firstChild) body.removeChild(body.firstChild);
    renderCityFlows(body, section);
  }));
  for (const c of cities) body.appendChild(cityCard(c));
}

/**
 * A right-aligned Scaled Pop ↔ Civ Pop toggle row for the pie counts. Flips the shared number mode
 * and re-renders the whole tab (so every pie's slices, counts, and percentages switch together).
 * @param {()=>void} onChange Re-render callback.
 * @returns {HTMLElement} The toggle row.
 */
function numbersBar(onChange) {
  const bar = el("div", "emig-num-bar");
  const chip = el("div", "emig-num-toggle",
    "Numbers: " + (getNumberMode() === NumberMode.CIV ? "Civ Pop" : "Scaled Pop"));
  chip.addEventListener("click", () => {
    setNumberMode(getNumberMode() === NumberMode.CIV ? NumberMode.HISTORICAL : NumberMode.CIV);
    onChange();
  });
  bar.appendChild(chip);
  return bar;
}
