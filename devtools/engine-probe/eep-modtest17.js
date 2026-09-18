// eep-modtest17.js - REAL-ENGINE flow measurement with the mod's per-turn pass actually RUNNING: the local
// player's turns are ended by the script (GameContext.sendTurnComplete), not by Autoplay, which does not
// activate the local player's turn and so never runs the pass (mod test 29). AugustusExp66, automatic recognition everywhere, themed placement ON. Every 10 turns:
// the largest single-origin foreign share and its stock, how many settlements sit at the foothold /
// established bars, cumulative migration counts, and the enclave records. Logs [EmigTest]. The turn
// counter is the age-local Game.turn (the age may end and reload the scripts; the report survives in
// GameConfiguration through the mod's own state, and this script re-attaches and keeps reporting).

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { allCityCompositions } from "/emigration/ui/emigration-composition.js";
import { allQuarterEntries, allCandidacyEntries } from "/emigration/ui/emigration-quarter-state.js";
import { migrationFlows } from "/emigration/ui/emigration-migration-stats.js";
import { collectCitySignals } from "/emigration/ui/emigration-cities.js";

const TAG = "[EmigTest]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
let local = -1, lastReport = -1, turnsSeen = 0;
const TURNS = 40;
let n = 0, endTurnTimer = null, blockedTries = 0, autoplayFallbacks = 0;

function report(tag) {
  const comps = safe(() => allCityCompositions(), []) || [];
  let foothold = 0, established = 0, withForeign = 0, best = { share: 0, pts: 0, name: "" };
  for (const c of comps) {
    const lead = (c.comp.civs || []).find((x) => x.civ !== c.owner);
    if (!lead || !(lead.pts > 0.05)) continue;
    withForeign++;
    if (lead.pts >= 3 && lead.share >= 0.25) foothold++;
    if (lead.pts >= 3 && lead.share >= 0.3) established++;
    if (lead.share > best.share) best = { share: Math.round(lead.share * 100) / 100, pts: Math.round(lead.pts * 10) / 10, name: c.name, owner: c.owner, origin: lead.civ, total: Math.round(c.comp.total) };
  }
  let moves = 0;
  safe(() => { for (const v of Object.values(migrationFlows() || {})) moves += Number(v) || 0; });
  const recs = allQuarterEntries();
  emit(tag + " turn=" + safe(() => Game.turn) + " age=" + safe(() => GameInfo.Ages.lookup(Game.age).AgeType) + " tracked=" + comps.length + " withForeign=" + withForeign + " foothold=" + foothold + " established=" + established + " best=" + J(best) + " flowTotal=" + moves + " candidacies=" + allCandidacyEntries().length + " enclaves=" + recs.length + " " + J(recs.map((e) => ({ o: e.rec.owner, civ: e.rec.originCiv, type: e.rec.placed && e.rec.placed.type }))));
}

function run() {
  local = GameContext.localPlayerID;
  CONFIG.quarterRecognition = 2; CONFIG.quartersEnabled = true; CONFIG.quarterPlaceImprovement = true;
  emit("START turn=" + safe(() => Game.turn) + " cities=" + collectCitySignals().length + " share=" + CONFIG.quarterEstablishedShare + " stock=" + CONFIG.quarterMinStock + " dwell=" + CONFIG.quarterDwellTurns + " integration=" + CONFIG.integrationRate + " recognition=" + CONFIG.quarterRecognition);
  report("T0");
  emit("ENDING " + TURNS + " turns by hand");
  setTimeout(endTurn, 2000);
}
function endTurn() {
  try {
    const me = Players.get(local);
    if (!me.isTurnActive || GameContext.hasSentTurnComplete()) return;
    const b = String(Game.Notifications.getEndTurnBlockingType(local));
    if (b !== String(EndTurnBlockingTypes.NONE)) {
      blockedTries++;
      if (blockedTries >= 3 && typeof Autoplay !== "undefined") { autoplayFallbacks++; emit("BLOCKED " + b + ": one Autoplay turn (fallback #" + autoplayFallbacks + ")"); safe(() => { Autoplay.setTurns(1); Autoplay.setReturnAsPlayer(local); Autoplay.setObserveAsPlayer(local); Autoplay.setActive(true); }); blockedTries = 0; endTurnTimer = setTimeout(endTurn, 30000); return; }
      endTurnTimer = setTimeout(endTurn, 4000); return;
    }
    safe(() => UI.Player.deselectAllUnits()); GameContext.sendTurnComplete();
  } catch (e) { emit("ENDTURN threw " + e); }
  endTurnTimer = setTimeout(() => { if (safe(() => Players.get(local).isTurnActive, false) && !GameContext.hasSentTurnComplete()) endTurn(); }, 12000);
}
engine.on("PlayerTurnActivated", (d) => {
  const who = d && (d.player ?? d.Player); if (who !== GameContext.localPlayerID) return;
  if (endTurnTimer) { clearTimeout(endTurnTimer); endTurnTimer = null; }
  n++; blockedTries = 0;
  const t = safe(() => Game.turn, 0);
  if (n % 5 === 0) setTimeout(() => report("T" + t + " (n=" + n + ", autoplayFallbacks=" + autoplayFallbacks + ")"), 5000);
  if (n >= TURNS) { setTimeout(() => { report("FINAL"); emit("DONE modtest17 finished"); }, 6000); return; }
  setTimeout(endTurn, 7000);
});
engine.on("GameAgeEnded", () => emit("EVENT GameAgeEnded turn=" + safe(() => Game.turn)));
emit("modtest17 attached");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() {
  const st = loadStateName();
  if (st === "GameStarted") { setTimeout(() => { try { run(); } catch (e) { emit("run threw " + e + " " + (e && e.stack)); } }, 8000); return; }
  beginTries++;
  if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady());
  if (beginTries < 90) setTimeout(beginPoll, 2000); else emit("LOAD gave up");
}
setTimeout(beginPoll, 3000);
