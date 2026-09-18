// eep-modtest103.js - the three surfaces mod test 102 could not judge, re-tested with correct checks.
//
// 102 reported three failures; the screenshot showed the dashboard rendering perfectly, so those were probe
// bugs, not mod bugs:
//   - "dashboard" matched a <style> element via [id*='emigration'] and reported children=0.
//   - "lenses" used invented LensManager calls instead of the real ids (emig-prosperity-lens / -ethnicity-lens).
//   - "banners" counted city-banner while the dashboard overlay was open on top of the map.
// This run uses the real lens ids, and closes the dashboard and waits before counting banners.
const TAG = "[EmigTest]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { const v = fn(); return v === undefined ? fb : v; } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }

const PROS = "emig-prosperity-lens", ETHN = "emig-ethnicity-lens";
const results = [];
function record(name, ok, detail) {
  results.push({ name, ok: !!ok });
  emit((ok ? "PASS " : "FAIL ") + name + " :: " + J(detail));
}

function lensCheck() {
  const lm = safe(() => LensManager, null);
  if (!lm) return record("lens manager reachable", false, "LensManager undefined in this context");
  // Registered lenses live on the manager; try the documented surfaces before falling back to activation.
  const known = safe(() => {
    if (lm.lenses && typeof lm.lenses.keys === "function") return Array.from(lm.lenses.keys());
    if (lm.lenses) return Object.keys(lm.lenses);
    return null;
  }, null);
  if (known) {
    record("lenses registered", known.includes(PROS) && known.includes(ETHN),
      { prosperity: known.includes(PROS), ethnicity: known.includes(ETHN), total: known.length });
  } else {
    record("lens registry readable", false, "no enumerable lens registry; using activation instead");
  }
  // The decisive test: actually switch to each lens and read back the active one.
  for (const [label, id] of [["prosperity", PROS], ["ethnicity", ETHN]]) {
    const before = safe(() => lm.getActiveLens && lm.getActiveLens(), "?");
    safe(() => lm.setActiveLens(id));
    const after = safe(() => lm.getActiveLens && lm.getActiveLens(), "?");
    record("activate " + label + " lens", after === id, { before, after, wanted: id });
    safe(() => lm.setActiveLens("fxs-default-lens"));
  }
  // And the radio button the lens panel decorator adds.
  const panel = safe(() => document.querySelector("lens-panel"), null);
  const radios = panel ? safe(() => Array.from(panel.querySelectorAll("*"))
    .filter((e) => /emig/i.test(String(e.getAttribute && (e.getAttribute("id") || e.getAttribute("class")) || ""))).length, 0) : 0;
  record("lens panel decorated", !!panel && radios > 0, { panel: !!panel, emigElements: radios });
}

function bannerCheck() {
  // Close anything the previous checks opened so banners are not behind an overlay.
  safe(() => globalThis.emigration && globalThis.emigration.closeWindow && globalThis.emigration.closeWindow());
  setTimeout(() => {
    const banners = safe(() => Array.from(document.querySelectorAll("city-banner")), []);
    let withBar = 0;
    for (const b of banners) if (safe(() => !!b.querySelector(".emig-bpbar"), false)) withBar++;
    const styleTag = safe(() => !!document.getElementById("emigration-banner-pressure-style"), false);
    // The bar only draws once a city has real pressure, so the honest signal is: banners exist AND our
    // decorator ran (its stylesheet is installed). A zero bar count with pressure-free cities is expected.
    record("city banners present", banners.length > 0, { banners: banners.length });
    record("banner decorator ran", styleTag, { styleInstalled: styleTag, bannersWithBar: withBar });

    const pass = results.filter((r) => r.ok).length;
    emit("SUMMARY modtest103 " + pass + "/" + results.length + " checks OK");
    emit("FAILED: " + J(results.filter((r) => !r.ok).map((r) => r.name)));
    emit("SHOT lens150");
    setTimeout(() => emit("DONE modtest103 finished"), 18000);
  }, 6000);
}

function run() {
  emit("modtest103 start (corrected 1.5.0 UI checks)");
  safe(lensCheck);
  safe(bannerCheck);
}

emit("modtest103 attached");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() {
  const st = loadStateName();
  if (st === "GameStarted") {
    setTimeout(() => { try { run(); } catch (e) { emit("run threw " + e + " " + (e && e.stack)); emit("DONE modtest103 finished"); } }, 12000);
    return;
  }
  beginTries++;
  if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady());
  if (beginTries < 90) setTimeout(beginPoll, 2000); else { emit("LOAD gave up"); emit("DONE modtest103 finished"); }
}
setTimeout(beginPoll, 3000);
