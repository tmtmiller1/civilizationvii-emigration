// eep-modtest111.js - What combat evidence does the engine actually hand us, and does it reach into fog?
//
// The violence model is entirely POLLED (district damage, pillage, besieged flag) and listens to no combat
// events at all. The engine emits a whole stream the mod ignores: Combat, UnitKilledInCombat,
// UnitDamageChanged, DistrictDamageChanged. If those payloads name attacker, defender, location and losses,
// they are far better evidence of "who did what to whom" than anything polling can reconstruct after the fact.
//
// Nothing in the base UI documents those payloads beyond `data.attacker` on Combat, so this run does not
// design anything -- it only records what arrives. Two questions:
//
//   Q4. Payload shapes. Every combat-ish event is logged with its full key set and JSON. Whatever the fields
//       turn out to be is what a future event-driven violence signal can actually use.
//   Q5. Fog. attackersNear() has been asserted three times to be fog-limited and never tested. It is run here
//       against EVERY met civilization's cities, not just ours, alongside the revealed state of the city plot.
//       Hostile units reported at a city on a plot we do not currently see would disprove the assumption and
//       widen where unit-reading can be trusted.
//
// Read the EVENT lines for Q4 and the FOREIGN / FOGCHECK lines for Q5.
import { attackersNear } from "/emigration/ui/emigration-violence-signals.js";

const TAG = "[EmigTest]";
const TURNS = 10;
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { const v = fn(); return v === undefined ? fb : v; } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }

let local = -1, n = 0, endTurnTimer = null, blockedTries = 0, done = false;
/** @type {Object<string, number>} How many of each event arrived, so a silent stream is distinguishable. */
const counts = {};
/** @type {Object<string, boolean>} Only the FIRST payload of each kind is dumped in full; the rest are counted. */
const dumped = {};

/** Record one engine event: full shape the first time, a tally thereafter. */
function watch(name) {
  try {
    engine.on(name, (/** @type {*} */ data) => {
      counts[name] = (counts[name] || 0) + 1;
      if (!dumped[name]) {
        dumped[name] = true;
        emit("EVENT " + name + " keys=" + J(safe(() => Object.keys(data || {}), "ERR")) + " data=" + J(data));
      } else if (counts[name] <= 4) {
        emit("EVENT " + name + " #" + counts[name] + " " + J(data));
      }
    });
    emit("WATCHING " + name);
  } catch (e) {
    emit("WATCH " + name + " FAILED " + e);
  }
}

/** Q5: run the unit scan over every civ's cities and correlate with whether we can even see the plot. */
function reportForeign() {
  let scanned = 0, foreignWithUnits = 0, foggedWithUnits = 0;
  for (const p of safe(() => Players.getAlive(), []) || []) {
    const pid = typeof p === "number" ? p : safe(() => p.id, -1);
    const obj = safe(() => Players.get(pid), null);
    const cities = safe(() => obj?.Cities?.getCities?.(), []) || [];
    for (const c of cities) {
      scanned++;
      const units = safe(() => [...attackersNear(c)], null);
      if (!units || !units.length) continue;
      const loc = safe(() => c.location, null);
      // RevealedStates: HIDDEN means we have never seen it; REVEALED means seen but not currently visible.
      const rev = loc ? safe(() => GameplayMap.getRevealedState(local, loc.x, loc.y), "ERR") : "no-loc";
      const visible = loc ? safe(() => GameplayMap.getVisibility?.(loc.x, loc.y), "no-api") : "no-loc";
      const mine = pid === local;
      if (!mine) foreignWithUnits++;
      const fogged = String(rev) !== String(safe(() => RevealedStates.VISIBLE, "?"));
      if (!mine && fogged) foggedWithUnits++;
      emit((mine ? "OWN " : "FOREIGN ") + "'" + safe(() => Locale.compose(c.name), "?") + "' owner=" + pid
        + " units=" + J(units) + " revealed=" + rev + " vis=" + J(visible));
    }
  }
  emit("FOGCHECK citiesScanned=" + scanned + " foreignWithUnits=" + foreignWithUnits
    + " foreignFoggedWithUnits=" + foggedWithUnits);
}

function endTurn() {
  if (done) return;
  try {
    const me = Players.get(local);
    if (!me.isTurnActive || GameContext.hasSentTurnComplete()) return;
    const b = String(Game.Notifications.getEndTurnBlockingType(local));
    if (b !== String(EndTurnBlockingTypes.NONE)) {
      blockedTries++;
      if (blockedTries >= 3 && typeof Autoplay !== "undefined") {
        safe(() => { Autoplay.setTurns(1); Autoplay.setReturnAsPlayer(local); Autoplay.setObserveAsPlayer(local); Autoplay.setActive(true); });
        blockedTries = 0; endTurnTimer = setTimeout(endTurn, 30000); return;
      }
      endTurnTimer = setTimeout(endTurn, 4000); return;
    }
    safe(() => UI.Player.deselectAllUnits()); GameContext.sendTurnComplete();
  } catch (e) { emit("ENDTURN threw " + e); }
  endTurnTimer = setTimeout(() => { if (safe(() => Players.get(local).isTurnActive, false) && !GameContext.hasSentTurnComplete()) endTurn(); }, 12000);
}

function finish() {
  if (done) return;
  done = true;
  if (endTurnTimer) clearTimeout(endTurnTimer);
  reportForeign();
  emit("TALLY " + J(counts));
  setTimeout(() => emit("DONE modtest111 finished"), 4000);
}

function run() {
  local = safe(() => GameContext.localPlayerID, -1);
  emit("modtest111 run local=" + local);
  for (const ev of ["Combat", "UnitKilledInCombat", "UnitDamageChanged", "DistrictDamageChanged",
    "UnitRemovedFromMap", "UnitOperationStarted", "DistrictControlChanged"]) watch(ev);
  reportForeign();
  setTimeout(endTurn, 3000);
}

engine.on("PlayerTurnActivated", (d) => {
  const who = d && (d.player ?? d.Player);
  if (who !== GameContext.localPlayerID || local < 0 || done) return;
  if (endTurnTimer) { clearTimeout(endTurnTimer); endTurnTimer = null; }
  n++; blockedTries = 0;
  setTimeout(() => {
    emit("T n=" + n + " tally=" + J(counts));
    if (n % 3 === 0) reportForeign();
    if (n >= TURNS) { finish(); return; }
    setTimeout(endTurn, 2000);
  }, 5000);
});

emit("modtest111 attached");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() {
  const st = loadStateName();
  if (st === "GameStarted") {
    setTimeout(() => { try { run(); } catch (e) { emit("run threw " + e + " " + (e && e.stack)); emit("DONE modtest111 finished"); } }, 12000);
    return;
  }
  beginTries++;
  if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady());
  if (beginTries < 90) setTimeout(beginPoll, 2000); else { emit("LOAD gave up"); emit("DONE modtest111 finished"); }
}
setTimeout(beginPoll, 3000);
