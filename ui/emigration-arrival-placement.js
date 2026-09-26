// emigration-arrival-placement.js
//
// The DESTINATION side of a migration made real for the human player. `city.addRuralPopulation(+1)`
// gives a city a genuine pending placement: an AI settlement resolves it on its own turn, while for the
// human the game's own "Grow City" prompt (NOTIFICATION_NEW_POPULATION) blocks the end of the turn until
// the point is placed. This module offers faster paths for the local player's cities:
//
//   arrivalPlacement 0  off       - the raw write; the game's Grow City prompt asks the player to place it
//   arrivalPlacement 1  auto      - place it at once with the game's own EXPAND city command
//   arrivalPlacement 2  ask       - the game's native decision pop-up: choose the tile yourself (the
//                                   engine's own place-population mode), let the city decide (auto),
//                                   or later
//   arrivalPlacement 3  unit      - hand the newcomers over as a Migrant unit next to the city
//                                   (CREATE_ELEMENT is local-player-only); resettling it places a
//                                   real improvement
//
// `arriveRural(city, from)` is the ONE entry point every arrival site uses (instant moves, lagged arrivals,
// refugee-pool settlement, returns, the refugee dilemma). Foreign cities and mode 0 fall through to the
// plain write. Placement itself is deferred a tick so a pass that lands several points in one city
// produces one prompt, not one per point.

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { addRural } from "/emigration/ui/emigration-population.js";
import { dlog } from "/emigration/ui/emigration-log.js";
import { loc } from "/emigration/ui/emigration-loc.js";
import { showDilemma } from "/emigration/ui/emigration-dilemma-view.js";
import { isRefugeeCause } from "/emigration/ui/emigration-causes.js";
import { civAdjective } from "/emigration/ui/emigration-naming.js";
import { displacedQuoteFor } from "/emigration/ui/emigration-displaced-quotes.js";

/** Placement modes, by CONFIG.arrivalPlacement value. */
export const PLACEMENT = { OFF: 0, AUTO: 1, ASK: 2, UNIT: 3 };

/**
 * Where one arriving point came from: the origin player and whether they fled (refugee) or chose to move
 * (migrant). Either may be absent (returnees carry neither; a held refugee pool knows only the kind).
 * @typedef {{civ?:number, kind?:"refugee"|"migrant", cause?:string}} ArrivalFrom
 */

/** @type {Map<string, {city:*, count:number, ask:number, from:Map<string, number>}>} Pending local arrivals, by city
 * key. `ask` counts the points whose kind raises the Ask me pop-up; `from` tallies only those. */
const pending = new Map();
/** @type {*} */
let flushTimer = null;
/** Test seam: when set, replaces the deferred timer with a synchronous flush. */
let syncFlush = false;

/**
 * The local player id, or -1 off-engine.
 * @returns {number} Player id.
 */
function localPid() {
  try {
    return typeof GameContext !== "undefined" && typeof GameContext.localPlayerID === "number" ? GameContext.localPlayerID : -1;
  } catch (_) {
    return -1;
  }
}

/**
 * The configured mode, clamped to a known value.
 * @returns {number} A PLACEMENT value.
 */
export function placementMode() {
  const m = Number(CONFIG.arrivalPlacement);
  return m === 1 || m === 2 || m === 3 ? m : 0;
}

/**
 * A stable key for a city object.
 * @param {*} city @returns {string} Key.
 */
function keyOf(city) {
  try {
    const id = city.id || {};
    return String(id.owner ?? city.owner) + ":" + String(id.id ?? city.localId ?? city.name);
  } catch (_) {
    return String(city && city.name);
  }
}

/**
 * The city's display name.
 * @param {*} city @returns {string} Name.
 */
function cityName(city) {
  try {
    return typeof Locale !== "undefined" && Locale.compose ? Locale.compose(city.name) : String(city.name);
  } catch (_) {
    return String(city && city.name);
  }
}

/**
 * Spawn the newcomers as a Migrant unit at the city (local player only; the engine gates the op).
 * @param {*} city Destination city.
 * @param {number} pid Local player id.
 * @returns {boolean} True when the request was issued.
 */
function spawnMigrantUnit(city, pid) {
  try {
    if (typeof Game === "undefined" || !Game.PlayerOperations) return false;
    const r = Game.PlayerOperations.sendRequest(pid, "CREATE_ELEMENT", {
      IndependentIndex: -1, Kind: "UNIT", Location: city.location, Owner: pid, Type: "UNIT_MIGRANT"
    });
    return r !== false;
  } catch (e) {
    dlog("spawnMigrantUnit threw " + e);
    return false;
  }
}

/**
 * Whether an arrival of this kind raises the Ask me pop-up (arrivalAskRefugees / arrivalAskMigrants /
 * arrivalAskReturnees); the kinds not asked are placed automatically. An arrival with no kind is a returnee
 * (return migration passes none).
 * @param {ArrivalFrom|undefined} [from] The arrival's origin.
 * @returns {boolean} True when the player is asked.
 */
export function asksAbout(from) {
  const kind = from && from.kind;
  if (kind === "refugee") return !!CONFIG.arrivalAskRefugees;
  if (kind === "migrant") return !!CONFIG.arrivalAskMigrants;
  return !!CONFIG.arrivalAskReturnees;
}

/**
 * The arrival origin for a move from a player under a migration cause. Pure.
 * @param {number} civ The source player id. @param {string} cause The MigrationCause.
 * @returns {ArrivalFrom} The origin.
 */
export function arrivalFrom(civ, cause) {
  return { civ, kind: isRefugeeCause(cause) ? "refugee" : "migrant", cause: cause || "" };
}

/**
 * Land one population point in a city: the plain write for AI cities and mode 0, a Migrant unit in
 * mode 3, and the write plus a queued placement in modes 1 and 2. Returns whether the point landed.
 * @param {*} city Destination city object.
 * @param {ArrivalFrom} [from] Where the point came from, for the newcomers pop-up's quote.
 * @returns {boolean} True when the arrival applied.
 */
export function arriveRural(city, from) {
  const pid = localPid();
  const isLocal = !!city && pid >= 0 && city.owner === pid;
  const mode = placementMode();
  if (isLocal && mode === PLACEMENT.UNIT && spawnMigrantUnit(city, pid)) return true;
  const ok = addRural(city);
  if (ok && isLocal && (mode === PLACEMENT.AUTO || mode === PLACEMENT.ASK)) notePending(city, from);
  return ok;
}

/**
 * Remember that a local city has a freshly landed point to place, and schedule one flush.
 * @param {*} city @param {ArrivalFrom} [from] Where the point came from.
 */
function notePending(city, from) {
  const k = keyOf(city);
  const cur = pending.get(k) || { city, count: 0, ask: 0, from: new Map() };
  cur.count += 1;
  if (asksAbout(from)) {
    cur.ask += 1;
    const tag = originTag(from);
    if (tag) cur.from.set(tag, (cur.from.get(tag) || 0) + 1);
  }
  pending.set(k, cur);
  if (syncFlush) {
    flushArrivalPlacements();
    return;
  }
  if (flushTimer) return;
  try {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flushArrivalPlacements();
    }, 250);
  } catch (_) {
    flushTimer = null;
    flushArrivalPlacements();
  }
}

/**
 * Whether the city still has an unplaced point.
 * @param {*} city @returns {boolean} True when pending population > 0.
 */
function hasPending(city) {
  try {
    return typeof city.pendingPopulation === "number" ? city.pendingPopulation > 0 : true;
  } catch (_) {
    return false;
  }
}

/**
 * Try to seat one point as a SPECIALIST (the game's ASSIGN_WORKER op on a workable district plot).
 * @param {*} city @param {number} pid Local player id.
 * @returns {boolean} True when a request was issued.
 */
function placeAsSpecialist(city, pid) {
  try {
    if (typeof Game === "undefined" || !Game.PlayerOperations || typeof PlayerOperationTypes === "undefined") return false;
    const op = PlayerOperationTypes.ASSIGN_WORKER;
    if (op == null) return false;
    const plots = typeof city.getPurchasedPlots === "function" ? city.getPurchasedPlots() : [];
    for (const plot of plots) {
      const args = { Location: plot, Amount: 1 };
      const can = Game.PlayerOperations.canStart(pid, op, args, false);
      if (can && can.Success) {
        Game.PlayerOperations.sendRequest(pid, op, args);
        return true;
      }
    }
  } catch (e) {
    dlog("placeAsSpecialist threw " + e);
  }
  return false;
}

/**
 * Pick the plot to expand onto: a resource tile if the game offers one, else the first offered.
 * @param {number[]} plots Offered plot indices.
 * @returns {number} The chosen plot index.
 */
export function pickExpandPlot(plots) {
  try {
    if (typeof GameplayMap !== "undefined" && typeof GameplayMap.getResourceType === "function") {
      for (const p of plots) {
        const l = GameplayMap.getLocationFromIndex(p);
        const r = l ? GameplayMap.getResourceType(l.x, l.y) : -1;
        if (typeof r === "number" && r >= 0 && r !== 4294967295) return p;
      }
    }
  } catch (_) {
    /* fall through */
  }
  return plots[0];
}

/**
 * Place one point with the game's own EXPAND city command (a new rural improvement).
 * @param {*} city
 * @returns {boolean} True when a request was issued.
 */
function placeOnTile(city) {
  try {
    if (typeof Game === "undefined" || !Game.CityCommands || typeof CityCommandTypes === "undefined") return false;
    const can = Game.CityCommands.canStart(city.id, CityCommandTypes.EXPAND, {}, false);
    if (!can || !can.Plots || !can.Plots.length) return false;
    const plot = pickExpandPlot(can.Plots);
    const l = GameplayMap.getLocationFromIndex(plot);
    if (!l) return false;
    Game.CityCommands.sendRequest(city.id, CityCommandTypes.EXPAND, { X: l.x, Y: l.y });
    return true;
  } catch (e) {
    dlog("placeOnTile threw " + e);
    return false;
  }
}

/**
 * Settle up to `count` pending points in a city automatically (specialist first when preferred).
 * @param {*} city @param {number} count Points to place.
 * @returns {number} Points for which a placement request was issued.
 */
export function autoPlace(city, count) {
  const pid = localPid();
  let placed = 0;
  for (let i = 0; i < count; i++) {
    if (!hasPending(city)) break;
    const asSpecialist = CONFIG.arrivalPreferSpecialists && placeAsSpecialist(city, pid);
    if (!asSpecialist && !placeOnTile(city)) break;
    placed++;
  }
  if (placed) dlog("auto-placed " + placed + " newcomer point(s) in " + cityName(city));
  return placed;
}

/**
 * Open the game's own place-population mode on the city so the player picks the tile.
 * @param {*} city
 */
function openPlacementMode(city) {
  try {
    import("/core/ui/interface-modes/interface-modes.js")
      .then((/** @type {*} */ mod) => {
        const im = mod && (mod.InterfaceMode || mod.default);
        if (im && typeof im.switchTo === "function") im.switchTo("INTERFACEMODE_ACQUIRE_TILE", { CityID: city.id });
        else dlog("InterfaceMode unavailable; cannot open placement");
      })
      .catch((e) => dlog("interface-modes import failed " + e));
  } catch (e) {
    dlog("openPlacementMode threw " + e);
  }
}

/**
 * The tally tag for an arrival origin ("3|refugee", "|refugee"), or "" when it carries nothing to quote.
 * @param {ArrivalFrom} [from] The origin. @returns {string} The tag.
 */
function originTag(from) {
  if (!from || (from.kind !== "refugee" && from.kind !== "migrant")) return "";
  return (typeof from.civ === "number" ? String(from.civ) : "") + "|" + from.kind + "|" + (from.cause || "");
}

/**
 * The origin most of a city's waiting newcomers share, for its quote; ties go to the first tallied. Pure.
 * @param {Map<string, number>|undefined} tally Points by origin tag.
 * @returns {{civ:number|null, kind:"refugee"|"migrant", cause:string}|null} The origin, or null when none.
 */
export function dominantOrigin(tally) {
  let best = "";
  let most = 0;
  for (const [tag, n] of tally || []) {
    if (n > most) {
      best = tag;
      most = n;
    }
  }
  if (!best) return null;
  const [civ, kind, cause] = best.split("|");
  return { civ: civ === "" ? null : Number(civ), kind: kind === "refugee" ? "refugee" : "migrant",
    cause: cause || "" };
}

/**
 * The epigraph for a city's newcomers, from their dominant origin, or "" when no origin was recorded.
 * @param {*} city @param {Map<string, number>|undefined} tally Points by origin tag.
 * @returns {string} The quote line.
 */
function arrivalQuote(city, tally) {
  const origin = dominantOrigin(tally);
  if (!origin) return "";
  const turn = typeof Game !== "undefined" && Game && typeof Game.turn === "number" ? Game.turn : 0;
  return displacedQuoteFor(origin.civ, origin.kind, "arrival|" + keyOf(city) + "|" + turn);
}

/**
 * The decision pop-up view for one city's newcomers.
 * @param {*} city @param {number} count Points waiting. @param {string} [quote] The epigraph line.
 * @param {{civ:number|null, kind:"refugee"|"migrant", cause:string}|null} [origin] The dominant origin,
 *   used to say plainly that these are refugees, whose they are, and what they fled.
 * @returns {{eyebrow:string, eyebrowIcon:string, title:string, body:string, dismissId:string, quote:string,
 *   choices:{id:string,label:string,note:string}[]}} View.
 */
export function arrivalPromptView(city, count, quote = "", origin = null) {
  const name = cityName(city);
  const pop = "[icon:YIELD_POPULATION] +" + count;
  const auto = autoTileYields(city, count);
  const refugees = !!origin && origin.kind === "refugee";
  const who = refugeeOriginPhrase(origin);
  const fled = fledPhrase(origin);
  return {
    quote,
    eyebrow: refugees
      ? loc("LOC_EMIG_ARRIVAL_EYEBROW_REFUGEE", "Refugees")
      : loc("LOC_EMIG_ARRIVAL_EYEBROW", "Newcomers"),
    eyebrowIcon: "YIELD_POPULATION",
    title: refugees
      ? loc("LOC_EMIG_ARRIVAL_TITLE_REFUGEE", "Refugees in {1_City}", name)
      : loc("LOC_EMIG_ARRIVAL_TITLE", "Newcomers in {1_City}", name),
    body: refugees ? refugeeBody(count, who, fled, name) : migrantBody(count, name),
    dismissId: "later",
    // Each button states what it gives, in the refugee and call-home buttons' shape. Every choice seats the
    // same people; only "Let the city settle them" knows its tiles in advance, so only it adds their yields.
    choices: [
      { id: "choose", label: caption(loc("LOC_EMIG_ARRIVAL_CHOOSE", "Choose where they settle"), [pop]), note: loc("LOC_EMIG_ARRIVAL_CHOOSE_N", "Opens the settlement's placement view; each point becomes a new rural tile.") },
      { id: "auto", label: caption(loc("LOC_EMIG_ARRIVAL_AUTO", "Let the city settle them"), [pop, ...auto]), note: loc("LOC_EMIG_ARRIVAL_AUTO_N", "The city picks a tile for each point now.") },
      { id: "later", label: caption(loc("LOC_EMIG_ARRIVAL_LATER", "Later"), [pop]), note: loc("LOC_EMIG_ARRIVAL_LATER_N", "The game's Grow City prompt asks you to place them before your turn ends.") }
    ]
  };
}

/**
 * A button caption: the label, then its figures ("Let the city settle them: [icon:YIELD_POPULATION] +1, ...").
 * @param {string} label @param {string[]} parts The figures. @returns {string} The caption.
 */
function caption(label, parts) {
  return label + ": " + parts.filter(Boolean).join(", ");
}

/** Yields shown on the automatic-placement button, in display order. */
const TILE_YIELDS = Object.freeze(["YIELD_FOOD", "YIELD_PRODUCTION", "YIELD_GOLD", "YIELD_SCIENCE", "YIELD_CULTURE",
  "YIELD_HAPPINESS", "YIELD_DIPLOMACY"]);

/**
 * A plot's yields for its owner ({YIELD_X: n}), or null when unreadable. A local copy of the enclave module's
 * reader: importing that module here would pull its whole dependency chain into this one.
 * @param {number} plot Plot index. @param {number} owner Player id. @returns {Record<string, number>|null} Yields.
 */
function plotYields(plot, owner) {
  try {
    const pairs = GameplayMap.getYields(plot, owner);
    if (!Array.isArray(pairs)) return null;
    /** @type {Record<string, number>} */
    const out = {};
    for (const p of pairs) {
      const def = GameInfo.Yields.lookup(p[0]);
      const type = def && def.YieldType ? String(def.YieldType) : String(p[0]);
      const n = Number(p[1]);
      if (n) out[type] = (out[type] || 0) + n;
    }
    return out;
  } catch (_) {
    return null;
  }
}

/**
 * The tiles "Let the city settle them" will take for `count` points, picked the way {@link placeOnTile} picks
 * (a resource tile first, else the first the game offers), each removed before the next pick. Empty when the
 * city seats newcomers as specialists first, or when the game offers no tile.
 * @param {*} city @param {number} count Points. @returns {number[]} Plot indices.
 */
function autoTiles(city, count) {
  try {
    if (CONFIG.arrivalPreferSpecialists) return [];
    const can = Game.CityCommands.canStart(city.id, CityCommandTypes.EXPAND, {}, false);
    const offered = can && Array.isArray(can.Plots) ? can.Plots.slice() : [];
    const out = [];
    for (let i = 0; i < count && offered.length; i++) {
      const p = pickExpandPlot(offered);
      out.push(p);
      offered.splice(offered.indexOf(p), 1);
    }
    return out;
  } catch (_) {
    return [];
  }
}

/**
 * What the tiles automatic placement will take yield, as caption figures ("[icon:YIELD_FOOD] +2"), or none
 * when they cannot be known in advance.
 * @param {*} city @param {number} count Points. @returns {string[]} The figures.
 */
function autoTileYields(city, count) {
  /** @type {Record<string, number>} */
  const sum = {};
  for (const plot of autoTiles(city, count)) {
    for (const [k, v] of Object.entries(plotYields(plot, city.owner) || {})) sum[k] = (sum[k] || 0) + v;
  }
  return TILE_YIELDS.filter((k) => sum[k] > 0).map((k) => "[icon:" + k + "] +" + Math.round(sum[k] * 10) / 10);
}

/**
 * Who the refugees are, by origin civilization ("Mongolian"), or a neutral word when the origin is unknown
 * or unmet. Pure enough for tests: falls back cleanly when the naming helpers cannot read a player.
 * @param {{civ:number|null}|null} origin The dominant origin. @returns {string} The phrase.
 */
function refugeeOriginPhrase(origin) {
  const pid = origin && typeof origin.civ === "number" ? origin.civ : -1;
  if (pid < 0) return "";
  try {
    const adj = String(civAdjective(pid) || "").trim();
    // civAdjective falls back to a generic phrase off-engine and for a civilization you have not met.
    // Compare against the phrase an unreadable player yields rather than hard-coding it: an unnamed people
    // reads better as plain "refugees" than as "a people refugees".
    const generic = String(civAdjective(-1) || "").trim();
    return adj && adj !== generic ? adj : "";
  } catch (_) {
    return "";
  }
}

/**
 * What they fled, from the migration cause behind the arrival: war, a disaster, or a conquest.
 * @param {{cause?:string}|null} origin The dominant origin. @returns {string} The phrase.
 */
function fledPhrase(origin) {
  const cause = (origin && origin.cause) || "";
  if (cause === "war") return loc("LOC_EMIG_ARRIVAL_FLED_WAR", "war");
  if (cause === "disaster") return loc("LOC_EMIG_ARRIVAL_FLED_DISASTER", "a disaster");
  if (cause === "conquest") return loc("LOC_EMIG_ARRIVAL_FLED_CONQUEST", "a conquest");
  return loc("LOC_EMIG_ARRIVAL_FLED_UNKNOWN", "danger at home");
}

/**
 * The refugee body line, naming who they are and what they fled.
 * @param {number} count Points. @param {string} who Origin phrase. @param {string} fled What they fled.
 * @param {string} name City name. @returns {string} The body.
 */
function refugeeBody(count, who, fled, name) {
  if (!who) {
    return count === 1
      ? loc("LOC_EMIG_ARRIVAL_BODY_REFUGEE_ONE_ANON",
        "A population point of refugees has reached {1_City}, fleeing {2_Fled}. Where should they live?", name, fled)
      : loc("LOC_EMIG_ARRIVAL_BODY_REFUGEE_ANON",
        "{1_Count} population points of refugees have reached {2_City}, fleeing {3_Fled}. Where should they live?", count, name, fled);
  }
  return count === 1
    ? loc("LOC_EMIG_ARRIVAL_BODY_REFUGEE_ONE",
      "A population point of {1_Who} refugees has reached {2_City}, fleeing {3_Fled}. Where should they live?", who, name, fled)
    : loc("LOC_EMIG_ARRIVAL_BODY_REFUGEE",
      "{1_Count} population points of {2_Who} refugees have reached {3_City}, fleeing {4_Fled}. Where should they live?", count, who, name, fled);
}

/**
 * The ordinary newcomer body line.
 * @param {number} count Points. @param {string} name City name. @returns {string} The body.
 */
function migrantBody(count, name) {
  return count === 1
    ? loc("LOC_EMIG_ARRIVAL_BODY_ONE", "A population point of migrants has arrived in {1_City} and is waiting to be settled. Where should they live?", name)
    : loc("LOC_EMIG_ARRIVAL_BODY", "{1_Count} population points of migrants have arrived in {2_City} and are waiting to be settled. Where should they live?", count, name);
}


/**
 * Show the native pop-up for one city and act on the answer.
 * @param {*} city @param {number} count Points waiting. @param {Map<string, number>} [from] Origins.
 */
function promptFor(city, count, from) {
  const origin = dominantOrigin(from);
  showDilemma(arrivalPromptView(city, count, arrivalQuote(city, from), origin), (id) => {
    if (id === "choose") openPlacementMode(city);
    else if (id === "auto") autoPlace(city, count);
  });
}

/**
 * Place (or ask about) every local arrival landed since the last flush. Safe to call at any time.
 * @returns {number} Cities handled.
 */
export function flushArrivalPlacements() {
  const items = [...pending.values()];
  pending.clear();
  const mode = placementMode();
  for (const { city, count, ask, from } of items) {
    try {
      if (mode === PLACEMENT.AUTO) autoPlace(city, count);
      else if (mode === PLACEMENT.ASK) {
        if (count > ask) autoPlace(city, count - ask); // the kinds the player is not asked about
        if (ask > 0) promptFor(city, ask, from);
      }
    } catch (e) {
      dlog("flushArrivalPlacements threw " + e);
    }
  }
  return items.length;
}

/**
 * Test seam: flush synchronously inside arriveRural instead of on a deferred tick.
 * @param {boolean} on Whether to flush synchronously.
 */
export function _setSyncFlushForTests(on) {
  syncFlush = !!on;
}

/**
 * Test seam: the number of cities with un-flushed arrivals.
 * @returns {number} Count.
 */
export function _pendingCountForTests() {
  return pending.size;
}
