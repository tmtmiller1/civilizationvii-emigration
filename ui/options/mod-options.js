// mod-options.js
//
// Shared "Mods" Options-screen category + a cascade-safe settings store.
//
// Adds the community-convention "Mods" tab to the Options screen (the first mod
// to load this file creates it; later mods reuse it), and persists per-mod,
// per-option values under the SINGLE shared "modSettings" localStorage key.
// Using one key is mandatory: stray top-level localStorage keys clobber the
// shared store and silently break settings for EVERY installed mod.
//
// Pattern source:
// https://forums.civfanatics.com/threads/configuring-mod-options-with-a-dedicated-mods-tab.696784/

import { CategoryType } from "/core/ui/options/model-options.js";
import { CategoryData } from "/core/ui/options/options-helpers.js";

// Invent the shared "Mods" category (idempotent across mods that do the same).
CategoryType["Mods"] = "mods";
CategoryData[CategoryType.Mods] = {
  title: "LOC_UI_CONTENT_MGR_SUBTITLE",
  description: "LOC_UI_CONTENT_MGR_SUBTITLE_DESCRIPTION"
};

/** Cascade-safe per-mod / per-option settings store (single "modSettings" key). */
class ModOptionsStore {
  /** Drop stray top-level keys that would clobber the shared store. */
  _guard() {
    try {
      if (localStorage.length > 1) {
        // Preserve only the shared store; stray keys break every mod's settings.
        const keep = localStorage.getItem("modSettings");
        localStorage.clear();
        if (keep != null) localStorage.setItem("modSettings", keep);
      }
    } catch (_) {
      /* ignore */
    }
  }

  /**
   * Persist a value.
   * @param {string} modID Owning mod id.
   * @param {string} optionID Option id.
   * @param {*} value JSON-serialisable value.
   */
  save(modID, optionID, value) {
    try {
      this._guard();
      const all = JSON.parse(localStorage.getItem("modSettings") || "{}");
      (all[modID] ??= {})[optionID] = value;
      localStorage.setItem("modSettings", JSON.stringify(all));
    } catch (_) {
      /* ignore */
    }
  }

  /**
   * Read a value.
   * @param {string} modID Owning mod id.
   * @param {string} optionID Option id.
   * @returns {*} The stored value, or null if absent.
   */
  load(modID, optionID) {
    try {
      const raw = localStorage.getItem("modSettings");
      if (!raw) return null;
      const all = JSON.parse(raw);
      return all?.[modID]?.[optionID] ?? null;
    } catch (_) {
      return null;
    }
  }
}

const ModOptions = new ModOptionsStore();
export { ModOptions as default };
