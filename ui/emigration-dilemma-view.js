// emigration-dilemma-view.js
//
// The refugee-dilemma / Cultural-Enclave DECISION pop-up. Rendered with the GAME'S OWN native decision
// dialog — DialogBoxManager.createDialog_MultiOption: a framed pop-up with a title, the flavour body, and
// one stacked button per choice. Input is owned by the engine's dialog layer and each choice is a real
// dialog option, so the buttons, Escape, and the ✕ ALWAYS respond.
//
// WHY THIS SHAPE: an earlier build hand-rolled a ContextManager Panel whose buttons could come up dead
// (the "choices are unclickable, no way to X out" report). The engine's dialog removes that whole class of
// failure — we no longer own the input path, the engine does. NOTE: the fancier createDialog_CustomOptions
// "chooser card" path (icons + per-choice descriptions) was tried and rendered as a COLLAPSED horizontal
// strip in-game (it needs layout wrappers the base UI supplies internally), so we use the plain, reliable
// multi-option layout instead. Per-choice consequence cues live in each button's hover tooltip.
//
// showDilemma(view, onChoice) keeps its signature; every caller (refugee dilemma, enclave decision,
// self-test) is unchanged. Fully defensive: where the core dialog module is unavailable (shell / node
// tests) it is a silent no-op.
//
// View → native dialog mapping:
//   title     → dialog title
//   body      → dialog body (the optional attributed `quote` is appended on its own line)
//   choices[] → one stacked option button each (label + the consequence cue as its hover tooltip)
//   dismissId → the button ALSO wired to Escape / the ✕ / cancel (default "away")
//   eyebrow   → not shown (the native pop-up supplies its own framing; the title carries the context)

import { loc } from "/emigration/ui/emigration-loc.js";

// The engine dialog queue for generic in-game decisions (as used by the base game's own system pop-ups).
const DISPLAY_QUEUE = "SystemMessage";

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

// Soft-wrap width for the dialog body. The native dialog sizes/reads best as a tidy block rather than one
// edge-to-edge line, so we insert engine newline tokens ([N]) at word boundaries near this many characters.
const BODY_WRAP = 64;

/**
 * Word-wrap one paragraph to ~maxLen characters per line using engine newline tokens ([N]), never
 * splitting a word. A single over-long word is left on its own line.
 * @param {string} para The paragraph. @param {number} maxLen Target line length. @returns {string} Wrapped.
 */
function wrapParagraph(para, maxLen) {
  const words = para.split(/\s+/).filter(Boolean);
  if (!words.length) return para;
  /** @type {string[]} */
  const lines = [];
  let line = "";
  for (const w of words) {
    if (line && (line.length + 1 + w.length) > maxLen) {
      lines.push(line);
      line = w;
    } else {
      line = line ? (line + " " + w) : w;
    }
  }
  if (line) lines.push(line);
  return lines.join("[N]");
}

/**
 * Soft-wrap a display string, preserving any paragraph breaks the source already has ([N]).
 * @param {string} s The string. @param {number} maxLen Target line length. @returns {string} Wrapped.
 */
function softWrap(s, maxLen) {
  if (typeof s !== "string" || !s) return s;
  return s.split("[N]").map((seg) => wrapParagraph(seg, maxLen)).join("[N]");
}

/**
 * The dialog body: the prompt prose, soft-wrapped to a tidy width, with the optional attributed quote
 * appended on its own line.
 * @param {{body?:string, quote?:string}} view The view model. @returns {string} The composed body.
 */
function composeBody(view) {
  const body = softWrap(typeof view.body === "string" ? view.body : "", BODY_WRAP);
  const quote = view.quote ? softWrap(bidiIsolate(view.quote), BODY_WRAP) : "";
  return quote ? (body + "[N][N]" + quote) : body;
}

/**
 * Build the native dialog's option buttons — one per choice (label + the consequence cue as its hover
 * tooltip), each wired to resolve the decision once. The dismiss choice is also bound to Escape / cancel /
 * the ✕. A safety-net cancel option is appended only if no choice carries the dismiss id (real callers
 * always include it, so it normally adds no visible button).
 * @param {{choices?:{id:string,label:string,note?:string}[]}} view The view model.
 * @param {string} dismissId The dismiss option id. @param {(id:string)=>void} resolve One-shot resolver.
 * @returns {{actions:string[], label:string, tooltip?:string, callback:()=>void}[]} The option buttons.
 */
function buildOptions(view, dismissId, resolve) {
  const choices = Array.isArray(view.choices) ? view.choices : [];
  const options = choices.map((c) => ({
    actions: c.id === dismissId ? ["cancel", "keyboard-escape"] : [],
    label: c.label,
    tooltip: c.note || void 0,
    callback: () => resolve(c.id)
  }));
  if (!choices.some((c) => c.id === dismissId)) {
    options.push({
      actions: ["cancel", "keyboard-escape"],
      label: loc("LOC_EMIG_DILV_DISMISS", "Not now"),
      tooltip: void 0,
      callback: () => resolve(dismissId)
    });
  }
  return options;
}

/**
 * Show the decision pop-up in the game's own native multi-option dialog. Resolves with the chosen
 * option id (Escape / the ✕ / cancel resolve as `view.dismissId`, default "away"). Calls `onChoice(id)`
 * exactly once. A silent no-op where the core dialog module or a DOM is unavailable (shell / node tests).
 * @param {{title:string, body:string, eyebrow?:string, dismissId?:string, quote?:string, choices:*[]}} view The model.
 * @param {(id:string)=>void} onChoice The choice callback.
 */
export function showDilemma(view, onChoice) {
  try {
    if (!view) return;
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
    const options = buildOptions(view, dismissId, resolve);
    const present = () => {
      import("/core/ui/dialog-box/manager-dialog-box.js")
        .then((m) => {
          try {
            const mod = /** @type {*} */ (m);
            const mgr = mod && (mod.DialogBoxManager || mod.default);
            if (mgr && typeof mgr.createDialog_MultiOption === "function") {
              // The plain multi-option dialog: a framed pop-up with the title, the prompt body, and one
              // stacked button per choice. This is the layout shipped mods use; the fancier
              // createDialog_CustomOptions "chooser card" path rendered as a collapsed strip here, so it
              // is intentionally NOT used.
              mgr.createDialog_MultiOption({ title, body, canClose: true, displayQueue: DISPLAY_QUEUE, options });
            } else {
              derr("DialogBoxManager.createDialog_MultiOption unavailable; decision not shown");
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
