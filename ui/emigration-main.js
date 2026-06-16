// emigration-main.js
//
// Bootstrap: run the emigration pass once per local-player turn, report each
// migration with a historically-scaled people count (aligned with the
// Demographics mod), and expose dev controls (run-now + prosperity ranking).
//
// Output reaches UI.log via the GameFace CSS-parse channel (mod console.log does
// not): grep EMIG in
//   ~/Library/Application Support/Civilization VII/Logs/UI.log

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { runPass } from "/emigration/ui/emigration-engine.js";
import { collectCitySignals } from "/emigration/ui/emigration-cities.js";
import { rankByProsperity } from "/emigration/ui/emigration-prosperity.js";
import { applyTunableOverrides } from "/emigration/ui/emigration-settings.js";
import { dlog } from "/emigration/ui/emigration-log.js";
import { reportMigration } from "/emigration/ui/emigration-report.js";
import { recordMigrations } from "/emigration/ui/emigration-migration-stats.js";
import { registerMigrationMetric } from "/emigration/ui/emigration-demographics.js";
import { tickAssimilation } from "/emigration/ui/emigration-effects.js";
import { applyMigrantHoldingPenalty } from "/emigration/ui/emigration-migrant-units.js";
import { tickAttractionDividend } from "/emigration/ui/emigration-dividend.js";
import { raidOf } from "/emigration/ui/emigration-raid.js";
import { recordWarDeclared, recordPeace } from "/emigration/ui/emigration-war.js";
import { hasOpenBordersDeal } from "/emigration/ui/emigration-geography.js";
import { reportPassFeedback } from "/emigration/ui/emigration-feedback.js";
import { installEmigrationEvents } from "/emigration/ui/emigration-events.js";
import { installCityReadout } from "/emigration/ui/emigration-city-readout.js";
import { installEmigrationWindow } from "/emigration/ui/emigration-window.js";
import { registerMigrationPage } from "/emigration/ui/emigration-migration-page.js";

let lastLocalTurnRun = -999;

/**
 * Run a pass and report results. Returns the migration count.
 * @param {string} why Reason label for the log.
 * @returns {number} Migrations applied.
 */
function doPass(why) {
  let migrations = [];
  try {
    migrations = runPass();
  } catch (e) {
    dlog("pass threw " + e);
    return 0;
  }
  if (!migrations.length) {
    dlog("pass (" + why + ") no migrations this turn");
    return 0;
  }
  recordMigrations(migrations); // feed the Demographics net-migration graph (all phases)
  // Notifications/logging fire on the newsworthy half - the move + the departure. A lagged
  // ARRIVAL is the same event landing later, so it's metrics-only (the departure already
  // told the story; surfacing both would double-toast and double-count the cause summary).
  const newsworthy = migrations.filter((m) => m.phase !== "arrive");
  reportPassFeedback(newsworthy); // in-game toasts / world-news (§10)
  dlog("pass (" + why + ") " + migrations.length + " migration(s)");
  for (const m of newsworthy) reportMigration(m);
  return migrations.length;
}

/**
 * Charge a civ its per-turn costs (assimilation load + migrant-holding), and log
 * them for the local player.
 * @param {*} who The activating player id.
 * @param {number} local The local player id.
 */
function chargePerTurnCosts(who, local) {
  if (typeof who !== "number") return;
  const a = tickAssimilation(who);
  if (a.load > 0 && who === local) {
    dlog("assimilation: load " + a.load.toFixed(1) + " cost -" + a.happiness.toFixed(1) + " happy -" + Math.round(a.gold) + " gold");
  }
  const mh = applyMigrantHoldingPenalty(who);
  if (mh.count > 0 && who === local) {
    dlog("migrant-hold: " + mh.count + " migrant(s) cost -" + mh.happiness.toFixed(1) + " happy -" + Math.round(mh.gold) + " gold");
  }
  // Raid (§4b): the op's cost/duration/grievance are native (Diplomacy Extended); Emigration just
  // reads the active action each turn during the pass (raidTilt) — nothing to charge here.
  // Carried dividend (§1b): grant the per-turn attraction bonus (the assimilation mirror).
  const d = tickAttractionDividend(who);
  if (who === local) {
    for (const yk of Object.keys(d)) {
      if (d[yk] > 0) dlog("attraction dividend: +" + d[yk].toFixed(1) + " " + yk.replace("YIELD_", "").toLowerCase());
    }
  }
}

/**
 * PlayerTurnActivated handler: run the emigration pass once per local-player
 * turn, honoring CONFIG.turnInterval.
 * @param {*} data Event payload (carries the activating player).
 */
function onTurnActivated(data) {
  try {
    const local = GameContext.localPlayerID;
    const who = data && (data.player ?? data.Player);
    // Every civ pays its per-turn migration costs on its own turn (assimilation
    // load decay + migrant-holding). grantYield works cross-civ.
    chargePerTurnCosts(who, local);
    if (who !== local) return;
    const turn = typeof Game !== "undefined" && typeof Game.turn === "number" ? Game.turn : 0;
    if (turn - lastLocalTurnRun < CONFIG.turnInterval) return;
    lastLocalTurnRun = turn;
    doPass("turn " + turn);
  } catch (e) {
    dlog("onTurnActivated threw " + e);
  }
}

/** Dump the current prosperity ranking (for tuning). */
function dumpRanking() {
  try {
    const ranked = rankByProsperity(collectCitySignals());
    dlog("RANKING " + ranked.length + " cities");
    for (const s of ranked.slice(0, 20)) {
      dlog(
        "RANK " +
          Math.round(s.pros) +
          " " +
          (s.city?.name && Locale?.compose ? Locale.compose(s.city.name) : "city") +
          " owner " +
          s.owner +
          " pop " +
          s.population +
          " rural " +
          s.rural +
          " happy " +
          Math.round(s.happiness) +
          " food " +
          Math.round(s.food) +
          " prod " +
          Math.round(s.production) +
          (s.starving ? " STARVING" : "") +
          (s.unrest ? " UNREST" : "") +
          (s.atWar ? " WAR" : "")
      );
    }
  } catch (e) {
    dlog("dumpRanking threw " + e);
  }
}

/** Boot. */
function boot() {
  applyTunableOverrides(); // push saved option values into CONFIG before any pass
  dlog("boot start (turnInterval " + CONFIG.turnInterval + ", crossCiv " + CONFIG.crossCivEnabled + ")");
  try {
    globalThis.emigration = {
      runNow: () => doPass("global"),
      rank: () => dumpRanking(),
      // Diagnostic for the Open Borders bonus: logs the joint diplomatic-event action
      // names between two players and whether an Open Borders agreement is detected.
      openBorders: (/** @type {number} */ a, /** @type {number} */ b) => {
        const names = [];
        try {
          const ev = (typeof Game !== "undefined" && Game?.Diplomacy?.getJointEvents?.(a, b, false)) || [];
          for (const e of ev) names.push(e?.actionTypeName);
        } catch (e) {
          dlog("openBorders read threw " + e);
        }
        dlog("joint events " + a + "<->" + b + ": [" + names.join(", ") + "]");
        return { hasOpenBordersDeal: hasOpenBordersDeal(a, b), actionTypeNames: names };
      },
      // Diagnostic for the Talent Raid integration (§4b): does Emigration see a native raid
      // action this civ is running? Pass a player id, or omit for the local player. If this
      // returns null while a raid IS active in the diplomacy screen, the event read needs fixing.
      raids: (/** @type {number=} */ pid) => {
        const who = typeof pid === "number" ? pid : GameContext.localPlayerID;
        const r = raidOf(who);
        dlog("raid for " + who + ": " + JSON.stringify(r));
        return r;
      }
    };
  } catch (_) {
    /* ignore */
  }
  try {
    engine.on("PlayerTurnActivated", onTurnActivated);
    dlog("PlayerTurnActivated hooked");
  } catch (e) {
    dlog("engine.on threw " + e);
  }
  // Track who-declared-on-whom (public, fog-independent) for aggressor-aware refugee
  // flight (Feature 1). Recorders guard their own engine access.
  try {
    engine.on("DiplomacyDeclareWar", (/** @type {*} */ d) => recordWarDeclared(d));
    engine.on("DiplomacyMakePeace", (/** @type {*} */ d) => recordPeace(d));
  } catch (_) {
    /* ignore */
  }
  installEmigrationEvents(); // disaster event hook (§10/§11)
  installCityReadout(); // per-city migration readout: console commands + best-effort selection
  installEmigrationWindow(); // standalone migration dashboard window (console: emigration.window())
  // Raid actions (§4b) are native diplomacy actions (Diplomacy Extended mod); they appear in the
  // diplomacy screen on their own. Emigration reads their active state; no UI hook needed here.
  // No on-screen dev controls: run-pass / dump-ranking are available via the
  // globalThis.emigration console API (runNow / rank), so the mod adds no buttons
  // to the sub-system dock.
  // Contribute the net-migration graph to Demographics if it's installed.
  // Order-independent: registers now if its API is up, else queues for it to
  // drain when it loads (Demographics imports its metrics module lazily).
  dlog(registerMigrationMetric() ? "Demographics graph registered" : "Demographics graph deferred/absent");
  // Contribute the dedicated Migration page to Demographics (L3). Same order-independent
  // handshake; a no-op on an older Demographics that lacks the registerPanel hook.
  dlog(registerMigrationPage() ? "Demographics page registered" : "Demographics page deferred/absent");
}

boot();
