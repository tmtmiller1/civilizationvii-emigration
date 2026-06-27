import assert from "node:assert/strict";

let KV = {};
globalThis.Configuration = {
  getGame: () => ({ getValue: (k) => (k in KV ? KV[k] : null) }),
  editGame: () => ({ setValue: (k, v) => (KV[k] = v) })
};

const { recordMigrations } = await import("/emigration/ui/emigration-migration-stats.js");

const D = /** @type {*} */ (globalThis).EmigrationData || {};

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function maybe(v) {
  return Math.random() < 0.2 ? undefined : v;
}

function randomCause() {
  const causes = ["war", "disaster", "conquest", "prosperity", "unhappiness", "attrition", "raid", "unknown"];
  return causes[randInt(0, causes.length - 1)];
}

function randomEvent() {
  const src = maybe(randInt(0, 15));
  const dest = maybe(randInt(0, 15));
  const people = maybe(randInt(-1000, 30000));
  const pts = maybe(randInt(-5, 50));
  return {
    srcOwner: src,
    destOwner: dest,
    people,
    points: pts,
    cause: maybe(randomCause()),
    srcCity: maybe("Src" + randInt(1, 200)),
    destCity: maybe("Dst" + randInt(1, 200))
  };
}

function finiteOrZero(n) {
  return typeof n === "number" && Number.isFinite(n);
}

function assertPlayerTalliesFinite(pid) {
  const checks = [
    D.netCumFor,
    D.grossInCumFor,
    D.grossOutCumFor,
    D.refugeesCumFor,
    D.refugeesInCumFor,
    D.deathsCumFor,
    D.externalLossesCumFor,
    D.netPtsFor,
    D.grossInPtsFor,
    D.grossOutPtsFor,
    D.refugeesPtsFor,
    D.refugeesInPtsFor,
    D.deathsPtsFor,
    D.externalLossesPtsFor
  ];
  for (const fn of checks) {
    if (typeof fn !== "function") continue;
    const v = fn(pid);
    assert.equal(finiteOrZero(v), true, `non-finite tally for player ${pid}`);
  }
}

function assertCauseMapsFinite(pid) {
  const maps = [];
  if (typeof D.emigrationByCauseFor === "function") maps.push(D.emigrationByCauseFor(pid));
  if (typeof D.immigrationByCauseFor === "function") maps.push(D.immigrationByCauseFor(pid));
  for (const m of maps) {
    if (!m || typeof m !== "object") continue;
    for (const k of Object.keys(m)) {
      assert.equal(finiteOrZero(m[k]), true, `non-finite cause value for player ${pid} key ${k}`);
    }
  }
}

function runFuzz(rounds = 300) {
  for (let i = 0; i < rounds; i++) {
    const batchSize = randInt(0, 30);
    const batch = [];
    for (let j = 0; j < batchSize; j++) batch.push(randomEvent());
    assert.doesNotThrow(() => recordMigrations(batch));

    for (let pid = 0; pid < 16; pid++) {
      assertPlayerTalliesFinite(pid);
      assertCauseMapsFinite(pid);
    }
  }
}

runFuzz();
console.log("migration-fuzz harness passed");
