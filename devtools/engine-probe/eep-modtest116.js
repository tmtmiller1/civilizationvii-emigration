// eep-modtest116.js - Does the per-city combat ledger name who attacked, in a real game, unattended?
//
// Runs itself: advances turns until it has enough evidence to decide, then prints a VERDICT. It does not
// dump numbers for a human to interpret -- the criteria are fixed below, BEFORE the run, so the answer
// cannot be rationalized after the fact.
//
// WHAT IS BEING TESTED. emigration-combat-events.js records, per city, the fighting in its territory
// (`Combat`, `UnitKilledInCombat`, `DistrictDamageChanged`) and names the players involved. Mod test 115
// watched it record real fights at Cincinnati and Lille but report `attackers=[]` for both: it named a
// combatant only when that combatant was not the city's owner, so an invader KILLED BY the defender arrived
// as the victim and was never named. Attacker identity is what the minor-power raid balance rests on, so
// that hole matters. The fix names every combatant who is not the city's owner, on both events.
//
// WHY IT READS A GLOBAL. A UI script in another mod that imports the module gets its OWN instance, whose
// tracker was never started and whose maps are therefore always empty (mod tests 112/113 both read zero for
// exactly this reason). `globalThis.EmigrationCombat` is the live instance. `globalThis.emigration` is the
// control that proves the mod's bootstrap ran at all -- when a missing deployed file broke the main module,
// that global was absent and every reading below would have been meaningless.
//
// THE CRITERIA, fixed in advance:
//   FAIL         tracker never attached; or fights were recorded and NO attacker was ever named; or a city's
//                own owner was named as attacking it.
//   INCONCLUSIVE no combat events at all, or none attributable to any city, in the turns available. A run
//                where nothing happened must never report success -- that is how a dead feature survives.
//   PARTIAL      fewer than half of the fights that COULD name an attacker did.
//   PASS         fights were recorded, attackers were named on most of them, and no city was ever named as
//                its own attacker.
//
// Note a row with district damage but no battle or kill is NOT counted against naming: DistrictDamageChanged
// carries no attacker at all, so an unnamed damage-only row is correct behavior, not a miss.
const TAG = "[EmigTest]";
const MAX_TURNS = 22;
const ENOUGH_FIGHTS = 8; // stop early once the sample can support a verdict

function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable"; } }
function safe(fn, fb) { try { const v = fn(); return v === undefined ? fb : v; } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }

let local = -1, n = 0, endTurnTimer = null, blockedTries = 0, done = false;

/** Cumulative findings. Evidence rolls per turn, so every turn must be sampled and folded in here. */
const found = {
  turnsSampled: 0,
  fightRows: 0, // rows with a battle or a kill: these CAN name an attacker
  namedRows: 0, // ...and did
  unnamedRows: 0, // ...and did not
  dmgOnlyRows: 0, // damage with no battle/kill: cannot name an attacker, not counted against the fix
  selfNamed: 0, // a city listed as attacking itself: a correctness failure
  battles: 0,
  kills: 0,
  cities: new Set(),
  attackers: new Set(),
  foreignCities: 0
};

/** @returns {*} The live ledger published by the mod, or null. */
function ledger() {
  return safe(() => /** @type {*} */ (globalThis).EmigrationCombat, null);
}

/** Fold this turn's per-city evidence into the cumulative findings. */
function sample() {
  const L = ledger();
  if (!L) return;
  found.turnsSampled++;
  for (const p of safe(() => Players.getAlive(), []) || []) {
    const pid = typeof p === "number" ? p : safe(() => p.id, -1);
    for (const c of safe(() => Players.get(pid)?.Cities?.getCities?.(), []) || []) {
      const key = safe(() => c.id.owner + ":" + c.id.id, null);
      const ev = key ? safe(() => L.evidenceFor(key), null) : null;
      if (!ev || (ev.dmg <= 0 && ev.battles <= 0 && ev.kills <= 0)) continue;
      foldRow(key, pid, ev, safe(() => Locale.compose(c.name), "?"));
    }
  }
}

/** Classify one city's evidence row against the criteria. */
function foldRow(key, owner, ev, name) {
  const fight = ev.battles > 0 || ev.kills > 0;
  found.cities.add(key);
  found.battles += ev.battles;
  found.kills += ev.kills;
  if (owner !== local) found.foreignCities++;
  for (const a of ev.attackers || []) {
    found.attackers.add(a);
    // A city can never be attacking itself. If this ever fires the naming rule is inverted somewhere.
    if (a === owner) {
      found.selfNamed++;
      emit("DEFECT '" + name + "' owner=" + owner + " named ITSELF as an attacker");
    }
  }
  if (!fight) {
    found.dmgOnlyRows++;
    return;
  }
  found.fightRows++;
  if ((ev.attackers || []).length > 0) found.namedRows++;
  else {
    found.unnamedRows++;
    emit("UNNAMED '" + name + "' owner=" + owner + " battles=" + ev.battles + " kills=" + ev.kills
      + " dmg=" + Number(ev.dmg).toFixed(3) + " -- a fight that named nobody");
  }
}

/** @returns {boolean} Whether enough has been seen to decide without burning more turns. */
function decided() {
  return found.fightRows >= ENOUGH_FIGHTS || found.selfNamed > 0;
}

/** Print the verdict against the criteria fixed at the top of this file. */
function verdict() {
  const L = ledger();
  const stats = L ? safe(() => L.stats(), null) : null;
  const boot = typeof (/** @type {*} */ (globalThis).emigration);
  emit("--- VERDICT ---");
  emit("bootstrap: globalThis.emigration=" + boot + "  ledger=" + (L ? "present" : "ABSENT"));
  emit("tracker:   " + J(stats));
  emit("observed:  turnsSampled=" + found.turnsSampled + " citiesTouched=" + found.cities.size
    + " foreignRows=" + found.foreignCities + " battles=" + found.battles + " kills=" + found.kills);
  emit("naming:    fightRows=" + found.fightRows + " named=" + found.namedRows
    + " unnamed=" + found.unnamedRows + " damageOnlyRows=" + found.dmgOnlyRows
    + " distinctAttackers=" + J([...found.attackers]) + " selfNamed=" + found.selfNamed);

  let call = "PASS", why = "fights were recorded and attackers were named";
  if (!L || !stats || !stats.tracking) {
    call = "FAIL";
    why = "the tracker never attached, so nothing could be recorded";
  } else if (!stats.seen) {
    call = "INCONCLUSIVE";
    why = "no combat events arrived in " + n + " turns; nothing was tested";
  } else if (found.fightRows === 0 && found.dmgOnlyRows === 0) {
    call = "INCONCLUSIVE";
    why = "events arrived (" + stats.seen + ") but none landed in any city's territory";
  } else if (found.selfNamed > 0) {
    call = "FAIL";
    why = found.selfNamed + " row(s) named a city as its own attacker";
  } else if (found.fightRows === 0) {
    call = "INCONCLUSIVE";
    why = "only district damage was seen, which carries no attacker; naming was never exercised";
  } else if (found.namedRows === 0) {
    call = "FAIL";
    why = found.fightRows + " fight(s) recorded and not one named an attacker";
  } else if (found.namedRows * 2 < found.fightRows) {
    call = "PARTIAL";
    why = "only " + found.namedRows + " of " + found.fightRows + " fights named an attacker";
  }
  emit("RESULT " + call + ": " + why);
  emit("--- END VERDICT ---");
}

function endTurn() {
  if (done) return;
  try {
    const me = Players.get(local);
    if (!me.isTurnActive || GameContext.hasSentTurnComplete()) return;
    const b = String(Game.Notifications.getEndTurnBlockingType(local));
    if (b !== String(EndTurnBlockingTypes.NONE)) {
      blockedTries++;
      if (blockedTries >= 3 && typeof Autoplay !== "undefined") {
        safe(() => {
          Autoplay.setTurns(1); Autoplay.setReturnAsPlayer(local);
          Autoplay.setObserveAsPlayer(local); Autoplay.setActive(true);
        });
        blockedTries = 0; endTurnTimer = setTimeout(endTurn, 30000); return;
      }
      endTurnTimer = setTimeout(endTurn, 4000); return;
    }
    safe(() => UI.Player.deselectAllUnits());
    GameContext.sendTurnComplete();
  } catch (e) { emit("ENDTURN threw " + e); }
  endTurnTimer = setTimeout(() => {
    if (safe(() => Players.get(local).isTurnActive, false) && !GameContext.hasSentTurnComplete()) endTurn();
  }, 12000);
}

function finish() {
  if (done) return;
  done = true;
  if (endTurnTimer) clearTimeout(endTurnTimer);
  sample();
  verdict();
  setTimeout(() => emit("DONE modtest116 finished"), 4000);
}

function run() {
  local = safe(() => GameContext.localPlayerID, -1);
  const L = ledger();
  emit("modtest116 run local=" + local
    + " bootstrap=" + typeof (/** @type {*} */ (globalThis).emigration)
    + " ledger=" + (L ? J(safe(() => L.stats(), "ERR")) : "ABSENT"));
  if (!L) {
    // No point burning 22 turns: without the live ledger nothing below can be measured.
    emit("ledger absent at start - the mod's bootstrap did not publish it");
    finish();
    return;
  }
  setTimeout(endTurn, 3000);
}

engine.on("PlayerTurnActivated", (d) => {
  const who = d && (d.player ?? d.Player);
  if (who !== GameContext.localPlayerID || local < 0 || done) return;
  if (endTurnTimer) { clearTimeout(endTurnTimer); endTurnTimer = null; }
  n++; blockedTries = 0;
  setTimeout(() => {
    sample();
    emit("T n=" + n + " fightRows=" + found.fightRows + " named=" + found.namedRows
      + " unnamed=" + found.unnamedRows + " seen=" + J(safe(() => ledger()?.stats()?.seen, "?")));
    if (n >= MAX_TURNS || decided()) { finish(); return; }
    setTimeout(endTurn, 2000);
  }, 5000);
});

emit("modtest116 attached");
let beginTries = 0;
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
      try { run(); } catch (e) { emit("run threw " + e + " " + (e && e.stack)); emit("DONE modtest116 finished"); }
    }, 12000);
    return;
  }
  beginTries++;
  if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady());
  if (beginTries < 90) setTimeout(beginPoll, 2000);
  else { emit("LOAD gave up"); emit("DONE modtest116 finished"); }
}
setTimeout(beginPoll, 3000);
