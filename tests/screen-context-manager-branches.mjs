import assert from "node:assert/strict";

globalThis.Panel = class {
  constructor() {
    this.Root = {
      querySelector: () => ({ addEventListener: () => {} }),
      setAttribute: () => {}
    };
  }
  onInitialize() {}
  onAttach() {}
  onDetach() {}
  close() {}
};

globalThis.Controls = { define: () => {} };

// Shape context-manager module so open path hits the "push unavailable" branch,
// and close path throws during pop access to hit its catch path.
globalThis.__coreStubContextManagerModule = {
  contextManager: null,
  defaultExport: {
    get push() {
      return undefined;
    },
    get pop() {
      throw new Error("pop accessor boom");
    }
  }
};

const errs = [];
const priorError = console.error;
console.error = (...a) => errs.push(a.join(" "));

const { openEmigrationScreen, closeEmigrationScreen } = await import("/emigration/ui/emigration-screen.js");

openEmigrationScreen();
closeEmigrationScreen();

await new Promise((r) => setTimeout(r, 0));

console.error = priorError;

assert.doesNotThrow(() => openEmigrationScreen());
assert.doesNotThrow(() => closeEmigrationScreen());

delete globalThis.__coreStubContextManagerModule;
delete globalThis.Panel;
delete globalThis.Controls;

console.log("screen-context-manager-branches harness passed");
