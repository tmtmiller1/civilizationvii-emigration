import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  BY_CIV,
  BY_LEADER,
  BY_MEMENTO,
  EXPLICIT_NEUTRAL_CIVS,
  EXPLICIT_NEUTRAL_LEADERS,
  EXPLICIT_NEUTRAL_MEMENTOS
} from "/emigration/ui/emigration-civ-tuning.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const matrixPath = path.resolve(__dirname, "..", "analysis", "leader-civ-ability-matrix.json");
const matrix = JSON.parse(fs.readFileSync(matrixPath, "utf8"));

const matrixLeaders = new Set(matrix.leaders.map((entry) => entry.id));
const matrixCivs = new Set(matrix.civilizations.map((entry) => entry.id));
const matrixMementos = new Set(matrix.mementos.map((entry) => entry.id));

const tunedLeaders = Object.keys(BY_LEADER);
const tunedCivs = Object.keys(BY_CIV);
const tunedMementos = Object.keys(BY_MEMENTO);

const coveredLeaders = new Set([...tunedLeaders, ...EXPLICIT_NEUTRAL_LEADERS]);
const coveredCivs = new Set([...tunedCivs, ...EXPLICIT_NEUTRAL_CIVS]);
const coveredMementos = new Set([...tunedMementos, ...EXPLICIT_NEUTRAL_MEMENTOS]);

const uncoveredLeaders = [...matrixLeaders].filter((id) => !coveredLeaders.has(id));
const uncoveredCivs = [...matrixCivs].filter((id) => !coveredCivs.has(id));
const uncoveredMementos = [...matrixMementos].filter((id) => !coveredMementos.has(id));

assert.equal(uncoveredLeaders.length, 0, `Missing leader decisions: ${uncoveredLeaders.join(", ")}`);
assert.equal(uncoveredCivs.length, 0, `Missing civ decisions: ${uncoveredCivs.join(", ")}`);
assert.equal(uncoveredMementos.length, 0, `Missing memento decisions: ${uncoveredMementos.join(", ")}`);

const allowedLeaderAliases = new Set(["LEADER_RIZAL"]);
const allowedCivAliases = new Set(["CIVILIZATION_ENGLAND"]);
const unknownTunedLeaders = tunedLeaders.filter(
  (id) => !matrixLeaders.has(id) && !allowedLeaderAliases.has(id)
);
const unknownTunedCivs = tunedCivs.filter((id) => !matrixCivs.has(id) && !allowedCivAliases.has(id));
const unknownTunedMementos = tunedMementos.filter((id) => !matrixMementos.has(id));

assert.equal(
  unknownTunedLeaders.length,
  0,
  `Tuned leader keys not in matrix roster: ${unknownTunedLeaders.join(", ")}`
);
assert.equal(
  unknownTunedCivs.length,
  0,
  `Tuned civ keys not in matrix roster: ${unknownTunedCivs.join(", ")}`
);
assert.equal(
  unknownTunedMementos.length,
  0,
  `Tuned memento keys not in matrix roster: ${unknownTunedMementos.join(", ")}`
);

const neutralLeaderOverlap = EXPLICIT_NEUTRAL_LEADERS.filter((id) => Object.hasOwn(BY_LEADER, id));
const neutralCivOverlap = EXPLICIT_NEUTRAL_CIVS.filter((id) => Object.hasOwn(BY_CIV, id));
const neutralMementoOverlap = EXPLICIT_NEUTRAL_MEMENTOS.filter((id) => Object.hasOwn(BY_MEMENTO, id));

assert.equal(neutralLeaderOverlap.length, 0, `Leaders both tuned and neutral: ${neutralLeaderOverlap.join(", ")}`);
assert.equal(neutralCivOverlap.length, 0, `Civs both tuned and neutral: ${neutralCivOverlap.join(", ")}`);
assert.equal(
  neutralMementoOverlap.length,
  0,
  `Mementos both tuned and neutral: ${neutralMementoOverlap.join(", ")}`
);

assert.equal(
  coveredLeaders.size,
  matrixLeaders.size + [...allowedLeaderAliases].filter((id) => coveredLeaders.has(id)).length,
  "Leader coverage size mismatch"
);
assert.equal(
  coveredCivs.size,
  matrixCivs.size + [...allowedCivAliases].filter((id) => coveredCivs.has(id)).length,
  "Civ coverage size mismatch"
);
assert.equal(coveredMementos.size, matrixMementos.size, "Memento coverage size mismatch");

console.log("civ-tuning-coverage harness passed");
