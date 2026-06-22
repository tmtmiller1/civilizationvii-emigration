// emigration-network-sim.js
//
// A tiny force-directed layout for the migration network (no external library). Nodes repel each
// other, edges act as springs, and a gentle gravity keeps the graph centred; an annealing "alpha"
// cools the motion so the graph SETTLES into an organic shape and then holds still. Seeded from a
// deterministic ring (optionally reusing cached positions when scrubbing the timeline), so the
// settled layout is reproducible rather than random.

const REPULSE = 26000; // node-node repulsion strength (spreads destination clusters apart)
const SPRING = 0.018; // edge spring stiffness (unused for clusters: no links)
const SPRING_LEN = 150; // edge rest length
const GRAVITY = 0.006; // gentle pull toward centre (low, so clusters fill the whole canvas)
const DAMP = 0.85; // velocity damping per step
const PAD = 16; // keep cluster EDGES this far from the canvas edges (radius added per node)
const COLLIDE_PAD = 12; // minimum gap between two cluster discs (prevents overlap)
const GOLDEN = Math.PI * (3 - Math.sqrt(5)); // golden angle for the sunflower seed spread

/**
 * Clamp v into [lo, hi].
 * @param {number} v Value.
 * @param {number} lo Min.
 * @param {number} hi Max.
 * @returns {number} Clamped.
 */
function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Seed a simulation from a network model: nodes on a deterministic ring (or a cached position when
 * provided, for stable timeline scrubbing), with edge links indexed into the node array. The ring
 * is centred in the (wide) canvas and sized to its SHORTER side, so nodes start clustered in the
 * middle with room to be dragged out across the full width.
 * @param {{nodes:*[], edges:*[]}} net The network model.
 * @param {number} WX Canvas width (logical units).
 * @param {number} WY Canvas height (logical units).
 * @param {Map<number, {x:number,y:number}>} [cache] Prior positions by node id.
 * @returns {{nodes:*[], links:*[], WX:number, WY:number, alpha:number}} The sim state.
 */
export function seedSim(net, WX, WY, cache) {
  const cx = WX / 2;
  const cy = WY / 2;
  const n = net.nodes.length;
  // Seed on an aspect-matched ELLIPSE (uses the full WIDE canvas, not just its short side) whose extent
  // GROWS with the civ count: a few civs stay compact in the middle, while a max-civ large game spreads
  // across the whole canvas from the start instead of piling into a cramped central disk for the sim to
  // slowly pry apart. `fill` is the fraction of each half-axis used (≈0.42 at a typical count, capped so
  // the outermost cluster still clears the edge).
  const fill = clamp(0.30 + 0.045 * Math.sqrt(n), 0.34, 0.46);
  const rx = WX * fill;
  const ry = WY * fill;
  const nodes = net.nodes.map((nd, i) => {
    // Sunflower (phyllotaxis) spread so the initial layout already fills the ellipse, not a thin ring.
    const a = i * GOLDEN;
    const t = Math.sqrt((i + 0.5) / Math.max(1, n)); // normalized radius 0..1
    const cached = cache && cache.get(nd.id);
    return {
      ...nd,
      x: cached ? cached.x : cx + Math.cos(a) * rx * t,
      y: cached ? cached.y : cy + Math.sin(a) * ry * t,
      vx: 0, vy: 0, fx: 0, fy: 0
    };
  });
  const idx = new Map(nodes.map((s, i) => [s.id, i]));
  const links = net.edges
    .map((e) => ({ a: idx.get(e.from), b: idx.get(e.to), w: e.people }))
    .filter((l) => l.a != null && l.b != null);
  return { nodes, links, WX, WY, alpha: 1 };
}

/**
 * Accumulate pairwise repulsion forces.
 * @param {*[]} nodes Sim nodes.
 */
function applyRepulsion(nodes) {
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const d2 = dx * dx + dy * dy + 0.01;
      const f = REPULSE / d2;
      const inv = 1 / Math.sqrt(d2);
      a.fx += dx * inv * f;
      a.fy += dy * inv * f;
      b.fx -= dx * inv * f;
      b.fy -= dy * inv * f;
    }
  }
}

/**
 * Accumulate edge spring forces (toward the rest length).
 * @param {*[]} nodes Sim nodes.
 * @param {*[]} links Edge links.
 */
function applySprings(nodes, links) {
  for (const l of links) {
    const a = nodes[l.a];
    const b = nodes[l.b];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy) + 0.01;
    const f = SPRING * (dist - SPRING_LEN);
    const ux = (dx / dist) * f;
    const uy = (dy / dist) * f;
    a.fx += ux;
    a.fy += uy;
    b.fx -= ux;
    b.fy -= uy;
  }
}

/**
 * Push two overlapping clusters apart by `(dx, dy)` (half the overlap each). A pinned
 * (player-dragged) node stays put and the other takes the full push.
 * @param {*} a Node A.
 * @param {*} b Node B.
 * @param {number} dx Half-overlap x.
 * @param {number} dy Half-overlap y.
 */
function separate(a, b, dx, dy) {
  if (a.pinned && b.pinned) return;
  if (a.pinned) {
    b.x += dx * 2;
    b.y += dy * 2;
  } else if (b.pinned) {
    a.x -= dx * 2;
    a.y -= dy * 2;
  } else {
    a.x -= dx;
    a.y -= dy;
    b.x += dx;
    b.y += dy;
  }
}

/**
 * Push apart any two clusters whose discs overlap, using each node's settled clusterR so big
 * circles never sit on top of one another.
 * @param {*[]} nodes Sim nodes.
 */
function applyCollision(nodes) {
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) + 0.01;
      const min = (a.clusterR || 8) + (b.clusterR || 8) + COLLIDE_PAD;
      if (d >= min) continue;
      const k = ((min - d) / d) * 0.5;
      separate(a, b, dx * k, dy * k);
    }
  }
}

/**
 * Integrate forces → velocity → position for one step. Pinned (player-dragged) nodes hold still.
 * @param {{nodes:*[], alpha:number}} sim The sim state.
 */
function integrate(sim) {
  const a = sim.alpha;
  for (const nd of sim.nodes) {
    if (nd.pinned) {
      nd.vx = 0;
      nd.vy = 0;
      continue;
    }
    nd.vx = (nd.vx + nd.fx * a) * DAMP;
    nd.vy = (nd.vy + nd.fy * a) * DAMP;
    nd.x += nd.vx;
    nd.y += nd.vy;
  }
}

/**
 * Keep every cluster's whole disc within the canvas (PAD + its radius from each edge).
 * @param {{nodes:*[], WX:number, WY:number}} sim The sim state.
 */
function clampNodes(sim) {
  for (const nd of sim.nodes) {
    const r = nd.clusterR || 8;
    nd.x = clamp(nd.x, PAD + r, sim.WX - PAD - r);
    nd.y = clamp(nd.y, PAD + r, sim.WY - PAD - r);
  }
}

/**
 * Advance the simulation one step (forces → velocity → position → collision) and cool the alpha.
 * @param {{nodes:*[], links:*[], WX:number, WY:number, alpha:number}} sim The sim state.
 */
export function stepSim(sim) {
  const cx = sim.WX / 2;
  const cy = sim.WY / 2;
  for (const nd of sim.nodes) {
    nd.fx = (cx - nd.x) * GRAVITY;
    nd.fy = (cy - nd.y) * GRAVITY;
  }
  applyRepulsion(sim.nodes);
  applySprings(sim.nodes, sim.links);
  integrate(sim);
  applyCollision(sim.nodes);
  clampNodes(sim);
  sim.alpha = Math.max(0.015, sim.alpha * 0.965);
}
