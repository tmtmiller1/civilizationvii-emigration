// emigration-window.js
//
// The migration dashboard DATA GATHERER: pulls the world's migration state (per-civ ledger +
// border stances, the world per-cause breakdown, and the local player's per-city pressure
// snapshots) into the shape the render core (emigration-views.js) expects. Both surfaces that show
// the dashboard mount the SAME gathered data:
//   • the standalone Emigration screen (emigration-screen.js), opened from the dock button
//   • the Demographics "Migration" page (emigration-migration-page.js), when that mod is installed
//
// (Historically this module also rendered a console-only HUD overlay; that was replaced by the
// real fxs screen in emigration-screen.js, so only the data gatherer lives here now.)

import { collectCitySignals } from "/emigration/ui/emigration-cities.js";
import { ownerCitySnapshots } from "/emigration/ui/emigration-city-readout-data.js";
import { borderStance } from "/emigration/ui/emigration-borders.js";
import { civAdjective } from "/emigration/ui/emigration-naming.js";
import { getSampleData, getSnapshotInterval } from "/emigration/ui/emigration-settings.js";
import { sampleDashboard } from "/emigration/ui/emigration-demo-data.js";
import { scaleCityPopulation } from "/emigration/ui/emigration-population.js";
import { monoTurn } from "/emigration/ui/emigration-migration-stats.js";
import { civHidden } from "/emigration/ui/emigration-governance.js";

/**
 * The local player id, or null.
 * @returns {number|null} The id.
 */
function localId() {
  try {
    return typeof GameContext !== "undefined" && typeof GameContext.localPlayerID === "number"
      ? GameContext.localPlayerID
      : null;
  } catch (_) {
    return null;
  }
}

/**
 * The player ids currently holding cities (the civs worth listing in the ledger).
 * @returns {number[]} Owner ids.
 */
function inPlayCivs() {
  /** @type {Set<number>} */
  const owners = new Set();
  try {
    for (const s of collectCitySignals()) {
      // Visibility masking (governance policy): the sim may run globally, but the dashboard hides
      // civs the effective policy withholds (unmet, or non-local under own-civ-only).
      if (typeof s.owner === "number" && !civHidden(s.owner)) owners.add(s.owner);
    }
  } catch (_) {
    /* ignore */
  }
  return [...owners];
}

/**
 * One civ's ledger row: cumulative tallies (from EmigrationData) plus its border stance.
 * @param {number} pid Player id.
 * @returns {*} The ledger row {pid, name, in, out, net, refugees, deaths, stance}.
 */
function civRow(pid) {
  const D = /** @type {*} */ (globalThis).EmigrationData || {};
  const read = (/** @type {string} */ fn) => (typeof D[fn] === "function" ? D[fn](pid) || 0 : 0);
  return {
    pid,
    name: civAdjective(pid),
    in: read("grossInCumFor"),
    out: read("grossOutCumFor"),
    net: read("netCumFor"),
    refugees: read("refugeesCumFor"),
    // "Losses" = the mod's own attrition deaths PLUS detected external population loss
    // (starvation / plague / razing / disasters). Each tally also carries an exact pop-point count.
    deaths: read("deathsCumFor") + read("externalLossesCumFor"),
    inPts: read("grossInPtsFor"),
    outPts: read("grossOutPtsFor"),
    netPts: read("netPtsFor"),
    refugeesPts: read("refugeesPtsFor"),
    deathsPts: read("deathsPtsFor") + read("externalLossesPtsFor"),
    byCause: typeof D.emigrationByCauseFor === "function" ? D.emigrationByCauseFor(pid) || {} : {},
    stance: borderStance(pid),
    stanceImpact: typeof D.stanceImpactFor === "function"
      ? D.stanceImpactFor(pid) || { in: 0, out: 0, inPts: 0, outPts: 0 }
      : { in: 0, out: 0, inPts: 0, outPts: 0 }
  };
}

/**
 * Aggregate per-cause EMIGRATION across the given civs (the "why people move" breakdown).
 * @param {number[]} pids Player ids.
 * @returns {Record<string, number>} People per cause.
 */
function aggregateByCause(pids) {
  const D = /** @type {*} */ (globalThis).EmigrationData || {};
  /** @type {Record<string, number>} */
  const agg = {};
  if (typeof D.emigrationByCauseFor !== "function") return agg;
  for (const pid of pids) {
    const bc = D.emigrationByCauseFor(pid) || {};
    for (const c of Object.keys(bc)) agg[c] = (agg[c] || 0) + (bc[c] || 0);
  }
  return agg;
}

/**
 * Resolve a list of raw flow edges to named edges for the viz, carrying the origin/destination
 * CITY (when the tally recorded it) so the flow view can route civ→civ AND city→city.
 * @param {*[]} raw Raw flow edges ({src,dest,srcCity,destCity,people,byCause}).
 * @returns {*[]} Named edges {from,to,fromName,toName,fromCity,toCity,people,byCause}.
 */
function nameEdges(raw) {
  return (raw || []).map((/** @type {*} */ e) => ({
    from: e.src,
    to: e.dest,
    fromName: civAdjective(e.src),
    toName: civAdjective(e.dest),
    fromCity: e.srcCity || "",
    toCity: e.destCity || "",
    people: e.people || 0,
    points: e.points || 0,
    byCause: e.byCause
  }));
}

/**
 * The current cross-civ migration flows (src→dest), each side resolved to its civ adjective.
 * @returns {*[]} Named flow edges.
 */
function gatherFlows() {
  const D = /** @type {*} */ (globalThis).EmigrationData || {};
  if (typeof D.flows !== "function") return [];
  // Drop edges touching a policy-hidden civ so the network/flows viz never reveals one.
  return nameEdges(
    (D.flows() || []).filter((/** @type {*} */ e) => !civHidden(e.src) && !civHidden(e.dest))
  );
}

/**
 * A display name for one city signal (its own name when the engine exposes one, else City/Town +
 * an ordinal so names stay unique within a civ , the viz groups a civ's cities by name).
 * @param {*} s City signal.
 * @param {number} ord Ordinal within the owner.
 * @returns {string} City name.
 */
function cityName(s, ord) {
  const raw = s && s.city && s.city.name;
  if (typeof raw === "string" && raw) return raw;
  return (s && s.isTown ? "Town " : "City ") + ord;
}

/**
 * Group the live city signals by owner into raw {name, town, pop} city lists.
 * @returns {Map<number, {name:string, town:boolean, pop:number}[]>} owner → cities.
 */
function citiesByOwner() {
  /** @type {Map<number, {name:string, town:boolean, pop:number}[]>} */
  const byCiv = new Map();
  try {
    for (const s of collectCitySignals()) {
      if (typeof s.owner !== "number" || civHidden(s.owner)) continue; // mask hidden civs (network)
      let list = byCiv.get(s.owner);
      if (!list) {
        list = [];
        byCiv.set(s.owner, list);
      }
      list.push({ name: cityName(s, list.length + 1), town: !!s.isTown, pop: s.population || 0 });
    }
  } catch (_) {
    /* ignore */
  }
  return byCiv;
}

/**
 * Per-civ population grouped by CITY, split into native (home-grown) residents. Each owner's cities
 * are listed with their population scaled by the civ's native fraction (total − arrivals) / total,
 * so the per-city counts sum to the civ's home-grown population and migrants don't double-count.
 * @returns {Record<number, {cities:{name:string, town:boolean, pop:number}[]}>} civId → cities.
 */
function gatherPops() {
  const D = /** @type {*} */ (globalThis).EmigrationData || {};
  const t = monoTurn();
  /** @type {Record<number, *>} */
  const out = {};
  for (const [id, list] of citiesByOwner()) {
    const civTotal = list.reduce((a, c) => a + c.pop, 0); // raw pop points
    const grossInPts = typeof D.grossInPtsFor === "function" ? D.grossInPtsFor(id) || 0 : 0;
    // Native share in points (total − immigrants); clamped so it never goes negative.
    const frac = civTotal > 0 ? Math.max(0, civTotal - grossInPts) / civTotal : 0;
    const cities = list
      .map((c) => {
        const ptsN = c.pop * frac; // native pop points (excludes immigrants)
        return {
          name: c.name, town: c.town, pts: Math.round(ptsN), pop: scaleCityPopulation(ptsN, t)
        };
      })
      .sort((a, b) => b.pts - a.pts); // capital (largest) first , arrivals land here
    out[id] = { cities };
  }
  return out;
}

/**
 * Scale a civ's city populations by `frac` (for approximating an earlier point in the timeline).
 * @param {*} entry {cities:[{name, town, pop, pts}]}.
 * @param {number} frac Scale factor.
 * @returns {*} Scaled entry.
 */
function scalePops(entry, frac) {
  const cities = ((entry && entry.cities) || []).map((/** @type {*} */ c) => ({
    name: c.name, town: c.town, pop: (c.pop || 0) * frac, pts: Math.round((c.pts || 0) * frac)
  }));
  return { cities };
}

/**
 * The decimated cumulative-flow history as named-edge frames, for the timeline scrubber. Per-city
 * native population isn't snapshotted historically, so it's approximated by scaling the current
 * populations linearly over the timeline (so circles still grow as you scrub).
 * @param {Record<number, *>} nativeNow Current per-civ city populations.
 * @returns {{turn:number, age:string, flows:*[], pops:Record<number,*>}[]} Frames (old→new).
 */
function gatherHistory(nativeNow) {
  const D = /** @type {*} */ (globalThis).EmigrationData || {};
  if (typeof D.flowHistory !== "function") return [];
  /** @type {*[]} */
  const raw = D.flowHistory() || [];
  const n = raw.length;
  return raw.map((/** @type {*} */ f, /** @type {number} */ i) => {
    const frac = n > 1 ? (i + 1) / n : 1;
    /** @type {Record<number, *>} */
    const pops = {};
    for (const k of Object.keys(nativeNow)) pops[+k] = scalePops(nativeNow[+k], frac);
    // Mask hidden civs from historical flow frames too (the timeline scrubber).
    const edges = (f.edges || []).filter(
      (/** @type {*} */ e) => !civHidden(e.src) && !civHidden(e.dest)
    );
    return { turn: f.turn, age: f.age, year: f.year || "", flows: nameEdges(edges), pops };
  });
}

/**
 * Get (or create) a per-city flow accumulator.
 * @param {Map<string, *>} map City name → entry.
 * @param {string} city City name.
 * @returns {*} The entry {name, in, out}.
 */
function cityEntry(map, city) {
  let e = map.get(city);
  if (!e) {
    e = { name: city, in: { civs: {}, causes: {} }, out: { civs: {}, causes: {} } };
    map.set(city, e);
  }
  return e;
}

/**
 * Add one move to a direction accumulator (by other civ + cause).
 * @param {*} d Direction {civs, causes}.
 * @param {number} otherOwner The other civ id.
 * @param {string} cause Migration cause.
 * @param {number} people People moved.
 */
function addDir(d, otherOwner, cause, people) {
  d.civs[otherOwner] = (d.civs[otherOwner] || 0) + people;
  d.causes[cause] = (d.causes[cause] || 0) + people;
}

/**
 * Fold one recent move into the local player's per-city flows (immigration into a dest city,
 * emigration out of a source city).
 * @param {Map<string, *>} map City name → entry.
 * @param {*} m The move record.
 * @param {number} me Local player id.
 */
function foldMove(map, m, me) {
  const ppl = m.people || 0;
  if (m.destOwner === me && m.destName) {
    addDir(cityEntry(map, m.destName).in, m.srcOwner, m.cause, ppl);
  }
  if (m.srcOwner === me && m.srcName) {
    addDir(cityEntry(map, m.srcName).out, m.destOwner, m.cause, ppl);
  }
}

/**
 * Resolve a direction's civ map to a sorted, named list.
 * @param {*} d Direction accumulator {civs, causes}.
 * @returns {*} { civs: [{id, name, people}] sorted, causes }.
 */
function resolveDir(d) {
  const civs = Object.keys(d.civs)
    .map((k) => ({ id: +k, name: civAdjective(+k), people: d.civs[k] }))
    .sort((a, b) => b.people - a.people);
  return { civs, causes: d.causes };
}

/**
 * The local player's emigration-pressure per settlement, keyed by name.
 * @param {number|null} me Local player id.
 * @returns {Record<string,*>} City name → {bar, cause, dest, flag}.
 */
function pressureMap(me) {
  /** @type {Record<string,*>} */
  const map = {};
  for (const s of me != null ? ownerCitySnapshots(me) : []) {
    map[s.cityName] = {
      bar: s.pressureToBar || 0, cause: s.causeLabel || "", dest: s.topDestinationName || "",
      flag: s.attritionRisk ? "at risk" : s.onCooldown ? "resting" : ""
    };
  }
  return map;
}

/**
 * The local player's settlements (cities AND towns) , each with its recent immigration / emigration
 * by origin/destination + cause and its emigration pressure. Driven by the full settlement list (so
 * every settlement shows, not only those with recent moves). (Lifetime per-city flow isn't
 * persisted; the flows are recent activity.)
 * @param {number|null} me Local player id.
 * @param {Record<number, *>} pops Per-civ native populations (carries each settlement's town flag).
 * @returns {*[]} Per-settlement rows {name, town, in, out, pressure}.
 */
function gatherSettlements(me, pops) {
  if (me == null) return [];
  const D = /** @type {*} */ (globalThis).EmigrationData || {};
  /** @type {Map<string, *>} */
  const moves = new Map();
  if (typeof D.recentEventsFor === "function") {
    for (const m of D.recentEventsFor(me, 50) || []) foldMove(moves, m, me);
  }
  const pr = pressureMap(me);
  const empty = { civs: [], causes: {} };
  return ((pops[me] && pops[me].cities) || []).map((/** @type {*} */ c) => {
    const e = moves.get(c.name);
    return {
      name: c.name, town: !!c.town,
      in: e ? resolveDir(e.in) : empty, out: e ? resolveDir(e.out) : empty,
      pressure: pr[c.name] || null
    };
  });
}

/**
 * Build the dashboard inputs from scratch: per-civ ledger + stances, the world per-cause breakdown,
 * the cross-civ flow network, the local player's per-city pressure snapshots, and per-city flows.
 * @returns {*} Gathered inputs.
 */
function gatherFresh() {
  if (getSampleData()) return sampleDashboard(getSnapshotInterval());
  const pids = inPlayCivs();
  const me = localId();
  const pops = gatherPops();
  return {
    civs: pids.map(civRow),
    byCause: aggregateByCause(pids),
    flows: gatherFlows(),
    pops,
    intra: [], // intra-civ (city→city) moves aren't tracked live yet; sample data supplies them
    history: gatherHistory(pops),
    events: [], // live disaster/war event labels are a future pull; sample data supplies them
    cities: me != null ? ownerCitySnapshots(me) : [],
    myCities: gatherSettlements(me, pops)
  };
}

/** @type {{key:string, data:*}|null} Open-session gather memo (Perf plan P1 #4). */
let _gatherMemo = null;

/**
 * Whether player `pid` is an alive MAJOR civ the local player has met (self counts as met). Safe:
 * unreadable players / a throwing hasMet just don't count, so one bad id never aborts the scan.
 * @param {number} pid Player id.
 * @param {number} me Local player id.
 * @param {((id:number)=>*)|null} hasMet The local player's met-test, or null when unavailable.
 * @returns {boolean} True when met and an alive major.
 */
function countsAsMet(pid, me, hasMet) {
  let p;
  try {
    p = Players.get(pid);
  } catch (_) {
    return false;
  }
  if (!p || p.isAlive !== true || p.isMajor !== true) return false;
  if (pid === me) return true;
  if (!hasMet) return false;
  try {
    return !!hasMet(pid);
  } catch (_) {
    return false;
  }
}

/**
 * The number of major civs the local player has met (self included). Cheap: a player scan with a
 * diplomacy check, no city enumeration. Folded into the live memo key because meeting a civ is a
 * diplomacy event, NOT an emigration pass — so monoTurn() alone wouldn't refresh the dashboard when
 * you meet someone new, and a just-met civ would stay invisible until the next pass. Counting met
 * civs makes meeting one invalidate the memo immediately.
 * @returns {number} Count of met alive major civs (local included).
 */
function metMajorCount() {
  let n = 0;
  try {
    const me = GameContext.localPlayerID;
    const d = Players.get(me)?.Diplomacy;
    const hasMet = d && typeof d.hasMet === "function" ? (/** @type {number} */ id) => d.hasMet(id) : null;
    for (let pid = 0; pid < 64; pid++) if (countsAsMet(pid, me, hasMet)) n++;
  } catch (_) {
    /* ignore */
  }
  return n;
}

/**
 * Cheap, obvious invalidation key for the gathered data. The live tallies change when an emigration
 * pass advances the monotonic turn, AND the set of VISIBLE civs changes when the local player meets
 * someone new (a diplomacy event between passes) — so the key folds in the met-civ count too, so a
 * newly met civ shows on the "live" dashboard without waiting for the next pass.
 * @returns {string} The memo key.
 */
function gatherKey() {
  if (getSampleData()) return "sample:" + getSnapshotInterval();
  return "live:" + monoTurn() + ":m" + metMajorCount();
}

/**
 * Gather the dashboard inputs, memoized per turn (Perf plan P1 #4): the standalone screen and the
 * embedded Demographics Migration page both call this, and an embedded re-render within the same
 * turn should not re-scan the world. The memo is module-level so reopening within a turn reuses it;
 * it invalidates when a pass advances the turn (or the sample/detail setting changes).
 * @returns {*} Gathered inputs.
 */
export function gatherDashboard() {
  const key = gatherKey();
  if (_gatherMemo && _gatherMemo.key === key) return _gatherMemo.data;
  const data = gatherFresh();
  _gatherMemo = { key, data };
  return data;
}
