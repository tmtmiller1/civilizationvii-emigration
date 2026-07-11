// emigration-selftest.js
//
// An ON-SCREEN, no-console diagnostic for verifying the mod live, in-game, WITHOUT a developer console.
// Gated behind the `selftestEnabled` option (off by default). When on, the dock decorator adds a
// "Self-Test" button to the subsystem dock; clicking it opens THIS screen.
//
// IMPORTANT — why this is a real screen, not a HUD DOM overlay: a mod overlay appended to the HUD does
// not receive clicks, because Civ VII routes input to a mouse guard owned by whatever screen the
// ContextManager pushed. So the self-test is a proper base-UI Panel pushed with `createMouseGuard: true`
// (exactly like the migration dashboard) — that guard is what makes its buttons clickable.
//
// The panel:
//   • runs a battery of checks (emigration-selftest-checks.js) as PASS/WARN/FAIL/INFO rows;
//   • ACTIONS: run a real migration pass; force the Cultural-Enclave decision; force a refugee dilemma;
//     fire test toasts (one, or all four types); open the migration dashboard; and produce a
//     screenshot-friendly bug-report snapshot (version + every check + key settings).
//   • the enclave force offers the decision via the real showDilemma path (relaxed to a foothold) — the
//     same interactive modal the game uses.
//
// Everything is defensive: a self-test failure can never disrupt a game.

import Panel from "/core/ui/panel-support.js";
import { CONFIG } from "/emigration/ui/emigration-config.js";
import { monoTurn } from "/emigration/ui/emigration-migration-stats.js";
import { toast, reportPassFeedback, reportInboundFeedback } from "/emigration/ui/emigration-feedback.js";
import { openEmigrationScreen } from "/emigration/ui/emigration-screen.js";
import { showDilemma } from "/emigration/ui/emigration-dilemma-view.js";
import { fireRealDilemmaForTest } from "/emigration/ui/emigration-dilemma.js";
import { quarterOptionsFor } from "/emigration/ui/emigration-quarter-registry.js";
import { civType, quarterName, narrativeCiv } from "/emigration/ui/emigration-naming.js";
import { loc } from "/emigration/ui/emigration-loc.js";
import { runPass } from "/emigration/ui/emigration-engine.js";
import { TUNABLES } from "/emigration/ui/emigration-tunables.js";
import { runChecks, pickPreviewOrigin, errMsg } from "/emigration/ui/emigration-selftest-checks.js";

const SCREEN_ID = "screen-emigration-selftest";
// Kept in sync with emigration.modinfo <Version>; shown in the bug-report snapshot so a report names the
// build. Bump alongside the modinfo version on release.
const MOD_VERSION = "2.0.7";
const DBG = false;
/** Error logger; always emits. @param {...*} a */
function derr(...a) {
  console.error("[Emigration.selftest]", ...a);
}
/** Debug logger, no-op unless DBG. @param {...*} a */
function dlog(...a) {
  if (DBG) console.warn("[Emigration.selftest]", ...a);
}

/** The live content host of the open screen (for re-run + banner), or null when closed. @type {*} */
let _host = null;

// ── actions ──────────────────────────────────────────────────────────────────────────────────────

/** `fn()`, or `fallback` if it throws or returns null. @param {()=>*} fn @param {*} fallback @returns {*} */
function safeCall(fn, fallback) {
  try {
    const v = fn();
    return v == null ? fallback : v;
  } catch (_) {
    return fallback;
  }
}

/** Run `fn` on a short defer, never letting it throw (an uncaught timer throw can crash the game).
 * @param {()=>void} fn */
function deferSafe(fn) {
  const guarded = () => {
    try {
      fn();
    } catch (e) {
      dlog("deferred action threw", e);
    }
  };
  if (typeof setTimeout === "function") setTimeout(guarded, 80);
  else guarded();
}

/**
 * A SYNTHETIC Cultural-Enclave decision view — a spoofed preview that fires regardless of whether the
 * player has a qualifying diaspora. Names a REAL foreign origin when one exists; for the placeholder
 * (civ < 0, no foreign community) it uses pure fallback strings and NEVER calls the engine naming
 * lookups (which throw on an invalid id). Every naming call is wrapped so a bad id can't crash.
 * @param {{civ:number, place:string}} origin @returns {*} The dilemma view model.
 */
function syntheticEnclaveView(origin) {
  const valid = typeof origin.civ === "number" && origin.civ >= 0;
  const name = valid ? safeCall(() => quarterName(origin.civ), "Cultural Enclave") : "Cultural Enclave";
  const adj = valid ? safeCall(() => (narrativeCiv(origin.civ) || {}).adj, "foreign") : "foreign";
  const ct = valid ? safeCall(() => civType(origin.civ), null) : null;
  return {
    eyebrow: loc("LOC_EMIG_QTR_EYEBROW", "Cultural Enclave"),
    dismissId: "ignore",
    title: loc("LOC_EMIG_QTR_TITLE", "The {1_Name}", name),
    body: "(Self-test preview) The " + adj + " community of " + origin.place + " has grown into a district " +
      "of its own. This is a spoofed preview so you can confirm the enclave decision renders and its " +
      "buttons are clickable — choosing a stance here does NOT change your game.",
    choices: safeCall(() => quarterOptionsFor(ct), [])
  };
}

/**
 * Force the Cultural-Enclave decision pop-up. SPOOFS the requirements: it builds a synthetic decision
 * and shows it via the real showDilemma path — the game's own native dialog, so its buttons are always
 * clickable — so it always fires, even with no foreign community. Applies nothing.
 */
function forceEnclavePopup() {
  // Close THIS self-test screen first. The decision now renders through the engine's native dialog
  // (DialogBoxManager); shown while this mouse-guard-backed screen is still up, that dialog can sit
  // behind it / have its input eaten — which is exactly why the probe pop-up looked dead. Popping this
  // screen first lets the dialog own the foreground and receive clicks, matching the in-game path.
  closeSelfTestScreen();
  deferSafe(() => {
    const view = syntheticEnclaveView(pickPreviewOrigin());
    showDilemma(view, (id) =>
      toast("Self-test: enclave stance “" + id + "” chosen — the decision modal works.", "prosperity"));
  });
}

/**
 * Run a real migration pass now, with the throttle temporarily relaxed (pressure bar → 1, no cooldown,
 * high move cap) so movement actually surfaces — a normal pass is gated on 30 accumulated pressure + an
 * 8-turn cooldown, so a single manual pass almost always moves nobody. Restores the settings after, and
 * refreshes the checks. 0 still means "no migration pressure anywhere right now" (all settlements content).
 */
function runMigrationPass() {
  const saved = {
    bar: CONFIG.emigrationBar,
    cd: CONFIG.cooldownTurns,
    mm: CONFIG.maxMovesPerTurn
  };
  try {
    CONFIG.emigrationBar = 1;
    CONFIG.cooldownTurns = 0;
    CONFIG.maxMovesPerTurn = Math.max(20, saved.mm);
    const migs = runPass() || [];
    // Fire the SAME notification feedback a normal turn does (mirrors emigration-main.reportNewsworthy),
    // so this also demonstrates whether notifications appear — subject to your notifyMode/cooldown settings.
    try {
      const newsworthy = migs.filter((m) => m.phase !== "arrive" && m.cause !== "conquest" && m.cause !== "return");
      reportPassFeedback(newsworthy);
      reportInboundFeedback(migs);
    } catch (_) {
      /* feedback is best-effort */
    }
    reRun(); // rebuild the rows against the new state
    banner(migs.length + " migration(s) applied this pass (throttle relaxed for the test). Checks refreshed. " +
      (migs.length === 0
        ? "0 = there is no migration pressure anywhere right now — every settlement is content."
        : "Watch for toasts + the network / city populations updating. No toasts on a nonzero pass means your " +
          "notify filters suppressed them — raise notifyMode to Verbose / lower the cooldown in Advanced options."));
  } catch (e) {
    banner("Pass failed: " + errMsg(e));
  } finally {
    CONFIG.emigrationBar = saved.bar;
    CONFIG.cooldownTurns = saved.cd;
    CONFIG.maxMovesPerTurn = saved.mm;
  }
}

/** Force the OTHER modal — a refugee dilemma — via the real showDilemma path (a preview; no game effect). */
function forceRefugeeDilemma() {
  try {
    // Close this self-test screen first so the native dialog owns the foreground and receives clicks
    // (see forceEnclavePopup) — the deferred showDilemma then presents cleanly, exactly like in-game.
    closeSelfTestScreen();
    deferSafe(() => {
      const view = {
        eyebrow: "Refugees",
        dismissId: "away",
        title: "Refugees at the Gate",
        body: "(Self-test preview) A wave of displaced families has reached your borders. This forces the " +
          "refugee dilemma modal so you can confirm it renders and its buttons work. Your choice here is a " +
          "preview only — it does not change your game.",
        choices: [
          { id: "welcome", label: "Welcome them", note: "Preview — no effect on your game." },
          { id: "hold", label: "Hold them at the border", note: "Preview — no effect." },
          { id: "away", label: "Turn them away", note: "Preview — no effect." }
        ]
      };
      showDilemma(view, (id) => toast("Self-test: refugee choice “" + id + "” — the dilemma modal works.", "war"));
    });
  } catch (e) {
    dlog("forceRefugeeDilemma threw", e);
  }
}

// One-shot handler while a real-path test is armed (null when not armed), so a second arm is a no-op and
// the listener is removed the instant it fires.
/** @type {((data:*)=>void) | null} */
let _armedDilemmaHandler = null;

/** The local player id, or null. @returns {number|null} */
function localPlayerId() {
  return (typeof GameContext !== "undefined" && typeof GameContext.localPlayerID === "number")
    ? GameContext.localPlayerID : null;
}

/** Remove the armed one-shot `PlayerTurnActivated` listener and clear the armed slot. @param {*} h The handler. */
function disarmDilemma(h) {
  try {
    if (typeof engine !== "undefined" && typeof engine.off === "function") engine.off("PlayerTurnActivated", h);
  } catch (_) {
    /* ignore */
  }
  _armedDilemmaHandler = null;
}

/**
 * Arm the ACTUAL in-game trigger. Registers a one-shot on the real `PlayerTurnActivated` engine event and,
 * on the local player's next turn, fires a REAL refugee dilemma SYNCHRONOUSLY from inside that event — the
 * exact context that broke in a live game — WITH its real applied effects (gold/happiness/influence cost +
 * a settled population point), so a choice visibly moves your yields. The button-fired previews above are
 * DEFERRED (setTimeout) and apply no effect, so they can neither reproduce the engine-event bug nor prove
 * the outcome; that is why they always "passed" while real games failed. This is the faithful end-to-end
 * test: arm it, end one turn, and if the pop-up appears, its buttons respond, AND the chosen effect lands
 * on your yields, the in-game path is genuinely working.
 */
function armRealDilemma() {
  if (_armedDilemmaHandler) {
    banner("Already armed — close this panel and end your turn to fire the real dilemma.");
    return;
  }
  const handler = (/** @type {*} */ data) => {
    const me = localPlayerId();
    const who = data && (data.player ?? data.Player);
    if (me == null || who !== me) return; // wait for YOUR turn, matching emigration-main.onTurnActivated
    disarmDilemma(handler);
    try {
      if (!fireRealDilemmaForTest()) {
        toast("Real dilemma self-test: couldn't fire — enable 'Refugee dilemmas' in Advanced options first.", "war");
      }
    } catch (e) {
      dlog("armRealDilemma handler threw", e);
    }
  };
  try {
    if (typeof engine === "undefined" || typeof engine.on !== "function") {
      banner("Can't arm: the engine event API isn't available in this context.");
      return;
    }
    engine.on("PlayerTurnActivated", handler);
    _armedDilemmaHandler = handler;
    banner("Armed. Close this panel and END YOUR TURN — a REAL dilemma fires from INSIDE the real turn " +
      "event on your next turn, exactly as a live game does. Your choice applies its real effect, so watch " +
      "your gold / happiness / influence (and a settled city) change. That confirms the in-game path works.");
  } catch (e) {
    banner("Arm failed: " + errMsg(e));
  }
}

/** Whether on-screen toasts are enabled in this profile. @returns {boolean} */
function toastsEnabled() {
  return (CONFIG.notifyMode >= 1) && !!CONFIG.notifyToasts;
}

/** Fire a single test toast through the mod's notification channel. */
function fireTestToast() {
  try {
    toast("Emigration self-test notification — if you can read this, on-screen toasts work.", "prosperity");
    banner(toastsEnabled()
      ? "Toast fired — look at the top of the screen."
      : "Toasts are disabled in your mod options, so nothing appeared. Enable notifications to see them.");
  } catch (e) {
    banner("Toast failed: " + errMsg(e));
  }
}

/** Fire one toast of each notification type, so all four channels can be seen at once. */
function fireSampleNotifications() {
  try {
    if (!toastsEnabled()) {
      banner("Toasts are disabled in your mod options — enable notifications first, then try again.");
      return;
    }
    toast("Self-test: a war-driven population loss.", "war", true);
    toast("Self-test: a world refugee crisis.", "crisis");
    toast("Self-test: an immigration wave arriving.", "prosperity");
    toast("Self-test: a disaster displacing people.", "disaster");
    banner("Fired 4 sample notifications (war / crisis / immigration / disaster) — see the top of the screen.");
  } catch (e) {
    banner("Notifications failed: " + errMsg(e));
  }
}

/** Open the standalone migration dashboard (to eyeball the network / settlement coverage). */
function openDashboard() {
  try {
    closeSelfTestScreen();
    if (typeof setTimeout === "function") setTimeout(() => openEmigrationScreen(), 60);
    else openEmigrationScreen();
  } catch (e) {
    dlog("openDashboard threw", e);
  }
}

/** Collapse a detail string to a single line for the snapshot. @param {string} s @returns {string} */
function oneLine(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

/** Build the shareable bug-report snapshot: version + every check result + key settings. @returns {string} */
function buildSnapshotText() {
  const lines = ["=== Emigration Self-Test — " + MOD_VERSION + " ==="];
  try {
    lines.push("Turn: " + monoTurn());
  } catch (_) {
    /* ignore */
  }
  lines.push("");
  for (const r of runChecks()) {
    lines.push("[" + r.status + "] " + r.label);
    lines.push("    " + oneLine(r.detail));
  }
  lines.push("", "--- Key settings ---");
  for (const t of TUNABLES) {
    try {
      lines.push("  " + t.key + " = " + JSON.stringify(/** @type {*} */ (CONFIG)[t.key]));
    } catch (_) {
      /* skip an unreadable key */
    }
  }
  return lines.join("\n");
}

/** Render the diagnostics snapshot into the panel (screenshot-friendly) and copy it if the clipboard exists. */
function copyDiagnostics() {
  try {
    const text = buildSnapshotText();
    let copied = false;
    try {
      const nav = /** @type {*} */ (globalThis).navigator;
      if (nav && nav.clipboard && typeof nav.clipboard.writeText === "function") {
        nav.clipboard.writeText(text);
        copied = true;
      }
    } catch (_) {
      /* clipboard often absent in GameFace; the on-screen text is the fallback */
    }
    if (_host) {
      let box = _host.querySelector(".emig-st-snap");
      if (!box) {
        box = el("div", "emig-st-snap");
        _host.appendChild(box);
      }
      box.textContent = text;
    }
    banner(copied
      ? "Diagnostics copied to clipboard AND shown below — paste or screenshot it into a bug report."
      : "Diagnostics shown below — screenshot it into a bug report (clipboard unavailable in-game).");
  } catch (e) {
    banner("Snapshot failed: " + errMsg(e));
  }
}

// ── content rendering (into the screen's host) ─────────────────────────────────────────────────────

const TAG_COLOR = { PASS: "#5cbf7a", WARN: "#d8b44a", FAIL: "#d16a63", INFO: "#7fa8c9" };

/** Make an element with class + text. @param {string} t @param {string|null} [c] @param {string} [x] */
function el(t, c, x) {
  const e = document.createElement(t);
  if (c) e.className = c;
  if (x != null) e.textContent = x;
  return e;
}

/** One rendered check row. @param {*} r @returns {HTMLElement} */
function checkRow(r) {
  const rowEl = el("div", "emig-st-row");
  const head = el("div", "emig-st-row-hd");
  const tag = el("span", "emig-st-tag", r.status);
  tag.style.backgroundColor = /** @type {*} */ (TAG_COLOR)[r.status] || "#7fa8c9";
  head.appendChild(tag);
  head.appendChild(el("span", "emig-st-label", r.label));
  rowEl.appendChild(head);
  rowEl.appendChild(el("div", "emig-st-detail", r.detail));
  return rowEl;
}

/** A panel action button. @param {string} label @param {()=>void} onClick @returns {HTMLElement} */
function button(label, onClick) {
  const b = el("button", "emig-st-btn", label);
  b.addEventListener("click", (/** @type {*} */ ev) => {
    try {
      ev.stopPropagation();
    } catch (_) {
      /* ignore */
    }
    onClick();
  });
  return b;
}

/** The action-button row. @returns {HTMLElement} */
function actionRow() {
  const actions = el("div", "emig-st-actions");
  actions.appendChild(button("Re-run checks", reRun));
  actions.appendChild(button("Run a migration pass", runMigrationPass));
  actions.appendChild(button("Force enclave pop-up", forceEnclavePopup));
  actions.appendChild(button("Force refugee dilemma", forceRefugeeDilemma));
  actions.appendChild(button("Arm REAL dilemma (end turn to fire)", armRealDilemma));
  actions.appendChild(button("Fire test toast", fireTestToast));
  actions.appendChild(button("Fire all notifications", fireSampleNotifications));
  actions.appendChild(button("Open dashboard", openDashboard));
  actions.appendChild(button("Copy diagnostics", copyDiagnostics));
  return actions;
}

/** Clear the host and render the check rows + actions + note into it. @param {*} host */
function renderInto(host) {
  try {
    if (!host) return;
    while (host.firstChild) host.removeChild(host.firstChild);
    for (const r of runChecks()) host.appendChild(checkRow(r));
    host.appendChild(actionRow());
    host.appendChild(el("div", "emig-st-note", ""));
  } catch (e) {
    dlog("renderInto threw", e);
  }
}

/** Re-run the checks in place (the screen stays open). */
function reRun() {
  renderInto(_host);
}

/** Transient one-line note in the panel (action feedback). @param {string} msg */
function banner(msg) {
  try {
    if (!_host) return;
    const note = _host.querySelector(".emig-st-note");
    if (note) note.textContent = msg;
  } catch (_) {
    /* ignore */
  }
}

// ── the screen (base-UI Panel, pushed with a mouse guard so its buttons receive input) ───────────────

/** The self-test screen. A real base-UI panel so its buttons are clickable (mouse-guard-backed). */
class ScreenEmigrationSelfTest extends Panel {
  /** Configure audio cues before attach. */
  onInitialize() {
    super.onInitialize?.();
    this.enableOpenSound = true;
    this.enableCloseSound = true;
  }

  /** Wire the close button and mount the check content. */
  onAttach() {
    try {
      super.onAttach?.();
    } catch (e) {
      derr("onAttach super failed:", e);
    }
    try {
      this._wireCloseButton();
      const host = this.Root.querySelector(".emig-selftest-host");
      if (!host) {
        derr("content host not found in template");
        return;
      }
      _host = host;
      renderInto(host);
    } catch (e) {
      derr("onAttach body failed:", e);
    }
  }

  /** Drop the host reference on close. */
  onDetach() {
    _host = null;
    try {
      super.onDetach?.();
    } catch (e) {
      derr("onDetach super failed:", e);
    }
  }

  /** Wire the template's close button to close the screen. */
  _wireCloseButton() {
    try {
      const btn = this.Root.querySelector("[data-ia-close]");
      if (btn) {
        btn.addEventListener("action-activate", () => {
          try {
            this.close();
          } catch (_) {
            /* ignore */
          }
        });
      }
    } catch (e) {
      derr("close-button wiring failed:", e);
    }
  }

  /** Close. */
  close() {
    try {
      super.close?.();
    } catch (e) {
      derr("close failed:", e);
    }
  }
}

try {
  if (typeof Controls !== "undefined" && typeof Controls.define === "function") {
    Controls.define(SCREEN_ID, {
      createInstance: ScreenEmigrationSelfTest,
      description: "Emigration self-test diagnostics panel.",
      styles: ["fs://game/emigration/ui/emigration-selftest.css"],
      content: ["fs://game/emigration/ui/emigration-selftest.html"],
      attributes: [],
      classNames: ["emig-selftest", "w-full", "h-full"]
    });
  } else {
    dlog("Controls.define unavailable; self-test screen not registered");
  }
} catch (e) {
  derr("Controls.define THREW:", e);
}

// ── public API (used by the dock decorator) ─────────────────────────────────────────────────────────

/** Whether the self-test is enabled in the mod's options. @returns {boolean} */
export function selfTestEnabled() {
  return !!CONFIG.selftestEnabled;
}

/** Open the self-test screen (pushed WITH a mouse guard so its buttons receive input). */
export function openSelfTestPanel() {
  import("/core/ui/context-manager/context-manager.js")
    .then((m) => {
      try {
        const cm = /** @type {*} */ (m);
        const ContextManager = cm.default || cm.ContextManager || cm;
        if (ContextManager && typeof ContextManager.push === "function") {
          ContextManager.push(SCREEN_ID, { singleton: true, createMouseGuard: true });
        } else {
          derr("context-manager push unavailable");
        }
      } catch (e) {
        derr("openSelfTestPanel failed:", e);
      }
    })
    .catch((e) => derr("context-manager import failed:", e));
}

/** Close the self-test screen if open (best-effort). */
function closeSelfTestScreen() {
  import("/core/ui/context-manager/context-manager.js")
    .then((m) => {
      try {
        const cm = /** @type {*} */ (m);
        const ContextManager = cm.default || cm.ContextManager || cm;
        if (ContextManager && typeof ContextManager.pop === "function") ContextManager.pop(SCREEN_ID);
      } catch (_) {
        /* ignore */
      }
    })
    .catch(() => {
      /* ignore */
    });
}

/**
 * Add the self-test button to the subsystem dock (called from the dock decorator's afterAttach, which
 * runs in the HUD context). No-op unless `selftestEnabled` and the panel exposes addButton.
 * @param {*} panel The subsystem-dock panel handle (has addButton). @returns {boolean} Whether added.
 */
export function addSelfTestDockButton(panel) {
  try {
    if (!CONFIG.selftestEnabled || !panel || typeof panel.addButton !== "function") return false;
    panel.addButton({
      tooltip: "LOC_EMIGRATION_SELFTEST_OPEN",
      modifierClass: "emigration",
      callback: openSelfTestPanel,
      class: ["emigration-selftest-button"],
      audio: "data-audio-tab-selected",
      focusedAudio: "data-audio-focus-small"
    });
    return true;
  } catch (_) {
    return false;
  }
}
