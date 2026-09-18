// eep-modtest144.js - Steam page retakes from the mod test 142 game (turn 106, after 40 turns at High migration).
// Loads that game's saved turn (copied into the save list as EmigPromo106 by run-promo144.sh); plays no turns.
//
//   SHOT net-flows-origin     Network tab with "Migrant flows" on, coloured by origin
//   SHOT net-flows-movement   the same, coloured by movement
//   SHOT ethnic-<n>           Ethnic Composition lens on each of the most diverse cities the player has explored
//                             (run 142's retake found the most diverse ones unexplored, which draws black map)
//
// (shootPedia is kept for reuse but not called: mod test 143 photographed and verified the Civilopedia pages.)
import LensManager from "/core/ui/lenses/lens-manager.js";
import { diverseCityRanking } from "/emigration/ui/emigration-diversity.js";

const TAG = "[EmigTest]";
const ETHN = "emig-ethnicity-lens";
const LENS_CITIES = 4;
// Run 2: the lenses were already taken in run 1, so only the Network shots (whose clicks failed in run 1) are retaken.
const NET_ONLY = true;
const PEDIA = [["front", "EMIGRATION"], ["refugees", "REFUGEES"], ["voices-ming", "VOICES_MING"]];
// The runner polls the log every 4 s; hold each framing well past a late capture.
const HOLD = 15000;
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { const v = fn(); return v === undefined ? fb : v; } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function later(ms) { return new Promise((r) => setTimeout(r, ms)); }
let local = -1;

// The game's own pop-ups (Tech Unlocked covered run 142's first lens shots): press the last button of any open
// screen that is not one this probe is photographing, a few times over, since they queue.
const KEEP = new Set(["SCREEN-EMIGRATION", "SCREEN-CIVILOPEDIA"]);
async function dismissPopups() {
  for (let i = 0; i < 6; i++) {
    const open = safe(() => Array.from(document.querySelectorAll("*")).filter((e) => /^SCREEN-/.test(e.tagName)
      && !KEEP.has(e.tagName) && e.querySelector("fxs-button, fxs-hero-button")), []);
    if (!open.length) return;
    for (const e of open) {
      emit("POPUP dismissing " + e.tagName.toLowerCase());
      const btns = Array.from(e.querySelectorAll("fxs-button, fxs-hero-button"));
      safe(() => btns[btns.length - 1].dispatchEvent(new CustomEvent("action-activate", { bubbles: true })));
    }
    await later(2500);
  }
}

// ── Network tab with the migrant-flow arrows ─────────────────────────────────────────────────────────────────
// Run 1: HTMLElement.click() did nothing here (the chip toggles its own "active" class before any redraw, and it never
// did), so send a real click event.
function press(el) {
  const how = safe(() => { el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })); return "MouseEvent"; }, null)
    || safe(() => { el.dispatchEvent(new Event("click", { bubbles: true })); return "Event"; }, "failed");
  emit("PRESS " + String(el.textContent).trim() + " via " + how);
}
function chip(re) {
  return safe(() => Array.from(document.querySelectorAll("screen-emigration .emig-netc-chip"))
    .find((c) => re.test(String(c.textContent).trim())), null);
}
async function shootNetwork() {
  await dismissPopups();
  safe(() => globalThis.emigration.window());
  let bar = null;
  for (let i = 0; i < 40 && !bar; i++) { bar = safe(() => document.querySelector("screen-emigration fxs-tab-bar"), null); if (!bar) await later(250); }
  if (!bar) { emit("NET no dashboard tab bar"); return; }
  await later(4000); // Network is the first tab; let its layout settle
  const flows = chip(/migrant flows/i);
  emit("NET flows chip found=" + !!flows + " chips=" + J(safe(() => Array.from(document.querySelectorAll("screen-emigration .emig-netc-chip")).map((c) => String(c.textContent).trim()), [])));
  if (!flows) return;
  if (!flows.classList.contains("active")) press(flows);
  await later(6000);
  emit("NET flows active=" + flows.classList.contains("active"));
  emit("SHOT net-flows-origin"); await later(HOLD);
  const movement = chip(/^movement$/i);
  if (movement) {
    press(movement);
    await later(6000);
    emit("NET movement active=" + movement.classList.contains("active") + " flows still active=" + !!(chip(/migrant flows/i) || {}).classList?.contains("active"));
    emit("SHOT net-flows-movement"); await later(HOLD);
    const origin = chip(/^origin$/i);
    if (origin) press(origin); // leave the player's colour choice as it was
  } else {
    emit("NET no Movement chip");
  }
  const f2 = chip(/migrant flows/i);
  if (f2 && f2.classList.contains("active")) press(f2);
  safe(() => globalThis.emigration.closeWindow());
  await later(3000);
}

// ── Ethnic Composition lens on explored, mixed cities ────────────────────────────────────────────────────────
function cityOf(row) {
  const named = (pid) => safe(() => (Players.get(pid).Cities.getCities() || [])
    .find((c) => Locale.compose(c.name) === row.name), null);
  return named(row.owner) || safe(() => Players.getAlive().map((p) => named(p.id)).find(Boolean), null) || null;
}
const seen = (c) => safe(() => GameplayMap.getRevealedState(local, c.location.x, c.location.y) !== RevealedStates.HIDDEN, false);
async function shootLenses() {
  const rows = safe(() => diverseCityRanking({}, 40), []);
  const picks = [];
  for (const r of rows) {
    if ((r.civs || []).length < 2) continue;
    const c = cityOf(r);
    if (c && seen(c)) picks.push({ r, c });
    if (picks.length >= LENS_CITIES) break;
  }
  emit("LENS picks " + J(picks.map((p) => p.r.name + " idx=" + Math.round(p.r.index * 100) / 100 + " n=" + p.r.civs.length
    + " mix=" + (p.r.civs || []).map((x) => x.civ + ":" + Math.round(x.share * 100) + "%").join(","))));
  safe(() => LensManager.setActiveLens(ETHN));
  for (let i = 0; i < picks.length; i++) {
    await dismissPopups();
    safe(() => Camera.lookAtPlot(picks[i].c.location, { zoom: 0.45 }));
    await later(15000);
    emit("LENS " + (i + 1) + " " + picks[i].r.name + " active=" + safe(() => LensManager.getActiveLens()));
    emit("SHOT ethnic-" + (i + 1)); await later(HOLD);
  }
  safe(() => LensManager.setActiveLens("fxs-default-lens"));
}

// ── Civilopedia ──────────────────────────────────────────────────────────────────────────────────────────────
function pediaReport() {
  const s = safe(() => document.querySelector("screen-civilopedia"), null);
  if (!s) return { open: false };
  const text = String(s.textContent || "").replace(/\s+/g, " ").trim();
  const header = safe(() => (s.querySelector(".civilopedia-page-title, fxs-header, h1, h2") || {}).textContent, "");
  return { open: true, header: String(header || "").trim().slice(0, 80), chars: text.length, sample: text.slice(0, 160),
    rawKeys: (text.match(/LOC_[A-Z0-9_]+/g) || []).slice(0, 5) };
}
async function shootPedia() {
  await dismissPopups();
  for (const [name, term] of PEDIA) {
    safe(() => engine.trigger("open-civilopedia", term));
    await later(6000);
    emit("PEDIA " + name + " (" + term + ") " + J(pediaReport()));
    emit("SHOT pedia-" + name); await later(HOLD);
  }
  safe(() => { const b = document.querySelector("screen-civilopedia fxs-close-button"); b && b.dispatchEvent(new CustomEvent("action-activate", { bubbles: true })); });
  await later(3000);
  emit("PEDIA closed=" + !safe(() => document.querySelector("screen-civilopedia"), null));
}

async function run() {
  local = safe(() => GameContext.localPlayerID, -1);
  emit("modtest144 run local=" + local + " turn=" + safe(() => Game.turn));
  await later(6000);
  try { await shootNetwork(); } catch (e) { emit("NET threw " + e); }
  if (!NET_ONLY) { try { await shootLenses(); } catch (e) { emit("LENS threw " + e); } }
  // The Civilopedia shots were taken by mod test 143 (another session, same morning); not repeated here.
  emit("DONE modtest144 finished");
}

emit("modtest144 attached");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() {
  const st = loadStateName();
  if (st === "GameStarted") {
    setTimeout(() => { run().catch((e) => { emit("run threw " + e + " " + (e && e.stack)); emit("DONE modtest144 finished"); }); }, 10000);
    return;
  }
  beginTries++;
  if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady());
  if (beginTries < 90) setTimeout(beginPoll, 2000); else { emit("LOAD gave up"); emit("DONE modtest144 finished"); }
}
setTimeout(beginPoll, 3000);
