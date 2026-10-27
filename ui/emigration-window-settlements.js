// emigration-window-settlements.js
//
// The Settlements tab's per-settlement rows, split out of emigration-window.js: each of the local player's
// settlements with its arrivals and departures this age by origin/destination and cause (folded from the age's
// flow edges) and its pressure entry (read off the city readout snapshot).

import { ownerCitySnapshots } from "/emigration/ui/emigration-city-readout-data.js";
import { civAdjective } from "/emigration/ui/emigration-naming.js";
import { loc } from "/emigration/ui/emigration-loc.js";
import { callHomeBalance } from "/emigration/ui/emigration-call-home-action.js";
import { CALL_HOME_CURRENCY } from "/emigration/ui/emigration-call-home.js";
import { intakeUpkeep } from "/emigration/ui/emigration-intake-upkeep.js";

/** @param {Map<string, *>} map @param {string} city */
function cityEntry(map, city) {
  let e = map.get(city);
  if (!e) {
    e = { name: city, in: { civs: {}, causes: {} }, out: { civs: {}, causes: {} } };
    map.set(city, e);
  }
  return e;
}

/**
 * Add one move to a direction accumulator (by other civ + cause). Each civ entry tracks both scaled
 * people and raw Civ population points, so the pie can switch counting modes.
 * @param {*} d Direction {civs, causes}.
 * @param {number} otherOwner The other civ id.
 * @param {string} cause Migration cause.
 * @param {number} people People moved.
 * @param {number} [points] Raw population points moved.
 */
function addDir(d, otherOwner, cause, people, points) {
  const c = d.civs[otherOwner] || (d.civs[otherOwner] = { people: 0, points: 0 });
  c.people += people;
  c.points += points || 0;
  d.causes[cause] = (d.causes[cause] || 0) + people;
}

/**
 * Fold one of the age's flow edges into the settlements it touches, cause by cause. A flow is cumulative since the
 * age began, so a settlement's pies agree with its displaced strip, which reads the same flows; the fifty most
 * recent events, which the cards used to count, had rolled past a departure the strip still showed (the owner,
 * 2026-10-26: "how is it possible that no emigrants left but Shomron has 2 of the pop for Philadelphia").
 * @param {Map<string, *>} map @param {*} f A flow edge {src, dest, srcCity, destCity, people, points, byCause}.
 * @param {number} me
 */
function foldFlow(map, f, me) {
  for (const [cause, ppl, pts] of causeShares(f)) {
    if (f.dest === me && f.destCity) addDir(cityEntry(map, f.destCity).in, f.src, cause, ppl, pts);
    if (f.src === me && f.srcCity) addDir(cityEntry(map, f.srcCity).out, f.dest, cause, ppl, pts);
  }
}

/**
 * A flow's people and points split by cause, in the proportions of its cause map.
 * @param {*} f A flow edge. @returns {[string, number, number][]} [cause, people, points] per cause with people.
 */
function causeShares(f) {
  const by = f.byCause && typeof f.byCause === "object" ? f.byCause : { other: f.people || 0 };
  const total = Object.values(by).reduce((/** @type {number} */ n, v) => n + (Number(v) || 0), 0) || 1;
  /** @type {[string, number, number][]} */
  const out = [];
  for (const cause of Object.keys(by)) {
    const share = (Number(by[cause]) || 0) / total;
    const ppl = (f.people || 0) * share;
    if (ppl > 0) out.push([cause, ppl, (f.points || 0) * share]);
  }
  return out;
}

/**
 * @param {*} d Direction accumulator {civs, causes}. @param {number} me The local player.
 * @param {boolean} inbound Whether this is the arrivals side (names the own-civ slice).
 * @returns {*} { civs: [{id, name, people, points}] sorted, causes }.
 */
function resolveDir(d, me, inbound) {
  const own = inbound
    ? loc("LOC_EMIG_CF_OWN_FROM", "From our own settlements")
    : loc("LOC_EMIG_CF_OWN_TO", "To our own settlements");
  const civs = Object.keys(d.civs)
    .map((k) => ({
      id: +k, people: d.civs[k].people, points: d.civs[k].points,
      // Moves between the player's own settlements are one slice, named for the direction.
      name: +k === me ? own : civAdjective(+k)
    }))
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
  for (const s of me != null ? ownerCitySnapshots(me) : []) map[s.cityName] = pressureEntry(s);
  return map;
}

/**
 * One settlement's pressure entry for the Settlements tab.
 * @param {*} s A CitySnapshot. @returns {*} {bar, cause, dest, flag, mix, stay, enclave}.
 */
function pressureEntry(s) {
  return {
    bar: s.pressureToBar || 0, cause: s.causeLabel || "", dest: s.topDestinationName || "",
    flag: s.attritionRisk ? "at risk" : s.onCooldown ? "resting" : "",
    ...standingOf(s),
    mix: s.causeMix || null, // the weighted "what drives migration" breakdown, for the per-city meter
    // What argues for staying: the settlement's wonders and civic buildings, named.
    stay: Array.isArray(s.stayReasons) ? s.stayReasons : [],
    // The settlement's enclave, if a community from another civilization has one: its stage, the next step and
    // what holds it back (the Settlements tab's Arrived block).
    enclave: s.enclave || null
  };
}

/**
 * The settlement's standing switches and projections: the stalled siege, the intake switch, the forecast.
 * @param {*} s A CitySnapshot. @returns {*} {stalled, cityKey, owner, closed, intakeCost, influence, forecast}.
 */
function standingOf(s) {
  return {
    stalled: !!s.siegeStalled, // besieged by units that aren't attacking: the siege has stopped counting
    cityKey: s.cityKey || "", owner: s.owner, // for the card's own buttons (Close to newcomers)
    closed: !!s.closedToNewcomers,
    intakeCost: intakeUpkeep(), // Influence a turn while closed, and what the treasury holds, for the button
    influence: typeof s.owner === "number" ? callHomeBalance(s.owner, CALL_HOME_CURRENCY.INFLUENCE) : Infinity,
    forecast: s.forecast || null // when the pressure is likely to reach the bar, and how many go
  };
}

/**
 * The local player's settlements (cities and towns), each with its immigration / emigration this age
 * by origin/destination + cause and its emigration pressure. Driven by the full settlement list so
 * every settlement shows.
 * @param {number|null} me Local player id.
 * @param {Record<number, *>} pops Per-civ native populations (carries each settlement's town flag).
 * @returns {*[]} Per-settlement rows {name, town, in, out, pressure}.
 */
export function gatherSettlements(me, pops) {
  if (me == null) return [];
  const D = /** @type {*} */ (globalThis).EmigrationData || {};
  /** @type {Map<string, *>} */
  const moves = new Map();
  if (typeof D.flows === "function") {
    for (const f of D.flows() || []) foldFlow(moves, f, me);
  }
  const pr = pressureMap(me);
  const empty = { civs: [], causes: {} };
  return ((pops[me] && pops[me].cities) || []).map((/** @type {*} */ c) => {
    const e = moves.get(c.name);
    return {
      name: c.name, town: !!c.town,
      in: e ? resolveDir(e.in, me, true) : empty, out: e ? resolveDir(e.out, me, false) : empty,
      pressure: pr[c.name] || null
    };
  });
}
