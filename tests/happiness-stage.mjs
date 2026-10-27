// happiness-stage.mjs
//
// The stage happiness model (CONFIG.happinessModel = "stage"): a settlement's Happiness is read against the
// game's own stage lines for the age instead of the mean of every settlement. No push while Happy, a push that
// ramps through Unhappy, a draw that ramps through Joyous to Ecstatic, and no jump at any line.

import assert from "node:assert/strict";

const { CONFIG } = await import("/emigration/ui/emigration-config.js");
const { stageScore, prosperity, unhappyPressure } = await import("/emigration/ui/emigration-prosperity.js");
const { happinessBands } = await import("/emigration/ui/emigration-polity.js");

const near = (a, b) => Math.abs(a - b) < 1e-9;
const ANTIQUITY = { joyousMin: 20, ecstaticMin: 40, angryMax: -20 };
const EXPLORATION = { joyousMin: 40, ecstaticMin: 80, angryMax: -20 };

function testScore() {
  CONFIG.happyRepulsion = 1.8;
  CONFIG.happinessStagePush = 1.8;
  assert.equal(stageScore(0, ANTIQUITY), 0);
  assert.equal(stageScore(15, ANTIQUITY), 0, "Happy: no push and no draw");
  assert.equal(stageScore(20, ANTIQUITY), 0, "the Joyous line itself");
  assert.ok(near(stageScore(30, ANTIQUITY), 0.5), "halfway through Joyous");
  assert.equal(stageScore(40, ANTIQUITY), 1, "Ecstatic");
  assert.equal(stageScore(90, ANTIQUITY), 1, "never past Ecstatic");
  CONFIG.happinessStageFullAt = 10;
  CONFIG.happinessStagePush = 2.8;
  assert.ok(near(stageScore(-5, ANTIQUITY), -1.4), "the stage push sets the depth");
  CONFIG.happinessStagePush = 0;
  assert.ok(near(stageScore(-10, ANTIQUITY), -1.8), "an unreadable push falls back to happyRepulsion");
  CONFIG.happinessStagePush = 1.8;
  assert.ok(near(stageScore(-1, ANTIQUITY), -0.18), "a tenth of the strongest push at -1");
  assert.ok(near(stageScore(-2, ANTIQUITY), -0.36));
  assert.ok(near(stageScore(-5, ANTIQUITY), -0.9), "half at -5");
  assert.ok(near(stageScore(-10, ANTIQUITY), -1.8), "the strongest push at -10");
  assert.ok(near(stageScore(-20, ANTIQUITY), -1.8), "no deeper past it");
  assert.ok(near(stageScore(-100, ANTIQUITY), -1.8));
  CONFIG.happinessStageFullAt = 0;
  assert.ok(near(stageScore(-5, ANTIQUITY), -0.9), "an unreadable depth falls back to 10");
  CONFIG.happinessStageFullAt = 10;
  assert.equal(stageScore(30, EXPLORATION), 0, "the same +30 is only Happy in Exploration");
  assert.ok(near(stageScore(60, EXPLORATION), 0.5));
  assert.equal(stageScore(NaN, ANTIQUITY), 0);
  assert.deepEqual(happinessBands(), ANTIQUITY, "the Antiquity lines when the game's table can't be read");
}

function testNoJump() {
  for (const line of [ANTIQUITY.joyousMin, ANTIQUITY.ecstaticMin, 0, -10, ANTIQUITY.angryMax]) {
    const gap = Math.abs(stageScore(line + 0.01, ANTIQUITY) - stageScore(line - 0.01, ANTIQUITY));
    assert.ok(gap < 0.01, "continuous across " + line + " (" + gap + ")");
  }
}

function signal(h, stage) {
  return {
    food: 18, production: 16, gold: 11, science: 7, culture: 5, population: 10, urban: 0, happiness: h, stage,
    polity: { celebrating: false, government: "", warWeary: false },
    siege: false, starving: false, unrest: false, violence: 0, disaster: 0
  };
}

function testScoring() {
  const saved = { model: CONFIG.happinessModel, polity: CONFIG.polityModelEnabled };
  CONFIG.polityModelEnabled = true;
  CONFIG.happinessModel = "stage";
  const ctx = { meanHappiness: 30 };
  assert.ok(near(prosperity(signal(2, 0), ctx), prosperity(signal(18, 0), ctx)),
    "two Happy settlements score the same on Happiness, whatever the world's average");
  assert.ok(prosperity(signal(-10, -1), ctx) < prosperity(signal(2, 0), ctx), "Unhappy scores lower");
  assert.ok(Math.abs(prosperity(signal(-0.01, -1), ctx) - prosperity(signal(0.01, 0), ctx)) < 0.05,
    "no step at 0: the stage term is folded into the ramp");
  CONFIG.happinessModel = "field";
  assert.ok(prosperity(signal(2, 0), ctx) < prosperity(signal(18, 0), ctx),
    "the field model scores the +2 settlement lower against an average of 30");
  CONFIG.happinessModel = saved.model;
  CONFIG.polityModelEnabled = saved.polity;
}

function testPush() {
  const saved = { model: CONFIG.happinessModel, push: CONFIG.unhappyPressurePush, full: CONFIG.happinessStageFullAt };
  CONFIG.happinessModel = "stage"; CONFIG.unhappyPressurePush = 2; CONFIG.happinessStageFullAt = 10;
  assert.equal(unhappyPressure(0), 0, "no push at 0");
  assert.equal(unhappyPressure(12), 0, "none while Happy");
  assert.ok(near(unhappyPressure(-2), 0.4));
  assert.ok(near(unhappyPressure(-5), 1), "half at -5");
  assert.equal(unhappyPressure(-10), 2, "full at -10");
  assert.equal(unhappyPressure(-30), 2, "no more past it");
  assert.equal(unhappyPressure(NaN), 0);
  CONFIG.unhappyPressurePush = 0;
  assert.equal(unhappyPressure(-10), 0, "0 turns it off");
  CONFIG.unhappyPressurePush = 2; CONFIG.happinessModel = "field";
  assert.equal(unhappyPressure(-10), 0, "the field model has no direct push");
  Object.assign(CONFIG, { happinessModel: saved.model, unhappyPressurePush: saved.push, happinessStageFullAt: saved.full });
}

testScore();
testPush();
testNoJump();
testScoring();
console.log("happiness-stage: ok");
