// eep-modtest158.js - Steam page retakes of the four decision pop-ups on the current build, all on the Steam set's
// own game (mod test 142's turn-106 save, staged by run-promo144.sh), camera on Washington, D.C. No turns are ended.
//
//   SHOT refugee    05: the real refugee decision (fireRealDilemmaForTest), costs on its buttons
//   SHOT newcomer   06: the Refugees placement pop-up for one point of refugees (arrivalPromptView)
//   SHOT callhome   07: the call-home offer for people abroad (callHomeView, FOREIGN scope; a fixture if none)
//   SHOT stance     08: the enclave decision (quarterView), figures on its buttons
//
// Each dialog is dismissed through its last button before the next is shown (the mod's own offers queue in the same
// display queue, mod test 139). Each SHOT line logs the dialog's rect and the viewport so the crop can be centered.
import { collectCitySignals } from "/emigration/ui/emigration-cities.js";
import { fireRealDilemmaForTest } from "/emigration/ui/emigration-dilemma.js";
import { arrivalPromptView } from "/emigration/ui/emigration-arrival-placement.js";
import { displacedQuoteFor } from "/emigration/ui/emigration-displaced-quotes.js";
import { CALL_HOME_CURRENCY, CALL_HOME_SCOPE, callHomeQuote } from "/emigration/ui/emigration-call-home.js";
import { callHomeView } from "/emigration/ui/emigration-call-home-view.js";
import { callHomeBalance } from "/emigration/ui/emigration-call-home-action.js";
import { showDilemma } from "/emigration/ui/emigration-dilemma-view.js";
import { __test as Q } from "/emigration/ui/emigration-quarter.js";
import { quarterOptionsFor } from "/emigration/ui/emigration-quarter-registry.js";
import { civType } from "/emigration/ui/emigration-naming.js";
import { CONFIG } from "/emigration/ui/emigration-config.js";

const TAG = "[EmigTest]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { const v = fn(); return v === undefined ? fb : v; } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function later(ms) { return new Promise((r) => setTimeout(r, ms)); }
function cityName(c) { return safe(() => Locale.compose(c.name), "?"); }

function dialog() { const all = Array.from(document.querySelectorAll("screen-dialog-box")); return all[all.length - 1] || null; }
async function clearDialogs(label) {
  for (let i = 0; i < 5 && dialog(); i++) {
    const d = dialog();
    emit(label + " clearing dialog " + J(safe(() => d.getAttribute("title"))));
    const btns = Array.from(d.querySelectorAll("fxs-button"));
    if (btns.length) safe(() => btns[btns.length - 1].dispatchEvent(new CustomEvent("action-activate", { bubbles: true })));
    await later(2500);
  }
  return !dialog();
}
async function dismissScreens() {
  for (let i = 0; i < 4; i++) {
    const open = safe(() => Array.from(document.querySelectorAll("*")).filter((e) => /^SCREEN-/.test(e.tagName)
      && e.tagName !== "SCREEN-DIALOG-BOX" && e.querySelector("fxs-button, fxs-hero-button")), []);
    if (!open.length) return;
    for (const e of open) {
      emit("POPUP dismissing " + e.tagName.toLowerCase());
      const btns = Array.from(e.querySelectorAll("fxs-button, fxs-hero-button"));
      safe(() => btns[btns.length - 1].dispatchEvent(new CustomEvent("action-activate", { bubbles: true })));
    }
    await later(2500);
  }
}
async function waitFor(pred, ms) {
  for (let i = 0; i < ms / 200; i++) { const d = Array.from(document.querySelectorAll("screen-dialog-box")).find(pred); if (d) return d; await later(200); }
  return null;
}

async function shoot(label, d) {
  await later(2500);
  const frame = d.querySelector(".screen-dialog-box__dialog-wrapper") || d.querySelector("fxs-frame") || d;
  const r = safe(() => frame.getBoundingClientRect(), null);
  emit(label + " title=" + J(safe(() => d.getAttribute("title"))) + " buttons=" + J(Array.from(d.querySelectorAll("fxs-button")).map((b) => b.getAttribute("caption")))
    + " rect=" + J(r && [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]) + " viewport=" + window.innerWidth + "x" + window.innerHeight);
  emit("SHOT " + label);
  await later(9000);
}

async function run() {
  const local = GameContext.localPlayerID;
  CONFIG.turnInterval = 99999;
  await later(6000);
  await dismissScreens();
  const sigs = collectCitySignals();
  const host = sigs.filter((s) => s.owner === local && !s.isTown).sort((a, b) => (b.population || 0) - (a.population || 0))[0];
  const atWar = (pid) => safe(() => Players.get(local).Diplomacy.isAtWarWith(pid), true);
  const majors = Array.from(new Set(sigs.filter((s) => s.owner !== local && !s.isCityState && safe(() => Players.get(s.owner).isMajor, false)).map((s) => s.owner)));
  const origin = majors.find((pid) => !atWar(pid)) ?? majors[0];
  emit("SCENE host=" + cityName(host.city) + " origin=" + origin + " " + civType(origin) + " majors=" + J(majors.map((p) => p + ":" + civType(p))));
  safe(() => Camera.lookAtPlot(host.city.location, { zoom: 0.45 }));
  await later(15000);
  await dismissScreens();
  await clearDialogs("setup");

  // 05 refugee decision (the real one; its choice is applied, which does not matter in a probe game)
  emit("refugee fired=" + fireRealDilemmaForTest());
  let d = await waitFor((x) => /Welcome them in/i.test(x.textContent || ""), 10000);
  if (d) await shoot("refugee", d); else emit("refugee no dialog");
  await clearDialogs("refugee");

  // 06 newcomers: one point of refugees from the origin
  const from = { civ: origin, kind: "refugee", cause: "war" };
  const quote = displacedQuoteFor(origin, "refugee", "arrival|probe158");
  showDilemma(arrivalPromptView(host.city, 1, quote, from), () => {});
  d = await waitFor((x) => /settle/i.test(x.textContent || "") && !/Welcome them in/i.test(x.textContent || ""), 10000);
  if (d) await shoot("newcomer", d); else emit("newcomer no dialog");
  await clearDialogs("newcomer");

  // 07 call home, people abroad
  const real = callHomeQuote(local, CALL_HOME_SCOPE.EXTERNAL, CALL_HOME_CURRENCY.GOLD);
  const rivalCity = safe(() => cityName(Players.get(origin).Cities.getCities()[0]), "Madrid");
  const flows = real.points > 0 ? undefined
    : [{ src: local, dest: origin, srcCity: cityName(host.city), destCity: rivalCity, points: 3, byCause: { war: 300 } }];
  emit("callhome real points=" + real.points + (flows ? " (fixture)" : " (live)"));
  const chv = callHomeView(local, CALL_HOME_SCOPE.EXTERNAL, { flows, afford: (c) => callHomeBalance(local, c) });
  if (chv) {
    showDilemma(chv, () => {});
    d = await waitFor((x) => safe(() => x.getAttribute("title"), "") === chv.title, 10000);
    if (d) await shoot("callhome", d); else emit("callhome no dialog");
  } else emit("callhome no view");
  await clearDialogs("callhome");

  // 08 enclave stance (not pressed)
  const quarter = { civ: origin, owner: local, name: cityName(host.city), share: 0.4, where: "by the harbor" };
  const price = Q.resolveApplied(quarterOptionsFor(civType(origin))[0], local, origin).penaltyAmount;
  const gold = safe(() => Players.get(local).Treasury.goldBalance, 0);
  if (price > gold) { safe(() => Players.grantYield(local, YieldTypes.YIELD_GOLD, Math.ceil(price - gold + 200))); await later(2500); }
  const view = Q.quarterView(quarter, 0, local);
  showDilemma(view, () => {});
  d = await waitFor((x) => (x.textContent || "").includes(view.title) || (x.textContent || "").includes(view.title.toUpperCase()), 10000);
  if (d) await shoot("stance", d); else emit("stance no dialog");
  await clearDialogs("stance");
  emit("DONE modtest158 finished");
}

emit("modtest158 attached");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() {
  const st = loadStateName();
  if (st === "GameStarted") { setTimeout(() => { run().catch((e) => { emit("run threw " + e + " " + (e && e.stack)); emit("DONE modtest158 finished"); }); }, 10000); return; }
  beginTries++;
  if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady());
  if (beginTries < 90) setTimeout(beginPoll, 2000); else { emit("LOAD gave up"); emit("DONE modtest158 finished"); }
}
setTimeout(beginPoll, 3000);
