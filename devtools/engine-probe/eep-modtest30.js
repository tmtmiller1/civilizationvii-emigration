// eep-modtest30.js - AFTER the pop-up fix: how the mod's three decision pop-ups actually render (user: "bootleg": weird spacing,
// visual conflicts, jitter; and the arrivals pop-up was mistaken for the enclave one). AugustusAnt49, no turn
// ending. For each pop-up (arrivals, refugee decision, enclave decision): raise it through shipped code,
// measure the dialog frame / header / body / buttons at 0, 50, 100, 200, 400, 800, 1500 ms (movement = jitter),
// dump the body's markup and line count, SHOT, then dismiss with its dismiss button.

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { collectCitySignals } from "/emigration/ui/emigration-cities.js";
import { arriveRural } from "/emigration/ui/emigration-arrival-placement.js";
import { fireRealDilemmaForTest } from "/emigration/ui/emigration-dilemma.js";
import { __test as Q } from "/emigration/ui/emigration-quarter.js";
import { showDilemma } from "/emigration/ui/emigration-dilemma-view.js";

const TAG = "[EmigTest]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function later(ms) { return new Promise((r) => setTimeout(r, ms)); }
function cityName(c) { return safe(() => Locale.compose(c.name), "?"); }
function rect(el) { if (!el) return null; const r = el.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; }
function dialog() { const all = Array.from(document.querySelectorAll("screen-dialog-box")); return { el: all[all.length - 1] || null, count: all.length }; }
function parts(d) {
  const wrap = d.querySelector(".screen-dialog-box__dialog-wrapper") || d.firstElementChild;
  const header = d.querySelector("fxs-header");
  const body = d.querySelector(".font-body.text-base");
  const buttons = Array.from(d.querySelectorAll("fxs-button-group > *"));
  return { wrap, header, body, buttons };
}
async function measure(label) {
  let d = null;
  for (let i = 0; i < 40 && !d; i++) { d = dialog().el; if (!d) await later(100); }
  if (!d) { emit(label + " no dialog appeared"); return false; }
  const t0 = Date.now(); const frames = [];
  for (const at of [0, 50, 100, 200, 400, 800, 1500]) {
    await later(Math.max(0, t0 + at - Date.now()));
    const p = parts(d);
    const cs = p.wrap ? getComputedStyle(p.wrap) : null;
    frames.push(at + ":" + J({ wrap: rect(p.wrap), op: cs && cs.opacity, tf: cs && cs.transform, hdr: rect(p.header), body: rect(p.body), btns: p.buttons.map(rect) }));
  }
  const p = parts(d);
  const bcs = p.body ? getComputedStyle(p.body) : null;
  const lh = bcs ? parseFloat(bcs.lineHeight) : NaN;
  emit(label + " frames " + frames.join(" | "));
  emit(label + " classes root=" + safe(() => d.className) + " wrap=" + safe(() => p.wrap.className) + " body=" + safe(() => p.body.className) + " dialogs=" + dialog().count);
  emit(label + " body lineHeight=" + lh + " lines~" + (p.body && lh ? Math.round(p.body.getBoundingClientRect().height / lh) : "?") + " font=" + (bcs && bcs.fontSize) + " markup=" + J(safe(() => p.body.innerHTML.slice(0, 900))));
  emit(label + " header=" + J(safe(() => p.header.getAttribute("title"))) + " buttons=" + J(p.buttons.map((b) => (b.getAttribute("caption") || b.textContent || "").trim().slice(0, 60))));
  emit("SHOT popup-" + label);
  await later(20000);
  return true;
}
async function dismiss(re) {
  const d = dialog().el; if (!d) return;
  const b = parts(d).buttons.find((x) => re.test((x.getAttribute("caption") || x.textContent || "").trim()));
  if (b) safe(() => b.dispatchEvent(new CustomEvent("action-activate", { bubbles: true })));
  await later(1500);
  emit("dismissed " + re + " remainingDialogs=" + dialog().count);
}

async function run() {
  CONFIG.arrivalPlacement = 2;
  const local = GameContext.localPlayerID;
  const sigs = collectCitySignals();
  const bristol = sigs.find((s) => s.owner === local && /Bristol/.test(cityName(s.city))) || sigs.find((s) => s.owner === local);
  const foreign = sigs.find((s) => s.owner !== local && !s.isCityState);
  emit("START turn=" + safe(() => Game.turn) + " screen=" + window.innerWidth + "x" + window.innerHeight + " arrivalCity=" + cityName(bristol.city));

  arriveRural(bristol.city);
  if (await measure("ARRIVAL")) await dismiss(/^later$/i);

  safe(() => fireRealDilemmaForTest());
  if (await measure("REFUGEE")) await dismiss(/away|turn them/i);

  const view = safe(() => Q.quarterView({ civ: foreign.owner, name: cityName(bristol.city), where: "by the harbour", owner: local }, 0), null);
  if (view && typeof view === "object") {
    emit("ENCLAVE view title=" + J(view.title) + " eyebrow=" + J(view.eyebrow) + " choices=" + J((view.choices || []).map((c) => c.label)) + " quote=" + J(String(view.quote || "").slice(0, 120)));
    showDilemma(view, () => {});
    if (await measure("ENCLAVE")) await dismiss(/let them be|ignore|not now/i);
  } else emit("ENCLAVE view unavailable " + J(view));
  emit("DONE modtest30 finished");
}

emit("modtest30 attached");
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
