// eep-modtest118.js - Long unattended soak of the minor-power balance, attacker naming and combat ledger.
//
// Mod test 117 passed on ONE turn of data. This runs a fixed 60 turns with no early stop, and instead of
// assuming that is enough, it measures whether the result has settled: the refugee-reduction rate is computed
// per 10-turn window, and the verdict says NOT CONVERGED if the later windows disagree or are too thin.
//
// Everything is read through globals (an import gives a probe its own, never-started module copy):
//   globalThis.emigration          bootstrap control, checked EVERY turn, not just at start
//   globalThis.EmigrationViolence  real vs pre-change ("counterfactual") intensity per city
//   globalThis.EmigrationCombat    the combat ledger, read as reader "probe" so the model's evidence is untouched
//
// VERDICTS (criteria fixed here, before the run):
//
// A. MINOR MECHANISM - raids where every named attacker is a minor power
//   FAIL          any such observation where the attackers' own isMajor flags disagree with the decision, the
//                 raid scored higher than the old rules, or any city's real intensity exceeds its counterfactual
//   INCONCLUSIVE  no minor-only raid observed
//   PASS          otherwise
//
// B. MAJOR MECHANISM - raids with at least one major attacker must be scored exactly as before
//   FAIL          any such observation scored differently from the old rules, or misclassified as minor-only
//   INCONCLUSIVE  no raid with a major attacker observed (reported plainly, never folded into a pass)
//   PASS          otherwise
//
// C. OUTCOME - fewer war refugees from minor raids
//   FAIL          A failed; or minor-raided cities sat at/over the flee threshold under the old rules and the
//                 change kept none of those turns below it and avoided no refugee points
//   INCONCLUSIVE  no minor-raided city reached the threshold even under the old rules
//   PASS          at least one old-rules threshold turn kept below it, or points avoided
//
// D. CONVERGENCE - is the run long enough to trust the size of the effect?
//   CONVERGED     the last two 10-turn windows each hold >= 5 old-rules threshold turns and their prevented
//                 rates are each within 0.15 of the whole-run rate
//   NOT CONVERGED otherwise (the size of the effect needs a longer run or a busier save)
//
// E. HEALTH
//   FAIL          the bootstrap global vanished on any turn, the ledger stopped tracking, its event count went
//                 backwards, or a city was named as its own attacker
//   PASS          otherwise
//
// Refugee points use the engine's surge formula without the siege-duration multiplier (an estimate). Threshold
// crossings are exact: below the flee threshold violence produces no war refugees.
const TAG = "[EmigTest]";
const TURNS = 60;
const WINDOW = 10;
const EPS = 1e-6;

function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable"; } }
function safe(fn, fb) { try { const v = fn(); return v === undefined ? fb : v; } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
const G = () => /** @type {*} */ (globalThis);

let local = -1, n = 0, endTurnTimer = null, blockedTries = 0, done = false, turnStartedAt = 0;
const MAX_DETAIL_LINES = 25;
let detailLines = 0;

function detail(m) {
  if (detailLines++ < MAX_DETAIL_LINES) emit(m);
}

const f = {
  obsSeen: new Set(),
  minorObs: 0, majorObs: 0,
  minorMisclassified: 0, majorMisclassified: 0, amplified: 0, majorAltered: 0, invariantBreaks: 0,
  sources: { struck: 0, units: 0, district: 0, atwar: 0, none: 0 },
  minorCities: new Set(), majorCities: new Set(),
  cfAtThr: 0, prevented: 0, pointsAvoided: 0,
  windows: /** @type {Array<{cfAtThr:number, prevented:number, points:number, minorObs:number, majorObs:number}>} */ ([]),
  refugeesStart: new Map(), refugeesEnd: new Map(),
  fights: 0, fightsNamed: 0, selfNamed: 0, majorFights: 0,
  bootMissingTurns: 0, trackerDown: 0, seenBackwards: 0, lastSeen: 0,
  turnMs: /** @type {number[]} */ ([]),
  ages: new Set()
};

function win() {
  const i = Math.floor(Math.max(0, n - 1) / WINDOW);
  while (f.windows.length <= i) f.windows.push({ cfAtThr: 0, prevented: 0, points: 0, minorObs: 0, majorObs: 0 });
  return f.windows[i];
}

/** @returns {boolean|null} Minor by the player's own flags, or null when unreadable. */
function isMinorPid(pid) {
  const p = safe(() => Players.get(pid), null);
  if (!p) return null;
  return p.isMajor === false;
}

function points(v, thr, max) {
  if (!(v >= thr)) return 0;
  const over = thr > 0 ? Math.max(0, Math.min(1, (v - thr) / thr)) : 0;
  return 1 + Math.round(over * (max - 1));
}

/** Grade one new observation the model scored. */
function checkObservation(row, counting) {
  const o = row.last;
  if (!o) return;
  const id = row.key + "@" + o.turn;
  if (f.obsSeen.has(id)) return;
  f.obsSeen.add(id);
  if (!(o.addFull > 0)) return;
  f.sources[o.source] = (f.sources[o.source] || 0) + 1;
  const flags = (o.named || []).map(isMinorPid);
  const readable = flags.length > 0 && flags.every((x) => x !== null);
  const allMinor = readable && flags.every((x) => x === true);
  const anyMajor = flags.some((x) => x === false);
  const w = counting ? win() : null;
  if (o.minorsOnly) {
    f.minorObs++;
    if (w) w.minorObs++;
    f.minorCities.add(row.key);
    if (readable && !allMinor) {
      f.minorMisclassified++;
      detail("MISCLASSIFIED-AS-MINOR " + row.key + " named=" + J(o.named) + " flags=" + J(flags));
    }
    if (o.add > o.addFull + EPS) {
      f.amplified++;
      detail("AMPLIFIED " + row.key + " add=" + o.add + " full=" + o.addFull);
    }
  } else {
    if (anyMajor) {
      f.majorObs++;
      if (w) w.majorObs++;
      f.majorCities.add(row.key);
    }
    if (readable && allMinor) {
      f.majorMisclassified++;
      detail("MISCLASSIFIED-AS-MAJOR " + row.key + " named=" + J(o.named) + " source=" + o.source);
    }
    if (Math.abs(o.add - o.addFull) > EPS) {
      f.majorAltered++;
      detail("NON-MINOR-ALTERED " + row.key + " named=" + J(o.named) + " add=" + o.add + " full=" + o.addFull);
    }
  }
}

function sampleAudit(first) {
  const V = G().EmigrationViolence;
  if (!V) return;
  const thr = Number(safe(() => V.threshold(), 2));
  const max = Number(safe(() => V.config().warSurgeMax, 3));
  const w = first ? null : win();
  for (const row of safe(() => V.snapshot(), []) || []) {
    checkObservation(row, !first);
    if (row.intensity > row.counterfactual + EPS) {
      f.invariantBreaks++;
      detail("INVARIANT " + row.key + " intensity=" + row.intensity + " counterfactual=" + row.counterfactual);
    }
    if (first) f.refugeesStart.set(row.key, row.refugees);
    f.refugeesEnd.set(row.key, row.refugees);
    // Only a city whose MOST RECENT scored raid was minor-only counts toward the outcome: a city that has since
    // been hit by a major is scored at full strength again and must not dilute or inflate the rate.
    if (w && row.last && row.last.minorsOnly && row.counterfactual >= thr) {
      const pts = Math.max(0, points(row.counterfactual, thr, max) - points(row.intensity, thr, max));
      f.cfAtThr++; w.cfAtThr++;
      if (row.intensity < thr) { f.prevented++; w.prevented++; }
      f.pointsAvoided += pts; w.points += pts;
    }
  }
}

function sampleLedger() {
  const C = G().EmigrationCombat;
  if (!C) return;
  const st = safe(() => C.stats(), null);
  if (!st || !st.tracking) f.trackerDown++;
  if (st && typeof st.seen === "number") {
    if (st.seen < f.lastSeen) f.seenBackwards++;
    f.lastSeen = st.seen;
  }
  for (const p of safe(() => Players.getAlive(), []) || []) {
    const pid = typeof p === "number" ? p : safe(() => p.id, -1);
    for (const c of safe(() => Players.get(pid)?.Cities?.getCities?.(), []) || []) {
      const key = safe(() => c.id.owner + ":" + c.id.id, null);
      const ev = key ? safe(() => C.take(key, "probe"), null) : null;
      if (!ev || !(ev.battles > 0 || ev.kills > 0)) continue;
      const k = ev.battles + ev.kills;
      f.fights += k;
      if ((ev.attackers || []).length) f.fightsNamed += k;
      if ((ev.attackers || []).some((a) => isMinorPid(a) === false)) f.majorFights += k;
      if ((ev.attackers || []).includes(pid)) {
        f.selfNamed++;
        detail("SELF-NAMED " + key + " attackers=" + J(ev.attackers));
      }
    }
  }
}

function checkHealth() {
  if (typeof G().emigration !== "object" || !G().emigration) {
    f.bootMissingTurns++;
    detail("BOOTSTRAP MISSING on turn n=" + n);
  }
  f.ages.add(String(safe(() => Game.age, "?")));
}

function rate(w) { return w.cfAtThr > 0 ? w.prevented / w.cfAtThr : null; }

function convergence() {
  const total = f.cfAtThr > 0 ? f.prevented / f.cfAtThr : null;
  const full = f.windows.filter((w, i) => i < Math.floor(n / WINDOW));
  const lastTwo = full.slice(-2);
  const rates = f.windows.map((w) => (rate(w) == null ? "-" : rate(w).toFixed(2)));
  if (total == null || lastTwo.length < 2) return ["NOT CONVERGED", "fewer than two complete windows with data", rates, total];
  const thin = lastTwo.some((w) => w.cfAtThr < 5);
  const off = lastTwo.some((w) => rate(w) == null || Math.abs(rate(w) - total) > 0.15);
  if (thin) return ["NOT CONVERGED", "a late window holds fewer than 5 old-rules threshold turns", rates, total];
  if (off) return ["NOT CONVERGED", "a late window's prevented rate differs from the whole run by more than 0.15", rates, total];
  return ["CONVERGED", "the last two windows agree with the whole-run rate", rates, total];
}

function verdicts() {
  const hasAudit = !!G().EmigrationViolence;
  const minor = !hasAudit ? ["FAIL", "audit never published"]
    : (f.minorMisclassified + f.amplified + f.invariantBreaks) > 0
      ? ["FAIL", "misclassifiedAsMinor=" + f.minorMisclassified + " amplified=" + f.amplified + " invariantBreaks=" + f.invariantBreaks]
      : f.minorObs === 0 ? ["INCONCLUSIVE", "no minor-only raid observed"]
        : ["PASS", f.minorObs + " minor-only raid observations, all downgraded correctly"];
  const major = !hasAudit ? ["FAIL", "audit never published"]
    : (f.majorAltered + f.majorMisclassified) > 0
      ? ["FAIL", "nonMinorAltered=" + f.majorAltered + " misclassifiedAsMajor=" + f.majorMisclassified]
      : f.majorObs === 0 ? ["INCONCLUSIVE", "no raid with a major attacker was observed; this rule is untested in game"]
        : ["PASS", f.majorObs + " raid observations with a major attacker, all scored at full strength"];
  let outcome;
  if (minor[0] === "FAIL") outcome = ["FAIL", "minor mechanism failed"];
  else if (f.minorObs === 0) outcome = ["INCONCLUSIVE", "no minor-only raid to measure"];
  else if (f.cfAtThr === 0) outcome = ["INCONCLUSIVE", "no minor-raided city reached the threshold even under the old rules"];
  else if (f.prevented > 0 || f.pointsAvoided > 0) {
    outcome = ["PASS", f.prevented + "/" + f.cfAtThr + " old-rules threshold turns kept below it ("
      + (100 * f.prevented / f.cfAtThr).toFixed(1) + "%), ~" + f.pointsAvoided + " refugee points avoided"];
  } else outcome = ["FAIL", f.cfAtThr + " old-rules threshold turns, none prevented, no points avoided"];
  const conv = convergence();
  const healthBad = f.bootMissingTurns + f.trackerDown + f.seenBackwards + f.selfNamed;
  const health = healthBad > 0
    ? ["FAIL", "bootMissingTurns=" + f.bootMissingTurns + " trackerDown=" + f.trackerDown + " seenBackwards=" + f.seenBackwards + " selfNamed=" + f.selfNamed]
    : ["PASS", "mod booted every turn; ledger tracked throughout; no self-named attackers"];
  return { minor, major, outcome, conv, health };
}

function checkpoint(tag) {
  emit(tag + " n=" + n + " " + J({
    minorObs: f.minorObs, majorObs: f.majorObs, cfAtThr: f.cfAtThr, prevented: f.prevented, pts: f.pointsAvoided,
    bad: f.minorMisclassified + f.majorMisclassified + f.amplified + f.majorAltered + f.invariantBreaks,
    fights: f.fights, named: f.fightsNamed, majorFights: f.majorFights, sources: f.sources,
    health: [f.bootMissingTurns, f.trackerDown, f.seenBackwards, f.selfNamed]
  }));
}

function report() {
  let minorRef = 0, majorRef = 0, otherRef = 0;
  for (const [key, end] of f.refugeesEnd) {
    const d = end - (f.refugeesStart.get(key) || 0);
    if (f.majorCities.has(key)) majorRef += d;
    else if (f.minorCities.has(key)) minorRef += d;
    else otherRef += d;
  }
  const v = verdicts();
  const ms = f.turnMs.slice().sort((a, b) => a - b);
  const med = ms.length ? ms[Math.floor(ms.length / 2)] : 0;
  emit("--- VERDICT ---");
  emit("run:        turns=" + n + " ages=" + J([...f.ages]) + " medianTurnMs=" + med + " maxTurnMs=" + (ms[ms.length - 1] || 0));
  emit("config:     " + J(safe(() => G().EmigrationViolence.config(), null)) + " threshold=" + safe(() => G().EmigrationViolence.threshold(), "?"));
  emit("observed:   minorOnly=" + f.minorObs + " withMajor=" + f.majorObs + " minorCities=" + f.minorCities.size + " majorCities=" + f.majorCities.size);
  emit("sources:    " + J(f.sources) + "  (atwar = the weak at-war proxy was the only basis)");
  emit("checks:     misclassifiedAsMinor=" + f.minorMisclassified + " misclassifiedAsMajor=" + f.majorMisclassified
    + " amplified=" + f.amplified + " nonMinorAltered=" + f.majorAltered + " invariantBreaks=" + f.invariantBreaks);
  emit("refugees:   oldRulesAtThreshold=" + f.cfAtThr + " prevented=" + f.prevented + " pointsAvoided~" + f.pointsAvoided
    + " actualWarRefugees minor=" + minorRef + " major=" + majorRef + " other=" + otherRef);
  emit("windows:    " + J(f.windows) + " preventedRate=" + J(v.conv[2]));
  emit("naming:     fights=" + f.fights + " named=" + f.fightsNamed + " withMajorAttacker=" + f.majorFights + " selfNamed=" + f.selfNamed);
  emit("RESULT A MINOR-MECHANISM " + v.minor[0] + ": " + v.minor[1]);
  emit("RESULT B MAJOR-MECHANISM " + v.major[0] + ": " + v.major[1]);
  emit("RESULT C OUTCOME " + v.outcome[0] + ": " + v.outcome[1]);
  emit("RESULT D CONVERGENCE " + v.conv[0] + ": " + v.conv[1] + " (whole-run rate " + (v.conv[3] == null ? "n/a" : v.conv[3].toFixed(3)) + ")");
  emit("RESULT E HEALTH " + v.health[0] + ": " + v.health[1]);
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
    turnStartedAt = Date.now();
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
  report();
  setTimeout(() => emit("DONE modtest118 finished"), 4000);
}

function run() {
  local = safe(() => GameContext.localPlayerID, -1);
  emit("modtest118 run local=" + local + " bootstrap=" + typeof G().emigration
    + " audit=" + typeof G().EmigrationViolence + " ledger=" + typeof G().EmigrationCombat);
  if (!G().emigration || !G().EmigrationViolence) {
    emit("the mod did not boot or did not publish its audit - nothing can be measured");
    finish();
    return;
  }
  checkHealth();
  sampleAudit(true);
  sampleLedger();
  setTimeout(endTurn, 3000);
}

engine.on("PlayerTurnActivated", (d) => {
  const who = d && (d.player ?? d.Player);
  if (who !== GameContext.localPlayerID || local < 0 || done) return;
  if (endTurnTimer) { clearTimeout(endTurnTimer); endTurnTimer = null; }
  n++; blockedTries = 0;
  if (turnStartedAt) f.turnMs.push(Date.now() - turnStartedAt);
  // The mod runs its pass on this same event; give it time before reading what it decided.
  setTimeout(() => {
    try {
      checkHealth();
      sampleAudit(false);
      sampleLedger();
    } catch (e) { emit("SAMPLE threw " + e); }
    if (n % 5 === 0) checkpoint("CHECKPOINT");
    if (n >= TURNS) { finish(); return; }
    setTimeout(endTurn, 2000);
  }, 8000);
});

emit("modtest118 attached");
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
      try { run(); } catch (e) { emit("run threw " + e + " " + (e && e.stack)); emit("DONE modtest118 finished"); }
    }, 12000);
    return;
  }
  beginTries++;
  if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady());
  if (beginTries < 90) setTimeout(beginPoll, 2000);
  else { emit("LOAD gave up"); emit("DONE modtest118 finished"); }
}
setTimeout(beginPoll, 3000);
