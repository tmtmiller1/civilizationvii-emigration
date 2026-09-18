// eep-scenario.js - CANDIDATE GAMEPLAY-CONTEXT SCRIPT (multiplayer plan 8.9h, probe 1).
//
// Loaded (or not) by the probe modinfo's <ScenarioScripts> action. Everything here answers one question:
// does a mod-supplied script run in the simulation's own context, and can the UI reach it with the
// EXECUTE_SCRIPT player operation? If it never loads, Carrier 1 of docs/player-experience-risks.md 8.9d
// is dead for mods and the write layer has to live on the element operations.
//
// It must be defensive: the context's globals are unknown. Nothing here may throw at load.

const TAG = "[EmigScen]";

/** Log to every sink this context might have. console.error reaches UI.log from the UI context; the
 * gameplay context may log elsewhere, so both are tried and the config value below is the real receipt. */
function emit(m) {
  try { console.error(TAG + " " + m); } catch (_) { /* no console.error */ }
  try { console.log(TAG + " " + m); } catch (_) { /* no console.log */ }
}

/** Record a receipt the UI probe can read across contexts, since the two may share no globals. */
function receipt(key, value) {
  try {
    const e = typeof Configuration !== "undefined" && Configuration.editGame ? Configuration.editGame() : null;
    if (e && typeof e.setValue === "function") {
      e.setValue(key, typeof value === "string" ? value : JSON.stringify(value));
      return true;
    }
  } catch (err) {
    emit("receipt " + key + " threw " + err);
  }
  return false;
}

/** What this context offers: the answer decides whether the write layer could live here. */
function surfaces() {
  const names = [
    "Game", "GameplayMap", "Players", "Cities", "Districts", "Constructibles", "MapCities",
    "MapConstructibles", "TerrainBuilder", "ResourceBuilder", "Configuration", "GameInfo", "engine",
    "console", "GameContext", "Locale", "UI", "Network"
  ];
  const have = [];
  for (const n of names) {
    try { if (typeof globalThis[n] !== "undefined") have.push(n); } catch (_) { /* ignore */ }
  }
  return have;
}

/** The mutators the yield and counter carriers would need, checked by type only (nothing is called). */
function mutators() {
  const out = {};
  try { out.grantYield = typeof Players?.grantYield; } catch (_) { out.grantYield = "throw"; }
  try {
    const p = typeof Players !== "undefined" ? Players.get?.(0) : null;
    const c = p?.Cities?.getCities?.()?.[0];
    out.city = !!c;
    out.addRuralPopulation = typeof c?.addRuralPopulation;
    out.growthClaimPlot = typeof c?.Growth?.claimPlot;
    out.districtsRemove = typeof c?.Districts?.removeDistrict;
  } catch (e) {
    out.cityRead = "threw " + e;
  }
  return out;
}

/** Every call into this script is recorded here, so the UI probe can see WHICH route reached it. */
const calls = [];

/**
 * The handler EXECUTE_SCRIPT might dispatch to. The operation's argument shape is unknown, so a handler is
 * published under every plausible name and each records the arguments it was given.
 * @param {...*} args Whatever the engine passes.
 * @returns {number} 1, in case a return value is expected.
 */
function eepHandler(...args) {
  let shape = "unreadable";
  try { shape = JSON.stringify(args).slice(0, 400); } catch (_) { /* circular */ }
  calls.push(shape);
  emit("HANDLER CALLED args=" + shape);
  receipt("EepScenCalls", calls);
  return 1;
}

const HANDLER_NAMES = [
  "EepHandler", "eepHandler", "OnExecuteScript", "ExecuteScript", "OnScriptExecute", "Execute",
  "OnStart", "Main", "main", "EepScenarioMain"
];

// ---------------------------------------------------------------------------------------------------
// Load-time work. Order matters: the receipt is written before anything that could throw is attempted.
// ---------------------------------------------------------------------------------------------------

emit("LOADED");
const info = { surfaces: surfaces(), mutators: mutators(), when: Date.now() };
const wrote = receipt("EepScenLoaded", info);
emit("surfaces=" + JSON.stringify(info.surfaces));
emit("mutators=" + JSON.stringify(info.mutators));
emit("receipt written=" + wrote);

for (const n of HANDLER_NAMES) {
  try { globalThis[n] = eepHandler; } catch (_) { /* frozen global */ }
}
try { globalThis.EepScenarioLoaded = true; } catch (_) { /* ignore */ }

// If this context has the event bus, listen for anything EXECUTE_SCRIPT might raise.
const EVENT_NAMES = [
  "PlayerOperationExecuteScript", "ExecuteScript", "ScriptEvent", "ScriptCallback", "UserDefinedEvent",
  "PlayerOperationStarted", "SendScriptEventToApp", "GameplayEvent"
];
try {
  if (typeof engine !== "undefined" && typeof engine.on === "function") {
    for (const name of EVENT_NAMES) {
      try {
        engine.on(name, (/** @type {*} */ d) => {
          let shape = "unreadable";
          try { shape = JSON.stringify(d).slice(0, 300); } catch (_) { /* circular */ }
          calls.push(name + ":" + shape);
          emit("EVENT " + name + " " + shape);
          receipt("EepScenCalls", calls);
        });
      } catch (_) { /* unknown event name */ }
    }
    emit("listeners registered");
  } else {
    emit("no engine.on in this context");
  }
} catch (e) {
  emit("listener setup threw " + e);
}
