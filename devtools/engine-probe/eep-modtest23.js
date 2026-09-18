// eep-modtest23.js - per-age PACING of enclave formation, and the enclave-progress readout. AugustusExp66,
// human control, no turn ending. Logs [EmigTest]; "SHOT" lines ask the runner for screenshots.
//   K0 the live inputs: age progress (engine points), the local host's relaxation, plain and relaxed bars.
//      The age progress is overridden to 70% through the manager object when it can be; else the pacing
//      ramp is shortened so the real progress already yields the full relaxation.
//   K1 seed a local city with a foreign community BETWEEN the relaxed and the plain share bar, with a stock
//      under the plain size bar; one recognition pass must form an enclave (pacing), the host's counter
//      must read 1 and its relaxation 0.
//   K2 seed a second local city the same way; a pass must NOT form one (plain bars are back).
//   K3 push the counter to the cap and seed a third city well above the plain bars; a pass must NOT form
//      one; with the cap set to 0 it must.
//   K4 the readout snapshot's `enclave` field for the seeded cities, the dashboard's Diversity enclave
//      cells, then the readout panel on screen: SHOT readout-enclave.

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { maybeQuarter } from "/emigration/ui/emigration-quarter.js";
import { allQuarterEntries, formedThisAge, noteFormed, saveQuarters } from "/emigration/ui/emigration-quarter-state.js";
import { collectCitySignals } from "/emigration/ui/emigration-cities.js";
import { establishedStockBar, enclaveProgressForCity } from "/emigration/ui/emigration-diaspora.js";
import { recordCompositionPass, compositionForCity } from "/emigration/ui/emigration-composition.js";
import { relaxFor, ageProgressFraction, relaxedBar } from "/emigration/ui/emigration-enclave-pacing.js";
import { citySnapshot } from "/emigration/ui/emigration-city-readout-data.js";
import { gatherDashboard } from "/emigration/ui/emigration-window.js";

const TAG = "[EmigTest]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function later(ms) { return new Promise((r) => setTimeout(r, ms)); }
function cityName(c) { return safe(() => Locale.compose(c.name), "?"); }
function look(loc) { safe(() => Camera.lookAtPlot(loc, { zoom: 0, instantaneous: true })); }
function comp(c) { return safe(() => { const k = compositionForCity(c); return k && k.civs.slice(0, 3).map((x) => x.civ + ":" + Math.round(x.pts * 10) / 10 + "/" + Math.round(x.share * 100) + "%"); }); }
function records(owner) { return allQuarterEntries().filter((e) => e.rec.owner === owner).map((e) => e.tileKey + ":" + e.rec.originCiv); }

async function pass(label) {
  maybeQuarter(collectCitySignals(), false);
  await later(8000);
}

/** Seed `dest` with `pts` points from a foreign source city. */
function seed(sigs, src, dest, pts) {
  recordCompositionPass(sigs, [{ srcOwner: src.owner, srcName: cityName(src.city), destOwner: dest.owner, destName: cityName(dest.city), points: pts, cause: "prosperity", phase: "move", crossCiv: true }]);
}

async function run() {
  const local = GameContext.localPlayerID;
  CONFIG.quarterRecognition = 2; CONFIG.quarterForce = false; CONFIG.quartersEnabled = true;
  CONFIG.quarterDwellTurns = 0; CONFIG.quarterPacingEnabled = true; CONFIG.quarterTargetPerAge = 1;
  CONFIG.quarterPacingMax = 0.4; CONFIG.quarterPacingBy = 0.6; CONFIG.quarterCapPerAge = 3;
  const sigs = collectCitySignals();
  recordCompositionPass(sigs, []);
  const real = ageProgressFraction();
  // Try to override the manager's progress read; fall back to a short ramp.
  const mgr = safe(() => Game.AgeProgressManager);
  let overrode = false;
  try { const max = mgr.getMaxAgeProgressionPoints(); mgr.getCurrentAgeProgressionPoints = () => max * 0.7; overrode = ageProgressFraction() > 0.69; } catch (_) { /* not writable */ }
  if (!overrode) CONFIG.quarterPacingBy = 0.01;
  const mine = sigs.filter((s) => s.owner === local && !s.isTown && s.population >= 8).sort((a, b) => a.population - b.population);
  const foreign = sigs.filter((s) => s.owner !== local && !s.isCityState).sort((a, b) => b.population - a.population)[0];
  const r0 = relaxFor(local);
  const plainShare = Number(CONFIG.quarterEstablishedShare), plainStock = establishedStockBar();
  emit("K0 realProgress=" + real.toFixed(3) + " overrode=" + overrode + " progressNow=" + ageProgressFraction().toFixed(3) + " relax=" + r0.toFixed(3) +
    " shareBar plain=" + plainShare + " relaxed=" + relaxedBar(plainShare, r0).toFixed(3) + " stockBar plain=" + plainStock.toFixed(2) + " relaxed=" + relaxedBar(plainStock, r0).toFixed(2) +
    " formed=" + formedThisAge(local) + " localCities=" + J(mine.map((s) => cityName(s.city) + ":" + s.population)));
  if (!(r0 > 0.05) || !foreign || mine.length < 3) { emit("K0 cannot run: relax=" + r0 + " foreign=" + !!foreign + " cities=" + mine.length); emit("DONE modtest23 finished"); return; }

  // K1: a community between the bars. Stock must stay >= quarterMinStock and < the plain size bar.
  const stock = Math.max(Number(CONFIG.quarterMinStock) || 3, Math.min(4, Math.floor(plainStock - 0.5)));
  const targetShare = (relaxedBar(plainShare, r0) + plainShare) / 2;
  const pick = (/** @type {*[]} */ pool) => pool.slice().sort((a, b) => Math.abs(stock / a.population - targetShare) - Math.abs(stock / b.population - targetShare))[0];
  const A = pick(mine);
  seed(sigs, foreign, A, Math.ceil(stock / 0.8));
  emit("K1 seeded " + cityName(A.city) + " (pop " + A.population + ") target share " + targetShare.toFixed(3) + " comp=" + J(comp(A.city)) + " progress=" + J(safe(() => { const p = enclaveProgressForCity(A.city); return p && { share: +p.share.toFixed(3), stock: +p.stock.toFixed(1), stage: p.stage, bar: +p.establishedShare.toFixed(3), stockBar: +p.stockBar.toFixed(2), relax: +p.relax.toFixed(3) }; })));
  await pass("K1");
  emit("K1 after pass: records=" + J(records(local)) + " formed=" + formedThisAge(local) + " relaxNow=" + relaxFor(local).toFixed(3));

  // K2: a second city between the (now plain) bars must not form.
  const B = pick(mine.filter((s) => s !== A));
  seed(collectCitySignals(), foreign, B, Math.ceil(stock / 0.8));
  emit("K2 seeded " + cityName(B.city) + " comp=" + J(comp(B.city)) + " progress=" + J(safe(() => { const p = enclaveProgressForCity(B.city); return p && { share: +p.share.toFixed(3), stage: p.stage, bar: +p.establishedShare.toFixed(3), relax: +p.relax.toFixed(3) }; })));
  await pass("K2");
  emit("K2 after pass: records=" + J(records(local)) + " formed=" + formedThisAge(local));

  // K3: the cap. Two more counted, then a community clearly above the plain bars.
  noteFormed(local); noteFormed(local); saveQuarters();
  const C = mine.filter((s) => s !== A && s !== B).sort((a, b) => b.population - a.population)[0];
  seed(collectCitySignals(), foreign, C, Math.ceil(C.population * 0.45 / 0.8));
  emit("K3 formed=" + formedThisAge(local) + " seeded " + cityName(C.city) + " comp=" + J(comp(C.city)));
  await pass("K3a");
  emit("K3 capped pass: records=" + J(records(local)) + " (expect no " + cityName(C.city) + " record)");
  CONFIG.quarterCapPerAge = 0;
  await pass("K3b");
  emit("K3 uncapped pass: records=" + J(records(local)) + " (expect a record for " + cityName(C.city) + ")");
  CONFIG.quarterCapPerAge = 3;

  // K4: the surfaces.
  for (const s of [A, B, C]) emit("K4 snapshot " + cityName(s.city) + " enclave=" + J(safe(() => citySnapshot(s.city).enclave)));
  const dash = safe(() => gatherDashboard());
  const rows = safe(() => (dash.diversity || []).filter((r) => [A, B, C].some((s) => cityName(s.city) === r.name)).map((r) => r.name + " -> " + J(r.enclave)), "ERR");
  emit("K4 diversity cells=" + J(rows));
  look(B.city.location);
  safe(() => globalThis.emigration.city(B.city));
  await later(4000);
  emit("SHOT readout-enclave");
  await later(10000);
  emit("DONE modtest23 finished");
}

emit("modtest23 attached");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() {
  const st = loadStateName();
  if (st === "GameStarted") { setTimeout(() => { run().catch((e) => emit("run threw " + e + " " + (e && e.stack))); }, 12000); return; }
  beginTries++;
  if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady());
  if (beginTries < 90) setTimeout(beginPoll, 2000); else emit("LOAD gave up");
}
setTimeout(beginPoll, 3000);
