// Characterization test for adjustedPull (engine.js). Pins the pull math to the values the
// pre-refactor flat-sum formula produced, so the §1 two-channel restructure (Tilt + Permeability)
// is provably behaviour-neutral. Expected numbers are hand-derived from the original formula:
//   pull = (dest.pros - src.pros) - baseReluctance - perExtraPop*max(0,Δpop) - cityStateBarrier?
//          - poachBlock(cross-civ)? + openBordersBonus + geoAdjust - congestion, then × openness.
import assert from "node:assert/strict";
import { CONFIG } from "/emigration/ui/emigration-config.js";
import { adjustedPull } from "/emigration/ui/emigration-pull.js";

// Deterministic deps: no Open Borders deal (Game absent → bonus 0), Manhattan hex distance,
// no slotted policy.
globalThis.GameplayMap = { getPlotDistance: (ax, ay, bx, by) => Math.abs(ax - bx) + Math.abs(ay - by) };
globalThis.Culture = { isTraditionActive: () => false };

// Pin the knobs adjustedPull reads.
Object.assign(CONFIG, {
  baseReluctance: 4,
  perExtraPop: 0.5,
  cityStateBarrier: 5,
  poachBlock: 12,
  distanceFactor: 0.6,
  congestWeight: 0,
  bordersEnabled: false,
  crossCivEnabled: true,
  tiltCap: 14,
  opennessFloor: 0.25
});

const sig = (owner, pros, population, isCityState, x, y) => ({
  key: `${owner}:${x}:${y}:${pros}`, // pros disambiguates same-location cities in these cases
  owner,
  pros,
  population,
  isCityState,
  rural: 5,
  city: { location: { x, y } }
});
const close = (a, b, msg) =>
  assert.ok(a !== null && Math.abs(a - b) < 1e-9, `${msg}: got ${a}, expected ≈ ${b}`);

// C1 , same-civ, uphill, equal pop, dist 0: (20-10) - 4 = 6.
close(adjustedPull(sig(1, 10, 5, false, 0, 0), sig(1, 20, 5, false, 0, 0), null, null, null), 6, "C1");

// C2 , cross-civ, dest bigger pop (+0.5×4), dist 2 (−1.2): 20 -4 -2 -12 -1.2 = 0.8.
close(adjustedPull(sig(1, 10, 5, false, 0, 0), sig(2, 30, 9, false, 2, 0), null, null, null), 0.8, "C2");

// C3 , city-state dest (−5), cross-civ (−12), dist 1 (−0.6): 25 -4 -5 -12 -0.6 = 3.4.
close(adjustedPull(sig(1, 10, 5, false, 0, 0), sig(3, 35, 5, true, 1, 0), null, null, null), 3.4, "C3");

// C4 , downhill gradient → null.
assert.equal(adjustedPull(sig(1, 20, 5, false, 0, 0), sig(1, 10, 5, false, 0, 0), null, null, null), null, "C4");

// C5 , same-civ, friction exceeds gradient → null.
assert.equal(adjustedPull(sig(1, 10, 5, false, 0, 0), sig(1, 13, 10, false, 5, 0), null, null, null), null, "C5");

// C6 , cross-civ disabled → null.
CONFIG.crossCivEnabled = false;
assert.equal(adjustedPull(sig(1, 10, 5, false, 0, 0), sig(2, 30, 5, false, 1, 0), null, null, null), null, "C6");
CONFIG.crossCivEnabled = true;

// C7 , PERMEABILITY multiply: bordersEnabled + opennessFloor 1.5 → openness 1.5 → 6 × 1.5 = 9.
CONFIG.bordersEnabled = true;
CONFIG.opennessFloor = 1.5;
close(adjustedPull(sig(1, 10, 5, false, 0, 0), sig(1, 20, 5, false, 0, 0), null, null, null), 9, "C7");
CONFIG.bordersEnabled = false;
CONFIG.opennessFloor = 0.25;

// C8 , Asylum TILT (§4a): a war-caused source (violence 2) pulled toward a dest holding asylum.
//   tilt = asylumPushWeight(3) × (violence 2 + disaster 0) = 6, clamped to ±tiltCap;
//   pull = (20-10) + 6 − 4 = 12.
globalThis.Database = { makeHash: (t) => t }; // so policy hashes resolve
globalThis.Players = { get: () => ({ Culture: { isTraditionActive: () => true } }) }; // dest "holds" asylum
Object.assign(CONFIG, { asylumPushWeight: 3, violenceFleeThreshold: 2, disasterFleeThreshold: 2 });
const refugeeSrc = { ...sig(1, 10, 5, false, 0, 0), violence: 2, disaster: 0 };
close(adjustedPull(refugeeSrc, sig(1, 20, 5, false, 0, 0), null, null, null), 12, "C8 asylum tilt");

// C9 , PERMEABILITY relationship factor: an Open Borders deal multiplies cross-civ pull.
//   permeability = openness(1) × permOpenBorders(2) = 2; pull = (20 − 4 reluctance − 12 poach) × 2 = 8.
globalThis.Game = { Diplomacy: { getJointEvents: () => [{ actionTypeName: "DIPLOMACY_ACTION_OPEN_BORDERS" }] } };
Object.assign(CONFIG, { permOpenBorders: 2, bordersEnabled: false });
close(adjustedPull(sig(1, 10, 5, false, 0, 0), sig(2, 30, 5, false, 0, 0), null, null, null), 8, "C9 open-borders permeability");

console.log("engine-pull characterization harness passed (9 cases)");
