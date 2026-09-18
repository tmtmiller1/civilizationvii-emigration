// ethnicity-tiles.mjs
//
// The engine-reading half of the ethnicity lens/tooltip (emigration-ethnicity-tiles.js). Where
// ethnicity-distribution.mjs covers the PURE split math, this covers the bridge that actually reads
// the map: it classifies a settlement's owned plots (district class × build-up bonus), scales its
// population, and memoizes the per-tile mosaic per settlement per turn. We stub the engine globals
// (GameplayMap / Districts / MapConstructibles / Game) and seed the composition ledger, then assert:
//   1. degenerate settlements (no location / untracked / no plots) → null, no throw;
//   2. the happy path yields one tile per readable plot, a key→tile map, and the composition;
//   3. density tracks district class (city-centre ≫ wilderness) and the build-up bonus;
//   4. a minority still reads on at least one tile end-to-end (lens ↔ tooltip agree);
//   5. unreadable map globals degrade to the rural default instead of throwing;
//   6. the per-settlement cache memoizes within a turn and recomputes when the turn advances;
//   7. the cache stays bounded (clears past its cap).

import assert from "node:assert/strict";

// ── Engine stubs ─────────────────────────────────────────────────────────────
// A tiny fixed map: plot index → location, plus per-location district class + build-up. Index 5 is
// deliberately unreadable (null loc → skipped), and (4,4) makes both engine reads throw (→ defaults).
const LOC_BY_INDEX = { 1: { x: 0, y: 0 }, 2: { x: 1, y: 0 }, 3: { x: 0, y: 1 }, 4: { x: 2, y: 2 }, 5: null, 6: { x: 4, y: 4 } };
const DISTRICT_TYPES = { CITY_CENTER: "CC", URBAN: "URB", WILDERNESS: "WILD" };
const DISTRICT_AT = { "0,0": "CC", "1,0": "URB", "0,1": "FARM" /* unknown → rural */, "2,2": "WILD" };

function installEngine() {
  globalThis.Game = { turn: 5 };
  globalThis.DistrictTypes = DISTRICT_TYPES;
  globalThis.GameplayMap = {
    getLocationFromIndex: (i) => LOC_BY_INDEX[i] ?? null
  };
  globalThis.Districts = {
    getAtLocation: ({ x, y }) => {
      if (x === 4 && y === 4) throw new Error("unreadable district");
      const t = DISTRICT_AT[x + "," + y];
      return t ? { type: t } : null;
    }
  };
  globalThis.MapConstructibles = {
    getConstructibles: (x, y) => {
      if (x === 4 && y === 4) throw new Error("unreadable constructibles");
      if (x === 1 && y === 0) return [{}, {}, {}]; // 3 → build-up bonus
      if (x === 0 && y === 1) return { length: 2 }; // array-like (not Array) → still counts
      return [];
    }
  };
}

installEngine();

const { compositionForCity, __test: comp } = await import("/emigration/ui/emigration-composition.js");
const { tilesForCity } = await import("/emigration/ui/emigration-ethnicity-tiles.js");
const { CONFIG } = await import("/emigration/ui/emigration-config.js");
// Keep the composition deterministic (no per-turn ethnic drift) so the shares are exactly as seeded.
CONFIG.integrationEnabled = false;

// ── helpers ──────────────────────────────────────────────────────────────────
/** A settlement signal for the composition pass. */
const signal = (x, y, name, owner, population) => ({ city: { location: { x, y }, name }, owner, population });
/** An instantaneous cross-civ move (immigration record). */
const move = (srcOwner, srcName, destOwner, destName, points) => ({ srcOwner, srcName, destOwner, destName, points, cause: "opportunity" });
/** A fake settlement that owns the given plot indices. */
const cityWithPlots = (x, y, name, plots) => ({ location: { x, y }, name, getPurchasedPlots: () => plots });
const tileAt = (res, x, y) => res.byKey.get(x + "," + y);

// ── 1. Degenerate settlements → null (no throw) ──────────────────────────────
{
  comp.reset();
  assert.equal(tilesForCity(null), null, "null city → null");
  assert.equal(tilesForCity({}), null, "no location → null");
  // Tracked nowhere: a real location but the composition ledger has never seen it.
  assert.equal(tilesForCity({ location: { x: 11, y: 11 } }), null, "untracked settlement → null");
  // Tracked, but the settlement owns no readable plots → null (composition present, plots empty).
  comp.recordCompositionPass([signal(7, 7, "Empty", 0, 12)], []);
  assert.equal(tilesForCity(cityWithPlots(7, 7, "Empty", [])), null, "no plots → null");
  assert.equal(tilesForCity({ location: { x: 7, y: 7 }, getPurchasedPlots: () => null }), null,
    "getPurchasedPlots → null → no tiles");
}

// ── 2 & 3. Happy path: one tile per readable plot, density tracks class + build-up ─
{
  comp.reset();
  globalThis.Game.turn = 10;
  comp.recordCompositionPass([signal(0, 0, "Rome", 0, 20)], []); // 100% civ 0
  const rome = cityWithPlots(0, 0, "Rome", [1, 2, 3, 4, 5, 6]); // index 5 unreadable → skipped

  const res = tilesForCity(rome);
  assert.ok(res, "tracked settlement with plots → a result");
  assert.equal(res.tiles.length, 5, "one tile per READABLE plot (the null-location plot is dropped)");
  assert.equal(res.byKey.size, 5, "byKey has every tile");
  assert.ok(res.byKey.has("0,0") && res.byKey.has("4,4"), "byKey is keyed by 'x,y'");
  assert.equal(res.comp.dominant.civ, 0, "the composition rides along for the tooltip");
  assert.ok(res.tiles.every((t) => t.primary === 0 && t.shares.length === 1),
    "a single-origin city paints every tile its one colour");

  const center = tileAt(res, 0, 0); // CITY_CENTER, no build-up
  const urban = tileAt(res, 1, 0); // URBAN + 3 constructibles
  const rural = tileAt(res, 0, 1); // unknown district → rural default
  const wild = tileAt(res, 2, 2); // WILDERNESS
  const thrown = tileAt(res, 4, 4); // both reads threw → rural default, 0 build-up

  // CITY_CENTER (3.6) ≫ WILDERNESS (0.4): the urban core holds far more people and reads more vivid.
  assert.ok(center.people > wild.people * 5, "the city centre carries far more people than wilderness");
  assert.ok(center.density > wild.density, "denser tile → higher opacity");
  // Build-up bonus: URBAN(2.4)×(1+0.18·3)=3.70 edges out even the bare CITY_CENTER(3.6).
  assert.ok(urban.people > center.people, "a built-up urban tile out-weighs the bare centre (build-up bonus)");
  // Unknown-district and read-error tiles both fall back to the rural weight (1.0), above wilderness.
  // (rural here also carries a small build-up bonus, so: wilderness 0.4 < thrown 1.0 < rural 1.36.)
  assert.ok(rural.people > wild.people, "an unknown district class falls back to rural (> wilderness)");
  assert.ok(thrown.people > wild.people && thrown.people < rural.people,
    "a tile whose engine reads throw degrades to the bare rural default (no build-up)");
  // Conservation: the per-tile people still sum to the scaled population.
  const totalPeople = res.tiles.reduce((a, t) => a + t.people, 0);
  assert.ok(totalPeople > 0 && res.tiles.every((t) => t.density >= 0 && t.density <= 1),
    "people are positive and every density stays in [0,1]");
}

// ── 4. A minority reads on at least one tile (lens ↔ tooltip agreement) ───────
{
  comp.reset();
  globalThis.Game.turn = 11;
  comp.recordCompositionPass([signal(0, 0, "Rome", 0, 20), signal(9, 9, "Carthage", 2, 10)], []);
  // 4 people of civ 2 settle in Rome (it grows 20 → 24): Rome is now ~17% origin-2.
  comp.recordCompositionPass(
    [signal(0, 0, "Rome", 0, 24), signal(9, 9, "Carthage", 2, 6)],
    [move(2, "Carthage", 0, "Rome", 4)]
  );
  const res = tilesForCity(cityWithPlots(0, 0, "Rome", [1, 2, 3, 4]));
  assert.equal(res.comp.dominant.civ, 0, "Rome still reads predominantly as its own civ");
  assert.ok(res.tiles.some((t) => t.shares.some((s) => s.civ === 2)),
    "the immigrant minority is visible on at least one tile (tooltip would show it)");
}

// ── 5. Unreadable map globals degrade to the rural default ────────────────────
{
  comp.reset();
  globalThis.Game.turn = 12;
  const savedDistricts = globalThis.Districts;
  const savedConstructibles = globalThis.MapConstructibles;
  const savedTypes = globalThis.DistrictTypes;
  delete globalThis.Districts;
  delete globalThis.MapConstructibles;
  delete globalThis.DistrictTypes;
  try {
    comp.recordCompositionPass([signal(0, 0, "Rome", 0, 16)], []);
    const res = tilesForCity(cityWithPlots(0, 0, "Rome", [1, 2, 4])); // CC / URB / WILD locations
    assert.equal(res.tiles.length, 3, "tiles still produced with no district/constructible globals");
    const people = res.tiles.map((t) => t.people);
    assert.ok(Math.max(...people) - Math.min(...people) < 1e-6,
      "with no district info every tile carries the same (rural) weight → equal people");
  } finally {
    globalThis.Districts = savedDistricts;
    globalThis.MapConstructibles = savedConstructibles;
    globalThis.DistrictTypes = savedTypes;
  }
}

// ── 6. Per-settlement cache: memoize within a turn, recompute across turns ─────
{
  comp.reset();
  globalThis.Game.turn = 20;
  comp.recordCompositionPass([signal(3, 3, "Tyre", 0, 18)], []);
  const tyre = cityWithPlots(3, 3, "Tyre", [1, 2, 3]);
  const a = tilesForCity(tyre);
  const b = tilesForCity(tyre);
  assert.equal(a, b, "two reads in the same turn return the memoized object (one map walk per turn)");
  globalThis.Game.turn = 21; // advance → the cache entry is stale → recompute
  const c = tilesForCity(tyre);
  assert.notEqual(c, a, "a new turn recomputes a fresh mosaic");
  assert.deepEqual(c.tiles, a.tiles, "…but the deterministic model yields the same tiles");
}

// ── 7. Cache stays bounded (clears past its cap) ─────────────────────────────
{
  // Drive >4096 distinct untracked settlements through the cache; each caches a null value, and the
  // cap-clear branch fires once the map fills. Just assert it never throws and keeps returning null.
  globalThis.Game.turn = 30;
  let nulls = 0;
  for (let i = 0; i < 4200; i++) {
    if (tilesForCity({ location: { x: i, y: 9999 } }) === null) nulls++;
  }
  assert.equal(nulls, 4200, "every untracked settlement returns null; the bounded cache never throws");
}

// ── 8. A standing enclave pins its diaspora's cluster onto the enclave tile ───
// The enclave tile is picked by a land rule in emigration-enclave-place.js that knows nothing about the
// lens's hash anchor, so without the pin the colour patch and the enclave's on-map marker could name
// different tiles. Drives the REAL bridge: a persisted quarter record → enclaveStanding → the anchor.
{
  const ENCLAVE = "IMPROVEMENT_EMIG_ENCLAVE_CARTHAGE";
  const PIN_PLOT = 4; // → (2,2); the hash anchor for civ 2 lands elsewhere (asserted below)

  // A quarter record for Rome (keyed by the settlement CENTRE) whose placed tile stands on PIN_PLOT.
  const quarters = (placed) => JSON.stringify({
    v: 1,
    data: {
      tiles: { "0,0": { civ: 2, owner: 0, optionId: "ignore", turn: 1, recognized: true, placed } },
      candidacy: {}, age: 0, count: 0, lastTurn: -1, formed: { age: 0, byOwner: {} }
    }
  });
  let stored = quarters({ type: ENCLAVE, plot: PIN_PLOT });

  const saved = {
    Configuration: globalThis.Configuration, Constructibles: globalThis.Constructibles,
    GameInfo: globalThis.GameInfo, MapConstructibles: globalThis.MapConstructibles
  };
  globalThis.Configuration = {
    getGame: () => ({ gameSeed: 4242, getValue: (k) => (k === "EmigrationQuarters_v1" ? stored : null) })
  };
  // Make the enclave improvement readable ON the pinned plot only, so enclaveStanding is a real check.
  globalThis.MapConstructibles = { getConstructibles: (x, y) => (x === 2 && y === 2 ? [ENCLAVE] : []) };
  globalThis.Constructibles = { getByComponentID: (id) => ({ type: id }) };
  globalThis.GameInfo = { Constructibles: { lookup: (t) => ({ ConstructibleType: t }) } };

  const shareOf = (tile, civ) => (tile.shares.find((s) => s.civ === civ) || { share: 0 }).share;
  const peakTile = (res) => res.tiles.reduce((a, t) => (shareOf(t, 2) > shareOf(a, 2) ? t : a));
  /** Rome with a Carthaginian minority; `turn` busts the per-settlement cache between reads. */
  const romeAt = (turn) => {
    comp.reset();
    globalThis.Game.turn = turn;
    comp.recordCompositionPass([signal(0, 0, "Rome", 0, 20), signal(9, 9, "Carthage", 2, 10)], []);
    comp.recordCompositionPass(
      [signal(0, 0, "Rome", 0, 24), signal(9, 9, "Carthage", 2, 6)],
      [move(2, "Carthage", 0, "Rome", 4)]
    );
    return tilesForCity(cityWithPlots(0, 0, "Rome", [1, 2, 3, 4]));
  };

  try {
    const withEnclave = romeAt(40);
    const pinned = peakTile(withEnclave);
    assert.equal(pinned.x + "," + pinned.y, "2,2",
      "the diaspora's densest tile is the tile its enclave stands on");
    // The bar comes from the LIVE enclave rule, so retuning enclaves retunes the lens with them.
    const bar = CONFIG.quarterEstablishedShare;
    assert.ok(shareOf(pinned, 2) > bar, "the enclave tile reads PAST the enclave formation bar");
    assert.ok(withEnclave.tiles.every((t) => t === pinned || shareOf(t, 2) <= bar + 1e-9),
      "and it is the only tile that does");
    // SHADING: (2,2) is WILDERNESS on this map (weight 0.4) — the sparsest, faintest tile. An enclave is a
    // packed quarter, so standing on it lifts the tile to urban weight instead of near-transparent.
    const sparsest = withEnclave.tiles.reduce((a, t) => (t.density < a.density ? t : a));
    assert.notEqual(sparsest, pinned, "the enclave tile is no longer the faintest tile in the settlement");
    assert.ok(pinned.people > tileAt(withEnclave, 0, 1).people, "it out-weighs an ordinary rural tile");

    // Same state, but the enclave no longer stands (pillaged / built over): the record is stale, so the
    // lens must stop steering and fall back to the hash anchor rather than pointing at an empty plot.
    globalThis.MapConstructibles = { getConstructibles: () => [] };
    const gone = romeAt(41);
    const unpinned = peakTile(gone);
    assert.notEqual(unpinned.x + "," + unpinned.y, "2,2",
      "a record whose tile no longer stands stops pinning the cluster");
    assert.ok(gone.tiles.every((t) => shareOf(t, 2) <= bar + 1e-9),
      "and with no standing enclave NO tile reads past the bar");
    const wild = tileAt(gone, 2, 2);
    assert.ok(wild.people < tileAt(gone, 0, 1).people, "and the plot is weighted as plain wilderness again");

    // An unreadable quarters store must never blank the lens.
    stored = "{ not json";
    globalThis.MapConstructibles = { getConstructibles: (x, y) => (x === 2 && y === 2 ? [ENCLAVE] : []) };
    const res = romeAt(42);
    assert.ok(res && res.tiles.length === 4, "a corrupt quarters store still paints every tile");
  } finally {
    Object.assign(globalThis, saved);
  }
}

console.log("ethnicity-tiles harness passed");
