// eep-modtest82.js - do settlements in crisis even HAVE a homeland alternative? The at-scale runs (mod tests 69, 72)
// showed one neighbor taking nearly every cross-civ refugee, and four variants of a receiving-side cap failed to
// spread it (mod tests 71, 72, 74b) because that neighbor is the only refuge within reach. Before building an
// "internal displacement first" rule (a crisis source prefers its own civ's settlements), measure how often a crisis
// source has a viable destination inside its own civ and how much worse it scores than the best foreign one.
// AugustusExp66, the mod's pass ON at shipped defaults, 25 script-ended turns. Each turn, for every settlement the
// engine counts as in crisis: the best destination overall, the best one in its own civ, and both pull scores.
import { CONFIG, CONFIG_DEFAULTS } from "/emigration/ui/emigration-config.js";
import { collectCitySignals } from "/emigration/ui/emigration-cities.js";
import { rankByProsperity } from "/emigration/ui/emigration-prosperity.js";
import { ownerPopulations } from "/emigration/ui/emigration-state.js";
import { bestDestination } from "/emigration/ui/emigration-pull.js";
import { __test as E } from "/emigration/ui/emigration-engine.js";

const TURNS = 25;
const TAG = "[EmigTest]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function r1(v) { return typeof v === "number" ? Math.round(v * 10) / 10 : v; }

let local = -1, n = 0, endTurnTimer = null, blockedTries = 0, fallbacks = 0, done = false;
const tally = { crisisSources: 0, withDomestic: 0, domesticIsBest: 0, foreignBest: 0, noDestination: 0 };
const gaps = [];

// The shipped "Ask me" arrival dialog and refugee decisions wait for a person; answer them as mod test 57 does.
const ANSWERS = [/Let the city settle them/i, /Welcome them in/i];
function answerDialogs() {
  if (done) return;
  safe(() => {
    for (const d of Array.from(document.querySelectorAll("screen-dialog-box"))) {
      const buttons = Array.from(d.querySelectorAll("fxs-button, fxs-hero-button"));
      if (!buttons.length) continue;
      const label = (b) => String(b.getAttribute("caption") || b.textContent || "").trim();
      let pick = null;
      for (const re of ANSWERS) { pick = buttons.find((b) => re.test(label(b))); if (pick) break; }
      if (!pick) pick = buttons[buttons.length - 1];
      pick.dispatchEvent(new CustomEvent("action-activate", { bubbles: true }));
      break;
    }
  });
}
setInterval(answerDialogs, 1500);

function survey() {
  const signals = safe(() => collectCitySignals(), []) || [];
  if (!signals.length) return;
  const ranked = safe(() => rankByProsperity(signals), []) || [];
  const ownerPop = safe(() => ownerPopulations(ranked), {}) || {};
  const rows = [];
  for (const src of ranked) {
    if (!safe(() => E.inCrisis(src), false)) continue;
    tally.crisisSources++;
    const any = safe(() => bestDestination(src, ranked, ownerPop), null);
    const home = safe(() => bestDestination(src, ranked, ownerPop, (d) => d.owner === src.owner), null);
    if (!any) { tally.noDestination++; continue; }
    if (home) tally.withDomestic++;
    const foreign = any.dest.owner !== src.owner;
    if (!foreign) tally.domesticIsBest++; else tally.foreignBest++;
    if (foreign && home) gaps.push(Math.round((any.adjusted - home.adjusted) * 10) / 10);
    rows.push({
      src: src.key, owner: src.owner, siege: !!src.siege, viol: r1(src.violence), dis: r1(src.disaster),
      best: any.dest.owner, bestPull: r1(any.adjusted), home: home ? home.dest.key : null, homePull: home ? r1(home.adjusted) : null
    });
  }
  if (rows.length) emit("CRISIS turn=" + safe(() => Game.turn) + " " + J(rows.slice(0, 8)));
}

function finish(why) {
  if (done) return;
  done = true;
  gaps.sort((a, b) => a - b);
  const q = (p) => (gaps.length ? gaps[Math.min(gaps.length - 1, Math.floor(p * gaps.length))] : null);
  emit("SUMMARY (" + why + ") turns=" + n + " " + J(tally) +
    " foreignMinusHomePull p10/p50/p90=" + J([q(0.1), q(0.5), q(0.9)]) + " samples=" + gaps.length + " fallbacks=" + fallbacks);
  emit("DONE modtest82 finished");
}

function run() {
  local = GameContext.localPlayerID;
  Object.assign(CONFIG, CONFIG_DEFAULTS);
  emit("START turn=" + safe(() => Game.turn) + " escapeBonus=" + CONFIG.crisisEscapeBonus + " poachBlock=" + CONFIG.poachBlock);
  setTimeout(endTurn, 2000);
}

function endTurn() {
  if (done) return;
  try {
    const me = Players.get(local);
    if (!me.isTurnActive || GameContext.hasSentTurnComplete()) return;
    const b = String(Game.Notifications.getEndTurnBlockingType(local));
    if (b !== String(EndTurnBlockingTypes.NONE)) {
      blockedTries++;
      if (blockedTries >= 3 && typeof Autoplay !== "undefined") {
        fallbacks++;
        safe(() => { Autoplay.setTurns(1); Autoplay.setReturnAsPlayer(local); Autoplay.setObserveAsPlayer(local); Autoplay.setActive(true); });
        blockedTries = 0; endTurnTimer = setTimeout(endTurn, 30000); return;
      }
      endTurnTimer = setTimeout(endTurn, 4000); return;
    }
    safe(() => UI.Player.deselectAllUnits()); GameContext.sendTurnComplete();
  } catch (e) { emit("ENDTURN threw " + e); }
  endTurnTimer = setTimeout(() => { if (safe(() => Players.get(local).isTurnActive, false) && !GameContext.hasSentTurnComplete()) endTurn(); }, 12000);
}

engine.on("PlayerTurnActivated", (d) => {
  const who = d && (d.player ?? d.Player);
  if (who !== GameContext.localPlayerID || local < 0 || done) return;
  if (endTurnTimer) { clearTimeout(endTurnTimer); endTurnTimer = null; }
  n++; blockedTries = 0;
  setTimeout(() => {
    survey();
    if (n >= TURNS) { finish("turns"); return; }
    setTimeout(endTurn, 2000);
  }, 5000);
});
engine.on("GameAgeEnded", () => finish("age ended"));

emit("modtest82 attached");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() {
  const st = loadStateName();
  if (st === "GameStarted") { setTimeout(() => { try { run(); } catch (e) { emit("run threw " + e); emit("DONE modtest82 finished"); } }, 10000); return; }
  beginTries++;
  if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady());
  if (beginTries < 90) setTimeout(beginPoll, 2000); else emit("LOAD gave up");
}
setTimeout(beginPoll, 3000);
