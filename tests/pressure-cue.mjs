// pressure-cue.mjs
//
// P0.3 voluntary-pressure cue reporter: reportPressureCues logs a low-key "rising emigration
// pressure" notification for the LOCAL player's settlements, throttled per source, and ignores
// other civs' cues.

import assert from "node:assert/strict";

globalThis.GameContext = { localPlayerID: 1 };
globalThis.Game = { turn: 10 };

const { reportPressureCues } = await import("/emigration/ui/emigration-feedback.js");
const { notificationLog, clearNotifications } = await import("/emigration/ui/emigration-notifications.js");
const { CONFIG } = await import("/emigration/ui/emigration-config.js");

CONFIG.voluntaryCueCooldownTurns = 12;
clearNotifications();

const cue = (o) => ({ srcName: o.src, srcOwner: o.owner, destName: o.dest, cause: o.cause || "prosperity" });
const cueRows = () => notificationLog(100).filter((e) => e.kind === "cue");

// ── A local-player source building pressure → one cue, naming source + destination ──
reportPressureCues([cue({ src: "Rome", owner: 1, dest: "Thebes" })]);
let rows = cueRows();
assert.equal(rows.length, 1, "a local source logs one cue");
assert.ok(rows[0].summary.includes("Rome") && rows[0].summary.includes("Thebes"), "cue names source and destination");
assert.equal(rows[0].fromCity, "Rome");
assert.equal(rows[0].toCity, "Thebes");

// ── Same source, same window → throttled (no new cue) ──
reportPressureCues([cue({ src: "Rome", owner: 1, dest: "Thebes" })]);
assert.equal(cueRows().length, 1, "a second cue within the cooldown is suppressed");

// ── Past the cooldown → fires again ──
globalThis.Game.turn = 30;
reportPressureCues([cue({ src: "Rome", owner: 1, dest: "Thebes" })]);
assert.equal(cueRows().length, 2, "a cue fires again once the cooldown has elapsed");

// ── Another civ's source → ignored (only the local player's cities cue) ──
reportPressureCues([cue({ src: "Babylon", owner: 2, dest: "Thebes" })]);
assert.equal(cueRows().length, 2, "a non-local source produces no cue");

// ── Malformed cue (missing destination) → ignored, no throw ──
reportPressureCues([{ srcName: "Ur", srcOwner: 1 }]);
assert.equal(cueRows().length, 2, "a cue missing its destination is skipped");

// ── Empty / junk input is tolerated ──
reportPressureCues([]);
reportPressureCues(null);

console.log("pressure-cue harness passed");
