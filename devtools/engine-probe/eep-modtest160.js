// eep-modtest160.js - how many tiles that departures and deaths abandon were damaged (still repairable)?
// Save: the turn-106 promo save (run-promo144.sh with SCRIPT=eep-modtest160.js). The mod runs untouched for TURNS
// turns; every abandoned tile is logged by the mod itself ("abandoned ... damaged=yes|no", emigration-departure-
// tile.js). This probe only ends turns, answers the mod's pop-ups (last button), and each turn counts the pillaged
// plots in every settlement's borders so the abandon counts can be read against how much damage was on the map.
// Damage age counts from the load turn: the tracker is in memory only, so a tile damaged before turn 106 reads 0
// at load.
const TAG = "[EmigTest]";
const TURNS = 10;
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function safe(fn, fb) { try { const v = fn(); return v === undefined ? fb : v; } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function later(ms) { return new Promise((r) => setTimeout(r, ms)); }
let local = -1;

function dialog() { const all = Array.from(document.querySelectorAll("screen-dialog-box")); return all[all.length - 1] || null; }
let answered = 0;
function answerDialogs() {
  const d = dialog();
  if (d) {
    const btns = Array.from(d.querySelectorAll("fxs-button"));
    if (btns.length) {
      answered++;
      safe(() => btns[btns.length - 1].dispatchEvent(new CustomEvent("action-activate", { bubbles: true })));
    }
  }
  const open = safe(() => Array.from(document.querySelectorAll("*")).filter((e) => /^SCREEN-/.test(e.tagName)
    && e.tagName !== "SCREEN-DIALOG-BOX" && e.querySelector("fxs-button, fxs-hero-button")), []);
  for (const e of open) {
    const b = Array.from(e.querySelectorAll("fxs-button, fxs-hero-button"));
    safe(() => b[b.length - 1].dispatchEvent(new CustomEvent("action-activate", { bubbles: true })));
  }
}

function pillageCensus() {
  let plots = 0, damaged = 0, localDamaged = 0;
  for (const p of safe(() => Players.getAlive(), []) || []) {
    for (const c of safe(() => p.Cities.getCities(), []) || []) {
      for (const idx of safe(() => c.getPurchasedPlots(), []) || []) {
        plots++;
        const loc = safe(() => GameplayMap.getLocationFromIndex(idx), null);
        if (!loc) continue;
        const hit = safe(() => (MapConstructibles.getConstructibles(loc.x, loc.y) || [])
          .some((cid) => Constructibles.getByComponentID(cid)?.damaged), false);
        if (hit) { damaged++; if (p.id === local) localDamaged++; }
      }
    }
  }
  return { plots, damaged, localDamaged };
}

let endTurnTimer = null, blockedTries = 0, usedAutoplay = 0, phase = "setup", turnResolve = null, turnAtSend = -1;
function endTurn() {
  try {
    const me = Players.get(local);
    if (!me.isTurnActive || GameContext.hasSentTurnComplete()) return;
    answerDialogs();
    const b = String(Game.Notifications.getEndTurnBlockingType(local));
    if (b !== String(EndTurnBlockingTypes.NONE)) {
      blockedTries++;
      if (blockedTries >= 4 && typeof Autoplay !== "undefined") {
        usedAutoplay++;
        emit("ENDTURN blocked: ONE AUTOPLAY TURN");
        safe(() => { Autoplay.setTurns(1); Autoplay.setReturnAsPlayer(local); Autoplay.setObserveAsPlayer(local); Autoplay.setActive(true); });
        blockedTries = 0; endTurnTimer = setTimeout(endTurn, 40000); return;
      }
      endTurnTimer = setTimeout(endTurn, 4000); return;
    }
    safe(() => UI.Player.deselectAllUnits()); GameContext.sendTurnComplete();
  } catch (e) { emit("ENDTURN threw " + e); }
  endTurnTimer = setTimeout(() => { if (safe(() => Players.get(local).isTurnActive, false) && !GameContext.hasSentTurnComplete()) endTurn(); }, 12000);
}
function nextTurn() {
  return new Promise((res) => {
    turnAtSend = safe(() => Game.turn, -1); turnResolve = res; blockedTries = 0; phase = "turn";
    endTurn();
    setTimeout(() => { if (turnResolve === res) { turnResolve = null; emit("TURN never advanced"); res(false); } }, 300000);
  });
}
engine.on("PlayerTurnActivated", (d) => {
  const who = d && (d.player ?? d.Player);
  if (who !== GameContext.localPlayerID || phase !== "turn") return;
  if (!(safe(() => Game.turn, -1) > turnAtSend)) return;
  if (endTurnTimer) { clearTimeout(endTurnTimer); endTurnTimer = null; }
  phase = "work";
  const res = turnResolve; turnResolve = null;
  setTimeout(() => { if (res) res(true); }, 15000); // let the mod's pass and its deferred writes land
});

async function run() {
  local = safe(() => GameContext.localPlayerID, -1);
  emit("booted=" + (typeof globalThis.emigration) + " turn=" + safe(() => Game.turn));
  const dialogTimer = setInterval(answerDialogs, 3000);
  await later(15000);
  emit("CENSUS turn=" + safe(() => Game.turn) + " " + JSON.stringify(pillageCensus()));
  for (let i = 0; i < TURNS; i++) {
    const ok = await nextTurn();
    emit("CENSUS turn=" + safe(() => Game.turn) + " advanced=" + ok + " " + JSON.stringify(pillageCensus()) + " autoplay=" + usedAutoplay + " answered=" + answered);
    if (!ok) break;
  }
  clearInterval(dialogTimer);
  emit("DONE modtest160 finished");
}

emit("modtest160 attached");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() {
  const st = loadStateName();
  if (st === "GameStarted") {
    setTimeout(() => { run().catch((e) => { emit("run threw " + e + " " + (e && e.stack)); emit("DONE modtest160 finished"); }); }, 10000);
    return;
  }
  beginTries++;
  if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady());
  if (beginTries < 90) setTimeout(beginPoll, 2000); else { emit("LOAD gave up"); emit("DONE modtest160 finished"); }
}
setTimeout(beginPoll, 3000);
