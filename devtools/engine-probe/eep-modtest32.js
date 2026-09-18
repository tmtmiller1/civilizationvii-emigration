// eep-modtest32.js - the enclave quote block drew its attribution but not the quote (mod test 52). Hypothesis:
// `font-style: italic` blanks the line because the body font has no italic face. AugustusAnt49, no turn ending.
// Raise the enclave decision; once the quote block is in the dialog, measure the quote line (rect, computed
// font-style / family, text length) as shipped (italic), then as normal, then as a skewed upright line.
import { collectCitySignals } from "/emigration/ui/emigration-cities.js";
import { __test as Q } from "/emigration/ui/emigration-quarter.js";
import { showDilemma } from "/emigration/ui/emigration-dilemma-view.js";

const TAG = "[EmigTest]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function later(ms) { return new Promise((r) => setTimeout(r, ms)); }
function cityName(c) { return safe(() => Locale.compose(c.name), "?"); }
function rect(el) { if (!el) return null; const r = el.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; }
function readLine(tag, line, frame) {
  const cs = getComputedStyle(line);
  emit(tag + " quoteLine rect=" + J(rect(line)) + " fontStyle=" + cs.fontStyle + " family=" + J(cs.fontFamily) + " size=" + cs.fontSize +
    " color=" + cs.color + " textLen=" + (line.textContent || "").length + " frame=" + J(rect(frame)));
}

async function run() {
  const local = GameContext.localPlayerID;
  const sigs = collectCitySignals();
  const host = sigs.find((s) => s.owner === local && /Bristol/.test(cityName(s.city))) || sigs.find((s) => s.owner === local);
  const foreign = sigs.find((s) => s.owner !== local && !s.isCityState);
  const view = Q.quarterView({ civ: foreign.owner, name: cityName(host.city), where: "by the harbour", owner: local }, 0);
  showDilemma(view, () => {});
  let block = null;
  for (let i = 0; i < 40 && !block; i++) { await later(100); block = document.querySelector(".emig-quote-block"); }
  if (!block) { emit("no quote block appeared; dialogs=" + document.querySelectorAll("screen-dialog-box").length); emit("DONE modtest32 finished"); return; }
  await later(600);
  const frame = block.querySelector("fxs-inner-frame");
  const lines = Array.from(frame.querySelectorAll(".text-accent-3"));
  emit("block children=" + J(Array.from(block.children).map((c) => c.tagName + "." + c.className)) + " frameChildren=" + J(Array.from(frame.children).map((c) => c.tagName + "." + (c.className || "").slice(0, 60))) + " lines=" + lines.length);
  const quoteLine = lines[0];
  if (lines[1]) readLine("ATTRIBUTION", lines[1], frame);
  readLine("ITALIC", quoteLine, frame);
  quoteLine.style.fontStyle = "normal";
  await later(500);
  readLine("NORMAL", quoteLine, frame);
  quoteLine.style.transform = "skewX(-8deg)";
  await later(500);
  readLine("SKEW", quoteLine, frame);
  emit("SHOT quote-skew");
  await later(20000);
  emit("DONE modtest32 finished");
}

emit("modtest32 attached");
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
