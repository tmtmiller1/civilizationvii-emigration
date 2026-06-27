import assert from "node:assert/strict";

// Typedef-only module should execute cleanly in the test loader.
const mod = await import("/emigration/ui/emigration-config-types.js");
assert.deepEqual(Object.keys(mod), []);

console.log("config-types harness passed");
