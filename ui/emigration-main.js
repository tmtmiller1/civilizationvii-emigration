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
import { recordMigrations, accountLosses, markCityRemoved, monoTurn } from "/emigration/ui/emigration-migration-stats.js";
import { scaleCityPopulation } from "/emigration/ui/emigration-population.js";
import { reportBalanceSignals } from "/emigration/ui/emigration-telemetry.js";
import { recordCompositionPass } from "/emigration/ui/emigration-composition.js";
import { recordChroniclePass } from "/emigration/ui/emigration-diaspora.js";
import { planReturns } from "/emigration/ui/emigration-return.js";
import { maybeDilemma } from "/emigration/ui/emigration-dilemma.js";
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
import { installEmigrationConsole } from "/emigration/ui/emigration-screen.js";
import { installEmigrationDock } from "/emigration/ui/emigration-dock-decorator.js";
import { registerMigrationPage } from "/emigration/ui/emigration-migration-page.js";

let lastLocalTurnRun = -999;

/**
 * A monotonic millisecond clock for debug timing (Perf plan P2 #6); 0 if unavailable.
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
 * Loss accounting runs EVERY turn (starvation/plague/razing/disasters) , it's a
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
  maybeDilemma(conquests, migrations, signals);
  // Balance telemetry (P2.7): throttled net-flow / war-displacement outlier alerts (debug-gated).
  reportBalanceSignals(ownerIdsOf(signals), gameTurnNow());
  return conquests || [];
}

/**
 * Build the accounting record for a captured city: the population the conqueror absorbed moves from
 * the prior owner's civ to the new owner's (a cross-civ "conquest" migration). Tally-only, the base
 * game already transferred the city, so this never mutates population or composition (the composition
 * tracker handles the origin buckets via the owner flip).
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
 * Fold this pass's return migrations into `migrations`. Return migration MOVES real population (a
 * recovered, peaceful homeland draws its diaspora back), so it's added before accounting so the flow
 * tally + composition follow the returnees home. planReturns updates the shared `signals` in place for
 * any city it moves population out of / into, so the single per-pass collection stays accurate for the
 * accounting that follows. Self-throttled and gated by CONFIG.returnEnabled.
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
 * can only persist changes (it can't reach this isolate's CONFIG), so without re-reading each pass a
 * preset or tunable changed mid-game (e.g. switching the intensity to Low) wouldn't take effect until
 * the next game load. Cheap + idempotent (copies persisted values / defaults into CONFIG).
 */
function refreshSettings() {
  try {
    applyTunableOverrides();
  } catch (e) {
    dlog("applyTunableOverrides threw " + e);
  }
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
  // One city-signal collection per pass (post-runPass): threaded through return migration (which
  // mutates it in place for the cities it moves population between) and the accounting below, instead
  // of re-scanning every city's yields twice.
  const signals = collectCitySignals();
  migrations = foldReturns(migrations, signals);
  const conquests = accountAndReport(migrations, signals);
  appendConquests(migrations, conquests);
  // Snapshot the timeline EVERY pass, feeds the Demographics net-migration graph AND records per-civ
  // population growth even on passes with no migration, so the network/flow timeline is available and
  // plays population history before any emigration occurs (the recorder self-gates to the interval).
  recordMigrations(migrations);
  if (!migrations.length) {
    dlog("pass (" + why + ") none, " + Math.round(nowMs() - t0) + "ms");
    return 0;
  }
  reportNewsworthy(migrations);
  dlog("pass (" + why + ") " + migrations.length + " migs, " + Math.round(nowMs() - t0) + "ms");
  return migrations.length;
}

/**
 * Fire feedback for the newsworthy half of a pass: the move + the departure. A lagged ARRIVAL is the
 * same event landing later (metrics-only); conquest is tally-only (the base game announces captures);
 * returns are narrated by the Chronicle, not the alarm toasts. All three are excluded here but stay
 * counted in the flow/stats via recordMigrations.
 * @param {*[]} migrations This pass's migrations.
 */
function reportNewsworthy(migrations) {
  const newsworthy = migrations.filter(
    (m) => m.phase !== "arrive" && m.cause !== "conquest" && m.cause !== "return");
  reportPassFeedback(newsworthy); // in-game toasts / world-news (§10)
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
  if (a.load > 0 && who === local) {
    dlog("assimilation: load " + a.load.toFixed(1) + " cost -" + a.happiness.toFixed(1) + " happy -" + Math.round(a.gold) + " gold");
  }
  const mh = applyMigrantHoldingPenalty(who);
  if (mh.count > 0 && who === local) {
    dlog("migrant-hold: " + mh.count + " migrant(s) cost -" + mh.happiness.toFixed(1) + " happy -" + Math.round(mh.gold) + " gold");
  }
  // Raid (§4b): the op's cost/duration/grievance are native (Diplomacy Extended); Emigration just
  // reads the active action each turn during the pass (raidTilt) , nothing to charge here.
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

/** Install the in-game UI hooks (readout, console, dock button, prosperity lens). */
function installUi() {
  installEmigrationEvents(); // disaster event hook (§10/§11)
  installCityReadout(); // per-city migration readout: console commands + best-effort selection
  installEmigrationConsole(); // console: emigration.window() opens the standalone screen
  installEmigrationDock(); // in-game dock button that opens that screen (no console needed)
  // The prosperity map lens self-registers as its own <UIScripts> entry (emigration-prosperity-lens
  // .js), in the HUD context where LensManager lives , it is intentionally NOT wired through here.
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
    // Razing (distinct from conquest's CityTransfered): credit the razed city's residual as a loss.
    engine.on("CityRemovedFromMap", (/** @type {*} */ d) => markCityRemoved(d && d.cityID));
  } catch (_) {
    /* ignore */
  }
  installUi();
  // Raid actions (§4b) are native diplomacy actions (Diplomacy Extended mod); they appear in the
  // diplomacy screen on their own. Emigration reads their active state; no UI hook needed here.
  // No on-screen dev controls: run-pass / dump-ranking are available via the
  // globalThis.emigration console API (runNow / rank), so the mod adds no buttons
  // to the sub-system dock.
  // Contribute the net-migration graph to Demographics if it's installed.
  // Order-independent: registers now if its API is up, else queues for it to
  // drain when it loads (Demographics imports its metrics module lazily).
  dlog(registerMigrationMetric() ? "Demographics graph registered" : "Demographics graph deferred/absent");
  // Contribute the dedicated Migration page to Demographics (L3). Always registered; the page carries
  // a live `enabled` predicate (= "Demographics tab" access mode) that the Demographics screen checks
  // each render, so the dock-button-vs-tab choice applies without a game reload. Same order-independent
  // handshake; a no-op on an older Demographics that lacks the registerPanel hook.
  dlog(registerMigrationPage() ? "Demographics page registered" : "Demographics page deferred/absent");
}

boot();
