// eep-modtest142.js - Steam page screenshots from a game where migration has really happened.
// AugustusExp66 (Exploration, human-controlled, about 60 turns before the age ends).
//
// The existing shots were taken at default settings, where even the most mixed save holds 8 foreign-born points
// across 5 cities, so the Ethnic Composition lens paints one color and the dashboard tabs are sparse. Nothing is
// seeded here: the probe turns migration up through the player's own options (High preset, free movement between
// civilizations, conflict refugees at 75%), plays TURNS turns hands-free, and photographs what the simulation made.
//
//   SHOT dash-<tab>          the dashboard, one shot per tab in DASH_TABS
//   SHOT lens-ethnic-close   Ethnic Composition lens on the most diverse city, close
//   SHOT lens-ethnic-wide    the same lens, zoomed out over the region
//   SHOT lens-prosperity     Prosperity lens, same close framing
//
// The player's settings are snapshotted before anything changes and written back in finish(), whatever ends
// the run. The runner also backs up LocalStorage.sqlite, in case the game dies before finish() runs.
import LensManager from "/core/ui/lenses/lens-manager.js";
import { PRESETS, GROUPED_SETTINGS } from "/emigration/ui/emigration-tunables.js";
import {
  getTunable, setTunable, getPresetIndex, applyPresetIndex, getGroupedSetting, setGroupedSetting,
  getVisibilityOverride, setVisibilityOverride
} from "/emigration/ui/emigration-settings.js";
import { diverseCityRanking } from "/emigration/ui/emigration-diversity.js";

const TAG = "[EmigTest]";
const TURNS = 40;
// RETAKE: set by sed for a retake from the run-1 autosave: no turns, only the dashboard tabs in RETAKE_TABS, then
// the lenses. Run 1's Net Migration shot caught the next tab; run 2's lens shots were covered by a Tech Unlocked
// pop-up and framed a city the player had never explored (black map).
const RETAKE = false;
const RETAKE_TABS = ["net"];
// The runner polls the log every 4 s and captured one shot 7 s after its SHOT line, after the probe had already
// moved on (run 1). Hold each framing well past that.
const HOLD = 15000;
const ETHN = "emig-ethnicity-lens", PROS = "emig-prosperity-lens";
// Dashboard tabs to photograph, matched against the tab bar's labels.
const DASH_TABS = [["network", /network/i], ["net", /net migration/i], ["causes", /causes/i],
  ["settlements", /settlements|my cities/i], ["diversity", /diversity/i]];
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { const v = fn(); return v === undefined ? fb : v; } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function later(ms) { return new Promise((r) => setTimeout(r, ms)); }

let local = -1, n = 0, endTurnTimer = null, blockedTries = 0, fallbacks = 0, done = false, shooting = false;

// ── settings: snapshot, turn up, restore ────────────────────────────────────────────────────────────────────
const TOUCHED = [...new Set([...Object.keys(PRESETS.high),
  ...Object.values(GROUPED_SETTINGS).flatMap((g) => Object.keys(g.anchors[0].values)), "arrivalPlacement"])];
let saved = null;
function snapshotSettings() {
  saved = {
    preset: getPresetIndex(),
    grouped: Object.fromEntries(Object.keys(GROUPED_SETTINGS).map((g) => [g, getGroupedSetting(g)])),
    tunables: Object.fromEntries(TOUCHED.map((k) => [k, getTunable(k)])),
    visibility: getVisibilityOverride()
  };
  emit("SETTINGS before " + J(saved));
}
function turnUp() {
  applyPresetIndex(3); // High
  setGroupedSetting("crossCivMovement", 100);
  setGroupedSetting("majorWarRefugees", 75);
  setGroupedSetting("minorRaidRefugees", 75);
  setTunable("arrivalPlacement", 1); // place arrivals automatically so no Newcomers pop-up waits on the run
  setVisibilityOverride(2); // show every civilization in the dashboard shots
  emit("SETTINGS run preset=" + getPresetIndex() + " crossCiv=" + getGroupedSetting("crossCivMovement")
    + " maxMoves=" + getTunable("maxMovesPerTurn") + " poachBlock=" + getTunable("poachBlock"));
}
function restoreSettings() {
  if (!saved) return;
  for (const [g, p] of Object.entries(saved.grouped)) setGroupedSetting(g, p);
  for (const [k, v] of Object.entries(saved.tunables)) setTunable(k, v);
  applyPresetIndex(0); // writes nothing; then put the saved index back (a named preset rewrites identical values)
  if (saved.preset) applyPresetIndex(saved.preset);
  setVisibilityOverride(saved.visibility);
  const back = { preset: getPresetIndex(), grouped: Object.fromEntries(Object.keys(saved.grouped).map((g) => [g, getGroupedSetting(g)])),
    tunables: Object.fromEntries(TOUCHED.map((k) => [k, getTunable(k)])), visibility: getVisibilityOverride() };
  emit("SETTINGS restored matches=" + (J(back) === J(saved)) + " " + J(back));
}

// ── progress ────────────────────────────────────────────────────────────────────────────────────────────────
function diversity(limit) { return safe(() => diverseCityRanking({}, limit), []); }
function snapshot(why) {
  const top = diversity(3).map((r) => r.name + " idx=" + Math.round(r.index * 100) / 100 + " origins=" + r.originsAbove5
    + " n=" + (r.civs || []).length);
  emit("SNAP " + why + " turn=" + safe(() => Game.turn) + " crossCiv=" + getGroupedSetting("crossCivMovement") + " top=" + J(top));
}

// ── dialogs: answer them the way an unattended player would ──────────────────────────────────────────────────
const ANSWERS = [/Let the city settle them/i, /Welcome them in/i, /Let them be/i, /Leave them where they are/i];
function answerDialogs() {
  if (done || shooting) return;
  safe(() => {
    for (const d of Array.from(document.querySelectorAll("screen-dialog-box"))) {
      const buttons = Array.from(d.querySelectorAll("fxs-button, fxs-hero-button"));
      if (!buttons.length) continue;
      const label = (b) => String(b.getAttribute("caption") || b.textContent || "").trim();
      let pick = null;
      for (const re of ANSWERS) { pick = buttons.find((b) => re.test(label(b))); if (pick) break; }
      if (!pick) pick = buttons[buttons.length - 1];
      pick.dispatchEvent(new CustomEvent("action-activate", { bubbles: true }));
      break;
    }
  });
}
setInterval(answerDialogs, 1500);
// The game's own pop-ups (Tech Unlocked covered every run-2 lens shot): press the last button of any open screen that
// is not the dashboard, a few times over, since they queue.
async function dismissPopups() {
  for (let i = 0; i < 6; i++) {
    const open = safe(() => Array.from(document.querySelectorAll("[class], *")).filter((e) => /^SCREEN-/.test(e.tagName)
      && e.tagName !== "SCREEN-EMIGRATION" && (e.querySelector("fxs-button, fxs-hero-button"))), []);
    if (!open.length) return;
    for (const e of open) {
      emit("POPUP dismissing " + e.tagName.toLowerCase());
      const btns = Array.from(e.querySelectorAll("fxs-button, fxs-hero-button"));
      safe(() => btns[btns.length - 1].dispatchEvent(new CustomEvent("action-activate", { bubbles: true })));
    }
    await later(2500);
  }
}
function closeScreens() {
  safe(() => { for (const b of Array.from(document.querySelectorAll("fxs-close-button"))) b.dispatchEvent(new CustomEvent("action-activate", { bubbles: true })); });
}

// ── turn loop (verbatim shape from mod test 100) ─────────────────────────────────────────────────────────────
function endTurn() {
  if (done || shooting) return;
  try {
    const me = Players.get(local);
    if (!me.isTurnActive || GameContext.hasSentTurnComplete()) return;
    const b = String(Game.Notifications.getEndTurnBlockingType(local));
    if (b !== String(EndTurnBlockingTypes.NONE)) {
      blockedTries++;
      if (blockedTries >= 3 && typeof Autoplay !== "undefined") {
        fallbacks++;
        safe(() => { Autoplay.setTurns(1); Autoplay.setReturnAsPlayer(local); Autoplay.setObserveAsPlayer(local); Autoplay.setActive(true); });
        blockedTries = 0; endTurnTimer = setTimeout(endTurn, 30000); return;
      }
      endTurnTimer = setTimeout(endTurn, 4000); return;
    }
    safe(() => UI.Player.deselectAllUnits()); GameContext.sendTurnComplete();
  } catch (e) { emit("ENDTURN threw " + e); }
  endTurnTimer = setTimeout(() => { if (safe(() => Players.get(local).isTurnActive, false) && !GameContext.hasSentTurnComplete()) endTurn(); }, 12000);
}
let lastTurnAt = Date.now();
setInterval(() => {
  if (done || shooting) return;
  const idle = Math.round((Date.now() - lastTurnAt) / 1000);
  if (idle >= 90 && idle % 90 < 3) emit("STALL no turn for " + idle + "s (n=" + n + " fallbacks=" + fallbacks + ")");
  if (idle >= 600) { emit("STALL giving up on turns; shooting what there is"); shoot("stalled"); }
}, 3000);

// ── shots ────────────────────────────────────────────────────────────────────────────────────────────────────
function dashTabBar() { return safe(() => document.querySelector("screen-emigration fxs-tab-bar"), null); }
async function shootDashboard() {
  await dismissPopups();
  safe(() => globalThis.emigration.window());
  let bar = null;
  for (let i = 0; i < 40 && !bar; i++) { bar = dashTabBar(); if (!bar) await later(250); }
  if (!bar) { emit("DASH no tab bar; is the window open? " + !!safe(() => document.querySelector("screen-emigration"), null)); return; }
  const items = safe(() => JSON.parse(bar.getAttribute("tab-items")), []);
  emit("DASH tabs=" + J(items.map((t) => t.label)));
  for (const [name, re] of DASH_TABS.filter(([t]) => !RETAKE || RETAKE_TABS.includes(t))) {
    const idx = items.findIndex((t) => re.test(String(t.label)));
    if (idx < 0) { emit("DASH no tab matching " + name); continue; }
    // fxs-tab-bar turns an attribute change into its own tab-selected event, which the dashboard listens for.
    safe(() => bar.setAttribute("selected-tab-index", String(idx)));
    await later(name === "network" ? 9000 : 5000); // the network settles its layout before it is worth a picture
    emit("SHOT dash-" + name);
    await later(HOLD);
  }
  safe(() => globalThis.emigration.closeWindow());
  await later(3000);
}

// Run 1 found no city from the ranking's key (its id half is not the city's ComponentID id), so match the row's
// owner and name, falling back to a name match across every player.
function cityOf(row) {
  const named = (pid) => safe(() => (Players.get(pid).Cities.getCities() || [])
    .find((c) => Locale.compose(c.name) === row.name), null);
  return named(row.owner) || safe(() => Players.getAlive().map((p) => named(p.id)).find(Boolean), null) || null;
}
async function frame(loc, zoom) { safe(() => Camera.lookAtPlot(loc, { zoom })); await later(15000); }
async function shootLenses() {
  const top = diversity(30);
  emit("LENS diversity ranking " + J(top.map((r) => r.name + ":" + Math.round(r.index * 100) / 100 + ":" + r.originsAbove5)));
  // A city the player has never explored draws as black map, whatever the lens: take the most diverse one whose
  // center tile the player has at least seen.
  const seen = (c) => safe(() => GameplayMap.getRevealedState(local, c.location.x, c.location.y) !== RevealedStates.HIDDEN, false);
  const city = top.map(cityOf).filter(Boolean).find(seen);
  if (!city) { emit("LENS no ranked city to frame"); return; }
  emit("LENS framing " + safe(() => Locale.compose(city.name)) + " at " + J(city.location));
  await dismissPopups();
  await frame(city.location, 0.5);
  await dismissPopups();
  safe(() => LensManager.setActiveLens(ETHN)); await later(4000);
  emit("LENS active=" + safe(() => LensManager.getActiveLens()));
  emit("SHOT lens-ethnic-close"); await later(HOLD);
  safe(() => LensManager.setActiveLens(PROS)); await later(4000);
  emit("SHOT lens-prosperity"); await later(HOLD);
  safe(() => LensManager.setActiveLens(ETHN));
  await frame(city.location, 0.9);
  emit("SHOT lens-ethnic-wide"); await later(HOLD);
  safe(() => LensManager.setActiveLens("fxs-default-lens"));
}

async function shoot(why) {
  if (shooting || done) return;
  shooting = true;
  if (endTurnTimer) clearTimeout(endTurnTimer);
  snapshot("BEFORE SHOTS (" + why + ")");
  await later(8000);
  closeScreens(); await later(2000);
  for (const d of Array.from(document.querySelectorAll("screen-dialog-box"))) {
    const btns = Array.from(d.querySelectorAll("fxs-button"));
    if (btns.length) btns[btns.length - 1].dispatchEvent(new CustomEvent("action-activate", { bubbles: true }));
    await later(2000);
  }
  try { await shootDashboard(); } catch (e) { emit("DASH threw " + e); }
  try { await shootLenses(); } catch (e) { emit("LENS threw " + e); }
  finish(why);
}

function finish(why) {
  if (done) return;
  done = true;
  if (endTurnTimer) clearTimeout(endTurnTimer);
  restoreSettings();
  emit("VERDICT turnsRun=" + n + " fallbacks=" + fallbacks + " reason=" + why);
  setTimeout(() => emit("DONE modtest142 finished"), 3000);
}

function run() {
  local = safe(() => GameContext.localPlayerID, -1);
  emit("modtest142 run local=" + local + " turn=" + safe(() => Game.turn));
  snapshot("START");
  if (RETAKE) { shoot("retake"); return; }
  snapshotSettings();
  turnUp();
  setTimeout(endTurn, 3000);
}

engine.on("PlayerTurnActivated", (d) => {
  const who = d && (d.player ?? d.Player);
  if (who !== GameContext.localPlayerID || local < 0 || done || shooting) return;
  if (endTurnTimer) { clearTimeout(endTurnTimer); endTurnTimer = null; }
  n++; blockedTries = 0; lastTurnAt = Date.now();
  setTimeout(() => {
    if (n % 5 === 0) snapshot("T n=" + n);
    if (n >= TURNS) { shoot("turns"); return; }
    setTimeout(endTurn, 2000);
  }, 5000);
});
// The age ending reloads every script (the probe re-attaches with fresh state); shoot before that happens.
engine.on("GameAgeEnded", () => { emit("EVENT GameAgeEnded"); shoot("age ended"); });

emit("modtest142 attached");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() {
  const st = loadStateName();
  if (st === "GameStarted") {
    setTimeout(() => { try { run(); } catch (e) { emit("run threw " + e + " " + (e && e.stack)); finish("run threw"); } }, 10000);
    return;
  }
  beginTries++;
  if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady());
  if (beginTries < 90) setTimeout(beginPoll, 2000); else { emit("LOAD gave up"); emit("DONE modtest142 finished"); }
}
setTimeout(beginPoll, 3000);
