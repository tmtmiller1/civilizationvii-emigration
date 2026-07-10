// emigration-dilemma-view.js
//
// The refugee-dilemma / Cultural-Enclave DECISION modal. A UI mod can't inject a real engine narrative
// event, so this renders a centered panel styled like the game's own narrative pop-ups: an eyebrow
// kicker, a title, a line of prose, an optional attributed quote, and the choices as buttons. Choosing
// (or Escape / the ✕ / clicking outside, which count as the dismiss option) runs the callback once.
//
// WHY THIS IS A ContextManager SCREEN (not a HUD DOM overlay): a mod overlay appended to the HUD does
// not receive clicks — Civ VII routes input to a mouse guard owned by whatever screen the ContextManager
// pushed, so a bare overlay's buttons are dead (the "can only press Escape" bug that `setWorldInput`
// alone did not fix on this build). So the modal is a real base-UI Panel pushed with
// `createMouseGuard: true` (like the dashboard) — that guard is what makes its choice buttons clickable.
//
// showDilemma(view, onChoice) keeps its signature; callers (refugee dilemma, enclave decision, self-test)
// are unchanged. Fully defensive: with no ContextManager (shell/test) it is a silent no-op.

import Panel from "/core/ui/panel-support.js";
import { loc } from "/emigration/ui/emigration-loc.js";

const SCREEN_ID = "screen-emigration-dilemma";

/** Error logger; always emits. @param {...*} a */
function derr(...a) {
  console.error("[Emigration.dilemma]", ...a);
}

/** A single right-to-left character (Hebrew + Arabic/Persian script families). */
const RTL_CHAR = "\\u0590-\\u05FF\\u0600-\\u06FF\\u0750-\\u077F\\u08A0-\\u08FF\\uFB1D-\\uFDFF\\uFE70-\\uFEFF";
/** A maximal RTL run: an RTL char, then any RTL/space/punctuation, ending on an RTL char. */
const RTL_RUN = new RegExp("[" + RTL_CHAR + "](?:[" + RTL_CHAR + "\\s.,;:?!()\\u060C\\u061B\\u061F]*[" + RTL_CHAR + "])?", "g");

/**
 * Wrap each right-to-left run (Arabic/Persian/Hebrew) in Unicode isolates (FSI/PDI) so it lays out
 * right-to-left as a self-contained island inside the LTR line. A no-op for LTR-only text.
 * @param {string} s The display string. @returns {string} The bidi-isolated string.
 */
function bidiIsolate(s) {
  return typeof s === "string" ? s.replace(RTL_RUN, "⁨$&⁩") : s;
}

/**
 * Make an element with an optional class + text.
 * @param {string} tag Tag. @param {string} [cls] Class. @param {string} [text] Text.
 * @returns {HTMLElement} The element.
 */
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/**
 * Run the choice callback once, guarded (a failed outcome must never throw out of an event handler).
 * @param {(id:string)=>void} onChoice The callback. @param {string} id The chosen option id.
 */
function safeChoice(onChoice, id) {
  try {
    if (typeof onChoice === "function") onChoice(id);
  } catch (_) {
    /* ignore */
  }
}

// The pending decision the pushed screen renders. Only one modal shows at a time (decisions are ranked
// and throttled), so a single module-level slot is enough.
/** @type {{view:*, onChoice:(id:string)=>void, dismissId:string, resolved:boolean}|null} */
let _pending = null;

/**
 * Build one choice button (label + consequence note) wired to resolve the dilemma.
 * @param {{id:string,label:string,note?:string}} c The choice. @param {(id:string)=>void} resolve Resolver.
 * @returns {HTMLElement} The button.
 */
function choiceButton(c, resolve) {
  const btn = el("button", "emig-dlg-choice");
  btn.appendChild(el("div", "emig-dlg-choice-label", c.label));
  if (c.note) btn.appendChild(el("div", "emig-dlg-choice-note", c.note));
  btn.addEventListener("click", (/** @type {*} */ ev) => {
    try {
      ev.stopPropagation();
    } catch (_) {
      /* ignore */
    }
    resolve(c.id);
  });
  return btn;
}

/**
 * Build the eyebrow + title + body + (optional) quote + choice buttons into the mount.
 * @param {HTMLElement} mount The `.emig-dlg-mount` element. @param {*} view The view model.
 * @param {(id:string)=>void} resolve Resolve with the chosen id.
 */
function buildContent(mount, view, resolve) {
  mount.appendChild(el("div", "emig-dlg-eyebrow",
    (view && view.eyebrow) || loc("LOC_EMIG_DILV_EYEBROW_DEFAULT", "Refugees")));
  mount.appendChild(el("div", "emig-dlg-title", view.title));
  mount.appendChild(el("div", "emig-dlg-body", view.body));
  if (view.quote) mount.appendChild(el("div", "emig-dlg-quote", bidiIsolate(view.quote)));
  const choices = el("div", "emig-dlg-choices");
  for (const c of view.choices || []) choices.appendChild(choiceButton(c, resolve));
  mount.appendChild(choices);
}

/** The decision modal (base-UI Panel; mouse-guard-backed so its choice buttons receive input). */
class ScreenEmigrationDilemma extends Panel {
  /** Configure audio cues before attach. */
  onInitialize() {
    super.onInitialize?.();
    this.enableOpenSound = true;
    this.enableCloseSound = true;
  }

  /** Render the pending decision and wire the choices, the ✕, and click-outside/Escape dismissal. */
  onAttach() {
    try {
      super.onAttach?.();
    } catch (e) {
      derr("onAttach super failed:", e);
    }
    const p = _pending;
    // No pending decision (shouldn't happen): render nothing and let the ✕ / Escape close it. Never call
    // this.close() DURING onAttach — closing a screen mid-attach is re-entrant and can crash the engine.
    if (!p || !p.view) return;
    try {
      const mount = this.Root.querySelector(".emig-dlg-mount");
      if (mount) buildContent(mount, p.view, (/** @type {string} */ id) => this._resolveAndClose(id));
      this._wireDismissal(p.dismissId);
    } catch (e) {
      derr("onAttach body failed:", e);
    }
  }

  /** Wire the ✕ + click-outside to dismiss (in-panel clicks don't bubble). @param {string} dismissId */
  _wireDismissal(dismissId) {
    const closeBtn = this.Root.querySelector("[data-ia-close]");
    if (closeBtn) closeBtn.addEventListener("action-activate", () => this._resolveAndClose(dismissId));
    const panel = this.Root.querySelector(".emig-dlg-panel");
    if (panel) {
      panel.addEventListener("click", (/** @type {*} */ ev) => {
        try {
          ev.stopPropagation();
        } catch (_) {
          /* ignore */
        }
      });
    }
    const screen = this.Root.querySelector(".emig-dlg-screen") || this.Root;
    if (screen) screen.addEventListener("click", () => this._resolveAndClose(dismissId));
  }

  /** Any close that didn't go through a choice (engine Escape, etc.) counts as the dismiss option. */
  onDetach() {
    if (_pending && !_pending.resolved) {
      _pending.resolved = true;
      safeChoice(_pending.onChoice, _pending.dismissId);
    }
    _pending = null;
    try {
      super.onDetach?.();
    } catch (e) {
      derr("onDetach super failed:", e);
    }
  }

  /** Resolve the decision once with `id`, then close the screen. @param {string} id */
  _resolveAndClose(id) {
    if (_pending && !_pending.resolved) {
      _pending.resolved = true;
      safeChoice(_pending.onChoice, id);
    }
    try {
      this.close();
    } catch (_) {
      /* ignore */
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
      createInstance: ScreenEmigrationDilemma,
      description: "Emigration refugee-dilemma / enclave decision modal.",
      styles: ["fs://game/emigration/ui/emigration-dilemma.css"],
      content: ["fs://game/emigration/ui/emigration-dilemma.html"],
      attributes: [],
      classNames: ["emig-dlg", "w-full", "h-full"]
    });
  } else {
    derr("Controls.define unavailable; dilemma modal not registered");
  }
} catch (e) {
  derr("Controls.define THREW:", e);
}

/**
 * Show the decision modal. Resolves with the chosen option id (the ✕ / Escape / clicking outside resolve
 * as the dismiss option, default "away"). Calls `onChoice(id)` exactly once. An optional `eyebrow`
 * overrides the "Refugees" kicker and `dismissId` the dismiss choice, so the same modal hosts the
 * Cultural-Enclave decision. A silent no-op where the ContextManager is unavailable (shell / tests).
 * @param {{title:string, body:string, eyebrow?:string, dismissId?:string, quote?:string, choices:*[]}} view The model.
 * @param {(id:string)=>void} onChoice The choice callback.
 */
export function showDilemma(view, onChoice) {
  try {
    if (!view) return;
    const dismissId = typeof view.dismissId === "string" && view.dismissId.length ? view.dismissId : "away";
    _pending = { view, onChoice, dismissId, resolved: false };
    import("/core/ui/context-manager/context-manager.js")
      .then((m) => {
        try {
          const cm = /** @type {*} */ (m);
          const ContextManager = cm.default || cm.ContextManager || cm;
          if (ContextManager && typeof ContextManager.push === "function") {
            ContextManager.push(SCREEN_ID, { singleton: true, createMouseGuard: true });
          } else {
            derr("context-manager push unavailable; decision not shown");
          }
        } catch (e) {
          derr("showDilemma push failed:", e);
        }
      })
      .catch((e) => derr("context-manager import failed:", e));
  } catch (_) {
    /* a modal failure must never break the game */
  }
}
