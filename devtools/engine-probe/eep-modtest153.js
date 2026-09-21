// eep-modtest153.js - the gaps mod test 152 left in "which yields can a script write?".
// Save: AugustusExp66 (turn 66: a civic IS being researched, which 152's deduction step lacked).
//
// COMP   every object-valued component on a city (152 enumerated a fixed list and missed FoodQueue).
// CULT   grantYield(CULTURE, -100) with a civic in progress: does civic progress drop? (152: no civic, no change)
// SCI    grantYield(SCIENCE, -100): 152 saw turnsLeft rise but no progress drop. Read progress at 0 / 3 / 8 s.
// FOOD   city.FoodQueue.addProgress(+50 then -50) on the capital and on a FOREIGN city: Growth.currentFood.
// PROD   city.BuildQueue.addProgress(+50 then -50) on a city with a non-empty queue, own and FOREIGN.
//        (Both calls come from a community mod, harvest-vanilla-core.js; never run by us.)
// TURN   one end turn: does the FoodQueue / BuildQueue gain persist into the next turn's stock?
// Every native call is logged BEFORE it is made, so a crash names its call.
import { CONFIG } from "/emigration/ui/emigration-config.js";

const TAG = "[EmigTest]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { const v = fn(); return v === undefined ? fb : v; } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function later(ms) { return new Promise((r) => setTimeout(r, ms)); }
function r2(v) { return typeof v === "number" ? Math.round(v * 100) / 100 : v; }
let local = -1;

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

function fnNames(obj) {
  const out = new Set();
  let o = obj;
  for (let d = 0; o && o !== Object.prototype && d < 6; d++) {
    for (const k of safe(() => Object.getOwnPropertyNames(o), [])) if (k !== "constructor" && typeof safe(() => o[k], null) === "function") out.add(k);
    o = safe(() => Object.getPrototypeOf(o), null);
  }
  return Array.from(out).sort();
}
function components(city) {
  const out = [];
  let o = city;
  const seen = new Set();
  for (let d = 0; o && o !== Object.prototype && d < 6; d++) {
    for (const k of safe(() => Object.getOwnPropertyNames(o), [])) {
      if (seen.has(k)) continue; seen.add(k);
      const v = safe(() => city[k], null);
      if (v && typeof v === "object" && !Array.isArray(v) && k !== "location" && k !== "id") out.push(k);
    }
    o = safe(() => Object.getPrototypeOf(o), null);
  }
  return out.sort();
}

function civicProgress(p) {
  const nt = safe(() => p.Culture.getResearching(), null);
  const t = typeof nt === "number" ? nt : safe(() => nt.type ?? nt.nodeType, null);
  return { node: t, progress: safe(() => r2(Game.ProgressionTrees.getNode(local, t).progress), null), turnsLeft: safe(() => p.Culture.getTurnsLeft(), null) };
}
function techProgress(p) {
  const nt = safe(() => p.Techs.getResearching(), null);
  const t = typeof nt === "number" ? nt : safe(() => nt.type ?? nt.nodeType, null);
  return { node: t, progress: safe(() => r2(Game.ProgressionTrees.getNode(local, t).progress), null), turnsLeft: safe(() => p.Techs.getTurnsLeft(), null) };
}
function foodState(c) {
  return { name: safe(() => Locale.compose(c.name), "?"), owner: c.owner, food: safe(() => r2(c.Growth.currentFood), null), net: safe(() => r2(c.Yields.getNetYield(YieldTypes.YIELD_FOOD)), null),
    turns: safe(() => c.Growth.turnsUntilGrowth, null), pop: c.population, fq: safe(() => fnNames(c.FoodQueue).join(","), "none") };
}
function prodState(c) {
  const h = safe(() => c.BuildQueue.currentProductionTypeHash, null);
  return { name: safe(() => Locale.compose(c.name), "?"), owner: c.owner, empty: safe(() => c.BuildQueue.isEmpty, null), progress: safe(() => r2(c.BuildQueue.currentBuildProgress), null),
    required: safe(() => r2(c.BuildQueue.currentBuildProgressRequired), null), turnsLeft: safe(() => c.BuildQueue.currentTurnsLeft, null), hash: h,
    net: safe(() => r2(c.Yields.getNetYield(YieldTypes.YIELD_PRODUCTION)), null) };
}

async function tryWrite(label, city, comp, amount, read) {
  const before = read(city);
  emit(label + " CALL " + comp + ".addProgress(" + amount + ") on " + before.name + " (owner " + before.owner + ")");
  const r = safe(() => city[comp].addProgress(amount));
  const imm = read(city);
  await later(3000);
  const late = read(city);
  emit(label + " " + comp + " " + amount + " -> " + J(r) + " before=" + J(before) + " now=" + J(imm) + " +3s=" + J(late));
  return late;
}

let endTurnTimer = null, blockedTries = 0, usedAutoplay = 0, phase = "setup", turnResolve = null, turnAtSend = -1;
function endTurn() {
  try {
    const me = Players.get(local);
    if (!me.isTurnActive || GameContext.hasSentTurnComplete()) return;
    dismissNow();
    const b = String(Game.Notifications.getEndTurnBlockingType(local));
    if (b !== String(EndTurnBlockingTypes.NONE)) {
      blockedTries++;
      if (blockedTries >= 4 && typeof Autoplay !== "undefined") {
        usedAutoplay++;
        emit("ENDTURN blocked: ONE AUTOPLAY TURN (the AI spends and assigns; stocks still readable)");
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
  setTimeout(() => { if (res) res(true); }, 5000);
});

async function run() {
  local = safe(() => GameContext.localPlayerID, -1);
  CONFIG.turnInterval = 99999;
  emit("modtest153 run local=" + local + " turn=" + safe(() => Game.turn) + " interval=" + CONFIG.turnInterval);
  await later(6000);
  await dismissPopups();
  const p = Players.get(local);
  const mine = safe(() => p.Cities.getCities() || [], []);
  const capital = mine.find((c) => safe(() => c.isCapital, false)) || mine[0];
  const foreignMajor = safe(() => Players.getAlive().filter((q) => q.id !== local && q.isMajor), []);
  const foreignCities = foreignMajor.flatMap((q) => safe(() => q.Cities.getCities() || [], [])).sort((a, b) => b.population - a.population);
  const foreign = foreignCities[0];
  emit("COMP city components " + J(components(capital)));
  emit("COMP FoodQueue fns " + J(safe(() => fnNames(capital.FoodQueue), null)) + " BuildQueue fns " + J(safe(() => fnNames(capital.BuildQueue), null)));

  // CULT
  const c0 = civicProgress(p);
  emit("CULT CALL grantYield(CULTURE,-100) civic=" + J(c0));
  safe(() => Players.grantYield(local, YieldTypes.YIELD_CULTURE, -100));
  const c1 = civicProgress(p); await later(3000); const c2 = civicProgress(p);
  emit("CULT -100 before=" + J(c0) + " now=" + J(c1) + " +3s=" + J(c2));
  emit("CULT CALL grantYield(CULTURE,+100) (restore)");
  safe(() => Players.grantYield(local, YieldTypes.YIELD_CULTURE, 100));
  await later(2000);
  emit("CULT +100 restore now=" + J(civicProgress(p)));

  // SCI
  const s0 = techProgress(p);
  emit("SCI CALL grantYield(SCIENCE,-100) tech=" + J(s0));
  safe(() => Players.grantYield(local, YieldTypes.YIELD_SCIENCE, -100));
  const s1 = techProgress(p); await later(3000); const s2 = techProgress(p); await later(5000); const s3 = techProgress(p);
  emit("SCI -100 before=" + J(s0) + " now=" + J(s1) + " +3s=" + J(s2) + " +8s=" + J(s3));
  safe(() => Players.grantYield(local, YieldTypes.YIELD_SCIENCE, 100));
  await later(2000);
  emit("SCI +100 restore now=" + J(techProgress(p)));

  // FOOD
  const fOwn = await tryWrite("FOOD own", capital, "FoodQueue", 50, foodState);
  await tryWrite("FOOD own", capital, "FoodQueue", -50, foodState);
  if (foreign) {
    await tryWrite("FOOD foreign", foreign, "FoodQueue", 50, foodState);
    await tryWrite("FOOD foreign", foreign, "FoodQueue", -50, foodState);
  }

  // PROD: a city with something in its queue
  const busy = mine.filter((c) => !safe(() => c.BuildQueue.isEmpty, true)).sort((a, b) => b.population - a.population)[0];
  const foreignBusy = foreignCities.find((c) => !safe(() => c.BuildQueue.isEmpty, true));
  emit("PROD own busy=" + J(busy ? prodState(busy) : null) + " foreign busy=" + J(foreignBusy ? prodState(foreignBusy) : null));
  if (busy) {
    await tryWrite("PROD own", busy, "BuildQueue", 50, prodState);
    await tryWrite("PROD own", busy, "BuildQueue", -50, prodState);
  }
  if (foreignBusy) {
    await tryWrite("PROD foreign", foreignBusy, "BuildQueue", 50, prodState);
    await tryWrite("PROD foreign", foreignBusy, "BuildQueue", -50, prodState);
  }

  // TURN: leave a +50 food on the capital and +50 production on the busy city, then end the turn.
  const pre = { food: foodState(capital), prod: busy ? prodState(busy) : null };
  emit("TURN CALL FoodQueue.addProgress(50) + BuildQueue.addProgress(50) before end turn");
  safe(() => capital.FoodQueue.addProgress(50));
  if (busy) safe(() => busy.BuildQueue.addProgress(50));
  await later(2000);
  const post = { food: foodState(capital), prod: busy ? prodState(busy) : null };
  emit("TURN pre=" + J(pre) + " afterWrite=" + J(post));
  if (await nextTurn()) {
    await dismissPopups();
    const cap2 = Cities.get(capital.id);
    const b2 = busy ? Cities.get(busy.id) : null;
    emit("TURN next turn=" + safe(() => Game.turn) + " autoplay=" + usedAutoplay + " food=" + J(cap2 && foodState(cap2)) + " prod=" + J(b2 && prodState(b2))
      + " (expected food ~ afterWrite.food + net; production ~ afterWrite.progress + net, or a completion)");
  }
  emit("DONE modtest153 finished");
}

emit("modtest153 attached");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() {
  const st = loadStateName();
  if (st === "GameStarted") {
    setTimeout(() => { run().catch((e) => { emit("run threw " + e + " " + (e && e.stack)); emit("DONE modtest153 finished"); }); }, 10000);
    return;
  }
  beginTries++;
  if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady());
  if (beginTries < 90) setTimeout(beginPoll, 2000); else { emit("LOAD gave up"); emit("DONE modtest153 finished"); }
}
setTimeout(beginPoll, 3000);
