// eep-modtest150.js - ethnicity audit item 3 on real data: AugustusAnt99 (game B, turn 99). Its ledger still holds Rouen
// (last seen turn 60) and Butoolo (last seen turn 97), settlements no longer in the pass's city list. Runs the DEPLOYED
// emigration copy (with the fix). At load: log each entry, what stands on its plot, and whether the live readers list
// it. After one End Turn (one pass): a razed one must be gone from the ledger; a standing one (city-state or
// independent) kept but absent from allCityCompositions and the diversity list. VERDICT item3-real PASS|FAIL.
// Also O1 attribution: the ethnicity lens is left open across the End Turn with its applyLayer wrapped to record the
// caller's stack, so a repaint can be told apart as the lens's own hook (repaintIfStale) or LensManager.
import { __test as comp, allCityCompositions } from "/emigration/ui/emigration-composition.js";
import { diverseCityRanking } from "/emigration/ui/emigration-diversity.js";
import LensManager from "/core/ui/lenses/lens-manager.js";

const TAG = "[EmigTest]";
const WATCH = ["60,21", "82,21"];
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { const v = fn(); return v === undefined ? fb : v; } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function later(ms) { return new Promise((r) => setTimeout(r, ms)); }
let local = -1;

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
function nameOf(c) { return safe(() => Locale.compose(c.name), "?"); }
function keyOf(c) { return safe(() => c.location.x + "," + c.location.y, null); }
function byName(n) { return allCities().find((c) => nameOf(c) === n) || null; }
function shareIn(key, civ) {
  const e = comp.state().cities[key];
  if (!e) return null;
  const tot = Object.values(e.byCiv).reduce((a, b) => a + b, 0);
  return tot > 0 ? (e.byCiv[civ] || 0) / tot : 0;
}

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

function report(label) {
  const cities = comp.state().cities;
  const live = new Set(allCityCompositions().map((e) => e.key));
  const ranked = new Set(safe(() => diverseCityRanking({}, 0).map((r) => r.key), []));
  const out = [];
  for (const k of WATCH) {
    const [x, y] = k.split(",").map(Number);
    const id = safe(() => MapCities.getCity(x, y), null);
    const c = id != null ? safe(() => Cities.get(id), null) : null;
    const stands = !!c && safe(() => c.location.x === x && c.location.y === y, false);
    const e = cities[k];
    const row = { key: k, name: e ? e.name : null, entry: !!e, seenTurn: e ? e.seenTurn : null, inAll: live.has(k), inRanking: ranked.has(k),
      plotCity: c ? nameOf(c) + " owner " + safe(() => c.owner) + "(" + kind(safe(() => c.owner, -1)) + ")" : null, centredHere: stands };
    out.push(row);
    emit("ITEM3R " + label + " " + J(row));
  }
  emit("ITEM3R " + label + " passTurn=" + J(comp.state().passTurn) + " live=" + live.size + " ranking=" + ranked.size);
  return out;
}
let armed = false;
engine.on("PlayerTurnActivated", (d) => {
  const who = d && (d.player ?? d.Player);
  if (!armed || who !== GameContext.localPlayerID) return;
  armed = false;
  if (endTurnTimer) { clearTimeout(endTurnTimer); endTurnTimer = null; }
  setTimeout(() => {
    const rows = report("after one pass");
    const ok = rows.every((r) => (r.centredHere ? r.entry && !r.inAll && !r.inRanking : !r.entry && !r.inAll && !r.inRanking));
    const t0 = loadTurn;
    for (const a of applies) emit("O1 apply turn=" + a.turn + " stack=" + a.stack);
    const hook = applies.filter((a) => a.turn > t0 && /repaintIfStale/.test(a.stack));
    emit("VERDICT O1-attribution " + (hook.length ? "PASS" : "FAIL") + " after-turn repaints from repaintIfStale=" + hook.length
      + " other after-turn repaints=" + applies.filter((a) => a.turn > t0 && !/repaintIfStale/.test(a.stack)).length);
    safe(() => LensManager.setActiveLens("fxs-default-lens"));
    emit("VERDICT item3-real " + (ok ? "PASS" : "FAIL") + " " + J(rows.map((r) => r.key + (r.centredHere ? " standing" : " razed") + " entry=" + r.entry + " listed=" + (r.inAll || r.inRanking))));
    emit("DONE modtest150 finished");
  }, 8000);
});
const applies = [];
let loadTurn = 0;
function wrapLayer() {
  const L = safe(() => LensManager.layers.get("emig-ethnicity-layer"), null);
  if (!L) { emit("O1 no layer"); return; }
  const orig = L.applyLayer.bind(L);
  L.applyLayer = function () {
    const st = String(new Error().stack || "").split("\n").slice(1, 5).map((l) => l.trim().replace(/^at /, "").replace(/\(.*\/ui\//, "(")).join(" <- ");
    applies.push({ turn: safe(() => Game.turn), stack: st });
    return orig();
  };
  emit("O1 layer wrapped");
}
async function run() {
  local = safe(() => GameContext.localPlayerID, -1);
  loadTurn = safe(() => Game.turn, 0);
  emit("modtest150 run local=" + local + " turn=" + safe(() => Game.turn) + " emigrationBooted=" + (typeof globalThis.emigration));
  await later(6000);
  await dismissPopups();
  report("at load");
  wrapLayer();
  safe(() => LensManager.setActiveLens("emig-ethnicity-lens"));
  await later(6000);
  armed = true;
  endTurn();
  setTimeout(() => { if (armed) { emit("TURN never activated"); emit("DONE modtest150 finished"); } }, 300000);
}

emit("modtest150 attached");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() {
  const st = loadStateName();
  if (st === "GameStarted") {
    setTimeout(() => { run().catch((e) => { emit("run threw " + e + " " + (e && e.stack)); emit("DONE modtest150 finished"); }); }, 10000);
    return;
  }
  beginTries++;
  if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady());
  if (beginTries < 90) setTimeout(beginPoll, 2000); else { emit("LOAD gave up"); emit("DONE modtest150 finished"); }
}
setTimeout(beginPoll, 3000);
