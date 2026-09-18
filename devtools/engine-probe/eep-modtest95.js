// eep-modtest95.js - watch the roster/tuning/text work of 2026-09-16 in a real engine.
// Everything here is checkable in ANY save, so it runs on AugustusExp66 and ends without advancing a turn:
//  A. The mod's CIV_ROSTER/LEADER_ROSTER against the types the ENGINE actually loaded (the whole point of
//     regenerating from the install rather than a pinned snapshot).
//  B. The Ottoman key fix: IMPROVEMENT_EMIG_ENCLAVE_OTTOMANS_A must exist and the old singular must NOT.
//  C. The five civilizations added with the roster: enclave improvements loaded, quarter data resolves.
//  D. Text: every new LOC row composes to real text, not back to its own tag (the engine is the only place
//     that proves the rows actually loaded).
//  E. Tuning resolves for the new leaders and civilizations, and England is no longer carrying Norman retention.
//  F. The live players in this save: their engine-reported types must be roster keys.
import { CIV_ROSTER, LEADER_ROSTER } from "/emigration/ui/emigration-civ-roster.js";
import { BY_CIV, BY_LEADER } from "/emigration/ui/emigration-civ-tuning.js";
import { QUARTER_BONUSES, quarterBonus, quarterQuote, quarterQuoteKey, quoteDisplay, renderableLine }
  from "/emigration/ui/emigration-quarter-bonuses.js";
import { DISPLACED_QUOTES, pickDisplacedQuote, displacedQuoteKey } from "/emigration/ui/emigration-displaced-quotes.js";
import { enclaveTypeFor } from "/emigration/ui/emigration-enclave-place.js";

const TAG = "[EmigTest]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { const v = fn(); return v === undefined ? fb : v; } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }

const NEW_CIVS = ["CIVILIZATION_BABYLON", "CIVILIZATION_ENGLAND", "CIVILIZATION_GAUL",
  "CIVILIZATION_GORYEO", "CIVILIZATION_JOSEON"];
const NEW_LEADERS = ["LEADER_WASHINGTON", "LEADER_ELIZABETH", "LEADER_YI_SUN_SIN", "LEADER_ASHOKA_ALT",
  "LEADER_XERXES_ALT", "LEADER_NAPOLEON_ALT", "LEADER_HIMIKO_ALT", "LEADER_FRIEDRICH_ALT"];

/** Every type the engine loaded for a table, via GameInfo with a Database fallback. */
function engineTypes(table, col) {
  let out = safe(() => Array.from(GameInfo[table]).map((r) => r[col]).filter(Boolean), null);
  if (out && out.length) return out;
  out = safe(() => Database.query("gameplay", "select " + col + " from " + table).map((r) => r[col]), null);
  return out || [];
}

function checkRoster() {
  const civs = engineTypes("Civilizations", "CivilizationType");
  const leaders = engineTypes("Leaders", "LeaderType");
  emit("A engine loaded civs=" + civs.length + " leaders=" + leaders.length);
  const skipC = /^(CIVILIZATION_INDEPENDENT|CIVILIZATION_NONE|CIVILIZATION_PLACEHOLDER)/;
  const skipL = /^(LEADER_DEFAULT|LEADER_INDEPENDENT|LEADER_MINOR_CIV)/;
  const realC = civs.filter((c) => !skipC.test(c));
  const realL = leaders.filter((l) => !skipL.test(l));
  const missC = realC.filter((c) => !CIV_ROSTER.includes(c));
  const missL = realL.filter((l) => !LEADER_ROSTER.includes(l));
  const ghostC = CIV_ROSTER.filter((c) => !civs.includes(c));
  const ghostL = LEADER_ROSTER.filter((l) => !leaders.includes(l));
  emit("A ROSTER civs engine=" + realC.length + " missingFromMod=" + J(missC) + " inModNotEngine=" + J(ghostC));
  emit("A ROSTER leaders engine=" + realL.length + " missingFromMod=" + J(missL) + " inModNotEngine=" + J(ghostL));
  for (const want of ["CIVILIZATION_OTTOMANS", "CIVILIZATION_ENGLAND", "CIVILIZATION_BABYLON"]) {
    emit("A engine has " + want + "=" + civs.includes(want) + " modRoster=" + CIV_ROSTER.includes(want));
  }
  for (const want of ["LEADER_WASHINGTON", "LEADER_ELIZABETH", "LEADER_GILGAMESH", "LEADER_XERXES_ALT"]) {
    emit("A engine has " + want + "=" + leaders.includes(want) + " modRoster=" + LEADER_ROSTER.includes(want));
  }
}

function loaded(type) { return safe(() => (GameInfo.Constructibles.lookup(type) ? true : false), "ERR"); }

function checkEnclaves() {
  emit("B OTTOMANS_A loaded=" + loaded("IMPROVEMENT_EMIG_ENCLAVE_OTTOMANS_A")
    + " OTTOMANS_B=" + loaded("IMPROVEMENT_EMIG_ENCLAVE_OTTOMANS_B")
    + " old singular OTTOMAN_A=" + loaded("IMPROVEMENT_EMIG_ENCLAVE_OTTOMAN_A"));
  emit("B enclaveTypeFor(OTTOMANS,a)=" + J(enclaveTypeFor("CIVILIZATION_OTTOMANS", "a")));
  for (const civ of NEW_CIVS) {
    const t = enclaveTypeFor(civ, "a");
    emit("C " + civ + " enclave=" + t + " loaded=" + loaded(t) + " quarterRow=" + (QUARTER_BONUSES[civ] ? "yes" : "NO"));
  }
}

/** A LOC row that never loaded composes back to its own tag. */
function composed(key) {
  const v = safe(() => Locale.compose(key), "ERR");
  return { key, ok: typeof v === "string" && v.length > 0 && v !== key && !/^LOC_/.test(v), text: String(v).slice(0, 90) };
}

function checkText() {
  let bad = 0;
  for (const civ of NEW_CIVS) {
    const short = civ.replace("CIVILIZATION_", "");
    for (const id of ["A", "B"]) {
      for (const k of ["LOC_EMIG_QTR_WHY_" + short + "_" + id, "LOC_EMIG_QTR_Q_" + short + "_" + id]) {
        const r = composed(k);
        if (!r.ok) { bad++; emit("D TEXT MISSING " + k + " -> " + J(r.text)); }
      }
    }
  }
  emit("D new quarter rows: " + (bad ? bad + " FAILED" : "all composed"));
  // The Ottoman rows were renamed with the key, so they are the ones most likely to have gone missing.
  for (const k of ["LOC_EMIG_QTR_WHY_OTTOMANS_A", "LOC_EMIG_QTR_Q_OTTOMANS_A", "LOC_EMIG_QTR_LABEL_GAUL_A"]) {
    emit("D " + k + " -> " + J(composed(k).text));
  }
  // Displaced rows for the civilizations that just gained them.
  for (const civ of ["CIVILIZATION_BABYLON", "CIVILIZATION_GORYEO", "CIVILIZATION_JOSEON",
    "CIVILIZATION_ENGLAND", "CIVILIZATION_GAUL", "CIVILIZATION_NEPAL", "CIVILIZATION_OTTOMANS"]) {
    const row = DISPLACED_QUOTES[civ];
    if (!row) { emit("D " + civ + " has no displaced row"); continue; }
    for (const kind of ["refugee", "migrant"]) {
      if (!row[kind]) continue;
      const key = displacedQuoteKey(civ, kind, 0);
      const r = composed(key);
      emit("D " + civ + "/" + kind + " " + (r.ok ? "composed" : "MISSING") + " " + J(r.text));
    }
  }
}

function checkRender() {
  // What a player actually sees: the pick, through the font guard.
  for (const civ of ["CIVILIZATION_NEPAL", "CIVILIZATION_GORYEO", "CIVILIZATION_JOSEON",
    "CIVILIZATION_BABYLON", "CIVILIZATION_ENGLAND", "CIVILIZATION_GAUL", "CIVILIZATION_MAURYA"]) {
    for (const kind of ["refugee", "migrant"]) {
      const pick = safe(() => pickDisplacedQuote(civ, kind, "seed-95"), null);
      if (!pick) continue;
      const line = safe(() => renderableLine(Locale.compose(pick.key, "")) || renderableLine(quoteDisplay(pick.quote)), "ERR");
      emit("D RENDER " + civ.replace("CIVILIZATION_", "") + "/" + kind + " " + J(String(line).slice(0, 120)));
    }
  }
  for (const civ of NEW_CIVS) {
    const b = safe(() => quarterBonus(civ), null);
    const q = safe(() => quarterQuote(civ, "a"), null);
    const shown = q ? safe(() => renderableLine(Locale.compose(quarterQuoteKey(civ, "a"), "")), "ERR") : "(none)";
    emit("C QUARTER " + civ.replace("CIVILIZATION_", "") + " demonym=" + J(b && b.demonym)
      + " opts=" + (b && b.options ? b.options.length : 0) + " quote=" + J(String(shown).slice(0, 100)));
  }
}

function checkTuning() {
  for (const l of NEW_LEADERS) emit("E LEADER " + l.replace("LEADER_", "") + " = " + J(BY_LEADER[l] || "neutral"));
  for (const c of NEW_CIVS) emit("E CIV " + c.replace("CIVILIZATION_", "") + " = " + J(BY_CIV[c] || "neutral"));
  emit("E ENGLAND no longer Norman-tuned: " + J(BY_CIV.CIVILIZATION_ENGLAND || "neutral")
    + " | NORMAN still = " + J(BY_CIV.CIVILIZATION_NORMAN));
  for (const [b, a] of [["LEADER_ASHOKA", "LEADER_ASHOKA_ALT"], ["LEADER_HIMIKO", "LEADER_HIMIKO_ALT"],
    ["LEADER_XERXES", "LEADER_XERXES_ALT"], ["LEADER_NAPOLEON", "LEADER_NAPOLEON_ALT"]]) {
    emit("E PERSONA " + b.replace("LEADER_", "") + "=" + J(BY_LEADER[b] || "neutral")
      + " vs ALT=" + J(BY_LEADER[a] || "neutral"));
  }
}

function checkLivePlayers() {
  const rows = safe(() => Players.getAlive().map((p) => {
    const civ = safe(() => p.civilizationType, "?");
    const lead = safe(() => p.leaderType, "?");
    const cn = safe(() => GameInfo.Civilizations.lookup(civ).CivilizationType, String(civ));
    const ln = safe(() => GameInfo.Leaders.lookup(lead).LeaderType, String(lead));
    return { id: p.id, civ: cn, lead: ln, inCiv: CIV_ROSTER.includes(cn), inLead: LEADER_ROSTER.includes(ln) };
  }), []);
  emit("F live players=" + rows.length);
  for (const r of rows) emit("F  " + J(r));
  const off = rows.filter((r) => !r.inCiv || !r.inLead);
  emit("F players whose engine type is NOT a roster key: " + off.length + " " + J(off.map((r) => r.civ + "/" + r.lead)));
}

function run() {
  emit("modtest95 start");
  safe(checkRoster);
  safe(checkEnclaves);
  safe(checkText);
  safe(checkRender);
  safe(checkTuning);
  safe(checkLivePlayers);
  emit("SUMMARY modtest95 roster+ottoman+newcivs+text+tuning checked in engine");
  emit("DONE modtest95 finished");
}

emit("modtest95 attached");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() {
  const st = loadStateName();
  if (st === "GameStarted") {
    setTimeout(() => { try { run(); } catch (e) { emit("run threw " + e + " " + (e && e.stack)); emit("DONE modtest95 finished"); } }, 10000);
    return;
  }
  beginTries++;
  if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady());
  if (beginTries < 90) setTimeout(beginPoll, 2000); else { emit("LOAD gave up"); emit("DONE modtest95 finished"); }
}
setTimeout(beginPoll, 3000);
