// eep-modtest.js - in-game test of the emigration mod's new departure/arrival code paths, driven
// against REAL cities in a loaded save. Requires the emigration mod to be loaded (imports it).
// Logs [EmigTest] lines to UI.log via console.error.

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { consumeSourcePoint } from "/emigration/ui/emigration-refugee-staging.js";
import { commitSourcePoint, findDepartureTile, departureTileApiAvailable } from "/emigration/ui/emigration-departure-tile.js";
import { arriveRural, flushArrivalPlacements } from "/emigration/ui/emigration-arrival-placement.js";
import { runChecks } from "/emigration/ui/emigration-selftest-checks.js";

const TAG = "[EmigTest]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function later(ms) { return new Promise((r) => setTimeout(r, ms)); }

let local = -1, n = 0, endTurnTimer = null, blockedTries = 0;
function cityName(c) { return safe(() => Locale.compose(c.name), "?"); }
function improvements(c) {
  return safe(() => {
    let k = 0;
    for (const idx of c.getPurchasedPlots()) {
      const loc = GameplayMap.getLocationFromIndex(idx);
      for (const id of (MapConstructibles.getConstructibles(loc.x, loc.y) || [])) {
        const inst = Constructibles.getByComponentID(id);
        const info = inst ? GameInfo.Constructibles.lookup(inst.type) : null;
        if (info && info.ConstructibleClass === "IMPROVEMENT") k++;
      }
    }
    return k;
  }, null);
}
function snap(c) {
  if (!c) return null;
  return { name: cityName(c), owner: c.owner, pop: c.population, rural: c.ruralPopulation, pending: safe(() => c.pendingPopulation), improvements: improvements(c),
    food: safe(() => Math.round(c.Yields.getNetYield(YieldTypes.YIELD_FOOD) * 100) / 100), prod: safe(() => Math.round(c.Yields.getNetYield(YieldTypes.YIELD_PRODUCTION) * 100) / 100) };
}
function gold(pid) { return safe(() => Math.round(Players.get(pid).Treasury.goldBalance * 100) / 100, null); }
function migrants() { return safe(() => Players.get(local).Units.getUnits().filter((u) => GameInfo.Units.lookup(u.type)?.UnitType === "UNIT_MIGRANT").length, null); }
function sig(c) { return { city: c, owner: c.owner, rural: c.ruralPopulation, population: c.population, key: c.owner + ":" + c.id.id }; }

async function run() {
  local = GameContext.localPlayerID;
  emit("CONFIG departureRemovesTile=" + CONFIG.departureRemovesTile + " departureGold=" + CONFIG.departureGold + " arrivalPlacement=" + CONFIG.arrivalPlacement + " preferSpecialists=" + CONFIG.arrivalPreferSpecialists + " apiAvailable=" + departureTileApiAvailable());
  const mine = Players.get(local).Cities.getCities().filter((c) => !c.isTown).sort((a, b) => b.population - a.population);
  const towns = Players.get(local).Cities.getCities().filter((c) => c.isTown);
  const A = mine[0], B = mine[1] || mine[0], C = mine[2] || mine[0];
  const D = towns[0] || mine[3] || mine[0];
  let F = null;
  for (const p of Players.getAlive()) { if (p.id === local || !p.isMajor) continue; for (const c of p.Cities.getCities()) if (!F || c.population > F.population) F = c; }
  emit("TARGETS A(depart local)=" + cityName(A) + " B(arrive auto)=" + cityName(B) + " C(arrive ask)=" + cityName(C) + " D(arrive unit)=" + (D ? cityName(D) : "none") + " F(depart foreign)=" + (F ? cityName(F) : "none"));

  // S1: local departure (deferred tile commit + gold)
  {
    const s = sig(A); const g0 = gold(local); const before = snap(A);
    const tile = findDepartureTile(A);
    const consumed = consumeSourcePoint(s, "prosperity");
    const r = commitSourcePoint(s, consumed);
    emit("S1 depart " + cityName(A) + " chosen=" + J(tile && { plot: tile.plot, type: tile.type, onResource: tile.onResource, distance: tile.distance }) + " consumed=" + J(consumed) + " commit=" + J(r));
    await later(4000);
    emit("S1 RESULT before=" + J(before) + " after=" + J(snap(A)) + " goldBefore=" + g0 + " goldAfter=" + gold(local));
  }
  // S2: foreign departure
  if (F) {
    const s = sig(F); const g0 = gold(F.owner); const before = snap(F);
    const consumed = consumeSourcePoint(s, "war");
    const r = commitSourcePoint(s, consumed);
    emit("S2 depart foreign " + cityName(F) + " consumed=" + J(consumed) + " commit=" + J(r));
    await later(4000);
    emit("S2 RESULT before=" + J(before) + " after=" + J(snap(F)) + " ownerGoldBefore=" + g0 + " ownerGoldAfter=" + gold(F.owner));
  }
  // S3: arrival, automatic placement
  {
    CONFIG.arrivalPlacement = 1;
    const before = snap(B);
    const ok = arriveRural(B);
    emit("S3 arrive auto " + cityName(B) + " ok=" + ok);
    await later(4000);
    emit("S3 RESULT before=" + J(before) + " after=" + J(snap(B)));
  }
  // S4: arrival, ask (native dialog) — verify the dialog renders, then drive the "choose" path
  {
    CONFIG.arrivalPlacement = 2;
    const before = snap(C);
    const ok = arriveRural(C);
    emit("S4 arrive ask " + cityName(C) + " ok=" + ok + " pendingAfterWrite=" + safe(() => C.pendingPopulation));
    await later(2500);
    const dlg = safe(() => document.querySelector("screen-dialog-box") || document.querySelector("dialog-box") || [...document.querySelectorAll("*")].find((el) => el.children.length && /Newcomers in/.test(el.textContent || "") && !/Newcomers in/.test([...el.children].map((c) => c.textContent).join("") ) ), null) || safe(() => [...document.querySelectorAll("*")].filter((el) => /Newcomers in/.test(el.textContent || "")).pop(), null);
    const text = dlg ? safe(() => (dlg.textContent || "").replace(/\s+/g, " ").trim().slice(0, 300), "?") : "none";
    emit("S4 DIALOG element=" + (dlg ? dlg.tagName + "." + dlg.className : "none") + " text=\"" + text + "\"");
    let clicked = false;
    if (dlg) {
      const buttons = safe(() => [...dlg.querySelectorAll("fxs-button, button, [role='button'], .fxs-button")], []);
      emit("S4 DIALOG buttons=" + buttons.length + " labels=" + J(buttons.map((b) => (b.textContent || "").trim().slice(0, 40))));
      const choose = buttons.find((b) => /choose/i.test(b.textContent || "") || /where they settle/i.test(b.textContent || ""));
      if (choose) { safe(() => { choose.dispatchEvent(new CustomEvent("action-activate", { bubbles: true })); choose.click(); }); clicked = true; emit("S4 clicked the Choose option"); }
    }
    await later(2000);
    const im = await import("/core/ui/interface-modes/interface-modes.js").then((m) => m.InterfaceMode || m.default).catch(() => null);
    emit("S4 after click: interfaceMode=" + safe(() => im && im.getCurrent(), "?") + " clicked=" + clicked + " dialogStill=" + !!safe(() => document.querySelector("dialog-box"), null));
    if (im && safe(() => im.getCurrent(), "") !== "INTERFACEMODE_ACQUIRE_TILE") {
      safe(() => im.switchTo("INTERFACEMODE_ACQUIRE_TILE", { CityID: C.id }));
      await later(1500);
      emit("S4 direct switchTo -> interfaceMode=" + safe(() => im.getCurrent(), "?"));
    }
    await later(1500);
    safe(() => im && im.switchToDefault());
    // Clean up: settle the point automatically so it does not linger.
    CONFIG.arrivalPlacement = 1;
    await later(500);
    emit("S4 RESULT before=" + J(before) + " now=" + J(snap(C)));
  }
  // S5: arrival as a migrant unit
  if (D) {
    CONFIG.arrivalPlacement = 3;
    const m0 = migrants(); const before = snap(D);
    const ok = arriveRural(D);
    await later(3000);
    emit("S5 arrive unit " + cityName(D) + " ok=" + ok + " migrantsBefore=" + m0 + " migrantsAfter=" + migrants() + " cityBefore=" + J(before) + " cityAfter=" + J(snap(D)));
  }
  // S6: self-test rows
  {
    const rows = safe(() => runChecks(), []);
    for (const r of rows) if (/Departures|Arrivals/.test(r.label)) emit("S6 SELFTEST " + r.label + " [" + r.status + "] " + r.detail);
  }
  // S7: let the mod's real pass run for two turns with automatic placement.
  CONFIG.arrivalPlacement = 1;
  flushArrivalPlacements();
  emit("S7 ending turns; watch for [Emigration] abandoned / auto-placed lines");
  setTimeout(endTurn, 3000);
}

function endTurn() {
  try {
    const me = Players.get(local);
    if (!me.isTurnActive || GameContext.hasSentTurnComplete()) return;
    const b = String(Game.Notifications.getEndTurnBlockingType(local));
    if (b !== String(EndTurnBlockingTypes.NONE)) {
      blockedTries++;
      if (blockedTries >= 3 && typeof Autoplay !== "undefined") {
        emit("ENDTURN blocked; Autoplay 1 turn");
        safe(() => { Autoplay.setTurns(1); Autoplay.setReturnAsPlayer(local); Autoplay.setObserveAsPlayer(local); Autoplay.setActive(true); });
        blockedTries = 0; endTurnTimer = setTimeout(endTurn, 30000); return;
      }
      endTurnTimer = setTimeout(endTurn, 4000); return;
    }
    safe(() => UI.Player.deselectAllUnits()); GameContext.sendTurnComplete(); emit("ENDTURN sent");
  } catch (e) { emit("ENDTURN threw " + e); }
  endTurnTimer = setTimeout(() => { if (safe(() => Players.get(local).isTurnActive, false) && !GameContext.hasSentTurnComplete()) endTurn(); }, 12000);
}

engine.on("PlayerTurnActivated", (d) => {
  const who = d && (d.player ?? d.Player);
  if (who !== GameContext.localPlayerID) return;
  if (endTurnTimer) { clearTimeout(endTurnTimer); endTurnTimer = null; }
  n++;
  emit("TURN activated n=" + n + " turn=" + safe(() => Game.turn, "?"));
  if (n >= 2 && n <= 2) setTimeout(endTurn, 6000);
  if (n === 3) emit("DONE modtest finished");
});

emit("modtest attached");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() {
  const st = loadStateName();
  if (st === "GameStarted") { emit("LOAD GameStarted"); setTimeout(() => { n = 1; run().catch((e) => emit("run threw " + e)); }, 8000); return; }
  beginTries++;
  if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady());
  if (beginTries < 90) setTimeout(beginPoll, 2000); else emit("LOAD gave up");
}
setTimeout(beginPoll, 3000);
