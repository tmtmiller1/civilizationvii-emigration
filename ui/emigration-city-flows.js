// emigration-city-flows.js
//
// The per-entry "came from / left for" breakdown shared by the Settlements tab (a card per local
// settlement, with kind + pressure) and the Causes tab (a card per civ, with a cause-by-count list).
// Each direction is a pie (by the other civ) + a one-line cause summary.

import { pieCardSlices, legendChips } from "/emigration/ui/emigration-pies.js";
import { displacedRow, displacedRowEmpty, displacedIntro, displacedAfter, actionButton }
  from "/emigration/ui/emigration-displaced-view.js";
import { quarterDecisionFor } from "/emigration/ui/emigration-quarter-decision.js";
import { settlementCard } from "/emigration/ui/emigration-settlement-card.js";
import { setCityClosed } from "/emigration/ui/emigration-state.js";
import { CONFIG } from "/emigration/ui/emigration-config.js";
import { mixTable, mixWords } from "/emigration/ui/emigration-detail-views.js";
import { liveSettlementModels } from "/emigration/ui/emigration-settlement-model.js";
export { SETTLEMENT_CSS } from "/emigration/ui/emigration-settlement-card.js";
/** The mix table's frame under a civilization's card, concatenated into the dashboard stylesheet. */
export const MIX_CSS =
  ".emig-mix-box{margin:-0.2rem 0 1rem;padding:0.3rem 0.8rem 0.5rem;}" +
  ".emig-mix-box .emig-sc-bl{margin-bottom:0.3rem;}" +
  "";
import { civColorByIndex, CAUSE_PALETTE } from "/emigration/ui/emigration-network-paint.js";
import { causeLabel } from "/emigration/ui/emigration-causes.js";
import { formatPeople } from "/emigration/ui/emigration-population.js";
import { eventDisplayName } from "/emigration/ui/emigration-naming.js";
import { eventGroupCause } from "/emigration/ui/emigration-event-attribution.js";
import { getNumberMode, NumberMode } from "/emigration/ui/emigration-settings.js";
import { loc } from "/emigration/ui/emigration-loc.js";

/** @param {string} tag @param {string} [cls] @param {string} [text] */
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/**
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
 * Pie slices for a direction's civ breakdown (colored by the other civ; "Died" dark red, "Unmet"
 * gray). The slice share (`value`) is always the raw pop-points base so a slice's % does not shift
 * with the Scaled/Civ Pop toggle; only `countText` follows it. Points fall back to people.
 * @param {{id:number, name:string, people:number, points:number}[]} civs
 * @returns {{value:number, people:number, points:number, countText:string, color:string,
 *   label:string}[]}
 */
function civSlices(civs) {
  const civMode = getNumberMode() === NumberMode.CIV;
  return (civs || []).map((c) => {
    const people = c.people || 0;
    const points = c.points || 0;
    return {
      value: points > 0 ? points : people, people, points,
      countText: civMode ? String(Math.round(points)) : formatPeople(people),
      label: c.name,
      color: c.id === DIED_ID ? "#9a3b3b" : c.id < 0 ? "#8c8064" : civColorByIndex(c.id)
    };
  });
}

/**
 * @param {string} title
 * @param {string} whyPrefix
 * @param {*} dir { civs, causes } for this direction.
 * @param {boolean} isArrivals True for the Immigrants column (selects the empty-state label).
 * @returns {HTMLElement}
 */
function directionCol(title, whyPrefix, dir, isArrivals) {
  const col = el("div", "emig-city-col");
  col.appendChild(el("div", "emig-city-sub", title));
  const slices = civSlices(dir && dir.civs);
  if (!slices.length) {
    // A matching-size dashed placeholder, so a civ with only one active direction still reads as a
    // complete card (rather than a missing pie).
    const ph = el("div", "emig-pie-empty");
    // Branch on an explicit direction flag, not a substring of the localized title.
    ph.appendChild(el("span", "emig-pie-empty-t",
      isArrivals
        ? loc("LOC_EMIG_CF_NO_ARRIVALS", "No arrivals yet")
        : loc("LOC_EMIG_CF_NO_DEPARTURES", "No departures yet")));
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
  if (why) col.appendChild(el("div", "emig-city-why", loc("LOC_EMIG_CF_WHY_LINE", "{1_Prefix} {2_Why}", whyPrefix, why)));
  return col;
}

/**
 * A settlement's display title: name + (City)/(Town) when the kind is known (civ entries on the
 * Causes tab carry no `town` flag, so they get no suffix).
 * @param {*} c Entry.
 * @returns {string}
 */
function cardTitle(c) {
  if (c.town === true) return loc("LOC_EMIG_CF_TITLE_TOWN", "{1_Name} (Town)", c.name);
  if (c.town === false) return loc("LOC_EMIG_CF_TITLE_CITY", "{1_Name} (City)", c.name);
  return c.name;
}

// Emigration-pressure bands (proximity to shedding population, 0..1): number + a color-coded label
// so you can read at a glance how high a settlement's pressure is.
// Five stages, so the word reads as a stage and not a chance (the owner, 2026-10-26: "it's not a likelihood per
// turn, right?"); the pressure is an accumulator that empties into a departure when it fills.
const PR_BANDS = [
  { min: 0.9, stage: 5, label: loc("LOC_EMIG_CF_BAND_CRITICAL", "Critical"), color: "#c25b54" },
  { min: 0.66, stage: 4, label: loc("LOC_EMIG_CF_BAND_HIGH", "High"), color: "#e0913c" },
  { min: 0.33, stage: 3, label: loc("LOC_EMIG_CF_BAND_MODERATE", "Moderate"), color: "#d8b24a" },
  { min: 0.1, stage: 2, label: loc("LOC_EMIG_CF_BAND_LOW", "Low"), color: "#5fae6b" },
  { min: 0, stage: 1, label: loc("LOC_EMIG_CF_BAND_NEGLIGIBLE", "Negligible"), color: "#7fa88a" }
];

/**
 * @param {number} bar Pressure 0..1.
 * @returns {{min:number, stage:number, label:string, color:string}} The band.
 */
function pressureBand(bar) {
  for (const b of PR_BANDS) {
    if (bar >= b.min) return b;
  }
  return PR_BANDS[PR_BANDS.length - 1];
}

/**
 * The settlement's named reasons to stay, as one comma-separated line: its wonders and civic buildings,
 * resolved from the name tags the built-environment model collected. A tag the engine cannot compose
 * is dropped rather than printed raw.
 * @param {*} tags The LOC name tags, or anything else.
 * @returns {string} The joined list, or "" when there is nothing nameable.
 */
function stayLine(tags) {
  if (!Array.isArray(tags) || !tags.length) return "";
  /** @type {string[]} */
  const names = [];
  for (const tag of tags) {
    if (typeof tag !== "string" || !tag) continue;
    const composed = loc(tag, "");
    if (composed && !composed.startsWith("LOC_")) names.push(composed);
  }
  return names.join(", ");
}

/** @param {HTMLElement} col @param {*} tags */
function appendStayRow(col, tags) {
  const stay = stayLine(tags);
  if (!stay) return;
  col.appendChild(el("div", "emig-city-stay",
    loc("LOC_EMIG_CF_REASONS_TO_STAY", "Reasons to stay: {1_List}", stay)));
}

/**
 * @param {number} pct Percentage 0..100.
 * @param {string} color
 * @returns {HTMLElement}
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
 * The Immigration-pressure column for a settlement: a labeled bar (aligned with the two pie
 * columns) showing the level as a percentage + a High/Low band + where its people would head.
 * @param {*} p Pressure {bar, cause, dest, flag} or null.
 * @returns {HTMLElement}
 */
function pressureCol(p) {
  const col = el("div", "emig-city-col");
  col.appendChild(el("div", "emig-city-sub", loc("LOC_EMIG_CF_PRESSURE", "Emigration pressure")));
  if (!p) {
    col.appendChild(el("div", "emig-empty", loc("LOC_EMIG_CF_NONE_RECORDED", "none recorded")));
    return col;
  }
  const pct = Math.round((p.bar || 0) * 100);
  const band = pressureBand(p.bar || 0);
  col.appendChild(pressureBar(pct, band.color));
  // The separator lives in the code: the game's text loader strips a localized string's edge spaces.
  const flag = p.flag ? " " + loc("LOC_EMIG_CF_FLAG_PAREN", "({1_Flag})", p.flag).trim() : "";
  const val = el("div", "emig-pr-value", pct + "% · " + band.label + flag);
  val.style.color = band.color;
  col.appendChild(val);
  // The per-city driver meter: the weighted breakdown of what is pushing people out, as proportional
  // bars, so "exactly what drives migration" reads at a glance. Falls back to a single line otherwise.
  if (Array.isArray(p.mix) && p.mix.length) col.appendChild(driverMeter(p.mix));
  appendStayRow(col, p.stay);
  const sub = (p.cause || "") + (p.dest ? " → " + p.dest : "");
  if (sub.trim()) col.appendChild(el("div", "emig-city-why", loc("LOC_EMIG_CF_HEADING_TO", "Heading to: {1_Sub}", sub)));
  return col;
}

/**
 * The per-city migration-driver meter: each active cause as a labeled bar whose width is its share of
 * the pressure (e.g. War 60% / Prosperity 40%), so a glance shows what's pushing people out and by how
 * much. Reuses the Causes-tab bar styling.
 * @param {{cause:string, label:string, share:number}[]} mix Weighted causes (shares 0–100, largest first).
 * @returns {HTMLElement}
 */
function driverMeter(mix) {
  const box = el("div", "emig-driver-meter");
  box.appendChild(el("div", "emig-city-sub", loc("LOC_EMIG_CF_WHATS_DRIVING", "What's driving it")));
  for (const m of mix) {
    const color = CAUSE_PALETTE[m.cause] || CAUSE_PALETTE.other;
    const row = el("div", "emig-cause-row");
    const sw = el("span", "emig-cause-sw");
    sw.style.backgroundColor = color;
    row.appendChild(sw);
    row.appendChild(el("span", "emig-cause-label", m.label));
    const track = el("div", "emig-cause-bar");
    const fill = el("div", "emig-cause-fill");
    fill.style.width = Math.max(4, m.share || 0) + "%";
    fill.style.backgroundColor = color;
    track.appendChild(fill);
    row.appendChild(track);
    row.appendChild(el("span", "emig-cause-num", (m.share || 0) + "%"));
    box.appendChild(row);
  }
  return box;
}

/** @param {string} name */
function civHeader(name) {
  const h = el("div", "emig-civ-head");
  h.appendChild(el("span", "emig-civ-head-line"));
  h.appendChild(el("span", "emig-civ-head-name", name));
  h.appendChild(el("span", "emig-civ-head-line"));
  return h;
}

/**
 * @param {Record<string,number>} causes Per-cause people.
 * @returns {{cause:string, label:string, color:string, n:number}[]}
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
 * @param {Record<string, *[]>} by Cause → events (mutated).
 * @param {string} key
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
 * @returns {HTMLElement}
 */
function eventSubRow(ev) {
  const row = el("div", "emig-event-row");
  row.appendChild(el("span", "emig-event-name", loc("LOC_EMIG_CF_EVENT_NAME", "↳ {1_Name}", ev.name)));
  let num = formatPeople(ev.people);
  if (ev.people > 0 && ev.deaths > 0) num += " " + loc("LOC_EMIG_CF_EVENT_BOTH", "· {1_Deaths} died", formatPeople(ev.deaths)).trim();
  else if (ev.deaths > 0) num = loc("LOC_EMIG_CF_EVENT_DIED", "{1_Deaths} died", formatPeople(ev.deaths));
  row.appendChild(el("span", "emig-event-num", num));
  return row;
}

/**
 * @param {{label:string, color:string, n:number}} r
 * @param {number} max Largest count (bar scale).
 * @returns {HTMLElement}
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
 * obvious at a glance. Each cause expands to the specific events behind it (the wars/disasters/
 * crises, with their emigration + deaths), when `events` carries them.
 * @param {Record<string,number>} causes Per-cause people.
 * @param {Record<string, {people:number, deaths:number}>} [events] Per-event {people, deaths}.
 * @returns {HTMLElement}
 */
function causeList(causes, events) {
  const col = el("div", "emig-cause-list");
  col.appendChild(el("div", "emig-cause-list-h", loc("LOC_EMIG_CF_CAUSES_BY_IMPACT", "Causes by impact")));
  const rows = causeRows(causes);
  if (!rows.length) {
    col.appendChild(el("div", "emig-empty", loc("LOC_EMIG_CF_NO_MIGRATION", "no migration yet")));
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
 * One card. Causes tab (civ entries, `causes` present): centered embellished title, a cause-by-count
 * list on the left, the two pies tightened on the right. Settlements tab: name + (City)/(Town), the
 * two pies, then an emigration-pressure line.
 * @param {*} c Entry { name, town?, in, out, pressure?, causes? }.
 * @param {HTMLElement|null} [displaced] The settlement's displaced column, when anyone fled it.
 * @returns {HTMLElement}
 */
function cityCard(c, displaced) {
  const card = el("div", "emig-city-card");
  const isCiv = !!c.causes;
  card.appendChild(isCiv ? civHeader(c.name) : el("div", "emig-city-name", cardTitle(c)));
  const cols = el("div", "emig-city-cols" + (isCiv ? " with-causes" : ""));
  if (isCiv) cols.appendChild(causeList(c.causes, c.events));
  cols.appendChild(directionCol(loc("LOC_EMIG_CF_DIR_IMMIGRANTS", "Immigrants ; came from"),
    loc("LOC_EMIG_CF_WHY_PREFIX", "Why:"), c.in, true));
  cols.appendChild(directionCol(loc("LOC_EMIG_CF_DIR_EMIGRANTS", "Emigrants ; left for/died"),
    loc("LOC_EMIG_CF_WHY_PREFIX", "Why:"), c.out, false));
  // Settlements: the pressure becomes a third aligned graph column beside the two pies, and the settlement's
  // displaced people a fourth when anyone fled it.
  if (!isCiv) cols.appendChild(pressureCol(c.pressure));
  if (displaced) cols.appendChild(displaced);
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
 * @returns {{civs:{id:number,name:string,people:number,points:number}[], causes:Record<string,number>}}
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
 * Per-civilization Causes-tab entries: a card for every in-play civ with migration/death activity.
 * The cause list uses the civ's real per-cause tallies (emigration + immigration); the pies come from
 * the cross-civ flow edges.
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
  // Every civilization keeps a card, flows or none: its settlements list hangs under it (2026-10-26).
  return (civs || [])
    .map((r) => {
      const f = map.get(r.pid) || { in: empty, out: empty };
      const out = flowDir(f.out, names);
      // Deaths are population lost with no destination, show them as a "Died" wedge in the
      // Emigrants ("left for/died") pie, so a civ whose loss was deaths isn't a blank pie.
      if ((r.deaths || 0) > 0) {
        out.civs.push({ id: DIED_ID, name: loc("LOC_EMIG_CF_DIED", "Died"), people: r.deaths, points: r.deathsPts || 0 });
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

// The descriptive heading shown at the top of each tab this renderer serves (the section tab only
// gives the short name; this is the fuller "what this shows" title).
/** @type {Record<string,string>} */
const SECTION_TITLES = {
  pies: loc("LOC_EMIG_CF_SECTION_CAUSES", "Causes: Why people move"),
  cityflows: loc("LOC_EMIG_CF_SECTION_SETTLEMENTS", "Settlements: Migration in and out of your settlements")
};

/**
 * The pieces a settlement's dashboard card (emigration-settlement-card.js) borrows from this file: the title, the
 * bar body of one direction, the pressure band and bar, the stay line and the drivers.
 * @type {import("/emigration/ui/emigration-settlement-card.js").CardDeps}
 */
const CARD_DEPS = { cardTitle, pieBody, dirTotal, pressureBand, pressureBar, actionButton,
  decide: quarterDecisionFor, displacedRowEmpty };

/** @param {*} dir A direction {civs, causes}. @returns {number} Its population points (people when none). */
function dirTotal(dir) {
  return civSlices(dir && dir.civs).reduce((n, s) => n + s.value, 0);
}

/**
 * One direction's chart, titled: the pie (a slice per origin or destination), the legend under it, the causes last;
 * nobody: the dashed placeholder and a word, the same size, so every pane keeps its shape.
 * @param {*} dir @param {boolean} isArrivals @returns {HTMLElement[]}
 */
function pieBody(dir, isArrivals) {
  const slices = civSlices(dir && dir.civs);
  const title = el("div", "emig-sc-bl emig-sc-pie-t", isArrivals
    ? loc("LOC_EMIG_SC_PIE_FROM", "Where they came from")
    : loc("LOC_EMIG_SC_PIE_TO", "Where they went"));
  if (!slices.length) {
    const ph = el("div", "emig-pie-empty");
    ph.appendChild(el("span", "emig-pie-empty-t", isArrivals
      ? loc("LOC_EMIG_CF_NO_ARRIVALS", "No arrivals yet")
      : loc("LOC_EMIG_CF_NO_DEPARTURES", "No departures yet")));
    return [title, ph];
  }
  const total = slices.reduce((a, s) => a + s.value, 0);
  const out = [title, pieCardSlices("", slices, false)];
  out.push(legendChips(slices.map((s) => ({
    label: s.label, color: s.color, countText: s.countText, pct: total > 0 ? Math.round((s.value / total) * 100) : 0
  }))));
  const why = causeText(dir && dir.causes);
  if (why) {
    out.push(el("div", "emig-city-why emig-sc-why",
      loc("LOC_EMIG_CF_WHY_LINE", "{1_Prefix} {2_Why}", loc("LOC_EMIG_CF_WHY_PREFIX", "Why:"), why)));
  }
  return out;
}

/**
 * Render the per-entry breakdown (Causes: a card per civ; Settlements: a card per the local player's
 * settlements), under a descriptive tab title. The Scaled / Civ Pop toggle is supplied by the
 * dashboard wrapper (renderDashboardSubtab), which re-renders this section on change.
 * @param {HTMLElement} body
 * @param {*} section The section ({title, kind, cities}).
 */
export function renderCityFlows(body, section) {
  body.appendChild(el("div", "emig-section-title",
    SECTION_TITLES[section.kind] || section.title || ""));
  const cities = section.cities || [];
  // The Settlements tab (kind cityflows) also carries the player's displaced people, as a column of the card of
  // the settlement they fled; one with people away but no card of its own gets a card for the column.
  const byHome = displacedByHome(section);
  if (!cities.length && !byHome.size) {
    body.appendChild(el("div", "emig-empty",
      loc("LOC_EMIG_CF_EMPTY", "No city migration recorded yet, flows appear as people move in and out of your cities.")));
    return;
  }
  if (section.kind === "cityflows") body.appendChild(displacedIntro(section)); // always there, filled or not
  appendCards(body, section, cities, byHome);
}

/**
 * The cards: one per settlement, with its displaced column when anyone fled it, then one per settlement with
 * people away but no card of its own.
 * @param {HTMLElement} body @param {*} section @param {*[]} cities @param {Map<string, *>} byHome
 */
function appendCards(body, section, cities, byHome) {
  const after = displacedAfter(section);
  const mine = section.kind === "cityflows";
  const models = mine ? (section.models || liveSettlementModels(section.pid)) : new Map();
  const mixRows = Array.isArray(section.diversity) ? section.diversity : [];
  const deps = cardDeps(section, after, mine, mixRows);
  if (!mine) {
    appendCivCards(body, cities, mixRows, section.sort);
    return;
  }
  for (const c of sortedCities(cities, section.sort)) {
    const r = byHome.get(c.name);
    const dp = r ? displacedRow(r, section.pid, after) : null;
    body.appendChild(settlementCard(c, dp, models.get(c.name) || null, deps));
    byHome.delete(c.name);
  }
  for (const r of byHome.values()) body.appendChild(displacedOnlyCard(r, section, after));
}

/**
 * What the cards borrow from this module for one render.
 * @param {*} section @param {()=>void} after @param {boolean} mine The player's own settlements (vs civ cards).
 * @param {*[]} mixRows Every mix row. @returns {*} The card deps.
 */
function cardDeps(section, after, mine, mixRows) {
  const mixByName = new Map(mixRows.filter((/** @type {*} */ r) => r.own).map((/** @type {*} */ r) => [r.city, r]));
  return { ...CARD_DEPS, after, screen: section.screen || null,
    mixOf: (/** @type {string} */ name) => (mixByName.has(name) ? mixWords(mixByName.get(name)) : null),
    // The Settlements tab lists the player's own settlements, so the intake switch is theirs to flip.
    toggleIntake: mine && CONFIG.cityIntakeToggleEnabled ? setCityClosed : undefined };
}

/**
 * The All civilizations view: every civilization's card with its flow pies, and under each the table of its
 * settlements; a civilization with settlements but no card gets a bare one, so none goes missing (the Communities
 * tab listed them all).
 * @param {HTMLElement} body @param {*[]} cards The per-civilization cards. @param {*[]} mixRows Every mix row.
 * @param {string|undefined} sort The chosen sort.
 */
function appendCivCards(body, cards, mixRows, sort) {
  /** @type {Set<string>} */
  const listed = new Set();
  for (const c of sortedCivCards(cards, mixRows, sort)) {
    body.appendChild(cityCard(c, null));
    appendMixList(body, c.name, mixRows, listed, sort);
  }
  for (const name of new Set(mixRows.map((/** @type {*} */ r) => r.ownerName))) {
    if (listed.has(name)) continue;
    const card = el("div", "emig-city-card");
    card.appendChild(civHeader(name));
    body.appendChild(card);
    appendMixList(body, name, mixRows, listed, sort);
  }
}

/** The sort the Settlements tab opens on: the settlements under the most pressure first. */
export const SORT_PRESSURE = "pressure";
/** The other sort: settlements by name. */
export const SORT_NAME = "name";

/**
 * The player's cards in the chosen order (the owner, 2026-10-26: "sort the settlements tab by pressure rating"):
 * by pressure, most first, or by name.
 * @param {*[]} cities @param {string|undefined} sort @returns {*[]}
 */
export function sortedCities(cities, sort) {
  const list = cities.slice();
  if (sort === SORT_NAME) return list.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  // Ties keep the game's own order (a stable sort), so settlements under no pressure read as the game lists them.
  return list.sort((a, b) => ((b.pressure && b.pressure.bar) || 0) - ((a.pressure && a.pressure.bar) || 0));
}

/**
 * Every civilization's cards in the chosen order: by the pressure on their most pressed settlement, most first, or
 * by name.
 * @param {*[]} cards @param {*[]} mixRows @param {string|undefined} sort @returns {*[]}
 */
function sortedCivCards(cards, mixRows, sort) {
  const list = cards.slice();
  if (sort === SORT_NAME) return list.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const peak = (/** @type {string} */ name) => mixRows.filter((/** @type {*} */ r) => r.ownerName === name)
    .reduce((m, /** @type {*} */ r) => Math.max(m, r.pressure || 0), 0);
  return list.sort((a, b) => peak(b.name) - peak(a.name));
}

/**
 * The settlement mix table for one civilization, under its card: each settlement's people by origin, its Mix and
 * Character (the owner, 2026-10-26: the Communities tab's two words, folded into the All civilizations view).
 * @param {HTMLElement} body @param {string} civName @param {*[]} mixRows Every row on the tab.
 * @param {Set<string>} listed The civilizations already given their table. @param {string|undefined} sort
 */
function appendMixList(body, civName, mixRows, listed, sort) {
  listed.add(civName);
  const rows = mixRows.filter((/** @type {*} */ r) => r.ownerName === civName)
    .map((/** @type {*} */ r) => ({ ...r, pressureLabel: pressureBand(r.pressure || 0).label }));
  if (!rows.length) return;
  rows.sort(sort === SORT_NAME
    ? (a, b) => String(a.city).localeCompare(String(b.city))
    : (a, b) => (b.pressure || 0) - (a.pressure || 0));
  const box = el("div", "emig-mix-box");
  box.appendChild(el("div", "emig-sc-bl", loc("LOC_EMIG_CF_CIV_SETTLEMENTS", "Its settlements")));
  box.appendChild(mixTable(rows, mixRows));
  body.appendChild(box);
}

/** @param {*} section @returns {Map<string, *>} The displaced rows by home settlement, Settlements tab only. */
function displacedByHome(section) {
  const rows = section.kind === "cityflows" && Array.isArray(section.displaced) ? section.displaced : [];
  return new Map(rows.map((/** @type {*} */ r) => [r.home, r]));
}

/**
 * A card for a settlement with people away but no movement of its own to chart (a lost settlement, mostly).
 * @param {*} r The displaced row. @param {*} section @param {()=>void} after @returns {HTMLElement}
 */
function displacedOnlyCard(r, section, after) {
  const empty = { civs: [], causes: {} };
  return settlementCard({ name: r.home, in: empty, out: empty, pressure: null },
    displacedRow(r, section.pid, after), null, { ...CARD_DEPS, after, screen: section.screen || null });
}
