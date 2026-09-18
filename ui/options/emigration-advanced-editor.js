// emigration-advanced-editor.js
//
// A pop-up sub-window for the Emigration "Advanced" tunables, so the shared Mods
// options tab stays uncluttered (it keeps only the intensity Preset + number
// display; a single "Configure…" row opens this panel).
//
// Registered as the custom screen `emigration-advanced-editor` and launched from
// the Mods tab via an OptionType.Editor row (editorTagName), exactly the way the
// base game opens its keyboard/controller-remap and language editors. Pushed by
// ContextManager into the .fxs-popups layer with a mouse guard, so it works the
// same in the main-menu (shell) and in-game options screens.
//
// The tunables are read straight from the declarative TUNABLES spec and laid out
// under their group sub-headers. Each control writes immediately through the shared
// settings store (getTunable/setTunable) (no separate Apply/Cancel) and:
//   • an fxs-textbox SEARCH box filters the long list by (localized) label/description;
//   • the groups are gathered into a few broad SECTIONS (ADVANCED_SECTIONS); a section's title row collapses/expands
//     it, and its groups show inside as plain sub-headings. Sections start collapsed and the ones a player opens
//     stay open the next time (stored per player);
//   • a dropdown whose setting holds a value between its choices (set by a grouped slider on the Add-ons tab)
//     lists that exact value rather than silently showing the nearest choice;
//   • a "modified" dot marks any knob that differs from its default;
//   • a per-row fxs-activatable "↺" resets that knob, and an fxs-button resets everything (both
//     controller-navigable, like the close button);
//   • hand-editing any value flips the intensity preset to "Custom" (you're no
//     longer on Low/Medium/High), and the controls re-sync on focus so a preset
//     applied elsewhere while this is open is reflected;
//   • enum knobs (notify modes) show human labels instead of raw numbers;
//   • the rows flow into two columns.

import Panel from "/core/ui/panel-support.js";
import { InputEngineEventName } from "/core/ui/input/input-support.js";
import { FocusManager } from "/core/ui-next/services/focus-manager.js";
import NavTray from "/core/ui/navigation-tray/model-navigation-tray.js";
import "/core/ui/components/fxs-minus-plus.js"; // defines <fxs-minus-plus>, the section toggle icon
import {
  getTunable, setTunable, resetTunable, resetAllTunables, isTunableModified, markPresetCustom,
  getAdvancedSectionOpen, setAdvancedSectionOpen
} from "/emigration/ui/emigration-settings.js";
import { TUNABLES, ADVANCED_GROUPS, ADVANCED_SECTIONS, tunableDropdown } from "/emigration/ui/emigration-tunables.js";

/** Fired on window when this window closes, so the Add-ons tab can redraw what an edit here changed. */
export const ADVANCED_CLOSED_EVENT = "emigration-advanced-closed";
import { loc } from "/emigration/ui/emigration-loc.js";

const TAG = "emigration-advanced-editor";

// fxs component change events (string literals to avoid importing component internals).
const CHECKBOX_CHANGE = "component-value-changed"; // fxs-checkbox → detail.value (bool)
const DROPDOWN_CHANGE = "dropdown-selection-change"; // fxs-dropdown → detail.selectedIndex

// GameFace (Coherent) CSS — Civ7's UI engine — does NOT support `display:grid` or `1fr` units. Setting a
// grid style logs "Unable to parse declaration: display - grid" / "syntax error near text: 1fr" and the
// body never lays out, so every tunable row (incl. the self-test toggle) renders into a broken container.
// Flexbox is fully supported (the rest of this screen uses it): the rows wrap two to a line (ROW_STYLE), and a
// group sub-heading takes a whole line (SUBHEAD_STYLE).
const BODY_GRID_STYLE = "display:flex;flex-direction:row;flex-wrap:wrap;align-items:flex-start;";
const ROW_STYLE = "width:50%;padding-right:2rem;";
const SUBHEAD_STYLE = "width:100%;margin-top:0.9rem;";

// Group render order + human title (shared with the diagnostics that open a section). Any tunable group not
// listed still renders, after these, under its raw key (so a new group never silently disappears).
const GROUPS = ADVANCED_GROUPS;

/**
 * Fill a dropdown with a choice tunable's entries at its current value, and remember the value behind each entry
 * on the element (the list can carry an extra exact value, so indexes do not map straight to `t.values`).
 * @param {*} dd The fxs-dropdown element. @param {*} t The tunable.
 */
function loadDropdown(dd, t) {
  const d = tunableDropdown(t, getTunable(t.key));
  dd.emigValues = d.values;
  dd.setAttribute("dropdown-items", JSON.stringify(d.items));
  dd.setAttribute("selected-item-index", String(d.index));
}

/**
 * The sections in render order, each with its groups resolved to specs. Any group no section lists (and any tunable
 * group not in ADVANCED_GROUPS) still renders, in a final section of its own, so a new group never disappears.
 * @returns {{key:string, title:string, groups:{key:string, title:string}[]}[]} The sections.
 */
function orderedSections() {
  const known = new Map(GROUPS.map((g) => [g.key, g]));
  for (const k of new Set(TUNABLES.map((t) => t.group))) {
    if (!known.has(k)) known.set(k, { key: k, title: "LOC_OPTIONS_GROUP_" + k.toUpperCase() });
  }
  const placed = new Set(ADVANCED_SECTIONS.flatMap((sec) => sec.groups));
  const sections = ADVANCED_SECTIONS.map((sec) => ({
    ...sec,
    groups: sec.groups.map((k) => known.get(k)).filter((g) => g !== undefined)
  }));
  const rest = [...known.values()].filter((g) => !placed.has(g.key));
  if (rest.length) sections.push({ key: "other", title: rest[0].title, groups: rest });
  return sections;
}

/**
 * Localized text for searching a tunable: its label + description + key, lowercased.
 * @param {*} t Tunable spec. @returns {string} The searchable text.
 */
function searchTextFor(t) {
  const c = (/** @type {string} */ k) => {
    try {
      return typeof Locale !== "undefined" && Locale.compose ? Locale.compose(k) : k;
    } catch (_) {
      return k;
    }
  };
  return (c(t.label) + " " + (t.desc ? c(t.desc) : "") + " " + t.key).toLowerCase();
}

/**
 * A div/span with an optional class and `data-l10n-id`.
 * @param {string} tag Element tag. @param {string} [cls] Class list. @param {string} [l10n] LOC key.
 * @returns {*} The element.
 */
function el(tag, cls, l10n) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (l10n) e.setAttribute("data-l10n-id", l10n);
  return e;
}

/**
 * The left-hand text block for a tunable row: a "modified" dot + the label, with the description below.
 * @param {*} t Tunable spec.
 * @returns {{text:*, mark:*}} The text element and its modified-dot span.
 */
function makeRowText(t) {
  const text = el("div", "flex flex-col flex-auto mr-6");
  const labelRow = el("div", "flex flex-row items-center");
  const mark = el("span", "text-xs mr-1");
  mark.setAttribute("style", "color:#f3c34c;");
  mark.textContent = "●";
  labelRow.appendChild(mark);
  labelRow.appendChild(el("div", "font-body text-base", t.label));
  text.appendChild(labelRow);
  if (t.desc) text.appendChild(el("div", "font-body text-xs text-accent-2", t.desc));
  return { text, mark };
}

/**
 * A section's title row: the game's +/- disclosure icon and a plain title, over a thin rule. No decorative
 * fxs-header, which drew a filigree flourish under every one of the many titles. Both the icon and the title
 * toggle the section.
 * @param {string} titleKey Section title LOC key.
 * @returns {{header:*, toggleBtn:*, title:*}} Header pieces.
 */
function makeSectionHeader(titleKey) {
  const header = document.createElement("div");
  header.className = "flex flex-row items-center mt-5 pb-1";
  header.setAttribute("style", "border-bottom:1px solid rgba(197,176,128,0.35);");
  const toggleBtn = document.createElement("fxs-minus-plus");
  toggleBtn.className = "mr-3";
  toggleBtn.setAttribute("data-audio-group-ref", "options");
  toggleBtn.setAttribute("type", "plus");
  const title = el("div", "font-title text-lg text-secondary uppercase cursor-pointer pointer-events-auto", titleKey);
  header.appendChild(toggleBtn);
  header.appendChild(title);
  return { header, toggleBtn, title };
}

/**
 * A group's sub-heading inside a section: small accent text on its own line.
 * @param {string} titleKey Group title LOC key. @returns {*} The element.
 */
function makeGroupSubheading(titleKey) {
  const sub = el("div", "font-title text-sm text-accent-2 uppercase", titleKey);
  sub.setAttribute("style", SUBHEAD_STYLE);
  return sub;
}

class EmigrationAdvancedEditor extends Panel {
  /** @type {*} */ closeBtn;
  /** @type {*} */ confirmBtn;
  /** @type {*} */ listEl;
  /** @type {*} */ mainSlot;
  /** @type {*} */ searchInput;
  /** @type {string} */ query = "";
  /** @type {{row:*, group:string, key:string, type:string, control:*, mark:*, search:string}[]} */
  rows = [];
  /** @type {{key:string, groupKeys:string[], header:*, body:*, toggleBtn:*, collapsed:boolean}[]} */
  sections = [];
  /** @type {{key:string, sub:*}[]} */
  subheads = [];
  engineInputListener = this.onEngineInput.bind(this);
  closeListener = () => this.close();

  onInitialize() {
    this.render();
    super.onInitialize();
    this.Root.classList.add("absolute");
  }

  onAttach() {
    super.onAttach();
    this.closeBtn?.addEventListener("action-activate", this.closeListener);
    this.confirmBtn?.addEventListener("action-activate", this.closeListener);
    this.Root.addEventListener(InputEngineEventName, this.engineInputListener);
    this.wireControls();
  }

  onDetach() {
    // Edits here can take the intensity preset off Low/Medium/High; let the Add-ons tab redraw it.
    try {
      window.dispatchEvent(new CustomEvent(ADVANCED_CLOSED_EVENT));
    } catch (_) {
      /* no window (off-engine) */
    }
    this.closeBtn?.removeEventListener("action-activate", this.closeListener);
    this.confirmBtn?.removeEventListener("action-activate", this.closeListener);
    this.Root.removeEventListener(InputEngineEventName, this.engineInputListener);
    super.onDetach();
  }

  onReceiveFocus() {
    super.onReceiveFocus();
    this.syncAllControls(); // reflect a preset applied elsewhere while this panel was open
    if (this.mainSlot) FocusManager.get().setFocus(this.mainSlot);
    NavTray.addOrUpdateGenericCancel();
  }

  /**
   * Close on the cancel/back input (controller B / Esc), like every base editor screen.
   * @param {*} event The engine input event.
   */
  onEngineInput(event) {
    if (event?.detail?.status !== InputActionStatuses.FINISH) return;
    if (event.detail.name === "cancel") {
      this.close();
      event.stopPropagation();
      event.preventDefault();
    }
  }

  /** Lay out the frame, the search/reset toolbar, and every group's controls. */
  render() {
    this.Root.innerHTML = `
      <fxs-frame title="LOC_OPTIONS_GROUP_EMIGRATION_ADVANCED" subtitle="LOC_OPTIONS_GROUP_EMIGRATION"
                 class="w-11/12 h-11/12">
        <div data-emig-toolbar class="flex flex-row items-center px-6 pt-2"></div>
        <fxs-scrollable class="flex-auto overflow-y-auto" style="max-height: 72vh;">
          <fxs-vslot class="px-6 py-2 pb-8" data-emig-list></fxs-vslot>
        </fxs-scrollable>
        <div data-emig-footer class="flex flex-row justify-center px-6 pt-3 pb-5"></div>
        <fxs-close-button></fxs-close-button>
      </fxs-frame>`;
    this.listEl = this.Root.querySelector("[data-emig-list]");
    this.mainSlot = this.listEl;
    this.closeBtn = this.Root.querySelector("fxs-close-button");
    this.buildToolbar(this.Root.querySelector("[data-emig-toolbar]"));
    this.buildFooter(this.Root.querySelector("[data-emig-footer]"));
    for (const sec of orderedSections()) this.buildSection(sec);
  }

  /**
   * The toolbar: an fxs-textbox that filters the list + an fxs-button that resets everything. Both are
   * controller-navigable (the textbox emits "text-changed"; the button inherits "action-activate").
   * @param {*} host The toolbar container.
   */
  buildToolbar(host) {
    const search = document.createElement("fxs-textbox");
    search.className = "flex-auto mr-4";
    search.setAttribute("placeholder", loc("LOC_EMIG_ADV_SEARCH_PLACEHOLDER", "Search settings…"));
    const onQuery = (/** @type {string} */ s) => this.onSearch(s);
    search.addEventListener("text-changed", (/** @type {*} */ e) => onQuery(e.detail?.newStr ?? ""));
    search.addEventListener("component-value-changed", (/** @type {*} */ e) => onQuery(e.detail?.value ?? ""));
    this.searchInput = search;
    host.appendChild(search);

    const reset = document.createElement("fxs-button");
    reset.setAttribute("caption", loc("LOC_EMIG_ADV_RESET_ALL", "Reset all to defaults"));
    reset.setAttribute("data-audio-group-ref", "options");
    reset.addEventListener("action-activate", () => this.onResetAll());
    host.appendChild(reset);
  }

  /**
   * The footer: a "Confirm Changes" button that returns to the main Options window. Every setting is
   * already written live as you edit it (there is no pending/Apply step), so this is purely the familiar
   * confirm affordance from the base Options screen — a labelled way back that doesn't require hunting for
   * the ✕. The listener is added/removed in onAttach/onDetach alongside the ✕.
   * @param {*} host The footer container.
   */
  buildFooter(host) {
    if (!host) return;
    const confirm = document.createElement("fxs-button");
    const caption = (typeof Locale !== "undefined" && typeof Locale.compose === "function")
      ? Locale.compose("LOC_OPTIONS_CONFIRM_CHANGES") : "Confirm Changes";
    confirm.setAttribute("caption", caption);
    confirm.setAttribute("data-audio-group-ref", "options");
    this.confirmBtn = confirm;
    host.appendChild(confirm);
  }

  /**
   * Build one collapsible section: a title row, then each of its groups as a sub-heading over its rows.
   * @param {{key:string, title:string, groups:{key:string, title:string}[]}} sec The section spec.
   */
  buildSection(sec) {
    const groups = sec.groups.filter((g) => TUNABLES.some((t) => t.group === g.key));
    if (!groups.length) return;
    const { header, toggleBtn, title } = makeSectionHeader(sec.title);
    const body = document.createElement("div");
    const groupKeys = groups.map((g) => g.key);
    // Open if the player left it open, or a diagnostic asked for one of its groups (advancedSettings(group)).
    const open = getAdvancedSectionOpen("sec_" + sec.key) || groupKeys.some((k) => getAdvancedSectionOpen(k));
    const entry = { key: sec.key, groupKeys, header, body, toggleBtn, collapsed: !open };
    this.showCollapse(entry);
    const onToggle = () => this.toggleSection(entry);
    toggleBtn.addEventListener("action-activate", onToggle);
    title.addEventListener("click", onToggle);
    this.sections.push(entry);
    this.listEl.appendChild(header);
    this.listEl.appendChild(body);
    for (const g of groups) this.buildGroup(body, g);
  }

  /**
   * One group inside a section body: its sub-heading, then its rows.
   * @param {*} body The section body. @param {{key:string, title:string}} g The group spec.
   */
  buildGroup(body, g) {
    const sub = makeGroupSubheading(g.title);
    this.subheads.push({ key: g.key, sub });
    body.appendChild(sub);
    for (const t of TUNABLES.filter((x) => x.group === g.key)) body.appendChild(this.makeRow(t, g.key));
  }

  /**
   * Build a single tunable's row: a "modified" dot + label + description on the left, the control and a
   * per-row reset "↺" on the right. Records the row's metadata for search / re-sync / marking.
   * @param {*} t Tunable spec. @param {string} groupKey The owning group.
   * @returns {*} The row element.
   */
  makeRow(t, groupKey) {
    const row = document.createElement("div");
    row.className = "flex flex-row items-center justify-between my-2";
    row.setAttribute("style", ROW_STYLE);
    const { text, mark } = makeRowText(t);
    row.appendChild(text);
    const control = this.makeControl(t);
    row.appendChild(control);
    const meta = { row, group: groupKey, key: t.key, type: t.type, control, mark, search: searchTextFor(t) };
    row.appendChild(this.makeResetButton(meta));
    this.rows.push(meta);
    this.updateMark(meta);
    return row;
  }

  /**
   * The per-row reset affordance ("↺"): resets that knob to its default on click.
   * @param {*} meta The row metadata. @returns {*} The button element.
   */
  makeResetButton(meta) {
    const btn = document.createElement("fxs-activatable");
    btn.className = "ml-3 cursor-pointer";
    btn.setAttribute("data-tooltip-content", loc("LOC_EMIG_ADV_RESET_ONE", "Reset to default"));
    btn.setAttribute("data-audio-group-ref", "options");
    const glyph = el("span", "font-title text-lg text-accent-2");
    glyph.textContent = "↺";
    btn.appendChild(glyph);
    btn.addEventListener("action-activate", () => this.resetRow(meta));
    return btn;
  }

  /**
   * Build the value control for a tunable: a checkbox for a flag, a dropdown for a choice (with human
   * labels when the spec supplies `choiceLabels`).
   * @param {*} t Tunable spec.
   * @returns {*} The control element.
   */
  makeControl(t) {
    if (t.type === "bool") {
      const cb = document.createElement("fxs-checkbox");
      cb.setAttribute("data-audio-group-ref", "options");
      cb.setAttribute("selected", String(!!getTunable(t.key)));
      cb.setAttribute("data-emig-key", t.key);
      cb.setAttribute("data-emig-type", "bool");
      return cb;
    }
    const dd = document.createElement("fxs-dropdown");
    dd.setAttribute("data-audio-group-ref", "options");
    dd.classList.add("w-64");
    loadDropdown(dd, t);
    dd.setAttribute("data-emig-key", t.key);
    dd.setAttribute("data-emig-type", "choice");
    return dd;
  }

  /** Wire each control's change event to write its tunable immediately (no Apply step). */
  wireControls() {
    for (const meta of this.rows) {
      if (meta.type === "bool") {
        meta.control.addEventListener(CHECKBOX_CHANGE, (/** @type {*} */ e) =>
          this.onEdit(meta, !!e.detail?.value));
      } else {
        meta.control.addEventListener(DROPDOWN_CHANGE, (/** @type {*} */ e) => {
          // The entry list can hold an extra exact value, so map the index through the list the control shows.
          const v = (meta.control.emigValues || [])[e.detail.selectedIndex];
          if (v !== undefined) this.onEdit(meta, v);
        });
      }
    }
  }

  /**
   * Apply one hand-edit: write the value, flip the preset to Custom (you're off Low/Med/High now), and
   * refresh the modified mark.
   * @param {*} meta The row metadata. @param {*} value The new value.
   */
  onEdit(meta, value) {
    setTunable(meta.key, value);
    markPresetCustom();
    this.updateMark(meta);
    // Picking a real choice drops any extra in-between entry the list was showing. Only redraw when there is such
    // an entry: redrawing a dropdown from inside its own change event would otherwise re-fire the event.
    const t = TUNABLES.find((x) => x.key === meta.key);
    if (meta.type !== "bool" && t && (meta.control.emigValues || []).length !== (t.values || []).length) {
      this.syncControl(meta);
    }
  }

  /**
   * Filter the visible rows by a search query (matches the localized label/description/key). An empty
   * query restores each group's collapse state.
   * @param {string} raw The raw query.
   */
  onSearch(raw) {
    this.query = (raw || "").trim().toLowerCase();
    const q = this.query;
    if (!q) {
      this.clearSearch();
      return;
    }
    for (const m of this.rows) m.row.style.display = m.search.includes(q) ? "" : "none";
    const matches = (/** @type {string} */ group) => this.rows.some((m) => m.group === group && m.row.style.display !== "none");
    for (const h of this.subheads) h.sub.style.display = matches(h.key) ? "" : "none";
    for (const sec of this.sections) {
      const any = sec.groupKeys.some(matches);
      sec.body.setAttribute("style", any ? BODY_GRID_STYLE : BODY_GRID_STYLE + "display:none;");
      sec.header.style.display = any ? "" : "none";
    }
  }

  /** Restore all rows + each section's collapse state (search cleared). */
  clearSearch() {
    for (const m of this.rows) m.row.style.display = "";
    for (const h of this.subheads) h.sub.style.display = "";
    for (const sec of this.sections) {
      sec.header.style.display = "";
      this.showCollapse(sec);
    }
  }

  /**
   * Collapse/expand one section. Closing also clears any per-group "open" a diagnostic set, so it stays closed.
   * @param {*} sec The section entry.
   */
  toggleSection(sec) {
    sec.collapsed = !sec.collapsed;
    setAdvancedSectionOpen("sec_" + sec.key, !sec.collapsed);
    if (sec.collapsed) for (const k of sec.groupKeys) setAdvancedSectionOpen(k, false);
    this.showCollapse(sec);
  }

  /**
   * Draw a section's current collapse state: body shown or hidden, +/- icon to match.
   * @param {*} sec The section entry.
   */
  showCollapse(sec) {
    sec.body.setAttribute("style", sec.collapsed ? BODY_GRID_STYLE + "display:none;" : BODY_GRID_STYLE);
    sec.toggleBtn.setAttribute("type", sec.collapsed ? "plus" : "minus");
  }

  /**
   * Show/hide a row's "modified" dot by whether its tunable differs from default.
   * @param {*} meta The row metadata.
   */
  updateMark(meta) {
    meta.mark.style.display = isTunableModified(meta.key) ? "" : "none";
  }

  /**
   * Re-read one control's displayed value from the store (after a reset, or a preset applied while
   * this panel was open).
   * @param {*} meta The row metadata.
   */
  syncControl(meta) {
    const v = getTunable(meta.key);
    if (meta.type === "bool") {
      meta.control.setAttribute("selected", String(!!v));
      return;
    }
    const t = TUNABLES.find((x) => x.key === meta.key);
    if (t) loadDropdown(meta.control, t);
  }

  /** Re-sync every control + mark to the current store values. */
  syncAllControls() {
    for (const m of this.rows) {
      this.syncControl(m);
      this.updateMark(m);
    }
  }

  /**
   * Reset one knob to default, flip to Custom, and refresh its control + mark.
   * @param {*} meta The row metadata.
   */
  resetRow(meta) {
    resetTunable(meta.key);
    markPresetCustom();
    this.syncControl(meta);
    this.updateMark(meta);
  }

  /** Reset every knob to default, flip to Custom, and refresh all controls. */
  onResetAll() {
    resetAllTunables();
    markPresetCustom();
    this.syncAllControls();
  }
}

Controls.define(TAG, {
  createInstance: EmigrationAdvancedEditor,
  attributes: [{ name: "title" }, { name: "subtitle" }]
});
