// eep-modtest99.js - watch the tuning resolve for the players actually in the save, through the mod's own
// per-player path (civTuning(pid)), not through the tables directly.
//
// This is the integration point the unit tests cannot reach: civTuning looks the profile up by the type string
// the ENGINE reports for that player. AugustusExp66 happens to contain the exact case the persona fix was for --
// player 8 is Chola led by LEADER_ASHOKA_ALT. Before the fix the roster folded _ALT onto the base leader while
// the runtime reported the _ALT type, so that player resolved to neutral. It must now carry the Devaraja profile
// (happinessPull 0.9, assimilationEase 0.85) and must NOT equal the base Ashoka profile.
// Player 4 is Norman, which still legitimately carries warRetention 1.4, and is the control: the England fix
// must not have disturbed it.
import { civTuning, BY_LEADER, BY_CIV } from "/emigration/ui/emigration-civ-tuning.js";
import { CIV_ROSTER, LEADER_ROSTER } from "/emigration/ui/emigration-civ-roster.js";

const TAG = "[EmigTest]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { const v = fn(); return v === undefined ? fb : v; } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }

function run() {
  emit("modtest99 start");
  let altSeen = 0, mismatches = 0;
  for (const p of safe(() => Players.getAlive(), [])) {
    const pid = p.id;
    const civ = safe(() => GameInfo.Civilizations.lookup(p.civilizationType).CivilizationType, "?");
    const lead = safe(() => GameInfo.Leaders.lookup(p.leaderType).LeaderType, "?");
    if (String(civ) === "CIVILIZATION_INDEPENDENT" || civ === "?") continue; // city-states carry no tuning
    const merged = safe(() => civTuning(pid), "ERR");
    emit("P " + pid + " " + String(civ).replace("CIVILIZATION_", "") + "/" + String(lead).replace("LEADER_", "")
      + " civRow=" + J(BY_CIV[civ] || "neutral") + " leaderRow=" + J(BY_LEADER[lead] || "neutral")
      + " => civTuning=" + J(merged));
    // The roster must contain every type the engine reports for a real player.
    if (!CIV_ROSTER.includes(civ) || !LEADER_ROSTER.includes(lead)) {
      mismatches++;
      emit("P !! " + pid + " engine type missing from roster: civ=" + civ + " lead=" + lead);
    }
    if (String(lead).endsWith("_ALT")) {
      altSeen++;
      const base = String(lead).replace(/_ALT$/, "");
      emit("ALT PERSONA player " + pid + " " + lead + " resolved=" + J(BY_LEADER[lead] || "neutral")
        + " base " + base + "=" + J(BY_LEADER[base] || "neutral")
        + " differ=" + (J(BY_LEADER[lead]) !== J(BY_LEADER[base])));
    }
  }
  emit("VERDICT altPersonaPlayers=" + altSeen + " rosterMismatches=" + mismatches);
  emit("SUMMARY modtest99 per-player tuning resolved in engine");
  emit("DONE modtest99 finished");
}

emit("modtest99 attached");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() {
  const st = loadStateName();
  if (st === "GameStarted") {
    setTimeout(() => { try { run(); } catch (e) { emit("run threw " + e + " " + (e && e.stack)); emit("DONE modtest99 finished"); } }, 10000);
    return;
  }
  beginTries++;
  if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady());
  if (beginTries < 90) setTimeout(beginPoll, 2000); else { emit("LOAD gave up"); emit("DONE modtest99 finished"); }
}
setTimeout(beginPoll, 3000);
