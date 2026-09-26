// eep-modtest143.js - two things in one session, no turns played.
//
// 1. Retake the Ethnic Composition lens shots for the Steam page. The lens now seats a community that has an
//    enclave ON the enclave's tile and caps every other tile at the enclave share, so the old close shot (a plain
//    tile reading "Norman 92%" while the real enclave stood elsewhere) shows the defect that was fixed. Frame an
//    enclave tile, point the lens readout at it, and log the per-tile shares of the host settlement so the log says
//    numerically what the picture shows.
//      SHOT lens-ethnic-close   close on the enclave tile, lens on, readout on the enclave tile
//      SHOT lens-ethnic-wide    the same lens over the region
//
// 2. First in-game look at the rebuilt Civilopedia section. The chaptered pages carry no paragraph rows: the pedia
//    is expected to find their text by key convention (model-civilopedia.js getChapterBody). Open the pedia, go to
//    each page, and read the RENDERED DOM: the chapter headers drawn, every paragraph element's key, and whether its
//    text resolved. A page that failed the convention path draws a title and nothing else.
//      SHOT pedia-<page>
//
// The only setting touched is the analytics visibility override (show every civilization, as mod test 142 did for
// the Steam shots); it is snapshotted first and written back in finish().
import LensManager from "/core/ui/lenses/lens-manager.js";
import PlotCursor from "/core/ui/input/plot-cursor.js";
// Not a global in a UI script (run 1 of this test: the push threw inside safe() and the screen never opened).
import { ContextManager } from "/core/ui/context-manager/context-manager.js";
import { instance as Pedia } from "/base-standard/ui/civilopedia/model-civilopedia.js";
import { getVisibilityOverride, setVisibilityOverride } from "/emigration/ui/emigration-settings.js";
import { diverseCityRanking } from "/emigration/ui/emigration-diversity.js";
import { allQuarterEntries } from "/emigration/ui/emigration-quarter-state.js";
import { tilesForCity } from "/emigration/ui/emigration-ethnicity-tiles.js";
import { civAdjective } from "/emigration/ui/emigration-naming.js";

const TAG = "[EmigTest]";
const HOLD = 15000; // the runner polls every 4 s; hold each framing well past a capture
const ETHN = "emig-ethnicity-lens";
const SECTION = "EMIGRATION";
// The intro, three chaptered pages, one generated Voices page and the pools, plus two single-body pages as a
// control (one untouched, one whose text was corrected in this change).
const PEDIA_PAGES = ["VOICES", "ARRIVALS", "CALLHOME", "POLICIES", "VOICES_ROME", "VOICES_POOL", "OVERVIEW", "DASHBOARD"];

function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o, (_k, v) => (v instanceof Map ? Object.fromEntries(v) : v)); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { const v = fn(); return v === undefined ? fb : v; } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function later(ms) { return new Promise((r) => setTimeout(r, ms)); }
const pct = (v) => Math.round((Number(v) || 0) * 100);

let local = -1, done = false, savedVis = null;

// ── the game's own pop-ups (Tech Unlocked covered mod test 142's first lens shots) ───────────────────────────
async function dismissPopups() {
  for (let i = 0; i < 6; i++) {
    const open = safe(() => Array.from(document.querySelectorAll("*")).filter((e) => /^SCREEN-/.test(e.tagName)
      && e.tagName !== "SCREEN-EMIGRATION" && e.tagName !== "SCREEN-CIVILOPEDIA"
      && e.querySelector("fxs-button, fxs-hero-button")), []);
    const dialogs = safe(() => Array.from(document.querySelectorAll("screen-dialog-box")), []);
    if (!open.length && !dialogs.length) return;
    for (const e of [...open, ...dialogs]) {
      emit("POPUP dismissing " + e.tagName.toLowerCase());
      const btns = Array.from(e.querySelectorAll("fxs-button, fxs-hero-button"));
      safe(() => btns[btns.length - 1].dispatchEvent(new CustomEvent("action-activate", { bubbles: true })));
    }
    await later(2500);
  }
}

// ── enclave + host settlement ────────────────────────────────────────────────────────────────────────────────
function allCities() {
  return safe(() => Players.getAlive().flatMap((p) => safe(() => p.Cities.getCities() || [], [])), []);
}
function cityAtKey(key) {
  return allCities().find((c) => safe(() => c.location.x + "," + c.location.y) === key) || null;
}
const seen = (x, y) => safe(() => GameplayMap.getRevealedState(local, x, y) !== RevealedStates.HIDDEN, false);

function pickEnclave() {
  const ranking = safe(() => diverseCityRanking({}, 60), []);
  const rank = (name) => { const i = ranking.findIndex((r) => r.name === name); return i < 0 ? 999 : i; };
  const rows = [];
  for (const { tileKey, rec } of safe(() => allQuarterEntries(), [])) {
    const city = cityAtKey(tileKey);
    const plot = rec && rec.placed ? rec.placed.plot : null;
    const at = typeof plot === "number" ? safe(() => GameplayMap.getLocationFromIndex(plot), null) : null;
    const name = city ? safe(() => Locale.compose(city.name), "?") : "?";
    rows.push({
      city, at, name,
      origin: safe(() => civAdjective(rec.civ), String(rec.originCiv)),
      owner: rec.owner, recognized: !!rec.recognized, contested: !!rec.contested,
      type: rec.placed ? rec.placed.type : null,
      revealed: !!(at && seen(at.x, at.y)), rank: rank(name)
    });
  }
  emit("ENCLAVES " + rows.length + " " + J(rows.map((r) => ({ city: r.name, origin: r.origin, owner: r.owner, at: r.at,
    recognized: r.recognized, contested: r.contested, type: r.type, revealed: r.revealed, diversityRank: r.rank }))));
  const ok = rows.filter((r) => r.city && r.at && r.revealed).sort((a, b) => a.rank - b.rank);
  return ok[0] || null;
}

/** Every tile of the host with its local mix, the enclave tile marked, so the log states what the lens paints. */
function logTiles(pick) {
  const t = safe(() => tilesForCity(pick.city), null);
  if (!t || !t.tiles) { emit("TILES none for " + pick.name); return; }
  const nameOf = (civ) => safe(() => civAdjective(civ), String(civ));
  const rows = t.tiles.map((p) => {
    const mix = (p.shares || []).slice(0, 3).map((s) => nameOf(s.civ ?? s.origin ?? s.id) + " " + pct(s.share ?? s.value) + "%").join(", ");
    const mark = pick.at && p.x === pick.at.x && p.y === pick.at.y ? " <-- ENCLAVE" : "";
    return `(${p.x},${p.y}) people=${Math.round(p.people || 0)} density=${Math.round((p.density || 0) * 100) / 100} ${mix}${mark}`;
  });
  emit("TILES " + pick.name + " origins=" + J(safe(() => t.comp.origins, null)));
  for (let i = 0; i < rows.length; i += 6) emit("TILES " + pick.name + " " + rows.slice(i, i + 6).join(" | "));
  if (t.tiles[0] && t.tiles[0].shares && t.tiles[0].shares[0]) emit("TILES share-fields " + J(Object.keys(t.tiles[0].shares[0])));
}

/** Point the plot cursor and the mouse at a plot, so the lens readout describes that tile. */
function hoverPlot(at) {
  safe(() => { PlotCursor.plotCursorCoords = { x: at.x, y: at.y }; });
  const uv = safe(() => WorldUI.getScreenPlotPos(at), null);
  if (uv && typeof uv.x === "number") {
    const x = Math.round(uv.x * window.innerWidth) + 12, y = Math.round(uv.y * window.innerHeight) + 12;
    safe(() => window.dispatchEvent(new MouseEvent("mousemove", { clientX: x, clientY: y, bubbles: true })));
    emit("HOVER plot " + J(at) + " pixel " + x + "," + y + " cursor=" + J(safe(() => PlotCursor.plotCursorCoords, null)));
  } else {
    emit("HOVER no screen position for " + J(at));
  }
}
/** The text of whichever lens readout panel is showing. */
function readoutText() {
  return safe(() => Array.from(document.querySelectorAll("div")).filter((d) => d.style && d.style.zIndex === "10001"
    && d.style.display !== "none").map((d) => d.textContent.replace(/\s+/g, " ").trim()).filter(Boolean).join(" || "), "");
}

async function shootLens() {
  const pick = pickEnclave();
  if (!pick) { emit("LENS no revealed enclave to frame"); return; }
  emit("LENS framing the " + pick.origin + " enclave of " + pick.name + " at " + J(pick.at));
  logTiles(pick);
  await dismissPopups();
  safe(() => Camera.lookAtPlot(pick.at, { zoom: 0.45 })); await later(12000);
  await dismissPopups();
  safe(() => LensManager.setActiveLens(ETHN)); await later(4000);
  emit("LENS active=" + safe(() => LensManager.getActiveLens()));
  hoverPlot(pick.at); await later(3000); hoverPlot(pick.at); await later(2000);
  emit("READOUT enclave tile: " + readoutText());
  emit("SHOT lens-ethnic-close"); await later(HOLD);

  // A plain tile of the same settlement, for the record: without an enclave there, the community's color is capped.
  const t = safe(() => tilesForCity(pick.city), null);
  const other = t && t.tiles ? t.tiles.find((p) => !(p.x === pick.at.x && p.y === pick.at.y) && (p.shares || []).length > 1) : null;
  if (other) { hoverPlot(other); await later(3000); emit("READOUT other tile " + J({ x: other.x, y: other.y }) + ": " + readoutText()); }

  safe(() => Camera.lookAtPlot(pick.city.location, { zoom: 0.9 })); await later(12000);
  safe(() => { PlotCursor.plotCursorCoords = null; });
  emit("SHOT lens-ethnic-wide"); await later(HOLD);
  safe(() => LensManager.setActiveLens("fxs-default-lens")); await later(2000);
}

// ── Civilopedia ──────────────────────────────────────────────────────────────────────────────────────────────
function pediaRoot() { return safe(() => document.querySelector("screen-civilopedia"), null); }
function inspectPage(pageID) {
  const root = pediaRoot();
  if (!root) return { open: false };
  const headers = Array.from(root.querySelectorAll("fxs-header")).map((h) => h.getAttribute("title") || "").filter(Boolean);
  // screen-civilopedia.js builds each paragraph as a div with data-l10n-id = its key and these classes; `role` is set
  // as a property, which GameFace may not reflect to an attribute, so match on the key and the classes.
  const paras = Array.from(root.querySelectorAll("div[data-l10n-id].font-body.text-base.m-3"));
  const keys = paras.map((p) => p.getAttribute("data-l10n-id") || "");
  const empty = paras.filter((p) => !String(p.textContent || "").trim()).map((p) => p.getAttribute("data-l10n-id") || "(no key)");
  const unresolved = keys.filter((k) => k && safe(() => Locale.compose(k), k) === k);
  const chars = paras.reduce((n, p) => n + String(p.textContent || "").length, 0);
  const groups = Array.from(root.querySelectorAll("pedia-page-group")).map((g) => String(g.textContent || "").replace(/\s+/g, " ").trim()).filter(Boolean);
  return { open: true, pageID, headers, paragraphs: paras.length, chars, empty, unresolved,
    firstKeys: keys.slice(0, 3), lastKey: keys[keys.length - 1], groups };
}
async function shootPedia() {
  const pushed = safe(() => { ContextManager.push("screen-civilopedia", { singleton: true, createMouseGuard: true }); return "push"; }, "push threw");
  await later(5000);
  if (!pediaRoot()) {
    // The same path the game's own hotkey takes (model-civilopedia.js onCivilopediaHotkey).
    safe(() => window.dispatchEvent(new CustomEvent("hotkey-open-civilopedia")));
    await later(5000);
    emit("PEDIA push did not open it (" + pushed + "); hotkey event fallback open=" + !!pediaRoot());
  }
  emit("PEDIA open=" + !!pediaRoot() + " sections=" + safe(() => Pedia.sections.map((s) => s.sectionID).join(","), "?"));
  const layouts = { ARRIVALS: "EMIG_ARRIVALS", VOICES_ROME: "EMIG_VOICES" };
  for (const [page, layout] of Object.entries(layouts)) {
    const chapters = safe(() => (Pedia.getPageChapters(layout) || []).map((c) => c.chapterID), []);
    const bodies = chapters.map((c) => c + ":" + (safe(() => Pedia.getChapterBody(SECTION, page, c, layout), null) || []).length);
    emit("PEDIA model " + page + " layout=" + layout + " chapters=" + J(bodies));
  }
  let pass = 0, fail = 0;
  for (const pageID of PEDIA_PAGES) {
    const ok = safe(() => Pedia.navigateTo({ sectionID: SECTION, pageID }), false);
    await later(4000);
    const r = inspectPage(pageID);
    const good = ok === true && r.open && r.paragraphs > 0 && !r.empty.length && !r.unresolved.length;
    good ? pass++ : fail++;
    emit("PEDIA " + (good ? "OK  " : "FAIL") + " " + pageID + " navigate=" + ok + " " + J(r));
    emit("SHOT pedia-" + pageID.toLowerCase().replace(/_/g, "-"));
    await later(HOLD);
  }
  emit("PEDIA VERDICT pass=" + pass + " fail=" + fail + " of " + PEDIA_PAGES.length);
  safe(() => ContextManager.pop("screen-civilopedia"));
  await later(2000);
}

// ── run ──────────────────────────────────────────────────────────────────────────────────────────────────────
async function run() {
  local = safe(() => GameContext.localPlayerID, -1);
  emit("modtest143 run local=" + local + " turn=" + safe(() => Game.turn));
  savedVis = safe(() => getVisibilityOverride(), null);
  safe(() => setVisibilityOverride(2));
  emit("SETTINGS visibility before=" + savedVis + " now=" + safe(() => getVisibilityOverride()));
  await later(8000);
  await dismissPopups();
  try { await shootLens(); } catch (e) { emit("LENS threw " + e + " " + (e && e.stack)); }
  try { await shootPedia(); } catch (e) { emit("PEDIA threw " + e + " " + (e && e.stack)); }
  finish("done");
}
function finish(why) {
  if (done) return;
  done = true;
  if (savedVis !== null) safe(() => setVisibilityOverride(savedVis));
  emit("SETTINGS visibility restored=" + safe(() => getVisibilityOverride()) + " matches=" + (safe(() => getVisibilityOverride()) === savedVis));
  emit("VERDICT reason=" + why);
  setTimeout(() => emit("DONE modtest143 finished"), 3000);
}

emit("modtest143 attached");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() {
  const st = loadStateName();
  if (st === "GameStarted") {
    setTimeout(() => { run().catch((e) => { emit("run threw " + e); finish("run threw"); }); }, 10000);
    return;
  }
  beginTries++;
  if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady());
  if (beginTries < 90) setTimeout(beginPoll, 2000); else { emit("LOAD gave up"); emit("DONE modtest143 finished"); }
}
setTimeout(beginPoll, 3000);
