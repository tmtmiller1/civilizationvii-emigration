// emigration-dilemma-view.js
//
// The refugee-dilemma / Cultural-Enclave DECISION pop-up. Rendered with the GAME'S OWN native decision
// dialog — DialogBoxManager.createDialog_CustomOptions — laid out like a narrative-event pop-up: a framed
// card with a title, flavour body, and a vertical list of choice "chooser" cards (icon + title +
// consequence line). Input is owned by the engine's dialog layer and each choice is a real dialog option,
// so the choice cards, Escape, and the ✕ ALWAYS respond.
//
// WHY THIS SHAPE: an earlier build hand-rolled a ContextManager Panel whose buttons could come up dead
// (the "choices are unclickable, no way to X out" report). Using the engine's dialog removes that whole
// class of failure — we no longer own the input path, the engine does — and the chooser-card layout is
// exactly how the base game renders its own multi-choice decisions.
//
// showDilemma(view, onChoice) keeps its signature; every caller (refugee dilemma, enclave decision,
// self-test) is unchanged. Fully defensive: where the core dialog module (or a DOM) is unavailable
// (shell / node tests) it is a silent no-op.
//
// View → native dialog mapping:
//   title     → dialog title
//   body      → dialog body (the optional attributed `quote` is appended on its own line)
//   choices[] → one clickable chooser card each (icon + label + the consequence cue as a description line)
//   dismissId → the card ALSO wired to Escape / the ✕ / cancel (default "away")
//   eyebrow   → not shown (the native pop-up supplies its own framing; the title carries the context)

import { loc } from "/emigration/ui/emigration-loc.js";

// The engine dialog queue for generic in-game decisions (as used by the base game's own system pop-ups).
const DISPLAY_QUEUE = "SystemMessage";

// A per-choice icon for the chooser card. A choice may override with `choice.icon`; otherwise it is keyed
// off the choice id, falling back to a neutral yield icon. These are stock engine yield glyphs, so they
// always resolve.
/** @type {Record<string, string>} */
const CHOICE_ICONS = {
  welcome: "fs://game/yield_happiness",
  frontier: "fs://game/yield_gold",
  away: "fs://game/yield_influence",
  ignore: "fs://game/yield_influence"
};
const DEFAULT_ICON = "fs://game/yield_influence";

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
 * The dialog body: the prompt prose, with the optional attributed quote appended on its own line.
 * @param {{body?:string, quote?:string}} view The view model. @returns {string} The composed body.
 */
function composeBody(view) {
  const body = typeof view.body === "string" ? view.body : "";
  const quote = view.quote ? bidiIsolate(view.quote) : "";
  return quote ? (body + "[N][N]" + quote) : body;
}

/**
 * Make a `div` with utility classes + optional already-localized text.
 * @param {string} cls Space-separated class list. @param {string} [text] Text content.
 * @returns {HTMLElement} The element.
 */
function div(cls, text) {
  const e = document.createElement("div");
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/**
 * Build one narrative-style chooser card: an icon on the left, the choice title, and (if present) the
 * consequence cue as a description line. The engine wraps this content in a clickable chooser button.
 * @param {{id:string,label:string,note?:string,icon?:string}} c The choice. @returns {HTMLElement} The card content.
 */
function buildChooserCard(c) {
  const card = div("flow-row items-center w-full text-left");
  const icon = document.createElement("img");
  icon.className = "size-12 mr-3 flex-none";
  icon.src = c.icon || CHOICE_ICONS[c.id] || DEFAULT_ICON;
  const text = div("flow-column flex-auto");
  text.appendChild(div("font-title text-base uppercase tracking-100", c.label));
  if (c.note) text.appendChild(div("font-body text-xs", c.note));
  card.appendChild(icon);
  card.appendChild(text);
  return card;
}

/**
 * Build the paired option + chooser-card lists for the native dialog. options[i] carries choice i's
 * action + callback; customOptions[i] is its clickable narrative chooser card. The dismiss choice is also
 * wired to Escape / cancel / the ✕. A safety-net cancel option is appended only if no choice carries the
 * dismiss id (real callers always include it).
 * @param {{choices?:{id:string,label:string,note?:string,icon?:string}[]}} view The view model.
 * @param {string} dismissId The dismiss option id. @param {(id:string)=>void} resolve One-shot resolver.
 * @returns {{options:*[], customOptions:*[]}} The paired lists.
 */
function buildDialogLists(view, dismissId, resolve) {
  const choices = Array.isArray(view.choices) ? view.choices : [];
  /** @type {*[]} */
  const options = [];
  /** @type {*[]} */
  const customOptions = [];
  for (const c of choices) {
    options.push({
      actions: c.id === dismissId ? ["cancel", "keyboard-escape"] : [],
      label: c.label,
      callback: () => resolve(c.id)
    });
    customOptions.push({ useChooserItem: true, chooserInfo: buildChooserCard(c) });
  }
  if (!choices.some((c) => c.id === dismissId)) {
    options.push({
      actions: ["cancel", "keyboard-escape"],
      label: loc("LOC_EMIG_DILV_DISMISS", "Not now"),
      callback: () => resolve(dismissId)
    });
  }
  return { options, customOptions };
}

/**
 * Show the decision pop-up in the game's own native narrative-style dialog. Resolves with the chosen
 * option id (Escape / the ✕ / cancel resolve as `view.dismissId`, default "away"). Calls `onChoice(id)`
 * exactly once. A silent no-op where the core dialog module or a DOM is unavailable (shell / node tests).
 * @param {{title:string, body:string, eyebrow?:string, dismissId?:string, quote?:string, choices:*[]}} view The model.
 * @param {(id:string)=>void} onChoice The choice callback.
 */
export function showDilemma(view, onChoice) {
  try {
    if (!view || typeof document === "undefined") return;
    const dismissId = (typeof view.dismissId === "string" && view.dismissId.length) ? view.dismissId : "away";
    let resolved = false;
    const resolve = (/** @type {string} */ id) => {
      if (resolved) return;
      resolved = true;
      safeChoice(onChoice, id);
    };
    const title = (typeof view.title === "string" && view.title.length)
      ? view.title
      : loc("LOC_EMIG_DILV_EYEBROW_DEFAULT", "Refugees");
    const body = composeBody(view);
    const { options, customOptions } = buildDialogLists(view, dismissId, resolve);
    const present = () => {
      import("/core/ui/dialog-box/manager-dialog-box.js")
        .then((m) => {
          try {
            const mod = /** @type {*} */ (m);
            const mgr = mod && (mod.DialogBoxManager || mod.default);
            if (mgr && typeof mgr.createDialog_CustomOptions === "function") {
              mgr.createDialog_CustomOptions({
                title, body, canClose: true, displayQueue: DISPLAY_QUEUE,
                custom: true, styles: true, name: "emigration-decision",
                options, customOptions
              });
            } else if (mgr && typeof mgr.createDialog_MultiOption === "function") {
              // Fallback: a build without CustomOptions still gets a working (plainer) decision dialog.
              mgr.createDialog_MultiOption({ title, body, canClose: true, displayQueue: DISPLAY_QUEUE, options });
            } else {
              derr("DialogBoxManager decision API unavailable; decision not shown");
            }
          } catch (e) {
            derr("showDilemma failed:", e);
          }
        })
        .catch((e) => derr("dialog-box import failed:", e));
    };
    // CRITICAL: present on a deferred tick, NOT synchronously. The real dilemma fires from inside the
    // PlayerTurnActivated engine-event handler (emigration-main.onTurnActivated → runPass → maybeDilemma),
    // and Civ VII will not surface a working, input-receiving modal raised from inside an engine event —
    // the pop-up either doesn't appear or its buttons are dead. Deferring to a timer lets the event stack
    // unwind first, which is exactly why the self-test path (which already wraps this in a timer) works in
    // isolation while the in-game trigger did not. A short delay gives the turn transition room to settle.
    if (typeof setTimeout === "function") setTimeout(present, 80);
    else present();
  } catch (_) {
    /* a decision-modal failure must never break the game */
  }
}
