// emigration-ai-stance-notice.js
//
// Tells the player when another civilization changes its immigration stance: "Persia closes its borders"
// when it slots the Anti-Immigration Stance, "opens" for the Pro-Immigration Stance, "drops its stance" when a
// card comes out. Without this the only sign was the Policies tab. Each civilization's last stance is kept in the
// save, so a reload doesn't announce every stance again; civilizations the player hasn't met stay silent.

import { borderStance } from "/emigration/ui/emigration-borders.js";
import { civHidden } from "/emigration/ui/emigration-governance.js";
import { civNameMsg } from "/emigration/ui/emigration-naming.js";
import { msg, msgText } from "/emigration/ui/emigration-loc.js";
import { toast } from "/emigration/ui/emigration-feedback.js";
import { chronicle } from "/emigration/ui/emigration-chronicle.js";
import { dlog } from "/emigration/ui/emigration-log.js";
import { registerCacheReset, resetCachesOnNewGame } from "/emigration/ui/emigration-cache-reset.js";

const STATE_KEY = "EmigrationAiStances_v1";

/** @type {Record<string, string>|null} Last stance seen per civ id. */
let _last = null;
registerCacheReset(() => {
  _last = null;
});

/** @param {*} o Parsed save value. @returns {Record<string, string>} String entries only. */
export function cleanStances(o) {
  /** @type {Record<string, string>} */
  const out = {};
  if (!o || typeof o !== "object") return out;
  for (const [k, v] of Object.entries(o)) if (typeof v === "string") out[k] = v;
  return out;
}

/** @returns {*} The parsed save value, or null. */
function readSave() {
  try {
    const raw = Configuration?.getGame?.()?.getValue?.(STATE_KEY);
    return typeof raw === "string" && raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

/** @returns {Record<string, string>} */
function state() {
  resetCachesOnNewGame();
  if (!_last) _last = cleanStances(readSave());
  return _last;
}

function persist() {
  try {
    Configuration?.editGame?.()?.setValue?.(STATE_KEY, JSON.stringify(_last || {}));
  } catch (_) {
    /* unwritable mid age-transition; kept in memory */
  }
}

/**
 * The line for a change of stance, as a message node; null when the change isn't worth a line.
 * @param {number} pid @param {string} was @param {string} now
 * @returns {*}
 */
export function stanceChangeMsg(pid, was, now) {
  const name = civNameMsg(pid);
  if (now === "anti") return msg("LOC_EMIG_AI_STANCE_CLOSES", "{1_Civ} closes its borders: an Anti-Immigration Stance.", name);
  if (now === "pro") return msg("LOC_EMIG_AI_STANCE_OPENS", "{1_Civ} opens its borders: a Pro-Immigration Stance.", name);
  if (was === "anti" || was === "pro") return msg("LOC_EMIG_AI_STANCE_DROPS", "{1_Civ} drops its immigration stance.", name);
  return null;
}

/**
 * @typedef {Object} StanceNoticeDeps Test seams.
 * @property {()=>number[]} [civs] The other alive major civilizations' ids.
 * @property {(pid:number)=>string} [stanceOf] A civ's stance ("pro" | "anti" | "none").
 * @property {(pid:number)=>boolean} [hidden] Whether the player hasn't met the civ.
 * @property {(line:string)=>void} [announce] Show the line.
 */

/** @returns {number[]} The other alive major civilizations. */
function liveCivs() {
  const out = [];
  try {
    const me = GameContext.localPlayerID;
    for (const p of Players.getAlive()) if (p.isMajor && p.id !== me) out.push(p.id);
  } catch (_) {
    /* unreadable */
  }
  return out;
}

/** @param {string} line */
function liveAnnounce(line) {
  toast(line, undefined, false, undefined, "world");
  chronicle({ kind: "policy", title: msg("LOC_EMIG_AI_STANCE_TITLE", "Borders Abroad"), body: line, dedupeKey: "aistance|" + line });
}

/**
 * Compare every other civilization's stance with the last one seen, and announce the changes. Once per local turn.
 * @param {StanceNoticeDeps} [deps]
 * @returns {number} How many lines were announced.
 */
export function noticeAiStances(deps) {
  const d = {
    civs: liveCivs, stanceOf: (/** @type {number} */ pid) => borderStance(pid) || "none", hidden: civHidden,
    announce: liveAnnounce, ...(deps || {})
  };
  const last = state();
  let n = 0;
  for (const pid of d.civs()) {
    const now = safeStance(d.stanceOf, pid);
    if (now === null) continue;
    const was = last[pid];
    last[pid] = now;
    if (was !== undefined && was !== now && !d.hidden(pid)) n += announceChange(pid, was, now, d.announce);
  }
  persist();
  return n;
}

/** @param {(pid:number)=>string} stanceOf @param {number} pid @returns {string|null} The stance, or null on a throw. */
function safeStance(stanceOf, pid) {
  try {
    return stanceOf(pid) || "none";
  } catch (e) {
    dlog("stance read threw " + e);
    return null;
  }
}

/**
 * @param {number} pid @param {string} was @param {string} now @param {(line:string)=>void} announce
 * @returns {number} 1 when a line went out.
 */
function announceChange(pid, was, now, announce) {
  const line = stanceChangeMsg(pid, was, now);
  if (!line) return 0;
  announce(msgText(line));
  return 1;
}

/** Test seam: forget the stances seen. */
export function _forgetAiStances() {
  _last = null;
}
