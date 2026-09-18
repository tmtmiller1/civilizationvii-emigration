// eep-modtest88.js - does the game's text loader strip leading/trailing whitespace from localized strings? Mod test
// 85 showed the Prosperity panel's title as "London· this tile" although the en_us row is " · this tile" WITH a
// leading space. The mod has ten rows whose edge spaces are load-bearing, concatenated onto other text (" and ",
// " ({1_Flag})", " (rival civilization)", " · this tile", "{1_Name} strikes! "), and today's locale work restored
// those spaces in all eleven languages on the assumption they survive. This logs what Locale.compose actually
// returns, JSON-quoted so the spaces are visible. AugustusExp66, mod pass off, no turns.
import { CONFIG } from "/emigration/ui/emigration-config.js";

const TAG = "[EmigTest]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function later(ms) { return new Promise((r) => setTimeout(r, ms)); }

// Every mod row whose value carries a meaningful edge space, plus two controls with none.
const EDGE_KEYS = [
  "LOC_EMIG_PROS_TILE_SUFFIX", "LOC_EMIG_LIST_AND", "LOC_EMIG_CF_FLAG_PAREN", "LOC_EMIG_CF_EVENT_BOTH",
  "LOC_EMIG_RO_ORIGINS_MORE", "LOC_EMIG_RO_STATUS_RESTING", "LOC_EMIG_RO_STATUS_TO_MOVE", "LOC_EMIG_RO_RIVAL_CIV",
  "LOC_EMIG_ETH_TILE_SUFFIX", "LOC_EMIG_DISASTER_STRIKES", "LOC_EMIG_DISASTER_STRIKES_AT"
];
const CONTROL_KEYS = ["LOC_EMIG_PROS_TIER_AVG", "LOC_EMIG_PROS_TILE_BEST"];

async function run() {
  CONFIG.turnInterval = 99999;
  await later(2000);
  const rows = [];
  for (const k of EDGE_KEYS.concat(CONTROL_KEYS)) {
    const composed = safe(() => Locale.compose(k), "threw");
    rows.push({ key: k.replace("LOC_EMIG_", ""), got: composed, lead: /^\s/.test(String(composed)), trail: /\s$/.test(String(composed)) });
  }
  emit("TRIM " + J(rows));
  const kept = rows.filter((r) => r.lead || r.trail).length;
  emit("VERDICT rows with an edge space surviving: " + kept + " of " + EDGE_KEYS.length +
    " (0 = the loader trims and code must add its own separators)");
  // A composed string with an argument, to see whether the trim also hits substituted text.
  emit("ARG " + J(safe(() => Locale.compose("LOC_EMIG_RO_ORIGINS_MORE", 3), "threw")));
  emit("DONE modtest88 finished");
}

emit("modtest88 attached");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() {
  const st = loadStateName();
  if (st === "GameStarted") { setTimeout(() => { run().catch((e) => { emit("run threw " + e); emit("DONE modtest88 finished"); }); }, 10000); return; }
  beginTries++;
  if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady());
  if (beginTries < 90) setTimeout(beginPoll, 2000); else emit("LOAD gave up");
}
setTimeout(beginPoll, 3000);
