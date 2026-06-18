// emigration-network-dots.js
//
// The DOT MODEL + LAYOUT for the destination-cluster migration view. Builds every dot ONCE in
// chronological order across the timeline and assigns each a fixed slot inside its city
// sub-cluster, which sits inside its civ circle. The orchestrator (emigration-network-viz.js) owns
// the canvas, chrome, playback, and interaction; the painter (emigration-network-paint.js) draws.
//
// SEMANTICS (so the chart is an honest accounting, not "residents + migrants double-counted"):
//   • A `pops` entry is NATIVE (home-grown) population only — upstream already nets out arrivals
//     (gatherPops subtracts grossIn; the sample's nativePopsAt is independent of flows). So
//     native dots + immigrant dots = the civ's whole population, with no overlap.
//   • Counts can GROW *and* SHRINK over time: each cohort tracks how many dots are live per frame;
//     when a count drops (war/disaster/decline) the surplus dots get a `disappearFrame` and the
//     painter hides them after it. So the view shows population AT each frame, not just the peak.
//   • Cross-civ arrivals land in the REAL destination city the move recorded (and fly in from the
//     REAL origin city), so a civ's circle shows who arrived where. Only when a flow carries no
//     city (older saves) do we fall back to spreading arrivals by population. A nonzero flow
//     always shows at least one dot.

import { civColorByIndex, CAUSE_PALETTE, MOVE_PALETTE, lighten } from "/emigration/ui/emigration-network-paint.js";

// ── Shared model typedefs (the contract between views → dots → sim → paint) ──────────────────────
/**
 * @typedef {Object} CityPop One city's population at a frame.
 * @property {string} name City name.
 * @property {boolean} [town] Whether it's a town (vs a city).
 * @property {number} pop Native (home-grown) people.
 * @property {number} [pts] Native population in raw pop-points (Civ population).
 */
/**
 * @typedef {Object} PopEntry A civ's native population, broken down by city.
 * @property {CityPop[]} cities The civ's cities.
 */
/**
 * @typedef {Object} IntraMove One intra-civ (city→city) move at a frame.
 * @property {number} civId Civ id.
 * @property {string} fromCity Source city name.
 * @property {string} toCity Destination city name.
 * @property {number} people People who moved (cumulative to this frame).
 */
/**
 * @typedef {Object} NetworkEdge A directed cross-civ flow.
 * @property {number} from Origin civ id.
 * @property {number} to Destination civ id.
 * @property {string} fromName Origin civ name.
 * @property {string} toName Destination civ name.
 * @property {number} people People (cumulative).
 * @property {string} [fromCity] Origin city name. @property {string} [toCity] Destination city.
 * @property {Record<string,number>} [byCause] People per migration cause.
 */
/**
 * @typedef {Object} CityMeta A city sub-cluster's layout (attached to a centre's `.cities`).
 * @property {string} name City name.
 * @property {boolean} [town] Town flag.
 * @property {number} [sx] X offset from the civ centre.
 * @property {number} [sy] Y offset from the civ centre.
 * @property {number} [subR] Sub-cluster radius.
 * @property {number} [bornFrame] First frame any of its dots appears.
 */
/**
 * @typedef {Object} NetworkNode A civ node (gains layout/sim fields as it's placed).
 * @property {number} id Civ id.
 * @property {string} name Civ name.
 * @property {number} [inflow] @property {number} [outflow] @property {number} [total]
 * @property {number} [net] @property {number} x @property {number} y
 * @property {number} [vx] @property {number} [vy] @property {number} [fx] @property {number} [fy]
 * @property {string} [color] @property {number} [clusterR] @property {CityMeta[]} [cities]
 * @property {boolean} [pinned] Held in place while the player drags it.
 */
/**
 * @typedef {Object} Network The flow network for one frame.
 * @property {NetworkNode[]} nodes @property {NetworkEdge[]} edges
 * @property {NetworkEdge[]} [cityEdges] City→city edges (origin + destination settlement).
 * @property {number} [maxEdge] @property {number} [maxNode]
 */
/**
 * @typedef {Object} Frame One timeline snapshot.
 * @property {number|null} turn Age-local turn. @property {string|null} age Age type.
 * @property {string} [year] In-game year label. @property {Network} network Flow network.
 * @property {Record<number, PopEntry>} [pops] Per-civ native population.
 * @property {IntraMove[]} [intra] Intra-civ moves.
 */
/**
 * @typedef {Object} Dot One rendered dot (a scaled chunk of people). Layout/animation/event fields
 * are filled in after creation.
 * @property {number} destId @property {number} originId @property {number} cityIdx
 * @property {string} cityName @property {string} [fromCityName] @property {number} [fromCityIdx]
 * @property {number} [fromCivCityIdx] Origin CITY index within the origin civ (immigrants).
 * @property {string} cause @property {"resident"|"internal"|"immigrant"} scope
 * @property {Record<string,string>} colors
 * @property {string} originName @property {string} destName
 * @property {number} appearFrame @property {number|null} [disappearFrame]
 * @property {number} ox @property {number} oy @property {number} ci
 * @property {{fromX:number, fromY:number, p:number}|null} [anim]
 * @property {string} [evKind] @property {number} [evFrom] @property {number} [evTo]
 */

const GOLDEN = Math.PI * (3 - Math.sqrt(5)); // golden angle for phyllotaxis packing

/**
 * Native (home-grown) population total of a per-civ pop entry ({cities:[{pop}]} or a bare number).
 * @param {PopEntry|number|undefined} entry Pop entry.
 * @returns {number} People.
 */
export function nativeTotal(entry) {
  if (entry && typeof entry === "object" && Array.isArray(entry.cities)) {
    let sum = 0;
    for (const c of entry.cities) sum += c.pop || 0;
    return sum;
  }
  return typeof entry === "number" ? entry : 0;
}

/**
 * Total people the dots must represent at the final frame: native (resident) population in every
 * cluster PLUS all cross-civ arrivals.
 * @param {Network} lastNet Final (cumulative) network.
 * @param {Record<number, PopEntry>} lastPops Final per-civ native populations.
 * @returns {number} People.
 */
export function totalPeople(lastNet, lastPops) {
  const add = (/** @type {number} */ a, /** @type {*} */ e) => a + e.people;
  const mig = frameEdges(lastNet).reduce(add, 0);
  const pop = Object.keys(lastPops || {}).reduce((a, k) => a + nativeTotal(lastPops[+k]), 0);
  return mig + pop;
}

/**
 * The migration edges to draw dots for: the city→city edges when the data carries them (so arrivals
 * land in the real destination city), else the civ→civ edges (older saves / no city detail).
 * @param {Network} net The frame's network.
 * @returns {NetworkEdge[]} Edges.
 */
function frameEdges(net) {
  if (!net) return [];
  return net.cityEdges && net.cityEdges.length ? net.cityEdges : net.edges || [];
}

/**
 * Native (home-grown) population total of a pop entry in raw pop-POINTS (Civ population).
 * @param {PopEntry|undefined} entry Pop entry (its cities carry `.pts`).
 * @returns {number} Pop points.
 */
function nativePoints(entry) {
  if (entry && Array.isArray(entry.cities)) {
    let sum = 0;
    for (const c of entry.cities) sum += c.pts || 0;
    return sum;
  }
  return 0;
}

/**
 * Total pop-POINTS the final frame represents: native population (points) in every cluster plus all
 * cross-civ arrivals (points). Lets the viz size dots as ~1 dot per civ pop-point in Civ Pop mode.
 * @param {Network} lastNet Final (cumulative) network.
 * @param {Record<number, PopEntry>} lastPops Final per-civ native populations.
 * @returns {number} Pop points.
 */
export function totalPoints(lastNet, lastPops) {
  const addPts = (/** @type {number} */ a, /** @type {*} */ e) => a + (e.points || 0);
  const mig = frameEdges(lastNet).reduce(addPts, 0);
  const pop = Object.keys(lastPops || {}).reduce((a, k) => a + nativePoints(lastPops[+k]), 0);
  return mig + pop;
}

/**
 * Sub-cluster (city) radius for a dot count.
 * @param {number} n Dot count.
 * @returns {number} Radius.
 */
function clusterRadius(n) {
  return n > 0 ? 4 + 2.5 * Math.sqrt(n) : 0;
}

/**
 * The chronological dot bucket for one (civ, city), creating it on demand. Dots for a civ are
 * grouped per city so each city becomes its own sub-cluster inside the civ circle.
 * @param {*} b Build context.
 * @param {number} civId Civ id.
 * @param {number} cityIdx City index within the civ.
 * @returns {*[]} The bucket.
 */
function cityBucket(b, civId, cityIdx) {
  let byCity = b.perDest.get(civId);
  if (!byCity) {
    byCity = new Map();
    b.perDest.set(civId, byCity);
  }
  let list = byCity.get(cityIdx);
  if (!list) {
    list = [];
    byCity.set(cityIdx, list);
  }
  return list;
}

/**
 * Grow a cohort to `target` live dots: append fresh dots (copied from the template) at frame i.
 * @param {*} b Build context.
 * @param {*} ref Cohort ref {key, civId, cityIdx, template}.
 * @param {*} co Cohort state {dots, live}.
 * @param {number} target Desired live count.
 * @param {number} i Frame index (appear frame).
 */
function growCohort(b, ref, co, target, i) {
  const bucket = cityBucket(b, ref.civId, ref.cityIdx);
  for (let k = co.live; k < target; k++) {
    const d = { ...ref.template, appearFrame: i, disappearFrame: null };
    bucket.push(d);
    co.dots.push(d);
  }
  co.live = target;
}

/**
 * Shrink a cohort to `target` live dots: stamp `disappearFrame` on the most-recently-added live
 * dots (so a cluster shrinks from its rim) — this is how population DECLINE is shown.
 * @param {*} co Cohort state {dots, live}.
 * @param {number} target Desired live count.
 * @param {number} i Frame index (disappear frame).
 */
function shrinkCohort(co, target, i) {
  let hide = co.live - target;
  for (let j = co.dots.length - 1; j >= 0 && hide > 0; j--) {
    if (co.dots[j].disappearFrame == null) {
      co.dots[j].disappearFrame = i;
      hide--;
    }
  }
  co.live = target;
}

/**
 * Set a cohort's live dot count at frame i, growing or shrinking as needed. A cohort is one
 * (destination, city, kind) stream of dots; tracking it lets counts rise and fall over time.
 * @param {*} b Build context.
 * @param {*} ref Cohort ref {key, civId, cityIdx, template}.
 * @param {number} target Desired live count (≥ 0).
 * @param {number} i Frame index.
 */
function setCohort(b, ref, target, i) {
  let co = b.cohorts.get(ref.key);
  if (!co) {
    if (target <= 0) return;
    co = { dots: [], live: 0 };
    b.cohorts.set(ref.key, co);
  }
  if (target > co.live) growCohort(b, ref, co, target, i);
  else if (target < co.live) shrinkCohort(co, target, i);
}

/**
 * Largest-remainder apportionment of `total` integer dots across weights (which sum to 1): floor
 * each ideal share, then hand the leftover dots to the largest fractional remainders. Keeps the
 * total exact while letting small shares still get a dot.
 * @param {number} total Dots to hand out.
 * @param {number[]} weights Per-bucket weights (sum 1).
 * @returns {number[]} Integer dots per bucket (sums to total).
 */
function allocate(total, weights) {
  const ideal = weights.map((w) => total * w);
  const out = ideal.map(Math.floor);
  let rem = total - out.reduce((a, b) => a + b, 0);
  const order = ideal
    .map((v, idx) => ({ idx, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < order.length && rem > 0; k++) {
    out[order[k].idx]++;
    rem--;
  }
  return out;
}

/**
 * The civ's display name from its centre.
 * @param {*} b Build context.
 * @param {number} civId Civ id.
 * @returns {string} Name.
 */
function civNameOf(b, civId) {
  const ci = b.byId.get(civId);
  return ci != null ? b.centers[ci].name : "";
}

/**
 * The colour set for an immigrant cohort: origin-civ colour, cause colour, immigrant-move colour.
 * @param {*} b Build context.
 * @param {*} e Flow edge.
 * @param {string} cause Cause key.
 * @returns {Record<string,string>} Colours by lens.
 */
function immigrantColors(b, e, cause) {
  return {
    origin: civColorByIndex(b.colorMap.get(e.from) || 0),
    cause: CAUSE_PALETTE[cause] || CAUSE_PALETTE.other, movement: MOVE_PALETTE.immigrant
  };
}

/**
 * The index of a named city within a civ's final city list (capital/0 fallback when unknown).
 * @param {*} b Build context.
 * @param {number} civId Civ id.
 * @param {string} name City name.
 * @returns {number} City index.
 */
function cityIndexOf(b, civId, name) {
  const m = b.cityIdx.get(civId);
  const idx = m && name ? m.get(name) : null;
  return idx == null ? 0 : idx;
}

/**
 * Place an immigrant cohort in the REAL destination city (e.toCity), tagged with its REAL origin
 * city (e.fromCity) so it flies in from where people actually left.
 * @param {*} b Build context.
 * @param {*} o { e, c, i } edge / cause / frame.
 * @param {number} total Dot count.
 */
function addCityCauseDots(b, o, total) {
  const e = o.e;
  const destIdx = cityIndexOf(b, e.to, e.toCity);
  const fromIdx = e.fromCity ? cityIndexOf(b, e.from, e.fromCity) : null;
  const cities = b.cityList.get(e.to) || [];
  const cityName = (cities[destIdx] && cities[destIdx].name) || e.toName;
  const template = { destId: e.to, originId: e.from, cityIdx: destIdx,
    fromCivCityIdx: fromIdx == null ? undefined : fromIdx, cityName, cause: o.c,
    scope: "immigrant", colors: immigrantColors(b, e, o.c),
    originName: e.fromName, destName: e.toName };
  const ref = { key: e.to + "|" + destIdx + "|" + e.from + "|" + (e.fromCity || "") + "|" + o.c,
    civId: e.to, cityIdx: destIdx, template };
  setCohort(b, ref, total, o.i);
}

/**
 * Spread an immigrant cohort across the destination civ's cities by population — the legacy path,
 * used only when a flow has no destination city recorded (e.g. an older save).
 * @param {*} b Build context.
 * @param {*} o { e, c, i } edge / cause / frame.
 * @param {number} total Dot count.
 */
function addSpreadCauseDots(b, o, total) {
  const e = o.e;
  const alloc = allocate(total, b.cityWeights.get(e.to) || [1]);
  const cities = b.cityList.get(e.to) || [];
  const colors = immigrantColors(b, e, o.c);
  for (let idx = 0; idx < alloc.length; idx++) {
    const cityName = (cities[idx] && cities[idx].name) || e.toName;
    const template = { destId: e.to, originId: e.from, cityIdx: idx, cityName, cause: o.c,
      scope: "immigrant", colors, originName: e.fromName, destName: e.toName };
    const ref = { key: e.to + "|" + idx + "|" + e.from + "|" + o.c, civId: e.to, cityIdx: idx, template };
    setCohort(b, ref, alloc[idx], o.i);
  }
}

/**
 * Add one (corridor, cause) flow's immigrant dots: into the real destination city when the flow
 * records it, else spread by population.
 * @param {*} b Build context.
 * @param {*} o { e, c, i } edge / cause / frame.
 */
function addCauseDots(b, o) {
  const people = o.e.byCause[o.c] || 0;
  if (people <= 0) return;
  const total = Math.max(1, Math.floor(people / b.unit));
  if (o.e.toCity) addCityCauseDots(b, o, total);
  else addSpreadCauseDots(b, o, total);
}

/**
 * Append all arrivals for one corridor at frame i (across its causes).
 * @param {*} b Build context.
 * @param {*} e Flow edge.
 * @param {number} i Frame index (appear frame).
 */
function appendCorridorDots(b, e, i) {
  for (const c of Object.keys(e.byCause || {})) addCauseDots(b, { e, c, i });
}

/**
 * Set the NATIVE (resident) dot count for one (civ, city) at frame i — coloured in the civ's own
 * colour, living in its city's sub-cluster, so a circle shows its home-grown population by city.
 * Counts rise and fall, so decline is shown (not just the peak).
 * @param {*} b Build context.
 * @param {number} civId Civ id.
 * @param {number} cityIdx City index.
 * @param {*} city City {name, town, pop}.
 * @param {number} i Frame index.
 */
function appendNativeDots(b, civId, cityIdx, city, i) {
  const col = civColorByIndex(b.colorMap.get(civId) || 0);
  const civName = civNameOf(b, civId);
  const template = { destId: civId, originId: civId, cityIdx, cityName: city.name, cause: "native",
    scope: "resident", colors: { origin: col, cause: CAUSE_PALETTE.native, movement: MOVE_PALETTE.resident },
    originName: civName, destName: civName };
  const ref = { key: civId + "|" + cityIdx + "|native", civId, cityIdx, template };
  setCohort(b, ref, Math.floor((city.pop || 0) / b.unit), i);
}

/**
 * The shared template for one internal-move dot (colour/scope/names); copied per dot with its
 * frame. Internal movers relocated between this civ's OWN cities, so they live in the destination
 * city's sub-cluster, coloured a LIGHTER tint of the civ's colour (origin lens) — distinct from
 * home-grown residents and foreign immigrants.
 * @param {*} b Build context.
 * @param {number} civId Civ id.
 * @param {number} toIdx Destination city index.
 * @param {number|undefined} fromIdx Source city index (for the fly-from animation).
 * @param {*} entry Move {fromCity, toCity, people}.
 * @returns {*} A dot template (no appearFrame/slot yet).
 */
function intraDotTemplate(b, civId, toIdx, fromIdx, entry) {
  const tint = lighten(civColorByIndex(b.colorMap.get(civId) || 0), 0.42);
  const ci = b.byId.get(civId);
  const civName = ci != null ? b.centers[ci].name : "";
  return {
    destId: civId, originId: civId, cityIdx: toIdx,
    fromCityIdx: fromIdx == null ? undefined : fromIdx,
    cityName: entry.toCity, fromCityName: entry.fromCity, cause: "internal", scope: "internal",
    colors: { origin: tint, cause: MOVE_PALETTE.internal, movement: MOVE_PALETTE.internal },
    originName: civName, destName: civName
  };
}

/**
 * Append the newly-moved internal (intra-civ) dots for one city→city move at frame i.
 * @param {*} b Build context.
 * @param {number} civId Civ id.
 * @param {*} entry Move {fromCity, toCity, people}.
 * @param {number} i Frame index (appear frame).
 */
function appendIntraDots(b, civId, entry, i) {
  const idxByName = b.cityIdx.get(civId);
  const toIdx = idxByName && idxByName.get(entry.toCity);
  if (toIdx == null) return;
  const fromIdx = idxByName.get(entry.fromCity);
  const total = entry.people > 0 ? Math.max(1, Math.floor(entry.people / b.unit)) : 0;
  const ref = {
    key: civId + "|" + toIdx + "|intra|" + entry.fromCity, civId, cityIdx: toIdx,
    template: intraDotTemplate(b, civId, toIdx, fromIdx, entry)
  };
  setCohort(b, ref, total, i);
}

/**
 * Append every civ's internal (intra-civ) moves for one frame.
 * @param {*} b Build context.
 * @param {*[]} intra Frame intra moves ({civId, fromCity, toCity, people}).
 * @param {number} i Frame index.
 */
function appendFrameIntra(b, intra, i) {
  for (const m of intra || []) {
    if (b.byId.get(m.civId) != null) appendIntraDots(b, m.civId, m, i);
  }
}

/**
 * Append every civ's native city dots for one frame, matching cities to their index in the civ's
 * final city list (by name) so a city keeps the same sub-cluster as it grows.
 * @param {*} b Build context.
 * @param {*} pops Frame pops (civId → {cities:[{name,town,pop}]}).
 * @param {number} i Frame index.
 */
function appendFrameNatives(b, pops, i) {
  for (const k of Object.keys(pops)) {
    const civId = +k;
    if (b.byId.get(civId) == null) continue;
    const idxByName = b.cityIdx.get(civId);
    for (const city of (pops[civId] && pops[civId].cities) || []) {
      const cityIdx = (idxByName && idxByName.get(city.name)) || 0;
      appendNativeDots(b, civId, cityIdx, city, i);
    }
  }
}

/**
 * Phyllotaxis-pack a city's chronological dot list into slots offset from its sub-centre.
 * @param {*} cm City meta {sx, sy, subR, bornFrame}.
 * @param {*[]} list The city's dots.
 * @param {*[]} dots Flat output list.
 */
function layoutCityDots(cm, list, dots) {
  const cr = cm.subR;
  for (let i = 0; i < list.length; i++) {
    const rr = cr * Math.sqrt((i + 0.5) / list.length);
    const aa = i * GOLDEN;
    const d = list[i];
    d.ox = cm.sx + Math.cos(aa) * rr;
    d.oy = cm.sy + Math.sin(aa) * rr;
    cm.bornFrame = Math.min(cm.bornFrame, d.appearFrame);
    dots.push(d);
  }
}

/**
 * Lay out one civ's city sub-clusters (each a small phyllotaxis-packed disc) within the civ circle,
 * spreading them so they roughly tile the civ's area; sets each civ centre's clusterR.
 * @param {*} center Civ centre (gets clusterR; its `.cities` get sx/sy/subR/bornFrame).
 * @param {Map<number,*[]>} byCity cityIdx → dot list.
 * @param {*[]} dots Flat output list.
 */
function layoutCiv(center, byCity, dots) {
  const cities = center.cities;
  const subRs = cities.map((/** @type {*} */ _c, /** @type {number} */ idx) =>
    clusterRadius((byCity.get(idx) || []).length));
  const area = subRs.reduce((/** @type {number} */ a, /** @type {number} */ r) => a + r * r, 0);
  // Push the city sub-clusters a bit further apart so they read as distinct discs (the civ circle's
  // clusterR below grows to contain them).
  const spread = cities.length > 1 ? 1.75 * Math.sqrt(area) : 0;
  let reach = 8;
  for (let idx = 0; idx < cities.length; idx++) {
    const ang = idx * GOLDEN;
    const rad = cities.length > 1 ? spread * Math.sqrt((idx + 0.5) / cities.length) : 0;
    const cm = cities[idx];
    cm.sx = Math.cos(ang) * rad;
    cm.sy = Math.sin(ang) * rad;
    cm.subR = subRs[idx];
    cm.bornFrame = Infinity;
    layoutCityDots(cm, byCity.get(idx) || [], dots);
    reach = Math.max(reach, rad + Math.max(subRs[idx], 5));
  }
  center.clusterR = reach;
}

/**
 * Assign each civ's per-city dot lists to fixed slots (so dots never move as clusters grow) and
 * flatten. Each civ centre keeps `d.ci`; offsets in `d.ox/d.oy` are relative to the civ centre.
 * @param {Map<number,Map<number,*[]>>} perDest civId → (cityIdx → dot list).
 * @param {*[]} centers Civ centres.
 * @param {Map<number,number>} byId id → centre index.
 * @returns {*[]} The flattened dot list.
 */
function placeDots(perDest, centers, byId) {
  /** @type {*[]} */
  const dots = [];
  for (const [civId, byCity] of perDest) {
    const ci = byId.get(civId);
    if (ci == null) continue;
    for (const list of byCity.values()) for (const d of list) d.ci = ci;
    layoutCiv(centers[ci], byCity, dots);
  }
  return dots;
}

/**
 * Each civ's final city list (names + town flags), from the last frame's populations; civs with no
 * pop entry fall back to a single city named after the civ. Also attaches `.cities` to each centre.
 * @param {*} lastPops Final-frame pops.
 * @param {*[]} centers Civ centres.
 * @returns {{cityList:Map<number,*[]>, cityIdx:Map<number,Map<string,number>>,
 *   cityWeights:Map<number,number[]>}} City metadata + per-civ city population weights.
 */
function buildCityMeta(lastPops, centers) {
  /** @type {Map<number,*[]>} */
  const cityList = new Map();
  /** @type {Map<number,Map<string,number>>} */
  const cityIdx = new Map();
  /** @type {Map<number,number[]>} */
  const cityWeights = new Map();
  for (const c of centers) {
    const entry = lastPops && lastPops[c.id];
    const has = entry && entry.cities && entry.cities.length;
    const src = has ? entry.cities : [{ name: c.name, town: false }];
    const cities = src.map((/** @type {*} */ ct) => ({ name: ct.name, town: !!ct.town }));
    cityList.set(c.id, cities);
    const m = new Map();
    cities.forEach((/** @type {*} */ ct, /** @type {number} */ i) => m.set(ct.name, i));
    cityIdx.set(c.id, m);
    cityWeights.set(c.id, cityPopWeights(src));
    c.cities = cities;
  }
  return { cityList, cityIdx, cityWeights };
}

/**
 * Population weights (summing to 1) for a civ's cities; falls back to all-weight-on-the-first when
 * no populations are known, so arrivals still land somewhere.
 * @param {*[]} src City entries ({pop}).
 * @returns {number[]} Weights summing to 1.
 */
function cityPopWeights(src) {
  const pops = src.map((/** @type {*} */ ct) => ct.pop || 0);
  const sum = pops.reduce((a, b) => a + b, 0);
  if (sum > 0) return pops.map((p) => p / sum);
  return src.map((/** @type {*} */ _ct, /** @type {number} */ i) => (i === 0 ? 1 : 0));
}

/**
 * Build every dot ONCE in chronological order across all frames — each civ's growing per-city
 * native population plus the cross-civ arrivals — tagged with the frame it first appears (so
 * playback reveals them in time order) and a fixed sub-cluster slot.
 * @param {Frame[]} frames Timeline frames.
 * @param {NetworkNode[]} centers Civ centres.
 * @param {Map<number,number>} byId id → centre index.
 * @param {Map<number,number>} colorMap Colour-index map.
 * @param {number} unit People per dot.
 * @returns {Dot[]} The dot list.
 */
export function buildChronoDots(frames, centers, byId, colorMap, unit) {
  const lastPops = frames[frames.length - 1].pops || {};
  const { cityList, cityIdx, cityWeights } = buildCityMeta(lastPops, centers);
  /** @type {*} */
  const b = {
    perDest: new Map(), cohorts: new Map(), unit, colorMap, centers, byId,
    cityList, cityIdx, cityWeights
  };
  for (let i = 0; i < frames.length; i++) {
    appendFrameNatives(b, frames[i].pops || {}, i);
    appendFrameIntra(b, frames[i].intra || [], i);
    for (const e of frameEdges(frames[i].network)) {
      if (byId.get(e.to) != null) appendCorridorDots(b, e, i);
    }
  }
  return placeDots(b.perDest, centers, byId);
}
