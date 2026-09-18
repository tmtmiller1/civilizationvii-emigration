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
// multi-option layout instead, in its VERTICAL form: the default >2-option layout sizes each button to its own
// label, offsets all but the last with a side margin meant for a row, and then resizes them in a second layout
// pass (watched 2026-09-14, mod test 45: staggered, touching buttons and a visible jump). The vertical layout is
// a plain column: equal-width buttons, even gaps, no resize pass. Per-choice consequence cues live in each
// button's hover tooltip.
//
// showDilemma(view, onChoice) keeps its signature; every caller (refugee dilemma, enclave decision,
// self-test) is unchanged. Fully defensive: where the core dialog module is unavailable (shell / node
// tests) it is a silent no-op.
//
// View → native dialog mapping:
//   eyebrow   → the body's first line, bold and upper-cased with its `eyebrowIcon`, so the three decisions
//               (Newcomers, Refugees, Cultural Enclave) cannot be mistaken for one another
//   title     → dialog title
//   body      → the prose, soft-wrapped
//   details[] → short unwrapped lines after the prose (the refugee costs), a paragraph of their own
//   quote     → the optional attributed quote, presented like the base game's tech/civic quotes: a filigree
//               divider, then an inner frame holding the quote in italics and its attribution on its own line
//               (a decorator on screen-dialog-box adds these elements; the plain body line is the fallback)
//   choices[] → one stacked option button each (label + the consequence cue as its hover tooltip)
//   dismissId → the button ALSO wired to Escape / the ✕ / cancel (default "away")

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

/** A visible blank line between paragraphs (an empty line collapses in the native dialog). */
const PARAGRAPH_BREAK = "[N]\u00a0[N]";

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

/** @type {Map<string, string>} Quotes waiting for their dialog to attach, by dialog title. */
const pendingQuotes = new Map();
/** Whether the screen-dialog-box decorator that draws quotes is registered. */
let quoteDecoratorReady = false;

/**
 * Split a display quote (`"text" who, source`) into the quote and its attribution. The break is the closing
 * quotation mark, which is unambiguous because an attribution never contains one; it used to be an em dash,
 * which also got printed at the head of the attribution line. The attribution now stands on its own line
 * with no dash in front of it.
 * @param {string} q The display string. @returns {{text:string, who:string}} The parts ("" who when unsplittable).
 */
export function splitQuote(q) {
  const s = typeof q === "string" ? q.trim() : "";
  const at = s.lastIndexOf("\" ");
  if (at <= 0) return { text: s, who: "" };
  return { text: s.slice(0, at + 1), who: s.slice(at + 2).trim() };
}

/**
 * Faux italics for the quote. GameFace has no italic face: `font-style: italic` collapses the line to 0x0 (mod
 * test 53), while a skew draws the same slant. Each wrapped row is its own element, so each skews about its centre.
 */
const QUOTE_SLANT = "skewX(-8deg)";

/**
 * The quote and its attribution as display rows, each wrapped at the body's width so the quote never widens the
 * dialog (a single 125-character row stretched the frame to twice the body's width, mod test 53). Pure.
 * @param {string} quote The display quote. @param {number} [maxLen] Row length.
 * @returns {{text:string[], who:string[]}} The wrapped rows.
 */
export function quoteRows(quote, maxLen = BODY_WRAP) {
  const parts = splitQuote(quote);
  /** @param {string} s A part. @returns {string[]} Its rows. */
  const rows = (s) => (s ? wrapParagraph(s, maxLen).split("[N]") : []);
  /** @param {string} s The quoted text. @returns {string[]} Its rows, the translation starting a new one. */
  const textRows = (s) => {
    const cut = splitTranslation(s);
    return cut ? rows(cut[0]).concat(rows(cut[1])) : rows(s);
  };
  return { text: textRows(parts.text), who: rows(parts.who) };
}

/**
 * Split `<original> (<translation>)` so the translation can start its own row. Wrapping purely on width left
 * a stray word, or just the opening bracket, marooned on the end of the original's line. Only a trailing
 * parenthetical is cut, and only when there is real text on both sides, so an English quote that merely ends
 * in a short aside is left alone.
 * @param {string} text The quoted text, including its wrapping quotation marks.
 * @returns {[string, string]|null} The two pieces, or null when there is nothing worth splitting.
 */
export function splitTranslation(text) {
  const s = typeof text === "string" ? text : "";
  const m = s.match(/^(.*?\S)\s*(\([^()]{8,}\)"?)$/s);
  if (!m) return null;
  const head = m[1].trim();
  // The head must still carry the opening quotation mark and some words of its own.
  if (head.length < 8 || !/\S\s+\S/.test(head)) return null;
  return [head, m[2].trim()];
}

/**
 * A styled text row for the quote frame. @param {string} text The text. @param {string[]} classes Its classes.
 * @param {boolean} slanted Whether to slant it as italics. @returns {HTMLElement} The row.
 */
function quoteLine(text, classes, slanted) {
  const line = document.createElement("div");
  line.classList.add("font-body", "text-accent-3", "text-center", ...classes);
  if (slanted) line.style.transform = QUOTE_SLANT;
  line.textContent = text;
  return line;
}

/**
 * The inner frame holding the slanted quote and its attribution, with the base pop-up's middle decor on top.
 * @param {{text:string[], who:string[]}} rows The wrapped rows. @returns {HTMLElement} The frame.
 */
function quoteFrame(rows) {
  const frame = document.createElement("fxs-inner-frame");
  frame.classList.add("mx-4", "mb-3", "px-4", "py-3", "self-stretch", "flex", "flex-col", "items-center");
  const decor = document.createElement("div");
  decor.classList.add("absolute", "-top-1\\.5", "img-popup-middle-decor");
  frame.appendChild(decor);
  for (const row of rows.text) frame.appendChild(quoteLine(row, ["text-base"], true));
  rows.who.forEach((row, i) => frame.appendChild(quoteLine(row, i ? ["text-sm"] : ["text-sm", "mt-2"], false)));
  return frame;
}

/**
 * The quote block: the base game's filigree divider, then the framed quote (the tech/civic completion pop-up's
 * own treatment: `fxs-inner-frame`, `img-popup-middle-decor`, `text-accent-3`).
 * @param {string} quote The display string. @returns {HTMLElement} The block.
 */
function quoteBlock(quote) {
  const block = document.createElement("div");
  block.classList.add("flex", "flex-col", "items-center", "w-full", "emig-quote-block");
  const divider = document.createElement("div");
  divider.classList.add("filigree-divider-h3", "self-center");
  block.appendChild(divider);
  block.appendChild(quoteFrame(quoteRows(quote)));
  return block;
}

/**
 * The pending quote for a dialog root, removed from the queue, or "" when the dialog is not one of ours.
 * @param {*} root The dialog element. @returns {string} The quote.
 */
function takePendingQuote(root) {
  const title = root && typeof root.getAttribute === "function" ? root.getAttribute("title") : null;
  if (!title || !pendingQuotes.has(title)) return "";
  const quote = pendingQuotes.get(title) || "";
  pendingQuotes.delete(title);
  return quote;
}

/**
 * Insert the quote block right after the dialog body (above the buttons), or at the end of the frame.
 * @param {*} root The dialog element. @param {string} quote The display quote.
 */
function insertQuote(root, quote) {
  const body = root.querySelector(".font-body.text-base");
  const host = body && body.parentElement ? body.parentElement : root.querySelector(".screen-dialog-box__dialog-wrapper");
  if (host) host.insertBefore(quoteBlock(quote), body ? body.nextSibling : null);
}

/** Decorates every screen-dialog-box; acts only on a dialog whose title has a pending quote. */
class QuoteDialogDecorator {
  /** @param {*} val The dialog component (its `.Root` is the element). */
  constructor(val) {
    this.dialog = val;
  }

  /** Lifecycle hook fired before the dialog attaches. */
  beforeAttach() {}

  /** After the dialog built its frame and body: insert the quote block between the body and the buttons. */
  afterAttach() {
    try {
      const root = this.dialog && this.dialog.Root;
      const quote = takePendingQuote(root);
      if (quote) insertQuote(root, quote);
    } catch (e) {
      derr("quote block failed:", e);
    }
  }

  /** Lifecycle hook fired before the dialog detaches. */
  beforeDetach() {}

  /** Lifecycle hook fired after the dialog detaches. */
  afterDetach() {}
}

/** Register the quote decorator once. A silent no-op where the Controls API is unavailable (node tests). */
function installQuoteDecorator() {
  if (quoteDecoratorReady) return;
  try {
    if (typeof Controls === "undefined" || typeof Controls.decorate !== "function") return;
    Controls.decorate("screen-dialog-box", (/** @type {*} */ val) => new QuoteDialogDecorator(val));
    quoteDecoratorReady = true;
  } catch (e) {
    derr("quote decorator install failed:", e);
  }
}

/**
 * The category line that opens the body: the eyebrow in bold capitals, after its icon when one is given.
 * @param {{eyebrow?:string, eyebrowIcon?:string}} view The view model. @returns {string} The line, or "".
 */
function eyebrowLine(view) {
  if (typeof view.eyebrow !== "string" || !view.eyebrow) return "";
  const icon = typeof view.eyebrowIcon === "string" && view.eyebrowIcon ? "[icon:" + view.eyebrowIcon + "] " : "";
  return icon + "[B]" + view.eyebrow.toUpperCase() + "[/B]";
}

/**
 * The dialog body, one paragraph per part: the category line, the prompt prose soft-wrapped to a tidy width,
 * the short detail lines (unwrapped), and the optional attributed quote.
 * @param {{eyebrow?:string, eyebrowIcon?:string, body?:string, details?:string[], quote?:string}} view The view
 *   model. @returns {string} The composed body.
 */
function composeBody(view) {
  /** @type {string[]} */
  const parts = [];
  const eyebrow = eyebrowLine(view);
  if (eyebrow) parts.push(eyebrow);
  const body = softWrap(typeof view.body === "string" ? view.body : "", BODY_WRAP);
  if (body) parts.push(body);
  if (Array.isArray(view.details) && view.details.length) parts.push(view.details.join("[N]"));
  // With the decorator the quote is drawn as its own framed block (see quoteBlock); without it, a body line.
  if (view.quote && !quoteDecoratorReady) parts.push(softWrap(bidiIsolate(view.quote), BODY_WRAP));
  // A paragraph break is a line holding a no-break space: the native dialog renders each [N] line as its own
  // paragraph and collapses an EMPTY one to zero height (watched 2026-09-14, mod test 50: the category line,
  // the costs and the quote ran straight into the prose). Existing [N][N] breaks in the prose get the same.
  return parts.join(PARAGRAPH_BREAK).replace(/\[N\]\[N\]/g, PARAGRAPH_BREAK);
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
 * @param {{title:string, body:string, eyebrow?:string, eyebrowIcon?:string, details?:string[], dismissId?:string,
 *   quote?:string, choices:*[]}} view The model.
 * @param {(id:string)=>void} onChoice The choice callback.
 */
export function showDilemma(view, onChoice) {
  try {
    if (!view) return;
    installQuoteDecorator();
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
    if (view.quote && quoteDecoratorReady) pendingQuotes.set(title, bidiIsolate(view.quote));
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
              mgr.createDialog_MultiOption({ title, body, canClose: true, displayQueue: DISPLAY_QUEUE, options, layout: "vertical" });
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
