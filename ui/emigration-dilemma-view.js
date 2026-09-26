// emigration-dilemma-view.js
//
// The refugee-dilemma / Cultural-Enclave DECISION pop-up, rendered with the game's own native
// DialogBoxManager.createDialog_MultiOption in its vertical layout, so the engine owns the input path
// and the buttons, Escape and the close button always respond. The view's eyebrow opens the body,
// details[] follow the prose, the quote is drawn as a framed block by a screen-dialog-box decorator,
// each choice is one stacked button (note = hover tooltip), and dismissId is also wired to Escape /
// cancel. Fully defensive: a silent no-op where the core dialog module is unavailable.

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
/** @type {Set<string>} Titles of dialogs whose buttons carry [icon:] tags, waiting for their dialog to attach. */
const pendingIconTitles = new Set();
/** When to check the buttons after attach, twice: the engine's own caption pass may land a frame late. */
const CAPTION_CHECK_MS = [150, 900];
/** Whether the screen-dialog-box decorator that draws quotes is registered. */
let quoteDecoratorReady = false;

/**
 * Split a display quote (`"text" who, source`) into the quote and its attribution. The break is the closing
 * quotation mark, which is unambiguous because an attribution never contains one.
 * @param {string} q The display string. @returns {{text:string, who:string}} The parts ("" who when unsplittable).
 */
export function splitQuote(q) {
  const s = typeof q === "string" ? q.trim() : "";
  const at = s.lastIndexOf("\" ");
  if (at <= 0) return { text: s, who: "" };
  return { text: s.slice(0, at + 1), who: s.slice(at + 2).trim() };
}

/**
 * Faux italics for the quote. GameFace has no italic face: `font-style: italic` collapses the line to 0x0,
 * while a skew draws the same slant. Each wrapped row is its own element, so each skews about its center.
 */
const QUOTE_SLANT = "skewX(-8deg)";

/**
 * The quote and its attribution as display rows, each wrapped at the body's width so the quote never widens the
 * dialog. Pure.
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
 * Split `<original> (<translation>)` so the translation can start its own row. Only a trailing
 * parenthetical is cut, and only when there is real text on both sides, so an English quote that merely
 * ends in a short aside is left alone.
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
 * A styled text row for the quote frame. @param {string} text @param {string[]} classes Its classes.
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
 * A dialog's title attribute, or "" when unreadable.
 * @param {*} root The dialog element. @returns {string} The title.
 */
function dialogTitle(root) {
  const title = root && typeof root.getAttribute === "function" ? root.getAttribute("title") : null;
  return typeof title === "string" ? title : "";
}

/**
 * The pending quote for a dialog root, removed from the queue, or "" when the dialog is not one of ours.
 * @param {*} root The dialog element. @returns {string} The quote.
 */
function takePendingQuote(root) {
  const title = dialogTitle(root);
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

/**
 * Make sure every [icon:] tag in a button caption is drawn as an icon: a label still showing the literal
 * tag is re-rendered through Locale.stylize, the same call the dialog body goes through. The engine's own
 * pass normally stylizes captions itself, so this is insurance.
 * @param {*} root The dialog element. @returns {{fixed:number, sample:string}} How many labels were re-rendered,
 *   and what the first icon-bearing label reads now.
 */
function stylizeCaptions(root) {
  let fixed = 0;
  let sample = "";
  if (typeof Locale === "undefined" || typeof Locale.stylize !== "function") return { fixed, sample };
  for (const button of root.querySelectorAll("fxs-button")) {
    const caption = button.getAttribute("caption-nol10n") || button.getAttribute("caption") || "";
    if (!caption.includes("[icon:")) continue;
    const label = button.querySelector("[data-l10n-id]");
    if (!label) continue;
    if (String(label.textContent).includes("[icon:")) {
      label.innerHTML = Locale.stylize(caption);
      fixed++;
    }
    if (!sample) sample = String(label.innerHTML).slice(0, 80);
  }
  return { fixed, sample };
}

/**
 * Check a dialog's captions on each CAPTION_CHECK_MS tick, logging what was found so an in-game probe can
 * tell whether the engine drew the icons itself or this fallback had to.
 * @param {*} root The dialog element.
 */
function scheduleCaptionCheck(root) {
  if (typeof setTimeout !== "function") return;
  for (const ms of CAPTION_CHECK_MS) {
    setTimeout(() => {
      try {
        const r = stylizeCaptions(root);
        // Only speaks up when the fallback actually had to act.
        if (r.fixed > 0) {
          console.warn("[Emigration.dilemma] caption icons at " + ms + "ms: re-rendered " + r.fixed
            + " label(s); first reads: " + r.sample);
        }
      } catch (e) {
        derr("caption stylize failed:", e);
      }
    }, ms);
  }
}

/**
 * Remember that a dialog's buttons carry [icon:] tags, so the decorator checks them once it attaches.
 * @param {string} title The dialog title. @param {{label:string}[]} options The option buttons.
 */
function noteIconCaptions(title, options) {
  if (!quoteDecoratorReady) return;
  if (options.some((o) => typeof o.label === "string" && o.label.includes("[icon:"))) pendingIconTitles.add(title);
}

/**
 * Decorates every screen-dialog-box; acts only on a dialog whose title has a pending quote or pending
 * icon-bearing captions.
 */
class QuoteDialogDecorator {
  /** @param {*} val The dialog component (its `.Root` is the element). */
  constructor(val) {
    this.dialog = val;
  }

  /** Lifecycle hook fired before the dialog attaches. */
  beforeAttach() {}

  /**
   * After the dialog built its frame and body: insert the quote block between the body and the buttons, and
   * arrange for icon tags in the buttons to be checked.
   */
  afterAttach() {
    try {
      const root = this.dialog && this.dialog.Root;
      const quote = takePendingQuote(root);
      if (quote) insertQuote(root, quote);
      if (pendingIconTitles.delete(dialogTitle(root))) scheduleCaptionCheck(root);
    } catch (e) {
      derr("quote block failed:", e);
    }
  }

  /** Lifecycle hook fired before the dialog detaches. */
  beforeDetach() {}

  /** Lifecycle hook fired after the dialog detaches. */
  afterDetach() {}
}

/** The id of the off-screen divider that keeps the filigree texture resident. */
const WARM_ID = "emig-filigree-warm";

/**
 * Pre-load the filigree divider's texture: the engine decodes a background image asynchronously and does
 * not repaint when the decode lands, so a hidden divider parked off-screen at load (faintly opaque so it
 * is actually painted) makes the texture resident before any dialog needs it. Idempotent; a no-op off-engine.
 */
function warmFiligree() {
  try {
    if (typeof document === "undefined" || !document.body || document.getElementById(WARM_ID)) return;
    const el = document.createElement("div");
    el.id = WARM_ID;
    el.classList.add("filigree-divider-h3");
    el.style.position = "absolute";
    el.style.left = "-4000px";
    el.style.top = "0";
    el.style.opacity = "0.01";
    el.style.pointerEvents = "none";
    document.body.appendChild(el);
  } catch (e) {
    derr("filigree warm-up failed:", e);
  }
}
// Long before the first dialog: the game-scope scripts load well ahead of the first turn pass.
if (typeof setTimeout === "function") setTimeout(warmFiligree, 1500);

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
  // A paragraph break is a line holding a no-break space: the native dialog collapses an EMPTY [N] line
  // to zero height. Existing [N][N] breaks in the prose get the same.
  return parts.join(PARAGRAPH_BREAK).replace(/\[N\]\[N\]/g, PARAGRAPH_BREAK);
}

/**
 * Build the native dialog's option buttons, one per choice (label + the consequence cue as its hover
 * tooltip), each wired to resolve the decision once; the dismiss choice is also bound to Escape / cancel.
 * A safety-net cancel option is appended only if no choice carries the dismiss id.
 * @param {{choices?:{id:string,label:string,note?:string,disabled?:boolean}[]}} view The view model.
 * @param {string} dismissId The dismiss option id. @param {(id:string)=>void} resolve One-shot resolver.
 * @returns {{actions:string[], label:string, tooltip?:string, disabled?:boolean, callback:()=>void}[]} The
 *   option buttons.
 */
function buildOptions(view, dismissId, resolve) {
  const choices = Array.isArray(view.choices) ? view.choices : [];
  const options = choices.map((c) => ({
    actions: c.id === dismissId ? ["cancel", "keyboard-escape"] : [],
    label: c.label,
    tooltip: c.note || void 0,
    // The game grays a disabled option out and ignores it; the guard below is the mod's own belt and braces.
    disabled: c.disabled === true && c.id !== dismissId ? true : void 0,
    callback: () => {
      if (c.disabled !== true || c.id === dismissId) resolve(c.id);
    }
  }));
  if (!choices.some((c) => c.id === dismissId)) {
    options.push({
      actions: ["cancel", "keyboard-escape"],
      label: loc("LOC_EMIG_DILV_DISMISS", "Not now"),
      tooltip: void 0,
      disabled: void 0,
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
    warmFiligree();
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
    noteIconCaptions(title, options);
    const present = () => {
      import("/core/ui/dialog-box/manager-dialog-box.js")
        .then((m) => {
          try {
            const mod = /** @type {*} */ (m);
            const mgr = mod && (mod.DialogBoxManager || mod.default);
            if (mgr && typeof mgr.createDialog_MultiOption === "function") {
              // The plain multi-option dialog: a framed pop-up with the title, the prompt body, and one
              // stacked button per choice (the createDialog_CustomOptions "chooser card" renders as a
              // collapsed strip here, so it is intentionally NOT used).
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
    // CRITICAL: present on a deferred tick, NOT synchronously. The dilemma fires from inside the
    // PlayerTurnActivated engine-event handler, and Civ VII will not surface a working, input-receiving
    // modal raised from inside an engine event; a short delay lets the event stack unwind first.
    if (typeof setTimeout === "function") setTimeout(present, 80);
    else present();
  } catch (_) {
    /* a decision-modal failure must never break the game */
  }
}
