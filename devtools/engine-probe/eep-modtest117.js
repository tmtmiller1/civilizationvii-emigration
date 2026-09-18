// eep-modtest117.js - Do minor-power raids now cause fewer refugees? Unattended, with a fixed verdict.
//
// Plays turns on its own until it can decide, then prints two verdicts. The criteria are fixed below, before
// the run, so the answer cannot be argued into shape afterwards.
//
// WHAT IS BEING TESTED. When every attacker of a city is a minor power (city-state or Independent Power), the
// violence model scores the attack lower: a smaller besieged floor and the whole observation scaled by
// minorViolenceScale. War refugees flee from a city once its violence intensity reaches the flee threshold.
// So the claim is: minor raids should cross that threshold less often, and shed fewer points when they do.
//
// HOW IT CAN TELL. The mod keeps, per city, a COUNTERFACTUAL intensity -- the same observations scored under
// the old rules, decaying by the same factor (emigration-violence-audit.js). That removes the problem an A/B
// pair of game runs would have, where the two games diverge as soon as the first migration differs. Every
// comparison here is between two scorings of the SAME fighting on the SAME turn.
//
// Read through globals, never imports: an import gives this probe its own, never-started copy of a module.
//   globalThis.emigration          the bootstrap control (set at the top of boot)
//   globalThis.EmigrationViolence  the audit
//   globalThis.EmigrationCombat    the combat ledger, read here as reader "probe" so it never consumes the
//                                  evidence the migration model is about to score
//
// VERDICT 1 - MECHANISM (is the downgrade applied to the right cities, by the right amount?)
//   FAIL         any observation where: the attackers' own isMajor flags disagree with the minor-only
//                decision; a minor-only raid scored HIGHER than the old rules; a raid with a major attacker
//                scored differently from the old rules; or a city's real intensity exceeds its counterfactual.
//   INCONCLUSIVE no minor-only raid was observed.
//   PASS         minor-only raids were observed and every check above held.
//
// VERDICT 2 - OUTCOME (fewer refugees?)
//   FAIL         the mechanism failed; or minor-raided cities reached the flee threshold under the old rules
//                and the change prevented neither a single crossing nor a single point of refugee flight.
//   INCONCLUSIVE no minor-raided city reached the flee threshold even under the old rules, so there were no
//                refugees for the change to reduce in this sample.
//   PASS         at least one turn where a minor-raided city would have been at or over the flee threshold
//                under the old rules and was below it under the new ones, or refugee points were avoided.
//
// Refugee points use the engine's own surge formula (1 + round(clamp((v - thr) / thr) * (warSurgeMax - 1))),
// without the siege-duration multiplier, so treat them as an estimate. Threshold crossings are exact: below
// the threshold violence does not produce war refugees at all.
const TAG = "[EmigTest]";
const MAX_TURNS = 25;
const ENOUGH_MINOR_OBS = 8;
const EPS = 1e-6;

function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable"; } }
function safe(fn, fb) { try { const v = fn(); return v === undefined ? fb : v; } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }

let local = -1, n = 0, endTurnTimer = null, blockedTries = 0, done = false;

const f = {
  obsSeen: new Set(), // "key@turn" so one observation is never counted twice
  minorObs: 0, majorObs: 0,
  misclassified: 0, amplified: 0, majorAltered: 0, invariantBreaks: 0,
  minorCities: new Set(),
  cfReachedThr: 0, // turns a minor-raided city was at/over threshold under the OLD rules
  prevented: 0, // ...and below it under the new rules
  pointsAvoided: 0,
  refugeesStart: new Map(), refugeesEnd: new Map(),
  // naming, from the ledger, read exactly once per event
  fights: 0, fightsNamed: 0, selfNamed: 0
};

const G = () => /** @type {*} */ (globalThis);

/** @returns {boolean|null} Whether a player is minor by its own flags, or null when unreadable. */
function isMinorPid(pid) {
  const p = safe(() => Players.get(pid), null);
  if (!p) return null;
  return p.isMajor === false;
}

/** Refugee points a city at this intensity would shed in a turn (0 below the threshold). */
function points(v, thr, max) {
  if (!(v >= thr)) return 0;
  const over = thr > 0 ? Math.max(0, Math.min(1, (v - thr) / thr)) : 0;
  return 1 + Math.round(over * (max - 1));
}

/** Check each new observation the model scored. */
function checkObservation(row) {
  const o = row.last;
  if (!o) return;
  const id = row.key + "@" + o.turn;
  if (f.obsSeen.has(id)) return;
  f.obsSeen.add(id);
  if (!(o.addFull > 0)) return;
  const flags = (o.named || []).map(isMinorPid);
  const readable = flags.length > 0 && flags.every((x) => x !== null);
  const allMinor = readable && flags.every((x) => x === true);
  if (readable && allMinor !== o.minorsOnly) {
    f.misclassified++;
    emit("MISCLASSIFIED " + row.key + " named=" + J(o.named) + " flags=" + J(flags) + " decided=" + o.minorsOnly);
  }
  if (o.minorsOnly) {
    f.minorObs++;
    f.minorCities.add(row.key);
    if (o.add > o.addFull + EPS) {
      f.amplified++;
      emit("AMPLIFIED " + row.key + " add=" + o.add + " full=" + o.addFull);
    }
  } else {
    f.majorObs++;
    if (Math.abs(o.add - o.addFull) > EPS) {
      f.majorAltered++;
      emit("MAJOR-ALTERED " + row.key + " named=" + J(o.named) + " add=" + o.add + " full=" + o.addFull);
    }
  }
}

/** One turn's pass over the audit and the ledger. */
function sample(first) {
  const V = G().EmigrationViolence;
  const C = G().EmigrationCombat;
  if (!V) return;
  const thr = Number(safe(() => V.threshold(), 2));
  const max = Number(safe(() => V.config().warSurgeMax, 3));
  for (const row of safe(() => V.snapshot(), []) || []) {
    checkObservation(row);
    if (row.intensity > row.counterfactual + EPS) {
      f.invariantBreaks++;
      emit("INVARIANT " + row.key + " intensity=" + row.intensity + " counterfactual=" + row.counterfactual);
    }
    if (first) f.refugeesStart.set(row.key, row.refugees);
    f.refugeesEnd.set(row.key, row.refugees);
    if (!first && f.minorCities.has(row.key) && row.counterfactual >= thr) {
      f.cfReachedThr++;
      if (row.intensity < thr) f.prevented++;
      f.pointsAvoided += Math.max(0, points(row.counterfactual, thr, max) - points(row.intensity, thr, max));
    }
  }
  if (!C) return;
  for (const p of safe(() => Players.getAlive(), []) || []) {
    const pid = typeof p === "number" ? p : safe(() => p.id, -1);
    for (const c of safe(() => Players.get(pid)?.Cities?.getCities?.(), []) || []) {
      const key = safe(() => c.id.owner + ":" + c.id.id, null);
      const ev = key ? safe(() => C.take(key, "probe"), null) : null;
      if (!ev || !(ev.battles > 0 || ev.kills > 0)) continue;
      f.fights += ev.battles + ev.kills;
      if ((ev.attackers || []).length) f.fightsNamed += ev.battles + ev.kills;
      if ((ev.attackers || []).includes(pid)) f.selfNamed++;
    }
  }
}

function mechanismVerdict() {
  if (!G().EmigrationViolence) return ["FAIL", "the audit was never published, so nothing could be checked"];
  const bad = f.misclassified + f.amplified + f.majorAltered + f.invariantBreaks;
  if (bad > 0) {
    return ["FAIL", "misclassified=" + f.misclassified + " amplified=" + f.amplified
      + " majorAltered=" + f.majorAltered + " invariantBreaks=" + f.invariantBreaks];
  }
  if (f.minorObs === 0) return ["INCONCLUSIVE", "no raid by minor powers alone was observed"];
  return ["PASS", f.minorObs + " minor-only raids downgraded correctly; " + f.majorObs + " raids with a major left untouched"];
}

function outcomeVerdict(mech) {
  if (mech === "FAIL") return ["FAIL", "the mechanism failed, so the refugee outcome cannot be trusted"];
  if (f.minorObs === 0) return ["INCONCLUSIVE", "no minor-only raid to measure"];
  if (f.cfReachedThr === 0) {
    return ["INCONCLUSIVE", "no minor-raided city reached the flee threshold even under the old rules"];
  }
  if (f.prevented > 0 || f.pointsAvoided > 0) {
    return ["PASS", f.prevented + " of " + f.cfReachedThr + " at-threshold turns under the old rules were below it now; ~"
      + f.pointsAvoided + " refugee points avoided"];
  }
  return ["FAIL", f.cfReachedThr + " at-threshold turns under the old rules and the change prevented none of them"];
}

function decided() {
  if (f.misclassified + f.amplified + f.majorAltered + f.invariantBreaks > 0) return true;
  return f.minorObs >= ENOUGH_MINOR_OBS && (f.prevented > 0 || f.pointsAvoided > 0);
}

function verdict() {
  let minorRefugees = 0, otherRefugees = 0;
  for (const [key, end] of f.refugeesEnd) {
    const d = end - (f.refugeesStart.get(key) || 0);
    if (f.minorCities.has(key)) minorRefugees += d; else otherRefugees += d;
  }
  const [mech, mWhy] = mechanismVerdict();
  const [out, oWhy] = outcomeVerdict(mech);
  emit("--- VERDICT ---");
  emit("bootstrap: emigration=" + typeof G().emigration + " audit=" + typeof G().EmigrationViolence
    + " ledger=" + J(safe(() => G().EmigrationCombat.stats(), "ABSENT")));
  emit("config:    " + J(safe(() => G().EmigrationViolence.config(), null)) + " threshold=" + safe(() => G().EmigrationViolence.threshold(), "?"));
  emit("turns=" + n + " observations: minorOnly=" + f.minorObs + " withMajor=" + f.majorObs
    + " minorCities=" + f.minorCities.size);
  emit("checks:    misclassified=" + f.misclassified + " amplified=" + f.amplified + " majorAltered=" + f.majorAltered
    + " invariantBreaks=" + f.invariantBreaks);
  emit("refugees:  oldRulesAtThreshold=" + f.cfReachedThr + " prevented=" + f.prevented + " pointsAvoided~" + f.pointsAvoided
    + " actualWarRefugees minorCities=" + minorRefugees + " otherCities=" + otherRefugees);
  emit("naming:    fights=" + f.fights + " named=" + f.fightsNamed + " selfNamed=" + f.selfNamed + " (each event read once)");
  emit("RESULT MECHANISM " + mech + ": " + mWhy);
  emit("RESULT OUTCOME " + out + ": " + oWhy);
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
  verdict();
  setTimeout(() => emit("DONE modtest117 finished"), 4000);
}

function run() {
  local = safe(() => GameContext.localPlayerID, -1);
  emit("modtest117 run local=" + local + " bootstrap=" + typeof G().emigration
    + " audit=" + typeof G().EmigrationViolence + " ledger=" + typeof G().EmigrationCombat);
  if (!G().emigration || !G().EmigrationViolence) {
    emit("the mod did not boot or did not publish its audit - nothing can be measured");
    finish();
    return;
  }
  sample(true);
  setTimeout(endTurn, 3000);
}

engine.on("PlayerTurnActivated", (d) => {
  const who = d && (d.player ?? d.Player);
  if (who !== GameContext.localPlayerID || local < 0 || done) return;
  if (endTurnTimer) { clearTimeout(endTurnTimer); endTurnTimer = null; }
  n++; blockedTries = 0;
  // The mod runs its pass on this same event; wait for it before reading what it decided.
  setTimeout(() => {
    sample(false);
    emit("T n=" + n + " minorObs=" + f.minorObs + " majorObs=" + f.majorObs + " oldAtThr=" + f.cfReachedThr
      + " prevented=" + f.prevented + " ptsAvoided=" + f.pointsAvoided
      + " bad=" + (f.misclassified + f.amplified + f.majorAltered + f.invariantBreaks));
    if (n >= MAX_TURNS || decided()) { finish(); return; }
    setTimeout(endTurn, 2000);
  }, 8000);
});

emit("modtest117 attached");
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
      try { run(); } catch (e) { emit("run threw " + e + " " + (e && e.stack)); emit("DONE modtest117 finished"); }
    }, 12000);
    return;
  }
  beginTries++;
  if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady());
  if (beginTries < 90) setTimeout(beginPoll, 2000);
  else { emit("LOAD gave up"); emit("DONE modtest117 finished"); }
}
setTimeout(beginPoll, 3000);
