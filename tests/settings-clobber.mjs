// Regression test for the shared-localStorage "cannibalization" bug: Emigration's ModOptionsStore
// must NEVER drop another mod's slice of the shared `modSettings` blob — not on a flaky-empty read,
// and not when another mod left an unparseable value. (It previously reset `modSettings` to "{}" on
// any unparseable read, actively wiping every sibling.)
import assert from "node:assert/strict";

const SIB = "sib-classic-leader-screens";

// Controllable fake localStorage: `flakyEmptyOnce` makes the next modSettings read return null once
// (as Coherent sometimes does); `raw` lets a scenario seed/inspect the stored string directly.
const ls = (() => {
  const store = {};
  return {
    flakyEmptyOnce: false,
    get raw() {
      return "modSettings" in store ? store.modSettings : null;
    },
    set raw(v) {
      if (v == null) delete store.modSettings;
      else store.modSettings = v;
    },
    get length() {
      return Object.keys(store).length;
    },
    getItem(k) {
      if (this.flakyEmptyOnce && k === "modSettings") {
        this.flakyEmptyOnce = false;
        return null;
      }
      return k in store ? store[k] : null;
    },
    setItem(k, v) {
      store[k] = String(v);
    },
    removeItem(k) {
      delete store[k];
    },
    clear() {
      for (const k of Object.keys(store)) delete store[k];
    }
  };
})();
globalThis.localStorage = ls;

const { setNumberMode, NumberMode } = await import("/emigration/ui/emigration-settings.js");

// ── 1. Normal write preserves the sibling slice and records ours. ─────────────────────────────────
ls.raw = JSON.stringify({ [SIB]: { enabled: true, magic: 42 }, emigration: {} });
setNumberMode(NumberMode.CIV);
let blob = JSON.parse(ls.raw);
assert.deepEqual(blob[SIB], { enabled: true, magic: 42 }, "sibling slice must survive a normal write");
assert.equal(blob.emigration.numberMode, NumberMode.CIV, "our slice must be recorded");

// ── 2. A flaky-empty first read must NOT clobber the sibling. ─────────────────────────────────────
ls.raw = JSON.stringify({ [SIB]: { enabled: true, magic: 7 }, emigration: {} });
ls.flakyEmptyOnce = true;
setNumberMode(NumberMode.HISTORICAL);
blob = JSON.parse(ls.raw);
assert.deepEqual(blob[SIB], { enabled: true, magic: 7 }, "flaky read must not wipe the sibling slice");
assert.equal(blob.emigration.numberMode, NumberMode.HISTORICAL, "our slice must still persist");

// ── 3. An unparseable shared value must make us REFUSE to write (never reset it to "{}"). ─────────
ls.raw = "{ not valid json";
setNumberMode(NumberMode.CIV);
assert.equal(ls.raw, "{ not valid json", "an unparseable shared blob must be left untouched");

// ── 4. A genuinely-empty store still persists our slice (first run). ─────────────────────────────
ls.clear();
setNumberMode(NumberMode.CIV);
blob = JSON.parse(ls.raw);
assert.equal(blob.emigration.numberMode, NumberMode.CIV, "first-run persistence must still work");

delete globalThis.localStorage;
console.log("settings-clobber harness passed (sibling slices preserved across flaky / unparseable / empty reads)");
