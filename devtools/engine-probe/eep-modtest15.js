// eep-modtest15.js - READ-ONLY: what do REAL flows look like? On a save played with the mod (AugustusAnt136):
// every tracked settlement's composition (owner, total, top foreign origin share/pts), how many sit at the
// foothold (0.25) and established (0.30, stock 3) bars, the mod's cumulative migration flow totals, and
// any quarter records / candidacies already present. Logs [EmigTest]. Ends immediately (no turns).

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { allCityCompositions } from "/emigration/ui/emigration-composition.js";
import { allQuarterEntries, allCandidacyEntries } from "/emigration/ui/emigration-quarter-state.js";
import { migrationFlows, migrationFlowHistory, monoTurn } from "/emigration/ui/emigration-migration-stats.js";
import { collectCitySignals } from "/emigration/ui/emigration-cities.js";

const TAG = "[EmigTest]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }

function run() {
  const local = GameContext.localPlayerID;
  const sigs = collectCitySignals();
  emit("START turn=" + safe(() => Game.turn) + " mono=" + safe(() => monoTurn()) + " cities=" + sigs.length + " share=" + CONFIG.quarterEstablishedShare + " stock=" + CONFIG.quarterMinStock + " dwell=" + CONFIG.quarterDwellTurns + " integration=" + CONFIG.integrationRate);
  const comps = safe(() => allCityCompositions(), []) || [];
  let foothold = 0, established = 0, anyForeign = 0; const rows = [];
  for (const c of comps) {
    const lead = (c.comp.civs || []).find((x) => x.civ !== c.owner);
    if (!lead) continue;
    anyForeign++;
    const stock = lead.pts || 0;
    if (stock >= 3 && lead.share >= 0.25) foothold++;
    if (stock >= 3 && lead.share >= 0.3) established++;
    rows.push({ name: c.name, owner: c.owner, total: Math.round(c.comp.total * 10) / 10, origin: lead.civ, pts: Math.round(stock * 10) / 10, share: Math.round(lead.share * 100) / 100 });
  }
  rows.sort((a, b) => b.share - a.share);
  emit("COMPOSITION tracked=" + comps.length + " withForeign=" + anyForeign + " foothold=" + foothold + " established=" + established);
  for (const r of rows.slice(0, 15)) emit("TOP " + J(r));
  const pts = rows.map((r) => r.pts).sort((a, b) => b - a);
  emit("FOREIGN-PTS distribution (top 15): " + J(pts.slice(0, 15)) + " median=" + (pts.length ? pts[Math.floor(pts.length / 2)] : 0));
  const flows = safe(() => migrationFlows(), null);
  emit("FLOWS " + J(flows && { keys: Object.keys(flows).length, sample: Object.entries(flows).slice(0, 5) }));
  const hist = safe(() => migrationFlowHistory(), null);
  emit("FLOW-HISTORY frames=" + (hist && hist.length) + " last=" + J(hist && hist[hist.length - 1]).slice(0, 300));
  emit("QUARTERS records=" + allQuarterEntries().length + " candidacies=" + allCandidacyEntries().length + " " + J(allQuarterEntries().map((e) => ({ k: e.tileKey, o: e.rec.owner, civ: e.rec.originCiv, placed: e.rec.placed }))));
  emit("DONE modtest15 finished");
}
emit("modtest15 attached");
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
