import assert from "node:assert/strict";

globalThis.Panel = class {
  onInitialize() {}
  onAttach() {}
  onDetach() {}
  close() {}
};

const errs = [];
const priorError = console.error;
console.error = (...a) => errs.push(a.join(" "));

delete globalThis.Controls;
await import("/emigration/ui/emigration-screen.js");

console.error = priorError;

assert.ok(errs.some((m) => m.includes("screen not registered")));

delete globalThis.Panel;

console.log("screen-controls-unavailable harness passed");
