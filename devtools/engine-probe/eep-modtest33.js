// eep-modtest33.js - refugee and newcomer quotes, and the glyphs the audit could not settle from font files.
// AugustusAnt49, no turn ending. (1) Newcomers pop-up raised through arriveRural with a known foreign origin and
// kind "migrant": log the quote block's text, SHOT. (2) The real refugee decision: log its quote, SHOT. (3) A test
// dialog whose quote uses the okina (U+02BB), schwa (U+01DD), u-dot-below (U+1EE5), and a Thai letter that the
// fallback should have dropped: SHOT, so the screenshot shows which render and which draw boxes.
import { CONFIG } from "/emigration/ui/emigration-config.js";
import { collectCitySignals } from "/emigration/ui/emigration-cities.js";
import { arriveRural } from "/emigration/ui/emigration-arrival-placement.js";
import { fireRealDilemmaForTest } from "/emigration/ui/emigration-dilemma.js";
import { showDilemma } from "/emigration/ui/emigration-dilemma-view.js";
import { QUARTER_QUOTES, quoteRowText, renderableLine } from "/emigration/ui/emigration-quarter-bonuses.js";
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

  arriveRural(home.city, { civ: foreign.owner, kind: "migrant" });
  if (await capture("ARRIVAL")) await dismissAny();

  safe(() => fireRealDilemmaForTest());
  if (await capture("REFUGEE")) await dismissAny();

  const hawaii = renderableLine(quoteRowText(QUARTER_QUOTES.CIVILIZATION_HAWAII.a));
  const glyphs = "\"Liliʻuokalani · Fǝśśǝḥā · Ngụ · Thai ก\" — glyph check";
  showDilemma({ eyebrow: "Glyph check", eyebrowIcon: "YIELD_POPULATION", title: "Glyph check", body: "Okina, schwa, u-dot-below, Thai.",
    quote: hawaii, dismissId: "ok", choices: [{ id: "ok", label: "OK", note: "" }] }, () => {});
  emit("GLYPH quote=" + J(hawaii) + " sample=" + J(glyphs));
  if (await capture("GLYPHS-HAWAII")) await dismissAny();
  showDilemma({ eyebrow: "Glyph check", eyebrowIcon: "YIELD_POPULATION", title: "Glyph check 2", body: "Raw sample line.",
    quote: glyphs, dismissId: "ok", choices: [{ id: "ok", label: "OK", note: "" }] }, () => {});
  if (await capture("GLYPHS-RAW")) await dismissAny();
  emit("DONE modtest33 finished");
}

emit("modtest33 attached");
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
