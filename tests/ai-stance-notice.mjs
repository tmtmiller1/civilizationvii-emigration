// ai-stance-notice.mjs
//
// "Persia closes its borders": the other civilizations' stance changes as notices (emigration-ai-stance-notice.js).
// Announced once per change, never for an unmet civilization, never on the first read of a game or after a reload.

import assert from "node:assert/strict";

const KV = {};
globalThis.Configuration = {
  getGame: () => ({ getValue: (k) => (k in KV ? KV[k] : null) }),
  editGame: () => ({ setValue: (k, v) => (KV[k] = v) })
};
globalThis.Locale = { compose: (s, ...a) => s + (a.length ? "|" + a.join("|") : "") };

const notice = await import("/emigration/ui/emigration-ai-stance-notice.js");

const stances = { 1: "none", 2: "none" };
const hidden = new Set();
const lines = [];
const deps = {
  civs: () => [1, 2],
  stanceOf: (pid) => stances[pid],
  hidden: (pid) => hidden.has(pid),
  announce: (line) => lines.push(line)
};

notice._forgetAiStances();
assert.equal(notice.noticeAiStances(deps), 0, "the first read only remembers");
stances[1] = "anti";
assert.equal(notice.noticeAiStances(deps), 1, "a change is one line");
assert.match(lines[0], /closes its borders/);
assert.equal(notice.noticeAiStances(deps), 0, "no change, no line");
stances[1] = "pro";
stances[2] = "pro";
hidden.add(2);
assert.equal(notice.noticeAiStances(deps), 1, "an unmet civilization's change stays silent");
assert.match(lines[1], /opens its borders/);
stances[1] = "none";
notice.noticeAiStances(deps);
assert.match(lines[2], /drops its immigration stance/);
assert.deepEqual(JSON.parse(KV.EmigrationAiStances_v1), { 1: "none", 2: "pro" }, "the last stances are in the save");
notice._forgetAiStances();
stances[2] = "anti";
hidden.delete(2);
assert.equal(notice.noticeAiStances(deps), 1, "after a reload, only a real change is announced");
assert.equal(lines.length, 4);
assert.equal(notice.stanceChangeMsg(1, "none", "none"), null, "none to none is nothing to say");
console.log("ai-stance-notice: ok");
