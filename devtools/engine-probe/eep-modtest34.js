// eep-modtest34.js - the newcomers pop-up quote. Mod test 55 never saw the pop-up: the saved option (automatic
// placement) replaced the probe's ask mode before the deferred flush. Here ask mode is set and flushed synchronously.
// AugustusAnt49, no turn ending. (1) Newcomers pop-up raised through arriveRural with a known foreign origin and
// kind "migrant": log the quote block's text, SHOT. (2) The real refugee decision: log its quote, SHOT. (3) A test
// dialog whose quote uses the okina (U+02BB), schwa (U+01DD), u-dot-below (U+1EE5), and a Thai letter that the
// fallback should have dropped: SHOT, so the screenshot shows which render and which draw boxes.
import { CONFIG } from "/emigration/ui/emigration-config.js";
import { collectCitySignals } from "/emigration/ui/emigration-cities.js";
import { arriveRural, flushArrivalPlacements, _setSyncFlushForTests } from "/emigration/ui/emigration-arrival-placement.js";
import { civType } from "/emigration/ui/emigration-naming.js";

const TAG = "[EmigTest]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function later(ms) { return new Promise((r) => setTimeout(r, ms)); }
function cityName(c) { return safe(() => Locale.compose(c.name), "?"); }
function dialog() { const all = Array.from(document.querySelectorAll("screen-dialog-box")); return all[all.length - 1] || null; }
async function capture(label) {
  let d = null;
  for (let i = 0; i < 40 && !d; i++) { d = dialog(); if (!d) await later(100); }
  if (!d) { emit(label + " no dialog appeared"); return false; }
  await later(900);
  const block = d.querySelector(".emig-quote-block");
  const rows = block ? Array.from(block.querySelectorAll(".text-accent-3")).map((r) => r.textContent) : [];
  const rects = block ? Array.from(block.querySelectorAll(".text-accent-3")).map((r) => { const b = r.getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; }) : [];
  emit(label + " title=" + J(safe(() => d.querySelector("fxs-header").getAttribute("title"))) + " quoteRows=" + J(rows) + " rowSizes=" + J(rects));
  emit("SHOT quote-" + label);
  await later(20000);
  return true;
}
async function dismissAny() {
  const d = dialog(); if (!d) return;
  const b = Array.from(d.querySelectorAll("fxs-button")).pop();
  if (b) safe(() => b.dispatchEvent(new CustomEvent("action-activate", { bubbles: true })));
  await later(1500);
}

async function run() {
  CONFIG.arrivalPlacement = 2;
  const local = GameContext.localPlayerID;
  const sigs = collectCitySignals();
  const home = sigs.find((s) => s.owner === local && /Bristol/.test(cityName(s.city))) || sigs.find((s) => s.owner === local);
  const foreign = sigs.find((s) => s.owner !== local && !s.isCityState);
  emit("START turn=" + safe(() => Game.turn) + " home=" + cityName(home.city) + " foreignOwner=" + foreign.owner + " foreignCiv=" + safe(() => civType(foreign.owner)));

  const known = sigs.find((x) => x.owner !== local && !x.isCityState && safe(() => Players.get(local).Diplomacy.hasMet(x.owner), false));
  emit("knownOwner=" + (known ? known.owner : "none") + " knownCiv=" + (known ? safe(() => civType(known.owner)) : "-"));
  for (const [label, origin] of [["ARRIVAL-UNMET", { civ: foreign.owner, kind: "refugee" }], ["ARRIVAL-MET", known ? { civ: known.owner, kind: "refugee" } : null]]) {
    if (!origin) continue;
    CONFIG.arrivalPlacement = 2;
    _setSyncFlushForTests(true);
    const ok = arriveRural(home.city, origin);
    _setSyncFlushForTests(false);
    emit(label + " arriveRural=" + ok + " mode=" + CONFIG.arrivalPlacement + " flushedAgain=" + safe(() => flushArrivalPlacements()));
    if (await capture(label)) await dismissAny();
  }
  emit("DONE modtest34 finished");
}

emit("modtest34 attached");
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
