// eep-modtest-mp1.js - Multiplayer plan (docs/player-experience-risks.md 8.9h) PROBE 1, single player.
//
// HYPOTHESIS (Carrier 1, plan 8.9d): a mod can register a gameplay-context script with the <ScenarioScripts>
// modinfo action, and the UI can reach it with the EXECUTE_SCRIPT player operation. If so, the yield and
// counter writes can run inside the simulation on every client and multiplayer is possible.
//
// CHEAPEST DISPROOF, in order. Each step alone can kill the carrier:
//   A. Does the script load at all? Read the receipt it writes to GameConfiguration (the contexts may share
//      no globals, so a config value is the only reliable cross-context evidence), and enumerate the
//      Modding initial-script types to see whether the engine registered the file anywhere.
//   B. Does EXECUTE_SCRIPT exist and accept a request? Log canStart and sendRequest for every plausible
//      argument shape (the operation's arguments are undocumented).
//   C. Did anything reach the script? Re-read the call receipt after the requests.
//
// VERDICTS, fixed before the run:
//   LOADS=NO                      -> Carrier 1 is dead for mods; the plan falls back to the element floor.
//   LOADS=YES REACHED=NO          -> the script runs but the UI cannot call it; it is not a write channel
//                                    unless another route is found.
//   LOADS=YES REACHED=YES         -> Carrier 1 is live; the multiplayer plan is built on it.
//
// Also answers plan probe 2 (tile score by viewer) in the same run, because it is a pure read: does
// GameplayMap.getYields(plot, playerId) return different values for different viewers?

const TAG = "[EmigTest]";
let beginTries = 0;

/** @param {string} m Message. */
function emit(m) {
  try { console.error(TAG + " " + m); } catch (_) { /* ignore */ }
}

/** @param {()=>*} fn Body. @param {*} fb Fallback. @returns {*} Result or fallback. */
function safe(fn, fb) {
  try { return fn(); } catch (e) { return fb; }
}

/** @param {string} k Key. @returns {*} The stored value, or null. */
function readConfig(k) {
  return safe(() => Configuration?.getGame?.()?.getValue?.(k) ?? null, null);
}

/** A: did the gameplay-context script load? */
function stepA() {
  emit("A1 receipt EepScenLoaded=" + JSON.stringify(readConfig("EepScenLoaded")));
  emit("A2 cross-context global EepScenarioLoaded=" + safe(() => typeof globalThis.EepScenarioLoaded, "throw"));

  // What the engine thinks the mod registered. If ScenarioScripts registered the file under some script
  // type, it should show up here; the UI's own scripts appear under Default.
  const types = safe(() => Object.keys(InitialScriptType || {}), null);
  emit("A3 InitialScriptType keys=" + JSON.stringify(types));
  for (const t of types || []) {
    const v = safe(() => InitialScriptType[t], null);
    const list = safe(() => Modding.getInitialScripts(v) || [], "threw");
    const mine = Array.isArray(list)
      ? list.filter((s) => String(s && s.url).indexOf("eep-") >= 0).map((s) => s.url)
      : list;
    emit("A4 scripts[" + t + "=" + v + "] count=" + (Array.isArray(list) ? list.length : "?") + " eep=" + JSON.stringify(mine));
  }

  // Does the engine expose the mod's own file list? (Whether the action was understood at all.)
  const mods = safe(() => Modding.getInstalledMods?.() || [], []);
  const probe = (mods || []).filter((m) => String(m && (m.id || m.handle)).indexOf("emig-engine-probe") >= 0);
  emit("A5 probe mod row=" + JSON.stringify(probe).slice(0, 300));
}

/** B: does EXECUTE_SCRIPT accept a request, in any argument shape? */
function stepB() {
  const op = safe(() => PlayerOperationTypes?.EXECUTE_SCRIPT, undefined);
  emit("B1 PlayerOperationTypes.EXECUTE_SCRIPT=" + String(op));
  const pid = safe(() => GameContext.localPlayerID, -1);
  const shapes = [
    ["OnStart", { OnStart: "EepHandler" }],
    ["Function", { Function: "EepHandler" }],
    ["FunctionName", { FunctionName: "EepHandler" }],
    ["ScriptName", { ScriptName: "EepHandler" }],
    ["Script", { Script: "EepHandler" }],
    ["ScriptPath", { ScriptPath: "scripts/eep-scenario.js" }],
    ["File", { File: "eep-scenario.js" }],
    ["Name+Args", { Name: "EepHandler", Args: { probe: 1 } }],
    ["empty", {}]
  ];
  for (const [label, args] of shapes) {
    const can = safe(() => Game.PlayerOperations.canStart(pid, "EXECUTE_SCRIPT", args, false), "threw");
    const canTxt = can && typeof can === "object" ? JSON.stringify(can).slice(0, 160) : String(can);
    const sent = safe(() => Game.PlayerOperations.sendRequest(pid, "EXECUTE_SCRIPT", args), "threw");
    emit("B2 shape=" + label + " canStart=" + canTxt + " sendRequest=" + String(sent));
  }
}

/** C: did any route reach the script? */
function stepC() {
  emit("C1 receipt EepScenCalls=" + JSON.stringify(readConfig("EepScenCalls")));
  emit("C2 receipt EepScenLoaded=" + JSON.stringify(readConfig("EepScenLoaded")));
}

/** Plan probe 2: does the per-plot yield read depend on WHO is asking? */
function stepD() {
  const local = safe(() => GameContext.localPlayerID, -1);
  let compared = 0;
  let differing = 0;
  const examples = [];
  const players = safe(() => Players.getAlive() || [], []);
  for (const p of players) {
    const pid = safe(() => p.id, -1);
    if (pid === local || pid < 0 || !safe(() => p.isMajor, false)) continue;
    const cities = safe(() => p.Cities?.getCities?.() || [], []);
    for (const c of cities.slice(0, 2)) {
      for (const plot of safe(() => c.getPurchasedPlots?.() || [], []).slice(0, 12)) {
        const a = safe(() => JSON.stringify(GameplayMap.getYields(plot, local)), "x");
        const b = safe(() => JSON.stringify(GameplayMap.getYields(plot, pid)), "y");
        compared++;
        if (a !== b) {
          differing++;
          if (examples.length < 4) examples.push({ plot, local: a.slice(0, 80), owner: b.slice(0, 80) });
        }
      }
    }
    if (compared > 60) break;
  }
  emit("D1 tileScoreByViewer compared=" + compared + " differing=" + differing + " examples=" + JSON.stringify(examples));
}

function verdict() {
  const loaded = readConfig("EepScenLoaded") ? "YES" : "NO";
  const reached = readConfig("EepScenCalls") ? "YES" : "NO";
  emit("VERDICT LOADS=" + loaded + " REACHED=" + reached);
}

function run() {
  emit("modtest-mp1 start (probe 1: gameplay-context script + EXECUTE_SCRIPT)");
  stepA();
  stepB();
  setTimeout(() => {
    stepC();
    stepD();
    verdict();
    emit("DONE modtest1 finished");
  }, 8000);
}

/** @returns {string} The loading state's name. */
function loadStateName() {
  return safe(() => {
    const s = UI.getGameLoadingState();
    for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k;
    return String(s);
  }, "?");
}

function beginPoll() {
  const st = loadStateName();
  if (st === "GameStarted") {
    setTimeout(() => {
      try { run(); } catch (e) { emit("run threw " + e + " " + (e && e.stack)); emit("DONE modtest1 finished"); }
    }, 10000);
    return;
  }
  beginTries++;
  if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady());
  if (beginTries < 90) setTimeout(beginPoll, 2000);
  else { emit("LOAD gave up"); emit("DONE modtest1 finished"); }
}

emit("modtest-mp1 attached");
setTimeout(beginPoll, 3000);
