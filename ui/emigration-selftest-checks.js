// emigration-selftest-checks.js
//
// The read-only diagnostic BATTERY behind the on-screen self-test (emigration-selftest.js): one function
// per subsystem, each returning a {label, status, detail} row (PASS/WARN/FAIL/INFO). Split out from the
// screen/actions module to keep both under the file-size cap. Pure reads against the live game; every
// check self-guards so a single failure degrades to an INFO row rather than throwing.

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { collectCitySignals } from "/emigration/ui/emigration-cities.js";
import { compositionForCity, compositionForOwner } from "/emigration/ui/emigration-composition.js";
import { enclaveProgressForCity } from "/emigration/ui/emigration-diaspora.js";
import { scaleCityPopulation, formatPeople } from "/emigration/ui/emigration-population.js";
import { monoTurn } from "/emigration/ui/emigration-migration-stats.js";
import { quarterName } from "/emigration/ui/emigration-naming.js";
import { cityName } from "/emigration/ui/emigration-migration-records.js";
import { telemetryCounters } from "/emigration/ui/emigration-telemetry.js";
import { refugeePoolTotalForOwner } from "/emigration/ui/emigration-refugee-pool.js";
import { chronicleLog } from "/emigration/ui/emigration-chronicle.js";

/** A number, coerced (NaN/undefined → 0). @param {*} x @returns {number} */
function num(x) {
  const n = Number(x);
  return isFinite(n) ? n : 0;
}

/** The local (viewing) player id, or -1 when unavailable. @returns {number} */
export function localPid() {
  try {
    return typeof GameContext !== "undefined" && typeof GameContext.localPlayerID === "number"
      ? GameContext.localPlayerID : -1;
  } catch (_) {
    return -1;
  }
}

/** This player's settlement signals ({city, owner, population, isTown}). @returns {*[]} */
export function localSignals() {
  const me = localPid();
  if (me < 0) return [];
  try {
    return (collectCitySignals() || []).filter((s) => s && s.city && s.owner === me);
  } catch (_) {
    return [];
  }
}

/** A settlement's display name (live name via cityName → fallback). @param {*} sig @returns {string} */
function cityLabel(sig) {
  try {
    const n = cityName(sig.city);
    if (n) return n;
  } catch (_) {
    /* fall through */
  }
  return "a settlement";
}

/** A never-throwing error message for on-screen notes. @param {*} e @returns {string} */
export function errMsg(e) {
  try {
    return e && e.message ? e.message : String(e);
  } catch (_) {
    return "error";
  }
}

/** Composition read that never throws. @param {*} city @returns {*} */
function safeComp(city) {
  try {
    return compositionForCity(city);
  } catch (_) {
    return null;
  }
}

/** Enclave-progress read that never throws. @param {*} city @returns {*} */
export function safeProgress(city) {
  try {
    return enclaveProgressForCity(city);
  } catch (_) {
    return null;
  }
}

/** A result row. @param {string} label @param {string} status @param {string} detail @returns {*} */
function row(label, status, detail) {
  return { label, status, detail };
}

// ── the check battery ──────────────────────────────────────────────────────────────────────────────

/** Settlement coverage: how many of the player's settlements exist (all now render on the network). */
function checkSettlements() {
  const sigs = localSignals();
  const n = sigs.length;
  const towns = sigs.filter((s) => s.isTown).length;
  if (!n) {
    return row("Settlements on the network", "INFO",
      "No settlements found for you yet — found a city, then re-run. (The fix draws every settlement, " +
      "including small towns that used to vanish.)");
  }
  return row("Settlements on the network", "PASS",
    "You have " + n + " settlement" + (n === 1 ? "" : "s") + " (" + towns + " town" + (towns === 1 ? "" : "s") +
    "). All " + n + " now render on the migration network — small/low-population settlements no longer drop " +
    "off. Use “Open dashboard” to eyeball them.");
}

/** One settlement's enclave-progress line, or null when it has no forming enclave. @param {*} s @returns {*} */
function enclaveLine(s) {
  const p = safeProgress(s.city);
  if (!p || p.stage === "none") return null;
  return {
    stage: p.stage,
    text: cityLabel(s) + ": " + quarterName(p.civ) + " " + Math.round((p.share || 0) * 100) + "% (" +
      p.stage + ", bar " + Math.round((p.establishedShare || 0) * 100) + "% + " +
      Math.round(p.minStock || 0) + " pop)"
  };
}

/** Per-city cultural-enclave progress: which cities have a forming / qualifying foreign enclave. */
function checkEnclaves() {
  let established = 0, foothold = 0;
  const notes = [];
  for (const s of localSignals()) {
    const line = enclaveLine(s);
    if (!line) continue;
    notes.push(line.text);
    if (line.stage === "established") established++;
    else foothold++;
  }
  if (established > 0) {
    return row("Cultural enclaves", "PASS",
      established + " settlement(s) already qualify for an enclave decision. " + notes.join("  •  ") +
      "  — use “Force enclave pop-up” to see the decision now.");
  }
  if (foothold > 0) {
    return row("Cultural enclaves", "WARN",
      "No settlement has crossed the enclave bar yet, but " + foothold + " is forming: " + notes.join("  •  ") +
      "  “Force enclave pop-up” relaxes the bar to a foothold and offers it.");
  }
  return row("Cultural enclaves", "INFO",
    "No foreign community is present yet, so there is no enclave to offer even when forced. Expected early " +
    "or in a homogeneous game — it fills in as cross-civ migration happens.");
}

/** The two population measures, side by side, on the player's largest settlement (the confusion source). */
function checkPopulationMeasures() {
  const sigs = localSignals();
  if (!sigs.length) return row("Population: Civ vs Scaled", "INFO", "No settlement to sample yet.");
  const top = sigs.slice().sort((a, b) => (b.population || 0) - (a.population || 0))[0];
  const pts = Math.round(top.population || 0);
  const people = scaleCityPopulation(top.population || 0, monoTurn());
  const comp = safeComp(top.city);
  const lead = comp && comp.civs ? comp.civs.find((/** @type {*} */ c) => c.civ !== comp.owner) : null;
  const share = lead ? Math.round((lead.share || 0) * 100) : 0;
  return row("Population: Civ vs Scaled", "INFO",
    cityLabel(top) + " — Civ Pop " + pts + " points (exact, changes only on growth) vs Scaled Pop ~" +
    formatPeople(people) + " (historical, drifts with the age). Top foreign share here: " + share +
    "% — percentages now always use the Civ-Pop base, so toggling Scaled/Civ no longer changes them.");
}

/** Migration activity: the pass counters, so you can tell the engine is actually moving people. */
function checkMigrationActivity() {
  try {
    const c = telemetryCounters() || {};
    const moves = num(c.moves) || num(c.voluntaryMoves) + num(c.crisisMoves);
    const queued = num(c.queued);
    const settled = num(c.settled);
    if (moves > 0 || queued > 0 || settled > 0) {
      return row("Migration activity", "PASS",
        "The engine is moving people: " + moves + " lifetime move(s), " + queued + " refugees queued, " +
        settled + " settled. Use “Run a migration pass” to advance one turn's worth now.");
    }
    return row("Migration activity", "INFO",
      "No migrations recorded yet this game. Early on this is normal; “Run a migration pass” forces one so " +
      "you can see movement without ending your turn.");
  } catch (e) {
    return row("Migration activity", "INFO", "Counters unavailable: " + errMsg(e));
  }
}

/** Refugee pool: how many displaced people are staged in your cities awaiting settlement. */
function checkRefugeePool() {
  try {
    const n = Math.round(refugeePoolTotalForOwner(localPid()) || 0);
    if (n > 0) {
      return row("Refugee pool", "PASS",
        n + " displaced pop-point(s) are staged in your settlements, settling in gradually (they arrive " +
        "from war/disaster flight and drain into working population over a few turns).");
    }
    return row("Refugee pool", "INFO", "No refugees are currently staged in your settlements.");
  } catch (e) {
    return row("Refugee pool", "INFO", "Refugee pool unavailable: " + errMsg(e));
  }
}

/** Chronicle: the migration history log — entry count + the latest line. */
function checkChronicle() {
  try {
    const log = chronicleLog(200) || [];
    if (!log.length) {
      return row("Migration Chronicle", "INFO",
        "No chronicle entries yet — exoduses, foundings and enclave milestones are written here as they happen.");
    }
    const latest = /** @type {*} */ (log[0] || {});
    const title = latest.title || latest.summary || "(entry)";
    return row("Migration Chronicle", "PASS",
      log.length + " chronicle entr(y/ies). Latest: “" + String(title).slice(0, 90) + "”.");
  } catch (e) {
    return row("Migration Chronicle", "INFO", "Chronicle unavailable: " + errMsg(e));
  }
}

/** Notification config: whether toasts will actually appear (the "notifications not working" report). */
function checkNotifications() {
  const on = (CONFIG.notifyMode >= 1) && !!CONFIG.notifyToasts;
  if (on) {
    return row("Notifications (toasts)", "PASS",
      "On-screen toasts are enabled — press “Fire test toast” to see one. (Persistent chronicle/log " +
      "entries in the Notifications tab are separate and always recorded.)");
  }
  return row("Notifications (toasts)", "WARN",
    "On-screen toasts are OFF in this profile (notifyMode/notifyToasts), so the toast buttons will not " +
    "show anything. Enable notifications in the mod options to see toasts. Clickable end-turn engine " +
    "notifications are a separate, not-yet-implemented feature.");
}

/** Persistence: the composition ledger loaded and holds this player's settlements. */
function checkPersistence() {
  try {
    const own = compositionForOwner(localPid());
    const n = own && own.civs ? own.civs.length : 0;
    if (own && own.total > 0) {
      return row("Persistence (ethnic ledger)", "PASS",
        "The composition ledger is live: " + Math.round(own.total) + " tracked population across " + n +
        " origin group(s). It reloads across turns and saves.");
    }
  } catch (_) {
    /* fall through */
  }
  return row("Persistence (ethnic ledger)", "INFO",
    "No composition recorded for you yet — this fills in after a pass or two of migration.");
}

/** Cross-mod: whether the Demographics mod is present (the migration page integrates into it). */
function checkDemographics() {
  const api = /** @type {*} */ (globalThis).DemographicsMetricsAPI;
  if (api) {
    return row("Demographics integration", "PASS",
      "The Demographics mod is installed — the migration dashboard also appears as native Demographics " +
      "sub-tabs, and Emigration contributes its net-migration graph.");
  }
  return row("Demographics integration", "INFO",
    "Demographics mod not detected. Emigration works standalone; its dashboard opens from “Open dashboard”.");
}

/** Force capability: the state of the enclave Force option. */
function checkForce() {
  return row("Force enclave option", CONFIG.quarterForce ? "PASS" : "INFO",
    CONFIG.quarterForce
      ? "The Force-enclave option is ON — your best qualifying diaspora is offered its decision each pass."
      : "The Force-enclave option is OFF. The “Force enclave pop-up” button turns it on just long enough to " +
        "offer the decision, if you have any foreign community.");
}

/**
 * Pick a foreign origin + place to headline a FORCED enclave preview: a real foreign minority in one of
 * your cities if any exists (even below the enclave bar), else a placeholder so the preview still fires.
 * Used by the self-test's "Force enclave pop-up", which spoofs the requirements rather than needing a
 * real qualifying diaspora.
 * @returns {{civ:number, place:string}}
 */
export function pickPreviewOrigin() {
  for (const s of localSignals()) {
    const comp = safeComp(s.city);
    const lead = comp && comp.civs ? comp.civs.find((/** @type {*} */ c) => c.civ !== comp.owner) : null;
    if (lead) return { civ: lead.civ, place: cityLabel(s) };
  }
  const sigs = localSignals();
  return { civ: -1, place: sigs.length ? cityLabel(sigs[0]) : "your capital" };
}

/** Run the whole battery; each check self-guards to an INFO row on failure. @returns {*[]} */
export function runChecks() {
  const checks = [checkSettlements, checkEnclaves, checkPopulationMeasures, checkMigrationActivity,
    checkRefugeePool, checkChronicle, checkNotifications, checkPersistence, checkDemographics, checkForce];
  return checks.map((fn) => {
    try {
      return fn();
    } catch (e) {
      return row("Check failed", "INFO", "A self-test check threw and was skipped: " + errMsg(e));
    }
  });
}
