// eep-modtest148.js - the two probes the ethnicity-audit plan gates O1 and O4 on (docs/ethnicity-audit-solution-designs.md).
// Save: EmigShots072 (the promo game at turn 72, which has conquests and the Rostov on Don enclave). Runs the INSTALLED
// emigration copy, i.e. the code from before the audit fixes; nothing here depends on them.
//
// O4 step 1: is city.originalOwner populated, and does it differ from city.owner on conquered cities?
//   OWNER lines, one per city: owner, originalOwner, both players' kinds, and the ledger's mix for that city.
// O1: does the ethnicity lens layer repaint when it is cleared and painted from OUTSIDE LensManager's apply call?
//   A (a timer): SHOT o1-a-lens (as applied), o1-a-cleared (layer.clear()), o1-a-magenta (Rostov's plots painted
//     magenta through the layer's own overlay), o1-a-restored (clear + applyLayer()).
//   B (inside a real PlayerTurnActivated handler, lens left open across End Turn): the handler clears the layer and
//     paints Rostov magenta synchronously; SHOT o1-b-turn 6 s later.
// O4 step 3: civDisplayColor / civAdjective on real city-state and Independent Power ids. LAST, and each call is logged
//   before it is made, because a bad player id reaching a native API has crashed the game before.
import LensManager from "/core/ui/lenses/lens-manager.js";
import { compositionForCity } from "/emigration/ui/emigration-composition.js";
import { civDisplayColor } from "/emigration/ui/emigration-civ-colors.js";
import { civAdjective } from "/emigration/ui/emigration-naming.js";

const TAG = "[EmigTest]";
const ETHN = "emig-ethnicity-lens";
const LAYER = "emig-ethnicity-layer";
const CITY = "Rostov on Don";
const MAGENTA = { x: 1, y: 0, z: 1, w: 0.95 };
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { const v = fn(); return v === undefined ? fb : v; } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function later(ms) { return new Promise((r) => setTimeout(r, ms)); }
let local = -1;
let phase = "setup";
let rostov = null;
let rostovPlots = [];

async function dismissPopups() {
  for (let i = 0; i < 6; i++) {
    const open = safe(() => Array.from(document.querySelectorAll("*")).filter((e) => /^SCREEN-/.test(e.tagName)
      && e.querySelector("fxs-button, fxs-hero-button")), []);
    if (!open.length) return;
    for (const e of open) {
      emit("POPUP dismissing " + e.tagName.toLowerCase());
      const btns = Array.from(e.querySelectorAll("fxs-button, fxs-hero-button"));
      safe(() => btns[btns.length - 1].dispatchEvent(new CustomEvent("action-activate", { bubbles: true })));
    }
    await later(2500);
  }
}

function kind(pid) {
  const p = safe(() => Players.get(pid), null);
  if (!p) return "none";
  return safe(() => (p.isMajor ? "major" : p.isMinor ? "minor" : p.isIndependent ? "indep" : "other"), "?");
}
function allCities() { return safe(() => Players.getAlive().flatMap((p) => safe(() => p.Cities.getCities() || [], [])), []); }

// ── O4 step 1 ─────────────────────────────────────────────────────────────────────────────
function surveyOwners() {
  let differ = 0, same = 0, missing = 0;
  for (const c of allCities()) {
    const owner = safe(() => c.owner, null);
    const orig = safe(() => c.originalOwner, "ERR");
    const loc = safe(() => c.location.x + "," + c.location.y, "?");
    const comp = safe(() => compositionForCity(c), null);
    const mix = comp ? comp.civs.slice(0, 3).map((x) => x.civ + ":" + Math.round(x.share * 100)).join(" ") : "none";
    if (typeof orig !== "number") missing++; else if (orig !== owner) differ++; else same++;
    emit("OWNER " + safe(() => Locale.compose(c.name), "?") + " at=" + loc + " owner=" + owner + "(" + kind(owner) + ")"
      + " originalOwner=" + J(orig) + "(" + (typeof orig === "number" ? kind(orig) : "-") + ")"
      + " transfer=" + J(safe(() => c.mostRecentTransferType, null)) + " ledger=" + mix);
  }
  emit("OWNERS summary differ=" + differ + " same=" + same + " missing=" + missing);
}

// ── O1 ────────────────────────────────────────────────────────────────────────────────────
function layer() { return safe(() => LensManager.layers.get(LAYER), null); }
function paintRostovMagenta(where) {
  const L = layer();
  if (!L) { emit("O1 " + where + " no layer"); return; }
  const r1 = safe(() => { L.clear(); return "ok"; });
  const r2 = safe(() => { L.overlay.addPlots(rostovPlots, { fillColor: MAGENTA, edgeColor: MAGENTA }); return "ok"; });
  emit("O1 " + where + " clear=" + r1 + " addPlots=" + r2 + " plots=" + rostovPlots.length + " activeLens=" + safe(() => LensManager.activeLens));
}

async function probeO1Timer() {
  rostov = allCities().find((c) => safe(() => Locale.compose(c.name)) === CITY) || null;
  if (!rostov) { emit("O1 no " + CITY); return false; }
  rostovPlots = safe(() => rostov.getPurchasedPlots().map((i) => GameplayMap.getLocationFromIndex(i)), []);
  emit("O1 rostov at=" + J(safe(() => rostov.location)) + " plots=" + rostovPlots.length);
  await dismissPopups();
  safe(() => Camera.lookAtPlot(rostov.location, { zoom: 0.45 }));
  await later(15000);
  safe(() => LensManager.setActiveLens(ETHN));
  await later(5000);
  const L = layer();
  emit("O1 layer=" + !!L + " hasOverlay=" + !!(L && L.overlay) + " activeLens=" + safe(() => LensManager.activeLens));
  emit("SHOT o1-a-lens");
  await later(9000);
  await new Promise((res) => setTimeout(() => { emit("O1 timer clear=" + safe(() => { layer().clear(); return "ok"; })); res(); }, 10));
  await later(4000);
  emit("SHOT o1-a-cleared");
  await later(9000);
  await new Promise((res) => setTimeout(() => { paintRostovMagenta("timer"); res(); }, 10));
  await later(4000);
  emit("SHOT o1-a-magenta");
  await later(9000);
  await new Promise((res) => setTimeout(() => {
    emit("O1 timer reapply=" + safe(() => { layer().clear(); layer().applyLayer(); return "ok"; }));
    res();
  }, 10));
  await later(4000);
  emit("SHOT o1-a-restored");
  await later(9000);
  return true;
}

// ── End turn (from mod test 142) ──────────────────────────────────────────────────────────
let endTurnTimer = null, blockedTries = 0;
function endTurn() {
  try {
    const me = Players.get(local);
    if (!me.isTurnActive || GameContext.hasSentTurnComplete()) return;
    const b = String(Game.Notifications.getEndTurnBlockingType(local));
    if (b !== String(EndTurnBlockingTypes.NONE)) {
      blockedTries++;
      if (blockedTries >= 3 && typeof Autoplay !== "undefined") {
        emit("ENDTURN blocked (" + b + "), one Autoplay turn");
        safe(() => { Autoplay.setTurns(1); Autoplay.setReturnAsPlayer(local); Autoplay.setObserveAsPlayer(local); Autoplay.setActive(true); });
        blockedTries = 0; endTurnTimer = setTimeout(endTurn, 30000); return;
      }
      endTurnTimer = setTimeout(endTurn, 4000); return;
    }
    safe(() => UI.Player.deselectAllUnits()); GameContext.sendTurnComplete();
    emit("ENDTURN sent at turn " + safe(() => Game.turn));
  } catch (e) { emit("ENDTURN threw " + e); }
  endTurnTimer = setTimeout(() => { if (safe(() => Players.get(local).isTurnActive, false) && !GameContext.hasSentTurnComplete()) endTurn(); }, 12000);
}

engine.on("PlayerTurnActivated", (d) => {
  const who = d && (d.player ?? d.Player);
  if (who !== GameContext.localPlayerID || phase !== "turn") return;
  if (endTurnTimer) { clearTimeout(endTurnTimer); endTurnTimer = null; }
  phase = "after";
  emit("TURN activated turn=" + safe(() => Game.turn) + " activeLens=" + safe(() => LensManager.activeLens));
  paintRostovMagenta("PlayerTurnActivated"); // synchronously, inside the engine's event handler
  setTimeout(() => { afterTurn().catch((e) => { emit("afterTurn threw " + e); emit("DONE modtest148 finished"); }); }, 100);
});

async function afterTurn() {
  await later(6000);
  safe(() => Camera.lookAtPlot(rostov.location, { zoom: 0.45 }));
  await later(15000);
  emit("SHOT o1-b-turn");
  await later(9000);
  safe(() => LensManager.setActiveLens("fxs-default-lens"));
  await dismissPopups();
  probeO4Names();
  emit("DONE modtest148 finished");
}

// ── O4 step 3 ─────────────────────────────────────────────────────────────────────────────
function probeO4Names() {
  const alive = safe(() => Players.getAlive().map((p) => p.id), []);
  const minors = alive.filter((id) => kind(id) === "minor").slice(0, 3);
  const indeps = alive.filter((id) => kind(id) === "indep").slice(0, 3);
  emit("O4 minors=" + J(minors) + " indeps=" + J(indeps));
  for (const pid of minors.concat(indeps)) {
    if (!safe(() => Players.get(pid), null)) continue;
    emit("O4 CALL civDisplayColor " + pid);
    const col = safe(() => civDisplayColor(pid, "#888888"));
    emit("O4 CALL civAdjective " + pid);
    const adj = safe(() => civAdjective(pid));
    emit("O4 NAME pid=" + pid + " kind=" + kind(pid) + " color=" + J(col) + " adjective=" + J(adj));
  }
}

async function run() {
  local = safe(() => GameContext.localPlayerID, -1);
  emit("modtest148 run local=" + local + " turn=" + safe(() => Game.turn) + " emigrationBooted=" + (typeof globalThis.emigration));
  await later(6000);
  await dismissPopups();
  surveyOwners();
  const ok = await probeO1Timer();
  if (!ok) { probeO4Names(); emit("DONE modtest148 finished"); return; }
  phase = "turn";
  emit("O1 ending turn with the lens open");
  endTurn();
  setTimeout(() => { if (phase === "turn") { emit("TURN never activated"); probeO4Names(); emit("DONE modtest148 finished"); } }, 240000);
}

emit("modtest148 attached");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() {
  const st = loadStateName();
  if (st === "GameStarted") {
    setTimeout(() => { run().catch((e) => { emit("run threw " + e + " " + (e && e.stack)); emit("DONE modtest148 finished"); }); }, 10000);
    return;
  }
  beginTries++;
  if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady());
  if (beginTries < 90) setTimeout(beginPoll, 2000); else { emit("LOAD gave up"); emit("DONE modtest148 finished"); }
}
setTimeout(beginPoll, 3000);
