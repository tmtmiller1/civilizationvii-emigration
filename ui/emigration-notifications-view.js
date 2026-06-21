// emigration-notifications-view.js
//
// Renders the persistent notification LOG (emigration-notifications.js) into the Demographics
// "Notifications" sub-tab: a scrollable, newest-first list of every migration notification that has
// fired, each row cause-themed (the same accent as its toast). Clicking a row expands it to the full
// event detail — what caused it, which settlement it left, where the people went, and how many — so
// the on-screen toasts can stay brief while the complete record lives here. Pure DOM + a self-injected
// stylesheet, so it renders correctly in the Demographics page or the standalone window.

import { notificationLog } from "/emigration/ui/emigration-notifications.js";
import { causeLabel, causeAccent } from "/emigration/ui/emigration-causes.js";
import { formatBoth } from "/emigration/ui/emigration-population.js";

/**
 * Make an element with an optional class + text.
 * @param {string} tag Tag.
 * @param {string} [cls] Class.
 * @param {string} [text] Text.
 * @returns {HTMLElement} Element.
 */
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

const CSS =
  ".emig-ntf-list{display:flex;flex-direction:column;gap:0.3rem;max-height:28rem;overflow-y:auto;" +
  "padding-right:0.2rem;}" +
  ".emig-ntf-row{background:linear-gradient(180deg,rgba(20,24,34,0.6),rgba(8,10,16,0.6));" +
  "border:0.0555rem solid rgba(201,162,76,0.25);border-left-width:0.28rem;border-radius:0.25rem;}" +
  ".emig-ntf-head{display:flex;align-items:baseline;gap:0.55rem;padding:0.4rem 0.6rem;cursor:pointer;}" +
  ".emig-ntf-head:hover{background:rgba(240,188,120,0.06);}" +
  ".emig-ntf-turn{font-size:0.72rem;opacity:0.6;white-space:nowrap;min-width:3.6rem;}" +
  '.emig-ntf-chip{font-family:"TitleFont";text-transform:uppercase;letter-spacing:0.08em;' +
  "font-size:0.7rem;white-space:nowrap;}" +
  ".emig-ntf-sum{flex:1 1 auto;font-size:0.86rem;color:#e8d8b4;overflow:hidden;text-overflow:ellipsis;" +
  "white-space:nowrap;}" +
  ".emig-ntf-row.open .emig-ntf-sum{white-space:normal;}" +
  ".emig-ntf-caret{opacity:0.5;font-size:0.7rem;}" +
  ".emig-ntf-detail{padding:0.1rem 0.7rem 0.5rem 0.9rem;display:flex;flex-direction:column;gap:0.12rem;}" +
  ".emig-ntf-d{display:flex;gap:0.5rem;font-size:0.82rem;}" +
  ".emig-ntf-dl{color:#f0bc78;min-width:5rem;opacity:0.85;}" +
  ".emig-ntf-dv{color:#e8d8b4;}";

/** Inject the notifications stylesheet once. */
function injectStyle() {
  try {
    if (document.getElementById("emig-ntf-style")) return;
    const s = document.createElement("style");
    s.id = "emig-ntf-style";
    s.textContent = CSS;
    document.head.appendChild(s);
  } catch (_) {
    /* ignore */
  }
}

/**
 * Append a labelled detail line to the panel (skips empty values).
 * @param {HTMLElement} panel The detail panel.
 * @param {string} label The field label.
 * @param {string} [value] The field value.
 */
function addLine(panel, label, value) {
  if (!value) return;
  const line = el("div", "emig-ntf-d");
  line.appendChild(el("span", "emig-ntf-dl", label));
  line.appendChild(el("span", "emig-ntf-dv", value));
  panel.appendChild(line);
}

/**
 * A "City (Civilization)" place string, or just whichever part is present, or "".
 * @param {string} [city] Settlement name.
 * @param {string} [civ] Civilization name.
 * @returns {string} The place label.
 */
function place(city, civ) {
  if (city && civ) return city + " (" + civ + ")";
  return city || civ || "";
}

/**
 * Build the expandable detail panel for one notification: cause, origin, destination, and the count
 * in both measuring systems.
 * @param {*} e A NotifEntry.
 * @returns {HTMLElement} The detail panel.
 */
function detailEl(e) {
  const panel = el("div", "emig-ntf-detail");
  addLine(panel, "Cause", causeLabel(e.cause));
  addLine(panel, "From", place(e.fromCity, e.fromCiv));
  addLine(panel, e.crossCiv ? "Moved to" : "To", place(e.toCity, e.toCiv));
  if (e.people || e.points) addLine(panel, "People", formatBoth(e.people, e.points));
  if (e.summary) addLine(panel, "Note", e.summary);
  return panel;
}

/**
 * Build one notification row: a clickable cause-themed header that toggles its detail panel.
 * @param {*} e A NotifEntry.
 * @returns {HTMLElement} The row.
 */
function rowEl(e) {
  const accent = causeAccent(e.cause);
  const row = el("div", "emig-ntf-row");
  row.style.borderLeftColor = accent;
  const head = el("div", "emig-ntf-head");
  head.appendChild(el("span", "emig-ntf-turn", "Turn " + e.turn));
  const chip = el("span", "emig-ntf-chip", causeLabel(e.cause));
  chip.style.color = accent;
  head.appendChild(chip);
  head.appendChild(el("span", "emig-ntf-sum", e.summary || causeLabel(e.cause) + " event"));
  const caret = el("span", "emig-ntf-caret", "▾");
  head.appendChild(caret);
  const detail = detailEl(e);
  detail.style.display = "none";
  head.addEventListener("click", () => {
    const open = detail.style.display === "none";
    detail.style.display = open ? "flex" : "none";
    caret.textContent = open ? "▴" : "▾";
    row.classList.toggle("open", open);
  });
  row.appendChild(head);
  row.appendChild(detail);
  return row;
}

/**
 * Render the notifications log into a section body. Empty-state when nothing has fired yet.
 * @param {HTMLElement} body The section body element.
 */
export function renderNotifications(body) {
  injectStyle();
  const entries = notificationLog();
  if (!entries.length) {
    body.appendChild(el("div", "emig-empty",
      "No migration notifications yet — they appear here as people move, with the full detail of each."));
    return;
  }
  const list = el("div", "emig-ntf-list");
  for (const e of entries) list.appendChild(rowEl(e));
  body.appendChild(list);
}
