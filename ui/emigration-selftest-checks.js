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
import { migrationCause } from "/emigration/ui/emigration-pull.js";
import { contestedBenefitScale } from "/emigration/ui/emigration-quarter.js";
import { quartersForOwner } from "/emigration/ui/emigration-quarter-state.js";
import { immigrationOpenness, borderStance } from "/emigration/ui/emigration-borders.js";
import { departureTileApiAvailable, findDepartureTile } from "/emigration/ui/emigration-departure-tile.js";
import { enclaveIndex, enclaveTypeFor } from "/emigration/ui/emigration-enclave-place.js";
import { placementMode, PLACEMENT } from "/emigration/ui/emigration-arrival-placement.js";
import { pullReasonsPhrase, reasonLabel } from "/emigration/ui/emigration-move-reasons.js";
import { digestAccent } from "/emigration/ui/emigration-causes.js";

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

// ── balance probes (refugee throttle, contested-enclave yield, razing → refugee) ────────────────────

/**
 * A razing settlement flees as a war refugee. Behavioral: runs the live classifier on a synthetic
 * "being razed, no battle damage yet" source and asserts it reads as "war", not an economic cause.
 */
function checkRazingRefugees() {
  try {
    const cause = migrationCause({ siege: true, violence: 0, disaster: 0, happiness: 0 });
    if (cause === "war") {
      return row("Razing → refugee flight", "PASS",
        "A settlement being razed is treated as a war crisis: its people flee abroad as refugees (crisis-escape " +
        "pull, reduced cross-civ friction) even before battle damage crosses the flee threshold — matching how the " +
        "engine sheds them. Synthetic razing source classified as “war”.");
    }
    return row("Razing → refugee flight", "FAIL",
      "A razing settlement classified as “" + cause + "”, not “war”: its refugees would pay full " +
      "cross-civ friction and stay penned inside the collapsing civ. The siege/crisis alignment fix is NOT active here.");
  } catch (e) {
    return row("Razing → refugee flight", "INFO", "Migration classifier unavailable: " + errMsg(e));
  }
}

/**
 * A contested enclave contributes a reduced yield. Behavioral: reads the same scale the grant
 * path uses (contestedBenefitScale) and asserts it drops below 1 while contested; also lists any of the
 * player's enclaves currently contested and the share they now pay.
 */
function checkContestedEnclaveYield() {
  try {
    const scale = contestedBenefitScale({ contested: true });
    const pct = Math.round(scale * 100);
    const contested = quartersForOwner(localPid())
      .filter((e) => e.rec && e.rec.contested)
      .map((e) => quarterName(e.rec.civ));
    if (!(scale < 1)) {
      return row("Contested enclave yield", "WARN",
        "Contested enclaves currently pay their FULL benefit (contestedQuarterYieldFactor = " + scale + "), so war " +
        "with a homeland only adds a happiness strain in this profile. Set the factor below 1 to dim the enclave's output.");
    }
    const base = "While at war with an enclave's homeland it turns “contested” and pays only " + pct +
      "% of its benefit yield (plus a happiness strain).";
    if (contested.length) {
      return row("Contested enclave yield", "PASS",
        base + " You have " + contested.length + " contested now: " + contested.join(", ") + " — each contributing " +
        pct + "% until peace returns.");
    }
    return row("Contested enclave yield", "PASS",
      base + " None of your enclaves are contested right now; declare war on an enclave's homeland and its City " +
      "Details yield line drops to " + pct + "%.");
  } catch (e) {
    return row("Contested enclave yield", "INFO", "Enclave-yield check unavailable: " + errMsg(e));
  }
}

/**
 * Under Anti-Immigration, admitted refugees settle more slowly (the settlement budget is throttled on
 * the SAME openness floor as the border turn-away). Live observation of the local player's stance + staged pool.
 */
function checkClosedBorderThrottle() {
  const floorPct = Math.round((num(CONFIG.opennessFloor) || 0) * 100);
  try {
    if (!CONFIG.bordersEnabled) {
      return row("Anti-Immigration refugee throttle", "INFO",
        "Border policies are off in this profile, so immigration openness has no effect on refugee settlement.");
    }
    const me = localPid();
    const openness = immigrationOpenness(me);
    const pool = Math.round(refugeePoolTotalForOwner(me) || 0);
    if (borderStance(me) === "anti" || openness < 1) {
      return row("Anti-Immigration refugee throttle", "PASS",
        "You hold an Anti-Immigration stance (openness " + Math.round(openness * 100) + "%). Refugees are turned away " +
        "at your border AND the ones you admit settle more slowly — the same openness throttles pool settlement, " +
        "floored at " + floorPct + "% (the shared openness floor, not the old 25% staging floor). " +
        (pool ? pool + " refugee point(s) staged now, draining at the reduced rate." : "No refugees staged right now."));
    }
    return row("Anti-Immigration refugee throttle", "INFO",
      "No Anti-Immigration stance active — refugee settlement runs at full speed. Under Anti-Immigration, admitted " +
      "refugees also settle more slowly (throttle floored at " + floorPct + "%, shared with the border turn-away).");
  } catch (e) {
    return row("Anti-Immigration refugee throttle", "INFO", "Border-throttle check unavailable: " + errMsg(e));
  }
}

// ── departures and arrivals made real ───────────────────────────────────────────────────────────────

/**
 * Departure tile abandonment: is the engine surface (Districts / Constructibles / DESTROY_ELEMENT)
 * present, is the option on, and does your largest settlement have a rural tile to give? Read-only.
 */
function checkDepartureTile() {
  try {
    if (!CONFIG.departureRemovesTile) {
      return row("Departures abandon a tile", "INFO",
        "Off: a departing point only lowers the population count and every tile keeps working. Turn on “Departures: abandon a rural tile” for the real loss.");
    }
    if (!departureTileApiAvailable()) {
      return row("Departures abandon a tile", "WARN",
        "The engine surface this needs (Districts, Constructibles, DESTROY_ELEMENT) is not reachable here, so departures fall back to the population-count decrement.");
    }
    const sigs = localSignals();
    const top = sigs.slice().sort((a, b) => (b.population || 0) - (a.population || 0))[0];
    const tile = top && top.city ? findDepartureTile(top.city) : null;
    if (tile) {
      return row("Departures abandon a tile", "PASS",
        "Ready: a departure from " + cityName(top.city) + " would abandon its outlying " +
        String(tile.type).replace("IMPROVEMENT_", "").toLowerCase() + " (plot " + tile.plot + "), removing that tile's yields with the person (pillaged tiles go first; a starving settlement keeps its food tiles).");
    }
    return row("Departures abandon a tile", "INFO",
      "Ready, but your largest settlement has no rural improvement to abandon yet (all-urban); such departures use the count decrement.");
  } catch (e) {
    return row("Departures abandon a tile", "INFO", "Departure check unavailable: " + errMsg(e));
  }
}

/** Enclave tiles: is the generated improvement data loaded, and is placement on? */
function checkEnclaveTiles() {
  try {
    const sample = enclaveIndex(enclaveTypeFor("CIVILIZATION_ROME", "a") || "");
    if (sample == null) {
      return row("Enclave tiles", "WARN",
        "The enclave improvement data is not loaded in this game (a save started without it, or the data file failed to apply); recognized enclaves pay from the treasury instead.");
    }
    if (!CONFIG.quarterPlaceImprovement) {
      return row("Enclave tiles", "INFO", "Data loaded, but “Enclaves: the enclave becomes a real tile” is off; recognized enclaves pay from the treasury.");
    }
    return row("Enclave tiles", "PASS",
      "Data loaded: recognizing an enclave places its improvement on one of the city's tiles (nearest empty flat or hill plot, else the outlying farmstead), with its benefit in the city's own yields and its symbol on the map.");
  } catch (e) {
    return row("Enclave tiles", "INFO", "Enclave check unavailable: " + errMsg(e));
  }
}

/** Arrival placement: which mode is active and whether the EXPAND command surface is present. */
function checkArrivalPlacement() {
  const mode = placementMode();
  const names = { [PLACEMENT.OFF]: "Off", [PLACEMENT.AUTO]: "Automatic", [PLACEMENT.ASK]: "Ask me", [PLACEMENT.UNIT]: "Migrant unit" };
  const api = typeof Game !== "undefined" && Game && Game.CityCommands && typeof Game.CityCommands.sendRequest === "function";
  if (mode === PLACEMENT.OFF) {
    return row("Arrivals settle in your cities", "INFO",
      "Off: the game's own Grow City prompt asks you to place each point arriving in your cities.");
  }
  if (!api) {
    return row("Arrivals settle in your cities", "WARN",
      "Mode “" + names[mode] + "” is set but the city-command surface is not reachable here; arrivals will wait unplaced.");
  }
  return row("Arrivals settle in your cities", "PASS",
    "Mode “" + names[mode] + "”: " + (mode === PLACEMENT.AUTO
      ? "each point arriving in your cities is placed at once on a rural tile (a real improvement with real yields)."
      : mode === PLACEMENT.ASK
        ? "each arrival raises a pop-up to choose the tile, let the city decide, or wait."
        : "newcomers arrive as a Migrant unit you resettle yourself."));
}

// ── notification clarity + interface localization probes ─────────────────────────────────────────────

/**
 * Clearer migration notifications — behavioral. Confirms (a) the “why there” clause names only
 * destination-PULL reasons and drops flight fragments like “escaping the crisis”, and (b) the toast/log
 * tint agrees by DIRECTION: own people leaving for a rival read red, internal moves and arrivals green.
 */
function checkNotificationClarity() {
  try {
    const whyThere = pullReasonsPhrase(["crisis-escape", "richer", "nearby"]); // flight tag must be dropped
    const pureFlight = pullReasonsPhrase(["crisis-escape", "safer-dir", "aggressor-avoided"]); // no pull → empty
    const flightPhrase = reasonLabel("crisis-escape");
    const pullOK = !!whyThere && !whyThere.includes(flightPhrase) && pureFlight === "";
    const rival = digestAccent(true, true);   // own people leaving for a rival → red
    const internal = digestAccent(true, false); // internal shuffle → green
    const arrival = digestAccent(false, true);  // arrival from abroad → green
    const tintOK = rival !== internal && internal === arrival;
    if (pullOK && tintOK) {
      return row("Notification clarity", "PASS",
        "The “why there” clause names only what drew people (“" + whyThere + "”) and drops flight reasons like “" +
        flightPhrase + "”. Toast and log-row share one direction rule: own people leaving for a rival read red, " +
        "internal moves and arrivals read green — so a toast never disagrees with its log entry.");
    }
    return row("Notification clarity", "FAIL",
      "Notification wording/tint is off (why-there “" + whyThere + "”, pure-flight “" + pureFlight + "”, tints " +
      "rival/internal/arrival " + rival + "/" + internal + "/" + arrival + "). The v2.1.0 clarity change is not active here.");
  } catch (e) {
    return row("Notification clarity", "INFO", "Notification helpers unavailable: " + errMsg(e));
  }
}

// Representative localized surfaces, one key each, to spot-check that translations resolve
// in the PLAYER's current locale — a runtime companion to the build-time i18n parity + ui-keys gates.
const L10N_SAMPLE = [
  ["LOC_EMIG_DIL_FX_GOLD", "refugee-dilemma effect labels"],
  ["LOC_EMIG_GUIDE_VIEW_REF", "Guide navigation pills"],
  ["LOC_DEMOGRAPHICS_METRIC_EMIG_GRAPHS", "Demographics charts"],
  ["LOC_EMIG_CHOICE_OFF", "Advanced-editor enum labels"],
  ["LOC_EMIG_ADV_RESET_ALL", "Advanced-editor buttons"],
  ["LOC_OPTIONS_EMIG_MINIMIZE", "Settings checkboxes"],
  ["LOC_EMIG_REASON_RICHER", "notification reason phrases"]
];

/**
 * Whether a LOC key resolves in the current locale (not the raw "LOC_…" tag echoed back on a miss).
 * @param {string} key The LOC key. @returns {boolean} True when it composes to real text.
 */
function resolvesLoc(key) {
  try {
    const v = Locale.compose(key);
    return typeof v === "string" && v.length > 0 && !v.startsWith("LOC_");
  } catch (_) {
    return false;
  }
}

/**
 * Interface localization — runtime spot-check. Samples one key per localized surface
 * and reports how many resolve in the player's language (a raw "LOC_…" tag = a missing translation).
 */
function checkLocalization() {
  if (typeof Locale === "undefined" || !Locale || typeof Locale.compose !== "function") {
    return row("Interface localization", "INFO",
      "Locale surface unavailable — run this in-game to spot-check that translations resolve in your language.");
  }
  try {
    const missing = L10N_SAMPLE.filter(([k]) => !resolvesLoc(k)).map(([, surface]) => surface);
    const total = L10N_SAMPLE.length;
    if (!missing.length) {
      return row("Interface localization", "PASS",
        "All " + total + " sampled surfaces resolve in your language — refugee-dilemma effect labels, Guide pills, " +
        "Demographics charts, Settings, the Advanced editor, and notification reasons — with no raw LOC tags leaking.");
    }
    return row("Interface localization", "WARN",
      missing.length + " of " + total + " sampled surfaces show raw keys in your language (missing translation): " +
      missing.join(", ") + ". Report the language so the strings can be filled in.");
  } catch (e) {
    return row("Interface localization", "INFO", "Localization spot-check unavailable: " + errMsg(e));
  }
}

/**
 * Pick a foreign origin + place to headline a FORCED enclave preview: a real foreign minority in one of
 * your cities if any exists (even below the enclave bar), else a placeholder so the preview still fires.
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
    checkRefugeePool, checkClosedBorderThrottle, checkContestedEnclaveYield, checkRazingRefugees,
    checkChronicle, checkNotifications, checkNotificationClarity, checkLocalization, checkPersistence,
    checkDemographics, checkForce, checkDepartureTile, checkArrivalPlacement, checkEnclaveTiles];
  return checks.map((fn) => {
    try {
      return fn();
    } catch (e) {
      return row("Check failed", "INFO", "A self-test check threw and was skipped: " + errMsg(e));
    }
  });
}
