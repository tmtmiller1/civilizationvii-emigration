// eep-modtest107.js - does emigration pressure EVER become non-zero, and for whom?
//
// mod test 106 found all 29 of the local player's cities at pressureToBar 0, so the banner bar had nothing to
// draw. That alone does not explain "never seen it in any run": it could be that this save's player simply has
// a strong empire, or it could be that pressure never accumulates anywhere. This reads the persisted
// per-source state for EVERY city in the game and plays turns, so the two are distinguishable:
//   - pressure non-zero for AI cities but never the player's => the feature is real but effectively invisible,
//     because the bar only ever draws on the local player's own banners.
//   - pressure zero everywhere, across turns => pressure accounting or its persistence is broken.
import { loadState } from "/emigration/ui/emigration-state.js";
import { CONFIG } from "/emigration/ui/emigration-config.js";
import { speedBar } from "/emigration/ui/emigration-game-speed.js";

const TAG = "[EmigTest]";
const TURNS = 12;
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { const v = fn(); return v === undefined ? fb : v; } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }

let local = -1, n = 0, endTurnTimer = null, blockedTries = 0, fallbacks = 0, done = false;
let everLocalPressure = 0, everAnyPressure = 0, peakLocal = 0, peakAny = 0;

function survey(tag) {
  const st = safe(() => loadState(), null);
  const sources = (st && st.sources) || {};
  const bar = safe(() => speedBar(CONFIG.emigrationBar), CONFIG.emigrationBar) || 1;
  const rows = Object.entries(sources).map(([k, v]) => ({
    k, owner: Number(String(k).split(":")[0]),
    p: Number((v && v.pressure) || 0), cp: Number((v && v.crisisPressure) || 0)
  }));
  const withP = rows.filter((r) => r.p > 0);
  const mine = rows.filter((r) => r.owner === local);
  const minePos = mine.filter((r) => r.p > 0);
  const maxAny = rows.reduce((m, r) => Math.max(m, r.p), 0);
  const maxMine = mine.reduce((m, r) => Math.max(m, r.p), 0);
  if (minePos.length) everLocalPressure = 1;
  if (withP.length) everAnyPressure = 1;
  peakLocal = Math.max(peakLocal, maxMine / bar);
  peakAny = Math.max(peakAny, maxAny / bar);
  emit(tag + " sources=" + rows.length + " withPressure=" + withP.length
    + " mine=" + mine.length + " minePositive=" + minePos.length
    + " maxAny=" + maxAny.toFixed(2) + " (" + (maxAny / bar * 100).toFixed(1) + "% of bar " + bar + ")"
    + " maxMine=" + maxMine.toFixed(2) + " (" + (maxMine / bar * 100).toFixed(1) + "%)"
    + " top=" + J(rows.sort((a, b) => b.p - a.p).slice(0, 4)));
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

function finish(why) {
  if (done) return;
  done = true;
  if (endTurnTimer) clearTimeout(endTurnTimer);
  survey("FINAL");
  emit("VERDICT anyCityEverHadPressure=" + (everAnyPressure ? "YES" : "NO")
    + " localCityEverHadPressure=" + (everLocalPressure ? "YES" : "NO")
    + " peakAny=" + (peakAny * 100).toFixed(1) + "% peakLocal=" + (peakLocal * 100).toFixed(1) + "%"
    + " (bar shows from 5%) turns=" + n + " reason=" + why);
  emit("DONE modtest107 finished");
}

function run() {
  local = safe(() => GameContext.localPlayerID, -1);
  emit("modtest107 run local=" + local);
  survey("START");
  setTimeout(endTurn, 3000);
}

engine.on("PlayerTurnActivated", (d) => {
  const who = d && (d.player ?? d.Player);
  if (who !== GameContext.localPlayerID || local < 0 || done) return;
  if (endTurnTimer) { clearTimeout(endTurnTimer); endTurnTimer = null; }
  n++; blockedTries = 0;
  setTimeout(() => {
    survey("T n=" + n);
    if (n >= TURNS) { finish("turns"); return; }
    setTimeout(endTurn, 2000);
  }, 5000);
});

emit("modtest107 attached");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() {
  const st = loadStateName();
  if (st === "GameStarted") {
    setTimeout(() => { try { run(); } catch (e) { emit("run threw " + e + " " + (e && e.stack)); emit("DONE modtest107 finished"); } }, 12000);
    return;
  }
  beginTries++;
  if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady());
  if (beginTries < 90) setTimeout(beginPoll, 2000); else { emit("LOAD gave up"); emit("DONE modtest107 finished"); }
}
setTimeout(beginPoll, 3000);
