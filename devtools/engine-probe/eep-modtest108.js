// eep-modtest108.js - WATCH the banner pressure bar actually draw, after the context fix.
//
// The defect (mod test 107): `installBannerPressure()` was called from the gameplay bootstrap
// (emigration-main.js), which registered the decorator in a context that never instantiates a city-banner.
// `Controls.decorate` reported success and the per-turn refresh ran on schedule, but `_mounted` stayed empty,
// so the log read "banner pressure: refresh(turn) banners=0 visible=0" on all 12 turns while the player's own
// cities sat at up to 99% of the move bar. The module now self-installs at module scope, as the lenses do.
//
// The proof this run looks for, in order of strength:
//   1. "banner pressure: refresh(turn) banners=N" with N > 0  -> decorators are attaching at last.
//   2. visible=M with M > 0                                   -> bars are actually being shown.
//   3. a screenshot of the highest-pressure own city           -> the bar is really on screen.
// Pressure needs a few turns to build from a cold load (the persisted source map starts empty).
import { loadState } from "/emigration/ui/emigration-state.js";
import { CONFIG } from "/emigration/ui/emigration-config.js";
import { speedBar } from "/emigration/ui/emigration-game-speed.js";

const TAG = "[EmigTest]";
const TURNS = 10;
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { const v = fn(); return v === undefined ? fb : v; } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }

let local = -1, n = 0, endTurnTimer = null, blockedTries = 0, done = false;

/** The local player's city with the most pressure, so the camera lands somewhere the bar should be drawn. */
function hottestOwnCity() {
  const st = safe(() => loadState(), null);
  const sources = (st && st.sources) || {};
  const bar = safe(() => speedBar(CONFIG.emigrationBar), CONFIG.emigrationBar) || 1;
  let best = null;
  for (const [k, v] of Object.entries(sources)) {
    if (Number(String(k).split(":")[0]) !== local) continue;
    const p = Number((v && v.pressure) || 0);
    if (!best || p > best.p) best = { key: k, p, pct: p / bar };
  }
  return best;
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
        safe(() => { Autoplay.setTurns(1); Autoplay.setReturnAsPlayer(local); Autoplay.setObserveAsPlayer(local); Autoplay.setActive(true); });
        blockedTries = 0; endTurnTimer = setTimeout(endTurn, 30000); return;
      }
      endTurnTimer = setTimeout(endTurn, 4000); return;
    }
    safe(() => UI.Player.deselectAllUnits()); GameContext.sendTurnComplete();
  } catch (e) { emit("ENDTURN threw " + e); }
  endTurnTimer = setTimeout(() => { if (safe(() => Players.get(local).isTurnActive, false) && !GameContext.hasSentTurnComplete()) endTurn(); }, 12000);
}

function finish() {
  if (done) return;
  done = true;
  if (endTurnTimer) clearTimeout(endTurnTimer);
  const hot = hottestOwnCity();
  emit("HOTTEST own city " + J(hot));
  const cities = safe(() => Players.get(local).Cities.getCities(), []);
  let target = null;
  for (const c of cities) {
    const key = safe(() => c.owner + ":" + (c.localId ?? c.id), "");
    if (hot && key === hot.key) target = c;
  }
  const loc = safe(() => (target || cities[0]).location, null);
  emit("CAMERA to " + J(loc) + " (" + safe(() => Locale.compose((target || cities[0]).name), "?") + ")");
  safe(() => Camera.lookAtPlot(loc));
  setTimeout(() => { emit("SHOT banner_bar"); setTimeout(() => emit("DONE modtest108 finished"), 20000); }, 16000);
}

function run() {
  local = safe(() => GameContext.localPlayerID, -1);
  emit("modtest108 run local=" + local + " mode=" + J(CONFIG.bannerPressureBar));
  setTimeout(endTurn, 3000);
}

engine.on("PlayerTurnActivated", (d) => {
  const who = d && (d.player ?? d.Player);
  if (who !== GameContext.localPlayerID || local < 0 || done) return;
  if (endTurnTimer) { clearTimeout(endTurnTimer); endTurnTimer = null; }
  n++; blockedTries = 0;
  setTimeout(() => {
    const hot = hottestOwnCity();
    emit("T n=" + n + " hottestOwn=" + (hot ? (hot.pct * 100).toFixed(1) + "%" : "none"));
    if (n >= TURNS) { finish(); return; }
    setTimeout(endTurn, 2000);
  }, 5000);
});

emit("modtest108 attached");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() {
  const st = loadStateName();
  if (st === "GameStarted") {
    setTimeout(() => { try { run(); } catch (e) { emit("run threw " + e + " " + (e && e.stack)); emit("DONE modtest108 finished"); } }, 12000);
    return;
  }
  beginTries++;
  if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady());
  if (beginTries < 90) setTimeout(beginPoll, 2000); else { emit("LOAD gave up"); emit("DONE modtest108 finished"); }
}
setTimeout(beginPoll, 3000);
