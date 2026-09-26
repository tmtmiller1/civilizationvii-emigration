// composition-gone.mjs
//
// Settlements that leave the pass's city list (ethnicity audit item 3). A razed settlement must leave the
// ledger on the next pass, not linger for STALE_TURNS; a settlement that still stands but is no longer scanned
// (held by a city-state or independent) keeps its entry, so a later recapture resumes its mix, but it drops out
// of the live readers (allCityCompositions, compositionForOwner) that rank and aggregate current settlements.
//
// The engine's plot lookup is stubbed: MapCities.getCity(x, y) → a city id, Cities.get(id) → the city.

import assert from "node:assert/strict";

let _turn = 1;
globalThis.Game = { get turn() { return _turn; } };
/** @type {Map<string, {id:number, location:{x:number, y:number}, owner:number}>} Standing cities by "x,y". */
const standing = new Map();
globalThis.MapCities = {
  getCity: (x, y) => {
    const c = standing.get(x + "," + y);
    return c ? c.id : null;
  }
};
globalThis.Cities = { get: (id) => [...standing.values()].find((c) => c.id === id) || null };

const { __test, allCityCompositions, compositionForOwner } =
  await import("/emigration/ui/emigration-composition.js");
const { CONFIG } = await import("/emigration/ui/emigration-config.js");
CONFIG.integrationEnabled = false;

const sig = (x, y, name, owner, pop) => ({ city: { location: { x, y }, name }, owner, population: pop });
const keys = () => allCityCompositions().map((e) => e.key).sort();

__test.reset();
standing.set("1,1", { id: 1, location: { x: 1, y: 1 }, owner: 0 });
standing.set("2,2", { id: 2, location: { x: 2, y: 2 }, owner: 0 });
standing.set("3,3", { id: 3, location: { x: 3, y: 3 }, owner: 0 });

_turn = 10;
__test.recordCompositionPass([sig(1, 1, "Rome", 0, 10), sig(2, 2, "Rouen", 0, 6), sig(3, 3, "Taksasila", 0, 4)], []);
assert.deepEqual(keys(), ["1,1", "2,2", "3,3"]);
assert.equal(compositionForOwner(0).total, 20);

// Turn 11: Rouen is razed (no city on its plot), Taksasila passes to a city-state (still stands, not scanned).
standing.delete("2,2");
standing.get("3,3").owner = 40;
_turn = 11;
__test.recordCompositionPass([sig(1, 1, "Rome", 0, 10)], []);

assert.deepEqual(keys(), ["1,1"], "only settlements seen on this pass are listed");
assert.equal(compositionForOwner(0).total, 10, "the empire mix counts only settlements seen on this pass");
const cities = __test.state().cities;
assert.equal(cities["2,2"], undefined, "a razed settlement leaves the ledger on the next pass");
assert.ok(cities["3,3"], "a standing but unscanned settlement keeps its entry");

// A razed plot later covered by a NEIGHBOR's territory: the lookup finds a city, but not one centered there.
standing.set("1,1", { id: 1, location: { x: 1, y: 1 }, owner: 0 });
_turn = 12;
__test.recordCompositionPass([sig(1, 1, "Rome", 0, 10), sig(3, 3, "Taksasila", 0, 4)], []);
assert.deepEqual(keys(), ["1,1", "3,3"], "a recaptured settlement is live again");
standing.delete("3,3");
globalThis.MapCities.getCity = (x, y) => (x === 3 && y === 3 ? 1 : (standing.get(x + "," + y) || {}).id ?? null);
_turn = 13;
__test.recordCompositionPass([sig(1, 1, "Rome", 0, 10)], []);
assert.equal(__test.state().cities["3,3"], undefined, "a plot now owned by another city's territory is gone");

// No engine lookup (unreadable): keep the entry for pruneStale to handle, but it is still not live.
delete globalThis.MapCities;
_turn = 14;
__test.recordCompositionPass([sig(1, 1, "Rome", 0, 10), sig(5, 5, "Ostia", 0, 2)], []);
_turn = 15;
__test.recordCompositionPass([sig(1, 1, "Rome", 0, 10)], []);
assert.ok(__test.state().cities["5,5"], "an unreadable plot is kept, not deleted");
assert.deepEqual(keys(), ["1,1"]);

console.log("composition-gone: all assertions passed");
