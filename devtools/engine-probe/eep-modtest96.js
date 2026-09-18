// eep-modtest96.js - reconnaissance for the plague probe. Cheap, ends without advancing a turn.
// Which crisis is this save actually running, how far through the age is it, does the engine expose a crisis
// stage, and is any city infected right now? This decides whether the plague can be reached from an existing
// save or whether a new game with the crisis chosen at setup is required.
const TAG = "[EmigTest]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { const v = fn(); return v === undefined ? fb : v; } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }

function crisisReport() {
  const cm = safe(() => Game.CrisisManager, null);
  emit("CRISIS manager present=" + (cm ? "yes" : "NO"));
  if (cm) {
    emit("CRISIS keys=" + J(safe(() => {
      const out = [];
      for (const k in cm) out.push(k);
      const proto = Object.getPrototypeOf(cm);
      if (proto) for (const k of Object.getOwnPropertyNames(proto)) out.push("proto:" + k);
      return out;
    }, "?")));
    emit("CRISIS enabled=" + J(safe(() => cm.isCrisisEnabled()))
      + " stage=" + J(safe(() => cm.getCurrentCrisisStage()))
      + " triggerPct=" + J(safe(() => cm.getCrisisStageTriggerPercent()))
      + " minTurnsLeft=" + J(safe(() => cm.getMinimumTurnsRemainingInCurrentCrisis()))
      + " maxTurnsLeft=" + J(safe(() => cm.getMaximumTurnsRemainingInCurrentCrisis())));
  }
  // Which crisis events exist for this age, and which one this game picked (if readable).
  emit("CRISIS events in DB=" + J(safe(() => Array.from(GameInfo.AgeCrisisEvents || []).map((r) => r.AgeCrisisEventType), "no table")));
  emit("CRISIS stages rows=" + J(safe(() => Array.from(GameInfo.AgeCrisisStages || []).slice(0, 4)
    .map((r) => r.AgeCrisisEventType + "#" + r.Stage + "@" + r.AgeProgressTriggerPercent), "no table")));
  // Age progress: try the documented surfaces.
  emit("AGE turn=" + J(safe(() => Game.turn)) + " age=" + J(safe(() => Game.age))
    + " ageProgress=" + J(safe(() => Game.AgeProgressManager && Game.AgeProgressManager.getCurrentAgeProgressionPercent
      ? Game.AgeProgressManager.getCurrentAgeProgressionPercent() : "no getter"))
    + " isFinalAge=" + J(safe(() => Game.AgeProgressManager && Game.AgeProgressManager.isFinalAge)));
  emit("AGE manager keys=" + J(safe(() => {
    const m = Game.AgeProgressManager; if (!m) return "none";
    const out = []; for (const k in m) out.push(k);
    const p = Object.getPrototypeOf(m); if (p) for (const k of Object.getOwnPropertyNames(p)) out.push("proto:" + k);
    return out;
  }, "?")));
}

function infectionReport() {
  const rows = safe(() => {
    const out = [];
    for (const p of Players.getAlive()) {
      const cities = safe(() => p.Cities && p.Cities.getCities ? p.Cities.getCities() : [], []);
      for (const c of cities) {
        out.push({ p: p.id, city: safe(() => c.name, "?"), infected: safe(() => c.isInfected, "ERR"),
          pop: safe(() => c.population, "?") });
      }
    }
    return out;
  }, []);
  const withFlag = rows.filter((r) => r.infected !== "ERR" && r.infected !== undefined);
  const infected = rows.filter((r) => r.infected === true);
  emit("INFECT cities=" + rows.length + " exposing isInfected=" + withFlag.length + " infectedNow=" + infected.length);
  emit("INFECT sample=" + J(rows.slice(0, 5)));
  if (infected.length) emit("INFECT TRUE " + J(infected.slice(0, 10)));
}

function run() {
  emit("modtest96 start");
  safe(crisisReport);
  safe(infectionReport);
  emit("SUMMARY modtest96 crisis reconnaissance done");
  emit("DONE modtest96 finished");
}

emit("modtest96 attached");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() {
  const st = loadStateName();
  if (st === "GameStarted") {
    setTimeout(() => { try { run(); } catch (e) { emit("run threw " + e + " " + (e && e.stack)); emit("DONE modtest96 finished"); } }, 10000);
    return;
  }
  beginTries++;
  if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady());
  if (beginTries < 90) setTimeout(beginPoll, 2000); else { emit("LOAD gave up"); emit("DONE modtest96 finished"); }
}
setTimeout(beginPoll, 3000);
