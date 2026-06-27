// emigration-dilemma-view.js
//
// The refugee-dilemma MODAL. A UI mod can't inject a real engine narrative event, so this renders a
// centered panel styled to read like the game's own narrative / discovery pop-ups: a click-blocking
// guard, a dark bronze-trimmed frame, a title, a line of prose, and the choices as buttons. Choosing
// (or clicking outside, which counts as "turn them away") closes the modal and runs the callback.
//
// Pure DOM + a self-injected stylesheet, shown from the gameplay pass context (the same place the
// mod's toasts render). Fully defensive: with no DOM it's a silent no-op.

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
  '.emig-dlg-panel{width:34rem;max-width:86vw;max-height:84vh;overflow-y:auto;padding:1.1rem 1.4rem 1.2rem;' +
  'font-family:"BodyFont","BodyFont-JP","BodyFont-KR","BodyFont-SC","BodyFont-TC";color:#e8d8b4;' +
  "background:linear-gradient(180deg,rgba(28,32,44,0.99) 0%,rgba(9,12,19,0.99) 100%);" +
  "border:0.0833rem solid #8c7e62;border-radius:0.22rem;" +
  "box-shadow:0 0 0 0.0555rem rgba(0,0,0,0.7),inset 0 0 0 0.0555rem rgba(240,188,120,0.22)," +
  "0 0.6rem 2rem rgba(0,0,0,0.75);animation:emig-dlg-rise 0.24s ease-out;}" +
  '.emig-dlg-eyebrow{font-family:"TitleFont";font-size:0.7rem;letter-spacing:0.16em;text-transform:uppercase;' +
  "color:#f0bc78;opacity:0.85;margin-bottom:0.2rem;}" +
  '.emig-dlg-title{font-family:"TitleFont";font-size:1.25rem;color:#f4d79e;margin-bottom:0.55rem;}' +
  ".emig-dlg-body{font-size:0.98rem;line-height:1.5;margin-bottom:0.9rem;}" +
  ".emig-dlg-choices{display:flex;flex-direction:column;gap:0.45rem;}" +
  ".emig-dlg-choice{text-align:left;cursor:pointer;padding:0.5rem 0.7rem;color:#e8d8b4;" +
  "background:linear-gradient(180deg,rgba(40,46,62,0.7),rgba(16,20,30,0.7));" +
  "border:0.0555rem solid rgba(201,162,76,0.4);border-left-width:0.22rem;border-radius:0.18rem;" +
  "transition:background 0.12s ease,border-color 0.12s ease;}" +
  ".emig-dlg-choice:hover{background:linear-gradient(180deg,rgba(60,52,32,0.85),rgba(28,24,14,0.85));" +
  "border-color:#f0bc78;}" +
  '.emig-dlg-choice-label{font-family:"TitleFont";font-size:0.95rem;color:#f4d79e;}' +
  ".emig-dlg-choice-note{font-size:0.82rem;opacity:0.8;margin-top:0.1rem;}" +
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
 * Build the dilemma panel (eyebrow + title + body + choice buttons). Clicks inside the panel don't
 * bubble to the guard (so they don't count as "turn away").
 * @param {{title:string, body:string, choices:{id:string,label:string,note?:string}[]}} view The model.
 * @param {(id:string)=>void} resolve Resolve the dilemma with a choice id.
 * @returns {HTMLElement} The panel element.
 */
function buildPanel(view, resolve) {
  const panel = el("div", "emig-dlg-panel");
  panel.addEventListener("click", (ev) => ev.stopPropagation());
  panel.appendChild(el("div", "emig-dlg-eyebrow", "Refugees"));
  panel.appendChild(el("div", "emig-dlg-title", view.title));
  panel.appendChild(el("div", "emig-dlg-body", view.body));
  const choices = el("div", "emig-dlg-choices");
  for (const c of view.choices || []) choices.appendChild(choiceButton(c, resolve));
  panel.appendChild(choices);
  return panel;
}

/**
 * Show the refugee-dilemma modal. Resolves with the chosen option id (clicking the dim area outside
 * the panel resolves as "away" — turning them away). Calls `onChoice(id)` exactly once.
 * @param {{title:string, body:string, choices:{id:string,label:string,note?:string}[]}} view The model.
 * @param {(id:string)=>void} onChoice The choice callback.
 */
export function showDilemma(view, onChoice) {
  try {
    const root = document.body || document.documentElement;
    if (!root || !view) return;
    injectStyle();
    let done = false;
    const guard = el("div", "emig-dlg-guard");
    // Escape always dismisses (as "turn them away"), so the full-screen input guard can never trap the
    // player if a pointer click doesn't register (a Mac GameFace input quirk). Listener is removed when
    // the dilemma resolves, however it resolves.
    const onKey = (/** @type {*} */ ev) => {
      if (ev && (ev.key === "Escape" || ev.keyCode === 27)) {
        ev.stopPropagation();
        resolve("away");
      }
    };
    const resolve = (/** @type {string} */ id) => {
      if (done) return;
      done = true;
      try {
        window.removeEventListener("keydown", onKey, true);
        guard.remove();
      } catch (_) {
        /* ignore */
      }
      safeChoice(onChoice, id);
    };
    guard.appendChild(buildPanel(view, resolve));
    guard.addEventListener("click", () => resolve("away")); // click outside the panel = turn away
    root.appendChild(guard);
    try {
      window.addEventListener("keydown", onKey, true); // Escape = turn away (keyboard safety exit)
    } catch (_) {
      /* no window/keydown — the click exits still apply */
    }
  } catch (_) {
    /* a modal failure must never break the game */
  }
}
