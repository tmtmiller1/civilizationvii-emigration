// emigration-screen.js
//
// The standalone Emigration screen: a real base-UI panel (fxs-frame + header + close button, pushed
// through the ContextManager) that mounts the migration dashboard render core (emigration-views.js),
// opened from the subsystem-dock button (emigration-dock-decorator.js). Follows the Demographics
// screen's pattern: a Panel subclass registered via Controls.define, opened with ContextManager.push.

import Panel from "/core/ui/panel-support.js";
import { setAdvancedSectionOpen } from "/emigration/ui/emigration-settings.js";
import { gatherDashboard } from "/emigration/ui/emigration-window.js";
import { dashboardModel, renderDashboardTabbed } from "/emigration/ui/emigration-views.js";

const DBG = false;
/**
 * Debug logger, no-op unless {@link DBG} is set.
 * @param {...*} a Values to log.
 */
function dlog(...a) {
  if (DBG) console.warn("[Emigration.screen]", ...a);
}
/**
 * Error logger; always emits.
 * @param {...*} a Values to log.
 */
function derr(...a) {
  console.error("[Emigration.screen]", ...a);
}

// Shared 10-step type scale (rem), published as `--dg-fs-<n>` values scaled by the in-game font-size
// setting (which Coherent otherwise applies only to its own text-* classes). MUST match the
// Demographics mod's ladder so emig content inside the Demographics screen resolves the same vars.
const FONT_SIZE_LADDER = [0.65, 0.72, 0.85, 0.95, 1.05, 1.2, 1.4, 1.6, 1.85, 2.4];

/**
 * The in-game font-size setting (`uiFontScale` 0…4) as a multiplier over the
 * engine's 18px base (16/18 … 24/18), defensively.
 * @returns {number} The multiplier.
 */
function readUiFontScaleMultiplier() {
  const PX = [16, 18, 20, 22, 24];
  try {
    const idx = typeof Configuration !== "undefined" ? Configuration.getUser?.()?.uiFontScale : undefined;
    if (typeof idx === "number" && PX[idx]) return PX[idx] / 18;
  } catch (_) {
    // fall through to 1
  }
  return 1;
}

/**
 * Resolve the engine display-queue manager (the popup/notification sequencer the base game's own
 * cinematics defer through) and invoke `fn` with it. Dynamic import, a no-op if unavailable.
 * @param {(dq:*)=>void} fn Callback receiving the DisplayQueueManager.
 */
function withDisplayQueue(fn) {
  import("/core/ui/context-manager/display-queue-manager.js")
    .then((m) => {
      const mod = /** @type {*} */ (m);
      fn(mod.DisplayQueueManager || mod.default || mod);
    })
    .catch(() => {
      // display-queue-manager import can fail in headless contexts; popups just won't defer.
    });
}

/**
 * Suspend the popup/notification queue while the screen is open, so background popups (research /
 * civic / event …) queue instead of surfacing over and reflowing the dashboard. Claims the
 * suspension only when it isn't already held, so teardown never resumes one we didn't own.
 * @param {*} state Owner flagged with `popupsSuspended`.
 */
function suspendPopups(state) {
  withDisplayQueue((dq) => {
    try {
      const ok = typeof dq.suspend === "function" && typeof dq.isSuspended === "function";
      if (ok && !dq.isSuspended()) {
        dq.suspend();
        state.popupsSuspended = true;
      }
    } catch (_) {
      // suspend can throw mid-transition; non-fatal (popups simply aren't deferred).
    }
  });
}

/**
 * Resume the queue suspended by {@link suspendPopups}, letting deferred popups surface once the
 * screen closes. No-op unless we were the ones who suspended it.
 * @param {*} state Owner flagged by suspendPopups.
 */
function resumePopups(state) {
  if (!state || !state.popupsSuspended) return;
  state.popupsSuspended = false;
  withDisplayQueue((dq) => {
    try {
      const ok = typeof dq.resume === "function" && typeof dq.isSuspended === "function";
      if (ok && dq.isSuspended()) {
        dq.resume();
      }
    } catch (_) {
      // resume can throw if the queue state changed; non-fatal.
    }
  });
}

/**
 * The Emigration migration dashboard screen (a modal base-UI panel).
 */
class ScreenEmigration extends Panel {
  /** Panel lifecycle: configure audio cues before attach. */
  onInitialize() {
    super.onInitialize?.();
    this.enableOpenSound = true;
    this.enableCloseSound = true;
    try {
      this.Root?.setAttribute?.("data-audio-group-ref", "audio-screen-unlocks");
    } catch (_) {
      /* the audio cue is optional */
    }
  }

  /** Panel lifecycle: wire the close button, render the dashboard, and defer background popups. */
  onAttach() {
    try {
      super.onAttach?.();
    } catch (e) {
      derr("onAttach super failed:", e);
    }
    // Publish the font-size setting as CSS vars BEFORE rendering so the dashboard's
    // var(--dg-fs-*) text sizes resolve at the right scale; re-apply live on change.
    this._onFontScaleChange = () => {
      try {
        this._applyFontScale();
      } catch (_) {
        // best-effort live update
      }
    };
    try {
      this._applyFontScale();
    } catch (e) {
      derr("font-scale apply failed:", e);
    }
    try {
      this._wireCloseButton();
      this._render();
    } catch (e) {
      derr("onAttach body failed:", e);
    }
    try {
      if (typeof engine !== "undefined" && typeof engine.on === "function") {
        engine.on("UIFontScaleChanged", this._onFontScaleChange);
      }
    } catch (e) {
      derr("font-scale subscribe failed:", e);
    }
    // Resolution response is pure CSS (emigration-density.js's DENSITY_CSS, injected with the dashboard
    // sheet); the network diagram re-fits on its own resize listener (emigration-network-fit.js).
    // Hold background popups in the queue while the window is open so they don't surface over the
    // screen and shove its layout around; they re-surface on detach.
    suspendPopups(this);
  }

  /** Panel lifecycle: release the deferred popups when the window closes. */
  onDetach() {
    resumePopups(this);
    const onFontScale = this._onFontScaleChange;
    if (onFontScale) {
      try {
        if (typeof engine !== "undefined" && typeof engine.off === "function") {
          engine.off("UIFontScaleChanged", onFontScale);
        }
      } catch (_) {
        // best-effort teardown
      }
      this._onFontScaleChange = null;
    }
    try {
      super.onDetach?.();
    } catch (e) {
      derr("onDetach super failed:", e);
    }
    // Best-effort second resume in case detach handlers toggled queue state mid-close.
    resumePopups(this);
  }

  /**
   * Publish the in-game font-size setting as `--dg-fs-<n>` CSS variables (fully
   * computed rem values) on the screen root, so the dashboard's `var(--dg-fs-*)`
   * text sizes track the setting AND the UI scale. Mirrors the Demographics bridge.
   */
  _applyFontScale() {
    const root = this.Root;
    if (!root || !root.style || typeof root.style.setProperty !== "function") return;
    const scale = readUiFontScaleMultiplier();
    for (const v of FONT_SIZE_LADDER) {
      root.style.setProperty("--dg-fs-" + Math.round(v * 100), (v * scale).toFixed(4) + "rem");
    }
  }

  /** Wire the template's close button to {@link ScreenEmigration#close}. */
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

  /** Gather the world's migration state and mount the dashboard render core. */
  _render() {
    try {
      const host = this.Root.querySelector(".emig-screen-host");
      if (!host) {
        derr("content host not found in template");
        return;
      }
      const rebuild = () => renderDashboardTabbed(host, dashboardModel(gatherDashboard()), rebuild);
      rebuild();
      dlog("dashboard rendered");
    } catch (e) {
      derr("render failed:", e);
    }
  }

  /** Panel lifecycle: close. */
  close() {
    // Best-effort release if close fails before detach can run.
    resumePopups(this);
    try {
      super.close?.();
    } catch (e) {
      derr("close failed:", e);
    }
    resumePopups(this);
  }
}

try {
  if (typeof Controls !== "undefined" && typeof Controls.define === "function") {
    Controls.define("screen-emigration", {
      createInstance: ScreenEmigration,
      description: "Emigration, migration dashboard panel.",
      styles: ["fs://game/emigration/ui/emigration-screen.css"],
      content: ["fs://game/emigration/ui/emigration-screen.html"],
      attributes: [],
      classNames: ["emig-screen", "w-full", "h-full"]
    });
  } else {
    derr("Controls.define unavailable; screen not registered");
  }
} catch (e) {
  derr("Controls.define THREW:", e);
}

/**
 * Open the Emigration screen (push it onto the context stack). Safe if the context manager
 * is unavailable.
 */
export function openEmigrationScreen() {
  import("/core/ui/context-manager/context-manager.js")
    .then((m) => {
      try {
        const cm = /** @type {*} */ (m);
        const ContextManager = cm.default || cm.ContextManager || cm;
        if (ContextManager && typeof ContextManager.push === "function") {
          ContextManager.push("screen-emigration", { singleton: true, createMouseGuard: true });
        } else {
          derr("context-manager push unavailable");
        }
      } catch (e) {
        derr("openEmigrationScreen failed:", e);
      }
    })
    .catch((e) => derr("context-manager import failed:", e));
}

/** Close the Emigration screen if it is open (best-effort). */
export function closeEmigrationScreen() {
  import("/core/ui/context-manager/context-manager.js")
    .then((m) => {
      try {
        const cm = /** @type {*} */ (m);
        const ContextManager = cm.default || cm.ContextManager || cm;
        if (ContextManager && typeof ContextManager.pop === "function") {
          ContextManager.pop("screen-emigration");
        }
      } catch (_) {
        /* ignore */
      }
    })
    .catch(() => {
      /* ignore */
    });
}

/**
 * Expose the screen on the globalThis.emigration console API: `emigration.window()` opens it,
 * `emigration.closeWindow()` closes it.
 */
export function installEmigrationConsole() {
  try {
    const api = /** @type {*} */ (globalThis).emigration || ((globalThis).emigration = {});
    api.window = () => openEmigrationScreen();
    api.closeWindow = () => closeEmigrationScreen();
    // Diagnostics: open the game's Options screen on a given tab (optionally with one Emigration advanced section
    // expanded), and close it. Probes run in a separate script context and cannot draw the game's interface
    // themselves; this lets one open the real screen from the mod's own context and screenshot it.
    api.options = (/** @type {number} */ tab, /** @type {string=} */ openSection) => {
      if (openSection) setAdvancedSectionOpen(openSection, true);
      withContextManager((cm) => cm.push("screen-options", {
        singleton: true, createMouseGuard: true, attributes: { "selected-tab": String(Number(tab) || 0) }
      }));
    };
    api.closeOptions = () => withContextManager((cm) => cm.pop("screen-options"));
    // Open / close the Advanced settings window on its own (optionally with one section expanded), for screenshots.
    api.advancedSettings = (/** @type {string=} */ openSection) => {
      if (openSection) setAdvancedSectionOpen(openSection, true);
      withContextManager((cm) => cm.push("emigration-advanced-editor", { singleton: true, createMouseGuard: true }));
    };
    api.closeAdvancedSettings = () => withContextManager((cm) => cm.pop("emigration-advanced-editor"));
    // Scroll the open Options screen so a given option row is in view (for screenshots of long tabs).
    api.optionsScrollTo = (/** @type {string} */ optionId) => {
      try {
        const target = document.querySelector(`[optionID="${optionId}"]`);
        const scroller = /** @type {*} */ (document.querySelector("screen-options fxs-scrollable"));
        const comp = scroller && (scroller.component || scroller.maybeComponent);
        if (target && comp && typeof comp.scrollIntoView === "function") comp.scrollIntoView(target);
        return !!target;
      } catch (_) {
        return false;
      }
    };
  } catch (_) {
    /* ignore */
  }
}

/**
 * Run something with the game's context manager, if it can be loaded.
 * @param {(cm:*) => void} fn What to do with it.
 */
function withContextManager(fn) {
  import("/core/ui/context-manager/context-manager.js")
    .then((m) => {
      const mod = /** @type {*} */ (m);
      const cm = mod.default || mod.ContextManager || mod;
      if (cm && typeof cm.push === "function") fn(cm);
    })
    .catch((e) => derr("context-manager import failed:", e));
}
