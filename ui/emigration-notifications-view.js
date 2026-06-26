// emigration-notifications-view.js
//
// Renders the persistent notification LOG (emigration-notifications.js) into the Demographics
// "Notifications" sub-tab: a scrollable, newest-first list of every migration notification that has
// fired, each row cause-themed (the same accent as its toast). Clicking a row expands it to the full
// event detail, what caused it, which settlement it left, where the people went, and how many, so
// the on-screen toasts can stay brief while the complete record lives here. Pure DOM + a self-injected
// stylesheet, so it renders correctly in the Demographics page or the standalone window.

import { notificationLog } from "/emigration/ui/emigration-notifications.js";
import { causeLabel, notificationAccent } from "/emigration/ui/emigration-causes.js";
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
  // No own max-height/overflow: the list grows to its natural height and the enclosing .emig-tabbody
  // (max-height:74vh, overflow-y:auto) provides the single scrollbar, so the log uses the full window
  // instead of being capped to a short nested scroll box.
  ".emig-ntf-list{display:flex;flex-direction:column;gap:0.3rem;padding-right:0.2rem;}" +
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
  addLine(panel, "Event", e.event); // the specific named war / disaster, when applicable
  addLine(panel, "From", place(e.fromCity, e.fromCiv));
  if (isDeath(e)) {
    // A death (the crisis-loss channel) has no destination, frame the count as casualties rather
    // than people who moved, in the game's own losses register.
    if (e.people || e.points) addLine(panel, "Casualties", formatBoth(e.people, e.points));
  } else {
    addLine(panel, e.crossCiv ? "Moved to" : "To", place(e.toCity, e.toCiv));
    if (e.people || e.points) addLine(panel, "People", formatBoth(e.people, e.points));
  }
  if (e.summary) addLine(panel, "Note", e.summary);
  return panel;
}

/**
 * Whether a notification records people who died (the attrition / crisis-death channel) rather than
 * migrated, so it can be worded as a loss of life, not a move.
 * @param {*} e A NotifEntry.
 * @returns {boolean} True for a death entry.
 */
function isDeath(e) {
  return e.cause === "attrition";
}

/**
 * The row summary: lead with the specific war/disaster name when we have one and the summary doesn't
 * already carry it, so the event reads at a glance without expanding.
 * @param {*} e A NotifEntry.
 * @returns {string} The display summary.
 */
function rowSummary(e) {
  const base = e.summary || causeLabel(e.cause) + " event";
  return e.event && !base.includes(e.event) ? e.event + ": " + base : base;
}

/**
 * Build the clickable header (turn · cause chip · summary · caret).
 * @param {*} e A NotifEntry.
 * @param {string} accent The cause accent colour.
 * @param {HTMLElement} caret The caret element (kept by the caller to flip on toggle).
 * @returns {HTMLElement} The header.
 */
function headEl(e, accent, caret) {
  const head = el("div", "emig-ntf-head");
  head.appendChild(el("span", "emig-ntf-turn", "Turn " + e.turn));
  const chip = el("span", "emig-ntf-chip", isDeath(e) ? "Casualties" : causeLabel(e.cause));
  chip.style.color = accent;
  head.appendChild(chip);
  head.appendChild(el("span", "emig-ntf-sum", rowSummary(e)));
  head.appendChild(caret);
  return head;
}

/**
 * Build one notification row: a clickable cause-themed header that toggles its detail panel.
 * @param {*} e A NotifEntry.
 * @returns {HTMLElement} The row.
 */
function rowEl(e) {
  const accent = notificationAccent(e.cause, e.ownLoss);
  const row = el("div", "emig-ntf-row");
  row.style.borderLeftColor = accent;
  const caret = el("span", "emig-ntf-caret", "▾");
  const head = headEl(e, accent, caret);
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
      "No migration notifications yet; they appear here as people move, with the full detail of each."));
    return;
  }
  const list = el("div", "emig-ntf-list");
  for (const e of entries) list.appendChild(rowEl(e));
  body.appendChild(list);
}
