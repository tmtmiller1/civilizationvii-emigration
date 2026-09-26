// eep-modtest157.js - Steam page retakes after the one-time stance rework: shot 08 (the enclave decision pop-up, the
// stance figures now on its buttons) and shot 09 (a recognized enclave on the map with its hover tooltip).
// Save: the Steam set's own game (mod test 142's turn-106 save, staged by run-promo144.sh). No turns are ended.
//
//   SHOT stance    camera on the host city, the real decision pop-up (shipped quarterView + showDilemma)
//   SHOT tooltip   after pressing the first stance (shipped applyQuarterChoice), camera on the placed enclave tile
//                  with the enclave tooltip pinned beside it (the hover recipe from mod test 145)
//
// Scene choice, logged: the host is the local player's most populous city with no enclave; the origin is a foreign
// major NOT at war with us (a full payout), preferring one whose first stance pays Culture or Science. If the
// treasury cannot pay that stance, the probe grants the difference first so both paid buttons read as open.
import { collectCitySignals } from "/emigration/ui/emigration-cities.js";
import { __test as Q } from "/emigration/ui/emigration-quarter.js";
import { showDilemma } from "/emigration/ui/emigration-dilemma-view.js";
import { civType } from "/emigration/ui/emigration-naming.js";
import { quarterAt } from "/emigration/ui/emigration-quarter-state.js";
import { quarterOptionsFor } from "/emigration/ui/emigration-quarter-registry.js";
import { CONFIG } from "/emigration/ui/emigration-config.js";
import PlotCursor from "/core/ui/input/plot-cursor.js";

const TAG = "[EmigTest]";
const CURSOR_OFFSET = 36; // emigration-lens-hover-panel.js
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { const v = fn(); return v === undefined ? fb : v; } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function later(ms) { return new Promise((r) => setTimeout(r, ms)); }
function cityName(c) { return safe(() => Locale.compose(c.name), "?"); }

async function dismissPopups() {
  for (let i = 0; i < 6; i++) {
    const open = safe(() => Array.from(document.querySelectorAll("*")).filter((e) => /^SCREEN-/.test(e.tagName)
      && e.querySelector("fxs-button, fxs-hero-button")), []);
    if (!open.length) return;
    for (const e of open) {
      emit("POPUP dismissing " + e.tagName.toLowerCase() + " " + J(String(e.textContent || "").replace(/\s+/g, " ").slice(0, 80)));
      const btns = Array.from(e.querySelectorAll("fxs-button, fxs-hero-button"));
      safe(() => btns[btns.length - 1].dispatchEvent(new CustomEvent("action-activate", { bubbles: true })));
    }
    await later(2500);
  }
  safe(() => { for (const b of Array.from(document.querySelectorAll("fxs-close-button"))) b.dispatchEvent(new CustomEvent("action-activate", { bubbles: true })); });
}

function panel() {
  return safe(() => Array.from(document.body.children).find((d) => {
    const cs = getComputedStyle(d);
    return cs.zIndex === "10001" && cs.display !== "none" && cs.position === "fixed";
  }), null);
}
function hover(at) {
  safe(() => { PlotCursor.plotCursorCoords = { x: at.x, y: at.y }; });
  safe(() => window.dispatchEvent(new CustomEvent("plot-cursor-coords-updated", { detail: { value: { x: at.x, y: at.y } } })));
}
function pin(at, ms) {
  const cx = Math.round(window.innerWidth / 2), cy = Math.round(window.innerHeight / 2);
  const until = Date.now() + ms;
  return new Promise((resolve) => {
    // Hover ONCE: every plot-cursor event makes the panel re-place itself at the last real mouse position (the
    // first 157 run drew it in the top-left corner). After that only the position is held.
    hover(at);
    const tick = () => {
      const p = panel();
      if (p) { p.style.left = (cx + CURSOR_OFFSET) + "px"; p.style.top = (cy + CURSOR_OFFSET) + "px"; }
      if (Date.now() < until) setTimeout(tick, 100); else resolve(!!p);
    };
    tick();
  });
}

function pickScene(local) {
  const sigs = collectCitySignals();
  const hosts = sigs.filter((s) => s.owner === local && !s.isTown
    && !safe(() => quarterAt(s.city.location.x + "," + s.city.location.y), null))
    .sort((a, b) => (b.population || 0) - (a.population || 0));
  const atWar = (pid) => safe(() => Players.get(local).Diplomacy.isAtWarWith(pid), true);
  const majors = Array.from(new Set(sigs.filter((s) => s.owner !== local && !s.isCityState
    && safe(() => Players.get(s.owner).isMajor, false)).map((s) => s.owner)));
  const peaceful = majors.filter((pid) => !atWar(pid));
  const pays = (pid) => safe(() => quarterOptionsFor(civType(pid))[0].benefitYield, "");
  const origin = peaceful.find((pid) => /CULTURE|SCIENCE/.test(pays(pid))) ?? peaceful[0] ?? majors[0];
  emit("SCENE hosts=" + J(hosts.slice(0, 4).map((s) => cityName(s.city) + ":" + s.population)) + " majors="
    + J(majors.map((pid) => pid + ":" + civType(pid) + (atWar(pid) ? "(war)" : "") + ":" + pays(pid))) + " origin=" + origin);
  return { host: hosts[0], origin };
}

async function run() {
  const local = GameContext.localPlayerID;
  CONFIG.turnInterval = 99999;
  await later(6000);
  await dismissPopups();
  const { host, origin } = pickScene(local);
  if (!host || origin == null) { emit("no scene"); emit("DONE modtest157 finished"); return; }
  const quarter = { civ: origin, owner: local, name: cityName(host.city), share: 0.4, where: "by the harbor" };
  const first = quarterOptionsFor(civType(origin))[0];
  const price = Q.resolveApplied(first, local, origin).penaltyAmount;
  const gold = safe(() => Players.get(local).Treasury.goldBalance, 0);
  if (price > gold) {
    emit("GRANT " + Math.ceil(price - gold + 200) + " Gold so the priced stance is open (gold " + gold + ", price " + price + ")");
    safe(() => Players.grantYield(local, YieldTypes.YIELD_GOLD, Math.ceil(price - gold + 200)));
    await later(2500);
  }

  // SHOT stance
  safe(() => Camera.lookAtPlot(host.city.location, { zoom: 0.45 }));
  await later(15000);
  await dismissPopups();
  const view = Q.quarterView(quarter, 0, local);
  emit("VIEW title=" + J(view.title) + " buttons=" + J(view.choices.map((c) => c.label + (c.disabled ? " [disabled]" : ""))));
  const tileKey = host.city.location.x + "," + host.city.location.y;
  showDilemma(view, (id) => {
    emit("CHOSEN " + id);
    Q.applyQuarterChoice(id, tileKey, { ...quarter, city: host.city }, local, safe(() => Game.turn, 0));
  });
  let dlg = null;
  for (let i = 0; i < 60 && !dlg; i++) {
    await later(200);
    dlg = Array.from(document.querySelectorAll("screen-dialog-box")).find((d) => (d.textContent || "").includes(view.title.toUpperCase())
      || (d.textContent || "").includes(view.title)) || null;
  }
  if (!dlg) { emit("no stance dialog; dialogs=" + document.querySelectorAll("screen-dialog-box").length); emit("DONE modtest157 finished"); return; }
  await later(2500);
  emit("SHOT stance");
  await later(9000);

  // press the first stance, then SHOT tooltip on the placed tile
  const btn = Array.from(dlg.querySelectorAll("fxs-button")).find((b) => String(b.getAttribute("caption") || "").startsWith(first.label)) || null;
  emit("PRESS " + J(btn && btn.getAttribute("caption")));
  if (btn) btn.dispatchEvent(new CustomEvent("action-activate", { bubbles: true }));
  await later(6000);
  const rec = safe(() => quarterAt(tileKey), null);
  const at = rec && rec.placed ? safe(() => GameplayMap.getLocationFromIndex(rec.placed.plot), null) : null;
  emit("PLACED applied=" + J(rec && rec.applied) + " placed=" + J(rec && rec.placed) + " at=" + J(at));
  if (!at) { emit("no placed tile to frame"); emit("DONE modtest157 finished"); return; }
  await dismissPopups();
  safe(() => Camera.lookAtPlot(at, { zoom: 0.35 }));
  await later(15000);
  hover(at);
  await later(2500);
  const p = panel();
  emit("TIP panel=" + !!p + " text=" + J(p ? String(p.textContent).replace(/\s+/g, " ").trim() : ""));
  const holding = pin(at, 14000);
  await later(4000);
  emit("SHOT tooltip");
  emit("TIP held=" + (await holding));
  emit("DONE modtest157 finished");
}

emit("modtest157 attached");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() {
  const st = loadStateName();
  if (st === "GameStarted") { setTimeout(() => { run().catch((e) => { emit("run threw " + e + " " + (e && e.stack)); emit("DONE modtest157 finished"); }); }, 10000); return; }
  beginTries++;
  if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady());
  if (beginTries < 90) setTimeout(beginPoll, 2000); else { emit("LOAD gave up"); emit("DONE modtest157 finished"); }
}
setTimeout(beginPoll, 3000);
