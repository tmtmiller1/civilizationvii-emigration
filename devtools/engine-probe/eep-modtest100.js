// eep-modtest100.js - WATCH city.isInfected go true during a plague crisis.
// Run with EXTRA_DATA=eep-crisis-plague.xml, which (probe-only) removes the religion crisis and drops plague
// stage 1 from 70% age progression to 42%. AugustusExp66 sits at 41.3%, so the crisis should trigger within a
// couple of turns instead of forty-odd.
//
// Hypothesis: the engine picks the age crisis at trigger time from what the database offers, so removing
// religion forces plague, and a plague crisis sets city.isInfected true on some cities.
// Disproof, and what to look for in the log: if CRISIS stage never leaves -1, the trigger override did not take;
// if a stage starts but no city is ever infected, the crisis that fired was not the plague (or plague does not
// drive that flag). Either way the run says so rather than leaving it "pending".
const TAG = "[EmigTest]";
const TURNS = 30;
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { const v = fn(); return v === undefined ? fb : v; } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }

let local = -1, n = 0, endTurnTimer = null, blockedTries = 0, fallbacks = 0, done = false;
let everInfected = 0, peakInfected = 0, firstInfectTurn = -1, firstStageTurn = -1;

// The probe database should have left exactly one crisis standing.
function dbReport() {
  emit("DB crises now=" + J(safe(() => Array.from(GameInfo.AgeCrisisEvents || []).map((r) => r.AgeCrisisEventType), "?")));
  emit("DB plague stages=" + J(safe(() => Array.from(GameInfo.AgeCrisisStages || [])
    .map((r) => r.AgeCrisisEventType + "#" + r.Stage + "@" + r.AgeProgressTriggerPercent), "?")));
}

function agePct() {
  const m = safe(() => Game.AgeProgressManager, null);
  const cur = safe(() => m.getCurrentAgeProgressionPoints(), null);
  const max = safe(() => m.getMaxAgeProgressionPoints(), null);
  return (typeof cur === "number" && typeof max === "number" && max > 0) ? (100 * cur / max) : null;
}

function infectedCities() {
  return safe(() => {
    const out = [];
    for (const p of Players.getAlive()) {
      const cities = safe(() => (p.Cities && p.Cities.getCities) ? p.Cities.getCities() : [], []);
      for (const c of cities) if (safe(() => c.isInfected, false) === true) {
        out.push({ p: p.id, city: safe(() => Locale.compose(c.name), safe(() => c.name, "?")), pop: safe(() => c.population, "?") });
      }
    }
    return out;
  }, []);
}

function snapshot(why) {
  const cm = safe(() => Game.CrisisManager, null);
  const stage = safe(() => cm.getCurrentCrisisStage(), "?");
  const pct = agePct();
  const inf = infectedCities();
  if (inf.length > peakInfected) peakInfected = inf.length;
  if (inf.length && firstInfectTurn < 0) { firstInfectTurn = safe(() => Game.turn, -1); everInfected = 1; }
  if (stage !== -1 && stage !== "?" && firstStageTurn < 0) firstStageTurn = safe(() => Game.turn, -1);
  emit(why + " turn=" + J(safe(() => Game.turn)) + " age=" + (pct === null ? "?" : pct.toFixed(1) + "%")
    + " crisisStage=" + J(stage) + " enabled=" + J(safe(() => cm.isCrisisEnabled()))
    + " nStages=" + J(safe(() => cm.getNumCrisisStages()))
    + " elapsed=" + J(safe(() => cm.getCrisisStageTurnsElapsed()))
    + " infected=" + inf.length + (inf.length ? " " + J(inf.slice(0, 6)) : ""));
}

// Answer the mod's own pop-ups the way an unattended player would, so the run never stalls on a dialog.
const ANSWERS = [/Let the city settle them/i, /Welcome them in/i];
let answered = 0;
function answerDialogs() {
  if (done) return;
  safe(() => {
    for (const d of Array.from(document.querySelectorAll("screen-dialog-box"))) {
      const buttons = Array.from(d.querySelectorAll("fxs-button, fxs-hero-button"));
      if (!buttons.length) continue;
      const label = (b) => String(b.getAttribute("caption") || b.textContent || "").trim();
      let pick = null;
      for (const re of ANSWERS) { pick = buttons.find((b) => re.test(label(b))); if (pick) break; }
      if (!pick) pick = buttons[buttons.length - 1];
      pick.dispatchEvent(new CustomEvent("action-activate", { bubbles: true }));
      answered++;
      break;
    }
  });
}
setInterval(answerDialogs, 1500);

// Verbatim from the runs that actually advanced turns (modtest93). An invented
// PlayerOperations.sendRequest(local, "END_TURN") silently does nothing: run 1 of this probe sat at turn 66 for
// nine minutes without a single PlayerTurnActivated before the process went away.
let endAttempts = 0;
function endTurn() {
  if (done) return;
  try {
    const me = Players.get(local);
    if (!me.isTurnActive || GameContext.hasSentTurnComplete()) return;
    const b = String(Game.Notifications.getEndTurnBlockingType(local));
    if (b !== String(EndTurnBlockingTypes.NONE)) {
      blockedTries++;
      if (blockedTries <= 2 || blockedTries % 5 === 0) emit("ENDTURN blocked by " + b + " tries=" + blockedTries);
      if (blockedTries >= 3 && typeof Autoplay !== "undefined") {
        fallbacks++;
        safe(() => { Autoplay.setTurns(1); Autoplay.setReturnAsPlayer(local); Autoplay.setObserveAsPlayer(local); Autoplay.setActive(true); });
        blockedTries = 0; endTurnTimer = setTimeout(endTurn, 30000); return;
      }
      endTurnTimer = setTimeout(endTurn, 4000); return;
    }
    endAttempts++;
    if (endAttempts <= 3) emit("ENDTURN sending turn complete #" + endAttempts);
    safe(() => UI.Player.deselectAllUnits()); GameContext.sendTurnComplete();
  } catch (e) { emit("ENDTURN threw " + e); }
  endTurnTimer = setTimeout(() => { if (safe(() => Players.get(local).isTurnActive, false) && !GameContext.hasSentTurnComplete()) endTurn(); }, 12000);
}

// A stall must announce itself rather than look like a hung game: if no turn has advanced for a while, say so.
let lastTurnAt = Date.now();
setInterval(() => {
  if (done) return;
  const idle = Math.round((Date.now() - lastTurnAt) / 1000);
  if (idle >= 90 && idle % 90 < 3) {
    emit("STALL no turn for " + idle + "s (n=" + n + " attempts=" + endAttempts + " blocked=" + blockedTries
      + " fallbacks=" + fallbacks + " turnActive=" + J(safe(() => Players.get(local).isTurnActive))
      + " sentComplete=" + J(safe(() => GameContext.hasSentTurnComplete())) + ")");
  }
}, 3000);

function finish(why) {
  if (done) return;
  done = true;
  if (endTurnTimer) clearTimeout(endTurnTimer);
  snapshot("FINAL");
  emit("VERDICT isInfected observed true: " + (everInfected ? "YES" : "NO")
    + " | firstInfectedTurn=" + firstInfectTurn + " peakInfectedCities=" + peakInfected
    + " | firstCrisisStageTurn=" + firstStageTurn
    + " | turnsRun=" + n + " reason=" + why);
  emit("DONE modtest100 finished");
}

function run() {
  local = safe(() => GameContext.localPlayerID, -1);
  emit("modtest100 run local=" + local);
  dbReport();
  snapshot("START");
  setTimeout(endTurn, 3000);
}

engine.on("PlayerTurnActivated", (d) => {
  const who = d && (d.player ?? d.Player);
  if (who !== GameContext.localPlayerID || local < 0 || done) return;
  if (endTurnTimer) { clearTimeout(endTurnTimer); endTurnTimer = null; }
  n++; blockedTries = 0; lastTurnAt = Date.now();
  setTimeout(() => {
    snapshot("T n=" + n);
    // Stop early once the flag has been seen true and held for a couple of turns: the point is the observation.
    if (everInfected && firstInfectTurn > 0 && safe(() => Game.turn, 0) >= firstInfectTurn + 2) { finish("infection observed"); return; }
    if (n >= TURNS) { finish("turns"); return; }
    setTimeout(endTurn, 2000);
  }, 5000);
});
engine.on("GameAgeEnded", () => { emit("EVENT GameAgeEnded"); finish("age ended"); });

emit("modtest100 attached");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() {
  const st = loadStateName();
  if (st === "GameStarted") {
    setTimeout(() => { try { run(); } catch (e) { emit("run threw " + e + " " + (e && e.stack)); emit("DONE modtest100 finished"); } }, 10000);
    return;
  }
  beginTries++;
  if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady());
  if (beginTries < 90) setTimeout(beginPoll, 2000); else { emit("LOAD gave up"); emit("DONE modtest100 finished"); }
}
setTimeout(beginPoll, 3000);
