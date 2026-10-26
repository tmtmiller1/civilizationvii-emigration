// emigration-displaced.js
//
// The displaced strip's model (the Settlements tab): for each of the local player's settlements that people fled,
// where those people are
// now (which of our settlements, which foreign cities), since when, whether and when they come home on their own
// (emigration-homecoming.js), what a returnee is worth (the yields of a rural tile at home, read off the tiles the
// city works), and what it costs to hasten them or to call people back from abroad, with the gamble's expected
// cost per person who actually comes. Pure given its seams; the defaults read the live game.

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { CALL_HOME_CURRENCY, CALL_HOME_SCOPE, callHomeCandidates, callHomeChance, callHomeCost }
  from "/emigration/ui/emigration-call-home.js";
import { callHomeCooldownLeft, callHomeResolvable } from "/emigration/ui/emigration-call-home-action.js";
import { homecomingStatus, batchFor } from "/emigration/ui/emigration-homecoming.js";
import { migrationFlowHistory } from "/emigration/ui/emigration-migration-stats.js";
import { isRefugeeCause } from "/emigration/ui/emigration-causes.js";
import { listDepartureTiles } from "/emigration/ui/emigration-departure-tile.js";
import { civName } from "/emigration/ui/emigration-naming.js";
import { lostTilesFor } from "/emigration/ui/emigration-lost-tiles.js";
import { assimilationCostFor } from "/emigration/ui/emigration-effects.js";

/** The yields a rural tile is read for, in the order they are shown. */
export const TILE_YIELDS = ["YIELD_FOOD", "YIELD_PRODUCTION", "YIELD_GOLD", "YIELD_SCIENCE", "YIELD_CULTURE",
  "YIELD_HAPPINESS"];

/**
 * @typedef {Object} DisplacedDeps Test seams; each defaults to the live game.
 * @property {(pid:number)=>{internal:*[], external:*[]}} [candidates] Pairs still away.
 * @property {(pid:number)=>(pair:*)=>boolean} [resolvable] Whether both cities of a pair still stand.
 * @property {(pid:number, home:string)=>*} [homecoming] The homecoming status of one home.
 * @property {(pid:number)=>Record<string, number>} [firstTurns] The turn people first fled each home.
 * @property {(pid:number, home:string)=>Record<string, number>|null} [tileYields] A rural tile's yields at home.
 * @property {(pid:number, scope:string, home?:string)=>number} [cooldown] Turns before the next paid call of that kind
 *   (per settlement for the internal call).
 * @property {(host:number)=>string} [civ] A host civ's name.
 * @property {(pid:number, home:string)=>{t:string, p:number}[]} [lostTiles] The tiles departures tore down.
 */

/**
 * @typedef {Object} DisplacedRow One home settlement.
 * @property {string} home
 * @property {boolean} held Whether we still hold it.
 * @property {number} total Population points away from it.
 * @property {{from:string, points:number, tile:Record<string, number>|null}[]} internal In our own settlements, with
 *   what a rural tile there yields (what a returnee leaves behind).
 * @property {{from:string, host:number, civ:string, points:number}[]} abroad Under other rulers.
 * @property {number|null} since The turn people first fled it, when known.
 * @property {{type:string, count:number}[]} lost The improvements departures tore down, most first.
 * @property {{calm:number, needed:number, every:number, nextIn:number, allIn:number, batch:number}|null} wait The free
 *   homecoming: calm turns so far and needed, turns to the next return and to the last.
 * @property {{perTile:Record<string, number>, total:number}|null} tile What a rural tile at home yields.
 * @property {{n:number, gold:number, influence:number, cooldown:number}|null} hasten The paid internal call.
 * @property {{n:number, gold:number, influence:number, chance:number, expected:number, perGold:number,
 *   perInfluence:number, cooldown:number}|null} abroadCall The paid call abroad and its expected cost.
 */

/** @param {DisplacedDeps} [d] @returns {Required<DisplacedDeps>} */
function withDefaults(d) {
  return {
    candidates: (pid) => callHomeCandidates(pid), resolvable: callHomeResolvable, homecoming: homecomingStatus,
    firstTurns: liveFirstTurns, tileYields: liveTileYields, cooldown: callHomeCooldownLeft, civ: civName,
    lostTiles: lostTilesFor, ...(d || {})
  };
}

/**
 * The turn each of a civ's settlements first lost people to a refugee cause, from the flow history frames.
 * @param {number} pid @returns {Record<string, number>}
 */
function liveFirstTurns(pid) {
  /** @type {Record<string, number>} */
  const out = {};
  try {
    for (const frame of migrationFlowHistory()) {
      for (const e of frame.edges || []) {
        if (e.src !== pid || !e.srcCity || e.srcCity in out) continue;
        const fled = Object.entries(e.byCause || {}).some(([c, n]) => isRefugeeCause(c) && Number(n) > 0);
        if (fled) out[e.srcCity] = frame.turn;
      }
    }
  } catch (_) {
    /* no history */
  }
  return out;
}

/** @param {number} pid @param {string} name @returns {*} The civ's city of that name, or null. */
function cityNamed(pid, name) {
  try {
    for (const c of Players.get(pid)?.Cities?.getCities?.() || []) {
      if ((typeof Locale !== "undefined" ? Locale.compose(c.name) : c.name) === name) return c;
    }
  } catch (_) {
    /* unreadable */
  }
  return null;
}

/**
 * What one rural tile at a settlement yields: the average over the rural improvements it works, read off the map
 * the way the game does for the owner. Null when the city or the map can't be read, or it works no rural tile.
 * @param {number} pid @param {string} home @returns {Record<string, number>|null}
 */
function liveTileYields(pid, home) {
  try {
    const city = cityNamed(pid, home);
    const tiles = city ? listDepartureTiles(city) : [];
    if (!tiles.length || typeof GameplayMap === "undefined" || typeof YieldTypes === "undefined") return null;
    /** @type {Record<string, number>} */
    const avg = {};
    for (const y of TILE_YIELDS) {
      const total = tiles.reduce((n, t) => n + plotYield(t.plot, y, pid), 0);
      avg[y] = Math.round((total / tiles.length) * 10) / 10;
    }
    return avg;
  } catch (_) {
    return null;
  }
}

/** @param {number} plot @param {string} y A YieldTypes key. @param {number} pid @returns {number} */
function plotYield(plot, y, pid) {
  const l = GameplayMap.getLocationFromIndex(plot);
  return Number(GameplayMap.getYield(l.x, l.y, YieldTypes[y], pid)) || 0;
}

/**
 * The free homecoming's timing for one home: turns to the next return and to the last, given the calm so far.
 * @param {{calm:number, needed:number, every:number, last:number|null, turn:number}} st Homecoming status.
 * @param {number} away Population points still away in our own settlements.
 * @returns {{calm:number, needed:number, every:number, nextIn:number, allIn:number, batch:number}} `batch` is
 *   how many the next return brings.
 */
export function waitFor(st, away) {
  const calm = Math.max(0, Number(st.calm) || 0);
  const needed = Math.max(1, Number(st.needed) || 1);
  const every = Math.max(1, Number(st.every) || 1);
  let nextIn;
  if (calm < needed) nextIn = needed - calm;
  else if (st.last == null) nextIn = 0;
  else nextIn = Math.max(0, every - (Number(st.turn) - Number(st.last)));
  // Each return brings a batch that shrinks as fewer are away; count the returns until nobody is.
  let left = Math.max(0, away);
  let returns = 0;
  while (left > 0 && returns < 1000) {
    left -= batchFor(left);
    returns++;
  }
  return { calm, needed, every, nextIn, allIn: nextIn + Math.max(0, returns - 1) * every, batch: batchFor(away) };
}

/**
 * The paid call abroad for a home: the largest call the cap allows, its price in each currency, the odds, how many
 * are expected to come, and what that makes each person who comes cost.
 * @param {number} n Points to call. @param {number} cooldown Turns before the next call abroad.
 * @returns {DisplacedRow["abroadCall"]}
 */
export function abroadCallFor(n, cooldown) {
  if (!(n > 0)) return null;
  const chance = callHomeChance(CALL_HOME_SCOPE.EXTERNAL);
  const expected = n * chance;
  const gold = callHomeCost(n, CALL_HOME_SCOPE.EXTERNAL, CALL_HOME_CURRENCY.GOLD);
  const influence = callHomeCost(n, CALL_HOME_SCOPE.EXTERNAL, CALL_HOME_CURRENCY.INFLUENCE);
  const per = (/** @type {number} */ c) => (expected > 0 ? Math.round(c / expected) : 0);
  return { n, gold, influence, chance, expected: Math.round(expected * 10) / 10, perGold: per(gold),
    perInfluence: per(influence), cooldown };
}

/**
 * Lost improvements by type, most first.
 * @param {{t:string}[]} tiles @returns {{type:string, count:number}[]}
 */
export function lostSummary(tiles) {
  /** @type {Map<string, number>} */
  const by = new Map();
  for (const e of tiles || []) if (e && e.t) by.set(e.t, (by.get(e.t) || 0) + 1);
  return [...by.entries()].map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
}

/**
 * What newcomers cost the civ this turn while they settle in: the integration load's Gold and Happiness.
 * @param {number} pid @param {(pid:number)=>{load:number, gold:number, happiness:number}} [costs] Test seam.
 * @returns {{gold:number, happiness:number}|null} Null when nobody is settling in.
 */
export function newcomerCosts(pid, costs) {
  try {
    const c = (costs || assimilationCostFor)(pid);
    if (!c || !(c.load > 0)) return null;
    return { gold: Math.round(c.gold), happiness: Math.round(c.happiness * 10) / 10 };
  } catch (_) {
    return null;
  }
}

/**
 * The Displaced tab's rows for one civ, the home with the most people away first.
 * @param {number} pid The local player. @param {DisplacedDeps} [deps] Test seams.
 * @returns {DisplacedRow[]}
 */
export function displacedModel(pid, deps) {
  const d = withDefaults(deps);
  const cands = d.candidates(pid);
  const ok = d.resolvable(pid);
  /** @type {Map<string, DisplacedRow>} */
  const rows = new Map();
  const row = (/** @type {string} */ home) => {
    let r = rows.get(home);
    if (!r) {
      r = { home, held: true, total: 0, internal: [], abroad: [], since: null, lost: [], wait: null, tile: null,
        hasten: null, abroadCall: null };
      rows.set(home, r);
    }
    return r;
  };
  for (const p of cands.internal) {
    const r = row(p.home);
    r.internal.push({ from: p.from, points: p.points, tile: d.tileYields(pid, p.from) });
    r.total += p.points;
    if (!ok(p)) r.held = false;
  }
  for (const p of cands.external) {
    const r = row(p.home);
    r.abroad.push({ from: p.from, host: p.host, civ: d.civ(p.host) || "", points: p.points });
    r.total += p.points;
  }
  const first = d.firstTurns(pid);
  const cap = Math.max(1, Math.floor(Number(CONFIG.callHomeMaxPointsPerAttempt) || 1));
  for (const r of rows.values()) finishRow(r, pid, first, cap, d);
  return [...rows.values()].sort((a, b) => b.total - a.total || a.home.localeCompare(b.home));
}

/**
 * Fill in a row's timing, worth and prices once its people are counted.
 * @param {DisplacedRow} r @param {number} pid @param {Record<string, number>} first @param {number} cap
 * @param {Required<DisplacedDeps>} d
 */
function finishRow(r, pid, first, cap, d) {
  r.since = r.home in first ? first[r.home] : null;
  r.lost = lostSummary(d.lostTiles(pid, r.home));
  if (!r.held) return;
  const own = r.internal.reduce((n, p) => n + p.points, 0);
  const away = r.abroad.reduce((n, p) => n + p.points, 0);
  const perTile = d.tileYields(pid, r.home);
  if (perTile) {
    r.tile = { perTile, total: Math.round(TILE_YIELDS.reduce((n, y) => n + (perTile[y] || 0), 0) * 10) / 10 };
  }
  if (own > 0) {
    if (CONFIG.homecomingEnabled) r.wait = waitFor(d.homecoming(pid, r.home), own);
    const n = Math.min(cap, own);
    r.hasten = {
      n, gold: callHomeCost(n, CALL_HOME_SCOPE.INTERNAL, CALL_HOME_CURRENCY.GOLD),
      influence: callHomeCost(n, CALL_HOME_SCOPE.INTERNAL, CALL_HOME_CURRENCY.INFLUENCE),
      cooldown: d.cooldown(pid, CALL_HOME_SCOPE.INTERNAL, r.home)
    };
  }
  if (away > 0) r.abroadCall = abroadCallFor(Math.min(cap, away), d.cooldown(pid, CALL_HOME_SCOPE.EXTERNAL));
}
