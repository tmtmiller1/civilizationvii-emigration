import assert from "node:assert/strict";

// arrival-placement harness: the destination-side placement layer for the human player. Foreign
// cities and mode 0 must be the plain +1 write; mode 1 must place with EXPAND on the game's offered
// plot (resource tile preferred); mode 2 must build a prompt view and act on its answer; mode 3 must
// spawn a Migrant unit instead of writing population; every failure must fall back, never throw.

const requests = [];
const cityCommands = [];
let expandPlots = [200, 201];
globalThis.GameContext = { localPlayerID: 0 };
globalThis.Game = {
  turn: 3,
  PlayerOperations: {
    sendRequest: (pid, op, args) => { requests.push([pid, op, args]); return true; },
    canStart: () => ({ Success: false })
  },
  CityCommands: {
    canStart: () => ({ Success: true, Plots: expandPlots }),
    sendRequest: (id, cmd, args) => cityCommands.push([id, cmd, args])
  }
};
globalThis.CityCommandTypes = { EXPAND: "EXPAND" };
globalThis.PlayerOperationTypes = { ASSIGN_WORKER: "ASSIGN_WORKER" };
globalThis.GameplayMap = {
  getLocationFromIndex: (p) => ({ x: p, y: 1 }),
  getResourceType: (x) => (x === 201 ? 3 : -1)
};

const { CONFIG } = await import("/emigration/ui/emigration-config.js");
const mod = await import("/emigration/ui/emigration-arrival-placement.js");
const { arriveRural, arrivalFrom, dominantOrigin, flushArrivalPlacements, placementMode, pickExpandPlot, autoPlace, arrivalPromptView, PLACEMENT,
  _setSyncFlushForTests, _pendingCountForTests } = mod;
_setSyncFlushForTests(true);

function makeCity(owner, id) {
  return {
    owner,
    id: { owner, id, type: 1 },
    name: "City" + id,
    location: { x: 5, y: 5 },
    population: 6,
    ruralPopulation: 3,
    pendingPopulation: 0,
    writes: [],
    getPurchasedPlots: () => [200, 201],
    addRuralPopulation(d) {
      this.writes.push(d);
      this.ruralPopulation += d;
      this.population += d;
      this.pendingPopulation += d;
    }
  };
}

// ── mode clamp + plot choice ──────────────────────────────────────────────────────────────────────
{
  CONFIG.arrivalPlacement = 2;
  assert.equal(placementMode(), PLACEMENT.ASK);
  CONFIG.arrivalPlacement = 9;
  assert.equal(placementMode(), PLACEMENT.OFF);
  assert.equal(pickExpandPlot([200, 201]), 201, "a resource tile is preferred");
  assert.equal(pickExpandPlot([200]), 200);
}

// ── mode 0 and foreign cities: the plain write, nothing queued ────────────────────────────────────
{
  CONFIG.arrivalPlacement = 0;
  const c = makeCity(0, 1);
  assert.equal(arriveRural(c), true);
  assert.deepEqual(c.writes, [1]);
  assert.equal(cityCommands.length, 0);
  CONFIG.arrivalPlacement = 1;
  const f = makeCity(3, 2);
  assert.equal(arriveRural(f), true);
  assert.deepEqual(f.writes, [1]);
  assert.equal(cityCommands.length, 0, "AI cities place their own points");
  assert.equal(_pendingCountForTests(), 0);
}

// ── mode 1 automatic: +1 then EXPAND on the resource plot, once per point ─────────────────────────
{
  CONFIG.arrivalPlacement = 1;
  CONFIG.arrivalPreferSpecialists = false;
  const c = makeCity(0, 3);
  assert.equal(arriveRural(c), true);
  assert.deepEqual(c.writes, [1]);
  assert.equal(cityCommands.length, 1);
  assert.deepEqual(cityCommands[0], [c.id, "EXPAND", { X: 201, Y: 1 }]);
  cityCommands.length = 0;
  // No pending point → nothing to place.
  c.pendingPopulation = 0;
  assert.equal(autoPlace(c, 2), 0);
  // No plots offered → stops without throwing.
  c.pendingPopulation = 1;
  expandPlots = [];
  assert.equal(autoPlace(c, 1), 0);
  expandPlots = [200, 201];
}

// ── mode 1 with specialist preference: ASSIGN_WORKER first when the engine allows it ─────────────
{
  CONFIG.arrivalPreferSpecialists = true;
  Game.PlayerOperations.canStart = (pid, op, args) => ({ Success: op === "ASSIGN_WORKER" && args.Location === 201 });
  const c = makeCity(0, 4);
  requests.length = 0;
  cityCommands.length = 0;
  assert.equal(arriveRural(c), true);
  assert.deepEqual(requests, [[0, "ASSIGN_WORKER", { Location: 201, Amount: 1 }]]);
  assert.equal(cityCommands.length, 0, "a seated specialist means no tile expansion");
  CONFIG.arrivalPreferSpecialists = false;
  Game.PlayerOperations.canStart = () => ({ Success: false });
}

// ── mode 2 ask: the view names the city and count; several points in one city → one prompt ───────
{
  CONFIG.arrivalPlacement = 2;
  _setSyncFlushForTests(false); // let arrivals batch
  const c = makeCity(0, 5);
  assert.equal(arriveRural(c), true);
  assert.equal(arriveRural(c), true);
  assert.equal(_pendingCountForTests(), 1, "two points in one city batch into one pending entry");
  const v = arrivalPromptView(c, 2);
  assert.match(v.title, /City5/);
  assert.match(v.body, /^2 population points .* City5/);
  assert.deepEqual(v.choices.map((x) => x.id), ["choose", "auto", "later"]);
  assert.equal(v.dismissId, "later");
  assert.match(arrivalPromptView(c, 1).body, /^A population point/);
  assert.equal(arrivalPromptView(c, 1).eyebrow, "Newcomers", "the pop-up names its category so it is not mistaken for an enclave");
  assert.equal(arrivalPromptView(c, 1).eyebrowIcon, "YIELD_POPULATION");
  assert.equal(v.quote, "", "no quote is passed when none is given");
  assert.equal(arrivalPromptView(c, 1, "\"Q\" — W").quote, "\"Q\" — W", "the view carries the epigraph it is given");
  // Flushing off-engine: showDilemma is a silent no-op without the core dialog module.
  assert.equal(flushArrivalPlacements(), 1);
  assert.equal(_pendingCountForTests(), 0);
  _setSyncFlushForTests(true);
}

// ── mode 3 unit: spawn a Migrant for the local player, no population write; fall back on failure ──
{
  CONFIG.arrivalPlacement = 3;
  requests.length = 0;
  const c = makeCity(0, 6);
  assert.equal(arriveRural(c), true);
  assert.deepEqual(c.writes, [], "the point arrives as a unit, not as population");
  assert.equal(requests.length, 1);
  assert.equal(requests[0][1], "CREATE_ELEMENT");
  assert.deepEqual(requests[0][2], { IndependentIndex: -1, Kind: "UNIT", Location: { x: 5, y: 5 }, Owner: 0, Type: "UNIT_MIGRANT" });
  // Foreign city in unit mode → plain write (CREATE_ELEMENT is local-player-only).
  const f = makeCity(2, 7);
  requests.length = 0;
  assert.equal(arriveRural(f), true);
  assert.deepEqual(f.writes, [1]);
  assert.equal(requests.length, 0);
  // Spawn failure → plain write.
  Game.PlayerOperations.sendRequest = () => false;
  const d = makeCity(0, 8);
  assert.equal(arriveRural(d), true);
  assert.deepEqual(d.writes, [1]);
}

CONFIG.arrivalPlacement = 2;
console.log("arrival-placement harness passed");

// ── arrival origins: cause maps to refugee or migrant; the majority origin picks the quote ───────────
{
  assert.deepEqual(arrivalFrom(4, "war"), { civ: 4, kind: "refugee", cause: "war" });
  assert.deepEqual(arrivalFrom(4, "disaster"), { civ: 4, kind: "refugee", cause: "disaster" });
  assert.deepEqual(arrivalFrom(2, "prosperity"), { civ: 2, kind: "migrant", cause: "prosperity" });
  assert.equal(dominantOrigin(undefined), null);
  assert.equal(dominantOrigin(new Map()), null);
  assert.deepEqual(dominantOrigin(new Map([["4|refugee|war", 1], ["2|migrant|prosperity", 3]])),
    { civ: 2, kind: "migrant", cause: "prosperity" });
  assert.deepEqual(dominantOrigin(new Map([["|refugee|war", 2]])), { civ: null, kind: "refugee", cause: "war" },
    "a held pool knows the kind and what they fled");
  assert.deepEqual(dominantOrigin(new Map([["1|migrant|prosperity", 2], ["3|refugee|war", 2]])),
    { civ: 1, kind: "migrant", cause: "prosperity" }, "ties go to the first tallied");
  CONFIG.arrivalPlacement = 2;
  _setSyncFlushForTests(false);
  const c = makeCity(0, 9);
  arriveRural(c, { civ: 3, kind: "refugee" });
  arriveRural(c);
  assert.equal(_pendingCountForTests(), 1, "points with and without an origin still batch into one prompt");
  assert.equal(flushArrivalPlacements(), 1);
  _setSyncFlushForTests(true);
  console.log("arrival-placement origins: ok");
}

// ── ask by kind: only the asked kinds wait for the pop-up; the others are placed at once ─────────────
{
  const { asksAbout } = mod;
  CONFIG.arrivalPlacement = 2;
  CONFIG.arrivalAskRefugees = true; CONFIG.arrivalAskMigrants = false; CONFIG.arrivalAskReturnees = false;
  assert.equal(asksAbout({ civ: 3, kind: "refugee" }), true, "refugees ask by default");
  assert.equal(asksAbout({ civ: 2, kind: "migrant" }), false, "migrants do not");
  assert.equal(asksAbout(undefined), false, "an arrival with no kind is a returnee, which does not");
  _setSyncFlushForTests(false);
  Game.CityCommands.sendRequest = (id, cmd, args) => cityCommands.push([id, cmd, args]);
  const c = makeCity(0, 10);
  cityCommands.length = 0;
  arriveRural(c, { civ: 2, kind: "migrant" });
  arriveRural(c);
  arriveRural(c, { civ: 3, kind: "refugee" });
  assert.equal(_pendingCountForTests(), 1, "all three batch into one city entry");
  assert.equal(flushArrivalPlacements(), 1);
  assert.equal(cityCommands.length, 2, "the migrant and the returnee are placed at once; the refugee waits for the pop-up");
  CONFIG.arrivalAskMigrants = true; CONFIG.arrivalAskReturnees = true;
  const d = makeCity(0, 11);
  cityCommands.length = 0;
  arriveRural(d, { civ: 2, kind: "migrant" });
  arriveRural(d);
  flushArrivalPlacements();
  assert.equal(cityCommands.length, 0, "with every kind asked nothing is placed before the player answers");
  CONFIG.arrivalAskRefugees = false; CONFIG.arrivalAskMigrants = false; CONFIG.arrivalAskReturnees = false;
  const e = makeCity(0, 12);
  cityCommands.length = 0;
  arriveRural(e, { civ: 3, kind: "refugee" });
  flushArrivalPlacements();
  assert.equal(cityCommands.length, 1, "with no kind asked Ask me places everything, as Automatic does");
  CONFIG.arrivalAskRefugees = true; CONFIG.arrivalAskMigrants = false; CONFIG.arrivalAskReturnees = false;
  _setSyncFlushForTests(true);
  console.log("arrival-placement ask by kind: ok");
}
