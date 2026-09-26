// dilemma-view-disabled.mjs
//
// A grayed-out choice reaches the game's dialog as a disabled option, and can never resolve even if an input
// path calls its callback; the dismiss choice can never be disabled.
import assert from "node:assert/strict";

// The dialog manager import resolves to tests/core-stub.mjs, which hands each definition to this hook.
let captured = null;
globalThis.__emigDialogStub = (def) => { captured = def; };
const { showDilemma } = await import("/emigration/ui/emigration-dilemma-view.js");

const chosen = [];
const view = {
  title: "T", body: "B", dismissId: "no",
  choices: [
    { id: "0:1", label: "one", note: "n" },
    { id: "0:3", label: "three", note: "short", disabled: true },
    { id: "no", label: "leave", disabled: true }
  ]
};
showDilemma(view, (id) => chosen.push(id));
await new Promise((r) => setTimeout(r, 200));
assert.ok(captured, "the dialog was built");
const [one, three, leave] = captured.options;
assert.equal(one.disabled, undefined, "an affordable size is enabled");
assert.equal(three.disabled, true, "an unaffordable size reaches the dialog disabled");
assert.equal(leave.disabled, undefined, "the dismiss choice is never disabled");
three.callback();
assert.deepEqual(chosen, [], "a disabled size never resolves, even when its callback fires");
one.callback();
assert.deepEqual(chosen, ["0:1"], "an enabled size resolves");
console.log("dilemma-view-disabled: ok");
