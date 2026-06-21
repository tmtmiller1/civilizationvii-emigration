// emigration-migration-stats.js
//
// The per-civ migration TALLIES: as each pass's migrations are recorded, accumulate per-player
// cumulative net / gross-out / gross-in / refugees / deaths, and expose per-sample deltas (used by
// the Demographics graphs, wired in emigration-demographics.js) plus cumulative reads
// (globalThis.EmigrationData, used by the Demographics war tooltip + the feedback layer).
//
// Tallies persist in GameConfiguration. The schema extends the original net-only blob
// backward-compatibly (older saves simply lack the new maps, which default to {}).

import { isRefugeeCause } from "/emigration/ui/emigration-causes.js";
import { dlog } from "/emigration/ui/emigration-log.js";
import { citySnapshot } from "/emigration/ui/emigration-city-readout-data.js";
import { getSnapshotInterval } from "/emigration/ui/emigration-settings.js";
import { cityName } from "/emigration/ui/emigration-migration-records.js";
import { scaleCityPopulation } from "/emigration/ui/emigration-population.js";
import {
  addFlows,
  sumDeltas,
  subtractFlows,
  mergeAdjacentDeltas,
  migrateCumulativeToDeltas,
  capFlows
} from "/emigration/ui/emigration-flow-history.js";

const STATE_KEY = "EmigrationMigStats_v1";

/** In-memory ring of the most recent moves (newest last), for the live readout/feed. Not persisted
 * , it's a session-local "what just happened" surface, so a reload simply starts it empty. */
const RECENT_CAP = 50;
/** @type {{srcOwner?:number, destOwner?:number, people?:number, cause?:string}[]} */
let _recent = [];

/**
 * @typedef {Object} MigStatsState
 * @property {Record<string, number>} cum Cumulative net per player.
 * @property {Record<string, number>} lastSampled Net watermark (per-sample delta).
 * @property {Record<string, number>} out Cumulative gross emigration per player.
 * @property {Record<string, number>} in Cumulative gross immigration per player.
 * @property {Record<string, number>} refugees Cumulative non-unhappiness emigration.
 * @property {Record<string, number>} refugeesIn Cumulative refugee IMMIGRATION per player —
 *   war/disaster/conquest arrivals RECEIVED (the inflow counterpart of `refugees`).
 * @property {Record<string, number>} deaths Cumulative population lost to attrition (the outlet).
 * @property {Record<string, number>} cumPts Net per player, in raw pop points.
 * @property {Record<string, number>} outPts Gross emigration per player, in pop points.
 * @property {Record<string, number>} inPts Gross immigration per player, in pop points.
 * @property {Record<string, number>} refugeesPts Refugee emigration per player, in pop points.
 * @property {Record<string, number>} refugeesInPts Refugee immigration per player, in pop points.
 * @property {Record<string, number>} deathsPts Attrition deaths per player, in pop points.
 * @property {Record<string, number>} lossesPts External population loss per player, in pop points.
 * @property {Record<string, Record<string,number>>} flowsPts Cross-civ flow (pop points by cause).
 * @property {Record<string, number>} losses Cumulative EXTERNAL population loss per player ,
 *   engine-driven drops (starvation / plague / razing / disasters) not explained by the mod's own
 *   migration or attrition. Combined with `deaths` for the ledger's "Losses" column.
 * @property {Record<string, number>} cityPts Last-seen raw population (points) per city key, to
 *   diff turn-over-turn and detect external loss.
 * @property {Record<string, string>} cityNames Last-seen display name per city key (to value a
 *   razed city's residual loss against this turn's recorded departures).
 * @property {Record<string, number>} wmOut Gross-emigration watermark.
 * @property {Record<string, number>} wmIn Gross-immigration watermark.
 * @property {Record<string, number>} wmRefugees Refugees-per-turn watermark.
 * @property {Record<string, number>} wmRefugeesIn Refugees-received-per-turn watermark.
 * @property {Record<string, Record<string, number>>} outByCause Cumulative emigration, per cause.
 * @property {Record<string, Record<string, number>>} inByCause Immigration cumulative by cause.
 * @property {Record<string, Record<string, number>>} wmOutByCause Per-cause emigration watermarks.
 * @property {Record<string, Record<string, number>>} wmInByCause Per-cause immigration watermarks.
 * @property {Record<string, Record<string, number>>} flows Cross-civ people moved, keyed
 *   "src>dest" then by cause (so the network viz can colour/filter edges by why people moved).
 * @property {Record<string, number>} stanceIn Border-stance impact on immigration IN (people;
 *   + allowed beyond a neutral baseline, - prevented), accumulated per turn.
 * @property {Record<string, number>} stanceOut Border-stance impact on emigration OUT (people;
 *   - = citizens Closed Borders kept home).
 * @property {Record<string, number>} stanceInPts Stance impact on IN, in pop points.
 * @property {Record<string, number>} stanceOutPts Stance impact on OUT, in pop points.
 * @property {*[]} flowHistory Decimated DELTA-encoded flow snapshots over time (P0.3), for the
 *   network viz timeline scrubber. Each is {turn, age, chartTurn, year, delta}: `delta` holds only
 *   the migration that occurred in that interval; the cumulative network per frame is reconstructed
 *   on read (migrationFlowHistory) by summing deltas. chartTurn is MONOTONIC across ages (so
 *   age-local turn resets never collide or reorder).
 * @property {number} flowSchema Flow-history encoding version (2 = delta-encoded). Legacy saves
 *   (frames carrying a cumulative `flows` clone) are migrated to deltas once on load.
 * @property {{turn:number, age:string, year:string, name:string, severity:number}[]} disasterEvents
 *   Notable disaster onsets (age-local turn + age + year-label + name + severity), capped. Stamped as
 *   each event fires so the Demographics refugees chart can mark when disasters struck.
 * @property {number} chartTurn Latest monotonic cross-age turn (never resets at an age boundary).
 * @property {string} chartAge Age of the latest snapshot (to detect boundary crossings).
 * @property {number} chartLocal Age-local turn of the latest snapshot.
 * @property {string} lossAge Age of the last external-loss accounting pass, tracked independently
 *   of chartAge so the age-transition re-baseline guard (P0.2) is immune to call ordering.
 */

/** @type {MigStatsState | null} */
let _s = null;

/**
 * The raw persisted state string, or null.
 * @returns {string|null} The stored JSON, or null.
 */
function readStored() {
  const g = Configuration?.getGame?.();
  const v = g && typeof g.getValue === "function" ? g.getValue(STATE_KEY) : null;
  return typeof v === "string" && v.length ? v : null;
}

/**
 * `v` if it's an object, else a fresh empty map. Keeps `normalize` flat (no per-field `||`).
 * @param {*} v Value.
 * @returns {*} An object.
 */
function mapOr(v) {
  return v && typeof v === "object" ? v : {};
}

/**
 * Coerce a parsed object into the canonical state shape (filling missing maps). Existing saves keep
 * their tallies untouched: the v2 net-accounting change (settled cross-civ only) takes effect on new
 * moves going forward; a pre-v2 save's accumulated net carries a fixed offset rather than being wiped.
 * @param {*} o Parsed object.
 * @returns {MigStatsState} The normalized state.
 */
function normalize(o) {
  return {
    cum: mapOr(o.cum),
    cumPts: mapOr(o.cumPts),
    lastSampled: mapOr(o.lastSampled),
    out: mapOr(o.out),
    in: mapOr(o.in),
    refugees: mapOr(o.refugees),
    refugeesIn: mapOr(o.refugeesIn),
    deaths: mapOr(o.deaths),
    losses: mapOr(o.losses),
    // Parallel raw-pop-point tallies (1 point per migration) so the UI can show exact Civ
    // population numbers, not just the historically-scaled "people" totals. (cumPts is set above.)
    outPts: mapOr(o.outPts),
    inPts: mapOr(o.inPts),
    refugeesPts: mapOr(o.refugeesPts),
    refugeesInPts: mapOr(o.refugeesInPts),
    deathsPts: mapOr(o.deathsPts),
    lossesPts: mapOr(o.lossesPts),
    flowsPts: mapOr(o.flowsPts),
    cityPts: mapOr(o.cityPts),
    cityNames: mapOr(o.cityNames),
    wmOut: mapOr(o.wmOut),
    wmIn: mapOr(o.wmIn),
    wmRefugees: mapOr(o.wmRefugees),
    wmRefugeesIn: mapOr(o.wmRefugeesIn),
    outByCause: mapOr(o.outByCause),
    inByCause: mapOr(o.inByCause),
    wmOutByCause: mapOr(o.wmOutByCause),
    wmInByCause: mapOr(o.wmInByCause),
    flows: mapOr(o.flows),
    // Stance-impact counterfactual (people + pop-points): how much each civ's border policy raised
    // (Pro) or cut (Anti / Closed-retention) its cross-civ immigration in/out vs a neutral-borders
    // world, accumulated per turn. Signed: +in = allowed beyond, -in = prevented, -out = retained.
    stanceIn: mapOr(o.stanceIn),
    stanceOut: mapOr(o.stanceOut),
    stanceInPts: mapOr(o.stanceInPts),
    stanceOutPts: mapOr(o.stanceOutPts),
    flowHistory: Array.isArray(o.flowHistory) ? o.flowHistory : [],
    disasterEvents: Array.isArray(o.disasterEvents) ? o.disasterEvents : [],
    chartTurn: typeof o.chartTurn === "number" ? o.chartTurn : 0,
    chartAge: typeof o.chartAge === "string" ? o.chartAge : "",
    chartLocal: typeof o.chartLocal === "number" ? o.chartLocal : 0,
    lossAge: typeof o.lossAge === "string" ? o.lossAge : "",
    flowSchema: typeof o.flowSchema === "number" ? o.flowSchema : 1
  };
}

/**
 * Load (once) the persisted tallies.
 * @returns {MigStatsState} State.
 */
function load() {
  if (_s) return _s;
  try {
    const raw = readStored();
    if (raw) {
      const o = JSON.parse(raw);
      if (o && typeof o === "object") {
        _s = normalize(o);
        migrateFlowSchema(_s);
        return _s;
      }
    }
  } catch (_) {
    /* ignore */
  }
  _s = normalize({});
  _s.flowSchema = 2; // fresh state is already delta-encoded
  return _s;
}

/**
 * Upgrade legacy cumulative-clone flow history to delta encoding once on load (P0.3), then stamp
 * the schema. Idempotent: a no-op for already-delta-encoded saves.
 * @param {MigStatsState} s State.
 */
function migrateFlowSchema(s) {
  if (s.flowSchema !== 2) {
    s.flowHistory = migrateCumulativeToDeltas(s.flowHistory);
    s.flowSchema = 2;
  }
}

/** Persist the tallies to GameConfiguration. */
function save() {
  try {
    Configuration?.editGame?.()?.setValue?.(STATE_KEY, JSON.stringify(_s));
  } catch (_) {
    /* ignore */
  }
}

/**
 * A finite number, or 0.
 * @param {*} v Value.
 * @returns {number} v if finite, else 0.
 */
function numOr0(v) {
  return typeof v === "number" && isFinite(v) ? v : 0;
}

/**
 * Whether a migration record crosses a civ border. Prefers the record's own `crossCiv` flag (the
 * only reliable signal for a lagged depart/arrive half, which carries just one owner); falls back to
 * comparing owners when both are present (e.g. an instantaneous move or a synthetic test record).
 * @param {*} m Migration record.
 * @returns {boolean} True when the move is between two different civs.
 */
function isCrossCiv(m) {
  if (m.crossCiv === true) return true;
  if (m.crossCiv === false) return false;
  return typeof m.srcOwner === "number" && typeof m.destOwner === "number" && m.srcOwner !== m.destOwner;
}

/**
 * Fold one migration into the tallies: a gain for the destination owner, an equal loss for the
 * source owner, and - when the move was caused by war/disaster/conquest - a refugee tally on the
 * source. Also tracks per-cause emigration/immigration breakdowns for tooltips.
 * @param {MigStatsState} s State.
 * @param {{srcOwner?:number, destOwner?:number, people:number, points?:number, cause?:string,
 *   crossCiv?:boolean}} m Migration.
 */

function foldMigration(s, m) {
  const p = numOr0(m.people);
  const pts = numOr0(m.points);
  const c = m.cause || "other"; // Default cause if unspecified
  foldFlow(s, m, p, pts); // cross-civ src→dest edge for the migration-network viz
  // Attrition is a death, not a migration: it never touches the migration/refugee tallies (no one
  // received these people) - only the deaths counter.
  if (m.cause === "attrition") {
    if (typeof m.srcOwner === "number") addBoth(s.deaths, s.deathsPts, m.srcOwner, p, pts);
    return;
  }
  // NET migration is an INTER-CIV measure: an internal move (within one civ) doesn't change that
  // civ's total, so it must not touch the net tally — otherwise transit lag (depart debits now,
  // arrive credits later) leaves every actively-shedding civ with a permanent in-flight deficit, so
  // the Net chart shows everyone negative and no one positive. Gross in/out still count every move.
  const cross = isCrossCiv(m);
  if (typeof m.destOwner === "number") {
    if (cross) addBoth(s.cum, s.cumPts, m.destOwner, p, pts);
    addBoth(s.in, s.inPts, m.destOwner, p, pts);
    add(s.inByCause, m.destOwner, p, c);
    // Refugee IMMIGRATION: a war/disaster/conquest arrival received here (inflow counterpart of the
    // refugee outflow tallied on the source below). Lets the dashboard show "refugees received".
    if (isRefugeeCause(m.cause)) addBoth(s.refugeesIn, s.refugeesInPts, m.destOwner, p, pts);
  }
  if (typeof m.srcOwner !== "number") return;
  if (cross) addBoth(s.cum, s.cumPts, m.srcOwner, -p, -pts);
  addBoth(s.out, s.outPts, m.srcOwner, p, pts);
  add(s.outByCause, m.srcOwner, p, c);
  if (isRefugeeCause(m.cause)) addBoth(s.refugees, s.refugeesPts, m.srcOwner, p, pts);
}

/**
 * Tally a migration flow into the matrix for the network viz. The key records the origin AND
 * destination SETTLEMENT (not just the civ): "srcCiv>destCiv>srcCity>destCity". Same-owner moves are
 * KEPT as intra-civ edges (srcCiv === destCiv) so the flow map can draw city→city movement WITHIN a
 * civ; consumers split intra (src===dest) from cross-civ (src!==dest) edges by owner.
 *
 * The edge is recorded ONCE, at the move's initiation. The instantaneous "move" record carries both
 * owners; the lagged "depart" record carries srcOwner + the non-tally `edgeDestOwner` (its real
 * destOwner is withheld so the immigration tally isn't double-credited). The lagged "arrive" half
 * carries no srcOwner, so the srcOwner guard skips it — no double count. (Previously this required
 * BOTH owners, so with transit lag on — the default — every lagged move was dropped and the network
 * stayed empty.)
 * @param {MigStatsState} s State.
 * @param {*} m Migration ({srcOwner?, destOwner?, edgeDestOwner?, srcName?, destName?, cause?}).
 * @param {number} p People moved.
 * @param {number} pts Pop points moved.
 */
function foldFlow(s, m, p, pts) {
  if (m.cause === "attrition") return;
  if (typeof m.srcOwner !== "number") return; // record at initiation (move/depart); skip arrive half
  const destO = typeof m.destOwner === "number" ? m.destOwner
    : typeof m.edgeDestOwner === "number" ? m.edgeDestOwner : null;
  if (destO === null) return;
  const key = m.srcOwner + ">" + destO + ">" + (m.srcName || "") + ">" + (m.destName || "");
  const c = m.cause || "other";
  add(s.flows, key, p, c);
  add(s.flowsPts, key, pts, c);
}

/**
 * Add `delta` to a tally map entry (treating missing as 0). Supports both flat maps (map[id])
 * and nested cause maps (map[id][cause]).
 * @param {Record<string, any>} map A tally map (flat, or nested by cause).
 * @param {number|string} id Player id, or a composite key (e.g. "src>dest" for flows).
 * @param {number} delta Signed amount.
 * @param {string} [cause] Optional cause key for nested maps.
 */
function add(map, id, delta, cause) {
  if (typeof cause === "string") {
    if (!map[id]) map[id] = {};
    map[id][cause] = (map[id][cause] || 0) + delta;
  } else {
    map[id] = (map[id] || 0) + delta;
  }
}

/**
 * Add to a people map and its parallel pop-point map at once.
 * @param {Record<string,number>} peopleMap People tally.
 * @param {Record<string,number>} ptsMap Pop-point tally.
 * @param {number} id Owner id.
 * @param {number} people Scaled people delta.
 * @param {number} pts Pop-point delta.
 */
function addBoth(peopleMap, ptsMap, id, people, pts) {
  add(peopleMap, id, people);
  add(ptsMap, id, pts);
}

/**
 * The cumulative cross-civ migration flows (src→dest people), for the network visualization.
 * @returns {{src:number, dest:number, people:number}[]} Flow edges (people > 0).
 */
/**
 * Coerce a stored flow value to a per-cause map (tolerating the older flat-number shape).
 * @param {*} v Stored value.
 * @returns {Record<string,number>} Per-cause map.
 */
function asCauseMap(v) {
  if (v && typeof v === "object") return v;
  return typeof v === "number" ? { other: v } : {};
}

/**
 * Sum a per-cause map's values.
 * @param {Record<string,number>} m Map.
 * @returns {number} Total.
 */
function sumCauses(m) {
  let total = 0;
  for (const k of Object.keys(m)) total += m[k] || 0;
  return total;
}

/**
 * Parse one stored flow entry into a flow record (people + points + the origin/destination city),
 * or null. Handles the city-keyed shape "srcCiv>destCiv>srcCity>destCity" AND the older civ-only
 * "srcCiv>destCiv" (city names default to ""), and tolerates the flat-number cause shape.
 * @param {string} key The flow key.
 * @param {*} v The stored people value (number, or a per-cause map).
 * @param {*} [vPts] The stored pop-point value (per-cause map), if any.
 * @returns {*} Record {src, dest, srcCity, destCity, people, points, byCause} or null.
 */
function flowEntry(key, v, vPts) {
  const parts = key.split(">");
  const src = parseInt(parts[0], 10);
  const dest = parseInt(parts[1], 10);
  if (!isFinite(src) || !isFinite(dest)) return null;
  const srcCity = parts[2] || "";
  const destCity = parts.slice(3).join(">") || ""; // tolerate a ">" in a destination city name
  const byCause = asCauseMap(v);
  const people = sumCauses(byCause);
  const points = sumCauses(asCauseMap(vPts));
  return people > 0 ? { src, dest, srcCity, destCity, people, points, byCause } : null;
}

// Cap on retained flow snapshots (decimated to a spread when exceeded). Sized so even the finest
// setting (a snapshot every turn) stays bounded in the save; finer than ~96 is decimated.
const MAX_FLOW_SNAPSHOTS = 96;

// Cap on distinct city-pair edges in the CUMULATIVE flow matrices (s.flows / s.flowsPts). Unlike the
// snapshot + disaster caps, these were append-only and unbounded — a very long game could grow the
// persisted blob until a GameConfiguration setValue silently truncates/drops it (both load + save
// swallow exceptions), losing the WHOLE tally. When exceeded, evict the LOWEST-volume edges (smallest
// people totals — the least informative), with hysteresis so we don't re-sort every pass.
const MAX_FLOW_KEYS = 4000; // ceiling; capFlows (emigration-flow-history.js) evicts the smallest edges

/**
 * The current age-local game turn, defaulting to 0 off-engine.
 * @returns {number} Game.turn or 0.
 */
function gameTurn() {
  try {
    return typeof Game !== "undefined" && typeof Game.turn === "number" ? Game.turn : 0;
  } catch (_) {
    return 0;
  }
}

/**
 * The current turn's in-game date string (e.g. "4000 BC"), or "" off-engine. Same engine call the
 * base UI clock + the Demographics mod use; it only reports the CURRENT turn, so we stamp it onto
 * each snapshot as it is taken.
 * @returns {string} The date label.
 */
function gameTurnDate() {
  try {
    return typeof Game !== "undefined" && typeof Game.getTurnDate === "function" ? Game.getTurnDate() : "";
  } catch (_) {
    return "";
  }
}

/**
 * The current age type (e.g. "AGE_ANTIQUITY"), or "" off-engine / mid-transition.
 * @returns {string} Age type key.
 */
function currentAge() {
  try {
    if (typeof Game === "undefined" || Game.age === undefined) return "";
    if (typeof GameInfo === "undefined" || typeof GameInfo?.Ages?.lookup !== "function") return "";
    const row = GameInfo.Ages.lookup(Game.age);
    return row && row.AgeType ? row.AgeType : "";
  } catch (_) {
    return "";
  }
}

/**
 * The next monotonic cross-age chart turn given the prior chart state. Same age advances by the
 * age-local delta; an age boundary continues from the running chartTurn (so ages never overlap).
 * @param {MigStatsState} s State.
 * @param {string} age Current age.
 * @param {number} localTurn Current age-local turn.
 * @returns {number} The monotonic chartTurn.
 */
function nextChartTurn(s, age, localTurn) {
  if (!s.flowHistory.length) return localTurn;
  if (age === s.chartAge) return s.chartTurn + Math.max(0, localTurn - s.chartLocal);
  return s.chartTurn + Math.max(1, localTurn);
}

/**
 * Per-civ NATIVE population in pop-points right now, for the timeline's real population history. Sums
 * each civ's current city populations (s.cityPts, refreshed by accountLosses earlier this pass — see
 * emigration-main.js, which runs it before recordMigrations) and subtracts cumulative immigrant points
 * (s.inPts), clamped ≥ 0 — mirroring the live gatherPops native fraction so a frame's totals reconcile
 * with the current snapshot. City keys are "owner:localId", so the leading integer is the owner.
 * @param {MigStatsState} s State.
 * @returns {Record<number, number>} civId → native pop points.
 */
function nativePtsByCiv(s) {
  /** @type {Record<number, number>} */
  const total = {};
  for (const key of Object.keys(s.cityPts)) {
    const owner = parseInt(key, 10);
    if (!isFinite(owner)) continue;
    total[owner] = (total[owner] || 0) + (s.cityPts[key] || 0);
  }
  /** @type {Record<number, number>} */
  const native = {};
  for (const k of Object.keys(total)) native[+k] = Math.max(0, total[+k] - (s.inPts[+k] || 0));
  return native;
}

/**
 * Snapshot the cumulative flows for the timeline as a per-interval DELTA (P0.3): within an interval the open
 * (last) frame is kept current in place; at an interval/age boundary a new open frame is appended. The open
 * frame's delta = live cumulative (`s.flows`) − the cumulative of all prior frozen frames; over the cap, adjacent
 * deltas merge (summed). Also stamps the open frame's per-civ native `pop` (nativePtsByCiv) for real pop history.
 * @param {MigStatsState} s State.
 */
function snapshotFlows(s) {
  const turn = gameTurn();
  // Minor/Polish #9: mid-transition `currentAge()` returns "", which nextChartTurn would treat as
  // an age boundary (age !== chartAge) and stamp a spurious boundary marker in the timeline. Reuse
  // the last valid age so the phantom boundary is deferred until the new age actually resolves.
  const age = currentAge() || s.chartAge;
  const ct = nextChartTurn(s, age, turn);
  const interval = getSnapshotInterval();
  const h = s.flowHistory;
  const last = h[h.length - 1];
  // The monotonic chartTurn keeps age-local turn resets from colliding/reordering.
  const newFrame = !(last && age === last.age && ct - last.chartTurn < interval);
  if (newFrame) h.push({ turn, age, chartTurn: ct, year: gameTurnDate(), delta: {} });
  // Recompute the open frame's delta = live cumulative − cumulative of all prior frozen frames.
  const open = h[h.length - 1];
  open.delta = subtractFlows(s.flows, sumDeltas(h.slice(0, h.length - 1)));
  open.turn = turn;
  open.year = gameTurnDate();
  // Stamp the open frame with the CURRENT per-civ native populations (a point-in-time snapshot, kept
  // current until a new frame opens) so the timeline shows REAL population growth, not a linear scale
  // of today's figures back over history.
  open.pop = nativePtsByCiv(s);
  if (newFrame && h.length > MAX_FLOW_SNAPSHOTS) {
    s.flowHistory = mergeAdjacentDeltas(h, MAX_FLOW_SNAPSHOTS);
  }
  s.chartTurn = ct;
  s.chartAge = age;
  s.chartLocal = turn;
}

/**
 * The flow history as a list of {turn, age, year, chartTurn, edges} frames (oldest → newest),
 * spanning ages. Each frame's edges are the CUMULATIVE network at that point, reconstructed by
 * summing deltas up to and including the frame (P0.3) , so the timeline-scrubber consumer is
 * unchanged. Each edge's per-cause map is cloned per frame so the running accumulator never aliases
 * an earlier frame's data.
 * @returns {{turn:number, age:string, year:string, chartTurn:number, edges:*[]}[]} Timeline frames.
 */
export function migrationFlowHistory() {
  const h = load().flowHistory || [];
  /** @type {Record<string, Record<string, number>>} */
  const running = {};
  return h.map((snap) => {
    addFlows(running, snap.delta || {});
    return {
      turn: snap.turn,
      age: snap.age || "",
      year: snap.year || "",
      chartTurn: snap.chartTurn,
      // Per-civ native pop points snapshotted at this frame (absent on pre-population-history saves);
      // the consumer uses it for REAL growth and falls back to a scaled estimate when missing.
      pop: snap.pop || null,
      edges: Object.keys(running)
        .map((k) => flowEntry(k, Object.assign({}, running[k])))
        .filter(Boolean)
    };
  });
}

/**
 * The latest monotonic cross-age turn (for historical population scaling), 0 before any snapshot.
 * @returns {number} Monotonic turn.
 */
export function monoTurn() {
  return load().chartTurn || 0;
}

export function migrationFlows() {
  const s = load();
  const f = s.flows || {};
  const fp = s.flowsPts || {};
  /** @type {*[]} */
  const out = [];
  for (const key of Object.keys(f)) {
    const e = flowEntry(key, f[key], fp[key]);
    if (e) out.push(e);
  }
  return out;
}

/**
 * Net mod population-point change this turn per "owner|cityName" key, from the pass's migrations:
 * arrivals add points to the destination, departures/attrition remove them from the source. This is
 * what the mod itself did to each city, so it can be subtracted from the observed change.
 * @param {*[]} migs This turn's migrations.
 * @returns {Record<string, number>} Net points per owner|city.
 */
function modPointsByCity(migs) {
  /** @type {Record<string, number>} */
  const map = {};
  for (const m of migs || []) {
    const pts = m.points || 0;
    if (typeof m.srcOwner === "number") {
      const k = m.srcOwner + "|" + m.srcName;
      map[k] = (map[k] || 0) - pts;
    }
    if (typeof m.destOwner === "number") {
      const k = m.destOwner + "|" + m.destName;
      map[k] = (map[k] || 0) + pts;
    }
  }
  return map;
}

/**
 * Credit a city's unexplained pop-point loss to its civ , in raw points and in scaled people
 * (valued the same way migration counts are). No-op for a non-positive drop.
 * @param {MigStatsState} s State.
 * @param {number} owner Civ id.
 * @param {number} prev Last-turn population (points).
 * @param {number} lossPts Unexplained pop-point drop.
 * @param {number} t Monotonic turn (for the historical scaling).
 */
function creditLoss(s, owner, prev, lossPts, t) {
  if (lossPts <= 0) return;
  const people = scaleCityPopulation(prev, t) - scaleCityPopulation(Math.max(0, prev - lossPts), t);
  if (people > 0) addBoth(s.losses, s.lossesPts, owner, people, lossPts);
}

/**
 * Fold one city's external loss into the tally and record its current population + name into `acc`.
 * @param {MigStatsState} s State.
 * @param {*} sig City signal.
 * @param {Record<string,number>} mod Per-city net mod points this turn.
 * @param {number} t Monotonic turn.
 * @param {{pts:Record<string,number>, names:Record<string,string>}} acc This turn's per-city pop +
 *   name accumulator (becomes the next baseline).
 */
function foldCityLoss(s, sig, mod, t, acc) {
  if (typeof sig.owner !== "number" || !sig.key) return;
  const cur = sig.population || 0;
  acc.pts[sig.key] = cur;
  acc.names[sig.key] = cityName(sig.city);
  const prev = s.cityPts[sig.key];
  if (typeof prev !== "number") return; // first sighting , baseline only
  creditLoss(s, sig.owner, prev, prev + (mod[sig.owner + "|" + acc.names[sig.key]] || 0) - cur, t);
}

// Cities razed since the last accounting (CityRemovedFromMap). Session-transient: a flag lost to a
// save/load just means that one razing isn't credited (harmless), never a false loss.
const pendingRemoved = new Set();

/**
 * Flag a razed city (CityRemovedFromMap) so the next accounting credits its residual population as
 * a loss. Razing is distinct from conquest (CityTransfered), so it never fires on a captured city.
 * @param {*} cityID The removed city's ComponentID ({owner, id}).
 */
export function markCityRemoved(cityID) {
  if (cityID && typeof cityID.owner === "number") pendingRemoved.add(cityID.owner + ":" + cityID.id);
}

/**
 * Credit the residual population of each city razed this window as a loss , the people who were
 * still there when the city was destroyed. Uses prev + (this turn's mod departures) so the refugees
 * who already fled (counted in Out) and everything lost earlier (already in prev) are NOT
 * double-counted. Skips keys still present (a stale flag).
 * @param {MigStatsState} s State.
 * @param {Record<string,number>} mod Per-city net mod points this turn.
 * @param {number} t Monotonic turn.
 * @param {{pts:Record<string,number>}} acc This turn's per-city populations.
 */
function foldRemovedLosses(s, mod, t, acc) {
  for (const key of pendingRemoved) {
    pendingRemoved.delete(key);
    const prev = s.cityPts[key];
    if (typeof prev !== "number" || acc.pts[key] != null) continue; // unknown, or still on the map
    const owner = parseInt(key, 10);
    creditLoss(s, owner, prev, prev + (mod[owner + "|" + (s.cityNames[key] || "")] || 0), t);
  }
}

/**
 * Re-baseline one city into `acc` (current population + name) WITHOUT crediting any loss , used on
 * the first accounting after an age transition so an age-driven population drop on a kept
 * settlement isn't misread as an unexplained external loss (P0.2).
 * @param {*} sig City signal.
 * @param {{pts:Record<string,number>, names:Record<string,string>}} acc Baseline accumulator.
 */
function rebaselineCity(sig, acc) {
  if (typeof sig.owner !== "number" || !sig.key) return;
  acc.pts[sig.key] = sig.population || 0;
  acc.names[sig.key] = cityName(sig.city);
}

/**
 * Detect EXTERNAL population loss this turn and fold it into the per-civ `losses` tally. For each
 * visible city: any drop beyond what the mod itself moved/removed (starvation / plague / disasters)
 * is scaled the same way migration counts are and credited to its civ; razed cities credit their
 * residual via CityRemovedFromMap. Conservative , births can mask a loss (under-count), and a city
 * that merely left vision is re-baselined (never a loss). Runs every turn; never throws.
 *
 * Age-transition guard (P0.2): ages reduce/convert kept settlements, so the first accounting in a
 * new age (or any pass taken mid-transition while `currentAge()` is "") only RE-BASELINES the
 * per-city populations and credits no loss , otherwise the age-driven drop on every preserved city
 * would spike the Losses ledger column. `lossAge` tracks the age independently of `chartAge` so the
 * guard is immune to whether recordMigrations or accountLosses runs first on the boundary turn.
 * @param {*[]} signals Current city signals ({key, owner, city, population}).
 * @param {*[]} migs This turn's migrations (may be empty).
 */
export function accountLosses(signals, migs) {
  const s = load();
  const age = currentAge();
  // Transition = a resolved age change, or a mid-transition pass (age === "").
  const transition = age === "" || (s.lossAge !== "" && age !== s.lossAge);
  /** @type {{pts:Record<string,number>, names:Record<string,string>}} */
  const acc = { pts: {}, names: {} };
  if (transition) {
    for (const sig of signals || []) rebaselineCity(sig, acc);
    pendingRemoved.clear(); // age-removed settlements aren't razings , don't credit them as losses
  } else {
    const t = s.chartTurn || gameTurn();
    const mod = modPointsByCity(migs);
    for (const sig of signals || []) foldCityLoss(s, sig, mod, t, acc);
    foldRemovedLosses(s, mod, t, acc); // razed cities: credit the residual (no double-count)
  }
  s.cityPts = acc.pts; // cities merely out of vision drop out (no loss inferred from absence)
  s.cityNames = acc.names;
  if (age !== "") s.lossAge = age; // arm the guard only once a real age has resolved
  save();
}

// Cap on retained disaster-onset events (oldest dropped past the cap). Bounded so the marker log
// stays small in the save; the refugees chart only annotates notable events.
const MAX_DISASTER_EVENTS = 64;

/**
 * Record a notable disaster onset for the refugees-chart timeline: stamp the current age-local turn,
 * age, in-game year, and the event's name/severity, then persist (capped). Called as each event fires
 * (from emigration-events), so the year is the turn the disaster actually struck.
 * @param {string} name The disaster's display name (e.g. "Volcano").
 * @param {number} [severity] The event severity.
 */
export function recordDisasterEvent(name, severity) {
  const s = load();
  s.disasterEvents.push({
    turn: gameTurn(),
    age: currentAge() || s.chartAge,
    year: gameTurnDate(),
    name: typeof name === "string" ? name : "",
    severity: typeof severity === "number" ? severity : 0
  });
  if (s.disasterEvents.length > MAX_DISASTER_EVENTS) {
    s.disasterEvents = s.disasterEvents.slice(s.disasterEvents.length - MAX_DISASTER_EVENTS);
  }
  save();
}

/**
 * Fold a pass's migrations into the cumulative tallies AND take the per-interval timeline snapshot.
 * Call it every pass, including passes with no migration: the snapshot still records each civ's
 * population (for the timeline's growth history), while the migration-only work (recent feed, net
 * distribution log) is skipped when there's nothing to fold.
 * @param {{srcOwner?:number, destOwner?:number, people:number, cause?:string}[]} migs Migrations (may be empty).
 */
export function recordMigrations(migs) {
  const s = load();
  const list = Array.isArray(migs) ? migs : [];
  for (const m of list) foldMigration(s, m);
  capFlows(s.flows, s.flowsPts, MAX_FLOW_KEYS); // bound the cumulative city-pair matrices before persist
  // Snapshot EVERY pass (self-gated to the snapshot interval inside), not only when migration
  // happened — so the timeline records per-civ population growth from turn one and is available to
  // scrub/play before any emigration occurs. The migration-only side effects stay gated on `list`.
  snapshotFlows(s);
  if (list.length) {
    pushRecent(list);
    logNetDistribution(s, list);
  }
  save();
}

/**
 * Debug-only: log the net-migration distribution across civs (cumulative points + scaled people) and
 * this pass's per-record phases, so we can see whether any civ is net-POSITIVE or whether arrivals
 * are failing (departures debit a source, but a destroyed-destination arrival credits no one). Grep
 * `EMIG_netdist` in UI.log.
 * @param {MigStatsState} s State.
 * @param {*[]} migs This pass's migrations.
 */
function logNetDistribution(s, migs) {
  try {
    const ids = new Set([...Object.keys(s.cumPts || {}), ...Object.keys(s.cum || {})]);
    const parts = [];
    for (const pid of ids) {
      const pts = Math.round(s.cumPts[pid] || 0);
      const ppl = Math.round(s.cum[pid] || 0);
      if (pts !== 0 || ppl !== 0) parts.push("c" + pid + ":pts=" + pts + ",ppl=" + ppl);
    }
    const phases = migs.map(m => (m.phase || "?") + (m.crossCiv ? "X" : "") + ">"
      + (typeof m.srcOwner === "number" ? m.srcOwner : "-") + "/"
      + (typeof m.destOwner === "number" ? m.destOwner : "-")).join(" ");
    dlog("netdist [" + (parts.join(" ") || "all-zero") + "] thisPass: " + phases);
  } catch (_) {
    /* diagnostics must never break a pass */
  }
}

/**
 * Bank one turn's stance-impact deltas into the cumulative tally (people + pop-points in parallel).
 * @param {Record<number, {inP:number, outP:number, inPts:number, outPts:number}>} delta Per-owner
 *   signed deltas vs a neutral-borders world.
 */
export function recordStanceImpact(delta) {
  const keys = delta ? Object.keys(delta) : [];
  if (!keys.length) return;
  const s = load();
  for (const k of keys) {
    const d = delta[+k];
    if (!d) continue;
    addBoth(s.stanceIn, s.stanceInPts, +k, d.inP || 0, d.inPts || 0);
    addBoth(s.stanceOut, s.stanceOutPts, +k, d.outP || 0, d.outPts || 0);
  }
  save();
}

/**
 * A civ's cumulative border-stance impact: people (+ pop-points) its policy added/blocked on
 * immigration IN, and kept/released on emigration OUT (signed). Zero when it holds no stance.
 * @param {number} id Player id.
 * @returns {{in:number, out:number, inPts:number, outPts:number}} Signed impact.
 */
export function stanceImpactFor(id) {
  const s = load();
  return {
    in: s.stanceIn[id] || 0, out: s.stanceOut[id] || 0,
    inPts: s.stanceInPts[id] || 0, outPts: s.stanceOutPts[id] || 0
  };
}

/**
 * Append a pass's moves to the in-memory recent ring (newest last), trimmed to RECENT_CAP.
 * @param {{srcOwner?:number, destOwner?:number, people?:number, cause?:string}[]} migs Migrations.
 */
function pushRecent(migs) {
  for (const m of migs) _recent.push(m);
  if (_recent.length > RECENT_CAP) _recent = _recent.slice(_recent.length - RECENT_CAP);
}

/**
 * The most recent moves involving a player (newest first), from the session-local ring. Drives the
 * live "why am I gaining/losing people?" feed; empty after a reload until new moves occur.
 * @param {number} pid Player id.
 * @param {number} [limit] Max entries to return (default 10).
 * @returns {{srcOwner?:number, destOwner?:number, people?:number, cause?:string}[]} Recent moves.
 */
export function recentEventsFor(pid, limit = 10) {
  const out = [];
  for (let i = _recent.length - 1; i >= 0 && out.length < limit; i--) {
    const m = _recent[i];
    if (m.srcOwner === pid || m.destOwner === pid) out.push(m);
  }
  return out;
}

/**
 * Cumulative → per-sample delta for a metric, advancing its watermark.
 * @param {Record<string,number>} cumMap Cumulative map.
 * @param {Record<string,number>} wm Watermark map.
 * @param {number} pid Player id.
 * @returns {number} Flow since the last sample.
 */
function sampleDelta(cumMap, wm, pid) {
  const cur = cumMap[pid] || 0;
  const prev = wm[pid] || 0;
  wm[pid] = cur;
  return cur - prev;
}

/**
 * Net migration for a player since last sampled (the per-sample net flow).
 * @param {number} id A player id.
 * @returns {number} Net people (positive = net immigration).
 */
export function netDeltaForPlayer(id) {
  const s = load();
  return sampleDelta(s.cum, s.lastSampled, id);
}

/**
 * Gross emigration for a player this sample.
 * @param {number} pid Player id.
 * @returns {number} People who left.
 */
export function sampleOut(pid) {
  const s = load();
  return sampleDelta(s.out, s.wmOut, pid);
}

/**
 * Gross immigration for a player this sample.
 * @param {number} pid Player id.
 * @returns {number} People who arrived.
 */
export function sampleIn(pid) {
  const s = load();
  return sampleDelta(s.in, s.wmIn, pid);
}

/**
 * The cumulative refugees a civ has produced (read-only; does not advance a watermark).
 * @param {number} id Player id.
 * @returns {number} Cumulative refugees.
 */
export function refugeesFor(id) {
  return load().refugees[id] || 0;
}

/**
 * Refugees a civ produced THIS sample (per-turn delta of the cumulative total). Advances its own
 * watermark, so only one consumer (the Demographics per-turn refugees graph) should read it.
 * @param {number} id Player id.
 * @returns {number} Refugees produced this turn.
 */
export function sampleRefugees(id) {
  const s = load();
  return sampleDelta(s.refugees, s.wmRefugees, id);
}

/**
 * The cumulative refugees a civ has RECEIVED (war/disaster/conquest arrivals; read-only).
 * @param {number} id Player id.
 * @returns {number} Cumulative refugees received.
 */
export function refugeesInFor(id) {
  return load().refugeesIn[id] || 0;
}

/**
 * Refugees a civ received THIS sample (per-turn delta of the cumulative total). Advances its own
 * watermark, so only one consumer (the Demographics per-turn graph) should read it.
 * @param {number} id Player id.
 * @returns {number} Refugees received this turn.
 */
export function sampleRefugeesIn(id) {
  const s = load();
  return sampleDelta(s.refugeesIn, s.wmRefugeesIn, id);
}

/**
 * Per-cause emigration breakdown for a player (cumulative, read-only).
 * @param {number} pid Player id.
 * @returns {Record<string, number>} Emigration sample by cause this turn.
 */
export function emigrationByCause(pid) {
  return load().outByCause[pid] || {};
}

/**
 * Per-cause immigration breakdown for a player (cumulative, read-only).
 * @param {number} pid Player id.
 * @returns {Record<string, number>} Immigration by cause.
 */
export function immigrationByCause(pid) {
  return load().inByCause[pid] || {};
}

/**
 * Per-cause emigration sample delta for a player this turn.
 * @param {number} pid Player id.
 * @returns {Record<string, number>} Emigration sample by cause.
 */
export function sampleOutByCause(pid) {
  const s = load();
  const out = s.outByCause[pid] || {};
  if (!s.wmOutByCause[pid]) s.wmOutByCause[pid] = {};
  const wmRef = s.wmOutByCause[pid];
  /** @type {Record<string, number>} */
  const result = {};
  for (const cause in out) {
    const cur = out[cause] || 0;
    const prev = wmRef[cause] || 0;
    wmRef[cause] = cur;
    result[cause] = cur - prev;
  }
  return result;
}

/**
 * Per-cause immigration sample delta for a player this turn.
 * @param {number} pid Player id.
 * @returns {Record<string, number>} Immigration sample by cause.
 */
export function sampleInByCause(pid) {
  const s = load();
  const inn = s.inByCause[pid] || {};
  if (!s.wmInByCause[pid]) s.wmInByCause[pid] = {};
  const wmRef = s.wmInByCause[pid];
  /** @type {Record<string, number>} */
  const result = {};
  for (const cause in inn) {
    const cur = inn[cause] || 0;
    const prev = wmRef[cause] || 0;
    wmRef[cause] = cur;
    result[cause] = cur - prev;
  }
  return result;
}

// Expose per-civ cumulative tallies for the Demographics war tooltip + the feedback layer
// (read-only; cumulative so reads don't disturb the graph sample watermarks).
try {
  /** @type {*} */ (globalThis).EmigrationData = {
    grossOutCumFor: (/** @type {number} */ pid) => load().out[pid] || 0,
    grossInCumFor: (/** @type {number} */ pid) => load().in[pid] || 0,
    refugeesCumFor: (/** @type {number} */ pid) => load().refugees[pid] || 0,
    refugeesInCumFor: (/** @type {number} */ pid) => load().refugeesIn[pid] || 0,
    deathsCumFor: (/** @type {number} */ pid) => load().deaths[pid] || 0,
    externalLossesCumFor: (/** @type {number} */ pid) => load().losses[pid] || 0,
    // Parallel raw-pop-point reads (exact Civ population numbers).
    grossOutPtsFor: (/** @type {number} */ pid) => load().outPts[pid] || 0,
    grossInPtsFor: (/** @type {number} */ pid) => load().inPts[pid] || 0,
    refugeesPtsFor: (/** @type {number} */ pid) => load().refugeesPts[pid] || 0,
    refugeesInPtsFor: (/** @type {number} */ pid) => load().refugeesInPts[pid] || 0,
    deathsPtsFor: (/** @type {number} */ pid) => load().deathsPts[pid] || 0,
    externalLossesPtsFor: (/** @type {number} */ pid) => load().lossesPts[pid] || 0,
    netPtsFor: (/** @type {number} */ pid) => load().cumPts[pid] || 0,
    netCumFor: (/** @type {number} */ pid) => load().cum[pid] || 0,
    // Border-stance impact (signed): people/points the policy added or blocked, in and out.
    stanceImpactFor: (/** @type {number} */ pid) => stanceImpactFor(pid),
    // Per-cause breakdowns for tooltip attribution
    emigrationByCauseFor: (/** @type {number} */ pid) => emigrationByCause(pid),
    immigrationByCauseFor: (/** @type {number} */ pid) => immigrationByCause(pid),
    // The per-city readout view-model + the session-local recent-moves feed (Phase 0 data core).
    citySnapshot: (/** @type {*} */ cityId) => citySnapshot(cityId),
    recentEventsFor: (/** @type {number} */ pid, /** @type {number=} */ limit) =>
      recentEventsFor(pid, limit),
    // Cross-civ flow matrix (src→dest people) for the migration-network visualization.
    flows: () => migrationFlows(),
    // Decimated cumulative-flow history (timeline frames) for the network scrubber.
    flowHistory: () => migrationFlowHistory(),
    // Notable disaster onsets (copy), for the Demographics refugees-chart event markers.
    disasterEvents: () => (load().disasterEvents || []).slice()
  };
} catch (_) {
  /* ignore */
}
