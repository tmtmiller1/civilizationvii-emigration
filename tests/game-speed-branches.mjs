import assert from "node:assert/strict";

import { CONFIG } from "/emigration/ui/emigration-config.js";
import {
  gameSpeedScalar,
  resetGameSpeedCache,
  speedTurns,
  speedBar,
  speedDecay,
  speedScaleTurn
} from "/emigration/ui/emigration-game-speed.js";

const priorTuning = CONFIG.gameSpeedTuningEnabled;
const priorScalePop = CONFIG.gameSpeedScalePopulation;

function setSpeedRow(row, gameSpeedType = "T") {
  globalThis.Configuration = { getGame: () => ({ gameSpeedType }) };
  globalThis.GameInfo = { GameSpeeds: { lookup: () => row } };
  resetGameSpeedCache();
}

function clearSpeed() {
  delete globalThis.Configuration;
  delete globalThis.GameInfo;
  resetGameSpeedCache();
}

function testTypeMissingFallsBackToStandard() {
  globalThis.Configuration = { getGame: () => ({}) };
  globalThis.GameInfo = { GameSpeeds: { lookup: () => ({ CostMultiplier: 300 }) } };
  resetGameSpeedCache();
  assert.equal(gameSpeedScalar(), 1);
}

function testLookupFallbacksAndNonPositiveMultiplier() {
  setSpeedRow(null);
  assert.equal(gameSpeedScalar(), 1, "missing row should default to Standard scalar");

  setSpeedRow({});
  assert.equal(gameSpeedScalar(), 1, "missing CostMultiplier should default to Standard scalar");

  setSpeedRow({ CostMultiplier: 0 });
  assert.equal(gameSpeedScalar(), 1, "non-positive multiplier should fail-safe to 1");
}

function testScalarCaching() {
  setSpeedRow({ CostMultiplier: 150 });
  assert.equal(gameSpeedScalar(), 1.5);

  globalThis.GameInfo = { GameSpeeds: { lookup: () => ({ CostMultiplier: 300 }) } };
  assert.equal(gameSpeedScalar(), 1.5, "cached scalar should stay stable until reset");

  resetGameSpeedCache();
  assert.equal(gameSpeedScalar(), 3);
}

function testSpeedTurnsEdgeInputs() {
  setSpeedRow({ CostMultiplier: 300 });
  assert.equal(speedTurns(0), 0);
  assert.equal(speedTurns(-4), -4);
  assert.equal(speedTurns(0.2), 1, "positive duration is floored to at least 1 turn");
}

function testSpeedBarIdentityAndScaled() {
  clearSpeed();
  assert.equal(speedBar(12), 12);

  setSpeedRow({ CostMultiplier: 50 });
  assert.equal(speedBar(12), 6);
}

function testSpeedDecayGuardsAndClamps() {
  setSpeedRow({ CostMultiplier: 50 });
  assert.equal(speedDecay(0), 0, "non-positive decay should be identity");
  assert.equal(speedDecay(-0.2), -0.2, "negative decay should be identity");
  assert.equal(speedDecay(1), 1, ">=1 decay should be identity");

  // Online speed (S=0.5) makes tiny d values even smaller; lower clamp should apply.
  assert.equal(speedDecay(0.0001), 0.001);

  setSpeedRow({ CostMultiplier: 1000 });
  // Very large S makes d^(1/S) near 1; upper clamp should apply.
  assert.equal(speedDecay(0.9999), 0.999);
}

function testSpeedScaleTurnBranches() {
  setSpeedRow({ CostMultiplier: 300 });

  CONFIG.gameSpeedScalePopulation = false;
  assert.equal(speedScaleTurn(90), 90, "feature off should be identity");

  CONFIG.gameSpeedScalePopulation = true;
  assert.equal(speedScaleTurn(90), 30, "feature on should normalize by scalar");

  clearSpeed();
  assert.equal(speedScaleTurn(90), 90, "scalar 1 should stay identity even when enabled");
}

function testTuningKillSwitchForAllTransforms() {
  setSpeedRow({ CostMultiplier: 300 });
  CONFIG.gameSpeedTuningEnabled = false;
  resetGameSpeedCache();

  assert.equal(gameSpeedScalar(), 1);
  assert.equal(speedTurns(8), 8);
  assert.equal(speedBar(30), 30);
  assert.equal(speedDecay(0.55), 0.55);
}

testTypeMissingFallsBackToStandard();
testLookupFallbacksAndNonPositiveMultiplier();
testScalarCaching();
testSpeedTurnsEdgeInputs();
testSpeedBarIdentityAndScaled();
testSpeedDecayGuardsAndClamps();
testSpeedScaleTurnBranches();
testTuningKillSwitchForAllTransforms();

CONFIG.gameSpeedTuningEnabled = priorTuning;
CONFIG.gameSpeedScalePopulation = priorScalePop;
clearSpeed();

console.log("game-speed-branches harness passed");
