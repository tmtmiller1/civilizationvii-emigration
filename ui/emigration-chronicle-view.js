// emigration-chronicle-view.js
//
// Renders the Migration Chronicle (emigration-chronicle.js) into its Demographics sub-tab: a
// newest-first column of short written episodes (a great exodus, a diaspora taking root), each a turn
// stamp, a title, and a line of prose. Pure DOM + a self-injected stylesheet, so it renders the same
// in the Demographics page and the standalone window.

import { chronicleLog } from "/emigration/ui/emigration-chronicle.js";

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

// A quiet, page-of-history look: a hairline left rule per entry, a small-caps title, and the body in
// the parchment body colour at a comfortable reading measure.
const CSS =
  ".emig-chr-list{display:flex;flex-direction:column;gap:0.55rem;padding-right:0.2rem;max-width:46rem;}" +
  ".emig-chr-row{border-left:0.16rem solid rgba(201,162,76,0.5);padding:0.1rem 0 0.2rem 0.7rem;}" +
  // flex-wrap so a long title can't crowd the right-aligned kind label on a narrow Civ VII panel: the
  // kind wraps to its own line (still pushed right by margin-left:auto) rather than being squeezed.
  ".emig-chr-head{display:flex;flex-wrap:wrap;align-items:baseline;gap:0.6rem;margin-bottom:0.12rem;}" +
  '.emig-chr-title{font-family:"TitleFont";letter-spacing:0.04em;font-size:0.92rem;color:#f0bc78;}' +
  ".emig-chr-turn{font-size:0.7rem;opacity:0.55;white-space:nowrap;}" +
  ".emig-chr-body{font-size:0.92rem;line-height:1.5;color:#e8d8b4;}" +
  ".emig-chr-kind{font-size:0.62rem;text-transform:uppercase;letter-spacing:0.1em;opacity:0.5;" +
  "margin-left:auto;white-space:nowrap;}" +
  // Self-contained empty-state (the dashboard stylesheet also defines .emig-empty, but the chronicle
  // can render standalone, so it carries its own copy rather than depend on that being injected).
  ".emig-empty{opacity:0.6;font-style:italic;padding:0.4rem 0.2rem;max-width:42rem;line-height:1.5;}";

/** Inject the chronicle stylesheet once. */
function injectStyle() {
  try {
    if (document.getElementById("emig-chr-style")) return;
    const s = document.createElement("style");
    s.id = "emig-chr-style";
    s.textContent = CSS;
    document.head.appendChild(s);
  } catch (_) {
    /* ignore */
  }
}

/** Title-case label for an entry kind. */
/** @type {Record<string, string>} */
const KIND_LABEL = { exodus: "Exodus", founding: "Diaspora", return: "Return" };

/**
 * Build one chronicle row: turn · title · kind, then the prose body.
 * @param {*} e A ChronicleEntry.
 * @returns {HTMLElement} The row.
 */
function rowEl(e) {
  const row = el("div", "emig-chr-row");
  const head = el("div", "emig-chr-head");
  head.appendChild(el("span", "emig-chr-title", e.title || KIND_LABEL[e.kind] || "A movement of peoples"));
  head.appendChild(el("span", "emig-chr-turn", "Turn " + e.turn));
  head.appendChild(el("span", "emig-chr-kind", KIND_LABEL[e.kind] || ""));
  row.appendChild(head);
  row.appendChild(el("div", "emig-chr-body", e.body));
  return row;
}

/**
 * Render the chronicle into a section body. Empty-state when nothing has been recorded yet.
 * @param {HTMLElement} body The section body element.
 */
export function renderChronicle(body) {
  injectStyle();
  // Idempotent: clear first so a tab refresh or re-render can't stack a duplicate chronicle. Use
  // innerHTML, NOT replaceChildren, Coherent GameFace doesn't implement replaceChildren.
  body.innerHTML = "";
  const entries = chronicleLog();
  if (!entries.length) {
    body.appendChild(el("div", "emig-empty",
      "The chronicle is empty. As great waves of people move across the world, their stories are "
      + "written here: the cities that emptied, and the communities that took root far from home."));
    return;
  }
  const list = el("div", "emig-chr-list");
  for (const e of entries) list.appendChild(rowEl(e));
  body.appendChild(list);
}
