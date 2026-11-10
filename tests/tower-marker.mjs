// tower-marker.mjs
//
// Tower marker buildings (constructible tag TOWER_MARKER) stand in a City Center so the AI can read an effect, and
// the engine lists them with the city's buildings. Every screen and rule here that counts, lists or scores what
// stands on a tile skips them. Each case runs twice: with the tag in TypeTags the marker is skipped, and with the
// tag gone (or TypeTags missing) the same marker counts, which shows the case would fail without the skip.

import assert from "node:assert/strict";
import { CONFIG } from "/emigration/ui/emigration-config.js";
import { isTowerMarker, isTowerMarkerId, withoutTowerMarkers, __test as TM } from "/emigration/ui/emigration-tower-marker.js";
import { __test as B } from "/emigration/ui/emigration-built.js";
import { cityFeatureKeys } from "/emigration/ui/emigration-city-features.js";
import { __test as ET } from "/emigration/ui/emigration-ethnicity-tiles.js";
import { tileScore, scorable, resetTileScoreCaches } from "/emigration/ui/emigration-tile-score.js";
import { pillagedCount } from "/emigration/ui/emigration-violence-signals.js";
import { bestBuildingFor } from "/emigration/ui/emigration-prescribe.js";

const MARKER = "BUILDING_ECON_MARKET_MARKER"; // "MARKET" in the name, so a name match would credit a market
const DEFS = [
  { ConstructibleType: "BUILDING_PALACE", ConstructibleClass: "BUILDING", Name: "LOC_PALACE", Age: "AGE_ANTIQUITY" },
  { ConstructibleType: "BUILDING_GRANARY", ConstructibleClass: "BUILDING", Name: "LOC_GRANARY", Age: "AGE_ANTIQUITY" },
  { ConstructibleType: MARKER, ConstructibleClass: "BUILDING", Name: "LOC_MARKER", Age: "AGE_ANTIQUITY", CanBeHidden: 0 }
];
DEFS.forEach((d, i) => { d.$index = i; });
const byType = new Map(DEFS.map((d) => [d.ConstructibleType, d]));

// Plot 0 is a City Center at (0,0) holding the Palace and the marker (pillaged, to test the pillage scan). Plot 1 is
// sea at (1,0) holding only a marker. A component id is {type index}.
const PLOT = { 0: { x: 0, y: 0 }, 1: { x: 1, y: 0 } };
const AT = { "0,0": [{ t: 0 }, { t: 2, damaged: true }], "1,0": [{ t: 2 }] };

/** @param {boolean} tagged Whether TypeTags tags the marker; null leaves the TypeTags table out. */
function install(tagged) {
  const rows = [{ Type: "BUILDING_PALACE", Tag: "IGNORE_DISTRICT_PLACEMENT_CAP" }];
  if (tagged) rows.push({ Type: MARKER, Tag: "TOWER_MARKER" });
  globalThis.GameInfo = {
    Constructibles: Object.assign([...DEFS], {
      lookup: (k) => (typeof k === "number" ? DEFS[k] : byType.get(k)) || null
    }),
    Buildings: [],
    Constructible_YieldChanges: [
      { ConstructibleType: "BUILDING_GRANARY", YieldType: "YIELD_FOOD", YieldChange: 2 },
      { ConstructibleType: MARKER, YieldType: "YIELD_FOOD", YieldChange: 9 }
    ],
    ...(tagged === null ? {} : { TypeTags: rows })
  };
  globalThis.Constructibles = { getByComponentID: (c) => (c ? { type: c.t, damaged: !!c.damaged } : null) };
  globalThis.MapConstructibles = { getConstructibles: (x, y) => AT[x + "," + y] || [] };
  globalThis.GameplayMap = {
    getLocationFromIndex: (i) => PLOT[i] || null,
    isWater: (x, y) => x === 1 && y === 0,
    isRiver: () => false,
    isMountain: () => false,
    isCoastalLand: () => false,
    isNavigableRiver: () => false,
    getYields: () => []
  };
  globalThis.DistrictTypes = { CITY_CENTER: "CC" };
  globalThis.Districts = { getAtLocation: ({ x, y }) => (x === 0 && y === 0 ? { type: "CC" } : null) };
  globalThis.Game = { turn: 1 };
  TM.reset();
  B.reset();
  resetTileScoreCaches();
}

const city = { owner: 0, id: { id: 1 }, location: { x: 0, y: 0 }, getPurchasedPlots: () => [0] };
const buildingTerms = (x, y) => tileScore(x, y, null).terms.filter((t) => t.kind === "building" || t.kind === "quarter");
CONFIG.vwPillage = 0.6;

let ran = 0;

// The helper: the tag is read from TypeTags; no table, or no tag, skips nothing
{
  install(true);
  assert.equal(isTowerMarker(MARKER), true);
  assert.equal(isTowerMarker("BUILDING_PALACE"), false, "another tag isn't the marker tag");
  assert.equal(isTowerMarkerId({ t: 2 }), true);
  assert.deepEqual(withoutTowerMarkers(AT["0,0"]).map((c) => c.t), [0]);
  assert.deepEqual(withoutTowerMarkers(null), []);
  install(null);
  assert.equal(isTowerMarker(MARKER), false, "without a TypeTags table nothing is a marker");
  assert.equal(withoutTowerMarkers(AT["0,0"]).length, 2);
  install(false);
  assert.equal(isTowerMarker(MARKER), false);
  delete globalThis.GameInfo;
  TM.reset();
  assert.equal(isTowerMarker(MARKER), false, "before GameInfo loads nothing is a marker");
  install(true);
  assert.equal(isTowerMarker(MARKER), true, "and the empty read wasn't cached");
  ran++;
}

// The built-environment index (reasons to stay) leaves markers out, even ones that aren't hidden
{
  install(false);
  assert.equal(B.index().has(MARKER), true, "control: an untagged, unhidden building is indexed");
  install(true);
  assert.equal(B.index().has(MARKER), false, "a tagged marker isn't something the settlement built");
  assert.equal(B.index().has("BUILDING_PALACE"), true);
  ran++;
}

// The Chronicle's feature keys don't credit a market for a marker named like one
{
  install(false);
  assert.equal(cityFeatureKeys(city).has("market"), true, "control: the name match fires without the tag");
  install(true);
  assert.equal(cityFeatureKeys(city).has("market"), false);
  ran++;
}

// The ethnicity mosaic's build-up counts the Palace, not the marker
{
  install(false);
  assert.equal(ET.constructibleCount(0, 0), 2, "control");
  install(true);
  assert.equal(ET.constructibleCount(0, 0), 1);
  ran++;
}

// The prosperity tile score: one building on the center (no quarter), and a sea tile with only a marker isn't painted
{
  install(false);
  // Untagged, the marker is pillaged here, so it scores as ruin: drop the damage for the building-count control.
  AT["0,0"][1].damaged = false;
  assert.equal(buildingTerms(0, 0).filter((t) => t.kind === "building").length, 2, "control: two buildings");
  assert.equal(scorable(1, 0), true, "control: built-on water is painted");
  install(true);
  assert.equal(buildingTerms(0, 0).filter((t) => t.kind === "building").length, 1);
  assert.equal(buildingTerms(0, 0).some((t) => t.kind === "quarter"), false, "a marker doesn't make a quarter");
  assert.equal(scorable(1, 0), false);
  AT["0,0"][1].damaged = true;
  assert.equal(tileScore(0, 0, null).terms.some((t) => t.kind === "pillaged"), false, "a damaged marker isn't ruin");
  ran++;
}

// The pillage scan (violence) doesn't count a damaged marker as a pillaged plot
{
  install(false);
  assert.equal(pillagedCount(city), 1, "control");
  install(true);
  assert.equal(pillagedCount(city), 0);
  ran++;
}

// The readout's "build this" advice never names a marker, even one that gives more
{
  install(false);
  assert.equal(bestBuildingFor("YIELD_FOOD", "AGE_ANTIQUITY").name, "LOC_MARKER", "control");
  install(true);
  assert.equal(bestBuildingFor("YIELD_FOOD", "AGE_ANTIQUITY").name, "LOC_GRANARY");
  ran++;
}

console.log(`tower-marker: ${ran} groups passed`);
