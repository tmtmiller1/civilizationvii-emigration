// emigration-main.js
//
// Bootstrap: run the emigration pass once per local-player turn, report each migration with a
// historically-scaled people count (aligned with the Demographics mod), and expose dev controls.
// Output reaches UI.log via the GameFace CSS-parse channel (mod console.log does not): grep EMIG in
//   ~/Library/Application Support/Civilization VII/Logs/UI.log

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { startCombatEvents } from "/emigration/ui/emigration-combat-events.js";
import { exposeViolenceAudit } from "/emigration/ui/emigration-violence.js";
import { runPass, takePressureCues } from "/emigration/ui/emigration-engine.js";
import { collectCitySignals } from "/emigration/ui/emigration-cities.js";
import { rankByProsperity } from "/emigration/ui/emigration-prosperity.js";
import { applyTunableOverrides } from "/emigration/ui/emigration-settings.js";
import { dlog } from "/emigration/ui/emigration-log.js";
import { reportMigration } from "/emigration/ui/emigration-report.js";
import { recordMigrations, accountLosses, markCityRemoved, monoTurn } from "/emigration/ui/emigration-migration-stats.js";
import { scaleCityPopulation } from "/emigration/ui/emigration-population.js";
import { reportBalanceSignals, recordPassCounters, dumpCounters } from "/emigration/ui/emigration-telemetry.js";
import { recordCompositionPass } from "/emigration/ui/emigration-composition.js";
import { dumpOrigins } from "/emigration/ui/emigration-origins-diag.js";
import { recordChroniclePass } from "/emigration/ui/emigration-diaspora.js";
import { planReturns } from "/emigration/ui/emigration-return.js";
import { maybeDilemma } from "/emigration/ui/emigration-dilemma.js";
import { maybeQuarter, tickContestedQuarters } from "/emigration/ui/emigration-quarter.js";
import { registerMigrationMetric } from "/emigration/ui/emigration-demographics.js";
import { tickAssimilation } from "/emigration/ui/emigration-effects.js";
import { applyMigrantHoldingPenalty } from "/emigration/ui/emigration-migrant-units.js";
import { tickAttractionDividend } from "/emigration/ui/emigration-dividend.js";
import { tickRefugeeBurden } from "/emigration/ui/emigration-refugee-burden.js";
import { raidOf } from "/emigration/ui/emigration-raid.js";
import { recordWarDeclared, recordPeace } from "/emigration/ui/emigration-war.js";
import { hasOpenBordersDeal } from "/emigration/ui/emigration-geography.js";
import { reportPassFeedback, reportInboundFeedback, reportPressureCues } from "/emigration/ui/emigration-feedback.js";
import { installEmigrationEvents } from "/emigration/ui/emigration-events.js";
import { installCityReadout } from "/emigration/ui/emigration-city-readout.js";
import { installEmigrationConsole } from "/emigration/ui/emigration-screen.js";
import { installEmigrationDock } from "/emigration/ui/emigration-dock-decorator.js";
import { offerCallHome, callHomeNow, callHomeCooldownLeft } from "/emigration/ui/emigration-call-home-action.js";
import { ownerCitySnapshots } from "/emigration/ui/emigration-city-readout-data.js";
import { CALL_HOME_SCOPE, CALL_HOME_CURRENCY, callHomeQuote } from "/emigration/ui/emigration-call-home.js";
import { installEmigrationCityPanel } from "/emigration/ui/emigration-city-panel.js";
import { sweepEmptyRuralDistricts, sweepOnceGameStarts } from "/emigration/ui/emigration-plot-cleanup.js";
import { registerMigrationPage } from "/emigration/ui/emigration-migration-page.js";

let lastLocalTurnRun = -999;

/** @param {{load:number,happiness:number,gold:number}} a @param {number} who @param {number} local */
function logAssimilation(a, who, local) {
  if (!(a.load > 0) || who !== local) return;
  dlog("assimilation: load " + a.load.toFixed(1) + " cost -" + a.happiness.toFixed(1) + " happy -" + Math.round(a.gold) + " gold");
}

/** @param {{count:number,happiness:number,gold:number}} mh @param {number} who @param {number} local */
function logMigrantHold(mh, who, local) {
  if (!(mh.count > 0) || who !== local) return;
  dlog("migrant-hold: " + mh.count + " migrant(s) cost -" + mh.happiness.toFixed(1) + " happy -" + Math.round(mh.gold) + " gold");
}

/** @param {{pool:number,happiness:number,gold:number}} rb @param {number} who @param {number} local */
function logRefugeeBurden(rb, who, local) {
  if (!(rb.pool > 0) || who !== local) return;
  dlog("refugee-hold: " + rb.pool + " pool point(s) cost -" + rb.happiness.toFixed(1) + " happy -" + Math.round(rb.gold) + " gold");
}

/**
 * A monotonic millisecond clock for debug timing; 0 if unavailable.
 * @returns {number} Milliseconds.
 */
function nowMs() {
  try {
    const g = /** @type {*} */ (globalThis);
    return g.performance && g.performance.now ? g.performance.now() : Date.now();
  } catch (_) {
    return 0;
  }
}

/**
 * The current age-local game turn, or 0 (for telemetry throttling).
 * @returns {number} Game.turn or 0.
 */
function gameTurnNow() {
  try {
    return typeof Game !== "undefined" && typeof Game.turn === "number" ? Game.turn : 0;
  } catch (_) {
    return 0;
  }
}

/**
 * The unique owner ids present in a city-signal list.
 * @param {{owner?:number}[]} signals City signals.
 * @returns {number[]} Distinct owner ids.
 */
function ownerIdsOf(signals) {
  /** @type {Set<number>} */
  const owners = new Set();
  for (const s of signals || []) if (typeof s.owner === "number") owners.add(s.owner);
  return [...owners];
}

/**
 * Account external population loss for this pass and emit balance telemetry.
 * Loss accounting runs EVERY turn (starvation/plague/razing/disasters), it's a
 * turn-over-turn population diff, not tied to a move. Both steps are defensive.
 * @param {*[]} migrations This pass's migrations.
 * @param {*[]} signals This pass's city signals, collected once in doPass (post-return-moves).
 */
function accountAndReport(migrations, signals) {
  try {
    accountLosses(signals, migrations);
  } catch (e) {
    dlog("accountLosses threw " + e);
  }
  // Per-settlement ethnic composition: net this turn's births/migration/conquest into each city's
  // origin mix (drives the ethnicity lens + the city-readout breakdown). Runs every turn. Also
  // returns any city captures detected this pass (owner flips), so the caller can tally them.
  const conquests = recordCompositionPass(signals, migrations);
  // Migration Chronicle: write any movement worth keeping as history (a great exodus, a diaspora
  // taking root) from this pass's waves + the freshly-updated composition. Cosmetic; never throws.
  recordChroniclePass(signals, migrations);
  // Refugee dilemmas: the rare narrative decision when an upheaval (a conquest spree this pass, or a
  // plague crisis) sends a wave toward the local player. Throttled + Options-gated inside; never throws.
  const dilemmaFired = maybeDilemma(conquests, migrations, signals);
  // Cultural Quarters: an established foreign diaspora becomes a persistent, player-shaped district.
  // Ranked BELOW the refugee dilemma so two modals never race; then the war-strain tick marks quarters
  // contested while the host is at war with their homeland. Both never throw into the pass.
  maybeQuarter(signals, dilemmaFired);
  tickContestedQuarters(signals);
  // Balance telemetry: throttled net-flow / war-displacement outlier alerts (debug-gated).
  reportBalanceSignals(ownerIdsOf(signals), gameTurnNow());
  return conquests || [];
}

/**
 * Build the accounting record for a captured city: the population the conqueror absorbed moves from
 * the prior owner's civ to the new owner's (a cross-civ "conquest" migration). Tally-only; the base
 * game already transferred the city, so this never mutates population or composition.
 * @param {{prevOwner:number, newOwner:number, name:string, points:number}} c A capture event.
 * @returns {*} A conquest migration record.
 */
function conquestRecord(c) {
  return {
    srcOwner: c.prevOwner, destOwner: c.newOwner,
    srcName: c.name, destName: c.name,
    points: c.points, people: scaleCityPopulation(c.points, monoTurn(), undefined, undefined, c.name),
    cause: "conquest", crossCiv: true
  };
}

/**
 * Fold this pass's return migrations into `migrations`. Return migration MOVES real population, so it
 * is added before accounting and planReturns updates the shared `signals` in place, keeping the single
 * per-pass collection accurate for the accounting that follows. Gated by CONFIG.returnEnabled.
 * @param {*[]} migrations The pass's migrations so far. @param {*[]} signals The pass's city signals.
 * @returns {*[]} The migrations, plus any returns.
 */
function foldReturns(migrations, signals) {
  try {
    const returns = planReturns(signals);
    return returns.length ? migrations.concat(returns) : migrations;
  } catch (e) {
    dlog("planReturns threw " + e);
    return migrations;
  }
}

/**
 * Append capture-driven "conquest" migration records (the conqueror absorbed the city's population),
 * unless disabled. Added AFTER the composition pass so the origin buckets aren't double-applied, and
 * kept tally-only (the base game already announces a capture).
 * @param {*[]} migrations The pass's migrations (mutated). @param {*[]} conquests The capture events.
 */
function appendConquests(migrations, conquests) {
  if (CONFIG.conquestMigrationEnabled === false) return;
  for (const c of conquests) migrations.push(conquestRecord(c));
}

/**
 * Re-read the player's saved settings into CONFIG. The Options screen runs in a SEPARATE V8 isolate and
 * can only persist changes, so re-reading each pass lets a mid-game tunable change take effect without
 * a game load. Cheap + idempotent.
 */
function refreshSettings() {
  try {
    applyTunableOverrides();
  } catch (e) {
    dlog("applyTunableOverrides threw " + e);
  }
}

/**
 * Post-runPass accounting + reporting for one pass, on a single fresh city-signal read (so yields
 * aren't re-scanned twice): fold returns, account losses/composition, append conquests, snapshot the
 * timeline, fold the balance counters, and surface any rising-pressure cues. Returns the final migration list.
 * @param {*[]} migrations This pass's migrations from runPass.
 * @returns {*[]} The migrations after returns/conquests are folded in.
 */
function accountPass(migrations) {
  const signals = collectCitySignals();
  migrations = foldReturns(migrations, signals);
  const conquests = accountAndReport(migrations, signals);
  appendConquests(migrations, conquests);
  recordMigrations(migrations);
  recordPassCounters(migrations); // P0.4 balance counters (voluntary/crisis/deaths)
  reportPressureCues(takePressureCues()); // P0.3 low-key "rising pressure" cues
  return migrations;
}

/**
 * Run a pass and report results. Returns the migration count.
 * @param {string} why Reason label for the log.
 * @returns {number} Migrations applied.
 */
function doPass(why) {
  const t0 = nowMs(); // Perf plan P2 #6: time the local-turn pass (debug-only via dlog).
  refreshSettings(); // pick up any preset/tunable change made mid-game in the Options screen
  let migrations = [];
  try {
    migrations = runPass();
  } catch (e) {
    dlog("pass threw " + e);
    return 0;
  }
  migrations = accountPass(migrations);
  if (!migrations.length) {
    dlog("pass (" + why + ") none, " + Math.round(nowMs() - t0) + "ms");
    return 0;
  }
  reportNewsworthy(migrations);
  dlog("pass (" + why + ") " + migrations.length + " migs, " + Math.round(nowMs() - t0) + "ms");
  return migrations.length;
}

/**
 * Fire feedback for the newsworthy half of a pass: the move + the departure. Lagged arrivals,
 * conquests (the base game announces captures) and returns (narrated by the Chronicle) are excluded
 * here but stay counted in the flow/stats via recordMigrations.
 * @param {*[]} migrations This pass's migrations.
 */
function reportNewsworthy(migrations) {
  const newsworthy = migrations.filter(
    (m) => m.phase !== "arrive" && m.cause !== "conquest" && m.cause !== "return");
  reportPassFeedback(newsworthy); // in-game toasts / world-news: own losses + world crises
  // Inbound immigration is announced on the ARRIVAL (when the player's city actually gains people), so
  // it needs the FULL pass (arrivals are filtered out of `newsworthy` above). Run AFTER the loss/crisis
  // toasts so those claim the shared cooldown first when several things happen in one pass.
  reportInboundFeedback(migrations);
  for (const m of newsworthy) reportMigration(m);
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
  logAssimilation(a, who, local);
  const mh = applyMigrantHoldingPenalty(who);
  logMigrantHold(mh, who, local);
  const rb = tickRefugeeBurden(who);
  logRefugeeBurden(rb, who, local);
  // Raid: the op's cost/duration/grievance are native (Diplomacy Extended); Emigration just
  // reads the active action each turn during the pass (raidTilt), nothing to charge here.
  // Carried dividend: grant the per-turn attraction bonus (the assimilation mirror).
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
    // Every local turn, whatever the pass interval: clear empty rural districts left by destroyed
    // improvements, so no abandoned plot stays unusable.
    sweepEmptyRuralDistricts();
    const turn = typeof Game !== "undefined" && typeof Game.turn === "number" ? Game.turn : 0;
    // Game.turn resets to a low value at each age boundary. Without this rebase the
    // gate `turn - lastLocalTurnRun` would stay below the interval for most of the new age
    // (the pass going dormant) until the turn climbs back past the prior age's last run.
    if (turn < lastLocalTurnRun) lastLocalTurnRun = turn;
    if (turn - lastLocalTurnRun < CONFIG.turnInterval) return;
    lastLocalTurnRun = turn;
    doPass("turn " + turn);
    offerCallHomeWhenCalm(local);
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

/** Install the in-game UI hooks (readout, console, dock button, prosperity lens). */
function installUi() {
  installEmigrationEvents(); // disaster event hook
  installCityReadout(); // per-city migration readout: console commands + best-effort selection
  installEmigrationConsole(); // console: emigration.window() opens the standalone screen
  installEmigrationDock(); // in-game dock button that opens that screen (no console needed)
  installEmigrationCityPanel(); // inject population + quarter data into the base City Details panel
  // The on-screen self-test button rides the subsystem dock (emigration-dock-decorator.js); installEmigrationDock()
  // below wires it when selftestEnabled. The prosperity map lens self-registers as its own <UIScripts>
  // entry (emigration-prosperity-lens.js) in the HUD context where LensManager lives, not through here.
}

/** Boot. */

/**
 * Console entry for "call our people home":
 *   emigration.callHome()                         offer the internal call for the local player
 *   emigration.callHome("external")               offer the call for people living abroad
 *   emigration.callHome("internal", "influence")  skip the dialog and pay in Influence
 * @param {string} [scope] "internal" (default) or "external".
 * @param {string} [currency] "gold" (default) or "influence"; omit to open the dialog instead.
 * @returns {*} What happened, also logged.
 */



/**
 * Offer to call our people home once the danger that displaced them has passed. Keyed on calm (nobody
 * under threat, somebody still away) rather than a war ending, because disasters and minor-power raids
 * make refugees without any formal war. The action keeps its own cooldown, so a calm empire is asked once.
 * @param {number} pid The local player id.
 */
function offerCallHomeWhenCalm(pid) {
  try {
    if (!CONFIG.callHomeEnabled || !CONFIG.callHomeOfferWhenCalm) return;
    if (typeof pid !== "number" || pid < 0) return;
    if (!isCalm(pid)) return;
    for (const scope of [CALL_HOME_SCOPE.INTERNAL, CALL_HOME_SCOPE.EXTERNAL]) {
      if (callHomeQuote(pid, scope, CALL_HOME_CURRENCY.GOLD).points > 0 && offerCallHome(pid, scope)) return;
    }
  } catch (e) {
    dlog("call home when calm threw " + e);
  }
}

/**
 * Whether none of a civilization's settlements is still under situational distress — war, siege, disaster,
 * famine or unrest alike. Unreadable state counts as NOT calm, so the offer stays quiet rather than
 * interrupting a crisis it could not see.
 * @param {number} pid The player id. @returns {boolean} True when everywhere is quiet.
 */
function isCalm(pid) {
  try {
    const snaps = ownerCitySnapshots(pid);
    if (!Array.isArray(snaps) || !snaps.length) return false;
    return snaps.every((s) => !(Number(s && s.distress) > 0));
  } catch (_) {
    return false;
  }
}

/**
 * Console entry for "call our people home":
 *   emigration.callHome()                         offer the internal call for the local player
 *   emigration.callHome("external")               offer the call for people living abroad
 *   emigration.callHome("internal", "influence")  skip the dialog and pay in Influence
 * @param {string} [scope] "internal" (default) or "external".
 * @param {string} [currency] "gold" (default) or "influence"; omit to open the dialog instead.
 * @returns {*} What happened, also logged.
 */






/**
 * Subscribe the war and combat trackers. Every one of these is fog-independent, so a war between two AI
 * players on the far side of the map feeds the migration model exactly as the player's own war does.
 */
function hookWarTracking() {
  // Who-declared-on-whom, for aggressor-aware refugee flight. Recorders guard their own access.
  try {
    engine.on("DiplomacyDeclareWar", (/** @type {*} */ d) => recordWarDeclared(d));
    engine.on("DiplomacyMakePeace", (/** @type {*} */ d) => recordPeace(d));
    // Razing (distinct from conquest's CityTransfered): credit the razed city's residual as a loss.
    engine.on("CityRemovedFromMap", (/** @type {*} */ d) => markCityRemoved(d && d.cityID));
  } catch (_) {
    /* ignore */
  }
  // Per-city combat evidence (Combat / UnitKilledInCombat / DistrictDamageChanged): what lets the violence
  // model say WHO struck a given settlement, and see a field battle that never touched its walls. The polled
  // signals in emigration-violence-signals.js stay in place as the backstop.
  try {
    dlog("combat events " + (startCombatEvents() ? "tracking" : "not started"));
    exposeViolenceAudit();
  } catch (e) {
    dlog("combat events threw " + e);
  }
}

/**
 * Console entry for "call our people home":
 *   emigration.callHome()                         offer the internal call for the local player
 *   emigration.callHome("external")               offer the call for people living abroad
 *   emigration.callHome("internal", "influence")  skip the dialog and pay in Influence
 * @param {string} [scope] "internal" (default) or "external".
 * @param {string} [currency] "gold" (default) or "influence"; omit to open the dialog instead.
 * @returns {*} What happened, also logged.
 */
function consoleCallHome(scope, currency) {
  const pid = GameContext.localPlayerID;
  const sc = scope === "external" ? CALL_HOME_SCOPE.EXTERNAL : CALL_HOME_SCOPE.INTERNAL;
  const left = callHomeCooldownLeft(pid, sc);
  if (left > 0) {
    dlog("call home: " + left + " turn(s) of cooldown left for " + sc);
    return { ok: false, reason: "cooldown", turnsLeft: left };
  }
  if (currency) {
    const cur = currency === "influence" ? CALL_HOME_CURRENCY.INFLUENCE : CALL_HOME_CURRENCY.GOLD;
    const r = callHomeNow(pid, sc, cur);
    dlog("call home " + sc + ": " + JSON.stringify(r));
    return r;
  }
  const quote = callHomeQuote(pid, sc, CALL_HOME_CURRENCY.GOLD);
  if (!offerCallHome(pid, sc)) {
    dlog("call home: nobody to call for " + sc + " (" + quote.available + " away)");
    return { ok: false, reason: "nobody-to-call", away: quote.available };
  }
  return { ok: true, offered: sc, points: quote.points, away: quote.available };
}

function boot() {
  applyTunableOverrides(); // push saved option values into CONFIG before any pass
  dlog("boot start (turnInterval " + CONFIG.turnInterval + ", crossCiv " + CONFIG.crossCivEnabled + ")");
  try {
    globalThis.emigration = {
      runNow: () => doPass("global"),
      rank: () => dumpRanking(),
      // Balance telemetry dump: raw counters + reason histogram + derived shares, for tuning.
      // Logs and returns the snapshot.
      metrics: () => dumpCounters(),
      // Ethnic-ledger diagnostic: for settlements matching a name substring (omit for all), dump the
      // recorded per-origin mix + the all-game inbound corridors (with causes) that produced it, so a
      // surprising "Population origins" figure can be traced to real immigration vs a conquest baseline.
      origins: (/** @type {string=} */ name) => dumpOrigins(name),
      // Diagnostic for the Open Borders bonus: logs the joint diplomatic-event action
      // names between two players and whether an Open Borders agreement is detected.
      callHome: (/** @type {string=} */ scope, /** @type {string=} */ currency) =>
        consoleCallHome(scope, currency),
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
      // Diagnostic for the Talent Raid integration: does Emigration see a native raid
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
  hookWarTracking();
  installUi();
  sweepOnceGameStarts(); // heal empty rural districts in a loaded save as soon as the game starts
  // Raid actions are native diplomacy actions (Diplomacy Extended mod); they appear in the
  // diplomacy screen on their own. Emigration reads their active state; no UI hook needed here.
  // No on-screen dev controls: run-pass / dump-ranking are available via the
  // globalThis.emigration console API (runNow / rank), so the mod adds no buttons
  // to the sub-system dock.
  // Contribute the net-migration graph to Demographics if it's installed.
  // Order-independent: registers now if its API is up, else queues for it to
  // drain when it loads (Demographics imports its metrics module lazily).
  dlog(registerMigrationMetric() ? "Demographics graph registered" : "Demographics graph deferred/absent");
  // Contribute the dedicated Migration page to Demographics. Always registered; the page carries a live
  // `enabled` predicate that the Demographics screen checks each render, so the dock-button-vs-tab
  // choice applies without a game reload. A no-op on a Demographics that lacks the registerPanel hook.
  dlog(registerMigrationPage() ? "Demographics page registered" : "Demographics page deferred/absent");
}

boot();
