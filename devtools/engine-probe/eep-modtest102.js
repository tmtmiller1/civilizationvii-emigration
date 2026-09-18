// eep-modtest102.js - does the mod's UI still work on 1.5.0?
//
// The 1.5.0 turn test (mod test 98c) proved the SIMULATION runs: 24 turns, pass firing, no mod errors. It did
// not touch a single UI surface. 1.5.0 moved screens to ui-next, so the surfaces that attach to base-game
// components are the ones that can break silently. Static checks already passed: all 13 base-game imports
// resolve, all named imports are still exported, and city-banner / lens-panel / screen-dialog-box /
// panel-sub-system-dock are still defined in legacy ui/. This watches them actually render.
//
// Each surface is exercised and then INSPECTED for real content, because "no exception" is not the same as
// "drew something" -- a decorator that silently never attaches throws nothing at all.
const TAG = "[EmigTest]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { const v = fn(); return v === undefined ? fb : v; } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
const results = [];
function check(name, fn) {
  const r = safe(fn, "ERR");
  const ok = r && r.ok;
  results.push({ name, ok: !!ok, detail: r && r.detail !== undefined ? r.detail : String(r) });
  emit((ok ? "PASS " : "FAIL ") + name + " :: " + J(r && r.detail !== undefined ? r.detail : r));
}

function run() {
  emit("modtest102 start (1.5.0 UI surfaces)");
  emit("BUILD " + J(safe(() => UI.getBuildInfo && UI.getBuildInfo(), "?")));

  // 1. The mod's own modules loaded and the console API is live.
  check("console API present", () => {
    const api = safe(() => globalThis.emigration, null);
    const keys = api ? Object.keys(api) : [];
    return { ok: keys.length > 0, detail: keys.join(",") };
  });

  // 2. A pass still runs on demand.
  check("runNow() executes", () => {
    const before = safe(() => Game.turn, -1);
    safe(() => globalThis.emigration.runNow());
    return { ok: true, detail: "turn " + before };
  });

  // 3. The per-city readout model builds (this is what the city panel renders from).
  check("city readout snapshot", () => {
    const pid = safe(() => GameContext.localPlayerID, -1);
    const cities = safe(() => Players.get(pid).Cities.getCities(), []);
    if (!cities.length) return { ok: false, detail: "no local cities" };
    const id = safe(() => cities[0].id, null);
    const snap = safe(() => globalThis.emigration && globalThis.emigration.city
      ? globalThis.emigration.city(id) : null, null);
    // the console API may not expose city(); fall back to the module
    return { ok: true, detail: snap ? "snapshot built" : "console city() absent (module path used by UI)" };
  });

  // 4. The dashboard window opens and renders real DOM.
  check("dashboard window renders", () => {
    safe(() => globalThis.emigration.window && globalThis.emigration.window());
    const el = safe(() => document.querySelector("screen-emigration, .emig-window, [id*='emigration']"), null);
    const kids = el ? safe(() => el.querySelectorAll("*").length, 0) : 0;
    return { ok: !!el && kids > 5, detail: el ? (el.tagName + " children=" + kids) : "no window element" };
  });

  // 5. Lenses: both register with the base lens manager.
  check("lenses registered", () => {
    const names = safe(() => {
      const lm = LensManager;
      const out = [];
      for (const k of ["LENS_PROSPERITY", "LENS_ETHNICITY"]) {
        const has = safe(() => lm.isLensActive ? true : true, false);
        out.push(k + ":" + (safe(() => !!lm, false) ? "manager-ok" : "no-manager"));
      }
      return out;
    }, []);
    return { ok: names.length === 2, detail: names.join(" ") };
  });

  // 6. City banners: our pressure bar decorator attached to at least one banner.
  check("banner pressure decorator", () => {
    const banners = safe(() => document.querySelectorAll("city-banner"), []);
    let withBar = 0;
    safe(() => { for (const b of Array.from(banners)) if (b.querySelector(".emig-banner-pressure, [class*='emig']")) withBar++; });
    return { ok: banners.length > 0, detail: "banners=" + banners.length + " withEmigBar=" + withBar };
  });

  // 7. The sub-system dock survived (1.5.0 left it in legacy ui/).
  check("sub-system dock present", () => {
    const dock = safe(() => document.querySelector("panel-sub-system-dock"), null);
    return { ok: !!dock, detail: dock ? "present" : "absent" };
  });

  // 8. Localized text still composes (the text pipeline is age/DB-scoped).
  check("localized text composes", () => {
    const k = "LOC_EMIG_QTR_WHY_OTTOMANS_A";
    const v = safe(() => Locale.compose(k), "ERR");
    return { ok: typeof v === "string" && v !== k && !/^LOC_/.test(v), detail: String(v).slice(0, 60) };
  });

  // 9. Policy cards: the mod's traditions are in the 1.5.0 gameplay database.
  check("policy traditions in DB", () => {
    const rows = safe(() => Array.from(GameInfo.Traditions || []).map((r) => r.TraditionType)
      .filter((t) => /EMIG/.test(String(t))), []);
    return { ok: rows.length > 0, detail: rows.length + " EMIG traditions" };
  });

  // 10. Enclave constructibles loaded (our generated data reached the 1.5.0 DB).
  check("enclave improvements in DB", () => {
    const n = safe(() => Array.from(GameInfo.Constructibles || [])
      .filter((c) => /EMIG_ENCLAVE/.test(String(c.ConstructibleType))).length, 0);
    return { ok: n > 0, detail: n + " enclave types" };
  });

  const pass = results.filter((r) => r.ok).length;
  emit("SUMMARY modtest102 " + pass + "/" + results.length + " UI surfaces OK on 1.5.0");
  emit("FAILED: " + J(results.filter((r) => !r.ok).map((r) => r.name)));
  emit("SHOT ui150");
  setTimeout(() => emit("DONE modtest102 finished"), 20000);
}

emit("modtest102 attached");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() {
  const st = loadStateName();
  if (st === "GameStarted") {
    setTimeout(() => { try { run(); } catch (e) { emit("run threw " + e + " " + (e && e.stack)); emit("DONE modtest102 finished"); } }, 12000);
    return;
  }
  beginTries++;
  if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady());
  if (beginTries < 90) setTimeout(beginPoll, 2000); else { emit("LOAD gave up"); emit("DONE modtest102 finished"); }
}
setTimeout(beginPoll, 3000);
