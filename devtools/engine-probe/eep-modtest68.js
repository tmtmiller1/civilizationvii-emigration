// eep-modtest68.js - watching this session's unwatched features in game. AugustusExp66, CONFIG at defaults, the
// mod's pass off (turnInterval 99999) so nothing else moves. Through the shipped code on London:
//   A  arrivals by type (Ask me, defaults ask refugees only): a migrant and a returnee are placed at once with no
//      dialog (pending back to 0, one more improvement); a refugee raises the Newcomers dialog, whose "Later" note
//      is read and captured, then "Let the city settle them" places it.
//   B  put down roots: an enclave record for a foreign origin on London's tile; hasRoots / returnRateFor; London
//      selected and a real panel-city-details created, its text searched for the roots line, captured.
//   C  the game seed: currentGameId() and a run of seeded return rolls.
//   D  refugees resettling: points queued in London's pool, whether selecting the city showed the readout on its
//      own (the best-effort CitySelectionChanged listener), then the readout shown and searched for the renamed
//      "Refugees resettling" text, captured.
import { CONFIG, CONFIG_DEFAULTS } from "/emigration/ui/emigration-config.js";
import { collectCitySignals } from "/emigration/ui/emigration-cities.js";
import { arriveRural } from "/emigration/ui/emigration-arrival-placement.js";
import { putQuarter, dropQuarter } from "/emigration/ui/emigration-quarter-state.js";
import { queueRefugees, refugeePoolTotal } from "/emigration/ui/emigration-refugee-pool.js";
import { currentGameId } from "/emigration/ui/emigration-cache-reset.js";
import { __test as ret } from "/emigration/ui/emigration-return.js";
import { civType } from "/emigration/ui/emigration-naming.js";

const TAG = "[EmigTest]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function later(ms) { return new Promise((r) => setTimeout(r, ms)); }
function visible(el) { return safe(() => el.getBoundingClientRect().width > 0, false); }
function caption(b) { return String(b.getAttribute("caption") || b.textContent || "").trim(); }

let local = -1;

function improvements(c) {
  let n = 0;
  for (const plot of safe(() => c.getPurchasedPlots(), []) || []) {
    const loc = GameplayMap.getLocationFromIndex(plot);
    for (const id of safe(() => MapConstructibles.getConstructibles(loc.x, loc.y), []) || []) {
      const inst = safe(() => Constructibles.getByComponentID(id), null);
      const info = inst ? safe(() => GameInfo.Constructibles.lookup(inst.type), null) : null;
      if (info && info.ConstructibleClass === "IMPROVEMENT") n++;
    }
  }
  return n;
}
function snap(c) {
  const city = safe(() => Cities.get(c.id), c);
  return { pop: city.population, pending: safe(() => city.pendingPopulation), ready: safe(() => city.Growth.isReadyToPlacePopulation), improvements: improvements(city) };
}
function dialogs() { return Array.from(document.querySelectorAll("screen-dialog-box")).filter(visible); }
function dialogInfo(d) {
  return { title: safe(() => d.querySelector("fxs-header").getAttribute("title"), "?"),
    buttons: Array.from(d.querySelectorAll("fxs-button, fxs-hero-button")).map(caption),
    text: String(d.textContent || "").replace(/\s+/g, " ").slice(0, 700) };
}

async function run() {
  local = GameContext.localPlayerID;
  Object.assign(CONFIG, CONFIG_DEFAULTS);
  CONFIG.turnInterval = 99999;
  const sigs = collectCitySignals();
  const L = sigs.find((s) => s.owner === local && /London/.test(safe(() => Locale.compose(s.city.name), "")));
  const F = sigs.find((s) => s.owner !== local && !s.isCityState);
  emit("START turn=" + safe(() => Game.turn) + " placement=" + CONFIG.arrivalPlacement + " ask=" + J({ refugees: CONFIG.arrivalAskRefugees, migrants: CONFIG.arrivalAskMigrants, returnees: CONFIG.arrivalAskReturnees }) +
    " foreign=" + F.owner + ":" + civType(F.owner) + " london=" + J(snap(L.city)));

  // A: arrivals by type
  for (const [tag, from] of [["migrant", { civ: F.owner, kind: "migrant" }], ["returnee", undefined]]) {
    const before = snap(L.city);
    safe(() => arriveRural(L.city, from));
    await later(5000);
    const after = snap(L.city);
    const ds = dialogs();
    emit("A " + tag + " dialogs=" + ds.length + " before=" + J(before) + " after=" + J(after) +
      " placedWithoutDialog=" + (ds.length === 0 && after.pending === before.pending && after.improvements === before.improvements + 1));
  }
  const beforeRef = snap(L.city);
  safe(() => arriveRural(L.city, { civ: F.owner, kind: "refugee" }));
  await later(4000);
  const ds = dialogs();
  const info = ds.length ? dialogInfo(ds[ds.length - 1]) : null;
  emit("A refugee dialogs=" + ds.length + " info=" + J(info) + " laterNoteShown=" + !!(info && /Grow City prompt asks you to place them/.test(info.text)) + " state=" + J(snap(L.city)));
  emit("SHOT arrival-refugee");
  await later(9000);
  if (ds.length) {
    const b = Array.from(ds[ds.length - 1].querySelectorAll("fxs-button, fxs-hero-button")).find((x) => /Let the city settle them/i.test(caption(x)));
    safe(() => b.dispatchEvent(new CustomEvent("action-activate", { bubbles: true })));
    await later(5000);
  }
  const afterRef = snap(L.city);
  emit("A refugee after answer: " + J(afterRef) + " placed=" + (afterRef.pending === beforeRef.pending && afterRef.improvements === beforeRef.improvements + 1));

  // B: put down roots
  const key = L.city.location.x + "," + L.city.location.y;
  safe(() => putQuarter(key, { civ: F.owner, originCiv: civType(F.owner), owner: local, optionId: "a", turn: safe(() => Game.turn, 0),
    applied: { benefitYield: null, benefitAmount: 0, penaltyYield: null, penaltyAmount: 0 }, contested: false, contestedTurn: -999 }));
  emit("B hasRoots=" + safe(() => ret.hasRoots(L.city, F.owner)) + " rate=" + safe(() => ret.returnRateFor(L.city, F.owner)) + " base=" + CONFIG.returnRate +
    " otherOrigin=" + safe(() => ret.returnRateFor(L.city, local)));
  safe(() => UI.Player.selectCity(L.city.id));
  await later(3000);
  const readoutAuto = !!document.getElementById("emig-readout");
  const panel = document.createElement("panel-city-details");
  document.body.appendChild(panel);
  await later(5000);
  const panelText = String(panel.textContent || "").replace(/\s+/g, " ");
  const quarters = document.getElementById("emigration-city-quarters");
  emit("B panel quartersSection=" + !!quarters + " rootsLine=" + /Put down roots/.test(panelText) + " excerpt=" + J((quarters ? quarters.textContent : panelText).replace(/\s+/g, " ").slice(0, 400)));
  emit("SHOT roots-panel");
  await later(9000);
  safe(() => panel.remove());

  // C: the game seed
  const rolls = [];
  for (let t = 1; t <= 10; t++) rolls.push(safe(() => ret.returnRoll("London", t, 0.5)) ? 1 : 0);
  emit("C gameSeed=" + J(currentGameId()) + " rolls(rate 0.5, turns 1-10)=" + rolls.join(""));

  // D: refugees resettling in the readout
  safe(() => queueRefugees(L.key, F.owner, safe(() => Game.turn, 0), 3));
  emit("D pool=" + refugeePoolTotal(L.key) + " readoutShownBySelection=" + readoutAuto);
  safe(() => globalThis.emigration.city(L.city.id));
  await later(3000);
  const ro = document.getElementById("emig-readout");
  const roText = ro ? String(ro.textContent || "").replace(/\s+/g, " ") : "";
  emit("D readout=" + !!ro + " resettlingText=" + /Refugees resettling/.test(roText) + " excerpt=" + J(roText.slice(0, 500)));
  emit("SHOT readout-resettling");
  await later(9000);
  safe(() => dropQuarter(key));
  emit("DONE modtest68 finished");
}

emit("modtest68 attached");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() {
  const st = loadStateName();
  if (st === "GameStarted") { setTimeout(() => { run().catch((e) => { emit("run threw " + e + " " + (e && e.stack)); emit("DONE modtest68 finished"); }); }, 10000); return; }
  beginTries++;
  if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady());
  if (beginTries < 90) setTimeout(beginPoll, 2000); else emit("LOAD gave up");
}
setTimeout(beginPoll, 3000);
