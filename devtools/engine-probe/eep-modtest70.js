// eep-modtest70.js - the four "in-engine confirmations" README §17 listed as best-effort, confirmed in game.
// AugustusExp66 (human-controlled Exploration save), the mod's pass off (turnInterval 99999). Turns are ended by hand
// (sendTurnComplete, never Autoplay): naturally grown points are placed with EXPAND first and dismissable blocking
// notifications cleared, so a Grow City prompt cannot stall the run.
//   P  policy cards: the 12 TRADITION_EMIG_* rows (lookup, $hash vs Database.makeHash, slot type, unlock rows,
//      modifiers); whether Economics unlocks the Exploration stances for player 0 (civic target set and turns ended
//      until it does, capped); CHANGE_TRADITION Activate of the Pro-Immigration Stance; the mod's borderStance /
//      immigrationOpenness; the player's Influence per turn before and after; AI civs slotting EMIG cards.
//   D  disasters: city.isInfected across every major's cities each turn; RandomEventOccurred and
//      PlotEffectAddedToMap payloads; an attempt to force PLOTEFFECT_PLAGUE on a foreign city's plot and read
//      isInfected / hasPlotEffect on the following turns.
//   Y  per-plot yields: GameplayMap.getYields(plotIndex, local) over every major's owned plots, tallied by shape,
//      owner, and revealed state; the Prosperity lens switched on and captured.
//   N  the happiness-deficit yield penalty: getYield vs getNetYield in every city (unhappy ones listed), then a
//      happiness building destroyed in a local city near zero happiness and its yields read before and after.
import { CONFIG } from "/emigration/ui/emigration-config.js";
import { borderStance, immigrationOpenness, resetBorderCache } from "/emigration/ui/emigration-borders.js";

const TAG = "[EmigTest]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function later(ms) { return new Promise((r) => setTimeout(r, ms)); }
function nm(c) { return safe(() => Locale.compose(c.name), "?"); }

const TYPES = ["OPEN_BORDERS", "CLOSED_BORDERS"].flatMap((f) => ["ANTIQUITY", "EXPLORATION", "MODERN"].map((a) => "TRADITION_EMIG_" + f + "_" + a))
  .concat(["TALENT", "CULTPULL", "TRADEPULL", "ASYLUM"].flatMap((f) => ["EXPLORATION", "MODERN"].map((a) => "TRADITION_EMIG_" + f + "_" + a)));
const YIELDS = ["YIELD_FOOD", "YIELD_PRODUCTION", "YIELD_GOLD", "YIELD_SCIENCE", "YIELD_CULTURE"];
let local = -1;
const events = [];

function majors() {
  return (safe(() => Players.getAliveMajorIds(), null) || safe(() => Players.getAliveIds(), []) || []).filter((pid) => safe(() => Players.get(pid).isMajor, true));
}
function citiesOf(pid) { return (safe(() => Players.get(pid).Cities.getCityIds(), []) || []).map((id) => Cities.get(id)).filter(Boolean); }
function typeName(id) { const t = safe(() => Game.Notifications.getType(id), null); return safe(() => Game.Notifications.getTypeName(t), "?"); }

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
  let n = 0;
  for (const c of citiesOf(local)) {
    if (!safe(() => c.Growth.isReadyToPlacePopulation, false)) continue;
    const exp = safe(() => Game.CityCommands.canStart(c.id, CityCommandTypes.EXPAND, {}, false), null);
    const plot = exp && Array.isArray(exp.Plots) && exp.Plots.length ? exp.Plots[0] : null;
    if (plot == null) continue;
    const l = GameplayMap.getLocationFromIndex(plot);
    safe(() => Game.CityCommands.sendRequest(c.id, CityCommandTypes.EXPAND, { X: l.x, Y: l.y }));
    n++;
  }
  return n;
}
// Manual first. Mod test 64 saw a hand-ended turn held by NOTIFICATION_CHOOSE_CITY_PRODUCTION, which dismissing does
// not clear; after three held attempts the turn is taken by one-turn Autoplay and flagged, because Autoplay may place
// points, pick production, and swap policies, so that turn's policy and yield readings are marked as Autoplay's.
let autoplayTurns = 0;
async function endTurn() {
  const t0 = safe(() => Game.turn, 0);
  const advanced = async () => { for (let i = 0; i < 8; i++) { await later(5000); if (safe(() => Game.turn, 0) > t0) { await later(5000); await closeScreens(); return true; } } return false; };
  for (let attempt = 1; attempt <= 3; attempt++) {
    placeReady();
    await later(1500);
    for (const id of safe(() => Game.Notifications.getIdsForPlayer(local), []) || []) {
      if (safe(() => Game.Notifications.getBlocksTurnAdvancement(id), false) && !/NEW_POPULATION/.test(typeName(id))) safe(() => Game.Notifications.dismiss(id));
    }
    safe(() => UI.Player.deselectAllUnits());
    safe(() => GameContext.sendTurnComplete());
    if (await advanced()) return "manual";
    const b = safe(() => Game.Notifications.getEndTurnBlockingType(local), null);
    emit("ENDTURN held t" + t0 + " attempt " + attempt + " blocker=" + typeName(safe(() => Game.Notifications.findEndTurnBlocking(local, b), null)));
    await closeScreens();
  }
  autoplayTurns++;
  safe(() => { Autoplay.setTurns(1); Autoplay.setReturnAsPlayer(local); Autoplay.setObserveAsPlayer(local); Autoplay.setActive(true); });
  if (await advanced() || await advanced()) return "autoplay";
  emit("ENDTURN failed to advance from " + t0 + " even with Autoplay");
  return "";
}

// ── P: policy cards ─────────────────────────────────────────────────────────────────────────────────
function policyRows() {
  const rows = TYPES.map((t) => {
    const r = safe(() => GameInfo.Traditions.lookup(t), null);
    return { t, loaded: !!r, index: r ? r.$index : null, hashMatches: r ? r.$hash === safe(() => Database.makeHash(t), null) : null, slot: r ? r.CultureSlotType : null };
  });
  const unlocks = safe(() => GameInfo.ProgressionTreeNodeUnlocks.filter((u) => String(u.TargetType).startsWith("TRADITION_EMIG_")).map((u) => u.ProgressionTreeNodeType + ">" + u.TargetType + "@" + u.UnlockDepth), []);
  const mods = safe(() => GameInfo.TraditionModifiers.filter((m) => String(m.TraditionType).startsWith("TRADITION_EMIG_")).length, "?");
  return { rows, unlocks, modifierRows: mods };
}
function activeEmig(pid) {
  const cul = safe(() => Players.get(pid).Culture, null);
  if (!cul) return null;
  return TYPES.filter((t) => { const r = safe(() => GameInfo.Traditions.lookup(t), null); return r && safe(() => cul.isTraditionActive(r.$hash), false); });
}
function unlockState(pid) {
  const cul = safe(() => Players.get(pid).Culture, null);
  const slot = safe(() => CultureSlotTypes.POLICY_CULTURE_SLOT, null);
  const unlocked = safe(() => (cul.getUnlockedTraditions(slot) || []).map((h) => safe(() => GameInfo.Traditions.lookup(h).TraditionType, h)), null);
  return {
    economics: safe(() => cul.isNodeUnlocked("NODE_CIVIC_EX_MAIN_ECONOMICS"), null),
    emigUnlocked: Array.isArray(unlocked) ? unlocked.filter((t) => String(t).startsWith("TRADITION_EMIG_")) : "getUnlockedTraditions:" + J(unlocked),
    active: activeEmig(pid),
    slots: safe(() => cul.getNumCultureSlots(slot), null),
    canSwap: safe(() => cul.canSwapCultureSlot(slot), null)
  };
}
function influence() { return safe(() => Players.get(local).Stats.getNetYield(YieldTypes.YIELD_DIPLOMACY), null); }
function slotStance(type, action) {
  const r = safe(() => GameInfo.Traditions.lookup(type), null);
  if (!r) return { sent: false, why: "no row" };
  const args = { TraditionType: r.$index, Action: action === "off" ? PlayerOperationParameters.Deactivate : PlayerOperationParameters.Activate };
  const can = safe(() => Game.PlayerOperations.canStart(local, PlayerOperationTypes.CHANGE_TRADITION, args, false), null);
  const sent = safe(() => Game.PlayerOperations.sendRequest(local, PlayerOperationTypes.CHANGE_TRADITION, args), null);
  return { can, sent };
}
function readStance() { safe(() => resetBorderCache()); return { stance: safe(() => borderStance(local)), openness: safe(() => immigrationOpenness(local)) }; }

// ── D: disasters ────────────────────────────────────────────────────────────────────────────────────
function infectedSweep() {
  const out = [];
  for (const pid of majors()) for (const c of citiesOf(pid)) if (safe(() => c.isInfected, false)) out.push(pid + ":" + nm(c));
  return out;
}

// ── Y: per-plot yields ──────────────────────────────────────────────────────────────────────────────
function yieldSweep() {
  const tally = { tuples: 0, empty: 0, other: 0, samples: [] };
  const by = {};
  for (const pid of majors()) {
    for (const c of citiesOf(pid)) {
      for (const idx of safe(() => c.getPurchasedPlots(), []) || []) {
        const loc = GameplayMap.getLocationFromIndex(idx);
        const rev = String(safe(() => GameplayMap.getRevealedState(local, loc.x, loc.y), "?"));
        const y = safe(() => GameplayMap.getYields(idx, local), "throw");
        const kind = Array.isArray(y) ? (y.length === 0 ? "empty" : (y.every((e) => Array.isArray(e) && typeof e[0] === "number" && typeof e[1] === "number") ? "tuples" : "other")) : "other";
        tally[kind]++;
        const k = (pid === local ? "own" : "foreign") + "/rev" + rev + "/" + kind;
        by[k] = (by[k] || 0) + 1;
        if (kind === "other" && tally.samples.length < 5) tally.samples.push(J(y).slice(0, 80));
      }
    }
  }
  return { tally, by };
}

// ── N: happiness penalty ────────────────────────────────────────────────────────────────────────────
function cityYields(c) {
  const o = { happy: safe(() => c.Happiness.netHappinessPerTurn, null) };
  for (const y of YIELDS) o[y.slice(6, 10)] = [safe(() => Math.round(c.Yields.getYield(YieldTypes[y]) * 10) / 10, null), safe(() => Math.round(c.Yields.getNetYield(YieldTypes[y]) * 10) / 10, null)];
  return o;
}
function penaltyCross() {
  let differ = 0, total = 0;
  const unhappy = [];
  for (const pid of majors()) {
    for (const c of citiesOf(pid)) {
      const o = cityYields(c);
      total++;
      if (YIELDS.some((y) => { const p = o[y.slice(6, 10)]; return p[0] !== p[1]; })) differ++;
      if (typeof o.happy === "number" && o.happy < 0 && unhappy.length < 6) unhappy.push({ city: nm(c), ...o });
    }
  }
  return { total, getYieldDiffersFromNet: differ, unhappy };
}
function happinessBuilding(c) {
  const happyTypes = new Set(safe(() => GameInfo.Constructible_YieldChanges.filter((r) => r.YieldType === "YIELD_HAPPINESS").map((r) => r.ConstructibleType), []));
  for (const idx of safe(() => c.getPurchasedPlots(), []) || []) {
    const loc = GameplayMap.getLocationFromIndex(idx);
    for (const id of safe(() => MapConstructibles.getConstructibles(loc.x, loc.y), []) || []) {
      const inst = safe(() => Constructibles.getByComponentID(id), null);
      const info = inst ? safe(() => GameInfo.Constructibles.lookup(inst.type), null) : null;
      if (info && info.ConstructibleClass === "BUILDING" && happyTypes.has(info.ConstructibleType)) {
        const own = safe(() => GameInfo.Constructible_YieldChanges.filter((r) => r.ConstructibleType === info.ConstructibleType).map((r) => r.YieldType + ":" + r.YieldChange), []);
        return { id, type: info.ConstructibleType, own };
      }
    }
  }
  return null;
}

async function run() {
  local = GameContext.localPlayerID;
  CONFIG.turnInterval = 99999;
  safe(() => engine.on("RandomEventOccurred", (d) => events.push("RE t" + safe(() => Game.turn) + " " + J(d).slice(0, 160))));
  safe(() => engine.on("PlotEffectAddedToMap", (d) => events.push("PE+ t" + safe(() => Game.turn) + " " + J(d).slice(0, 160))));
  safe(() => engine.on("TraditionChanged", (d) => events.push("TC t" + safe(() => Game.turn) + " " + J(d).slice(0, 120))));
  emit("START turn=" + safe(() => Game.turn) + " majors=" + J(majors()));

  // P0 / P1
  emit("P0 " + J(policyRows()));
  const foreign = majors().filter((p) => p !== local);
  emit("P1 local=" + J(unlockState(local)) + " foreign=" + J(foreign.map((p) => ({ p, ...unlockState(p) }))));

  // Y
  emit("Y " + J(yieldSweep()));
  const LM = await import("/core/ui/lenses/lens-manager.js").then((m) => m.default || m.LensManager).catch((e) => { emit("Y lens import failed " + e); return null; });
  if (LM) {
    safe(() => LM.setActiveLens("emig-prosperity-lens"));
    await later(4000);
    emit("Y lens active=" + J(safe(() => LM.getActiveLens())));
    emit("SHOT prosperity-lens");
    await later(10000);
    safe(() => LM.setActiveLens("fxs-default-lens"));
  }

  // D: sweep and force a plague on a foreign city's centre plot
  emit("D infected=" + J(infectedSweep()));
  let plagueCity = null, plaguePlot = null;
  const plague = safe(() => GameInfo.PlotEffects.lookup("PLOTEFFECT_PLAGUE"), null);
  const target = foreign.length ? citiesOf(foreign[0])[0] : null;
  if (plague && target) {
    plagueCity = target;
    plaguePlot = safe(() => GameplayMap.getIndexFromLocation(target.location), null);
    const r = safe(() => MapPlotEffects.addPlotEffect(plaguePlot, plague.$index));
    await later(3000);
    emit("D forced plague on " + nm(target) + " plot=" + plaguePlot + " addPlotEffect=" + J(r) + " hasPlotEffect=" + J(safe(() => MapPlotEffects.hasPlotEffect(plaguePlot, plague.$index))) +
      " effects=" + J(safe(() => MapPlotEffects.getPlotEffects(plaguePlot))) + " isInfected=" + J(safe(() => target.isInfected)));
  } else emit("D no plague row or target: " + J({ plague: !!plague, target: !!target }));

  // N: cross-sectional, then a happiness building removed near zero happiness
  emit("N cross " + J(penaltyCross()));
  const cand = citiesOf(local).map((c) => ({ c, h: safe(() => c.Happiness.netHappinessPerTurn, 999), b: happinessBuilding(c) }))
    .filter((x) => x.b && typeof x.h === "number").sort((a, b) => a.h - b.h);
  const pick = cand.find((x) => x.h >= 0) || cand[0];
  const control = citiesOf(local).find((c) => !pick || c !== pick.c);
  let nTarget = null;
  if (pick) {
    nTarget = pick.c;
    emit("N before " + nm(pick.c) + " " + J(cityYields(pick.c)) + " building=" + J(pick.b) + " control " + nm(control) + " " + J(cityYields(control)));
    safe(() => Game.PlayerOperations.sendRequest(local, "DESTROY_ELEMENT", { Kind: "CONSTRUCTIBLE", Owner: pick.b.id.owner, LocalID: pick.b.id.id }));
    await later(4000);
    emit("N +4s " + nm(pick.c) + " " + J(cityYields(pick.c)) + " control " + J(cityYields(control)));
  } else emit("N no local city with a happiness building found");

  // P2: slot the Pro-Immigration Stance if already unlocked; otherwise aim the civic tree at Economics
  const inf0 = influence();
  let slotted = false;
  const tryslot = async () => {
    const st = unlockState(local);
    if (!Array.isArray(st.emigUnlocked) || !st.emigUnlocked.includes("TRADITION_EMIG_OPEN_BORDERS_EXPLORATION")) return false;
    const res = slotStance("TRADITION_EMIG_OPEN_BORDERS_EXPLORATION", "on");
    await later(4000);
    emit("P2 slot " + J(res) + " after=" + J(unlockState(local)) + " mod=" + J(readStance()) + " influence=" + inf0 + "->" + influence());
    return (activeEmig(local) || []).includes("TRADITION_EMIG_OPEN_BORDERS_EXPLORATION");
  };
  slotted = await tryslot();
  if (!slotted && unlockState(local).economics === false) {
    const node = safe(() => GameInfo.ProgressionTreeNodes.lookup("NODE_CIVIC_EX_MAIN_ECONOMICS"), null);
    const r = node ? safe(() => Game.PlayerOperations.sendRequest(local, PlayerOperationTypes.SET_CULTURE_TREE_NODE, { ProgressionTreeNodeType: node.$index })) : "no node";
    emit("P2 civic target Economics sent=" + J(r));
  }

  // Turns: follow every thread
  const infSlot = slotted ? influence() : null;
  for (let n = 1; n <= 14; n++) {
    const how = await endTurn();
    if (!how) break;
    const line = { turn: safe(() => Game.turn), endedBy: how, infected: infectedSweep().length };
    if (plagueCity) line.plague = { city: nm(plagueCity), isInfected: safe(() => plagueCity.isInfected), has: safe(() => MapPlotEffects.hasPlotEffect(plaguePlot, plague.$index)) };
    if (nTarget) line.n = { city: nm(nTarget), ...cityYields(nTarget) };
    line.aiEmig = foreign.map((p) => ({ p, a: activeEmig(p) })).filter((x) => x.a && x.a.length);
    if (!slotted) {
      line.economics = unlockState(local).economics;
      slotted = await tryslot();
      line.slottedNow = slotted;
    } else {
      line.stance = readStance();
      line.influence = influence();
    }
    emit("T " + J(line));
    if (slotted && n >= 4 && (!nTarget || n >= 3)) break;
  }
  emit("EVENTS " + J(events.slice(0, 20)));
  emit("VERDICT policyRowsLoaded=" + J(policyRows().rows.filter((r) => r.loaded).map((r) => r.t)) + " slotted=" + slotted + " stance=" + J(readStance()) +
    " influenceBeforeAfter=" + J([inf0, infSlot, influence()]) + " infectedNow=" + infectedSweep().length + " autoplayTurns=" + autoplayTurns);
  emit("DONE modtest70 finished");
}

emit("modtest70 attached");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() {
  const st = loadStateName();
  if (st === "GameStarted") { setTimeout(() => { run().catch((e) => { emit("run threw " + e + " " + (e && e.stack)); emit("DONE modtest70 finished"); }); }, 10000); return; }
  beginTries++;
  if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady());
  if (beginTries < 90) setTimeout(beginPoll, 2000); else emit("LOAD gave up");
}
setTimeout(beginPoll, 3000);
