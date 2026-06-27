import assert from "node:assert/strict";

globalThis.Panel = class {
  onInitialize() {}
  onAttach() {}
  onDetach() {}
  close() {}
};

globalThis.Controls = {
  define: () => {
    throw new Error("define boom");
  }
};

const errs = [];
const priorError = console.error;
console.error = (...a) => errs.push(a.join(" "));

await import("/emigration/ui/emigration-screen.js");

console.error = priorError;

assert.ok(errs.some((m) => m.includes("Controls.define THREW")));

delete globalThis.Panel;
delete globalThis.Controls;

console.log("screen-controls-throws harness passed");
