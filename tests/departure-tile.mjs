import assert from "node:assert/strict";

// departure-tile harness: the source-side "real loss" module. Off-engine there is no Districts /
// Constructibles surface, so the module must degrade to the plain counter decrement; with a stubbed
// surface it must pick the outlying, resource-free improvement, issue DESTROY_ELEMENT with the
// tuner's argument shape, defer the write until commit, and charge the departure gold to the SOURCE
// owner only.

const grants = [];
const requests = [];
globalThis.YieldTypes = { YIELD_GOLD: "GOLD", YIELD_HAPPINESS: "HAPPY" };
globalThis.Players = {
  grantYield: (pid, yt, amt) => grants.push([pid, yt, amt]),
  get: () => ({ Units: { getUnits: () => [] } })
};
globalThis.Configuration = {
  getGame: () => ({ getValue: () => null }),
  editGame: () => ({ setValue: () => {} })
};
globalThis.Game = { turn: 5, PlayerOperations: { sendRequest: (pid, op, args) => requests.push([pid, op, args]) } };
globalThis.GameContext = { localPlayerID: 0 };
globalThis.GameInfo = {
  Leaders: { lookup: () => null },
  Civilizations: { lookup: () => null },
  Constructibles: { lookup: (t) => ({ ConstructibleType: t }) }
};

const { CONFIG } = await import("/emigration/ui/emigration-config.js");
const mod = await import("/emigration/ui/emigration-departure-tile.js");
const {
  listDepartureTiles, rankDepartureTiles, findDepartureTile, abandonTileOrDecrement,
  departureWouldAbandonTile, commitSourcePoint, departureTileApiAvailable
} = mod;

function makeCity(owner, rural) {
  return {
    owner,
    location: { x: 10, y: 10 },
    population: rural + 3,
    ruralPopulation: rural,
    writes: [],
    getPurchasedPlots: () => [100, 101, 102, 103],
    addRuralPopulation(d) {
      this.writes.push(d);
      this.ruralPopulation += d;
      this.population += d;
    }
  };
}

// ── 1. Off-engine (no Districts): counter path, nothing deferred, no requests ──────────────────────
{
  assert.equal(departureTileApiAvailable(), false);
  const c = makeCity(0, 4);
  assert.equal(departureWouldAbandonTile(c), false);
  assert.deepEqual(listDepartureTiles(c), []);
  const r = abandonTileOrDecrement(c);
  assert.equal(r.mode, "counter");
  assert.equal(r.ok, true);
  assert.deepEqual(c.writes, [-1]);
  assert.equal(requests.length, 0);
}

// ── 2. Pure ranking: plain tiles first, then farthest, then lowest plot index ─────────────────────
{
  const ranked = rankDepartureTiles([
    { plot: 5, onResource: true, distance: 3 },
    { plot: 7, onResource: false, distance: 1 },
    { plot: 6, onResource: false, distance: 2 },
    { plot: 2, onResource: false, distance: 2 }
  ]);
  assert.deepEqual(ranked.map((t) => t.plot), [2, 6, 7, 5]);
  assert.equal(rankDepartureTiles(null).length, 0);
}

// ── 3. Stubbed engine surface: finds improvements, skips the centre, destroys the outlying one ─────
const PLOT_LOC = { 100: { x: 10, y: 10 }, 101: { x: 11, y: 10 }, 102: { x: 13, y: 10 }, 103: { x: 12, y: 10 } };
const IMPROVEMENTS = { 100: "IMPROVEMENT_PALACE_FARM", 101: "IMPROVEMENT_FARM", 102: "IMPROVEMENT_MINE", 103: "IMPROVEMENT_CAMP" };
const RESOURCE_AT = { 102: 7 }; // the far mine sits on a resource → deprioritised
globalThis.Districts = {
  getAtLocation: (loc) => {
    const plot = Object.keys(PLOT_LOC).find((p) => PLOT_LOC[p].x === loc.x && PLOT_LOC[p].y === loc.y);
    if (!plot) return null;
    return { getConstructibleIdsOfClass: () => [{ owner: 4, id: Number(plot) * 10, type: 2 }] };
  }
};
globalThis.ConstructibleClasses = { IMPROVEMENT: 1 };
globalThis.Constructibles = { getByComponentID: (id) => ({ type: IMPROVEMENTS[id.id / 10] }) };
globalThis.GameplayMap = {
  getLocationFromIndex: (p) => PLOT_LOC[p],
  getPlotDistance: (ax, ay, bx, by) => Math.abs(ax - bx) + Math.abs(ay - by),
  getResourceType: (x, y) => {
    const plot = Object.keys(PLOT_LOC).find((p) => PLOT_LOC[p].x === x && PLOT_LOC[p].y === y);
    return RESOURCE_AT[plot] ?? -1;
  }
};
{
  assert.equal(departureTileApiAvailable(), true);
  const c = makeCity(4, 3);
  const tiles = listDepartureTiles(c);
  assert.deepEqual(tiles.map((t) => t.plot).sort(), [101, 102, 103], "centre plot (100) is never a candidate");
  const best = findDepartureTile(c);
  assert.equal(best.plot, 103, "farthest resource-free improvement wins (the mine at 102 sits on a resource)");
  assert.equal(best.type, "IMPROVEMENT_CAMP");
  assert.equal(departureWouldAbandonTile(c), true);

  const r = abandonTileOrDecrement(c);
  assert.equal(r.mode, "tile");
  assert.equal(r.type, "IMPROVEMENT_CAMP");
  assert.deepEqual(c.writes, [], "tile mode never touches the counter");
  assert.equal(requests.length, 1);
  const [sender, op, args] = requests[0];
  assert.equal(sender, 0, "sent by the local player (the op is not owner-gated)");
  assert.equal(op, "DESTROY_ELEMENT");
  assert.deepEqual(args, { Kind: "CONSTRUCTIBLE", Owner: 4, LocalID: 1030 });
}

// ── 4. Option off → counter path even with the surface present ────────────────────────────────────
{
  CONFIG.departureRemovesTile = false;
  const c = makeCity(4, 3);
  assert.equal(departureWouldAbandonTile(c), false);
  const r = abandonTileOrDecrement(c);
  assert.equal(r.mode, "counter");
  assert.deepEqual(c.writes, [-1]);
  CONFIG.departureRemovesTile = true;
}

// ── 5. Deferred commit: destroys on commit, never charges the source owner, no-op for pool points ──
{
  requests.length = 0;
  grants.length = 0;
  const c = makeCity(4, 3);
  const r = commitSourcePoint({ city: c, owner: 4 }, { ok: true, fromPool: false, deferredTile: true });
  assert.equal(r.mode, "tile");
  assert.equal(requests.length, 1);
  assert.equal(grants.length, 0, "the losing civilization pays nothing beyond the tile");

  requests.length = 0;
  const pool = commitSourcePoint({ city: c, owner: 4 }, { ok: true, fromPool: true });
  assert.deepEqual(pool, { mode: "none" });
  assert.equal(requests.length, 0);

  // Already written the plain way (no deferral): nothing else happens.
  const plain = commitSourcePoint({ city: c, owner: 4 }, { ok: true, fromPool: false });
  assert.equal(plain.mode, "counter");
  assert.equal(requests.length, 0);
  assert.equal(grants.length, 0);
}

// ── 5b. Two departures in one turn never pick the same tile (the first DESTROY is still in flight) ─
{
  Game.turn = 6; // a fresh turn: nothing excluded yet
  requests.length = 0;
  const c = makeCity(4, 3);
  const first = commitSourcePoint({ city: c, owner: 4 }, { ok: true, fromPool: false, deferredTile: true });
  const second = commitSourcePoint({ city: c, owner: 4 }, { ok: true, fromPool: false, deferredTile: true });
  const third = commitSourcePoint({ city: c, owner: 4 }, { ok: true, fromPool: false, deferredTile: true });
  assert.deepEqual([first.mode, second.mode, third.mode], ["tile", "tile", "tile"]);
  assert.equal(requests.length, 3);
  assert.equal(new Set(requests.map((r) => r[2].LocalID)).size, 3, "a different improvement each time");
  // The three candidates are spent this turn: a fourth departure falls back to the counter.
  const fourth = commitSourcePoint({ city: c, owner: 4 }, { ok: true, fromPool: false, deferredTile: true });
  assert.equal(fourth.mode, "counter");
  assert.deepEqual(c.writes, [-1]);
  assert.equal(departureWouldAbandonTile(c), false);
  // A new turn clears the exclusion.
  Game.turn = 7;
  assert.equal(departureWouldAbandonTile(c), true);
}

// ── 6. A city with no improvements left falls back to the counter on commit ───────────────────────
{
  requests.length = 0;
  Game.turn = 7;
  const c = makeCity(4, 3);
  c.getPurchasedPlots = () => [100]; // only the centre
  const r = commitSourcePoint({ city: c, owner: 4 }, { ok: true, fromPool: false, deferredTile: true });
  assert.equal(r.mode, "counter");
  assert.deepEqual(c.writes, [-1]);
  assert.equal(requests.length, 0);
}

// ── 8. Meeting the other systems: pillaged tiles go first; a starving city keeps its food tiles ───
{
  const tiles = [
    { plot: 1, onResource: false, distance: 3, damaged: false, feeds: true, type: "IMPROVEMENT_FARM" },
    { plot: 2, onResource: true, distance: 1, damaged: true, feeds: false, type: "IMPROVEMENT_MINE" },
    { plot: 3, onResource: false, distance: 2, damaged: false, feeds: false, type: "IMPROVEMENT_CAMP" }
  ];
  assert.deepEqual(rankDepartureTiles(tiles).map((t) => t.plot), [2, 1, 3], "the pillaged tile first, even on a resource");
  assert.deepEqual(rankDepartureTiles(tiles, { avoidFood: true }).map((t) => t.plot), [2, 3, 1], "under famine the farm goes last");
  // findDepartureTile reads `damaged` off the constructible instance and food off the yield table.
  const oldGet = Constructibles.getByComponentID;
  Constructibles.getByComponentID = (id) => ({ type: IMPROVEMENTS[id.id / 10], damaged: id.id === 1020 }); // the far mine is pillaged
  GameInfo.Constructible_YieldChanges = { filter: (f) => [
    { ConstructibleType: "IMPROVEMENT_FARM", YieldType: "YIELD_FOOD", YieldChange: 1 },
    { ConstructibleType: "IMPROVEMENT_MINE", YieldType: "YIELD_PRODUCTION", YieldChange: 1 }
  ].filter(f) };
  const listed = listDepartureTiles(makeCity(4, 3));
  assert.ok(listed.length >= 2, "the stubbed surface lists the improvements");
  assert.equal(listed.find((t) => t.elem.id === 1020).damaged, true);
  assert.equal(findDepartureTile(makeCity(4, 3)).type, "IMPROVEMENT_MINE", "the pillaged resource mine now goes before the plain camp");
  assert.equal(listed.find((t) => t.type === "IMPROVEMENT_FARM").feeds, true);
  assert.equal(listed.find((t) => t.type === "IMPROVEMENT_MINE").feeds, false);
  Constructibles.getByComponentID = oldGet;
  delete GameInfo.Constructible_YieldChanges;
  // A placed Cultural Enclave is never a departure tile (watched 2026-09-13: it was London's outlying pick).
  const wasCamp = IMPROVEMENTS[103];
  IMPROVEMENTS[103] = "IMPROVEMENT_EMIG_ENCLAVE_ROME_A";
  assert.ok(!listDepartureTiles(makeCity(4, 3)).some((t) => t.type.startsWith("IMPROVEMENT_EMIG_ENCLAVE_")), "enclave tiles are excluded");
  IMPROVEMENTS[103] = wasCamp;
  // A themed skin (another civilization's improvement) is excluded by RECORD, since the type alone cannot
  // tell an enclave from the owner's genuine improvement.
  const { putQuarter, dropQuarter } = await import("/emigration/ui/emigration-quarter-state.js");
  IMPROVEMENTS[102] = "IMPROVEMENT_CARAVANSERAI";
  assert.ok(listDepartureTiles(makeCity(4, 3)).some((t) => t.plot === 102), "a plain caravanserai is a departure tile");
  putQuarter("t:4:102", { civ: 9, originCiv: "CIVILIZATION_CARTHAGE", owner: 4, optionId: "a", turn: 1,
    applied: { benefitYield: null, benefitAmount: 0, penaltyYield: null, penaltyAmount: 0 }, contested: false, contestedTurn: -999,
    placed: { type: "IMPROVEMENT_CARAVANSERAI", plot: 102, enclave: "IMPROVEMENT_EMIG_ENCLAVE_CARTHAGE_A" } });
  assert.ok(!listDepartureTiles(makeCity(4, 3)).some((t) => t.plot === 102), "the recorded enclave plot is excluded");
  dropQuarter("t:4:102");
  IMPROVEMENTS[102] = "IMPROVEMENT_MINE";
}

// ── 10. Only rural tiles leave: the urban core is never taken; deaths keep the rural floor; the disaster cap ──
{
  const { abandonForDeath, canShedPoint, canShedAny } = mod;
  Game.turn = 50;
  // A rural-exhausted source sheds nothing for any cause, however many specialists and buildings it has.
  const bare = { city: makeCity(0, 0), owner: 0, rural: 0, urban: 3, specialists: 2 };
  assert.equal(canShedPoint(bare, "war"), false, "the urban core never leaves");
  assert.equal(canShedPoint(bare, "prosperity"), false);
  assert.equal(canShedAny(bare), false);
  // Deaths keep the rural floor: at or below it the dead leave via the counter, not the last farmstead,
  // and no engine request is sent (no building destroy, no specialist un-assign).
  CONFIG.departureRemovesTile = true;
  const dying = makeCity(5, 1); dying.id = { owner: 5, id: 22, type: 1 };
  const sentBefore = requests.length;
  assert.equal(abandonForDeath({ city: dying, owner: 5, rural: 1, urban: 3, specialists: 2 }).mode, "counter", "at the rural floor the tile stays");
  assert.equal(requests.length, sentBefore, "no engine request at the rural floor");
  // The disaster cap gates crisis shedding by cause.
  const { recordDisasterLoss } = await import("/emigration/ui/emigration-disasters.js");
  CONFIG.disastersEnabled = true; CONFIG.disasterLossCapPct = 0.5;
  const struck = makeCity(5, 6); struck.id = { owner: 5, id: 23, type: 1 };
  const ssrc = { city: struck, owner: 5, rural: 6, urban: 3, specialists: 0 };
  assert.equal(canShedPoint(ssrc, "disaster"), true);
  for (let i = 0; i < 4; i++) recordDisasterLoss(struck, 8); // onset 8 → cap 4
  assert.equal(canShedPoint(ssrc, "disaster"), false, "the remnant digs in");
  assert.equal(canShedPoint(ssrc, "war"), true, "another cause is not held by the disaster cap");
  assert.equal(canShedPoint(ssrc, "prosperity"), true);
  CONFIG.disastersEnabled = false;
}

// The abandon log line carries the damage flag and the age since the tile was first seen damaged; a plot
// seen undamaged is forgotten so a later raid starts a fresh age.
{
  const { noteDamage, firstSeenDamaged, resetDamageAges } = await import("/emigration/ui/emigration-damage-age.js");
  resetDamageAges();
  noteDamage(900, true, 3);
  noteDamage(900, true, 4);
  assert.equal(firstSeenDamaged(900), 3, "the first sighting sticks");
  Game.turn = 7;
  assert.equal(mod.abandonLine("departure", { type: "IMPROVEMENT_FARM", plot: 900, damaged: true }),
    "abandoned IMPROVEMENT_FARM at plot 900 (departure, turn 7) damaged=yes firstSeenDamaged=3 damagedTurns=4");
  assert.equal(mod.abandonLine("death", { type: "IMPROVEMENT_MINE", plot: 901, damaged: false }),
    "abandoned IMPROVEMENT_MINE at plot 901 (death, turn 7) damaged=no");
  noteDamage(900, false, 8);
  assert.equal(firstSeenDamaged(900), null, "a repaired plot is forgotten");
  Game.turn = 5;
}

console.log("departure-tile harness passed");
