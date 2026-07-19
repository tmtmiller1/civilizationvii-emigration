// emigration-notifications-view.js
//
// Renders the persistent notification LOG (emigration-notifications.js) into the Demographics
// "Notifications" sub-tab: a scrollable, newest-first list of every migration event that has been
// recorded, including narrative Chronicle entries. Clicking a row expands it to the full event detail,
// what caused it, which settlement it left, where the people went, and how many, so the on-screen
// toasts can stay brief while the complete record lives here. Pure DOM + a self-injected stylesheet,
// so it renders correctly in the Demographics page or the standalone window.

import { notificationLog } from "/emigration/ui/emigration-notifications.js";
import { causeLabel, causeAccent, notificationAccent } from "/emigration/ui/emigration-causes.js";
import { formatBothExact } from "/emigration/ui/emigration-population.js";
import { loc } from "/emigration/ui/emigration-loc.js";

/**
 * Split a composed digest summary into its two blocks: the SITUATION (what happened + where the people
 * went) and the GUIDANCE (the action hint, permanence cue, why-here pull, and move-scope tag).
 * `localDigestMessage` joins them with a blank line ("\n\n"); the row header shows only the situation
 * so it reads as one clean line, and the expanded detail shows the guidance once, instead of the whole
 * paragraph appearing twice (header + a verbatim "Note"). Summaries with no blank line (crisis / cause /
 * inbound / pressure headlines, chronicle titles) are all situation and carry no guidance.
 * @param {string} [summary] The stored summary.
 * @returns {{situation: string, guidance: string}} The two blocks.
 */
export function splitSummary(summary) {
  const s = typeof summary === "string" ? summary : "";
  const i = s.indexOf("\n\n");
  if (i < 0) return { situation: s, guidance: "" };
  return { situation: s.slice(0, i), guidance: s.slice(i + 2).trim() };
}

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
  ".emig-ntf-turn{font-size:var(--dg-fs-72);opacity:0.6;white-space:nowrap;min-width:3.6rem;}" +
  // Sentence case (no uppercase transform): the chip is now a descriptive phrase — "Internal migration
  // (prosperity)" — not a one-word tag, so ALL-CAPS read as shouty and ran long.
  '.emig-ntf-chip{font-family:"TitleFont";letter-spacing:0.04em;' +
  "font-size:var(--dg-fs-72);white-space:nowrap;}" +
  ".emig-ntf-sum{flex:1 1 auto;font-size:var(--dg-fs-85);color:#e8d8b4;overflow:hidden;text-overflow:ellipsis;" +
  "white-space:nowrap;}" +
  // pre-line (not plain normal) so an expanded row honours the blank line the digest puts between its
  // situation and guidance; the collapsed row stays nowrap + ellipsis, so the compact list is unchanged.
  ".emig-ntf-row.open .emig-ntf-sum{white-space:pre-line;}" +
  ".emig-ntf-caret{opacity:0.5;font-size:var(--dg-fs-72);}" +
  ".emig-ntf-detail{padding:0.1rem 0.7rem 0.5rem 0.9rem;display:flex;flex-direction:column;gap:0.12rem;}" +
  ".emig-ntf-d{display:flex;gap:0.5rem;font-size:var(--dg-fs-85);}" +
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
 * The detail lines for a chronicled (story) entry: its title, prose body, and the underlying
 * migration cause when the moment had one (narrative-only entries carry the generic "chronicle"
 * cause, which the chip already names, so it's omitted).
 * @param {HTMLElement} panel The detail panel to append into.
 * @param {*} e A NotifEntry.
 */
function chronicleDetail(panel, e) {
  addLine(panel, loc("LOC_EMIG_NV_TITLE", "Title"), e.title || e.summary);
  addLine(panel, loc("LOC_EMIG_NV_STORY", "Story"), e.body);
  if (e.cause && e.cause !== "chronicle") addLine(panel, loc("LOC_EMIG_NV_CAUSE", "Cause"), causeLabel(e.cause));
}

/**
 * The detail lines for a per-event migration notification: cause, named event, origin, destination,
 * and the count in both measuring systems (framed as casualties for a death entry).
 * @param {HTMLElement} panel The detail panel to append into.
 * @param {*} e A NotifEntry.
 */
function migrationDetail(panel, e) {
  addLine(panel, loc("LOC_EMIG_NV_CAUSE", "Cause"), causeLabel(e.cause));
  addLine(panel, loc("LOC_EMIG_NV_EVENT", "Event"), e.event); // the specific named war / disaster, when applicable
  addLine(panel, loc("LOC_EMIG_NV_FROM", "From"), place(e.fromCity, e.fromCiv));
  if (isDeath(e)) {
    // A death (the crisis-loss channel) has no destination, frame the count as casualties rather
    // than people who moved, in the game's own losses register.
    if (e.people || e.points) {
      addLine(panel, loc("LOC_EMIG_NV_CASUALTIES", "Casualties"), formatBothExact(e.people, e.points));
    }
  } else {
    addLine(panel, e.crossCiv ? loc("LOC_EMIG_NV_MOVED_TO", "Moved to") : loc("LOC_EMIG_NV_TO", "To"),
      place(e.toCity, e.toCiv));
    if (e.people || e.points) {
      addLine(panel, loc("LOC_EMIG_NV_PEOPLE", "People"), formatBothExact(e.people, e.points));
    }
    // The "why here" pull (e.reasons) is no longer shown as its own field: the guidance Note already
    // states it in prose ("Drawn there: …"), so a separate line just echoed it.
  }
}

/**
 * Build the expandable detail panel for one notification: cause, origin, destination, and the count
 * in both measuring systems.
 * @param {*} e A NotifEntry.
 * @returns {HTMLElement} The detail panel.
 */
function detailEl(e) {
  const panel = el("div", "emig-ntf-detail");
  if (e.kind === "chronicle") chronicleDetail(panel, e);
  else migrationDetail(panel, e);
  // The header already shows the situation; the Note carries only the GUIDANCE half of the digest
  // (advice + why + scope), so the full sentence never appears twice. Entries with no guidance block
  // (crisis/cause/inbound headlines, chronicle titles) add no Note. The trailing movement-scope tag is
  // stripped because the row chip already names the scope ("Internal migration (…)").
  if (e.kind !== "chronicle") {
    const guidance = stripScopeTag(splitSummary(e.summary).guidance);
    if (guidance) addLine(panel, loc("LOC_EMIG_NV_NOTE", "Note"), guidance);
  }
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
  const base = e.kind === "chronicle"
    ? (e.title || e.summary || loc("LOC_EMIG_NV_DEFAULT_SUMMARY", "A migration event"))
    // Lead with just the situation (not the whole situation+guidance paragraph) so the row reads as one
    // clean line; the guidance half is shown in the expanded Note.
    : (splitSummary(e.summary).situation || loc("LOC_EMIG_NV_CAUSE_EVENT", "{1_Cause} event", causeLabel(e.cause)));
  return e.event && !base.includes(e.event)
    ? loc("LOC_EMIG_NV_EVENT_PREFIX", "{1_Event}: {2_Summary}", e.event, base)
    : base;
}

/**
 * Remove a trailing movement-scope tag ("(Internal Move)" / "(External Move)") from a guidance block.
 * The row chip now names the scope ("Internal migration (…)"), so repeating it at the end of the Note
 * would just echo the chip. The HUD toast keeps the tag (it has no chip); only this log view drops it.
 * @param {string} [guidance] The guidance text.
 * @returns {string} The guidance without a trailing scope tag.
 */
export function stripScopeTag(guidance) {
  let g = typeof guidance === "string" ? guidance : "";
  for (const [key, fb] of [["LOC_EMIG_SCOPE_INTERNAL", "(Internal Move)"],
    ["LOC_EMIG_SCOPE_EXTERNAL", "(External Move)"]]) {
    const tag = loc(key, fb);
    if (tag && g.endsWith(tag)) return g.slice(0, -tag.length).trim();
  }
  return g;
}

/**
 * The row's chip text: which DIRECTION the migration ran, disambiguating the easily-confused Latin
 * terms with a plain-English gloss — "Internal Migration" (within the empire), "Emigration (Leaving)"
 * (the player's people leaving for another civ), "Immigration (Arriving)" (people arriving from another
 * civ). The cause itself is carried by the header sentence, so it isn't repeated here. A death is
 * "Casualties", a chronicle entry "Chronicle", and the world-news kinds keep the plain cause label.
 * @param {*} e A NotifEntry.
 * @returns {string} The chip text.
 */
export function chipLabel(e) {
  if (e.kind === "chronicle") return loc("LOC_EMIG_NV_CHRONICLE", "Chronicle");
  if (isDeath(e)) return loc("LOC_EMIG_NV_CASUALTIES", "Casualties");
  if (e.kind === "digest") {
    if (!e.ownLoss) return loc("LOC_EMIG_NV_KIND_INBOUND", "Immigration (Arriving)"); // arrival
    return e.crossCiv
      ? loc("LOC_EMIG_NV_KIND_EXTERNAL", "Emigration (Leaving)") // own people leaving for another civ
      : loc("LOC_EMIG_NV_KIND_INTERNAL", "Internal Migration"); // within the player's empire
  }
  return causeLabel(e.cause); // per-civ crisis / per-cause world-news kinds keep the flavour label
}

/**
 * The row accent colour, keyed by DIRECTION rather than cause: people staying within your empire or
 * arriving from abroad read GREEN (a gain or neutral shuffle), while your own people leaving for a rival
 * read RED (a real loss). Deaths and world-news (crisis / per-cause) rows keep their cause colour; a
 * chronicle entry keeps the chronicle accent.
 * @param {*} e A NotifEntry.
 * @returns {string} A CSS colour.
 */
export function rowAccent(e) {
  if (e.kind === "chronicle") return causeAccent("chronicle");
  if (e.kind === "digest" && !isDeath(e)) {
    return (!e.ownLoss || !e.crossCiv) ? causeAccent("prosperity") : causeAccent("war"); // green vs red
  }
  return notificationAccent(e.cause, e.ownLoss); // deaths + world-news keep the cause colour
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
  head.appendChild(el("span", "emig-ntf-turn", loc("LOC_EMIG_NV_TURN", "Turn {1_Turn}", e.turn)));
  const chip = el("span", "emig-ntf-chip", chipLabel(e));
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
  const accent = rowAccent(e);
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
      loc("LOC_EMIG_NV_EMPTY",
        "No migration events yet; they appear here as people move, with the full detail of each.")));
    return;
  }
  const list = el("div", "emig-ntf-list");
  for (const e of entries) list.appendChild(rowEl(e));
  body.appendChild(list);
}
