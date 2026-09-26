// eep-modtest130.js - the reworked "call our people home" dialogs, both variants, watched in-game.
// AutoSave_00_0099 (the 2026-09-17 evening game, whose turn-89 screenshot prompted the rework).
//
// What is being checked, with a screenshot of each:
//   S1 INTERNAL   the purchase dialog: "From our own settlements", the pair named (from / back to), a ladder of
//                 sizes per currency with the Gold / Influence icons in the buttons.        SHOT 1-internal
//   S2 EXTERNAL   the gamble dialog: "From foreign cities", the foreign ruler named, the odds and "may bring
//                 nobody" in the prose, one call per currency priced "up to".               SHOT 2-external
// Nothing is bought: each dialog is dismissed through its last button ("Leave them where they are"), so no
// treasury, cooldown or population state changes. When the save has no callable people for a variant, the
// dialog is rendered from a fixture through the same view code, so the LAYOUT is still watched.
//
// The icon question is answered by the dialog module's own log line ("[Emigration.dilemma] caption icons at
// Nms: re-rendered K label(s); first reads: ..."): K=0 with an <img> in the sample means the engine drew the
// icons itself; K>0 means the fallback had to; a literal "[icon:" in the sample at 900ms means neither worked.

import { CALL_HOME_CURRENCY, CALL_HOME_SCOPE, callHomeAgeScale, callHomeCost, callHomeQuote } from "/emigration/ui/emigration-call-home.js";
import { callHomeView } from "/emigration/ui/emigration-call-home-view.js";
import { callHomeBalance, callHomeCooldownLeft } from "/emigration/ui/emigration-call-home-action.js";
import { showDilemma } from "/emigration/ui/emigration-dilemma-view.js";

const TAG = "[EmigTest]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function later(ms) { return new Promise((r) => setTimeout(r, ms)); }

/** Fixture flows for a variant the save cannot supply, named after real settlements when the save has them. */
function fixture(local, scope) {
  const mine = safe(() => (Players.get(local).Cities.getCities() || []).map((c) => Locale.compose(c.name)), []);
  const home = mine[0] || "Rome";
  const other = mine[1] || "Ostia";
  const rival = safe(() => Players.getAliveMajorIds().find((p) => p !== local), 1);
  const rivalCity = safe(() => Locale.compose(Players.get(rival).Cities.getCities()[0].name), "Carthage");
  return scope === CALL_HOME_SCOPE.INTERNAL
    ? [{ src: local, dest: local, srcCity: home, destCity: other, points: 4, byCause: { war: 400 } }]
    : [{ src: local, dest: rival, srcCity: home, destCity: rivalCity, points: 3, byCause: { war: 300 } }];
}

function dialog() { const all = Array.from(document.querySelectorAll("screen-dialog-box")); return all[all.length - 1] || null; }
async function waitDialog(ms) { let d = null; for (let i = 0; i < ms / 100 && !d; i++) { d = dialog(); if (!d) await later(100); } return d; }
async function waitGone(ms) { for (let i = 0; i < ms / 100 && dialog(); i++) await later(100); return !dialog(); }
async function waitTitled(title, ms) {
  for (let i = 0; i < ms / 100; i++) { const d = dialog(); if (d && safe(() => d.getAttribute("title")) === title) return d; await later(100); }
  return null;
}
// The mod's own calm-turn offer fires on load and queues in the same SystemMessage display queue, so any dialog
// already up (run 130 screenshotted it twice) is dismissed through its last button before ours is shown.
async function clearDialogs(label) {
  for (let i = 0; i < 4 && dialog(); i++) {
    const d = dialog();
    emit(label + " clearing a queued dialog titled " + J(safe(() => d.getAttribute("title"))));
    const btns = Array.from(d.querySelectorAll("fxs-button"));
    const last = btns[btns.length - 1];
    if (last) safe(() => last.dispatchEvent(new CustomEvent("action-activate", { bubbles: true })));
    await later(2500);
  }
  return !dialog();
}

// The filigree divider above the quote block: is it in the tree, how big is it, and is it painted?
function divider(d) {
  return safe(() => {
    const block = d.querySelector(".emig-quote-block");
    const div = block && block.querySelector(".filigree-divider-h3");
    if (!div) return { block: !!block, divider: false };
    const r = div.getBoundingClientRect();
    const cs = getComputedStyle(div);
    return { block: true, divider: true, w: Math.round(r.width), h: Math.round(r.height), display: cs.display, opacity: cs.opacity,
      visibility: cs.visibility, bg: String(cs.backgroundImage).slice(0, 80), cls: div.className };
  });
}

function describeButtons(d) {
  return Array.from(d.querySelectorAll("fxs-button")).map((b) => {
    const label = b.querySelector("[data-l10n-id]");
    const html = label ? String(label.innerHTML) : "";
    return {
      caption: safe(() => b.getAttribute("caption")),
      text: label ? String(label.textContent).trim().slice(0, 60) : "",
      img: /<img|fxs-icon|background-image|icon/i.test(html) && !/\[icon:/.test(String(label.textContent)),
      literal: /\[icon:/.test(label ? String(label.textContent) : ""),
      disabled: b.getAttribute("disabled") === "true",
      greyClass: b.classList.contains("disabled")
    };
  });
}

async function show(label, local, scope) {
  const real = callHomeQuote(local, scope, CALL_HOME_CURRENCY.GOLD);
  const flows = real.points > 0 ? undefined : fixture(local, scope);
  emit(label + " real available=" + real.available + " points=" + real.points + " cooldownLeft=" + callHomeCooldownLeft(local, scope)
    + " gold=" + callHomeBalance(local, CALL_HOME_CURRENCY.GOLD) + " influence=" + callHomeBalance(local, CALL_HOME_CURRENCY.INFLUENCE)
    + (flows ? " (FIXTURE " + J(flows) + ")" : " (LIVE flows)"));
  const view = callHomeView(local, scope, { flows, afford: (c) => callHomeBalance(local, c) });
  if (!view) { emit(label + " no view; skipping"); return; }
  emit(label + " view eyebrow=" + J(view.eyebrow) + " title=" + J(view.title) + " details=" + J(view.details)
    + " choices=" + J(view.choices.map((c) => c.id + " | " + c.label)));
  emit(label + " cleared queue=" + (await clearDialogs(label)));
  let chosen = null;
  showDilemma(view, (id) => { chosen = id; });
  const d = await waitTitled(view.title, 8000);
  emit(label + " dialog appeared=" + !!d + " title=" + J(d && safe(() => d.getAttribute("title"))));
  if (!d) return;
  await later(1500);
  emit(label + " buttons(150ms+)=" + J(describeButtons(d)));
  emit(label + " divider(early)=" + J(divider(d)));
  emit("SHOT " + label);
  await later(10000);
  emit(label + " buttons(late)=" + J(describeButtons(d)));
  // A grayed-out size must not be buyable: activate the first disabled button and confirm nothing resolved.
  const greyed = Array.from(d.querySelectorAll("fxs-button")).find((b) => b.getAttribute("disabled") === "true");
  if (greyed) {
    safe(() => greyed.dispatchEvent(new CustomEvent("action-activate", { bubbles: true })));
    await later(1500);
    emit(label + " clicked grayed " + J(safe(() => greyed.getAttribute("caption"))) + ": resolved=" + J(chosen)
      + " dialogStillUp=" + !!dialog() + " (expect resolved=null, still up)");
  } else {
    emit(label + " no grayed button in this dialog");
  }
  emit(label + " body=" + J(safe(() => (d.querySelector(".font-body.text-base") || {}).textContent, "").slice(0, 600)));
  const btns = Array.from(d.querySelectorAll("fxs-button"));
  const leave = btns[btns.length - 1];
  if (leave) safe(() => leave.dispatchEvent(new CustomEvent("action-activate", { bubbles: true })));
  const gone = await waitGone(5000);
  emit(label + " dismissed via last button: gone=" + gone + " chosen=" + J(chosen) + " (expect \"no\": nothing bought)");
  if (!gone) safe(() => { const m = document.querySelector("screen-dialog-box"); m && m.remove(); });
  await later(2000);
}

async function run() {
  const local = GameContext.localPlayerID;
  // The mod's own calm-turn offer is the FIRST dialog of the session: photograph it before clearing, since the
  // first dialog is the one whose filigree divider used to paint blank.
  const first = await waitDialog(8000);
  if (first) {
    await later(1500);
    emit("0-first title=" + J(safe(() => first.getAttribute("title"))) + " divider=" + J(divider(first)));
    emit("SHOT 0-first");
    await later(9000);
  } else {
    emit("0-first no dialog came up on its own");
  }
  emit("S0 turn=" + safe(() => Game.turn) + " local=" + local + " civ=" + safe(() => Locale.compose(Players.get(local).civilizationName))
    + " age=" + safe(() => GameInfo.Ages.lookup(Game.age).AgeType) + " ageScale=" + safe(() => callHomeAgeScale())
    + " exploration=" + safe(() => callHomeAgeScale("AGE_EXPLORATION")) + " modern=" + safe(() => callHomeAgeScale("AGE_MODERN"))
    + " goldFor1=" + safe(() => callHomeCost(1, CALL_HOME_SCOPE.INTERNAL, CALL_HOME_CURRENCY.GOLD)));
  await show("1-internal", local, CALL_HOME_SCOPE.INTERNAL);
  await show("2-external", local, CALL_HOME_SCOPE.EXTERNAL);
  await clearDialogs("end");
  emit("DONE modtest130 finished");
}

emit("modtest130 attached");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() {
  const st = loadStateName();
  if (st === "GameStarted") {
    setTimeout(() => { run().catch((e) => { emit("run threw " + e + " " + (e && e.stack)); emit("DONE modtest130 finished"); }); }, 12000);
    return;
  }
  beginTries++;
  if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady());
  if (beginTries < 90) setTimeout(beginPoll, 2000); else emit("LOAD gave up");
}
setTimeout(beginPoll, 3000);
