// eep-modtest-mp4.js - Multiplayer plan (docs/player-experience-risks.md 8.9h) PROBE 4, hotseat.
//
// HYPOTHESIS (plan 4.1 and 8.9b): with more than one human, the mod's per-turn work runs once PER HUMAN
// instead of once per game turn, because `onTurnActivated` gates on `who === GameContext.localPlayerID` and
// the local player changes with each human's turn. The authority gate in 8.9b would run it once.
//
// Hotseat is one client and one simulation, so this tests the authority gate and the owner/viewer split,
// never replication. What it answers:
//   A. What the session reads say with two humans: isHotseat, isAnyMultiplayer, getHostPlayerId,
//      Network.isHost, humanPlayerIDs. The plan's `sessionKind()` and `isAuthority()` rest on these.
//   B. Does localPlayerID really change as the turn passes between humans?
//   C. How many times does a local-player turn activation fire per GAME turn (today's pass count), and how
//      many would the authority gate allow (one)?
//   D. Does the shipped mod actually run its pass more than once per game turn? Counted from the mod's own
//      log lines, which the runner captures separately.
//
// VERDICTS, fixed before the run:
//   HUMANS<2                -> INCONCLUSIVE: the hotseat game did not start with two humans.
//   ACTIVATIONS_PER_TURN=1  -> the double-run does not happen in hotseat; the authority gate is only needed
//                              for network games.
//   ACTIVATIONS_PER_TURN>1  -> confirmed: today's mod does its per-turn work once per human.

const TAG = "[EmigTest]";
const GAME_TURNS = 3;

let beginTries = 0;
let done = false;
let blockedTries = 0;
let endTurnTimer = null;
/** @type {{turn:number, who:number, local:number}[]} Every local-player activation seen. */
const activations = [];
/** @type {number[]} Every player id seen as the local player. */
const localsSeen = [];
let startTurn = 0;

/** @param {string} m Message. */
function emit(m) {
  try { console.error(TAG + " " + m); } catch (_) { /* ignore */ }
}

/** @param {()=>*} fn Body. @param {*} fb Fallback. @returns {*} Result or fallback. */
function safe(fn, fb) {
  try { return fn(); } catch (e) { return fb; }
}

/** @param {*} v Value. @returns {string} Compact JSON. */
function J(v) {
  return safe(() => JSON.stringify(v), "?");
}

/** A: what the session reads answer with two humans. */
function stepA() {
  const g = safe(() => Configuration.getGame(), null);
  emit("A1 isHotseat=" + safe(() => J(g.isHotseat), "?") +
    " isAnyMultiplayer=" + safe(() => J(g.isAnyMultiplayer), "?") +
    " isNetworkMultiplayer=" + safe(() => J(g.isNetworkMultiplayer), "?") +
    " isLocalMultiplayer=" + safe(() => J(g.isLocalMultiplayer), "?"));
  emit("A2 humanPlayerIDs=" + safe(() => J(g.humanPlayerIDs), "?") +
    " humanPlayerCount=" + safe(() => J(g.humanPlayerCount), "?") +
    " localPlayerID=" + safe(() => GameContext.localPlayerID, "?"));
  emit("A3 Network.getHostPlayerId=" + safe(() => String(Network.getHostPlayerId()), "throw") +
    " Network.isHost=" + safe(() => String(Network.isHost()), "absent") +
    " config.isHost=" + safe(() => J(g.isHost), "absent"));
}

/** The number of local-player activations seen per game turn. */
function perTurnCounts() {
  /** @type {Record<string, number>} */
  const byTurn = {};
  for (const a of activations) byTurn[a.turn] = (byTurn[a.turn] || 0) + 1;
  return byTurn;
}

function finish() {
  if (done) return;
  done = true;
  if (endTurnTimer) safe(() => clearTimeout(endTurnTimer));
  const humans = safe(() => Configuration.getGame().humanPlayerCount, 0);
  const byTurn = perTurnCounts();
  const counts = Object.keys(byTurn).map((k) => byTurn[k]);
  const max = counts.length ? Math.max(...counts) : 0;
  emit("C1 activations=" + J(activations));
  emit("C2 activationsPerGameTurn=" + J(byTurn) + " distinctLocalIds=" + J([...new Set(localsSeen)]));
  emit("VERDICT HUMANS=" + humans + " ACTIVATIONS_PER_TURN_MAX=" + max +
    (humans < 2 ? " INCONCLUSIVE (needed two humans)" : (max > 1 ? " DOUBLE-RUN CONFIRMED" : " single run")));
  emit("DONE modtest4 finished");
}

function onActivated(/** @type {*} */ d) {
  if (done) return;
  const who = d && (d.player ?? d.Player);
  const local = safe(() => GameContext.localPlayerID, -1);
  if (typeof local === "number" && localsSeen.indexOf(local) < 0) localsSeen.push(local);
  const turn = safe(() => Game.turn, 0);
  emit("B" + activations.length + " activation who=" + who + " local=" + local + " turn=" + turn +
    " isTurnActive=" + safe(() => J(Players.get(who)?.isTurnActive), "?"));
  // This is the gate the shipped mod uses: it does its per-turn work when the activating player is the
  // local one. In hotseat the local player changes, so each human's activation can pass it.
  if (who === local) {
    activations.push({ turn, who, local });
    if (turn - startTurn >= GAME_TURNS) {
      finish();
      return;
    }
    endTurnTimer = setTimeout(endTurn, 4000);
  }
}

function run() {
  startTurn = safe(() => Game.turn, 0);
  emit("modtest-mp4 start (probe 4: hotseat, two humans), startTurn=" + startTurn);
  stepA();
  safe(() => engine.on("PlayerTurnActivated", onActivated));
  // The first activation may already have happened before this script attached.
  const local = safe(() => GameContext.localPlayerID, -1);
  if (safe(() => Players.get(local)?.isTurnActive, false)) {
    onActivated({ player: local });
  } else {
    endTurnTimer = setTimeout(endTurn, 6000);
  }
  // Hotseat hands the device over between players, which may hold a curtain this probe cannot dismiss.
  // Stop on a fixed deadline either way, so the run always reports what it saw.
  setTimeout(finish, 240000);
}

function endTurn() {
  if (done) return;
  try {
    const local = GameContext.localPlayerID;
    const me = Players.get(local);
    if (!me || !me.isTurnActive || GameContext.hasSentTurnComplete()) {
      endTurnTimer = setTimeout(endTurn, 4000);
      return;
    }
    const b = String(Game.Notifications.getEndTurnBlockingType(local));
    if (b !== String(EndTurnBlockingTypes.NONE)) {
      blockedTries++;
      emit("endTurn blocked by " + safe(() => Game.Notifications.getTypeName(
        Game.Notifications.find(Game.Notifications.getEndTurnBlockingNotificationId?.(local))?.Type), b) + " tries=" + blockedTries);
      // The assign-new-resources blocker cannot be cleared from script (engine limits 6.4), and without
      // passing the turn the hotseat handoff never happens, which is the whole question. One-turn Autoplay
      // advances it. It pollutes yields, but this probe counts turn activations only.
      if (blockedTries >= 2 && typeof Autoplay !== "undefined") {
        emit("endTurn: using one-turn Autoplay to pass the turn as player " + local);
        safe(() => {
          Autoplay.setTurns(1);
          Autoplay.setReturnAsPlayer(local);
          Autoplay.setObserveAsPlayer(local);
          Autoplay.setActive(true);
        });
        blockedTries = 0;
        endTurnTimer = setTimeout(endTurn, 25000);
        return;
      }
      endTurnTimer = setTimeout(endTurn, 5000);
      return;
    }
    safe(() => UI.Player.deselectAllUnits());
    GameContext.sendTurnComplete();
    emit("sent turn complete as player " + local);
  } catch (e) {
    emit("ENDTURN threw " + e);
  }
  endTurnTimer = setTimeout(endTurn, 20000);
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
      try { run(); } catch (e) { emit("run threw " + e + " " + (e && e.stack)); finish(); }
    }, 10000);
    return;
  }
  beginTries++;
  if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady());
  if (beginTries < 150) setTimeout(beginPoll, 2000);
  else { emit("LOAD gave up"); emit("DONE modtest4 finished"); }
}

emit("modtest-mp4 attached");
setTimeout(beginPoll, 3000);
