// eep-modtest56.js - game-speed scaling IN GAME. Runs in a NEW game started at the runner's SPEED by
// eep-shell-speed.js, with CONFIG at its shipped defaults. Reads the engine's speed three ways (Configuration
// gameSpeedType, the GameInfo.GameSpeeds row, EconomicRules.adjustForGameSpeed) and the mod's scalar and
// transforms, checks them against S = CostMultiplier / 100, then ends TURNS turns and checks the mod's pass ran
// on each (telemetry `passes`). One VERDICT line per run.
import { CONFIG, CONFIG_DEFAULTS } from "/emigration/ui/emigration-config.js";
import { gameSpeedScalar, speedTurns, speedBar, speedDecay, speedShock, resetGameSpeedCache } from "/emigration/ui/emigration-game-speed.js";
import { telemetryCounters } from "/emigration/ui/emigration-telemetry.js";

const TAG = "[EmigTest]";
const TURNS = 6;
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function near(a, b) { return typeof a === "number" && typeof b === "number" && Math.abs(a - b) < 1e-6; }

let local = -1, n = 0, passes0 = 0, endTurnTimer = null, blockedTries = 0, fallbacks = 0, S = 1, speedName = "?";
let staticOk = false;

function passes() { return Number(safe(() => telemetryCounters().passes, 0)) || 0; }

function checkStatic() {
  Object.assign(CONFIG, CONFIG_DEFAULTS);
  resetGameSpeedCache();
  const type = safe(() => Configuration.getGame().gameSpeedType, null);
  const row = safe(() => GameInfo.GameSpeeds.lookup(type), null);
  speedName = row && row.GameSpeedType ? row.GameSpeedType : "?";
  S = row && typeof row.CostMultiplier === "number" ? row.CostMultiplier / 100 : NaN;
  const modS = gameSpeedScalar();
  const expTurns = (t) => (S === 1 ? t : Math.max(1, Math.round(t * S)));
  const expDecay = (d) => (S === 1 ? d : Math.min(0.999, Math.max(0.001, Math.pow(d, 1 / S))));
  const checks = {
    scalar: near(modS, S),
    turns: speedTurns(CONFIG.cooldownTurns) === expTurns(CONFIG.cooldownTurns),
    bar: near(speedBar(10), 10 * S),
    decay: near(speedDecay(0.5), expDecay(0.5)),
    shock: near(speedShock(1), 1 / S)
  };
  staticOk = Object.values(checks).every(Boolean);
  const applied = {};
  for (const k of ["cooldownTurns", "transitLagTurns", "deathRampTurns", "quarterDwellTurns", "quarterFadeTurns", "returnCooldownTurns", "dilemmaCooldownTurns"]) {
    if (typeof CONFIG[k] === "number") applied[k] = CONFIG[k] + "->" + speedTurns(CONFIG[k]);
  }
  emit("SPEED type=" + J(type) + " row=" + J(row && { GameSpeedType: row.GameSpeedType, CostMultiplier: row.CostMultiplier }) +
    " S=" + S + " modS=" + modS + " tuningEnabled=" + CONFIG.gameSpeedTuningEnabled +
    " engineAdjust100=" + J(safe(() => Game.EconomicRules.adjustForGameSpeed(100))) +
    " turnInterval=" + CONFIG.turnInterval + " checks=" + J(checks) + " applied=" + J(applied));
}

function run() {
  local = GameContext.localPlayerID;
  checkStatic();
  passes0 = passes();
  emit("START turn=" + safe(() => Game.turn) + " passes0=" + passes0 + " ending " + TURNS + " turns");
  setTimeout(endTurn, 2000);
}

function endTurn() {
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
  if (who !== GameContext.localPlayerID || local < 0) return;
  if (endTurnTimer) { clearTimeout(endTurnTimer); endTurnTimer = null; }
  n++; blockedTries = 0;
  if (n >= TURNS) {
    setTimeout(() => {
      const ran = passes() - passes0;
      const expected = Math.floor(TURNS / Math.max(1, CONFIG.turnInterval));
      const passOk = ran >= expected - 1;
      emit("VERDICT speed=" + speedName + " S=" + S + " static=" + staticOk + " passes=" + ran + "/" + TURNS +
        " turn=" + safe(() => Game.turn) + " autoplayFallbacks=" + fallbacks + " result=" + (staticOk && passOk ? "PASS" : "FAIL"));
      emit("DONE modtest56 finished");
    }, 6000);
    return;
  }
  setTimeout(endTurn, 5000);
});

emit("modtest56 attached");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() {
  const st = loadStateName();
  if (st === "GameStarted") { setTimeout(() => { try { run(); } catch (e) { emit("run threw " + e + " " + (e && e.stack)); emit("DONE modtest56 finished"); } }, 10000); return; }
  beginTries++;
  if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady());
  if (beginTries < 150) setTimeout(beginPoll, 2000); else emit("LOAD gave up");
}
setTimeout(beginPoll, 3000);
