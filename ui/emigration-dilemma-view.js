// emigration-dilemma-view.js
//
// The refugee-dilemma MODAL. A UI mod can't inject a real engine narrative event, so this renders a
// centered panel styled to read like the game's own narrative / discovery pop-ups: a click-blocking
// guard, a dark bronze-trimmed frame, a title, a line of prose, and the choices as buttons. Choosing
// (or clicking outside, which counts as "turn them away") closes the modal and runs the callback.
//
// Pure DOM + a self-injected stylesheet, shown from the gameplay pass context (the same place the
// mod's toasts render). Fully defensive: with no DOM it's a silent no-op.

import { loc } from "/emigration/ui/emigration-loc.js";

// The world-input gate (core ViewManager). A mod overlay is only VISUALLY on top of the map; Civ VII
// still routes clicks/selection/camera to the world unless `ViewManager.isWorldInputAllowed` is false
// (the same lever ContextManager flips when it pushes a real screen). Without it the greyed map keeps
// input and the choice buttons never receive a click (the player can only Escape). Loaded once via a
// guarded dynamic import so this module stays engine-free for tests/shell and degrades to a no-op.
/** @type {*} */
let _viewManager = null;
try {
  import("/core/ui/views/view-manager.js")
    .then((m) => { const mm = /** @type {*} */ (m); _viewManager = (mm && (mm.default || mm.ViewManager)) || null; })
    .catch(() => { /* no core view-manager (shell/test) - Escape still exits */ });
} catch (_) {
  /* dynamic import unavailable - overlay still renders, Escape still exits */
}

/**
 * Turn world (map/selection/camera) input off while a modal is open, or restore it. Returns the prior
 * state so the caller can restore exactly what it found (never force-enables input a screen had off).
 * @param {boolean} allow Whether world input should be allowed. @returns {boolean|null} The prior state, or null.
 */
function setWorldInput(allow) {
  try {
    if (!_viewManager) return null;
    const prior = _viewManager.isWorldInputAllowed;
    _viewManager.isWorldInputAllowed = allow;
    return typeof prior === "boolean" ? prior : null;
  } catch (_) {
    return null;
  }
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
 * The currently focused element, read defensively (null when unreadable, e.g. off-DOM in tests).
 * @returns {*} The active element, or null.
 */
function activeEl() {
  try {
    return document.activeElement;
  } catch (_) {
    return null;
  }
}

/**
 * Move focus to `node` if it can take focus. Guarded: focus is a nicety, never critical to the modal.
 * @param {*} node A focusable element, or null.
 */
function focusNode(node) {
  try {
    if (node && typeof node.focus === "function") node.focus();
  } catch (_) {
    /* ignore */
  }
}

// Styled to sit as a native Civ VII pop-up: a full-screen dim guard, a centered panel in the game's
// dark gradient with a bronze frame + gold highlight, TitleFont heading, BodyFont prose, and choice
// rows that light up on hover. Mirrors the toast palette (emigration-feedback.js) for consistency.
// NOTE: deliberately uses only widely-supported CSS (explicit top/left/right/bottom rather than the
// `inset` shorthand, an explicit width + max-width rather than `min()`), because the Mac GameFace
// build can silently drop newer CSS, which would leave the full-screen click-guard mispositioned.
const CSS =
  ".emig-dlg-guard{position:fixed;top:0;left:0;right:0;bottom:0;z-index:200;display:flex;" +
  "align-items:center;justify-content:center;" +
  "background:rgba(4,6,10,0.55);animation:emig-dlg-fade 0.2s ease-out;}" +
  '.emig-dlg-panel{position:relative;width:34rem;max-width:86vw;max-height:84vh;overflow-y:auto;padding:1.1rem 1.4rem 1.2rem;' +
  'font-family:"BodyFont","BodyFont-JP","BodyFont-KR","BodyFont-SC","BodyFont-TC";color:#e8d8b4;' +
  "background:linear-gradient(180deg,rgba(28,32,44,0.99) 0%,rgba(9,12,19,0.99) 100%);" +
  "border:0.0833rem solid #8c7e62;border-radius:0.22rem;" +
  "box-shadow:0 0 0 0.0555rem rgba(0,0,0,0.7),inset 0 0 0 0.0555rem rgba(240,188,120,0.22)," +
  "0 0.6rem 2rem rgba(0,0,0,0.75);animation:emig-dlg-rise 0.24s ease-out;}" +
  '.emig-dlg-eyebrow{font-family:"TitleFont";font-size:var(--dg-fs-72);letter-spacing:0.16em;text-transform:uppercase;' +
  "color:#f0bc78;opacity:0.85;margin-bottom:0.2rem;padding-right:1.8rem;}" +
  '.emig-dlg-title{font-family:"TitleFont";font-size:var(--dg-fs-120);color:#f4d79e;margin-bottom:0.55rem;padding-right:1.8rem;}' +
  // A guaranteed, visible dismiss affordance (the ✕ corner button): the reported failure mode is a
  // modal that can only be closed with Escape, so a player who doesn't know that is trapped. The button
  // resolves the dismiss option exactly like Escape / click-outside; Escape remains as the keyboard path.
  ".emig-dlg-close{position:absolute;top:0.5rem;right:0.6rem;width:1.7rem;height:1.7rem;line-height:1;padding:0;" +
  "cursor:pointer;color:#e8d8b4;background:rgba(16,20,30,0.6);border:0.0555rem solid rgba(201,162,76,0.4);" +
  "border-radius:0.16rem;font-size:1rem;transition:background 0.12s ease,border-color 0.12s ease;}" +
  ".emig-dlg-close:hover{background:rgba(60,52,32,0.85);border-color:#f0bc78;color:#f4d79e;}" +
  ".emig-dlg-body{font-size:var(--dg-fs-95);line-height:1.5;margin-bottom:0.9rem;}" +
  ".emig-dlg-choices{display:flex;flex-direction:column;gap:0.45rem;}" +
  // white-space:normal overrides the GameFace <button> default (buttons don't wrap their text, so the
  // multi-line consequence note ran off the side); min-width:0 lets the button shrink as a flex item
  // instead of sizing to its longest line. overflow-wrap on the text elements is belt-and-suspenders for
  // a single long origin/place name. All old, widely-supported CSS per the note above.
  ".emig-dlg-choice{text-align:left;cursor:pointer;padding:0.5rem 0.7rem;color:#e8d8b4;white-space:normal;min-width:0;" +
  "background:linear-gradient(180deg,rgba(40,46,62,0.7),rgba(16,20,30,0.7));" +
  "border:0.0555rem solid rgba(201,162,76,0.4);border-left-width:0.22rem;border-radius:0.18rem;" +
  "transition:background 0.12s ease,border-color 0.12s ease;}" +
  ".emig-dlg-choice:hover{background:linear-gradient(180deg,rgba(60,52,32,0.85),rgba(28,24,14,0.85));" +
  "border-color:#f0bc78;}" +
  '.emig-dlg-choice-label{font-family:"TitleFont";font-size:var(--dg-fs-95);color:#f4d79e;overflow-wrap:break-word;}' +
  ".emig-dlg-choice-note{font-size:var(--dg-fs-85);opacity:0.8;margin-top:0.1rem;overflow-wrap:break-word;}" +
  // A single enclave-level epigraph, sat between the body and the choices (not per option).
  ".emig-dlg-quote{font-size:0.8rem;font-style:italic;opacity:0.72;margin:0 0 0.9rem;" +
  "padding-left:0.6rem;border-left:0.14rem solid rgba(201,162,76,0.42);line-height:1.45;" +
  // Base direction LTR (the attribution/gloss is English); the RTL originals are bidi-isolated inline
  // (see bidiIsolate) so an Arabic/Persian/Hebrew run renders right-to-left without dragging the
  // surrounding punctuation, quotes, and attribution with it.
  "direction:ltr;unicode-bidi:isolate;}" +
  "@keyframes emig-dlg-fade{from{opacity:0;}to{opacity:1;}}" +
  "@keyframes emig-dlg-rise{from{opacity:0;transform:translateY(0.7rem);}to{opacity:1;transform:translateY(0);}}";

/** Inject the dilemma stylesheet once. */
function injectStyle() {
  try {
    if (document.getElementById("emig-dlg-style")) return;
    const s = document.createElement("style");
    s.id = "emig-dlg-style";
    s.textContent = CSS;
    document.head.appendChild(s);
  } catch (_) {
    /* ignore */
  }
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

/** A single right-to-left character (Hebrew + Arabic/Persian script families). */
const RTL_CHAR = "\\u0590-\\u05FF\\u0600-\\u06FF\\u0750-\\u077F\\u08A0-\\u08FF\\uFB1D-\\uFDFF\\uFE70-\\uFEFF";
/** A maximal RTL run: an RTL char, then any RTL/space/punctuation, ending on an RTL char. */
const RTL_RUN = new RegExp("[" + RTL_CHAR + "](?:[" + RTL_CHAR + "\\s.,;:?!()\\u060C\\u061B\\u061F]*[" + RTL_CHAR + "])?", "g");

/**
 * Wrap each right-to-left run (Arabic/Persian/Hebrew — e.g. a native-language quote original) in Unicode
 * isolates (FSI/PDI, U+2068/U+2069) so it lays out right-to-left as a self-contained island inside the
 * LTR line, without dragging the surrounding quotes, parenthetical gloss, or English attribution with it.
 * A no-op for LTR-only text.
 * @param {string} s The display string. @returns {string} The bidi-isolated string.
 */
function bidiIsolate(s) {
  return typeof s === "string" ? s.replace(RTL_RUN, "⁨$&⁩") : s;
}

/**
 * Build one choice button (label + consequence note) wired to resolve the dilemma.
 * @param {{id:string,label:string,note?:string}} c The choice.
 * @param {(id:string)=>void} resolve Resolve with the chosen id.
 * @returns {HTMLElement} The button.
 */
function choiceButton(c, resolve) {
  const btn = el("button", "emig-dlg-choice");
  btn.appendChild(el("div", "emig-dlg-choice-label", c.label));
  if (c.note) btn.appendChild(el("div", "emig-dlg-choice-note", c.note));
  btn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    resolve(c.id);
  });
  return btn;
}

/**
 * Build the dilemma panel (eyebrow + title + body + optional epigraph quote + choice buttons). Clicks
 * inside the panel don't bubble to the guard (so they don't count as a dismiss). A single attributed
 * quote (Cultural Enclave decisions) is shown once between the body and the choices, with any RTL
 * original bidi-isolated so mixed-script quotes read correctly.
 * @param {{title:string, body:string, eyebrow?:string, quote?:string, choices:*[]}} view The model.
 * @param {(id:string)=>void} resolve Resolve the dilemma with a choice id.
 * @param {string} dismissId The option id the ✕ / Escape / click-outside resolves as.
 * @returns {HTMLElement} The panel element.
 */
function buildPanel(view, resolve, dismissId) {
  const panel = el("div", "emig-dlg-panel");
  panel.addEventListener("click", (ev) => ev.stopPropagation());
  const close = el("button", "emig-dlg-close", "✕"); // ✕ — glyph needs no localization
  try {
    const dismissLabel = loc("LOC_EMIG_DILV_DISMISS", "Dismiss");
    close.setAttribute("aria-label", dismissLabel);
    close.title = dismissLabel;
  } catch (_) {
    /* aria/title are a nicety; never block the button */
  }
  close.addEventListener("click", (ev) => {
    ev.stopPropagation();
    resolve(dismissId);
  });
  panel.appendChild(close);
  panel.appendChild(el("div", "emig-dlg-eyebrow", (view && view.eyebrow) || loc("LOC_EMIG_DILV_EYEBROW_DEFAULT", "Refugees")));
  panel.appendChild(el("div", "emig-dlg-title", view.title));
  panel.appendChild(el("div", "emig-dlg-body", view.body));
  if (view.quote) panel.appendChild(el("div", "emig-dlg-quote", bidiIsolate(view.quote)));
  const choices = el("div", "emig-dlg-choices");
  for (const c of view.choices || []) choices.appendChild(choiceButton(c, resolve));
  panel.appendChild(choices);
  return panel;
}

/**
 * Show the refugee-dilemma modal. Resolves with the chosen option id (clicking the dim area outside
 * the panel resolves as the dismiss option, default "away"). Calls `onChoice(id)` exactly once. An
 * optional `eyebrow` overrides the "Refugees" kicker, and `dismissId` the click-outside/Escape choice,
 * so the same modal can host the Cultural Quarter decision.
 * @param {{title:string, body:string, eyebrow?:string, dismissId?:string, choices:*[]}} view The model.
 * @param {(id:string)=>void} onChoice The choice callback.
 */
export function showDilemma(view, onChoice) {
  try {
    const root = document.body || document.documentElement;
    if (!root || !view) return;
    injectStyle();
    let done = false;
    // Take world input while the modal is up so the map behind can't swallow the button clicks (the
    // reported "can only press Escape" bug). Restore the exact prior state when the modal resolves.
    const priorWorldInput = setWorldInput(false);
    // Remember what had focus so we can hand it back exactly on close (never steal it permanently).
    const priorFocus = activeEl();
    const dismissId = typeof view.dismissId === "string" && view.dismissId.length ? view.dismissId : "away";
    const guard = el("div", "emig-dlg-guard");
    // Escape always dismisses (as the dismiss option), so the full-screen input guard can never trap the
    // player if a pointer click doesn't register (a Mac GameFace input quirk). Listener is removed when
    // the dilemma resolves, however it resolves.
    const onKey = (/** @type {*} */ ev) => {
      if (ev && (ev.key === "Escape" || ev.keyCode === 27)) {
        ev.stopPropagation();
        resolve(dismissId);
      }
    };
    const resolve = (/** @type {string} */ id) => {
      if (done) return;
      done = true;
      try {
        window.removeEventListener("keydown", onKey, true);
        guard.remove();
        setWorldInput(priorWorldInput === false ? false : true); // hand world input back as we found it
        focusNode(priorFocus); // restore focus to whatever had it before the modal
      } catch (_) {
        /* ignore */
      }
      safeChoice(onChoice, id);
    };
    guard.appendChild(buildPanel(view, resolve, dismissId));
    guard.addEventListener("click", () => resolve(dismissId)); // click outside the panel = dismiss
    root.appendChild(guard);
    // Pull keyboard/gamepad focus into the modal so navigation targets its buttons even if another
    // surface currently holds focus (the focus-lock case), and so there's a visible focus ring to act
    // on. This is the DOM-level lever available from the gameplay-pass context; if in-game testing shows
    // a real engine screen still capturing input, the follow-up is to defer the modal until no blocking
    // context is active. Guarded inside focusNode: a missing focus() must never break the modal.
    focusNode(guard.querySelector(".emig-dlg-choice") || guard.querySelector(".emig-dlg-close"));
    try {
      window.addEventListener("keydown", onKey, true); // Escape = turn away (keyboard safety exit)
    } catch (_) {
      /* no window/keydown, the click exits still apply */
    }
  } catch (_) {
    /* a modal failure must never break the game */
  }
}
