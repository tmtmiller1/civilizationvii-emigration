// eep-modtest73.js - the policy cards' unlock and slotting, after mod test 70 found no TRADITION_EMIG_* card unlocked for
// any civ although every civ had Economics and the unlock rows are in the compiled DB (same shape as the base game's).
// Hypothesis: this save researched the civics before the mod's rows existed, and an unlock is granted only when a
// node completes. AugustusExp66, mod pass off. Logs the local player's full unlocked policy list (base cards such as
// TRADITION_MARITIME_LAW should be there), every EMIG node's state, then aims the civic tree at the first EMIG node
// not yet researched and ends turns (manual first, one-turn Autoplay only when held; the target is re-sent every
// turn) until that node completes or 40 turns pass. On unlock: CHANGE_TRADITION Activate, then isTraditionActive,
// the mod's borderStance / immigrationOpenness, and Influence per turn before and after.
import { CONFIG } from "/emigration/ui/emigration-config.js";
import { borderStance, immigrationOpenness, resetBorderCache } from "/emigration/ui/emigration-borders.js";

const TAG = "[EmigTest]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function later(ms) { return new Promise((r) => setTimeout(r, ms)); }

const NODES = {
  NODE_CIVIC_EX_MAIN_ECONOMICS: ["TRADITION_EMIG_OPEN_BORDERS_EXPLORATION", "TRADITION_EMIG_CLOSED_BORDERS_EXPLORATION"],
  NODE_CIVIC_EX_MAIN_INSPIRATION: ["TRADITION_EMIG_TALENT_EXPLORATION"],
  NODE_CIVIC_EX_MAIN_SOCIETY: ["TRADITION_EMIG_CULTPULL_EXPLORATION"],
  NODE_CIVIC_EX_MAIN_MERCANTILISM: ["TRADITION_EMIG_TRADEPULL_EXPLORATION"],
  NODE_CIVIC_EX_MAIN_PIETY: ["TRADITION_EMIG_ASYLUM_EXPLORATION"]
};
let local = -1;
let autoplayTurns = 0;
let ageEnded = false;
let firstInfected = null;
engine.on("GameAgeEnded", () => { ageEnded = true; emit("EVENT GameAgeEnded turn=" + safe(() => Game.turn)); });

// Plague: every major's settlements each turn; the first infected ones are logged with the plague plot effect on
// their center plot, so a live `city.isInfected` true is observed (mod test 70 saw none in 15 turns).
function majors() {
  return (safe(() => Players.getAliveMajorIds(), null) || []).filter((pid) => safe(() => Players.get(pid).isMajor, true));
}
function infectedSweep() {
  const plague = safe(() => GameInfo.PlotEffects.lookup("PLOTEFFECT_PLAGUE"), null);
  const out = [];
  for (const pid of majors()) {
    for (const id of safe(() => Players.get(pid).Cities.getCityIds(), []) || []) {
      const c = Cities.get(id);
      if (!c || !safe(() => c.isInfected, false)) continue;
      const plot = safe(() => GameplayMap.getIndexFromLocation(c.location), null);
      out.push({ pid, city: safe(() => Locale.compose(c.name), "?"), centrePlague: plague && plot != null ? safe(() => MapPlotEffects.hasPlotEffect(plot, plague.$index), null) : null });
    }
  }
  return out;
}
function notePlague() {
  const inf = infectedSweep();
  if (inf.length && !firstInfected) {
    firstInfected = { turn: safe(() => Game.turn), inf };
    emit("INFECTED turn=" + firstInfected.turn + " " + J(inf.slice(0, 8)));
  }
  return inf.length;
}

function culture() { return safe(() => Players.get(local).Culture, null); }
function typeName(id) { const t = safe(() => Game.Notifications.getType(id), null); return safe(() => Game.Notifications.getTypeName(t), "?"); }
function unlockedPolicyTypes() {
  const list = safe(() => culture().getUnlockedTraditions(CultureSlotTypes.POLICY_CULTURE_SLOT), null);
  if (!list) return null;
  return Array.from(list).map((h) => safe(() => GameInfo.Traditions.lookup(h).TraditionType, String(h)));
}
function nodeStates() {
  const out = {};
  for (const n of Object.keys(NODES)) out[n] = safe(() => culture().isNodeUnlocked(n), "?");
  return out;
}
function influence() { return safe(() => Players.get(local).Stats.getNetYield(YieldTypes.YIELD_DIPLOMACY), null); }
function stance() { safe(() => resetBorderCache()); return { stance: safe(() => borderStance(local)), openness: safe(() => immigrationOpenness(local)) }; }
function targetNode(node) {
  const row = safe(() => GameInfo.ProgressionTreeNodes.lookup(node), null);
  if (!row) return "no node row";
  return safe(() => Game.PlayerOperations.sendRequest(local, PlayerOperationTypes.SET_CULTURE_TREE_NODE, { ProgressionTreeNodeType: row.$index }));
}

async function closeScreens() {
  const visible = (el) => safe(() => el.getBoundingClientRect().width > 0, false);
  const caption = (b) => String(b.getAttribute("caption") || b.textContent || "").trim();
  for (let i = 0; i < 10; i++) {
    const buttons = Array.from(document.querySelectorAll("fxs-button, fxs-hero-button")).filter(visible);
    const pick = buttons.find((b) => /^ok$/i.test(caption(b))) || buttons.find((b) => /^reject$/i.test(caption(b))) ||
      Array.from(document.querySelectorAll("fxs-close-button")).filter(visible).pop();
    if (!pick) return;
    safe(() => pick.dispatchEvent(new CustomEvent("action-activate", { bubbles: true })));
    await later(2000);
  }
}
function placeReady() {
  for (const id of safe(() => Players.get(local).Cities.getCityIds(), []) || []) {
    const c = Cities.get(id);
    if (!c || !safe(() => c.Growth.isReadyToPlacePopulation, false)) continue;
    const exp = safe(() => Game.CityCommands.canStart(c.id, CityCommandTypes.EXPAND, {}, false), null);
    const plot = exp && Array.isArray(exp.Plots) && exp.Plots.length ? exp.Plots[0] : null;
    if (plot == null) continue;
    const l = GameplayMap.getLocationFromIndex(plot);
    safe(() => Game.CityCommands.sendRequest(c.id, CityCommandTypes.EXPAND, { X: l.x, Y: l.y }));
  }
}
async function endTurn(node) {
  const t0 = safe(() => Game.turn, 0);
  const advanced = async () => { for (let i = 0; i < 8; i++) { await later(5000); if (safe(() => Game.turn, 0) > t0) { await later(5000); await closeScreens(); return true; } } return false; };
  for (let attempt = 1; attempt <= 3; attempt++) {
    targetNode(node);
    placeReady();
    await later(1500);
    for (const id of safe(() => Game.Notifications.getIdsForPlayer(local), []) || []) {
      if (safe(() => Game.Notifications.getBlocksTurnAdvancement(id), false) && !/NEW_POPULATION/.test(typeName(id))) safe(() => Game.Notifications.dismiss(id));
    }
    safe(() => UI.Player.deselectAllUnits());
    safe(() => GameContext.sendTurnComplete());
    if (await advanced()) return "manual";
    await closeScreens();
  }
  autoplayTurns++;
  safe(() => { Autoplay.setTurns(1); Autoplay.setReturnAsPlayer(local); Autoplay.setObserveAsPlayer(local); Autoplay.setActive(true); });
  if (await advanced() || await advanced()) return "autoplay";
  return "";
}

// The Prosperity lens: mod test 70's single lens-on screenshot showed an even wash, which cannot tell the lens's
// per-plot fills from the base lens tint. Two shots from the same camera, default lens then Prosperity lens.
async function lensPair() {
  const LM = await import("/core/ui/lenses/lens-manager.js").then((m) => m.default || m.LensManager).catch((e) => { emit("LENS import failed " + e); return null; });
  if (!LM) return;
  safe(() => LM.setActiveLens("fxs-default-lens"));
  await later(4000);
  emit("SHOT lens-default");
  await later(10000);
  safe(() => LM.setActiveLens("emig-prosperity-lens"));
  await later(5000);
  emit("LENS active=" + J(safe(() => LM.getActiveLens())));
  emit("SHOT lens-prosperity");
  await later(10000);
  safe(() => LM.setActiveLens("fxs-default-lens"));
  await later(2000);
}

async function run() {
  local = GameContext.localPlayerID;
  CONFIG.turnInterval = 99999;
  await lensPair();
  const all = unlockedPolicyTypes();
  emit("START turn=" + safe(() => Game.turn) + " unlockedPolicies=" + J(all));
  emit("NODES " + J(nodeStates()) + " emigUnlocked=" + J((all || []).filter((t) => String(t).startsWith("TRADITION_EMIG_"))));
  const node = Object.keys(NODES).find((n) => nodeStates()[n] === false);
  if (!node) { emit("VERDICT every EMIG node already researched; nothing to unlock in this save"); emit("DONE modtest73 finished"); return; }
  const cards = NODES[node];
  emit("TARGET " + node + " for " + J(cards) + " sent=" + J(targetNode(node)) + " influence=" + influence() + " stance=" + J(stance()));
  let turns = 0, how = "";
  while (turns < 40 && !(nodeStates()[node] === true)) {
    how = await endTurn(node);
    if (!how) { emit("ENDTURN failed at turn " + safe(() => Game.turn)); break; }
    turns++;
    const infected = notePlague();
    if (turns % 5 === 0) emit("T turns=" + turns + " turn=" + safe(() => Game.turn) + " endedBy=" + how + " node=" + nodeStates()[node] + " infected=" + infected);
  }
  const after = unlockedPolicyTypes() || [];
  const emig = after.filter((t) => String(t).startsWith("TRADITION_EMIG_"));
  emit("UNLOCK node=" + node + " researched=" + nodeStates()[node] + " after " + turns + " turns; emigUnlocked=" + J(emig) + " newPolicies=" + J(after.filter((t) => !(all || []).includes(t))));
  if (!emig.includes(cards[0])) { emit("VERDICT card not unlocked; autoplayTurns=" + autoplayTurns); await plagueWatch(node); return; }
  const row = GameInfo.Traditions.lookup(cards[0]);
  const inf0 = influence();
  const args = { TraditionType: row.$index, Action: PlayerOperationParameters.Activate };
  const can = safe(() => Game.PlayerOperations.canStart(local, PlayerOperationTypes.CHANGE_TRADITION, args, false), null);
  const sent = safe(() => Game.PlayerOperations.sendRequest(local, PlayerOperationTypes.CHANGE_TRADITION, args), null);
  await later(4000);
  const active = safe(() => culture().isTraditionActive(row.$hash), null);
  emit("SLOT " + cards[0] + " canStart=" + J(can) + " sent=" + J(sent) + " active=" + active + " stance=" + J(stance()) + " influence=" + inf0 + "->" + influence());
  const next = await endTurn(node);
  emit("VERDICT unlocked=true slotted=" + active + " activeNextTurn=" + safe(() => culture().isTraditionActive(row.$hash), null) + " endedBy=" + next +
    " stance=" + J(stance()) + " influenceBeforeAfter=" + J([inf0, influence()]) + " autoplayTurns=" + autoplayTurns);
  await plagueWatch(node);
}

// After the policy part: keep ending turns until a settlement is infected, the age ends, or 100 turns pass.
async function plagueWatch(node) {
  let n = 0;
  while (!firstInfected && !ageEnded && n < 100) {
    const how = await endTurn(node);
    if (!how) { emit("ENDTURN failed at turn " + safe(() => Game.turn)); break; }
    n++;
    notePlague();
    if (n % 10 === 0) emit("PLAGUE watch turns=" + n + " turn=" + safe(() => Game.turn) + " endedBy=" + how);
  }
  const later1 = firstInfected ? infectedSweep() : [];
  emit("PLAGUE VERDICT firstInfected=" + J(firstInfected) + " stillInfectedNow=" + later1.length + " watchTurns=" + n + " ageEnded=" + ageEnded + " autoplayTurns=" + autoplayTurns);
  emit("DONE modtest73 finished");
}

emit("modtest73 attached");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() {
  const st = loadStateName();
  if (st === "GameStarted") { setTimeout(() => { run().catch((e) => { emit("run threw " + e + " " + (e && e.stack)); emit("DONE modtest73 finished"); }); }, 10000); return; }
  beginTries++;
  if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady());
  if (beginTries < 90) setTimeout(beginPoll, 2000); else emit("LOAD gave up");
}
setTimeout(beginPoll, 3000);
