// emigration-views.js
//
// The shared RENDER CORE for the migration dashboards (the in-game-legibility plan, Phases 3-4):
// the standalone Emigration screen (emigration-screen.js) and the Demographics "Migration" page
// (emigration-migration-page.js) both mount these same widgets, so the content is built once here.
//
//   • Pure view-model builders (civ ledger, per-cause breakdown, border stances, the per-city
//     pressure table, the cross-civ flow network, and the top-level `dashboardModel`) , DOM-free,
//     unit-tested.
//   • `renderDashboard(target, model)` , a themed, card-per-section DOM renderer. The headline
//     "Migration network" card is delegated to emigration-network-viz.js (an animated spark graph).

import { formatPeople } from "/emigration/ui/emigration-population.js";
import { causeLabel, netDrivers } from "/emigration/ui/emigration-causes.js";
import { renderNetworkOrFlow } from "/emigration/ui/emigration-flow-tab.js";
import { getNumberMode, setNumberMode, NumberMode } from "/emigration/ui/emigration-settings.js";
import { appendSnapshotReminder } from "/emigration/ui/emigration-snapshot-reminder.js";
import { renderGuide } from "/emigration/ui/emigration-guide.js";
import { renderCityFlows, buildCivFlows } from "/emigration/ui/emigration-city-flows.js";
import { renderStances } from "/emigration/ui/emigration-detail-views.js";
import { renderLedger } from "/emigration/ui/emigration-ledger-view.js";
import { renderNotifications } from "/emigration/ui/emigration-notifications-view.js";


/**
 * Per-civ ledger rows (gross in/out, net, refugees, deaths), formatted as people.
 * @param {*[]} civs Per-civ tallies: {name, in, out, net, refugees, deaths}.
 * @returns {*[]} Formatted ledger rows.
 */
export function civLedgerRows(civs) {
  const n = (/** @type {*} */ v) => v || 0;
  return (civs || []).slice()
    .sort((a, b) => n(b.net) - n(a.net)) // biggest net gainers first
    .map((c) => {
      const si = c.stanceImpact || {};
      return {
        name: c.name,
        inP: n(c.in), outP: n(c.out), netP: n(c.net), refP: n(c.refugees), lossP: n(c.deaths),
        inPts: n(c.inPts), outPts: n(c.outPts), netPts: n(c.netPts),
        refPts: n(c.refugeesPts), lossPts: n(c.deathsPts),
        // The signed per-cause net (arrivals − departures), the "why" behind this civ's net.
        drivers: netDrivers(c.byCause, c.inByCause),
        // Border-stance impact on immigration IN (signed people/points; proportion vs neutral).
        stInP: n(si.in), stInPts: n(si.inPts), stOutP: n(si.out), stOutPts: n(si.outPts)
      };
    });
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
const STANCE_LABEL = { pro: "Pro-Immigration", anti: "Anti-Immigration", none: "Neutral" };
/** @type {Record<string, number>} */
const STANCE_ORDER = { pro: 0, anti: 1, none: 2 };

/**
 * Border-stance rows for every civ , its immigration policy: Pro-Immigration (open/attracting),
 * Anti-Immigration (closed), or Neutral (no border policy). Pro/anti are listed first. Each row
 * also carries the stance-impact figures (in/out effect) for the Borders breakdown.
 * @param {*[]} civs Civs ({name, stance?, in?, stanceImpact?}).
 * @returns {*[]} Rows.
 */
export function stanceRows(civs) {
  const n = (/** @type {*} */ v) => v || 0;
  return (civs || [])
    .map((c) => {
      const key = c.stance === "pro" || c.stance === "anti" ? c.stance : "none";
      const si = c.stanceImpact || {};
      return {
        name: c.name, stance: STANCE_LABEL[key], key,
        in: n(c.in), inImpact: n(si.in), outImpact: n(si.out)
      };
    })
    .sort((a, b) => STANCE_ORDER[a.key] - STANCE_ORDER[b.key]);
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

const MAX_CITY_EDGES = 80; // cap on city→city edges kept for the flow drill-down

/**
 * Merge city-level flow entries into one edge per civ pair (summing people/points/byCause), so the
 * civ-level views (dot network + headline) see clean civ→civ edges regardless of how many cities a
 * corridor split across. Falls back gracefully when entries carry no city.
 * @param {*[]} src Positive-people flow entries.
 * @returns {*[]} Civ-pair edges {from,to,fromName,toName,people,points,byCause}.
 */
function aggregateCivEdges(src) {
  /** @type {Map<string, *>} */
  const map = new Map();
  for (const e of src) {
    const k = e.from + ">" + e.to;
    let a = map.get(k);
    if (!a) {
      a = { from: e.from, to: e.to, fromName: e.fromName, toName: e.toName,
        people: 0, points: 0, byCause: {} };
      map.set(k, a);
    }
    a.people += e.people || 0;
    a.points += e.points || 0;
    const bc = e.byCause || {};
    for (const c of Object.keys(bc)) a.byCause[c] = (a.byCause[c] || 0) + (bc[c] || 0);
  }
  return [...map.values()];
}

/**
 * Build the cross-civ migration flow network: civ nodes (sized by total throughput, with net
 * gain/loss), the strongest civ→civ edges (capped, for the dot network + headline), and the raw
 * city→city edges (for the flow tab's drill-down). Pure (DOM-free).
 * @param {*[]} flows Flow edges ({from,to,fromName,toName,fromCity?,toCity?,people,byCause?}).
 * @param {number} [maxEdges] Cap on civ edges kept (default 16).
 * @returns {{nodes:*[], edges:*[], cityEdges:*[], maxEdge:number, maxNode:number}} Network model.
 */
export function flowNetwork(flows, maxEdges = 16) {
  const src = (flows || []).filter((e) => e && e.people > 0);
  /** @type {Map<number, *>} */
  const nodes = new Map();
  const touch = (/** @type {number} */ id, /** @type {string} */ name) => {
    let n = nodes.get(id);
    if (!n) {
      n = { id, name, inflow: 0, outflow: 0, total: 0, net: 0 };
      nodes.set(id, n);
    }
    return n;
  };
  for (const e of src) {
    touch(e.from, e.fromName).outflow += e.people;
    touch(e.to, e.toName).inflow += e.people;
  }
  for (const n of nodes.values()) {
    n.total = n.inflow + n.outflow;
    n.net = n.inflow - n.outflow;
  }
  const edges = aggregateCivEdges(src).sort((a, b) => b.people - a.people).slice(0, maxEdges);
  const cityEdges = src.filter((e) => e.fromCity || e.toCity)
    .sort((a, b) => b.people - a.people).slice(0, MAX_CITY_EDGES);
  const nodeList = [...nodes.values()].sort((a, b) => b.total - a.total);
  const maxEdge = edges.reduce((m, e) => Math.max(m, e.people), 0) || 1;
  const maxNode = nodeList.reduce((m, n) => Math.max(m, n.total), 0) || 1;
  return { nodes: nodeList, edges, cityEdges, maxEdge, maxNode };
}

/**
 * A civ-id → name map gathered from the ledger rows and the flow edges.
 * @param {*[]} civs Ledger civ rows ({pid, name}).
 * @param {*[]} flows Named flow edges.
 * @returns {Map<number, string>} id → name.
 */
function civNameMap(civs, flows) {
  /** @type {Map<number, string>} */
  const m = new Map();
  for (const c of civs || []) if (c && typeof c.pid === "number") m.set(c.pid, c.name);
  for (const e of flows || []) {
    if (!m.has(e.from)) m.set(e.from, e.fromName);
    if (!m.has(e.to)) m.set(e.to, e.toName);
  }
  return m;
}

/**
 * The native (home-grown) population total of a per-civ pop entry. Supports the city-grouped shape
 * ({cities:[{pop}]}) and a bare number (legacy).
 * @param {*} entry Pop entry.
 * @returns {number} People.
 */
export function nativeTotal(entry) {
  if (entry && Array.isArray(entry.cities)) {
    let sum = 0;
    for (const c of entry.cities) sum += c.pop || 0;
    return sum;
  }
  return typeof entry === "number" ? entry : 0;
}

/**
 * Add a zero-flow node for every civ that has native population but no migration edges, so its
 * resident dots still get a cluster in the viz.
 * @param {*} network Network model (mutated).
 * @param {Record<number, *>} pops Per-civ native population.
 * @param {Map<number, string>} names id → name.
 */
function augmentNodesWithPops(network, pops, names) {
  const have = new Set(network.nodes.map((/** @type {*} */ n) => n.id));
  for (const k of Object.keys(pops || {})) {
    const id = +k;
    if (nativeTotal(pops[id]) > 0 && !have.has(id)) {
      const name = names.get(id) || "#" + id;
      network.nodes.push({ id, name, inflow: 0, outflow: 0, total: 0, net: 0 });
      have.add(id);
    }
  }
}

/**
 * Build the timeline frames (each: turn, age, flow network augmented with resident-only civs, and
 * native populations), falling back to a single current frame when there's no history.
 * @param {*} d Gathered data.
 * @param {Map<number,string>} names id → name.
 * @param {*} current The current flow network.
 * @returns {*[]} Frames (oldest → newest).
 */
function buildFrames(d, names, current) {
  const frames = (d.history || []).map((/** @type {*} */ h) => {
    const network = flowNetwork(h.flows);
    augmentNodesWithPops(network, h.pops || {}, names);
    return {
      turn: h.turn, age: h.age, year: h.year || "",
      network, pops: h.pops || {}, intra: h.intra || []
    };
  });
  if (!frames.length) {
    augmentNodesWithPops(current, d.pops || {}, names);
    frames.push({
      turn: null, age: null, year: "", network: current, pops: d.pops || {}, intra: d.intra || []
    });
  }
  return frames;
}

/**
 * The full dashboard view-model: the headline migration network plus the shared detail sections.
 * @param {*} input Gathered data ({civs?, byCause?, flows?, pops?, history?, cities?, sample?}).
 * @returns {{sections:*[], sample:boolean}} The model.
 */
export function dashboardModel(input) {
  const d = input || {};
  const names = civNameMap(d.civs, d.flows);
  const current = flowNetwork(d.flows || []);
  const frames = buildFrames(d, names, current);
  const events = d.events || [];
  return {
    sample: !!d.sample,
    sections: [
      { title: "Migration network", kind: "flow", network: current, frames, events },
      { title: "Net Migration (Table)", kind: "ledger", rows: civLedgerRows(d.civs || []) },
      { title: "Why people move", kind: "pies", cities: buildCivFlows(d.flows || [], d.civs || [], d.eventsByOwner) },
      { title: "Settlements", kind: "cityflows", cities: d.myCities || [] },
      { title: "Immigration policies", kind: "stances", rows: stanceRows(d.civs || []) },
      { title: "Migration notifications", kind: "notifications" },
      { title: "Guide", kind: "guide" }
    ]
  };
}

// ── Themed DOM renderer ─────────────────────────────────────────────────────
// The detail cards style themselves via an injected stylesheet so they look right in any host
// (the standalone screen OR the Demographics page). The network card is delegated to
// emigration-network-viz.js, which owns its own (animated) styles.

const DASH_CSS =
  ".emig-dash{display:flex;flex-direction:column;gap:0.85rem;" +
  'font-family:"BodyFont","BodyFont-JP","BodyFont-KR","BodyFont-SC","BodyFont-TC";' +
  "color:#e5d2ac;font-size:0.95rem;}" +
  ".emig-card{background:linear-gradient(180deg,rgba(20,24,34,0.55),rgba(8,10,16,0.55));border:0.0555rem solid rgba(201,162,76,0.35);border-radius:0.35rem;padding:0.6rem 0.8rem;}" +
  ".emig-card-h{font-family:\"TitleFont\";text-transform:uppercase;letter-spacing:0.06rem;font-size:0.95rem;color:#f3c34c;margin-bottom:0.45rem;border-bottom:0.0555rem solid rgba(201,162,76,0.3);padding-bottom:0.25rem;}" +
  ".emig-empty{opacity:0.5;font-style:italic;}" +
  // Per-city pressure: flexbox rows (GameFace lays out neither <table> nor grid).
  ".emig-pr{display:flex;flex-direction:column;width:100%;}" +
  ".emig-pr-row{display:flex;align-items:center;width:100%;}" +
  ".emig-pr-c{flex:1 1 0;padding:0.55rem 0.6rem;font-size:1.1rem;text-align:left;overflow:hidden;white-space:nowrap;border-top:0.0277rem solid rgba(229,210,172,0.12);}" +
  ".emig-pr-c.name{flex:1.5 1 0;color:#f0dca8;font-weight:bold;}" +
  ".emig-pr-c.pres{flex:2 1 0;}" +
  ".emig-pr-head .emig-pr-c{border-top:none;opacity:0.6;text-transform:uppercase;letter-spacing:0.03rem;font-size:0.92rem;}" +
  // Civilizations ledger: flexbox rows (GameFace lays out neither <table> nor CSS grid). Every row
  // uses the same per-column flex ratios, so the columns line up; full width with no dead gap.
  ".emig-led{display:flex;flex-direction:column;width:100%;}" +
  ".emig-led-row{display:flex;align-items:center;width:100%;}" +
  ".emig-led-c{flex:1 1 0;text-align:right;padding:0.62rem 0.6rem;font-size:1.18rem;" +
  "overflow:hidden;white-space:nowrap;border-top:0.0277rem solid rgba(229,210,172,0.12);}" +
  ".emig-led-c.name{flex:2.4 1 0;text-align:left;color:#f0dca8;font-weight:bold;}" +
  ".emig-led-c.net{flex:1 1 0;}" +
  ".emig-led-c.net-bar{flex:1.7 1 0;}" +
  ".emig-led-c.stance{flex:1.8 1 0;}" +
  ".emig-led-head .emig-led-c{border-top:none;opacity:0.6;text-transform:uppercase;letter-spacing:0.03rem;font-size:0.95rem;}" +
  ".emig-led-net{display:flex;align-items:center;justify-content:flex-end;gap:0.4rem;}" +
  ".emig-led-bar{height:0.7rem;border-radius:0.35rem;flex:0 0 auto;min-width:0.16rem;}" +
  // The divider sits on the ROW (one continuous full-width line) rather than each cell: the row is
  // align-items:center, so the empty net-bar cell is shorter than the text cells and a per-cell
  // border-top would land at a different height there, breaking the line at the graph column.
  ".emig-led-tot{border-top:0.0833rem solid rgba(201,162,76,0.45);}" +
  ".emig-led-tot .emig-led-c{border-top:none;font-weight:bold;}" +
  // Causes pies.
  // Cap the legend to the pie's width so it WRAPS under the pie instead of widening the (content-sized)
  // column — otherwise a card with long "civ count (pct%)" labels makes its column wider and pushes the
  // pies out of alignment with the other cards (and squeezes the cause bars unevenly).
  ".emig-pie-leg{display:flex;flex-wrap:wrap;gap:0.25rem 0.9rem;justify-content:center;" +
  "max-width:14rem;margin:0.1rem 0 0.7rem;}" +
  ".emig-pie-leg-i{display:flex;align-items:center;gap:0.3rem;font-size:0.78rem;color:#cbb994;" +
  "max-width:100%;}" +
  ".emig-pie-sw{width:0.62rem;height:0.62rem;border-radius:50%;display:inline-block;}" +
  ".emig-pie-row{display:flex;flex-wrap:wrap;justify-content:center;gap:2rem;margin-bottom:1.2rem;}" +
  ".emig-pie-grid{display:flex;flex-wrap:wrap;justify-content:center;}" +
  ".emig-pie{position:relative;display:flex;flex-direction:column;align-items:center;" +
  "box-sizing:border-box;padding:0.4rem 0.4rem 1rem;}" +
  // Pies pack and wrap (as many per row as fit), filling the width without forcing 3-up gaps.
  ".emig-pie-grid > .emig-pie{flex:0 0 auto;}" +
  // GameFace doesn't derive a canvas's height from width:100%+height:auto (it collapses to 0), so
  // the pie canvas needs an EXPLICIT square size.
  ".emig-pie-c{width:13.5rem;height:13.5rem;display:block;}" +
  ".emig-pie-empty{width:13.5rem;height:13.5rem;border-radius:50%;margin:0 auto;display:flex;" +
  "align-items:center;justify-content:center;border:0.11rem dashed rgba(229,210,172,0.2);}" +
  ".emig-pie-empty-t{font-size:0.85rem;color:#8c8064;opacity:0.85;}" +
  ".emig-pie.big .emig-pie-c{width:17rem;height:17rem;}" +
  ".emig-pie-t{font-size:0.84rem;color:#f0dca8;font-weight:bold;text-align:center;margin-top:0.35rem;}" +
  ".emig-pie-metrics{display:flex;gap:0.7rem;font-size:0.8rem;margin-top:0.2rem;}" +
  ".emig-pie-in{color:#7fd08a;}.emig-pie-out{color:#e08a7f;}" +
  ".emig-pie-tip{position:absolute;pointer-events:none;display:none;z-index:30;" +
  "background:rgba(8,10,16,0.96);border:0.0555rem solid rgba(201,162,76,0.5);border-radius:0.3rem;" +
  "padding:0.2rem 0.45rem;font-size:0.74rem;color:#e5d2ac;white-space:nowrap;" +
  "transform:translate(-50%,-130%);}" +
  // My-cities flow cards.
  ".emig-city-card{padding:0.5rem 0;border-top:0.0555rem solid rgba(201,162,76,0.25);}" +
  ".emig-city-name{font-family:\"TitleFont\";color:#f0dca8;font-size:1rem;margin-bottom:0.4rem;}" +
  ".emig-city-cols{display:flex;flex-wrap:wrap;gap:1.5rem;justify-content:center;}" +
  ".emig-city-col{flex:1 1 16rem;display:flex;flex-direction:column;align-items:center;}" +
  ".emig-city-sub{font-size:0.8rem;text-transform:uppercase;letter-spacing:0.04rem;opacity:0.75;" +
  "color:#cbb994;margin-bottom:0.2rem;}" +
  ".emig-city-why{font-size:0.78rem;opacity:0.8;text-align:center;margin-top:0.2rem;}" +
  // Settlements: the Emigration-pressure column , a labelled bar aligned beside the pies.
  ".emig-pr-track{width:100%;max-width:13rem;height:0.85rem;margin-top:1.2rem;" +
  "background:rgba(229,210,172,0.14);border-radius:0.4rem;overflow:hidden;}" +
  ".emig-pr-fill{height:100%;border-radius:0.4rem;}" +
  ".emig-pr-value{font-size:1.05rem;font-weight:bold;margin-top:0.35rem;}" +
  // Causes tab: centred civ title with fading flank lines (section-title embellishment).
  ".emig-civ-head{display:flex;align-items:center;justify-content:center;gap:0.7rem;" +
  "margin:0.2rem 0 0.5rem;}" +
  ".emig-civ-head-name{flex:0 0 auto;font-family:\"TitleFont\";text-transform:uppercase;" +
  "letter-spacing:0.08rem;color:#f3c34c;font-size:1.05rem;}" +
  ".emig-civ-head-line{flex:1 1 auto;height:0.0833rem;" +
  "background:linear-gradient(90deg,transparent,rgba(201,162,76,0.55));}" +
  ".emig-civ-head-line:last-child{background:linear-gradient(90deg,rgba(201,162,76,0.55),transparent);}" +
  // Causes tab: cause list fills the reclaimed left space, pies sit tightened on the right.
  ".emig-city-cols.with-causes{flex-wrap:nowrap;gap:1rem;justify-content:flex-start;" +
  "align-items:flex-start;}" +
  ".emig-city-cols.with-causes .emig-cause-list{flex:1 1 auto;}" +
  ".emig-city-cols.with-causes .emig-city-col{flex:0 0 auto;}" +
  ".emig-cause-list{display:flex;flex-direction:column;gap:0.35rem;min-width:13rem;padding-top:1.2rem;}" +
  ".emig-cause-list-h{font-size:0.8rem;text-transform:uppercase;letter-spacing:0.04rem;opacity:0.75;" +
  "color:#cbb994;margin-bottom:0.2rem;}" +
  ".emig-cause-row{display:flex;align-items:center;gap:0.4rem;font-size:0.95rem;}" +
  ".emig-cause-sw{flex:0 0 auto;width:0.7rem;height:0.7rem;border-radius:0.15rem;display:inline-block;}" +
  ".emig-cause-label{flex:0 0 6.5rem;color:#e5d2ac;}" +
  ".emig-cause-bar{flex:1 1 auto;height:0.5rem;background:rgba(229,210,172,0.12);" +
  "border-radius:0.25rem;overflow:hidden;}" +
  ".emig-cause-fill{height:100%;}" +
  ".emig-cause-num{flex:0 0 auto;min-width:3.2rem;text-align:right;opacity:0.85;}" +
  // The specific-event sub-rows under each cause (a particular war/disaster/crisis + its toll).
  ".emig-event-row{display:flex;align-items:baseline;gap:0.4rem;font-size:0.82rem;" +
  "padding-left:1.1rem;opacity:0.78;}" +
  ".emig-event-name{flex:1 1 auto;color:#cbb994;overflow:hidden;text-overflow:ellipsis;" +
  "white-space:nowrap;}" +
  ".emig-event-num{flex:0 0 auto;text-align:right;color:#cbb994;}" +
  ".emig-num-toggle{align-self:flex-end;cursor:pointer;font-size:1rem;color:#e5d2ac;" +
  "padding:0.34rem 1.15rem;border-radius:1rem;border:0.0555rem solid rgba(201,162,76,0.4);" +
  "background:rgba(229,210,172,0.06);margin-bottom:0.3rem;}" +
  ".emig-num-toggle:hover{background:rgba(229,210,172,0.12);color:#f3c34c;}" +
  ".emig-num-bar{display:flex;justify-content:flex-end;width:100%;margin-bottom:0.4rem;}" +
  ".emig-civ{color:#f0dca8;font-weight:bold;}" +
  ".emig-pos{color:#7fd08a;}.emig-neg{color:#e08a7f;}" +
  ".emig-bar-row{display:flex;align-items:center;gap:0.5rem;margin:0.2rem 0;}" +
  ".emig-bar-label{flex:0 0 9rem;}.emig-bar-num{flex:0 0 6rem;text-align:right;opacity:0.85;}" +
  ".emig-bar-track{flex:1 1 auto;height:0.6rem;background:rgba(229,210,172,0.12);" +
  "border-radius:0.3rem;overflow:hidden;}" +
  ".emig-bar-fill{height:100%;background:linear-gradient(90deg,#c9a24c,#f3c34c);}" +
  ".emig-tag{display:inline-block;padding:0.22rem 0.8rem;border-radius:0.8rem;font-size:1.15rem;}" +
  ".emig-tag.pro{background:rgba(127,208,138,0.2);color:#9fe0a8;}" +
  ".emig-tag.anti{background:rgba(224,138,127,0.2);color:#e8a89f;}" +
  ".emig-tag.none{background:rgba(229,210,172,0.12);color:#cbb994;}" +
  ".emig-flag{font-size:0.92rem;opacity:0.7;font-style:italic;margin-left:0.4rem;}" +
  ".emig-stance-block{padding:0.7rem 0.2rem;border-top:0.0277rem solid rgba(229,210,172,0.1);}" +
  ".emig-stance-row{display:flex;justify-content:space-between;align-items:center;font-size:1.4rem;}" +
  ".emig-stance-detail{font-size:1.1rem;opacity:0.82;margin-top:0.3rem;}" +
  ".emig-tabs{display:flex;flex-wrap:wrap;gap:0.3rem;justify-content:center;" +
  "border-bottom:0.0555rem solid rgba(201,162,76,0.3);margin-bottom:0.8rem;}" +
  ".emig-tab{cursor:pointer;padding:0.3rem 0.85rem;font-family:\"TitleFont\";text-transform:uppercase;" +
  "font-size:0.82rem;letter-spacing:0.04rem;color:#bfae86;border-bottom:0.14rem solid transparent;}" +
  ".emig-tab:hover{color:#e5d2ac;}" +
  ".emig-tab.active{color:#f3c34c;border-bottom-color:#f3c34c;}" +
  ".emig-tabbody{overflow-y:auto;overflow-x:hidden;max-height:74vh;}" +
  ".emig-sample-badge{align-self:center;margin-bottom:0.5rem;padding:0.1rem 0.7rem;border-radius:0.9rem;font-size:0.74rem;letter-spacing:0.08rem;text-transform:uppercase;color:#1c1408;background:#e0913c;font-weight:bold;}" +
  ".emig-flow-toggle{display:flex;gap:0.4rem;justify-content:center;margin:0.3rem 0;flex-wrap:wrap;}.emig-flow-tog{cursor:pointer;padding:0.34rem 1.15rem;font-size:1rem;color:#bfae86;border:0.0555rem solid rgba(201,162,76,0.4);border-radius:1rem;}" +
  ".emig-flow-tog:hover{color:#e5d2ac;}.emig-flow-tog.active{color:#1c1408;background:#f3c34c;border-color:#f3c34c;font-weight:bold;}";

/** Inject the dashboard content stylesheet once (idempotent). */
function injectDashboardStyle() {
  try {
    if (document.getElementById("emig-dash-style")) return;
    const st = document.createElement("style");
    st.id = "emig-dash-style";
    st.textContent = DASH_CSS;
    (document.head || document.documentElement).appendChild(st);
  } catch (_) {
    /* ignore */
  }
}

/**
 * Make an element with an optional class + text.
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

// Renderers that consume the whole section model (canvas/pie/card views).
/** @type {Record<string, (body: HTMLElement, section: *) => void>} */
const SECTION_VIEWS = {
  flow: renderNetworkOrFlow,
  pies: renderCityFlows, cityflows: renderCityFlows,
  notifications: (/** @type {HTMLElement} */ body) => renderNotifications(body), guide: renderGuide
};
// Renderers that consume `section.rows` (flexbox tables).
/** @type {Record<string, (body: HTMLElement, rows: *[]) => void>} */
const ROW_VIEWS = {
  ledger: renderLedger, stances: renderStances
};

/**
 * Render a section's kind-specific content (no card chrome) into a body element.
 * @param {HTMLElement} body The body element.
 * @param {*} section The section model ({title, kind} + either rows, network, or pie data).
 */
function renderSectionBody(body, section) {
  const sv = SECTION_VIEWS[section.kind];
  if (sv) {
    sv(body, section);
    return;
  }
  if (!section.rows || !section.rows.length) {
    body.appendChild(el("div", "emig-empty", "Nothing to show yet."));
    return;
  }
  const rv = ROW_VIEWS[section.kind];
  if (rv) rv(body, section.rows);
}

/** Short tab labels by section kind. */
/** @type {Record<string,string>} */
const TAB_LABELS = {
  flow: "Network", ledger: "Net Migration (Table)", pies: "Causes",
  stances: "Immigration Policies",
  cityflows: "Settlements", notifications: "Notifications", guide: "Guide"
};

/**
 * The tab label for a section.
 * @param {*} s Section.
 * @returns {string} Label.
 */
function tabLabelFor(s) {
  return TAB_LABELS[s.kind] || s.title;
}

/**
 * A DOM tab-bar fallback (when the base-UI fxs-tab-bar VM isn't present).
 * @param {{id:string,label:string}[]} items Tab items.
 * @param {(i:number)=>void} onSelect Selection handler.
 * @returns {HTMLElement} The tab bar.
 */
function domTabBar(items, onSelect) {
  const root = el("div", "emig-tabs");
  /** @type {HTMLElement[]} */
  const btns = [];
  items.forEach((it, i) => {
    const b = el("div", "emig-tab" + (i === 0 ? " active" : ""), it.label);
    b.addEventListener("click", () => {
      btns.forEach((x, j) => x.classList.toggle("active", j === i));
      onSelect(i);
    });
    root.appendChild(b);
    btns.push(b);
  });
  return root;
}

/**
 * Build the section tab bar. Prefers the base-UI `fxs-tab-bar` (matching the Demographics screen)
 * when the game UI VM is present; otherwise a styled DOM fallback.
 * @param {*[]} sections Sections.
 * @param {(i:number)=>void} onSelect Selection handler.
 * @returns {HTMLElement} The tab bar.
 */
function makeTabBar(sections, onSelect) {
  const items = sections.map((s, i) => ({ id: String(i), label: tabLabelFor(s) }));
  if (typeof Controls === "undefined") return domTabBar(items, onSelect);
  const bar = /** @type {*} */ (document.createElement("fxs-tab-bar"));
  bar.classList.add("font-title", "text-sm");
  bar.setAttribute("tab-items", JSON.stringify(items));
  bar.setAttribute("selected-tab-index", "0");
  bar.setAttribute("tab-item-class", "font-title");
  bar.addEventListener("tab-selected", (/** @type {*} */ ev) => {
    const id = ev && ev.detail && ev.detail.selectedItem && ev.detail.selectedItem.id;
    if (id != null) onSelect(parseInt(id, 10));
  });
  return bar;
}

// Number-mode toggle: a two-way switch between Civ Pop (pop-points) and Scaled Pop (people).
const NUM_CYCLE = [NumberMode.CIV, NumberMode.HISTORICAL];
/** @type {Record<number,string>} */
const NUM_LABEL = {
  [NumberMode.CIV]: "Civ Pop", [NumberMode.HISTORICAL]: "Scaled Pop"
};

/**
 * A small chip that toggles the number mode (Civ Pop ↔ Scaled Pop) and persists it.
 * @param {()=>void} onChange Called after the mode changes (to re-render).
 * @returns {HTMLElement} The chip.
 */
function numbersToggle(onChange) {
  const chip = el("div", "emig-num-toggle");
  const refresh = () => {
    chip.textContent = "Numbers: " + (NUM_LABEL[getNumberMode()] || "Scaled Pop");
  };
  refresh();
  chip.addEventListener("click", () => {
    const i = NUM_CYCLE.indexOf(/** @type {*} */ (getNumberMode()));
    setNumberMode(NUM_CYCLE[(i + 1) % NUM_CYCLE.length]);
    refresh();
    onChange();
  });
  return chip;
}

/**
 * Render the dashboard as a TABBED view (one section at a time): the headline network gets its own
 * full space, with the detail sections behind base-UI tabs. The network canvas only exists while
 * its tab is active, so its animation loop runs only then.
 * @param {HTMLElement} target The container element.
 * @param {*} model The view-model ({sections, sample}).
 */
export function renderDashboardTabbed(target, model) {
  try {
    if (!target) return;
    injectDashboardStyle();
    target.innerHTML = "";
    const sections = (model && model.sections) || [];
    if (!sections.length) return;
    const wrap = el("div", "emig-dash");
    if (model && model.sample) {
      wrap.appendChild(el("div", "emig-sample-badge", "Sample data ; preview (switch to Live in Options)"));
    }
    appendSnapshotReminder(wrap);
    const body = el("div", "emig-tabbody");
    let active = 0;
    const show = (/** @type {number} */ i) => {
      active = i;
      body.innerHTML = "";
      renderSectionBody(body, sections[i]);
    };
    // Numbers toggle (Civ pop-points / scaled people) , re-renders the active tab.
    wrap.appendChild(numbersToggle(() => {
      const k = sections[active] && sections[active].kind;
      if (k && k !== "flowmap") show(active);
    }));
    wrap.appendChild(makeTabBar(sections, show));
    wrap.appendChild(body);
    target.appendChild(wrap);
    show(0);
  } catch (_) {
    /* a render failure must never break the host screen */
  }
}

/**
 * Whether to show the in-panel "Numbers:" units chip for a section: not for "flow" (it has its own
 * inline Units toggle), and not when the host group pills already control units (`opts.hideUnitsToggle`).
 * @param {*} section The active section.
 * @param {{hideUnitsToggle?:boolean}} [opts] Render options.
 * @returns {boolean} True to show the chip.
 */
function wantsUnitsToggle(section, opts) {
  if (section.kind === "flow") return false;
  return !(opts && opts.hideUnitsToggle);
}

/**
 * Render ONE dashboard section (chosen externally) plus the persistent chrome (sample badge,
 * timeline-detail reminder, number-mode toggle) into `target`. Used by the Demographics-embedded
 * Migration page: there the section tabs come from the Demographics sub-tab row, not the in-panel
 * tab bar, so the embedded page shows the SAME content as the standalone window but presented as
 * native Demographics sub-tabs (no redundant "Overview" tab / second tab row).
 * @param {HTMLElement} target The container element.
 * @param {*} model The view-model ({sections, sample}).
 * @param {string} kind The section kind to show (network/flowmap/ledger/pies/cityflows/stances).
 * @param {{hideUnitsToggle?:boolean}} [opts] When `hideUnitsToggle`, suppress the in-panel "Numbers:"
 *   chip — used when the host's Scaled / Civ group pills already control the units (the Net Migration
 *   Table embedded in the Demographics "Data" group).
 */
export function renderDashboardSubtab(target, model, kind, opts) {
  try {
    if (!target) return;
    injectDashboardStyle();
    target.innerHTML = "";
    const sections = (model && model.sections) || [];
    const section = sections.find((/** @type {*} */ s) => s.kind === kind) || sections[0];
    if (!section) return;
    const wrap = el("div", "emig-dash");
    if (model && model.sample) wrap.appendChild(el("div", "emig-sample-badge", "Sample data ; preview (switch to Live in Options)"));
    // The timeline-detail note is rendered by the Demographics page beside its "Analytics policy"
    // banner (see EmigrationTimelineNote), so it's NOT added at the top here in the embedded page.
    const body = el("div", "emig-tabbody");
    // Skip the in-panel "Numbers:" chip when the section owns its own toggle (flow) or the host group
    // pills already drive units (hideUnitsToggle); see wantsUnitsToggle.
    if (wantsUnitsToggle(section, opts)) {
      wrap.appendChild(numbersToggle(() => {
        body.innerHTML = "";
        renderSectionBody(body, section);
      }));
    }
    wrap.appendChild(body);
    renderSectionBody(body, section);
    target.appendChild(wrap);
  } catch (_) {
    /* a render failure must never break the host screen */
  }
}
