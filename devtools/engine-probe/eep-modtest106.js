// eep-modtest106.js - why has the banner pressure bar NEVER been seen?
//
// Reported by the player: not once, in any run. That is evidence of a defect, not of quiet cities, so this
// probes the DATA path independently of the DOM (the probe cannot see city-banner elements anyway).
//
// Already disproved statically, so this run does not re-test them:
//   - the module is wired into the modinfo and `bannerPressureBar` defaults to 1 (while pressure builds);
//   - `.city-banner__container`, which _mount() requires, really does exist in the 1.5.0 banner markup;
//   - the cache key and the banner lookup key are built identically (owner + ":" + (localId ?? id)).
//
// What is left: the snapshot cache, the pressure values themselves, and barModel's verdict. If snapshots
// come back empty, the bar can never show (barModel returns hidden for a missing snapshot even in ALWAYS
// mode). If they are present but every pressureToBar sits under SHOW_FROM (0.05) with nothing at risk, then
// the bar is working as designed and simply never has anything to draw -- which for a player is the same
// thing as broken, and is worth knowing precisely.
import { ownerCitySnapshots } from "/emigration/ui/emigration-city-readout-data.js";
import { barModel, cityKeyOfBanner, SHOW_FROM, BAR_MODE } from "/emigration/ui/emigration-banner-pressure.js";
import { CONFIG } from "/emigration/ui/emigration-config.js";

const TAG = "[EmigTest]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { const v = fn(); return v === undefined ? fb : v; } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }

function run() {
  emit("modtest106 start");
  emit("CONFIG bannerPressureBar=" + J(CONFIG.bannerPressureBar) + " SHOW_FROM=" + SHOW_FROM
    + " attritionMinDistress=" + J(CONFIG.attritionMinDistress));

  const pid = safe(() => GameContext.localPlayerID, -1);
  const snaps = safe(() => ownerCitySnapshots(pid), []);
  emit("SNAPSHOTS pid=" + pid + " count=" + (snaps ? snaps.length : "ERR"));
  if (!snaps || !snaps.length) {
    emit("VERDICT snapshot cache is EMPTY -> barModel returns hidden for every banner, in every mode");
    emit("DONE modtest106 finished");
    return;
  }

  // Do the keys the cache stores match what a banner would look up?
  const cities = safe(() => Players.get(pid).Cities.getCities(), []);
  const bannerKeys = cities.map((c) => safe(() => cityKeyOfBanner(c), "ERR"));
  const snapKeys = snaps.map((s) => s.cityKey);
  const matched = bannerKeys.filter((k) => k && snapKeys.includes(k)).length;
  emit("KEYS cities=" + cities.length + " bannerKeysOk=" + bannerKeys.filter((k) => k && k !== "ERR").length
    + " snapKeys=" + snapKeys.length + " matched=" + matched);
  emit("KEYS sample banner=" + J(bannerKeys.slice(0, 3)) + " snap=" + J(snapKeys.slice(0, 3)));

  // What would each banner actually draw, in the shipped mode and in ALWAYS?
  let visShipped = 0, visAlways = 0, atRisk = 0;
  const top = [];
  for (const s of snaps) {
    const mShip = safe(() => barModel(s, { mode: CONFIG.bannerPressureBar, lethalDistress: CONFIG.attritionMinDistress }), null);
    const mAlways = safe(() => barModel(s, { mode: BAR_MODE.ALWAYS, lethalDistress: CONFIG.attritionMinDistress }), null);
    if (mShip && mShip.visible) visShipped++;
    if (mAlways && mAlways.visible) visAlways++;
    if (s.atRisk) atRisk++;
    top.push({ key: s.cityKey, name: safe(() => Locale.compose(s.name), s.name), p: Number(s.pressureToBar || 0),
      cause: s.cause, atRisk: !!s.atRisk, vis: !!(mShip && mShip.visible), tier: mShip && mShip.tier });
  }
  top.sort((a, b) => b.p - a.p);
  emit("PRESSURE highest 6: " + J(top.slice(0, 6)));
  emit("COUNTS cities=" + snaps.length + " atRisk=" + atRisk
    + " visibleShippedMode=" + visShipped + " visibleAlwaysMode=" + visAlways
    + " overSHOW_FROM=" + top.filter((t) => t.p >= SHOW_FROM).length);

  if (visShipped === 0 && visAlways === snaps.length) {
    emit("VERDICT data is fine; no city reaches SHOW_FROM (" + SHOW_FROM + "). The bar is working as designed"
      + " and simply has nothing to draw in the shipped mode. ALWAYS mode would draw an empty track on all "
      + snaps.length + " cities.");
  } else if (visShipped === 0 && visAlways === 0) {
    emit("VERDICT BROKEN: even ALWAYS mode draws nothing, so snapshots or barModel are at fault, not pressure.");
  } else {
    emit("VERDICT " + visShipped + " of " + snaps.length + " cities WOULD show a bar right now in the shipped mode.");
  }
  emit("DONE modtest106 finished");
}

emit("modtest106 attached");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() {
  const st = loadStateName();
  if (st === "GameStarted") {
    setTimeout(() => { try { run(); } catch (e) { emit("run threw " + e + " " + (e && e.stack)); emit("DONE modtest106 finished"); } }, 12000);
    return;
  }
  beginTries++;
  if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady());
  if (beginTries < 90) setTimeout(beginPoll, 2000); else { emit("LOAD gave up"); emit("DONE modtest106 finished"); }
}
setTimeout(beginPoll, 3000);
