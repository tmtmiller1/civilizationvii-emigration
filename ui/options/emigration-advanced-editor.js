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
//   • each group HEADER collapses/expands its section;
//   • a "modified" dot marks any knob that differs from its default;
//   • a per-row fxs-activatable "↺" resets that knob, and an fxs-button resets everything (both
//     controller-navigable, like the close button);
//   • hand-editing any value flips the intensity preset to "Custom" (you're no
//     longer on Low/Medium/High), and the controls re-sync on focus so a preset
//     applied elsewhere while this is open is reflected;
//   • enum knobs (notify modes) show human labels instead of raw numbers;
//   • the rows flow into two columns on a wide window.

import Panel from "/core/ui/panel-support.js";
import { InputEngineEventName } from "/core/ui/input/input-support.js";
import { FocusManager } from "/core/ui-next/services/focus-manager.js";
import NavTray from "/core/ui/navigation-tray/model-navigation-tray.js";
import {
  getTunable, setTunable, resetTunable, resetAllTunables, isTunableModified, markPresetCustom
} from "/emigration/ui/emigration-settings.js";
import { TUNABLES } from "/emigration/ui/emigration-tunables.js";

const TAG = "emigration-advanced-editor";

// fxs component change events (string literals to avoid importing component internals).
const CHECKBOX_CHANGE = "component-value-changed"; // fxs-checkbox → detail.value (bool)
const DROPDOWN_CHANGE = "dropdown-selection-change"; // fxs-dropdown → detail.selectedIndex

const GRID_COLS = "repeat(auto-fit, minmax(22rem, 1fr))"; // two columns on a wide window, one when narrow
const BODY_GRID_STYLE = "display:grid;grid-template-columns:" + GRID_COLS + ";column-gap:2rem;";

// Group render order + human title. Any tunable group not listed still renders, after
// these, under its raw key (so a new group never silently disappears).
const GROUPS = [
  { key: "pacing", title: "LOC_EMIG_ADVGRP_PACING" },
  { key: "scope", title: "LOC_EMIG_ADVGRP_SCOPE" },
  { key: "prosperity", title: "LOC_EMIG_ADVGRP_PROSPERITY" },
  { key: "violence", title: "LOC_EMIG_ADVGRP_VIOLENCE" },
  { key: "geography", title: "LOC_EMIG_ADVGRP_GEOGRAPHY" },
  { key: "cost", title: "LOC_EMIG_ADVGRP_COST" },
  { key: "outlet", title: "LOC_EMIG_ADVGRP_OUTLET" },
  { key: "disaster", title: "LOC_EMIG_ADVGRP_DISASTER" },
  { key: "notify", title: "LOC_EMIG_ADVGRP_NOTIFY" }
];

/**
 * The index of `v` in `values`, or the nearest by magnitude (robust to a saved value
 * that's no longer an exact choice).
 * @param {number[]} values Choices.
 * @param {number} v Current value.
 * @returns {number} An index.
 */
function nearestIndex(values, v) {
  let best = 0;
  let bestD = Infinity;
  values.forEach((x, i) => {
    const d = Math.abs(x - v);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/** The tunable groups in render order: the known ones first, then any stragglers. */
function orderedGroups() {
  const known = GROUPS.map((g) => g.key);
  const extras = [...new Set(TUNABLES.map((t) => t.group))].filter((k) => !known.includes(k));
  return [...GROUPS, ...extras.map((k) => ({ key: k, title: "LOC_OPTIONS_GROUP_" + k.toUpperCase() }))];
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
 * The dedicated +/- collapse toggle button for a group header.
 * @returns {{toggleBtn:*, toggleGlyph:*}} The toggle button (and its glyph alias).
 */
function makeGroupToggleButton() {
  const toggleBtn = document.createElement("fxs-minus-plus");
  toggleBtn.className = "ml-4";
  toggleBtn.setAttribute("data-audio-group-ref", "options");
  toggleBtn.setAttribute("type", "minus");
  const toggleGlyph = toggleBtn; // type attribute is set on the button itself
  return { toggleBtn, toggleGlyph };
}

/**
 * Header title row (chevron + localized group title).
 * @param {string} titleKey Group title LOC key.
 * @returns {{row:*, chev:*}} Title row and chevron.
 */
function makeGroupTitleRow(titleKey) {
  const row = document.createElement("div");
  row.className = "flex flex-row items-center";
  const chev = document.createElement("span");
  chev.className = "font-body text-base mr-2 text-accent-2";
  chev.textContent = "▾";
  const title = document.createElement("fxs-header");
  title.setAttribute("title", titleKey);
  row.appendChild(chev);
  row.appendChild(title);
  return { row, chev };
}

/**
 * One group header row: the chevron + localized title on the left, a +/- collapse toggle on the right.
 * @param {string} titleKey Group title LOC key.
 * @returns {{header:*, chev:*, toggleBtn:*, toggleGlyph:*}} Header pieces.
 */
function makeGroupHeader(titleKey) {
  const header = document.createElement("div");
  header.className = "flex flex-row items-center justify-between mt-4 mb-1";
  const { row, chev } = makeGroupTitleRow(titleKey);
  const { toggleBtn, toggleGlyph } = makeGroupToggleButton();
  header.appendChild(row);
  header.appendChild(toggleBtn);
  return { header, chev, toggleBtn, toggleGlyph };
}

class EmigrationAdvancedEditor extends Panel {
  /** @type {*} */ closeBtn;
  /** @type {*} */ listEl;
  /** @type {*} */ mainSlot;
  /** @type {*} */ searchInput;
  /** @type {string} */ query = "";
  /** @type {{row:*, group:string, key:string, type:string, control:*, mark:*, search:string}[]} */
  rows = [];
  /** @type {{key:string, header:*, body:*, chev:*, toggleGlyph:*, collapsed:boolean}[]} */
  groups = [];
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
    this.Root.addEventListener(InputEngineEventName, this.engineInputListener);
    this.wireControls();
  }

  onDetach() {
    this.closeBtn?.removeEventListener("action-activate", this.closeListener);
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
                 class="w-11/12 max-w-5xl h-11/12">
        <div data-emig-toolbar class="flex flex-row items-center px-6 pt-2"></div>
        <fxs-scrollable class="flex-auto overflow-y-auto" style="max-height: 78vh;">
          <fxs-vslot class="px-6 py-2 pb-8" data-emig-list></fxs-vslot>
        </fxs-scrollable>
        <fxs-close-button></fxs-close-button>
      </fxs-frame>`;
    this.listEl = this.Root.querySelector("[data-emig-list]");
    this.mainSlot = this.listEl;
    this.closeBtn = this.Root.querySelector("fxs-close-button");
    this.buildToolbar(this.Root.querySelector("[data-emig-toolbar]"));
    for (const g of orderedGroups()) {
      const items = TUNABLES.filter((t) => t.group === g.key);
      if (items.length) this.buildGroupSection(g, items);
    }
  }

  /**
   * The toolbar: an fxs-textbox that filters the list + an fxs-button that resets everything. Both are
   * controller-navigable (the textbox emits "text-changed"; the button inherits "action-activate").
   * @param {*} host The toolbar container.
   */
  buildToolbar(host) {
    const search = document.createElement("fxs-textbox");
    search.className = "flex-auto mr-4";
    search.setAttribute("placeholder", "Search settings…");
    const onQuery = (/** @type {string} */ s) => this.onSearch(s);
    search.addEventListener("text-changed", (/** @type {*} */ e) => onQuery(e.detail?.newStr ?? ""));
    search.addEventListener("component-value-changed", (/** @type {*} */ e) => onQuery(e.detail?.value ?? ""));
    this.searchInput = search;
    host.appendChild(search);

    const reset = document.createElement("fxs-button");
    reset.setAttribute("caption", "Reset all to defaults");
    reset.setAttribute("data-audio-group-ref", "options");
    reset.addEventListener("action-activate", () => this.onResetAll());
    host.appendChild(reset);
  }

  /**
   * Build one collapsible group: a clickable header (chevron + title) and a two-column body of rows.
   * @param {*} g The group spec. @param {*[]} items The group's tunables.
   */
  buildGroupSection(g, items) {
    const { header, chev, toggleBtn, toggleGlyph } = makeGroupHeader(g.title);
    const body = document.createElement("div");
    body.setAttribute("style", BODY_GRID_STYLE);
    const entry = { key: g.key, header, body, chev, toggleGlyph, collapsed: false };
    const onToggle = () => this.toggleGroup(entry);
    toggleBtn.addEventListener("action-activate", onToggle);
    this.groups.push(entry);
    this.listEl.appendChild(header);
    this.listEl.appendChild(body);
    for (const t of items) body.appendChild(this.makeRow(t, g.key));
  }

  /**
   * Build a single tunable's row: a "modified" dot + label + description on the left, the control and a
   * per-row reset "↺" on the right. Records the row's metadata for search / re-sync / marking.
   * @param {*} t Tunable spec. @param {string} groupKey The owning group.
   * @returns {*} The row element.
   */
  makeRow(t, groupKey) {
    const row = document.createElement("div");
    row.className = "flex flex-row items-center justify-between w-full my-2";
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
    btn.setAttribute("data-tooltip-content", "Reset to default");
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
    const values = t.values || [];
    const labels = t.choiceLabels || null;
    const items = values.map((/** @type {*} */ x, /** @type {number} */ i) =>
      ({ label: labels ? labels[i] : String(x) }));
    const dd = document.createElement("fxs-dropdown");
    dd.setAttribute("data-audio-group-ref", "options");
    dd.classList.add("w-64");
    dd.setAttribute("dropdown-items", JSON.stringify(items));
    dd.setAttribute("selected-item-index", String(nearestIndex(values, getTunable(t.key))));
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
        const t = TUNABLES.find((x) => x.key === meta.key);
        const values = (t && t.values) || [];
        meta.control.addEventListener(DROPDOWN_CHANGE, (/** @type {*} */ e) => {
          const v = values[e.detail.selectedIndex];
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
    for (const g of this.groups) {
      const any = this.rows.some((m) => m.group === g.key && m.row.style.display !== "none");
      g.body.setAttribute("style", any ? BODY_GRID_STYLE : BODY_GRID_STYLE + "display:none;");
      g.header.style.display = any ? "" : "none";
    }
  }

  /** Restore all rows + each group's collapse state (search cleared). */
  clearSearch() {
    for (const m of this.rows) m.row.style.display = "";
    for (const g of this.groups) {
      g.header.style.display = "";
      g.body.setAttribute("style", g.collapsed ? BODY_GRID_STYLE + "display:none;" : BODY_GRID_STYLE);
    }
  }

  /**
   * Collapse/expand one group (no-op while a search is active, so it doesn't fight the filter).
   * @param {*} g The group entry.
   */
  toggleGroup(g) {
    g.collapsed = !g.collapsed;
    g.body.setAttribute("style", g.collapsed ? BODY_GRID_STYLE + "display:none;" : BODY_GRID_STYLE);
    g.chev.textContent = g.collapsed ? "▸" : "▾";
    g.toggleGlyph.setAttribute("type", g.collapsed ? "plus" : "minus");
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
    meta.control.setAttribute("selected-item-index", String(nearestIndex((t && t.values) || [], v)));
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
