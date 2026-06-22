// emigration-demo-data.js
//
// Synthetic SAMPLE migration data for previewing the dashboard before a real game has generated
// cross-civ flows (toggled in Options → Mods → "Dashboard data: Sample"). Built in the exact shape
// gatherDashboard() returns, marked `sample: true`, never written to the persisted tallies.
// Deterministic (no randomness). Models a FULL game (3 ages × 75 turns) of 10 civilizations: each
// starts with a single small capital and founds more cities/towns as the game goes on, its
// population growing the whole time. The migration profile mirrors the real engine: war/disaster
// are SHOCKS (large counts crammed into a few turns around their event, then they stop), prosperity
// is a STEADY trickle that converges on a few magnet civs, and unhappiness is EPISODIC. Flows are
// CONCENTRATED, not spread evenly , refugees flee to one regional neighbour, magnets pull the rest.

const NAMES = ["", "Rome", "Egypt", "Greece", "Persia", "Maurya",
  "Han", "Carthage", "Aksum", "Maya", "Norse"];

// Each civ's cities, indexed by civ id. Entry: [name, finalPop, foundAt, isTown]. `foundAt` is the
// global progress (0..1) when the city is founded (the capital is founded at 0); a city grows from
// a small SEED at its founding to finalPop by the end. So every civ starts as one small city and
// sprouts new ones over the game , the intra-civ structure you see inside each circle.
const CITY_TABLE = [
  [],
  [["Rome", 70000, 0, false], ["Ostia", 26000, 0.25, true], ["Capua", 22000, 0.5, false], ["Mediolanum", 16000, 0.72, true]],
  [["Memphis", 64000, 0, false], ["Thebes", 30000, 0.18, false], ["Alexandria", 26000, 0.55, false], ["Giza", 12000, 0.78, true]],
  [["Athens", 52000, 0, false], ["Sparta", 24000, 0.3, false], ["Corinth", 16000, 0.6, true]],
  [["Persepolis", 66000, 0, false], ["Susa", 30000, 0.22, false], ["Pasargadae", 14000, 0.66, true]],
  [["Pataliputra", 60000, 0, false], ["Taxila", 26000, 0.34, false], ["Ujjain", 15000, 0.62, true]],
  [["Chang'an", 72000, 0, false], ["Luoyang", 34000, 0.2, false], ["Chengdu", 20000, 0.54, false], ["Linzi", 12000, 0.8, true]],
  [["Carthage", 50000, 0, false], ["Utica", 20000, 0.4, true], ["Gadir", 14000, 0.7, true], ["Lixus", 28000, 0.15, false]],
  [["Aksum", 42000, 0, false], ["Adulis", 18000, 0.46, true]],
  [["Tikal", 44000, 0, false], ["Calakmul", 20000, 0.38, false], ["Copan", 12000, 0.7, true]],
  [["Uppsala", 34000, 0, false], ["Hedeby", 16000, 0.5, true], ["Birka", 10000, 0.76, true]]
];
// Cities that change hands mid-game. After `at` (global progress) the city transfers from civ
// `from` to civ `to`, but its residents stay coded to the PRIOR owner — the network colours them in
// `from`'s colour/name, frozen at the population it had when captured; only the growth the city adds
// AFTER the capture counts as the conqueror (`to`). This is what `origins` carries in a live game
// (from the composition ledger); here it's authored so the sample demonstrates the same behaviour.
// Lixus is the Carthaginian (7) city Persia (4) storms at the height of the Punic–Persian War.
const CONQUESTS = [{ name: "Lixus", from: 7, to: 4, at: 0.74 }];
const SEED = 600; // population of a city the moment it is founded (≈ one dot)
// Sample data is authored in scaled "people"; this ratio derives a believable Civ pop-point figure
// from it (a live game uses the engine's exact per-migration points instead).
const SAMPLE_PPP = 3500; // people per pop point, for the preview's "Civ population" numbers

// Migration corridors: [fromId, toId, cause, people, a, b]. `people` is the total who travel this
// corridor over the game; [a,b] is the GLOBAL-PROGRESS window across which they leave (the corridor
// fills via smoothstep, so the cumulative arrives steeply in a NARROW window and gently in a WIDE
// one). This mirrors the real engine (see report): war/disaster are SHOCKS , large counts crammed
// into the short window of their event, then they stop (siege cap / cooldown); prosperity is a
// STEADY trickle over a long span; unhappiness is EPISODIC (a bump while a civ is net-unhappy).
// Destinations are CONCENTRATED, not even: the engine picks the single best target, so prosperity
// flows converge on a few magnets (Rome, Han, Persia) and war/disaster refugees flee to one
// regional neighbour. The shock windows match EVENT_DEFS so the surge coincides with the popup.
// Entry: [fromId, fromCity, toId, toCity, cause, people, a, b]. Cross-civ flows are tracked by the
// ORIGIN and DESTINATION settlement (not just the civ), so the flow view can drill into cities. The
// chosen origin/destination cities exist within the corridor's window (founded earlier).
const CORRIDORS = [
  // War / disaster SHOCKS , big counts in a tight window, aligned to the events below.
  [2, "Thebes", 3, "Athens", "disaster", 20000, 0.08, 0.2], // Nile flood: Egypt → Greece
  [1, "Capua", 4, "Susa", "war", 18000, 0.25, 0.45], // Roman–Greek War: Rome → Persia
  [3, "Sparta", 2, "Memphis", "war", 14000, 0.25, 0.45], // Roman–Greek War: Greece → Egypt
  [8, "Adulis", 7, "Carthage", "disaster", 14000, 0.5, 0.62], // Highland drought: Aksum → Carthage
  [7, "Utica", 9, "Tikal", "war", 13000, 0.7, 0.85], // Punic–Persian War: Carthage → Maya
  [4, "Susa", 5, "Pataliputra", "war", 16000, 0.7, 0.85], // Punic–Persian War: Persia → Maurya
  [3, "Corinth", 4, "Persepolis", "disaster", 9000, 0.3, 0.42], // Aegean quake: Greece → Persia
  [5, "Taxila", 4, "Susa", "war", 8000, 0.72, 0.88], // Maurya–Han War: Maurya → Persia
  [6, "Luoyang", 9, "Calakmul", "war", 9000, 0.72, 0.88], // Maurya–Han War: Han → Maya
  [6, "Chengdu", 5, "Ujjain", "disaster", 18000, 0.88, 0.98], // Yellow River flood: Han → Maurya
  // Prosperity TRICKLES , modest counts over long spans, converging on the magnets.
  [3, "Athens", 1, "Rome", "prosperity", 9000, 0.1, 0.95], // Greece → Rome
  [5, "Pataliputra", 6, "Chang'an", "prosperity", 10000, 0.15, 1.0], // Maurya → Han
  [4, "Persepolis", 1, "Rome", "prosperity", 8000, 0.2, 1.0], // Persia → Rome
  [10, "Uppsala", 1, "Ostia", "prosperity", 7000, 0.35, 1.0], // Norse → Rome
  [9, "Tikal", 6, "Chang'an", "prosperity", 6000, 0.3, 1.0], // Maya → Han
  [2, "Alexandria", 4, "Persepolis", "prosperity", 7000, 0.25, 1.0], // Egypt → Persia
  [8, "Aksum", 6, "Luoyang", "prosperity", 5000, 0.5, 1.0], // Aksum → Han
  // Unhappiness EPISODES , a bump while the source civ is net-unhappy, then it subsides.
  [5, "Taxila", 4, "Susa", "unhappiness", 6000, 0.55, 0.72], // Maurya unrest → Persia
  [10, "Uppsala", 6, "Luoyang", "unhappiness", 4000, 0.3, 0.46] // Norse unrest → Han
];

// Intra-civ moves: [civId, fromCity, toCity, people, a, b] , people who relocate BETWEEN a civ's
// OWN cities (mostly urbanisation toward the capital, or settling a new city). Real-engine
// behaviour: same-civ moves are favoured (no cross-civ poach block, own-civ refugee bonus). Windows
// start after the source city exists. Shown as a lighter tint of the civ's colour.
const INTRA_CORRIDORS = [
  [1, "Capua", "Rome", 7000, 0.5, 1.0],
  [1, "Ostia", "Mediolanum", 4000, 0.72, 1.0],
  [2, "Thebes", "Alexandria", 6000, 0.55, 1.0],
  [3, "Sparta", "Athens", 5000, 0.35, 1.0],
  [4, "Susa", "Persepolis", 6000, 0.3, 1.0],
  [5, "Taxila", "Pataliputra", 5000, 0.4, 1.0],
  [6, "Luoyang", "Chang'an", 8000, 0.25, 1.0],
  [6, "Linzi", "Chengdu", 4000, 0.8, 1.0],
  [7, "Utica", "Carthage", 4000, 0.45, 1.0],
  [9, "Calakmul", "Tikal", 4000, 0.45, 1.0]
];

// A handful of "your cities under pressure" rows for the Cities tab (the local player = Rome).
const CITYDEFS = [
  { cityName: "Ostia", causeLabel: "War", pressureToBar: 0.92, topDestinationName: "Memphis", attritionRisk: false, onCooldown: false },
  { cityName: "Capua", causeLabel: "Unhappiness", pressureToBar: 0.61, topDestinationName: "Athens", attritionRisk: false, onCooldown: false },
  { cityName: "Mediolanum", causeLabel: "Prosperity", pressureToBar: 0.34, topDestinationName: "Susa", attritionRisk: false, onCooldown: true },
  { cityName: "Capua", causeLabel: "Disaster", pressureToBar: 0.18, topDestinationName: "-", attritionRisk: true, onCooldown: false }
];

// Per-settlement flow breakdown for the local player's (Rome's) settlements , who arrived from
// where, who left for where, the cause mix, the city/town kind, and the emigration pressure shown
// directly under each pie pair. Synthetic preview; a live game builds this from the recent feed +
// the settlement list + the pressure snapshots.
/**
 * Fill each sample settlement's per-direction civ entries with a `points` count derived from its
 * people (the preview has no engine to record exact points), so the pies' Civ Pop mode shows sane
 * numbers. A live game carries real per-migration points instead.
 * @param {*[]} cities The sample settlement rows.
 * @returns {*[]} The rows with civ points filled in.
 */
function withCivPoints(cities) {
  const fill = (/** @type {*} */ dir) => ({
    causes: dir.causes,
    civs: (dir.civs || []).map((/** @type {*} */ c) => ({
      ...c, points: typeof c.points === "number" ? c.points : Math.max(1, Math.round(c.people / SAMPLE_PPP))
    }))
  });
  return cities.map((c) => ({ ...c, in: fill(c.in), out: fill(c.out) }));
}

const MY_CITIES = [
  {
    name: "Rome", town: false,
    in: {
      civs: [{ id: 4, name: "Persia", people: 13000 }, { id: 10, name: "Norse", people: 9000 },
        { id: 3, name: "Greece", people: 5000 }],
      causes: { prosperity: 22000, unhappiness: 5000 }
    },
    out: {
      civs: [{ id: 3, name: "Greece", people: 14000 }, { id: 6, name: "Han", people: 6000 }],
      causes: { war: 14000, unhappiness: 6000 }
    },
    pressure: { bar: 0.14, cause: "Prosperity", dest: "Persepolis", flag: "" }
  },
  {
    name: "Ostia", town: true,
    in: {
      civs: [{ id: 2, name: "Egypt", people: 6000 }, { id: 7, name: "Carthage", people: 4000 }],
      causes: { prosperity: 7000, disaster: 3000 }
    },
    out: { civs: [{ id: 4, name: "Persia", people: 5000 }], causes: { war: 5000 } },
    pressure: { bar: 0.92, cause: "War", dest: "Memphis", flag: "at risk" }
  },
  {
    name: "Capua", town: false,
    in: { civs: [{ id: 3, name: "Greece", people: 3000 }], causes: { prosperity: 3000 } },
    out: {
      civs: [{ id: 2, name: "Egypt", people: 8000 }, { id: 6, name: "Han", people: 4000 }],
      causes: { unhappiness: 8000, disaster: 4000 }
    },
    pressure: { bar: 0.61, cause: "Unhappiness", dest: "Athens", flag: "" }
  },
  {
    name: "Mediolanum", town: true,
    in: { civs: [{ id: 10, name: "Norse", people: 4000 }], causes: { prosperity: 4000 } },
    out: { civs: [], causes: {} },
    pressure: { bar: 0.34, cause: "Prosperity", dest: "Susa", flag: "resting" }
  }
];

// Timeline events that drove migration, by GLOBAL-PROGRESS window (0..1) + affected civ ids. The
// progress windows are resolved to frame indices in sampleDashboard, so they land correctly no
// matter how many snapshots the timeline-detail setting produces.
// Some windows deliberately OVERLAP so the network shows multiple concurrent causes at once: the
// Aegean quake (disaster) runs during the Roman–Greek War (war + disaster together), and the
// Maurya–Han War overlaps the Punic–Persian War (two simultaneous wars).
const EVENT_DEFS = [
  { kind: "disaster", civs: [2], label: "Nile flood", from: 0.08, to: 0.2 },
  { kind: "war", civs: [1, 3], label: "Roman–Greek War", from: 0.25, to: 0.45 },
  { kind: "disaster", civs: [3], label: "Aegean quake", from: 0.3, to: 0.42 },
  { kind: "disaster", civs: [8], label: "Highland drought", from: 0.5, to: 0.62 },
  { kind: "war", civs: [7, 4], label: "Punic–Persian War", from: 0.7, to: 0.85 },
  { kind: "war", civs: [5, 6], label: "Maurya–Han War", from: 0.72, to: 0.88 },
  { kind: "disaster", civs: [6], label: "Yellow River flood", from: 0.88, to: 0.98 }
];

const AGES = ["AGE_ANTIQUITY", "AGE_EXPLORATION", "AGE_MODERN"];
const TURNS_PER_AGE = 75;

// Approximate in-game year span per age, for the SAMPLE timeline labels (negative = BC). A LIVE
// game uses the engine's real Game.getTurnDate() instead; these are only so the preview shows
// believable years rather than fabricating a precise calendar.
/** @type {Record<string, [number, number]>} */
const AGE_YEARS = {
  AGE_ANTIQUITY: [-4000, -100],
  AGE_EXPLORATION: [100, 1500],
  AGE_MODERN: [1500, 2020]
};

/**
 * Format a signed year as a date label ("3200 BC" / "1450 AD").
 * @param {number} y Year (negative = BC).
 * @returns {string} The label.
 */
function yearLabel(y) {
  const r = Math.round(y);
  return r < 0 ? -r + " BC" : (r === 0 ? 1 : r) + " AD";
}

/**
 * A believable sample year for an age-local position (frac 0..1 across the age).
 * @param {string} age Age type.
 * @param {number} frac Position within the age (0..1).
 * @returns {string} The date label.
 */
function sampleYear(age, frac) {
  const span = AGE_YEARS[age];
  if (!span) return "";
  return yearLabel(span[0] + (span[1] - span[0]) * Math.max(0, Math.min(1, frac)));
}

/**
 * Smoothstep 0..1.
 * @param {number} t Input 0..1.
 * @returns {number} Eased 0..1.
 */
function smoothstep(t) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

/**
 * Cumulative fraction (0..1) of a corridor realized by global progress `p` over its window [a,b].
 * Narrow windows (war/disaster shocks) fill steeply ; a surge; wide windows (prosperity) fill
 * gently , a trickle.
 * @param {number} p Global progress 0..1.
 * @param {number} a Window start.
 * @param {number} b Window end.
 * @returns {number} Fraction 0..1.
 */
function profileFrac(p, a, b) {
  if (p <= a) return 0;
  if (p >= b) return 1;
  return smoothstep((p - a) / (b - a));
}

/**
 * The cumulative named flow edges at global progress `p` (0 = game start, 1 = end). Each corridor
 * carries a single cause; its count fills along its own window, so shocks spike and trickles creep.
 * @param {number} p Global progress.
 * @returns {*[]} Named flow edges.
 */
function buildFlowsAt(p) {
  /** @type {*[]} */
  const out = [];
  for (const [from, fromCity, to, toCity, cause, people, a, b] of CORRIDORS) {
    const frac = profileFrac(p, /** @type {number} */ (a), /** @type {number} */ (b));
    const ppl = Math.round(/** @type {number} */ (people) * frac);
    if (ppl <= 0) continue;
    out.push({
      from, to, fromName: NAMES[/** @type {number} */ (from)],
      toName: NAMES[/** @type {number} */ (to)], fromCity, toCity, people: ppl,
      points: Math.max(1, Math.round(ppl / SAMPLE_PPP)), byCause: { [cause]: ppl }
    });
  }
  return out;
}

/**
 * The cumulative intra-civ moves at global progress `p` (people who have relocated between a civ's
 * own cities so far).
 * @param {number} p Global progress.
 * @returns {{civId:number, fromCity:string, toCity:string, people:number}[]} Internal moves.
 */
function buildIntraAt(p) {
  /** @type {*[]} */
  const out = [];
  for (const [civId, fromCity, toCity, people, a, b] of INTRA_CORRIDORS) {
    const frac = profileFrac(p, /** @type {number} */ (a), /** @type {number} */ (b));
    const ppl = Math.round(/** @type {number} */ (people) * frac);
    if (ppl > 0) out.push({ civId, fromCity, toCity, people: ppl });
  }
  return out;
}

/**
 * One city's population at global progress `p` , 0 before it's founded, else growing from SEED to
 * its final size since founding.
 * @param {*[]} c City entry [name, finalPop, foundAt, isTown].
 * @param {number} p Global progress 0..1.
 * @returns {number} People.
 */
function cityPopAt(c, p) {
  const foundAt = /** @type {number} */ (c[2]);
  if (p < foundAt) return 0;
  const t = (p - foundAt) / Math.max(1e-6, 1 - foundAt);
  return Math.round(SEED + (/** @type {number} */ (c[1]) - SEED) * smoothstep(t));
}

/**
 * The conquest record for a city by name, or null when it never changes hands.
 * @param {string} name City name.
 * @returns {{name:string, from:number, to:number, at:number}|null} Conquest, or null.
 */
function conquestOf(name) {
  for (const q of CONQUESTS) if (q.name === name) return q;
  return null;
}

/**
 * The civ that OWNS a city at progress `p`: its conqueror once captured, else the table owner.
 * @param {*[]} c City entry [name, finalPop, foundAt, isTown].
 * @param {number} tableOwner The civ that founded it.
 * @param {number} p Global progress.
 * @returns {number} Owner civ id.
 */
function ownerAt(c, tableOwner, p) {
  const q = conquestOf(/** @type {string} */ (c[0]));
  return q && p >= q.at ? q.to : tableOwner;
}

/**
 * A city's resident population split by ORIGIN civ at progress `p`. An unconquered city is 100% its
 * owner; a captured city keeps its prior-owner residents frozen at the size it had when it fell, and
 * the growth since the capture counts as the conqueror — exactly what the live composition ledger
 * produces. The `pts` are origin-share weights (the dot builder normalizes them).
 * @param {*[]} c City entry.
 * @param {number} owner Current owner civ id.
 * @param {number} p Global progress.
 * @returns {{civ:number, pts:number}[]} Origin buckets.
 */
function cityOrigins(c, owner, p) {
  const q = conquestOf(/** @type {string} */ (c[0]));
  if (!q || p < q.at) return [{ civ: owner, pts: cityPopAt(c, p) }];
  const atPop = cityPopAt(c, q.at); // residents present at the moment of capture → prior owner
  const grown = Math.max(0, cityPopAt(c, p) - atPop); // post-capture growth → conqueror
  const out = [{ civ: q.from, pts: atPop }];
  if (grown > 0) out.push({ civ: q.to, pts: grown });
  return out;
}

/**
 * Every civ's cities (with native, home-grown population + origin split) at global progress `p`.
 * Cities that aren't founded yet are omitted, and a captured city moves to its conqueror's list
 * while keeping its prior-owner origins, so a civ visibly grows, founds, and conquers over the game.
 * @param {number} p Global progress 0..1.
 * @returns {Record<number, {cities:{name:string, town:boolean, pop:number,
 *   origins:{civ:number, pts:number}[]}[]}>} civId → cities.
 */
function nativePopsAt(p) {
  /** @type {Record<number, *>} */
  const out = {};
  for (let id = 1; id < CITY_TABLE.length; id++) out[id] = { cities: [] };
  for (let id = 1; id < CITY_TABLE.length; id++) {
    for (const c of CITY_TABLE[id]) {
      const pop = cityPopAt(c, p);
      if (pop <= 0) continue;
      const owner = ownerAt(c, id, p);
      out[owner].cities.push({
        name: /** @type {string} */ (c[0]), town: !!c[3], pop, pts: Math.round(pop / SAMPLE_PPP),
        origins: cityOrigins(c, owner, p)
      });
    }
  }
  return out;
}

/**
 * Finalize a civ row: net, modelled losses (attrition + external, a fraction of war/disaster
 * pressure), and the parallel pop-point figures (derived from people via SAMPLE_PPP).
 * @param {*} r Civ row.
 */
function finalizeCiv(r) {
  const pts = (/** @type {number} */ v) => Math.round(v / SAMPLE_PPP);
  r.net = r.in - r.out;
  r.deaths = Math.round(r.refugees * 0.2);
  r.inPts = pts(r.in);
  r.outPts = pts(r.out);
  r.netPts = r.inPts - r.outPts;
  r.refugeesPts = pts(r.refugees);
  r.deathsPts = pts(r.deaths);
}

/**
 * Derive per-civ ledger rows from the flow list (internally consistent in/out/net + refugees).
 * @param {*[]} flows Named flows.
 * @returns {*[]} Ledger civ rows.
 */
function deriveCivs(flows) {
  /** @type {Map<number, *>} */
  const m = new Map();
  const get = (/** @type {number} */ id, /** @type {string} */ name) => {
    let r = m.get(id);
    if (!r) {
      r = { pid: id, name, in: 0, out: 0, net: 0, refugees: 0, deaths: 0, byCause: {}, stance: "none" };
      m.set(id, r);
    }
    return r;
  };
  for (const e of flows) {
    get(e.to, e.toName).in += e.people;
    const src = get(e.from, e.fromName);
    src.out += e.people;
    src.refugees += (e.byCause.war || 0) + (e.byCause.disaster || 0);
    for (const c of Object.keys(e.byCause)) {
      src.byCause[c] = (src.byCause[c] || 0) + (e.byCause[c] || 0);
    }
  }
  for (const r of m.values()) finalizeCiv(r);
  const civs = [...m.values()];
  // A few civs slot border policies; the rest stay Neutral (no stance impact).
  const stances = ["anti", "pro", "pro", "anti"];
  stances.forEach((s, i) => {
    if (civs[i]) civs[i].stance = s;
  });
  for (const r of civs) r.stanceImpact = sampleStanceImpact(r);
  return civs;
}

/**
 * A fabricated stance-impact figure for the preview, mirroring the live multipliers (Open ×1.5 →
 * ~+33% immigration beyond neutral; Closed ×0.4 → ~1.5× the actual turned away, retention ×0.6 →
 * ~0.67× of would-be emigrants kept home). Neutral civs feel no effect.
 * @param {*} r Civ row (with stance, in, out).
 * @returns {{in:number, out:number, inPts:number, outPts:number}} Signed impact.
 */
function sampleStanceImpact(r) {
  const pts = (/** @type {number} */ v) => Math.round(v / SAMPLE_PPP);
  if (r.stance === "pro") {
    const inImp = Math.round(r.in * 0.333);
    return { in: inImp, out: 0, inPts: pts(inImp), outPts: 0 };
  }
  if (r.stance === "anti") {
    const inImp = -Math.round(r.in * 1.5);
    const outImp = -Math.round(r.out * 0.667);
    return { in: inImp, out: outImp, inPts: pts(inImp), outPts: pts(outImp) };
  }
  return { in: 0, out: 0, inPts: 0, outPts: 0 };
}

/**
 * Aggregate the world per-cause emigration breakdown from the flow list.
 * @param {*[]} flows Named flows.
 * @returns {Record<string,number>} People per cause.
 */
function aggregateByCause(flows) {
  /** @type {Record<string,number>} */
  const agg = {};
  for (const e of flows) {
    for (const c of Object.keys(e.byCause)) agg[c] = (agg[c] || 0) + (e.byCause[c] || 0);
  }
  return agg;
}

/**
 * A full game's worth of cumulative-flow frames (3 ages × 75 turns): migration growing + shifting,
 * cities founding, populations rising , snapshotted every `step` turns (the timeline-detail
 * setting).
 * @param {number} step Turns per snapshot (1..5).
 * @returns {{turn:number, age:string, flows:*[], pops:*, intra:*[]}[]} History frames (old→new).
 */
function buildHistory(step) {
  /** @type {{turn:number, age:string, year:string, flows:*[], pops:*, intra:*[]}[]} */
  const frames = [];
  const perAge = Math.floor(TURNS_PER_AGE / step);
  const total = AGES.length * perAge;
  let idx = 0;
  for (const age of AGES) {
    for (let f = 1; f <= perAge; f++) {
      const p = total > 1 ? idx / (total - 1) : 1;
      const year = sampleYear(age, perAge > 1 ? (f - 1) / (perAge - 1) : 1);
      frames.push({
        turn: f * step, age, year,
        flows: buildFlowsAt(p), pops: nativePopsAt(p), intra: buildIntraAt(p)
      });
      idx++;
    }
  }
  return frames;
}

/**
 * Resolve the progress-windowed event defs to frame-index windows for a timeline of `n` frames.
 * @param {number} n Frame count.
 * @returns {*[]} Events {kind, civs, label, from, to} (frame indices).
 */
function resolveEvents(n) {
  const last = Math.max(0, n - 1);
  return EVENT_DEFS.map((e) => ({
    kind: e.kind, civs: e.civs, label: e.label,
    from: Math.round(e.from * last), to: Math.round(e.to * last)
  }));
}

/**
 * The full synthetic gathered-dashboard data (marked `sample`), with a full game's timeline so the
 * scrubber/play show cities founding, populations growing, and migration shifting across all ages.
 * @param {number} [step] Turns per snapshot (timeline detail, 1..5; default 3).
 * @returns {*} Gathered data shape with `sample: true`.
 */
export function sampleDashboard(step) {
  const flows = buildFlowsAt(1);
  const history = buildHistory(typeof step === "number" && step >= 1 && step <= 5 ? Math.round(step) : 3);
  return {
    civs: deriveCivs(flows),
    byCause: aggregateByCause(flows),
    flows,
    pops: nativePopsAt(1),
    intra: buildIntraAt(1),
    history,
    events: resolveEvents(history.length),
    cities: CITYDEFS,
    myCities: withCivPoints(MY_CITIES),
    sample: true
  };
}
