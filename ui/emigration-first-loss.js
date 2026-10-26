// emigration-first-loss.js
//
// The first-loss page (roadmap §33): a tutorial moment, shipped off. The first time one of the player's settlements
// loses a tile to emigration, one page in the mod's dilemma frame says what happened, where they went and why, what
// happens next and where to look, with the settlement's fix line as its detail. It shows once per game (a flag in
// the save), skips the "People are leaving" notice for that pass so the player isn't told twice, and leaves a
// Chronicle entry ("The First to Leave") for anyone who dismissed it fast. Off by default: the Mods-tab checkbox
// "First-loss explainer" turns it on. Never in sample-data mode; never for the AI.

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { loc } from "/emigration/ui/emigration-loc.js";
import { registerCacheReset, resetCachesOnNewGame } from "/emigration/ui/emigration-cache-reset.js";
import { causeLabel } from "/emigration/ui/emigration-causes.js";
import { civAdjective } from "/emigration/ui/emigration-naming.js";
import { civHidden } from "/emigration/ui/emigration-governance.js";
import { ownerCitySnapshots } from "/emigration/ui/emigration-city-readout-data.js";
import { fixLine, whyThereLine } from "/emigration/ui/emigration-city-readout.js";
import { lostTilesFor } from "/emigration/ui/emigration-lost-tiles.js";
import { showDilemma } from "/emigration/ui/emigration-dilemma-view.js";
import { chronicle } from "/emigration/ui/emigration-chronicle.js";
import { getSampleData } from "/emigration/ui/emigration-settings.js";
import { dlog } from "/emigration/ui/emigration-log.js";

const FLAG_KEY = "EmigrationFirstLoss_v1";
const OPEN = "open";
const OK = "ok";

/** @type {{turn:number, city:string}|null|undefined} undefined = not read yet */
let _flag;
registerCacheReset(() => { _flag = undefined; });

/** @returns {number} */
function gameTurn() {
  try {
    return typeof Game !== "undefined" && typeof Game.turn === "number" ? Game.turn : 0;
  } catch (_) {
    return 0;
  }
}

/**
 * The save's flag: the turn and settlement of the page's one showing, or null.
 * @returns {{turn:number, city:string}|null}
 */
export function firstLossFlag() {
  resetCachesOnNewGame();
  if (_flag === undefined) _flag = readFlag();
  return _flag;
}

/** @returns {{turn:number, city:string}|null} The save's flag, or null when absent or unreadable. */
function readFlag() {
  try {
    const raw = Configuration?.getGame?.()?.getValue?.(FLAG_KEY);
    return typeof raw === "string" && raw.length ? parseFlag(JSON.parse(raw)) : null;
  } catch (_) {
    return null;
  }
}

/** @param {*} v A parsed value. @returns {{turn:number, city:string}|null} The flag when well-formed. */
function parseFlag(v) {
  if (!v || typeof v !== "object" || typeof v.city !== "string") return null;
  return { turn: Number(v.turn) || 0, city: v.city };
}

/**
 * Set the flag: the page has shown, and never comes back in this game.
 * @param {number} turn The turn. @param {string} city The settlement.
 */
export function markFirstLoss(turn, city) {
  _flag = { turn, city };
  try {
    Configuration?.editGame?.()?.setValue?.(FLAG_KEY, JSON.stringify(_flag));
  } catch (_) {
    /* the page may show again after a reload; nothing else depends on it */
  }
}

/**
 * The largest loss this pass that tore a tile down, or null: a counter decrement is too quiet to teach from.
 * @param {*[]} events The pass's per-event buckets, largest first (emigration-feedback.js).
 * @returns {*|null}
 */
export function firstLossEvent(events) {
  for (const ev of events || []) if (ev && ev.tile) return ev;
  return null;
}

/**
 * Whether the page is due: on, not in sample-data mode, never shown in this game, and a tile was torn down.
 * @param {*[]} events The pass's per-event buckets.
 * @param {{sample?:()=>boolean, flag?:()=>*}} [deps] Readers (tests).
 * @returns {*|null} The event to show, or null.
 */
export function firstLossDue(events, deps = {}) {
  if (!CONFIG.firstLossPage) return null;
  const sample = deps.sample || getSampleData;
  const flag = deps.flag || firstLossFlag;
  if (sample() || flag()) return null;
  return firstLossEvent(events);
}

/**
 * The facts the page draws from, read off the live game for an event.
 * @typedef {Object} FirstLossFacts
 * @property {string} [tile] The torn-down tile's name, when a tile was recorded.
 * @property {string} [civ] The destination civilization's adjective, for a cross-border loss.
 * @property {string} [why] The readout's "why there" line.
 * @property {string} [fix] The readout's fix line.
 */

/**
 * The live facts for an event: the last tile the settlement lost, the destination civilization, the settlement's
 * readout lines. Each read fails soft.
 * @param {*} ev The event. @param {number} me The local player.
 * @returns {FirstLossFacts}
 */
export function firstLossFacts(ev, me) {
  /** @type {FirstLossFacts} */
  const f = { ...readoutFacts(ev, me) };
  const tile = lastLostTile(me, ev.srcName);
  if (tile) f.tile = tile;
  if (ev.crossCiv && typeof ev.destOwner === "number") {
    f.civ = civHidden(ev.destOwner) ? loc("LOC_EMIG_FL_UNMET", "an unmet civilization") : civAdjective(ev.destOwner);
  }
  return f;
}

/**
 * @param {number} me The local player. @param {string} home The settlement.
 * @returns {string|null} The name of the tile it lost last, or null.
 */
function lastLostTile(me, home) {
  try {
    const tiles = lostTilesFor(me, home);
    const last = tiles.length ? tiles[tiles.length - 1] : null;
    return last && last.t ? loc("LOC_" + last.t + "_NAME", last.t) : null;
  } catch (_) {
    return null;
  }
}

/**
 * @param {*} ev The event. @param {number} me The local player.
 * @returns {{why?:string, fix?:string}} The settlement's readout lines, when its snapshot reads.
 */
function readoutFacts(ev, me) {
  try {
    const s = ownerCitySnapshots(me).find((c) => c.cityName === ev.srcName);
    if (!s) return {};
    return { why: s.topDestinationName ? whyThereLine(s.destReasons) : "", fix: fixLine(s.fix) };
  } catch (_) {
    return {};
  }
}

/**
 * The page's first paragraph: what happened.
 * @param {*} ev The event. @param {FirstLossFacts} f The facts. @returns {string}
 */
function whatHappened(ev, f) {
  const left = loc("LOC_EMIG_FL_LEFT", "{1_Count} people left {2_City} this turn.", Math.round(ev.people || 0), ev.srcName);
  if (!f.tile) return left;
  return left + " " + loc("LOC_EMIG_FL_TILE",
    "They tore down the {1_Tile} they worked on the way out; the plot is yours to settle again.", f.tile);
}

/**
 * The page's second paragraph: where they went and why.
 * @param {*} ev The event. @param {FirstLossFacts} f The facts. @returns {string}
 */
function whereTo(ev, f) {
  const reason = causeLabel(ev.cause);
  const dest = ev.destName || loc("LOC_EMIG_FL_ELSEWHERE", "another settlement");
  const gone = f.civ
    ? loc("LOC_EMIG_FL_GONE_ABROAD", "They have gone to {1_Dest}, a settlement of the {2_Civ}, because of {3_Reason}.", dest, f.civ, reason)
    : loc("LOC_EMIG_FL_GONE_HOME", "They have gone to {1_Dest}, because of {2_Reason}.", dest, reason);
  return f.why ? gone + " " + f.why : gone;
}

/**
 * The page: eyebrow, title, four paragraphs, the fix line as the detail, two choices, no quote.
 * @param {*} ev The event (the pass's largest tile loss). @param {FirstLossFacts} f The facts.
 * @returns {{eyebrow:string, title:string, body:string, details:string[], dismissId:string,
 *   choices:{id:string, label:string}[]}}
 */
export function firstLossView(ev, f) {
  const paras = [
    whatHappened(ev, f),
    whereTo(ev, f),
    loc("LOC_EMIG_FL_NEXT", "People who stay inside your civilization come home on their own once {1_City} has been calm "
      + "for a few turns. People who crossed a border can be called back from the Settlements tab, at a price and at odds.",
    ev.srcName),
    loc("LOC_EMIG_FL_LOOK", "The Emigration screen (the button in the dock, or the notice beside End Turn) shows every "
      + "settlement losing people, why, and what would stop it. Hover a settlement for the short version.")
  ];
  return {
    eyebrow: loc("LOC_EMIG_FL_EYEBROW", "Emigration"),
    title: loc("LOC_EMIG_FL_TITLE", "People Have Left {1_City}", ev.srcName),
    body: paras.join("\n\n"),
    details: f.fix ? [f.fix] : [],
    dismissId: OK,
    choices: [
      { id: OPEN, label: loc("LOC_EMIG_FL_OPEN", "Open the Emigration screen") },
      { id: OK, label: loc("LOC_EMIG_FL_OK", "Got it") }
    ]
  };
}

/** Open the Emigration screen on the Settlements tab. The screen module is loaded on the click, not with this one. */
function openSettlements() {
  import("/emigration/ui/emigration-screen.js")
    .then((m) => m.openEmigrationScreen("cityflows"))
    .catch((e) => dlog("first loss: open threw " + e));
}

/**
 * Show the page for this pass's first tile loss when it is due, set the flag, and leave the Chronicle entry.
 * @param {*[]} events The pass's per-event buckets, largest first. @param {number} me The local player.
 * @param {{sample?:()=>boolean, flag?:()=>*, facts?:(ev:*, me:number)=>FirstLossFacts,
 *   show?:(view:*, onChoice:(id:string)=>void)=>void, open?:()=>void, mark?:(turn:number, city:string)=>void,
 *   chronicle?:(input:*)=>boolean}} [deps] Overrides (tests).
 * @returns {boolean} True when the page was shown, so the caller skips the pass's notice.
 */
export function maybeShowFirstLoss(events, me, deps = {}) {
  const ev = firstLossDue(events, deps);
  if (!ev) return false;
  try {
    const facts = (deps.facts || firstLossFacts)(ev, me);
    const view = firstLossView(ev, facts);
    (deps.mark || markFirstLoss)(gameTurn(), ev.srcName);
    (deps.chronicle || chronicle)({
      kind: "exodus", people: ev.people || 0, cause: ev.cause,
      title: loc("LOC_EMIG_FL_CHRONICLE_TITLE", "The First to Leave"),
      body: view.body.split("\n\n")[0], dedupeKey: "first-loss"
    });
    const open = deps.open || openSettlements;
    (deps.show || showDilemma)(view, (id) => { if (id === OPEN) open(); });
    return true;
  } catch (e) {
    dlog("first loss: " + e);
    return false;
  }
}
