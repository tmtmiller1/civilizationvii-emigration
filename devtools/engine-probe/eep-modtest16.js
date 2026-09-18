// eep-modtest16.js - REAL-ENGINE flow measurement: Autoplay with the mod's own per-turn pass running for
// many turns from AugustusAnt136, automatic recognition everywhere, themed placement ON. Every 10 turns:
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
const TURNS = 80;

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
  safe(() => { Autoplay.setTurns(TURNS); Autoplay.setReturnAsPlayer(local); Autoplay.setObserveAsPlayer(local); Autoplay.setActive(true); }, null);
  emit("AUTOPLAY " + TURNS + " turns");
}
engine.on("AgeProgressionChanged", () => {
  const t = safe(() => Game.turn, 0);
  turnsSeen++;
  if (t % 10 === 0 && t !== lastReport) { lastReport = t; report("T" + t); }
  if (turnsSeen >= TURNS) { report("FINAL"); emit("DONE modtest16 finished"); }
});
engine.on("GameAgeEnded", () => emit("EVENT GameAgeEnded turn=" + safe(() => Game.turn)));
emit("modtest16 attached");
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
