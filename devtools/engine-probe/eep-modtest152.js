// eep-modtest152.js - what does Players.grantYield actually change, for EVERY yield type, in both directions?
// Asked 2026-09-18 while deciding how enclave stance yields should be paid. Earlier probes only ever granted Gold,
// Happiness and Influence; Food, Production, Science and Culture were never tried, and the stance registry pays in them.
// Save: AugustusExp66 (human-controlled). The emigration pass is switched off (CONFIG.turnInterval) so its own charges
// do not move the numbers, and the effective value is logged with every snapshot.
//
// API    every function / property name on the objects a yield write could live on (a 1.5.0 re-enumeration).
// S0     baseline snapshot: player pools, lifetime and net yields, research and civic progress, celebration state,
//        and for the capital and the largest town: net yields, growth (food) state, build-queue state, happiness.
// A      +100 of each yield in turn, a snapshot and DIFF after each (same-turn effect), then a real end turn and DIFF.
// B      -100 of each yield the same way, then an end turn, then one more end turn (does a rate spike persist?).
// Every DIFF lists each number that changed, so an effect landing somewhere unexpected is still seen.
import { CONFIG } from "/emigration/ui/emigration-config.js";

const TAG = "[EmigTest]";
const AMOUNT = 100;
const YIELDS = ["YIELD_FOOD", "YIELD_PRODUCTION", "YIELD_GOLD", "YIELD_SCIENCE", "YIELD_CULTURE", "YIELD_HAPPINESS", "YIELD_DIPLOMACY"];
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { const v = fn(); return v === undefined ? fb : v; } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function later(ms) { return new Promise((r) => setTimeout(r, ms)); }
function r2(v) { return typeof v === "number" ? Math.round(v * 100) / 100 : v; }
let local = -1;

/** Emit a long list in lines short enough for UI.log (it clips near 1022 characters). */
function emitList(label, items) {
  let line = "";
  let part = 0;
  for (const it of items) {
    if (line.length + it.length > 850) { emit(label + "[" + (part++) + "] " + line); line = ""; }
    line += (line ? " " : "") + it;
  }
  emit(label + "[" + part + "] " + (line || "(none)"));
}

/** Every property name reachable on an object (own and inherited), split into functions and the rest. */
function names(obj) {
  const fns = new Set(), props = new Set();
  let o = obj;
  for (let depth = 0; o && o !== Object.prototype && o !== Function.prototype && depth < 6; depth++) {
    for (const k of safe(() => Object.getOwnPropertyNames(o), [])) {
      if (k === "constructor") continue;
      const d = safe(() => Object.getOwnPropertyDescriptor(o, k), null);
      if (d && typeof d.value === "function") fns.add(k); else props.add(k);
    }
    o = safe(() => Object.getPrototypeOf(o), null);
  }
  return { fns: Array.from(fns).sort(), props: Array.from(props).sort() };
}

/** Every numeric or boolean PROPERTY (never a function call) of an object, flat, under a prefix. */
function nums(prefix, obj, out) {
  if (!obj || typeof obj !== "object") return;
  for (const k of names(obj).props) {
    const v = safe(() => obj[k], null);
    if (typeof v === "number") out[prefix + "." + k] = r2(v);
    else if (typeof v === "boolean") out[prefix + "." + k] = v ? 1 : 0;
  }
}

function dismissNow() {
  const open = safe(() => Array.from(document.querySelectorAll("*")).filter((e) => /^SCREEN-/.test(e.tagName)
    && e.querySelector("fxs-button, fxs-hero-button")), []);
  for (const e of open) {
    emit("POPUP dismissing " + e.tagName.toLowerCase());
    const btns = Array.from(e.querySelectorAll("fxs-button, fxs-hero-button"));
    safe(() => btns[btns.length - 1].dispatchEvent(new CustomEvent("action-activate", { bubbles: true })));
  }
  return open.length;
}
async function dismissPopups() { for (let i = 0; i < 6 && dismissNow(); i++) await later(2500); }

// ── Snapshot ────────────────────────────────────────────────────────────────────
let watched = [];
function pickCities() {
  const mine = safe(() => Players.get(local).Cities.getCities() || [], []);
  const capital = mine.find((c) => safe(() => c.isCapital, false)) || mine.filter((c) => !c.isTown).sort((a, b) => b.population - a.population)[0];
  const town = mine.filter((c) => c.isTown).sort((a, b) => b.population - a.population)[0];
  watched = [capital, town].filter(Boolean).map((c) => ({ id: c.id, tag: c.isTown ? "T" : "C", name: safe(() => Locale.compose(c.name), "?") }));
  emit("CITIES " + J(watched.map((w) => w.tag + "=" + w.name)) + " of " + mine.length);
}

function researchInto(out, tag, mgr) {
  if (!mgr) return;
  out[tag + ".turnsLeft"] = safe(() => r2(mgr.getTurnsLeft()), null);
  const node = safe(() => mgr.getResearching(), null);
  out[tag + ".nodeKey"] = typeof node === "number" ? node : safe(() => Number(node && (node.type ?? node.nodeType)), null);
  const nt = typeof node === "number" ? node : safe(() => node && (node.type ?? node.nodeType), null);
  if (nt != null) {
    out[tag + ".turnsForNode"] = safe(() => r2(mgr.getTurnsForNode(nt)), null);
    out[tag + ".nodeCost"] = safe(() => r2(mgr.getNodeCost(nt)), null);
    nums(tag + ".node", safe(() => Game.ProgressionTrees.getNode(local, nt), null), out);
  }
  nums(tag, mgr, out);
}

function snapshot() {
  const out = {};
  const p = safe(() => Players.get(local), null);
  if (!p) return out;
  for (const y of YIELDS) {
    const k = y.replace("YIELD_", "");
    out["P.net." + k] = safe(() => r2(p.Stats.getNetYield(YieldTypes[y])), null);
    out["P.life." + k] = safe(() => r2(p.Stats.getLifetimeYield(YieldTypes[y])), null);
  }
  out["P.gold"] = safe(() => r2(p.Treasury.goldBalance), null);
  out["P.influence"] = safe(() => r2(p.DiplomacyTreasury.diplomacyBalance), null);
  nums("P.treasury", safe(() => p.Treasury, null), out);
  nums("P.diploTreasury", safe(() => p.DiplomacyTreasury, null), out);
  nums("P.stats", safe(() => p.Stats, null), out);
  nums("P.happy", safe(() => p.Happiness, null), out);
  researchInto(out, "P.tech", safe(() => p.Techs, null));
  researchInto(out, "P.civic", safe(() => p.Culture, null));
  for (const w of watched) {
    const c = safe(() => Cities.get(w.id), null);
    if (!c) continue;
    const t = w.tag;
    out[t + ".pop"] = safe(() => c.population, null);
    for (const y of YIELDS) {
      const k = y.replace("YIELD_", "");
      out[t + ".net." + k] = safe(() => r2(c.Yields.getNetYield(YieldTypes[y])), null);
      out[t + ".yield." + k] = safe(() => r2(c.Yields.getYield(YieldTypes[y])), null);
    }
    nums(t + ".growth", safe(() => c.Growth, null), out);
    out[t + ".growth.threshold"] = safe(() => { const v = c.Growth.getNextGrowthFoodThreshold(); return r2(typeof v === "number" ? v : v.value); }, null);
    nums(t + ".bq", safe(() => c.BuildQueue, null), out);
    out[t + ".bq.turnsLeft"] = safe(() => r2(c.BuildQueue.getTurnsLeft()), null);
    out[t + ".bq.percent"] = safe(() => r2(c.BuildQueue.getPercentComplete(c.BuildQueue.currentProductionTypeHash)), null);
    out[t + ".bq.progress"] = safe(() => r2(c.BuildQueue.getProgress(c.BuildQueue.currentProductionTypeHash)), null);
    nums(t + ".production", safe(() => c.Production, null), out);
    nums(t + ".happy", safe(() => c.Happiness, null), out);
    nums(t + ".yields", safe(() => c.Yields, null), out);
  }
  return out;
}

let last = null;
function snapAndDiff(label) {
  const now = snapshot();
  const head = "turn=" + safe(() => Game.turn) + " interval=" + CONFIG.turnInterval;
  if (!last) {
    emitList("SNAP " + label + " " + head, Object.keys(now).sort().map((k) => k + "=" + J(now[k])));
  } else {
    const changed = [];
    for (const k of Array.from(new Set(Object.keys(now).concat(Object.keys(last)))).sort()) {
      if (J(now[k]) !== J(last[k])) {
        const d = typeof now[k] === "number" && typeof last[k] === "number" ? "(" + (now[k] - last[k] >= 0 ? "+" : "") + r2(now[k] - last[k]) + ")" : "";
        changed.push(k + ":" + J(last[k]) + "->" + J(now[k]) + d);
      }
    }
    emitList("DIFF " + label + " " + head + " changed=" + changed.length, changed);
  }
  last = now;
}

// ── API enumeration ───────────────────────────────────────────────────────────────
function enumerate() {
  const p = safe(() => Players.get(local), null);
  const c = watched.length ? safe(() => Cities.get(watched[0].id), null) : null;
  const targets = [
    ["Players", safe(() => Players, null)], ["player", p], ["player.Stats", p && p.Stats], ["player.Treasury", p && p.Treasury],
    ["player.DiplomacyTreasury", p && p.DiplomacyTreasury], ["player.Happiness", p && p.Happiness], ["player.Techs", p && p.Techs],
    ["player.Culture", p && p.Culture], ["player.Yields", p && p.Yields], ["city", c], ["city.Yields", c && c.Yields],
    ["city.Growth", c && c.Growth], ["city.BuildQueue", c && c.BuildQueue], ["city.Production", c && c.Production],
    ["city.Happiness", c && c.Happiness], ["city.Gold", c && c.Gold], ["Cities", safe(() => Cities, null)]
  ];
  for (const [label, obj] of targets) {
    if (!obj) { emit("API " + label + " absent"); continue; }
    const n = names(obj);
    emitList("API " + label + " fns", n.fns);
    const writers = n.fns.filter((k) => /^(grant|change|add|set|give|modify|adjust|apply|remove|spend|deduct)/i.test(k));
    emit("API " + label + " WRITE-LIKE " + J(writers));
  }
  for (const [label, en] of [["PlayerOperationTypes", safe(() => PlayerOperationTypes, null)], ["CityOperationTypes", safe(() => CityOperationTypes, null)],
    ["CityCommandTypes", safe(() => CityCommandTypes, null)]]) {
    emitList("API " + label, en ? Object.keys(en).filter((k) => isNaN(Number(k))).sort() : []);
  }
}

// ── Grants ───────────────────────────────────────────────────────────────────────
async function grantEach(sign, phaseTag) {
  for (const y of YIELDS) {
    const yt = safe(() => YieldTypes[y], null);
    if (yt == null) { emit("GRANT " + y + " has no YieldTypes entry"); continue; }
    const r = safe(() => Players.grantYield(local, yt, sign * AMOUNT));
    emit("GRANT " + phaseTag + " " + y + " " + (sign * AMOUNT) + " -> " + J(r));
    await later(2500);
    snapAndDiff(phaseTag + " after " + (sign > 0 ? "+" : "-") + AMOUNT + " " + y.replace("YIELD_", ""));
  }
}

// ── End turn: clear the resource blocker the base game's way, Autoplay only as a last resort ─────────────
let endTurnTimer = null, blockedTries = 0, usedAutoplay = 0;
function noteList() {
  return safe(() => (Game.Notifications.getIdsForPlayer(local) || []).map((id) => ({ id, type: safe(() => Game.Notifications.getTypeName(Game.Notifications.find(id).Type), "?") })), []);
}
function endTurn() {
  try {
    const me = Players.get(local);
    if (!me.isTurnActive || GameContext.hasSentTurnComplete()) return;
    dismissNow();
    const b = String(Game.Notifications.getEndTurnBlockingType(local));
    if (b !== String(EndTurnBlockingTypes.NONE)) {
      blockedTries++;
      const notes = noteList();
      emit("ENDTURN blocked (" + b + ") try " + blockedTries + " notes=" + J(notes.map((n) => n.type)).slice(0, 400));
      const c = safe(() => Game.PlayerOperations.canStart(local, PlayerOperationTypes.CONSIDER_ASSIGN_RESOURCE, {}, false), null);
      if (c && c.Success) safe(() => Game.PlayerOperations.sendRequest(local, PlayerOperationTypes.CONSIDER_ASSIGN_RESOURCE, {}));
      for (const n of notes) if (/ASSIGN_NEW_RESOURCES/.test(n.type)) safe(() => Game.Notifications.dismiss(n.id));
      if (blockedTries >= 5 && typeof Autoplay !== "undefined") {
        usedAutoplay++;
        emit("ENDTURN still blocked: ONE AUTOPLAY TURN (the AI spends and assigns, so this turn's DIFF is polluted)");
        safe(() => { Autoplay.setTurns(1); Autoplay.setReturnAsPlayer(local); Autoplay.setObserveAsPlayer(local); Autoplay.setActive(true); });
        blockedTries = 0; endTurnTimer = setTimeout(endTurn, 40000); return;
      }
      endTurnTimer = setTimeout(endTurn, 4000); return;
    }
    safe(() => UI.Player.deselectAllUnits()); GameContext.sendTurnComplete();
    emit("ENDTURN sent at turn " + safe(() => Game.turn));
  } catch (e) { emit("ENDTURN threw " + e); }
  endTurnTimer = setTimeout(() => { if (safe(() => Players.get(local).isTurnActive, false) && !GameContext.hasSentTurnComplete()) endTurn(); }, 12000);
}

let phase = "setup";
let turnResolve = null;
let turnAtSend = -1;
function nextTurn() {
  return new Promise((res) => {
    turnAtSend = safe(() => Game.turn, -1);
    turnResolve = res; blockedTries = 0; phase = "turn";
    endTurn();
    setTimeout(() => { if (turnResolve === res) { turnResolve = null; phase = "stuck"; emit("TURN never advanced in 300 s"); res(false); } }, 300000);
  });
}
engine.on("PlayerTurnActivated", (d) => {
  const who = d && (d.player ?? d.Player);
  if (who !== GameContext.localPlayerID || phase !== "turn") return;
  const t = safe(() => Game.turn, -1);
  if (!(t > turnAtSend)) { emit("TURN activation without advance (turn " + t + ")"); return; }
  if (endTurnTimer) { clearTimeout(endTurnTimer); endTurnTimer = null; }
  phase = "work";
  emit("TURN activated turn=" + t + " autoplayTurnsUsed=" + usedAutoplay);
  const res = turnResolve; turnResolve = null;
  setTimeout(() => { if (res) res(true); }, 5000);
});

async function run() {
  local = safe(() => GameContext.localPlayerID, -1);
  CONFIG.turnInterval = 99999;
  emit("modtest152 run local=" + local + " turn=" + safe(() => Game.turn) + " emigrationBooted=" + (typeof globalThis.emigration)
    + " YieldTypes=" + J(safe(() => Object.keys(YieldTypes).filter((k) => isNaN(Number(k))), null)));
  await later(6000);
  await dismissPopups();
  pickCities();
  enumerate();
  snapAndDiff("S0");
  await later(3000);
  snapAndDiff("S0-idle (nothing done: any change here is noise)");
  await grantEach(1, "A");
  if (await nextTurn()) { await dismissPopups(); snapAndDiff("A end turn (natural change = the P.net / C.net values before it)"); }
  await grantEach(-1, "B");
  if (await nextTurn()) { await dismissPopups(); snapAndDiff("B end turn"); }
  if (await nextTurn()) { await dismissPopups(); snapAndDiff("C quiet end turn (no grant this turn)"); }
  emit("SUMMARY autoplayTurnsUsed=" + usedAutoplay);
  emit("DONE modtest152 finished");
}

emit("modtest152 attached");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() {
  const st = loadStateName();
  if (st === "GameStarted") {
    setTimeout(() => { run().catch((e) => { emit("run threw " + e + " " + (e && e.stack)); emit("DONE modtest152 finished"); }); }, 10000);
    return;
  }
  beginTries++;
  if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady());
  if (beginTries < 90) setTimeout(beginPoll, 2000); else { emit("LOAD gave up"); emit("DONE modtest152 finished"); }
}
setTimeout(beginPoll, 3000);
