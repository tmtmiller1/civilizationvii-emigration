// eep-modtest97.js - which crisis did this game pick, and how far through the age is it?
// modtest96 established: CrisisManager exists, isCrisisEnabled()=true, getCurrentCrisisStage()=-1 (not started),
// the DB carries EXPLORATION_CRISIS_RELIGION and EXPLORATION_CRISIS_PLAGUE, and isInfected reads as a real
// boolean on all 81 cities. Stage 1 triggers at 70% age progression, so this reads the progression and hunts for
// the selected crisis event type in the game configuration.
const TAG = "[EmigTest]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { const v = fn(); return v === undefined ? fb : v; } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }

function keysOf(o) {
  return safe(() => {
    if (!o) return "none";
    const out = [];
    for (const k in o) out.push(k);
    const p = Object.getPrototypeOf(o);
    if (p) for (const k of Object.getOwnPropertyNames(p)) if (k !== "constructor") out.push(k);
    return Array.from(new Set(out));
  }, "?");
}

function ageProgress() {
  const m = safe(() => Game.AgeProgressManager, null);
  const cur = safe(() => m.getCurrentAgeProgressionPoints(), null);
  const max = safe(() => m.getMaxAgeProgressionPoints(), null);
  const pct = (typeof cur === "number" && typeof max === "number" && max > 0) ? (100 * cur / max) : null;
  emit("AGE points=" + J(cur) + "/" + J(max) + " => " + (pct === null ? "?" : pct.toFixed(1) + "%")
    + " turn=" + J(safe(() => Game.turn))
    + " countdownStarted=" + J(safe(() => m.ageCountdownStarted))
    + " isAgeOver=" + J(safe(() => m.isAgeOver)));
  emit("AGE stage-1 trigger is 70%; remaining to trigger = "
    + (pct === null ? "?" : (70 - pct).toFixed(1) + " percentage points"));
  return pct;
}

function whichCrisis() {
  const cm = safe(() => Game.CrisisManager, null);
  emit("CRISIS numStages=" + J(safe(() => cm.getNumCrisisStages()))
    + " stage=" + J(safe(() => cm.getCurrentCrisisStage()))
    + " elapsed=" + J(safe(() => cm.getCrisisStageTurnsElapsed())));
  // Stage-indexed getters: the trigger percent getter may want a stage argument.
  for (const s of [0, 1, 2, 3]) {
    emit("CRISIS triggerPct(" + s + ")=" + J(safe(() => cm.getCrisisStageTriggerPercent(s))));
  }
  // The chosen event type: hunt the configuration surfaces.
  const cfgGame = safe(() => Configuration.getGame(), null);
  emit("CONFIG game keys=" + J(keysOf(cfgGame)));
  for (const k of ["crisis", "Crisis", "ageCrisis", "AgeCrisis", "crisisType", "ageCrisisEventType"]) {
    const v = safe(() => cfgGame ? cfgGame[k] : undefined, undefined);
    if (v !== undefined) emit("CONFIG game." + k + "=" + J(v));
  }
  emit("CONFIG getValue(Crisis)=" + J(safe(() => cfgGame.getValue("Crisis")))
    + " (AgeCrisis)=" + J(safe(() => cfgGame.getValue("AgeCrisis")))
    + " (CrisisType)=" + J(safe(() => cfgGame.getValue("CrisisType"))));
  // Every AgeCrisisEvents row, with whatever the engine kept about it.
  emit("CRISIS event rows=" + J(safe(() => Array.from(GameInfo.AgeCrisisEvents || []).map((r) => ({
    t: r.AgeCrisisEventType, age: r.AgeType, name: r.Name })), "no table")));
  // All stage rows so the plague trigger percents are visible as the engine loaded them.
  emit("CRISIS plague stages=" + J(safe(() => Array.from(GameInfo.AgeCrisisStages || [])
    .filter((r) => /PLAGUE/.test(String(r.AgeCrisisEventType)))
    .map((r) => r.AgeCrisisEventType + "#" + r.Stage + " trigger@" + r.AgeProgressTriggerPercent
      + " end@" + r.AgeProgressEndPercent + " minDur=" + r.MinDuration), "no table")));
}

function run() {
  emit("modtest97 start");
  safe(ageProgress);
  safe(whichCrisis);
  emit("SUMMARY modtest97 done");
  emit("DONE modtest97 finished");
}

emit("modtest97 attached");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() {
  const st = loadStateName();
  if (st === "GameStarted") {
    setTimeout(() => { try { run(); } catch (e) { emit("run threw " + e + " " + (e && e.stack)); emit("DONE modtest97 finished"); } }, 10000);
    return;
  }
  beginTries++;
  if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady());
  if (beginTries < 90) setTimeout(beginPoll, 2000); else { emit("LOAD gave up"); emit("DONE modtest97 finished"); }
}
setTimeout(beginPoll, 3000);
