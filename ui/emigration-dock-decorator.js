// emigration-dock-decorator.js
//
// Adds an Emigration button to the bottom subsystem dock so the standalone migration
// dashboard window is reachable IN-GAME, not only via the developer console
// (`emigration.window()`). Same mechanism the Demographics mod uses:
// Controls.decorate('panel-sub-system-dock', factory); the vanilla panel's addButton
// attaches `.ssb__button-icon` plus our modifierClass, which we paint via a CSS mask.
//
// The icon is shipped as a file and referenced by a fs://game/emigration/... URL, because
// Coherent's CSS parser does not honour data: URIs in background-image for fs://-loaded
// stylesheets (so the SVG must be a real file, declared in the modinfo ImportFiles).

import { openEmigrationScreen } from "/emigration/ui/emigration-screen.js";
import { getShowDockButton } from "/emigration/ui/emigration-settings.js";

const DBG = false;
/**
 * Debug logger, no-op unless {@link DBG} is set.
 * @param {...*} a Values to log.
 */
function dlog(...a) {
  if (DBG) console.warn("[Emigration.dock]", ...a);
}
/**
 * Error logger; always emits.
 * @param {...*} a Values to log.
 */
function derr(...a) {
  console.error("[Emigration.dock]", ...a);
}

const ICON_URL = "fs://game/emigration/images/emigration-dock-icon.svg";
// Flat tint matching the vanilla subsystem-dock icons (light parchment silhouettes).
const ICON_TINT = "#ecdfbf";

/**
 * The vanilla subsystem-dock panel handle passed to a decorator factory. Only the
 * surface this decorator touches is modeled; the rest is the untyped engine boundary.
 * @typedef {Object} SubSystemDockPanel
 * @property {(opts: *) => (HTMLElement | null | undefined)} [addButton] Adds a dock button.
 */

/**
 * Inject the one-time `<style>` that paints our dock-button icon as a mask filled with
 * {@link ICON_TINT}, so it matches the flat tint of the other dock icons. Idempotent.
 */
function injectIconStyle() {
  if (document.getElementById("emigration-dock-icon-style")) return;
  const style = document.createElement("style");
  style.id = "emigration-dock-icon-style";
  style.textContent =
    `.ssb__button-icon.emigration {` +
    ` background-image: none;` +
    ` background-color: ${ICON_TINT};` +
    ` mask-image: url("${ICON_URL}");` +
    ` mask-size: 64%;` +
    ` mask-position: center;` +
    ` mask-repeat: no-repeat;` +
    ` }`;
  document.head.appendChild(style);
  dlog("icon style injected");
}

/**
 * Open the standalone Emigration screen from the dock button.
 */
function openScreen() {
  try {
    openEmigrationScreen();
  } catch (e) {
    derr("openScreen threw:", e);
  }
}

/**
 * Decorator for the vanilla subsystem dock that adds the Emigration button and toggles
 * the standalone migration dashboard window when activated.
 */
export class EmigrationDockDecorator {
  /**
   * @param {SubSystemDockPanel} val The panel handle supplied by the factory.
   */
  constructor(val) {
    /** @type {SubSystemDockPanel} */
    this._panel = val;
  }

  /** Lifecycle hook fired before the panel attaches. */
  beforeAttach() {}

  /** Lifecycle hook fired after the panel attaches: paint the icon and add the button. */
  afterAttach() {
    // Optional dock button: when disabled in the mod's options, the dashboard is reached via the
    // Demographics screen's Migration tab (or the console) instead. Read at attach time.
    if (!getShowDockButton()) {
      dlog("dock button disabled by option; skipping");
      return;
    }
    try {
      injectIconStyle();
    } catch (e) {
      derr("injectIconStyle threw:", e);
    }
    this._addDockButton();
  }

  /** Add the Emigration button to the dock, defensively. Never throws. */
  _addDockButton() {
    try {
      if (!this._panel || typeof this._panel.addButton !== "function") {
        derr("panel.addButton missing; aborting");
        return;
      }
      this._panel.addButton({
        tooltip: "LOC_EMIGRATION_OPEN",
        modifierClass: "emigration",
        callback: openScreen,
        class: ["emigration-dock-button"],
        audio: "data-audio-tab-selected",
        focusedAudio: "data-audio-focus-small"
      });
    } catch (e) {
      derr("addButton THREW:", e);
    }
  }

  /** Lifecycle hook fired before the panel detaches. */
  beforeDetach() {}

  /** Lifecycle hook fired after the panel detaches. */
  afterDetach() {}
}

/**
 * Register the dock decorator with the engine. Called once from boot(). Safe to call when
 * the Controls API is unavailable (older shells): it simply does nothing.
 */
export function installEmigrationDock() {
  try {
    if (typeof Controls !== "undefined" && typeof Controls.decorate === "function") {
      Controls.decorate(
        "panel-sub-system-dock",
        (/** @type {SubSystemDockPanel} */ val) => new EmigrationDockDecorator(val)
      );
      dlog("dock decorator registered");
    } else {
      dlog("Controls.decorate unavailable; dock button not registered");
    }
  } catch (e) {
    derr("Controls.decorate THREW:", e);
  }
}
