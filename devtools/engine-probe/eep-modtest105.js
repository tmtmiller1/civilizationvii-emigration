// eep-modtest105.js - lenses and the banner bar on 1.5.0, tested correctly at last.
//
// Two probe bugs, now fixed:
//   102/103 referenced a bare `LensManager`. It is an IMPORT, not a global, so it read undefined and the
//   "lens manager unreachable" verdict was about the probe, not the mod. It is imported here.
//   103 counted city-banner elements with the camera parked away from any city. Banners are created for
//   cities in view, and the bar's stylesheet is injected by the decorator when a banner attaches, so zero
//   banners means zero style and neither proves anything. This moves the camera onto a city first.
import LensManager from "/core/ui/lenses/lens-manager.js";

const TAG = "[EmigTest]";
const PROS = "emig-prosperity-lens", ETHN = "emig-ethnicity-lens";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { const v = fn(); return v === undefined ? fb : v; } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
const results = [];
function record(name, ok, detail) { results.push({ name, ok: !!ok }); emit((ok ? "PASS " : "FAIL ") + name + " :: " + J(detail)); }

function lensChecks() {
  record("LensManager imported", !!LensManager, { type: typeof LensManager });
  safe(() => LensManager.setActiveLens(PROS));
  const active = safe(() => LensManager.getActiveLens && LensManager.getActiveLens(), "?");
  record("prosperity lens active for the shot", active === PROS, { active });
}

function bannerChecks(done) {
  const pid = safe(() => GameContext.localPlayerID, -1);
  const cities = safe(() => Players.get(pid).Cities.getCities(), []);
  if (!cities.length) { record("local cities exist", false, "none"); return done(); }
  const loc = safe(() => cities[0].location, null);
  const name = safe(() => Locale.compose(cities[0].name), "?");
  record("local cities exist", true, { count: cities.length, first: name, loc });
  safe(() => Camera.lookAtPlot(loc));
  // The camera settles and banners mount over the next few seconds; give it room before judging.
  setTimeout(() => {
    const banners = safe(() => Array.from(document.querySelectorAll("city-banner")), []);
    let withBar = 0;
    for (const b of banners) if (safe(() => !!b.querySelector(".emig-bpbar"), false)) withBar++;
    const styled = safe(() => !!document.getElementById("emigration-banner-pressure-style"), false);
    record("city banners in view", banners.length > 0, { banners: banners.length });
    // The decorator injects its stylesheet when a banner attaches. With banners present, the style is the
    // proof it ran; the bar itself only draws once a city has real pressure, so a 0 bar count is not a fault.
    record("banner decorator ran", banners.length > 0 && styled, { styleInstalled: styled, bannersWithBar: withBar });
    done();
  }, 16000);
}

function run() {
  emit("modtest105 start");
  safe(lensChecks);
  emit("SHOT lens_prosperity");
  safe(() => bannerChecks(() => {
    const pass = results.filter((r) => r.ok).length;
    emit("SUMMARY modtest105 " + pass + "/" + results.length + " checks OK");
    emit("FAILED: " + J(results.filter((r) => !r.ok).map((r) => r.name)));
    emit("SHOT banner_city");
    setTimeout(() => emit("DONE modtest105 finished"), 18000);
  }));
}

emit("modtest105 attached");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() {
  const st = loadStateName();
  if (st === "GameStarted") {
    setTimeout(() => { try { run(); } catch (e) { emit("run threw " + e + " " + (e && e.stack)); emit("DONE modtest105 finished"); } }, 12000);
    return;
  }
  beginTries++;
  if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady());
  if (beginTries < 90) setTimeout(beginPoll, 2000); else { emit("LOAD gave up"); emit("DONE modtest105 finished"); }
}
setTimeout(beginPoll, 3000);
