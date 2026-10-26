// emigration-hasten-ledger.js
//
// What a paid call buys, spelled out before the player pays (the owner, 2026-10-26: the dialog "doesn't show what
// the benefit/cost is overall or to the settlement they're leaving or going to... WHAT ARE WE PAYING FOR?").
// Inside your own borders a returnee leaves a tile where they live now and works one at home, so the civilization
// swaps one tile for another and the fee buys time: the free homecoming would bring them anyway, batch by batch.
// From abroad every person who answers is a tile gained for good, and the fee is paid whether anyone answers.
// Pure text over the Displaced row (emigration-displaced.js).

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { TILE_YIELDS } from "/emigration/ui/emigration-displaced.js";
import { loc } from "/emigration/ui/emigration-loc.js";

/** @typedef {import("/emigration/ui/emigration-displaced.js").DisplacedRow} DisplacedRow */

/** How many host settlements the ledger names before summarizing the rest. */
const MAX_HOST_LINES = 3;

/** The game's own yield names, so the worth line reads as the city screen does. */
/** @type {Record<string, [string, string]>} */
export const YIELD_NAMES = {
  YIELD_FOOD: ["LOC_YIELD_FOOD_NAME", "Food"], YIELD_PRODUCTION: ["LOC_YIELD_PRODUCTION_NAME", "Production"],
  YIELD_GOLD: ["LOC_YIELD_GOLD_NAME", "Gold"], YIELD_SCIENCE: ["LOC_YIELD_SCIENCE_NAME", "Science"],
  YIELD_CULTURE: ["LOC_YIELD_CULTURE_NAME", "Culture"], YIELD_HAPPINESS: ["LOC_YIELD_HAPPINESS_NAME", "Happiness"],
  YIELD_DIPLOMACY: ["LOC_YIELD_DIPLOMACY_NAME", "Influence"]
};

/** @param {string} key A YieldType. @returns {string} Its name in the current language, or the key when unknown. */
export function yieldName(key) {
  const pair = YIELD_NAMES[key];
  return pair ? loc(pair[0], pair[1]) : String(key);
}

/**
 * "+2 Food, +1 Production": a tile's non-zero yields, largest first.
 * @param {Record<string, number>} perTile @returns {string}
 */
export function yieldsText(perTile) {
  // Whole numbers, the three largest: "+1.8 Production, +1.2 Food, +0.5 Happiness, +0.3 Gold, +0.2 Science" read as
  // noise on the live tab (2026-10-25).
  return signedYieldsText(perTile, true);
}

/**
 * "+1 Production, −1 Gold": a signed per-yield difference, the three largest by size, zeroes dropped.
 * @param {Record<string, number>} per @param {boolean} [gainsOnly] Drop the negatives too (a tile's own yields).
 * @returns {string} "" when nothing is left.
 */
export function signedYieldsText(per, gainsOnly) {
  return TILE_YIELDS
    .map((y) => ({ y, n: Math.round(Number(per[y]) || 0) }))
    .filter((e) => (gainsOnly ? e.n > 0 : e.n !== 0))
    .sort((a, b) => Math.abs(b.n) - Math.abs(a.n))
    .slice(0, 3)
    .map((e) => (e.n > 0 ? "+" : "−") + Math.abs(e.n) + " " + loc(YIELD_NAMES[e.y][0], YIELD_NAMES[e.y][1]))
    .join(", ");
}

/**
 * What a returnee leaves behind, averaged over the settlements they live in now, weighted by how many are in each.
 * @param {{points:number, tile?:Record<string, number>|null}[]} internal The row's people in our own settlements.
 * @returns {Record<string, number>|null} Null when no host's tiles could be read.
 */
export function hostLoss(internal) {
  const known = (internal || []).filter((p) => p.tile && p.points > 0);
  const weight = known.reduce((n, p) => n + p.points, 0);
  if (!(weight > 0)) return null;
  /** @type {Record<string, number>} */
  const avg = {};
  for (const y of TILE_YIELDS) {
    const sum = known.reduce((n, p) => n + (Number(/** @type {*} */ (p.tile)[y]) || 0) * p.points, 0);
    avg[y] = Math.round((sum / weight) * 10) / 10;
  }
  return avg;
}

/**
 * The per-person swap: a tile at home gained, a tile where they are now given up.
 * @param {Record<string, number>} gain @param {Record<string, number>|null} loss
 * @returns {Record<string, number>}
 */
export function netPerPerson(gain, loss) {
  /** @type {Record<string, number>} */
  const net = {};
  for (const y of TILE_YIELDS) {
    net[y] = Math.round(((Number(gain[y]) || 0) - (loss ? Number(loss[y]) || 0 : 0)) * 10) / 10;
  }
  return net;
}

/**
 * When the free homecoming would bring the first and the n-th of them: batches of `batch` every `every` turns,
 * the first in `nextIn`.
 * @param {DisplacedRow["wait"]} wait @param {number} n @returns {{first:number, last:number}|null}
 */
export function turnsForN(wait, n) {
  if (!wait) return null;
  const batch = Math.max(1, Number(wait.batch) || 1);
  const first = Math.max(0, Number(wait.nextIn) || 0);
  const batches = Math.max(1, Math.ceil(Math.max(1, n) / batch));
  return { first, last: first + (batches - 1) * Math.max(1, Number(wait.every) || 1) };
}

/**
 * What waiting for the free homecoming would mean instead, said plainly (the owner, 2026-10-26: "3 to 11 turns
 * sooner" was "confusing"): "instead of in 6 turns" when they would all come in one batch, "instead of over the
 * next 6 turns" when in several; "" when the free homecoming would bring them next turn anyway.
 * @param {{first:number, last:number}|null} t @returns {string}
 */
export function insteadText(t) {
  if (!t || t.last <= 0) return "";
  if (t.first >= t.last) return loc("LOC_EMIG_LEDGER_INSTEAD_ONE", "instead of in {1_Turns} turns", t.last);
  return loc("LOC_EMIG_LEDGER_INSTEAD_OVER", "instead of over the next {1_Turns} turns", t.last);
}

/**
 * The home's side of the ledger: the tile each returnee works, and the torn-down improvements rebuilt first.
 * @param {DisplacedRow} r @param {(lost:{type:string, count:number}[])=>string} lostText
 * @returns {string}
 */
function gainLine(r, lostText) {
  const gain = r.tile ? yieldsText(r.tile.perTile) : "";
  let line = gain
    ? loc("LOC_EMIG_LEDGER_GAIN", "{1_Home} gains: each returnee works a {1_Home} tile, about {2_Yields} a turn.",
      r.home, gain)
    : loc("LOC_EMIG_LEDGER_GAIN_UNKNOWN", "{1_Home} gains: each returnee works a {1_Home} tile.", r.home);
  if (r.lost && r.lost.length) {
    line += " " + loc("LOC_EMIG_LEDGER_REBUILD", "{1_Tiles}, torn down as they left, are rebuilt first.", lostText(r.lost));
  }
  return line;
}

/**
 * One line per settlement they live in now, largest first: what those people work there today.
 * @param {DisplacedRow} r @returns {string[]}
 */
function hostLines(r) {
  const hosts = r.internal.slice().sort((a, b) => b.points - a.points);
  const lines = hosts.slice(0, MAX_HOST_LINES).map((p) => {
    const loss = p.tile ? yieldsText(p.tile) : "";
    return loss
      ? loc("LOC_EMIG_LEDGER_HOST", "{1_From} gives up: {2_Count} of them work {1_From} tiles today, about {3_Yields} each a turn; "
        + "those tiles go idle when they leave.", p.from, p.points, loss)
      : loc("LOC_EMIG_LEDGER_HOST_UNKNOWN", "{1_From} gives up: {2_Count} of them live there today.", p.from, p.points);
  });
  const rest = hosts.length - lines.length;
  if (rest > 0) lines.push(loc("LOC_EMIG_LEDGER_MORE", "and {1_Count} more settlements", rest));
  return lines;
}

/**
 * The bottom line: the per-person swap for the civilization, and what the fee buys.
 * @param {DisplacedRow} r @param {number} n How many the call would bring. @returns {string}
 */
function overallLine(r, n) {
  const net = r.tile ? signedYieldsText(netPerPerson(r.tile.perTile, hostLoss(r.internal))) : "";
  const swap = net
    ? loc("LOC_EMIG_LEDGER_NET", "Overall: per person, your civilization swaps a tile where they live now for a tile at "
      + "{1_Home}, about {2_Net} a turn.", r.home, net)
    : loc("LOC_EMIG_LEDGER_NET_EVEN", "Overall: per person, your civilization swaps a tile where they live now for a tile "
      + "at {1_Home}; the yields come out about even.", r.home);
  const t = CONFIG.homecomingEnabled ? turnsForN(r.wait, n) : null;
  const buys = t
    ? loc("LOC_EMIG_LEDGER_BUYS_TIME", "The fee buys time: home this turn {1_Instead}; the free homecoming brings them "
      + "anyway.", insteadText(t) || loc("LOC_EMIG_LEDGER_INSTEAD_NEXT", "instead of next turn"))
    : loc("LOC_EMIG_LEDGER_BUYS_RETURN", "They only come home when called.");
  return swap + " " + buys;
}

/**
 * The ledger for hastening one settlement's people home from our own settlements.
 * @param {DisplacedRow} r @param {number} n How many the call would bring.
 * @param {(lost:{type:string, count:number}[])=>string} lostText Names the torn-down improvements.
 * @returns {string[]} Lines for the dialog's details block.
 */
export function hastenLedger(r, n, lostText) {
  return [gainLine(r, lostText), ...hostLines(r), overallLine(r, n)];
}

/**
 * The ledger for calling one settlement's people back from abroad.
 * @param {DisplacedRow} r @param {(lost:{type:string, count:number}[])=>string} lostText
 * @returns {string[]}
 */
export function abroadLedger(r, lostText) {
  const a = r.abroadCall;
  const lines = [gainLine(r, lostText)];
  lines.push(loc("LOC_EMIG_LEDGER_ABROAD_GAIN", "Nothing of yours is given up: the rulers they live under lose them, "
    + "and each who answers is a tile at {1_Home} for good.", r.home));
  if (a) {
    lines.push(loc("LOC_EMIG_LEDGER_ABROAD_ODDS", "About {1_Pct}% answer, so calling {2_Count} brings about {3_Expected}. "
      + "The fee is paid either way: about {4_Gold} Gold or {5_Infl} Influence for each person who comes.",
    Math.round(a.chance * 100), a.n, String(a.expected), a.perGold, a.perInfluence));
  }
  return lines;
}

/**
 * The card's one-line worth: the tile at home, and the tile left behind.
 * @param {DisplacedRow} r @returns {string}
 */
export function worthText(r) {
  const gain = r.tile ? yieldsText(r.tile.perTile) : "";
  const loss = hostLoss(r.internal);
  const lossText = loss ? yieldsText(loss) : "";
  if (gain && lossText) {
    return loc("LOC_EMIG_DP_TILE_SWAP", "each returnee works a {1_Home} tile, about {2_Yields} a turn, and leaves a tile "
      + "where they live now (about {3_Loss} a turn).", r.home, gain, lossText);
  }
  return loc("LOC_EMIG_DP_TILE", "each returnee settles a new tile at {1_Home}, about {2_Yields} a turn.", r.home, gain);
}

/**
 * The card's Hasten line: what the fee buys, in turns.
 * @param {DisplacedRow} r @returns {string}
 */
export function hastenText(r) {
  const h = /** @type {NonNullable<DisplacedRow["hasten"]>} */ (r.hasten);
  const t = CONFIG.homecomingEnabled ? turnsForN(r.wait, h.n) : null;
  if (t && t.last > 0) {
    return loc("LOC_EMIG_DP_HASTEN_SOONER", "{2_Gold} Gold or {3_Infl} Influence brings {1_Count} back this turn, "
      + "{4_Instead}.", h.n, h.gold, h.influence, insteadText(t));
  }
  return loc("LOC_EMIG_DP_HASTEN", "bring {1_Count} back now for {2_Gold} Gold or {3_Infl} Influence.", h.n, h.gold, h.influence);
}
