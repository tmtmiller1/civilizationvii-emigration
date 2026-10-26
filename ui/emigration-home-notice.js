// emigration-home-notice.js
//
// The reminder that people of yours are displaced and the Displaced tab is where to act on it. It replaces the
// pop-up that used to offer the paid call once things were calm (the owner, 2026-10-26: "the popup for hastening
// should instead just send you to the displaced screen where you can choose settlements specifically", then "a
// reminder... when the number of people that have moved hits above a threshold - but with some logic so as to
// not be annoying and so that it can be permanently dismissed"). A small pop-up with three buttons: open the tab,
// not now, don't remind me again (the last flips `callHomeOfferWhenCalm`, the same switch as Options and the tab's
// own link). It speaks when at least `homeNoticeMinAway` people are away and a home is calm enough to receive
// them; again only once the count has grown by half (and by the threshold) and NOTICE_GAP turns have passed; a
// count that stands still never speaks again. "Not now" counts as a notice, so the half-again rule starts over.
// "Calm" is a settlement's own, the same count the free homecoming keeps: some home with people away has been
// calm long enough for them to return. Asking for the whole empire to be free of distress never came true in an
// eleven-city game (watched 2026-10-26), so the reminder never spoke. The pop-up closes on a homecoming epigraph
// in the player's own civilization's voice (the owner, 2026-10-26: "put the quotes on the reminder pop-up"), the
// same lines the paid call's dialog used to carry; one quote per notice, fixed by the player and the turn.

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { callHomeCandidates } from "/emigration/ui/emigration-call-home.js";
import { callHomeResolvable } from "/emigration/ui/emigration-call-home-action.js";
import { displacedQuoteFor } from "/emigration/ui/emigration-displaced-quotes.js";
import { homecomingStatus } from "/emigration/ui/emigration-homecoming.js";
import { msg, msgText } from "/emigration/ui/emigration-loc.js";
import { showDilemma } from "/emigration/ui/emigration-dilemma-view.js";
import { openEmigrationScreen } from "/emigration/ui/emigration-screen.js";
import { setTunable } from "/emigration/ui/emigration-settings.js";
import { dlog } from "/emigration/ui/emigration-log.js";

const SAVE_KEY = "EmigrationHomeNotice_v1";
/** The fewest turns between two notices. */
export const NOTICE_GAP = 10;
/** A repeat needs the count to have grown by this share since the last notice. */
export const NOTICE_GROWTH = 0.5;
const OPEN = "open";
const LATER = "later";
const NEVER = "never";

/**
 * @typedef {Object} HomeNoticeDeps Test seams; each defaults to the live game.
 * @property {(pid:number)=>boolean} [calm] Some home with people away is calm enough for them to come back.
 * @property {(pid:number)=>number} [away] Population points displaced from settlements you still hold.
 * @property {(pid:number)=>{turn:number, away:number}|null} [last] The last notice.
 * @property {(pid:number, rec:{turn:number, away:number})=>void} [remember]
 * @property {(view:*, onChoice:(id:string)=>void)=>void} [show] Raises the pop-up.
 * @property {()=>void} [open] Opens the Displaced tab.
 * @property {()=>void} [stop] Turns the reminders off for good.
 * @property {()=>number} [turn]
 * @property {string} [quote] The epigraph, in place of the one picked for the player and turn.
 */

/**
 * Whether a notice is due: at least `min` away; the first time, or once the count has grown by half and by `min`
 * since the last notice and `gap` turns have passed. A count that stands still is never repeated.
 * @param {{turn:number, away:number}|null|undefined} last The last notice. @param {number} away People away now.
 * @param {number} turn @param {number} [min] @param {number} [gap] @returns {boolean}
 */
export function homeNoticeDue(last, away, turn, min = minAway(), gap = NOTICE_GAP) {
  const floor = Math.max(1, min);
  if (!(away >= floor)) return false;
  if (!last) return true;
  const before = Number(last.away) || 0;
  if (turn - (Number(last.turn) || 0) < gap) return false;
  return away >= before + Math.max(floor, Math.ceil(before * NOTICE_GROWTH));
}

/** @returns {number} The threshold from the tunables. */
function minAway() {
  return Math.max(1, Math.floor(Number(CONFIG.homeNoticeMinAway) || 1));
}

/** @param {number} pid @returns {*[]} The pairs away from settlements still held, inside and abroad. */
function livePairs(pid) {
  const c = callHomeCandidates(pid);
  const ok = callHomeResolvable(pid);
  return c.internal.concat(c.external).filter((p) => ok(p));
}

/** @param {number} pid @returns {number} Points away from settlements still held, inside and abroad. */
function liveAway(pid) {
  return livePairs(pid).reduce((n, p) => n + p.points, 0);
}

/**
 * Whether some home with people away has been calm for the turns the free homecoming asks (with homecoming off,
 * any home with people away counts: the paid call is the only way back then).
 * @param {number} pid @returns {boolean}
 */
function liveCalm(pid) {
  const homes = new Set(livePairs(pid).map((p) => p.home));
  if (!CONFIG.homecomingEnabled) return homes.size > 0;
  for (const home of homes) {
    const st = homecomingStatus(pid, home);
    if (st.calm >= st.needed) return true;
  }
  return false;
}

/** @returns {Record<string, {turn:number, away:number}>} */
function readAll() {
  try {
    const raw = Configuration.getGame().getValue(SAVE_KEY);
    const parsed = typeof raw === "string" ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_) {
    return {};
  }
}

/** @param {number} pid @returns {{turn:number, away:number}|null} */
function liveLast(pid) {
  const rec = readAll()[String(pid)];
  return rec && typeof rec === "object" ? { turn: Number(rec.turn) || 0, away: Number(rec.away) || 0 } : null;
}

/** @param {number} pid @param {{turn:number, away:number}} rec */
function liveRemember(pid, rec) {
  try {
    const all = readAll();
    all[String(pid)] = rec;
    Configuration.editGame().setValue(SAVE_KEY, JSON.stringify(all));
  } catch (e) {
    dlog("home notice: save threw " + e);
  }
}

/**
 * The pop-up: what it says, its homecoming epigraph and its three buttons.
 * @param {number} away @param {string} [quote] The epigraph; "" draws none.
 * @returns {{title:string, body:string, quote:string, dismissId:string, choices:{id:string, label:string,
 *   note:string}[]}}
 */
export function homeNoticeView(away, quote = "") {
  return {
    title: msgText(msg("LOC_EMIG_HOME_NOTICE_TITLE", "Your people can come home")),
    body: msgText(msg("LOC_EMIG_HOME_NOTICE",
      "{1_Count} of your people are displaced from settlements you still hold, and a settlement they fled is safe "
      + "again. The Settlements tab shows where they are, when they come back on their own, and what bringing them back "
      + "sooner costs.", away)),
    quote,
    dismissId: LATER,
    choices: [
      { id: OPEN, label: msgText(msg("LOC_EMIG_HOME_NOTICE_OPEN", "Open the Settlements tab")),
        note: msgText(msg("LOC_EMIG_HOME_NOTICE_OPEN_N",
          "Each settlement people fled shows them under its charts; bring them back from there.")) },
      { id: LATER, label: msgText(msg("LOC_EMIG_HOME_NOTICE_LATER", "Not now")),
        note: msgText(msg("LOC_EMIG_HOME_NOTICE_LATER_N",
          "You'll be reminded again only once half again as many are displaced, and not for at least {1_Turns} turns.",
          NOTICE_GAP)) },
      { id: NEVER, label: msgText(msg("LOC_EMIG_HOME_NOTICE_NEVER", "Don't remind me again")),
        note: msgText(msg("LOC_EMIG_HOME_NOTICE_NEVER_N",
          "Turns these reminders off for good; Options, Mods, Emigration turns them back on.")) }
    ]
  };
}

/**
 * Remind the player once a home is calm and people are still away. Gated by `callHomeOfferWhenCalm`, the same
 * switch that used to raise the paid-call pop-up.
 * @param {number} pid The local player. @param {HomeNoticeDeps} [deps]
 * @returns {boolean} Whether the pop-up went up.
 */
export function noticeDisplacedWhenCalm(pid, deps) {
  if (!CONFIG.callHomeEnabled || !CONFIG.callHomeOfferWhenCalm) return false;
  if (typeof pid !== "number" || pid < 0) return false;
  const d = {
    calm: liveCalm, away: liveAway, last: liveLast, remember: liveRemember, turn: () => Number(Game.turn) || 0,
    show: showDilemma, open: () => openEmigrationScreen("cityflows"),
    stop: () => setTunable("callHomeOfferWhenCalm", false), ...deps
  };
  try {
    if (!d.calm(pid)) return false;
    const away = d.away(pid);
    const turn = d.turn();
    if (!homeNoticeDue(d.last(pid), away, turn)) return false;
    d.remember(pid, { turn, away });
    const quote = typeof d.quote === "string" ? d.quote : displacedQuoteFor(pid, "return", "home-notice|" + pid + "|" + turn);
    d.show(homeNoticeView(away, quote), (id) => {
      if (id === OPEN) d.open();
      else if (id === NEVER) d.stop();
    });
    return true;
  } catch (e) {
    dlog("home notice threw " + e);
    return false;
  }
}
