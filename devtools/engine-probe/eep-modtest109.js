// eep-modtest109.js - Are minor-power attacks visible to the mod AS minor-power attacks?
//
// The balance change in emigration-violence.js downgrades siege pressure when EVERY attacker is a minor power
// (city-state / Independent Power), and requires POSITIVE evidence to do it: we must be able to name the
// attackers. If a raiding Independent Power cannot be named, the set comes back empty, the city is scored as a
// major invasion, and the downgrade never fires for the exact case it was written for.
//
// Nothing here is answerable by reading code. Three separate things could each break it, so each is read
// directly off the running game:
//
//   Q1. Does Players.getAlive() even ENUMERATE Independent Powers? engineWarOpponents only tests ids that come
//       out of that call, so an IP missing from it is never asked about, no matter what isAtWarWith would say.
//   Q2. Does Diplomacy.isAtWarWith(ip) report true for a hostile Independent Power? Scanned over ALL guarded
//       ids, not just the alive list, so Q1 and Q2 are separable rather than confounded.
//   Q3. When a city is besieged, does a district actually go contested (d.owner !== d.controllingPlayer)?
//       That is the only place the engine NAMES an attacker, and the new fallback depends on it.
//
// The verdict line to read is VERDICT: it prints, per besieged city, whether warOpponents and besiegingPlayers
// could name anybody, which is exactly the input facesOnlyMinors() consumes.
//
// Ids are always guarded through Players.get first: passing an invalid player id into the engine APIs
// segfaults the game (Game.IndependentPowers.independentName(99), 2026-09-05).
import { warOpponents } from "/emigration/ui/emigration-war.js";
import { besiegingPlayers } from "/emigration/ui/emigration-violence-signals.js";

const TAG = "[EmigTest]";
const TURNS = 8;
const MAX_PID = 64;
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { const v = fn(); return v === undefined ? fb : v; } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }

let local = -1, n = 0, endTurnTimer = null, blockedTries = 0, done = false;

/** @returns {*} A player object, or null - never let an unguarded id reach an engine API. */
function player(pid) { return safe(() => Players.get(pid), null); }

/** How the engine classifies a player, in the same terms isMinor() in the mod uses. */
function kindOf(p) {
  if (!p) return "?";
  const major = safe(() => p.isMajor, undefined);
  const minor = safe(() => p.isMinor, undefined);
  const indep = safe(() => p.isIndependent, undefined);
  return "major=" + major + " minor=" + minor + " indep=" + indep;
}

/** Q1: exactly which ids Players.getAlive() hands back, and what each one is. */
function reportAliveRoster() {
  const alive = safe(() => Players.getAlive(), null);
  if (!alive) { emit("Q1 getAlive UNREADABLE"); return; }
  const rows = [];
  for (const p of alive) {
    const id = typeof p === "number" ? p : safe(() => p.id, null);
    const obj = typeof p === "number" ? player(p) : p;
    rows.push(id + "{" + kindOf(obj) + "}");
  }
  emit("Q1 getAlive n=" + rows.length + " " + rows.join(" "));
}

/**
 * Q2: scan EVERY guarded id, not just the alive list, so "the IP is not enumerated" and "the IP is not at war"
 * are told apart. Prints every id the local player is at war with, plus every minor that exists at all.
 */
function reportWarScan() {
  const d = safe(() => Players.get(local)?.Diplomacy, null);
  const hasTest = !!d && typeof d.isAtWarWith === "function";
  const atWar = [], minors = [], aliveSet = new Set();
  for (const p of safe(() => Players.getAlive(), []) || []) {
    const id = typeof p === "number" ? p : safe(() => p.id, null);
    if (typeof id === "number") aliveSet.add(id);
  }
  for (let pid = 0; pid < MAX_PID; pid++) {
    const p = player(pid);
    if (!p) continue;
    const isMinor = safe(() => p.isMajor, true) === false || safe(() => p.isMinor, false) === true;
    if (isMinor) minors.push(pid + (aliveSet.has(pid) ? "" : "!notAlive"));
    if (hasTest && safe(() => d.isAtWarWith(pid), false)) {
      atWar.push(pid + "{" + kindOf(p) + (aliveSet.has(pid) ? "" : " NOT-IN-getAlive") + "}");
    }
  }
  emit("Q2 hasIsAtWarWith=" + hasTest + " atWarWith=[" + atWar.join(" ") + "]");
  emit("Q2 minorsExisting=[" + minors.join(" ") + "]");
}

/** Q3 + the verdict: for every own city, what the two attacker-identity sources actually return. */
function reportCities() {
  const cities = safe(() => Players.get(local).Cities.getCities(), []) || [];
  const pd = safe(() => Players.Districts.get(local), null);
  const foes = safe(() => [...(warOpponents(local) || [])], "ERR");
  let besiegedSeen = 0;
  for (const c of cities) {
    const name = safe(() => Locale.compose(c.name), "?");
    const loc = safe(() => c.location, null);
    const flag = pd && typeof pd.getDistrictIsBesieged === "function"
      ? safe(() => !!pd.getDistrictIsBesieged(loc), "ERR") : "no-api";
    const occupiers = safe(() => [...besiegingPlayers(c)], "ERR");
    const contested = Array.isArray(occupiers) && occupiers.length > 0;
    if (flag === true || contested) {
      besiegedSeen++;
      emit("Q3 BESIEGED '" + name + "' flag=" + flag + " contestedOccupiers=" + J(occupiers)
        + " warOpponents=" + J(foes));
      emit("VERDICT '" + name + "' canNameAttacker="
        + ((Array.isArray(foes) && foes.length > 0) || contested)
        + " viaWar=" + (Array.isArray(foes) ? foes.length : "ERR")
        + " viaDistrict=" + (Array.isArray(occupiers) ? occupiers.length : "ERR"));
    }
  }
  emit("Q3 cities=" + cities.length + " besieged=" + besiegedSeen + " warOpponents=" + J(foes));
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
        safe(() => { Autoplay.setTurns(1); Autoplay.setReturnAsPlayer(local); Autoplay.setObserveAsPlayer(local); Autoplay.setActive(true); });
        blockedTries = 0; endTurnTimer = setTimeout(endTurn, 30000); return;
      }
      endTurnTimer = setTimeout(endTurn, 4000); return;
    }
    safe(() => UI.Player.deselectAllUnits()); GameContext.sendTurnComplete();
  } catch (e) { emit("ENDTURN threw " + e); }
  endTurnTimer = setTimeout(() => { if (safe(() => Players.get(local).isTurnActive, false) && !GameContext.hasSentTurnComplete()) endTurn(); }, 12000);
}

function finish() {
  if (done) return;
  done = true;
  if (endTurnTimer) clearTimeout(endTurnTimer);
  emit("FINAL sweep");
  reportAliveRoster(); reportWarScan(); reportCities();
  setTimeout(() => emit("DONE modtest109 finished"), 4000);
}

function run() {
  local = safe(() => GameContext.localPlayerID, -1);
  emit("modtest109 run local=" + local);
  reportAliveRoster(); reportWarScan(); reportCities();
  setTimeout(endTurn, 3000);
}

engine.on("PlayerTurnActivated", (d) => {
  const who = d && (d.player ?? d.Player);
  if (who !== GameContext.localPlayerID || local < 0 || done) return;
  if (endTurnTimer) { clearTimeout(endTurnTimer); endTurnTimer = null; }
  n++; blockedTries = 0;
  setTimeout(() => {
    emit("T n=" + n);
    reportWarScan(); reportCities();
    if (n >= TURNS) { finish(); return; }
    setTimeout(endTurn, 2000);
  }, 5000);
});

emit("modtest109 attached");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() {
  const st = loadStateName();
  if (st === "GameStarted") {
    setTimeout(() => { try { run(); } catch (e) { emit("run threw " + e + " " + (e && e.stack)); emit("DONE modtest109 finished"); } }, 12000);
    return;
  }
  beginTries++;
  if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady());
  if (beginTries < 90) setTimeout(beginPoll, 2000); else { emit("LOAD gave up"); emit("DONE modtest109 finished"); }
}
setTimeout(beginPoll, 3000);
