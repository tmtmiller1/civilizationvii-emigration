// game-speed.mjs
//
// Phase 7 — game-speed scaling (emigration-game-speed.js). The engine paces in turns,
// but Civ's game speed stretches the same progress over a 6× range of turn counts. This
// harness pins each speed via a stubbed Configuration/GameInfo and asserts:
//   1. fail-safe: no engine globals → scalar 1 → every transform is identity;
//   2. the scalar maps CostMultiplier/100 (Online 0.5 … Marathon 3.0);
//   3. the kill switch (gameSpeedTuningEnabled=false) forces identity even under a stub;
//   4. game-TIME invariance, the whole point: durations and thresholds scale ×S together,
//      and decay re-bases so the SAME total fade lands over S× the turns.

import assert from "node:assert/strict";
import { CONFIG } from "/emigration/ui/emigration-config.js";
import {
  gameSpeedScalar, resetGameSpeedCache, speedTurns, speedBar, speedDecay
} from "/emigration/ui/emigration-game-speed.js";

/** Stub the engine speed globals to a given CostMultiplier and clear the cache. */
function setSpeed(costMultiplier) {
  globalThis.Configuration = { getGame: () => ({ gameSpeedType: "T" + costMultiplier }) };
  globalThis.GameInfo = { GameSpeeds: { lookup: () => ({ CostMultiplier: costMultiplier }) } };
  resetGameSpeedCache();
}

/** Remove the stubs (back to a headless, speed-unaware world). */
function clearSpeed() {
  delete globalThis.Configuration;
  delete globalThis.GameInfo;
  resetGameSpeedCache();
}

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// ── 1. Fail-safe: no globals → identity ────────────────────────────────────
clearSpeed();
assert.equal(gameSpeedScalar(), 1, "no engine globals → scalar 1");
assert.equal(speedTurns(8), 8, "identity duration when S=1");
assert.equal(speedBar(30), 30, "identity threshold when S=1");
assert.equal(speedDecay(0.55), 0.55, "identity decay when S=1");

// ── 2. The five shipped speeds map CostMultiplier/100 ──────────────────────
const SPEEDS = { online: 50, quick: 67, standard: 100, epic: 150, marathon: 300 };
for (const [name, mult] of Object.entries(SPEEDS)) {
  setSpeed(mult);
  assert.ok(near(gameSpeedScalar(), mult / 100), `${name} → scalar ${mult / 100}`);
}

// ── 3. Marathon (S=3) and Online (S=0.5) concrete transforms ───────────────
setSpeed(300);
assert.equal(speedTurns(8), 24, "Marathon: 8-turn cooldown → 24");
assert.equal(speedBar(30), 90, "Marathon: bar 30 → 90");
assert.ok(near(speedDecay(0.55), Math.pow(0.55, 1 / 3)), "Marathon: decay → d^(1/3) (gentler)");
assert.ok(speedDecay(0.55) > 0.55, "Marathon retains more per turn");

setSpeed(50);
assert.equal(speedTurns(8), 4, "Online: 8-turn cooldown → 4");
assert.equal(speedBar(30), 15, "Online: bar 30 → 15");
assert.ok(speedDecay(0.55) < 0.55, "Online decays faster per turn");
assert.equal(speedTurns(1), 1, "a positive duration never collapses to 0");

// ── 4. Kill switch forces identity even under a stub ───────────────────────
setSpeed(300);
CONFIG.gameSpeedTuningEnabled = false;
resetGameSpeedCache();
assert.equal(gameSpeedScalar(), 1, "tuning disabled → scalar 1 regardless of speed");
assert.equal(speedTurns(8), 8, "disabled → identity duration");
CONFIG.gameSpeedTuningEnabled = true;

// ── 5. Game-TIME invariance (the property that justifies the whole phase) ──
// At any speed: a duration of n Standard-turns and a threshold of x both scale by the SAME S,
// so the ratio (turns to cross the bar) is preserved; and decay^S returns the original per-turn
// fade — i.e. the same transient fades over exactly S× the turns.
for (const mult of Object.values(SPEEDS)) {
  setSpeed(mult);
  const s = gameSpeedScalar();
  assert.ok(near(speedBar(30) / 30, s), `threshold scales by S at ${mult}`);
  assert.ok(near(speedTurns(120) / 120, s, 0.02), `duration scales by ~S at ${mult}`);
  // decay re-based to d^(1/S), raised back over S turns, equals the original one-turn fade.
  assert.ok(near(Math.pow(speedDecay(0.55), s), 0.55, 1e-3), `decay fades over S× turns at ${mult}`);
}

clearSpeed();
console.log("game-speed: ok (fail-safe + 5 speeds + kill switch + game-time invariance)");
