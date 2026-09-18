// eep-modtest76.js - slotting a policy card. Mod test 73 unlocked TRADITION_EMIG_CULTPULL_EXPLORATION by researching
// Society (6 turns), but CHANGE_TRADITION Activate reported canStart Success false and the card never became active.
// The base policies screen sends the same arguments ({TraditionType: $index, Action}) and removes cards before adding
// them, so the likely cause is five full policy slots (mod test 70: 5 slots, canSwapCultureSlot false). AugustusExp66,
// mod pass off. Research Society again; each turn after it completes, log canSwapCultureSlot, the slot count, and the
// active cards; when a swap is allowed, deactivate one active base card if the slots are full (waiting for
// TraditionChanged), activate the EMIG card, then read isTraditionActive, Influence per turn, and the card's effect
// over two turns.
import { CONFIG } from "/emigration/ui/emigration-config.js";

const TAG = "[EmigTest]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function later(ms) { return new Promise((r) => setTimeout(r, ms)); }

const NODE = "NODE_CIVIC_EX_MAIN_SOCIETY";
const CARD = "TRADITION_EMIG_CULTPULL_EXPLORATION";
let local = -1;
let ageEnded = false;
engine.on("GameAgeEnded", () => { ageEnded = true; });

function culture() { return safe(() => Players.get(local).Culture, null); }
function typeName(id) { const t = safe(() => Game.Notifications.getType(id), null); return safe(() => Game.Notifications.getTypeName(t), "?"); }
function slot() { return safe(() => CultureSlotTypes.POLICY_CULTURE_SLOT, null); }
function unlockedPolicies() {
  return Array.from(safe(() => culture().getUnlockedTraditions(slot()), []) || []).map((h) => safe(() => GameInfo.Traditions.lookup(h), null)).filter(Boolean);
}
function activePolicies() { return unlockedPolicies().filter((r) => safe(() => culture().isTraditionActive(r.$hash), false)); }
function policyState() {
  return {
    canSwap: safe(() => culture().canSwapCultureSlot(slot()), null),
    slots: safe(() => culture().getNumCultureSlots(slot()), null),
    active: activePolicies().map((r) => r.TraditionType),
    cardUnlocked: unlockedPolicies().some((r) => r.TraditionType === CARD),
    influence: safe(() => Players.get(local).Stats.getNetYield(YieldTypes.YIELD_DIPLOMACY), null),
    notes: (safe(() => Game.Notifications.getIdsForPlayer(local), []) || []).map(typeName).filter((t) => /POLIC|TRADITION|CIVIC|CULTURE/.test(t))
  };
}
function change(row, action) {
  const args = { TraditionType: row.$index, Action: action === "off" ? PlayerOperationParameters.Deactivate : PlayerOperationParameters.Activate };
  const can = safe(() => Game.PlayerOperations.canStart(local, PlayerOperationTypes.CHANGE_TRADITION, args, false), null);
  if (!can || !can.Success) return { can, sent: false };
  return new Promise((resolve) => {
    let done = false;
    const h = engine.on("TraditionChanged", (d) => { if (done) return; done = true; safe(() => h.clear()); resolve({ can, sent: true, event: d }); });
    safe(() => Game.PlayerOperations.sendRequest(local, PlayerOperationTypes.CHANGE_TRADITION, args));
    setTimeout(() => { if (!done) { done = true; safe(() => h.clear()); resolve({ can, sent: true, event: "none in 8s" }); } }, 8000);
  });
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
function target() {
  const row = safe(() => GameInfo.ProgressionTreeNodes.lookup(NODE), null);
  if (row) safe(() => Game.PlayerOperations.sendRequest(local, PlayerOperationTypes.SET_CULTURE_TREE_NODE, { ProgressionTreeNodeType: row.$index }));
}
// Manual end turn; blocking notifications other than Grow City and policy choices are dismissed (a policy-choice
// blocker is logged, it is the swap window this test is looking for). One-turn Autoplay only after three held tries.
async function endTurn() {
  const t0 = safe(() => Game.turn, 0);
  const advanced = async () => { for (let i = 0; i < 8; i++) { await later(5000); if (safe(() => Game.turn, 0) > t0) { await later(5000); await closeScreens(); return true; } } return false; };
  for (let attempt = 1; attempt <= 3; attempt++) {
    target();
    placeReady();
    await later(1500);
    for (const id of safe(() => Game.Notifications.getIdsForPlayer(local), []) || []) {
      const t = typeName(id);
      if (!safe(() => Game.Notifications.getBlocksTurnAdvancement(id), false)) continue;
      if (/POLIC|TRADITION/.test(t)) { emit("BLOCKER policy notification " + t + " state=" + J(policyState())); continue; }
      if (!/NEW_POPULATION/.test(t)) safe(() => Game.Notifications.dismiss(id));
    }
    safe(() => UI.Player.deselectAllUnits());
    safe(() => GameContext.sendTurnComplete());
    if (await advanced()) return "manual";
    await closeScreens();
  }
  safe(() => { Autoplay.setTurns(1); Autoplay.setReturnAsPlayer(local); Autoplay.setObserveAsPlayer(local); Autoplay.setActive(true); });
  if (await advanced() || await advanced()) return "autoplay";
  return "";
}

async function trySlot() {
  const st = policyState();
  if (!st.cardUnlocked || !st.canSwap) return null;
  const card = GameInfo.Traditions.lookup(CARD);
  let removed = null;
  if (typeof st.slots === "number" && st.active.length >= st.slots) {
    const base = activePolicies().find((r) => !String(r.TraditionType).startsWith("TRADITION_EMIG_"));
    if (base) removed = { type: base.TraditionType, result: await change(base, "off") };
  }
  const added = await change(card, "on");
  await later(2000);
  const after = policyState();
  emit("SLOT removed=" + J(removed) + " added=" + J(added) + " before=" + J(st) + " after=" + J(after));
  return after.active.includes(CARD);
}

async function run() {
  local = GameContext.localPlayerID;
  CONFIG.turnInterval = 99999;
  emit("START turn=" + safe(() => Game.turn) + " state=" + J(policyState()) + " societyResearched=" + safe(() => culture().isNodeUnlocked(NODE)));
  target();
  let turns = 0, slotted = false, how = "";
  while (turns < 30 && !slotted && !ageEnded) {
    how = await endTurn();
    if (!how) { emit("ENDTURN failed at turn " + safe(() => Game.turn)); break; }
    turns++;
    const st = policyState();
    if (st.cardUnlocked) emit("T turn=" + safe(() => Game.turn) + " endedBy=" + how + " state=" + J(st));
    slotted = !!(await trySlot());
  }
  if (!slotted) { emit("VERDICT slotted=false after " + turns + " turns state=" + J(policyState())); emit("DONE modtest76 finished"); return; }
  const inf0 = policyState().influence;
  for (let i = 1; i <= 2; i++) {
    how = await endTurn();
    emit("AFTER turn=" + safe(() => Game.turn) + " endedBy=" + how + " state=" + J(policyState()));
  }
  emit("VERDICT slotted=true stillActive=" + policyState().active.includes(CARD) + " influence " + inf0 + "->" + policyState().influence);
  emit("DONE modtest76 finished");
}

emit("modtest76 attached");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() {
  const st = loadStateName();
  if (st === "GameStarted") { setTimeout(() => { run().catch((e) => { emit("run threw " + e + " " + (e && e.stack)); emit("DONE modtest76 finished"); }); }, 10000); return; }
  beginTries++;
  if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady());
  if (beginTries < 90) setTimeout(beginPoll, 2000); else emit("LOAD gave up");
}
setTimeout(beginPoll, 3000);
