import assert from "node:assert/strict";

// The network / flow diagrams must accommodate a full-size large game's worth of civilizations at
// once: after the force layout settles, every civ cluster stays inside the canvas and no two clusters
// overlap. Guards the seeding/settling scale (seedSim spreads civs across the WIDE canvas, growing the
// seed extent with the count) so a max-civ game never piles circles on top of one another.
const { seedSim, stepSim } = await import("/emigration/ui/emigration-network-sim.js");

const WX = 1120;
const WY = 560;

/**
 * Seed `n` equal clusters, settle the sim, and return the overlap / out-of-bounds counts.
 * @param {number} n Civ count.
 * @param {number} clusterR Per-cluster radius (logical units).
 * @returns {{overlaps:number, oob:number}} Failure counts after settling.
 */
function settle(n, clusterR) {
  const net = { nodes: Array.from({ length: n }, (_, i) => ({ id: i })), edges: [] };
  const sim = seedSim(net, WX, WY);
  for (const nd of sim.nodes) nd.clusterR = clusterR;
  for (let s = 0; s < 200; s++) stepSim(sim);
  let overlaps = 0;
  let oob = 0;
  for (let i = 0; i < n; i++) {
    const a = sim.nodes[i];
    // Each cluster's whole disc must sit within the canvas (a 1px tolerance for float drift).
    if (a.x < a.clusterR - 1 || a.x > WX - a.clusterR + 1
      || a.y < a.clusterR - 1 || a.y > WY - a.clusterR + 1) oob++;
    for (let j = i + 1; j < n; j++) {
      const b = sim.nodes[j];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d - (a.clusterR + b.clusterR) < -2) overlaps++; // discs interpenetrate by > 2px
    }
  }
  return { overlaps, oob };
}

// Typical Scaled-mode cluster sizes (the 2000-dot cap keeps per-civ radius modest, and SMALLER as the
// civ count climbs): a max-civ large game and then some must lay out cleanly.
for (const n of [8, 10, 12, 16, 20]) {
  const { overlaps, oob } = settle(n, 70);
  assert.equal(overlaps, 0, `${n} civs (r70): no cluster overlaps`);
  assert.equal(oob, 0, `${n} civs (r70): every cluster inside the canvas`);
}

// Even with LARGE clusters, a realistic major-civ count (≤ 12) packs without overlap.
for (const n of [8, 12]) {
  const { overlaps, oob } = settle(n, 95);
  assert.equal(overlaps, 0, `${n} civs (r95): no cluster overlaps`);
  assert.equal(oob, 0, `${n} civs (r95): every cluster inside the canvas`);
}

console.log("network-scale harness passed (clusters fit + don't overlap up to 20 civs)");
