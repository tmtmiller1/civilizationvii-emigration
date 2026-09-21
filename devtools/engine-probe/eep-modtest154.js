// eep-modtest154.js - watch the reworked enclave stance (one-time payout) in the running game.
// Save: AugustusExp66 (Exploration turn 66, a rich empire). Mod pass off (CONFIG.turnInterval), no turn ended.
// 1. VIEW   the decision model for a foreign major's enclave in one of our cities: each stance's effect line, its
//           resolved payout, and whether it is greyed out, against the host's live income and treasury.
// 2. DIALOG raise the real pop-up with the mod's own showDilemma, log its body text and buttons, SHOT it.
// 3. PAY    press the first stance's button through the dialog, wired to the shipped applyQuarterChoice, and
//           read the treasury and tech/civic/influence pools before and 4 s after: did the payout land and the
//           price leave, by the stated amounts?
import { collectCitySignals } from "/emigration/ui/emigration-cities.js";
import { __test as Q } from "/emigration/ui/emigration-quarter.js";
import { showDilemma } from "/emigration/ui/emigration-dilemma-view.js";
import { civType } from "/emigration/ui/emigration-naming.js";
import { quarterAt } from "/emigration/ui/emigration-quarter-state.js";
import { CONFIG } from "/emigration/ui/emigration-config.js";

const TAG = "[EmigTest]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { const v = fn(); return v === undefined ? fb : v; } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function later(ms) { return new Promise((r) => setTimeout(r, ms)); }
function cityName(c) { return safe(() => Locale.compose(c.name), "?"); }
function r2(v) { return typeof v === "number" ? Math.round(v * 100) / 100 : v; }

function nodeProgress(mgr, local) {
  const nt = safe(() => mgr.getResearching(), null);
  const t = typeof nt === "number" ? nt : safe(() => nt.type ?? nt.nodeType, null);
  return safe(() => r2(Game.ProgressionTrees.getNode(local, t).progress), null);
}
function pools(local) {
  const p = Players.get(local);
  return {
    gold: safe(() => r2(p.Treasury.goldBalance), null),
    influence: safe(() => r2(p.DiplomacyTreasury.diplomacyBalance), null),
    tech: nodeProgress(p.Techs, local),
    civic: nodeProgress(p.Culture, local),
    netGold: safe(() => r2(p.Stats.getNetYield(YieldTypes.YIELD_GOLD)), null),
    netCulture: safe(() => r2(p.Stats.getNetYield(YieldTypes.YIELD_CULTURE)), null),
    netScience: safe(() => r2(p.Stats.getNetYield(YieldTypes.YIELD_SCIENCE)), null),
    netInfluence: safe(() => r2(p.Stats.getNetYield(YieldTypes.YIELD_DIPLOMACY)), null)
  };
}

async function run() {
  const local = GameContext.localPlayerID;
  CONFIG.turnInterval = 99999;
  const sigs = collectCitySignals();
  const mine = sigs.filter((s) => s.owner === local && !safe(() => quarterAt(s.city.location.x + "," + s.city.location.y), null));
  const host = mine.sort((a, b) => (b.population || 0) - (a.population || 0))[0];
  const foreignSig = sigs.find((s) => s.owner !== local && !s.isCityState && safe(() => Players.get(s.owner).isMajor, false));
  if (!host || !foreignSig) { emit("no host or foreign major: host=" + !!host + " foreign=" + !!foreignSig); emit("DONE modtest154 finished"); return; }
  const origin = foreignSig.owner;
  const quarter = { civ: origin, owner: local, name: cityName(host.city), share: 0.4, where: "by the harbour" };
  emit("SETUP host=" + quarter.name + " origin=" + origin + " " + civType(origin) + " atWar=" + safe(() => Players.get(local).Diplomacy.isAtWarWith(origin), "?")
    + " pools=" + J(pools(local)));

  // 1. VIEW
  const view = Q.quarterView(quarter, 0, local);
  for (const c of view.choices) {
    emit("CHOICE " + c.id + " label=" + J(c.label) + " disabled=" + J(!!c.disabled) + " payout=" + J(Q.resolveApplied(c, local, origin)));
  }
  for (const d of view.details) emit("DETAIL " + d);

  // 2. DIALOG, wired to the shipped applyQuarterChoice
  const tileKey = host.city.location.x + "," + host.city.location.y;
  let chosen = null;
  showDilemma(view, (id) => {
    chosen = id;
    emit("CHOSEN " + id);
    Q.applyQuarterChoice(id, tileKey, { ...quarter, city: host.city }, local, safe(() => Game.turn, 0));
  });
  let dlg = null;
  for (let i = 0; i < 60 && !dlg; i++) { await later(200); dlg = Array.from(document.querySelectorAll("screen-dialog-box")).find((d) => /Enclave/i.test(d.textContent || "")) || null; }
  if (!dlg) { emit("no enclave dialog appeared; dialogs=" + document.querySelectorAll("screen-dialog-box").length); emit("DONE modtest154 finished"); return; }
  await later(1500);
  emit("DIALOG text=" + J(String(dlg.innerText || dlg.textContent || "").replace(/\s+/g, " ").slice(0, 900)));
  const icons = dlg.querySelectorAll("fxs-font-icon, .fxs-font-icon, [class*=icon]").length;
  const buttons = Array.from(dlg.querySelectorAll("fxs-button"));
  emit("DIALOG icons=" + icons + " buttons=" + J(buttons.map((b) => ({ caption: b.getAttribute("caption"), disabled: b.getAttribute("disabled") }))));
  emit("SHOT enclave-stance-popup");
  await later(12000);

  // 3. PAY: press the first stance's button
  const before = pools(local);
  const first = view.choices[0];
  const btn = buttons.find((b) => String(b.getAttribute("caption") || "").includes(first.label)) || buttons[0];
  emit("PRESS " + J(btn.getAttribute("caption")) + " before=" + J(before));
  btn.dispatchEvent(new CustomEvent("action-activate", { bubbles: true }));
  await later(4000);
  const after = pools(local);
  const rec = safe(() => quarterAt(tileKey), null);
  emit("PAID chosen=" + chosen + " after=" + J(after) + " record.applied=" + J(rec && rec.applied) + " placed=" + J(rec && rec.placed && rec.placed.type));
  const d = (k) => (typeof after[k] === "number" && typeof before[k] === "number" ? r2(after[k] - before[k]) : null);
  emit("DELTA gold=" + d("gold") + " influence=" + d("influence") + " tech=" + d("tech") + " civic=" + d("civic"));
  await later(3000);
  emit("DONE modtest154 finished");
}

emit("modtest154 attached");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() {
  const st = loadStateName();
  if (st === "GameStarted") { setTimeout(() => { run().catch((e) => { emit("run threw " + e + " " + (e && e.stack)); emit("DONE modtest154 finished"); }); }, 12000); return; }
  beginTries++;
  if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady());
  if (beginTries < 90) setTimeout(beginPoll, 2000); else { emit("LOAD gave up"); emit("DONE modtest154 finished"); }
}
setTimeout(beginPoll, 3000);
