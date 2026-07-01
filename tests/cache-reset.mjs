// cache-reset.mjs
//
// The shared "reset persisted caches on game boot" convention (emigration-cache-reset.js): when a NEW
// game id (Configuration.getGame().gameSeed) is seen within a still-live UIScript isolate, every
// registered persisted-state cache is dropped so each module reloads from the NEW game's store instead
// of persisting the prior game's data into it. Covered both at the unit level (the registry + game-id
// guard) and end-to-end through a real consumer (chronicle), which is the actual failure mode the
// convention exists to prevent: a stale cache being read for the dedupe gate AND persisted into the
// new game.

import assert from "node:assert/strict";

// ── Mutable game config: a swappable gameSeed + per-key KV store (a "game" = one seed + one store). ──
let _seed = null;
let _kv = {};
globalThis.Configuration = {
  getGame: () => ({
    gameSeed: _seed, // captured per call, so reassigning _seed simulates a new game
    getValue: (k) => (k in _kv ? _kv[k] : null)
  }),
  editGame: () => ({ setValue: (k, v) => { _kv[k] = v; } })
};
globalThis.Game = { turn: 5 };

// Import chronicle FIRST, while its resetter is freshly registered (the unit block below clears the
// registry, which would also drop chronicle's resetter, so the end-to-end must run before that).
const cacheReset = await import("/emigration/ui/emigration-cache-reset.js");
const { registerCacheReset, resetCachesOnNewGame, currentGameId, __test } = cacheReset;
const { CONFIG } = await import("/emigration/ui/emigration-config.js");
const chronicle = await import("/emigration/ui/emigration-chronicle.js");

// ── End-to-end through chronicle: a new game id clears the stale cache (read + dedupe + persist) ──
{
  _seed = 1000;
  _kv = {};
  assert.equal(chronicle.chronicle({ body: "Game A event", dedupeKey: "shared-milestone" }), true,
    "game A records its milestone");
  assert.equal(chronicle.chronicleLog().length, 1, "game A's chronicle holds one entry");
  assert.equal(chronicle.chronicleLog()[0].body, "Game A event");

  // A NEW game starts inside the same live isolate: new seed + a fresh (empty) store.
  _seed = 2000;
  _kv = {};

  // The FIRST call in the new game is chronicle(), whose dedupe gate consults keys() BEFORE log(). If
  // the cache weren't reset, keys() would still hold game A's "shared-milestone" and silently DROP this
  // entry. With the convention, the new game id resets the caches first, so the entry records.
  assert.equal(chronicle.chronicle({ body: "Game B event", dedupeKey: "shared-milestone" }), true,
    "a milestone game A already recorded is NOT treated as a duplicate in the new game");
  const log = chronicle.chronicleLog();
  assert.equal(log.length, 1, "the new game's chronicle holds ONLY its own entry");
  assert.equal(log[0].body, "Game B event", "no stale game-A entry leaked into the new game");

  // And the PERSISTED store for the new game must contain only the new game's data, the core bug the
  // convention prevents (persisting the prior game's cached data into the new game's store).
  const persisted = JSON.parse(_kv.EmigrationChronicle_v1);
  assert.equal(persisted.length, 1, "the new game's store holds exactly one entry");
  assert.equal(persisted[0].body, "Game B event", "the new game's store was not corrupted with game-A data");
}

// ── currentGameId: reads gameSeed defensively ──
{
  _seed = null;
  assert.equal(currentGameId(), null, "no gameSeed → null");
  _seed = 12345;
  assert.equal(currentGameId(), 12345, "numeric gameSeed read through");
  _seed = "abc";
  assert.equal(currentGameId(), "abc", "string gameSeed read through");
}

// ── resetCachesOnNewGame: first-observation adopts, same id no-ops, change resets, then re-adopts ──
{
  __test.clear();
  let hits = 0;
  registerCacheReset(() => { hits++; });

  _seed = null;
  assert.equal(resetCachesOnNewGame(), false, "unreadable id → no reset");
  assert.equal(hits, 0);

  _seed = 100;
  assert.equal(resetCachesOnNewGame(), false, "first id seen → adopt, don't reset (caches already fresh)");
  assert.equal(hits, 0);

  assert.equal(resetCachesOnNewGame(), false, "same id → no reset");
  assert.equal(hits, 0);

  _seed = 200;
  assert.equal(resetCachesOnNewGame(), true, "changed id → reset fires");
  assert.equal(hits, 1, "the registered resetter ran exactly once");

  assert.equal(resetCachesOnNewGame(), false, "id now adopted → no repeat reset");
  assert.equal(hits, 1);
}

// ── The CONFIG flag gates the whole convention ──
{
  __test.clear();
  let hits = 0;
  registerCacheReset(() => { hits++; });
  const saved = CONFIG.resetCachesOnGameBoot;
  CONFIG.resetCachesOnGameBoot = false;
  _seed = 1;
  resetCachesOnNewGame();
  _seed = 2;
  assert.equal(resetCachesOnNewGame(), false, "feature off → never resets");
  assert.equal(hits, 0);
  CONFIG.resetCachesOnGameBoot = saved;
}

// ── One throwing resetter must not block the others ──
{
  __test.clear();
  let good = 0;
  registerCacheReset(() => { throw new Error("boom"); });
  registerCacheReset(() => { good++; });
  _seed = 10;
  resetCachesOnNewGame(); // adopt
  _seed = 11;
  assert.equal(resetCachesOnNewGame(), true, "reset still completes despite a throwing resetter");
  assert.equal(good, 1, "a throwing resetter doesn't stop its siblings");
}

console.log("cache-reset harness passed");
