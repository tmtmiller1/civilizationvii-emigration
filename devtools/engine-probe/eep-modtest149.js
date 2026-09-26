// eep-modtest149.js - the ethnicity-audit fixes, watched together in game (docs/ethnicity-audit-solution-designs.md).
// Save: EmigShots072 (turn 72). Runs the DEPLOYED emigration copy, which carries every audit fix. Verdict lines are
// tagged VERDICT <item> PASS|FAIL with the numbers behind them.
//
// Setup at turn 72, before any End Turn (the probe shares the mod's module instances; ledger edits are written
// through to the saved blob and the pass stamp is bumped, exactly as the recorder does, so the next pass reads them):
//   Item 1: Rostov on Don (Norman-held, 60% Bulgarian, Bulgar Enclave at 78,52). The enclave tile must hold the
//     highest Bulgarian share of any Rostov tile. Hover panel read on the enclave tile; SHOT i1-rostov.
//   Item 3: inject two ledger entries with no city centered on their plot (Rostov's enclave tile, covered by Rostov's
//     own territory, and an unowned plot) and one at a standing city-state's center. After one pass: the first two
//     are deleted, the city-state one is kept in the ledger but absent from allCityCompositions and the diversity list.
//   O4: delete Madrid (owner 0, originalOwner 5, a major) and Monte Albán (originalOwner 19, a city-state) from the
//     ledger. After one pass: Madrid is re-seeded as origin 5, Monte Albán as the owner 0.
//   Item 2: seed MARKER (player 1, eliminated, in no ledger entry) at 50% into every other major-civ city ("sources");
//     the rest are "detectors". Before the fix a migrant counted as the source owner's people, so MARKER could never
//     reach a detector. After each pass, count detectors holding MARKER and transit entries whose originMix has it.
//   O1: the lens is left open on Rostov across End Turn. Its applyLayer is wrapped to count calls. After the turn it
//     must have repainted (at least one call after the pass) without being toggled; the ledger version must differ.
// Then four more turns for item 2 (transit takes up to 4 turns), then a hover on a detector holding MARKER.
import LensManager from "/core/ui/lenses/lens-manager.js";
import PlotCursor from "/core/ui/input/plot-cursor.js";
import { __test as comp, allCityCompositions, compositionVersion, compositionForCity } from "/emigration/ui/emigration-composition.js";
import { tilesForCity } from "/emigration/ui/emigration-ethnicity-tiles.js";
import { diverseCityRanking } from "/emigration/ui/emigration-diversity.js";
import { loadState } from "/emigration/ui/emigration-state.js";

const TAG = "[EmigTest]";
const ETHN = "emig-ethnicity-lens";
const LAYER = "emig-ethnicity-layer";
const STATE_KEY = "EmigrationEthnos_v1";
const STAMP_KEY = "EmigrationEthnosStamp_v1";
const MARKER = 1;
const TURNS = 5;
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { const v = fn(); return v === undefined ? fb : v; } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function later(ms) { return new Promise((r) => setTimeout(r, ms)); }
let local = -1;
let turnsDone = 0;
let applyCalls = 0;
let applyLog = [];
const ctx = { rostov: null, enclave: null, injected: {}, sources: [], detectors: [], versionBefore: "" };

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

// Ledger edits: read the saved blob, edit, write back and bump the stamp (what the recorder's save() does).
function editLedger(fn) {
  const raw = safe(() => Configuration.getGame().getValue(STATE_KEY), null);
  if (typeof raw !== "string") { emit("LEDGER no saved blob"); return false; }
  const o = JSON.parse(raw);
  fn(o);
  const cfg = Configuration.editGame();
  cfg.setValue(STATE_KEY, JSON.stringify(o));
  const stamp = safe(() => Configuration.getGame().getValue(STAMP_KEY), null);
  cfg.setValue(STAMP_KEY, String((Number(stamp) || 0) + 1));
  emit("LEDGER edited; stamp " + J(stamp) + " -> " + safe(() => Configuration.getGame().getValue(STAMP_KEY)));
  return true;
}

// Hover panel (the lens's cursor panel is a fixed body child at z-index 10001; see mod test 147).
function panel() {
  return safe(() => Array.from(document.body.children).find((d) => {
    const cs = getComputedStyle(d);
    return cs.zIndex === "10001" && cs.display !== "none" && cs.position === "fixed";
  }), null);
}
async function hoverText(at) {
  safe(() => { PlotCursor.plotCursorCoords = { x: at.x, y: at.y }; });
  safe(() => window.dispatchEvent(new CustomEvent("plot-cursor-coords-updated", { detail: { value: { x: at.x, y: at.y } } })));
  await later(2500);
  const p = panel();
  return p ? String(p.textContent).replace(/\s+/g, " ").trim() : "(no panel)";
}

// ── Item 1 ───────────────────────────────────────────────────────────────────────────────
async function item1(label) {
  const data = safe(() => tilesForCity(ctx.rostov), null);
  if (!data || !ctx.enclave) { emit("VERDICT item1 FAIL no tiles/enclave data=" + !!data + " enclave=" + J(ctx.enclave)); return; }
  const BULG = 2;
  const sh = (t) => { const e = t.shares.find((s) => s.civ === BULG); return e ? e.share : 0; };
  const home = data.tiles.find((t) => t.x === ctx.enclave.x && t.y === ctx.enclave.y);
  const best = Math.max(...data.tiles.map(sh));
  const homeShare = home ? sh(home) : -1;
  emit("ITEM1 " + label + " comp=" + J(data.comp.civs.map((c) => c.civ + ":" + Math.round(c.share * 100)))
    + " enclaveTile=" + J(home && home.shares.map((s) => s.civ + ":" + Math.round(s.share * 100)))
    + " bestBulgarian=" + best.toFixed(3) + " tiles=" + data.tiles.length);
  emit("VERDICT item1 " + (homeShare >= best - 1e-9 ? "PASS" : "FAIL") + " (" + label + ") enclave tile Bulgarian "
    + homeShare.toFixed(3) + " vs city best " + best.toFixed(3));
}

// ── Setup ────────────────────────────────────────────────────────────────────────────────
function findUnownedPlot() {
  const w = safe(() => GameplayMap.getGridWidth(), 0), h = safe(() => GameplayMap.getGridHeight(), 0);
  for (let y = 2; y < h - 2; y += 3) for (let x = 2; x < w - 2; x += 3) {
    if (safe(() => MapCities.getCity(x, y), 0) == null && safe(() => GameplayMap.getOwner(x, y), 0) === -1) return { x, y };
  }
  return null;
}
function setup() {
  ctx.rostov = byName("Rostov on Don");
  const ros = keyOf(ctx.rostov);
  ctx.enclave = ctx.rostov ? { x: 78, y: 52 } : null;
  const unowned = findUnownedPlot();
  const cs = allCities().find((c) => kind(safe(() => c.owner, -1)) === "minor") || null;
  const madrid = byName("Madrid"), monte = allCities().find((c) => /^Monte Alb/.test(nameOf(c))) || null;
  emit("SETUP rostov=" + ros + " unowned=" + J(unowned) + " cityState=" + (cs ? nameOf(cs) + "@" + keyOf(cs) + " owner " + cs.owner : "none")
    + " madrid=" + (madrid ? keyOf(madrid) + " orig " + madrid.originalOwner : "none")
    + " monte=" + (monte ? keyOf(monte) + " orig " + monte.originalOwner : "none")
    + " marker kind=" + kind(MARKER) + " MapCities@enclave=" + J(safe(() => MapCities.getCity(78, 52), null)));
  const skip = new Set([ros, madrid && keyOf(madrid), monte && keyOf(monte)]);
  const pool = allCities().filter((c) => kind(safe(() => c.owner, -1)) === "major" && !skip.has(keyOf(c)))
    .map((c) => ({ key: keyOf(c), name: nameOf(c), owner: c.owner })).sort((a, b) => a.key.localeCompare(b.key));
  pool.forEach((c, i) => (i % 2 === 0 ? ctx.sources : ctx.detectors).push(c));
  return editLedger((o) => {
    const T = safe(() => Game.turn, 0);
    ctx.injected = {
      razed: "78,52",
      unowned: unowned ? unowned.x + "," + unowned.y : null,
      cityState: cs ? keyOf(cs) : null
    };
    o.cities["78,52"] = { owner: 0, byCiv: { 0: 3 }, total: 3, name: "InjectedRazed", seenTurn: T - 1 };
    if (unowned) o.cities[ctx.injected.unowned] = { owner: 0, byCiv: { 0: 2 }, total: 2, name: "InjectedUnowned", seenTurn: T - 1 };
    if (cs) o.cities[ctx.injected.cityState] = { owner: 0, byCiv: { 0: 4 }, total: 4, name: "InjectedCityState", seenTurn: T - 1 };
    if (madrid) delete o.cities[keyOf(madrid)];
    if (monte) delete o.cities[keyOf(monte)];
    ctx.madrid = madrid && keyOf(madrid); ctx.monte = monte && keyOf(monte);
    if (kind(MARKER) !== "none") {
      for (const c of ctx.sources) {
        const e = o.cities[c.key];
        if (!e) continue;
        const tot = e.total || Object.values(e.byCiv).reduce((a, b) => a + b, 0);
        e.byCiv = { [c.owner]: tot / 2, [MARKER]: tot / 2 };
      }
    }
    emit("SETUP sources=" + ctx.sources.length + " detectors=" + ctx.detectors.length
      + " detectorsWithMarkerBefore=" + ctx.detectors.filter((d) => o.cities[d.key] && o.cities[d.key].byCiv[MARKER] > 0).length);
  });
}

// ── Checks after each pass ───────────────────────────────────────────────────────────────
function checkItem3AndO4() {
  const cities = comp.state().cities;
  const live = new Set(allCityCompositions().map((e) => e.key));
  const ranked = new Set(safe(() => diverseCityRanking({}, 0).map((r) => r.key), []));
  const i = ctx.injected;
  const razedGone = !cities[i.razed];
  const unownedGone = !i.unowned || !cities[i.unowned];
  const csKept = !i.cityState || !!cities[i.cityState];
  const csHidden = !i.cityState || (!live.has(i.cityState) && !ranked.has(i.cityState));
  emit("ITEM3 razedEntry=" + J(!!cities[i.razed]) + " unownedEntry=" + J(i.unowned && !!cities[i.unowned])
    + " cityStateEntry=" + J(i.cityState && !!cities[i.cityState]) + " cityStateInAll=" + J(i.cityState && live.has(i.cityState))
    + " cityStateInRanking=" + J(i.cityState && ranked.has(i.cityState)) + " live=" + live.size + " ranking=" + ranked.size
    + " passTurn=" + J(comp.state().passTurn));
  emit("VERDICT item3 " + (razedGone && unownedGone && csKept && csHidden ? "PASS" : "FAIL") + " razedGone=" + razedGone
    + " unownedGone=" + unownedGone + " cityStateKept=" + csKept + " cityStateHidden=" + csHidden);
  const m = ctx.madrid && cities[ctx.madrid], mo = ctx.monte && cities[ctx.monte];
  emit("O4 madrid=" + J(m && m.byCiv) + " monte=" + J(mo && mo.byCiv));
  const madridOk = !!m && shareIn(ctx.madrid, 5) > 0.9;
  const monteOk = !!mo && shareIn(ctx.monte, 0) > 0.99;
  emit("VERDICT O4 " + (madridOk && monteOk ? "PASS" : "FAIL") + " madridAsOrigin5=" + J(m && shareIn(ctx.madrid, 5))
    + " monteAsOwner=" + J(mo && shareIn(ctx.monte, 0)));
}
function checkItem2(label) {
  const withMarker = ctx.detectors.filter((d) => (shareIn(d.key, MARKER) || 0) > 0);
  const transit = safe(() => loadState().transit || [], []);
  const mixed = transit.filter((t) => t.originMix && t.originMix[MARKER] > 0);
  emit("ITEM2 " + label + " detectorsWithMarker=" + withMarker.length + " "
    + J(withMarker.slice(0, 6).map((d) => d.name + ":" + (shareIn(d.key, MARKER) * 100).toFixed(1) + "%"))
    + " transit=" + transit.length + " transitWithMix=" + transit.filter((t) => t.originMix).length
    + " transitCarryingMarker=" + mixed.length + " sample=" + J(mixed.slice(0, 2).map((t) => ({ mix: t.originMix, src: t.srcLoc, dest: t.destLoc }))));
  return withMarker;
}

// ── O1 wrap ──────────────────────────────────────────────────────────────────────────────
function wrapLayer() {
  const L = safe(() => LensManager.layers.get(LAYER), null);
  if (!L) { emit("O1 no layer"); return; }
  const orig = L.applyLayer.bind(L);
  L.applyLayer = function () {
    applyCalls++;
    applyLog.push({ t: Date.now(), turn: safe(() => Game.turn), version: safe(() => compositionVersion()) });
    return orig();
  };
  emit("O1 layer wrapped");
}

// ── Turn loop ────────────────────────────────────────────────────────────────────────────
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
let armed = false;
engine.on("PlayerTurnActivated", (d) => {
  const who = d && (d.player ?? d.Player);
  if (!armed || who !== GameContext.localPlayerID) return;
  if (endTurnTimer) { clearTimeout(endTurnTimer); endTurnTimer = null; }
  turnsDone++;
  emit("TURN activated n=" + turnsDone + " turn=" + safe(() => Game.turn) + " activeLens=" + safe(() => LensManager.activeLens));
  setTimeout(() => { afterTurn().catch((e) => { emit("afterTurn threw " + e + " " + (e && e.stack)); emit("DONE modtest149 finished"); }); }, 8000);
});

async function afterTurn() {
  if (turnsDone === 1) {
    const after = applyLog.filter((a) => a.turn !== undefined && a.turn > 72);
    const vNow = safe(() => compositionVersion());
    emit("O1 applyCalls=" + applyCalls + " afterTurn=" + after.length + " log=" + J(applyLog.slice(-4)) + " versionBefore=" + ctx.versionBefore + " versionNow=" + vNow
      + " activeLens=" + safe(() => LensManager.activeLens));
    emit("VERDICT O1 " + (after.length > 0 && vNow !== ctx.versionBefore && safe(() => LensManager.activeLens) === ETHN ? "PASS" : "FAIL")
      + " lens repainted " + after.length + " time(s) after the turn without a toggle");
    await dismissPopups();
    safe(() => Camera.lookAtPlot(ctx.rostov.location, { zoom: 0.45 }));
    await later(15000);
    emit("HOVER i1-after-turn " + J(await hoverText(ctx.enclave)));
    emit("SHOT o1-after-turn");
    await later(9000);
    await item1("after turn");
    checkItem3AndO4();
  }
  checkItem2("after turn " + turnsDone);
  if (turnsDone < TURNS) { await dismissPopups(); endTurn(); return; }
  await finish();
}

async function finish() {
  const hits = checkItem2("final");
  const pass = hits.length > 0;
  emit("VERDICT item2 " + (pass ? "PASS" : "FAIL") + " " + hits.length + " detector(s) now hold the marker people");
  if (pass) {
    const d = allCities().find((c) => keyOf(c) === hits[0].key);
    const data = d ? safe(() => tilesForCity(d), null) : null;
    const tile = data ? data.tiles.slice().sort((a, b) => {
      const s = (t) => { const e = t.shares.find((x) => x.civ === MARKER); return e ? e.share : 0; };
      return s(b) - s(a);
    })[0] : null;
    emit("ITEM2 detector " + hits[0].name + " comp=" + J(safe(() => compositionForCity(d).civs.map((c) => c.civ + ":" + (c.share * 100).toFixed(1)))));
    if (tile) {
      safe(() => Camera.lookAtPlot({ x: tile.x, y: tile.y }, { zoom: 0.45 }));
      await later(15000);
      emit("HOVER item2 " + hits[0].name + " tile=" + tile.x + "," + tile.y + " " + J(await hoverText({ x: tile.x, y: tile.y })));
      emit("SHOT item2-detector");
      await later(9000);
    }
  }
  safe(() => LensManager.setActiveLens("fxs-default-lens"));
  emit("DONE modtest149 finished");
}

async function run() {
  local = safe(() => GameContext.localPlayerID, -1);
  emit("modtest149 run local=" + local + " turn=" + safe(() => Game.turn) + " emigrationBooted=" + (typeof globalThis.emigration)
    + " version=" + safe(() => compositionVersion()));
  await later(6000);
  await dismissPopups();
  if (!setup()) { emit("DONE modtest149 finished"); return; }
  checkItem2("before any turn");
  // Item 1 at turn 72, lens on.
  safe(() => Camera.lookAtPlot(ctx.rostov.location, { zoom: 0.45 }));
  await later(15000);
  wrapLayer();
  safe(() => LensManager.setActiveLens(ETHN));
  await later(8000);
  await item1("turn 72");
  emit("HOVER i1-enclave " + J(await hoverText(ctx.enclave)));
  emit("HOVER i1-center " + J(await hoverText({ x: 78, y: 53 })));
  emit("SHOT i1-rostov");
  await later(9000);
  ctx.versionBefore = safe(() => compositionVersion());
  emit("O1 before End Turn applyCalls=" + applyCalls + " version=" + ctx.versionBefore);
  armed = true;
  endTurn();
  setTimeout(() => { if (turnsDone < TURNS) { emit("TIMEOUT turnsDone=" + turnsDone); finish(); } }, 20 * 60 * 1000);
}

emit("modtest149 attached");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() {
  const st = loadStateName();
  if (st === "GameStarted") {
    setTimeout(() => { run().catch((e) => { emit("run threw " + e + " " + (e && e.stack)); emit("DONE modtest149 finished"); }); }, 10000);
    return;
  }
  beginTries++;
  if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady());
  if (beginTries < 90) setTimeout(beginPoll, 2000); else { emit("LOAD gave up"); emit("DONE modtest149 finished"); }
}
setTimeout(beginPoll, 3000);
