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
// The ~57 tunables are read straight from the declarative TUNABLES spec and laid
// out under their group sub-headers. Each control writes immediately through the
// shared settings store (getTunable/setTunable) - identical to the inline options
// rows - so there is no separate Apply/Cancel; closing just dismisses the panel.

import Panel from "/core/ui/panel-support.js";
import { InputEngineEventName } from "/core/ui/input/input-support.js";
import { FocusManager } from "/core/ui-next/services/focus-manager.js";
import NavTray from "/core/ui/navigation-tray/model-navigation-tray.js";
import { getTunable, setTunable } from "/emigration/ui/emigration-settings.js";
import { TUNABLES } from "/emigration/ui/emigration-tunables.js";

const TAG = "emigration-advanced-editor";

// fxs component change events (string literals to avoid importing component internals).
const CHECKBOX_CHANGE = "component-value-changed"; // fxs-checkbox → detail.value (bool)
const DROPDOWN_CHANGE = "dropdown-selection-change"; // fxs-dropdown → detail.selectedIndex

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

class EmigrationAdvancedEditor extends Panel {
  /** @type {*} */ closeBtn;
  /** @type {*} */ listEl;
  /** @type {*} */ mainSlot;
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

  /**
   * Build a single tunable's row (label + description on the left, control on the right).
   * @param {*} t Tunable spec.
   */
  makeRow(t) {
    const row = document.createElement("div");
    row.className = "flex flex-row items-center justify-between w-full my-2";

    const text = document.createElement("div");
    text.className = "flex flex-col flex-auto mr-6";
    const label = document.createElement("div");
    label.className = "font-body text-base";
    label.setAttribute("data-l10n-id", t.label);
    text.appendChild(label);
    if (t.desc) {
      const desc = document.createElement("div");
      desc.className = "font-body text-xs text-accent-2";
      desc.setAttribute("data-l10n-id", t.desc);
      text.appendChild(desc);
    }
    row.appendChild(text);

    row.appendChild(this.makeControl(t));
    return row;
  }

  /**
   * Build the value control for a tunable: a checkbox for a flag, a dropdown for a choice.
   * @param {*} t Tunable spec.
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
    const items = values.map((/** @type {*} */ x) => ({ label: String(x) }));
    const dd = document.createElement("fxs-dropdown");
    dd.setAttribute("data-audio-group-ref", "options");
    dd.classList.add("w-64");
    dd.setAttribute("dropdown-items", JSON.stringify(items));
    dd.setAttribute("selected-item-index", String(nearestIndex(values, getTunable(t.key))));
    dd.setAttribute("data-emig-key", t.key);
    dd.setAttribute("data-emig-type", "choice");
    return dd;
  }

  /** Lay out the frame + every group's controls into the scrollable list. */
  render() {
    this.Root.innerHTML = `
      <fxs-frame title="LOC_OPTIONS_GROUP_EMIGRATION_ADVANCED" subtitle="LOC_OPTIONS_GROUP_EMIGRATION"
                 class="w-3/4 max-w-5xl h-3/4">
        <fxs-scrollable class="flex-auto">
          <fxs-vslot class="px-6 py-2" data-emig-list></fxs-vslot>
        </fxs-scrollable>
        <fxs-close-button></fxs-close-button>
      </fxs-frame>`;
    this.listEl = this.Root.querySelector("[data-emig-list]");
    this.mainSlot = this.listEl;
    this.closeBtn = this.Root.querySelector("fxs-close-button");

    for (const g of orderedGroups()) {
      const items = TUNABLES.filter((t) => t.group === g.key);
      if (!items.length) continue;
      const header = document.createElement("fxs-header");
      header.classList.add("mt-4", "mb-1");
      header.setAttribute("title", g.title);
      this.listEl.appendChild(header);
      for (const t of items) this.listEl.appendChild(this.makeRow(t));
    }
  }

  /** Wire each control's change event to write its tunable immediately (no Apply step). */
  wireControls() {
    const controls = this.Root.querySelectorAll("[data-emig-key]");
    for (const el of controls) {
      const key = el.getAttribute("data-emig-key");
      if (el.getAttribute("data-emig-type") === "bool") {
        el.addEventListener(CHECKBOX_CHANGE, (/** @type {*} */ e) => {
          setTunable(key, !!e.detail?.value);
        });
      } else {
        const t = TUNABLES.find((x) => x.key === key);
        const values = (t && t.values) || [];
        el.addEventListener(DROPDOWN_CHANGE, (/** @type {*} */ e) => {
          const v = values[e.detail.selectedIndex];
          if (v !== undefined) setTunable(key, v);
        });
      }
    }
  }
}

Controls.define(TAG, {
  createInstance: EmigrationAdvancedEditor,
  attributes: [{ name: "title" }, { name: "subtitle" }]
});
