// scripts/tile-transfer-stress.mjs
//
// Does making population moves REAL (a departure abandons a tile and its yields, an arrival settles a
// new one) open a runaway the old counter-only model did not have? The old model carried two accidental
// brakes: a source got RICHER per citizen as people left (yields stayed, population fell) and a
// destination got POORER per citizen as they arrived. With yields moving with people those brakes are
// gone and only the explicit ones remain (pressure bar + cooldown, per-city loss/gain caps, the
// congestion headwind, the anti-snowball inflow penalty, distance).
//
// This drives the REAL engine pass (runPass via tests/loader.mjs) over a synthetic 3-civ, 12-city world
// whose yields are computed from tiles and buildings, with the engine's DESTROY_ELEMENT / EXPAND stubbed
// to move tiles the way the game does, and compares the old model ("counter") with the shipped one
// ("tiles") over 200 turns, then a disaster crisis on one city (the urban leg). Read-only.
//
// Run: node --loader ./tests/loader.mjs ./scripts/tile-transfer-stress.mjs

import { CONFIG, CONFIG_DEFAULTS } from "/emigration/ui/emigration-config.js";
import { runPass } from "/emigration/ui/emigration-engine.js";
import { addDistress, disasterKey } from "/emigration/ui/emigration-disasters.js";
import { _setSyncFlushForTests } from "/emigration/ui/emigration-arrival-placement.js";

// ── engine globals ────────────────────────────────────────────────────────
globalThis.YieldTypes = { YIELD_FOOD: "YIELD_FOOD", YIELD_PRODUCTION: "YIELD_PRODUCTION", YIELD_GOLD: "YIELD_GOLD",
  YIELD_SCIENCE: "YIELD_SCIENCE", YIELD_CULTURE: "YIELD_CULTURE", YIELD_HAPPINESS: "YIELD_HAPPINESS" };
globalThis.Culture = { isTraditionActive: () => false };
globalThis.Database = { makeHash: (t) => t };
globalThis.GameContext = { localPlayerID: 1 };
globalThis.ComponentID = { toBitfield: (cid) => cid.owner + ":" + cid.id };
globalThis.CityCommandTypes = { EXPAND: "EXPAND" };
globalThis.PlayerOperationTypes = { ASSIGN_WORKER: "ASSIGN_WORKER" };
globalThis.ConstructibleClasses = { IMPROVEMENT: 1 };
globalThis.GameInfo = {
  Leaders: { lookup: () => null }, Civilizations: { lookup: () => null }, Ages: { lookup: () => null },
  GameSpeeds: { lookup: () => null }, HappinessStages: [], Governments: { lookup: () => null },
  Constructibles: { lookup: (t) => (typeof t === "string" ? { ConstructibleType: t, ConstructibleClass: t.startsWith("BUILDING_") ? "BUILDING" : "IMPROVEMENT", Cost: t === "BUILDING_WALLS" ? 60 : 55, Defense: t === "BUILDING_WALLS" ? 5 : 0 } : null) }
};
function installConfigStore() {
  const kv = {};
  globalThis.Configuration = { getGame: () => ({ getValue: (k) => kv[k], gameSpeedType: 0 }), editGame: () => ({ setValue: (k, v) => (kv[k] = v) }) };
}
const gold = {};
globalThis.Players = null;

// ── the tile world ────────────────────────────────────────────────────────
const TILE = { YIELD_FOOD: 2.2, YIELD_PRODUCTION: 1.4, YIELD_GOLD: 1.2, YIELD_SCIENCE: 0, YIELD_CULTURE: 0 };
const BLDG = { YIELD_FOOD: 0, YIELD_PRODUCTION: 1.0, YIELD_GOLD: 0.5, YIELD_SCIENCE: 1.5, YIELD_CULTURE: 1.2 };
let elemSeq = 1;
const CITIES = [];
function plotLoc(city, k) { return { x: city.location.x + 1 + (k % 4), y: city.location.y + Math.floor(k / 4) }; }
function makeCity(owner, localId, o) {
  const city = {
    owner, localId, id: { owner, id: localId, type: 1 }, name: "C" + owner + "_" + localId,
    isTown: false, isBeingRazed: false, isInfected: false, location: { x: o.x, y: o.y },
    econ: o.econ, happy: o.happy, pendingPopulation: 0,
    imps: [], blds: [],
    get population() { return this.imps.length + this.blds.length + this.pendingPopulation; },
    get ruralPopulation() { return this.imps.length + this.pendingPopulation; },
    get urbanPopulation() { return this.blds.length; },
    addRuralPopulation(d) {
      // +1: a pending point the city (AI) or the mod's placement (local) turns into a tile; -1: the counter
      // path (old model): the point vanishes, yields stay.
      if (d > 0) this.pendingPopulation += d;
      else if (this.imps.length && !this.tiles) this.imps.pop();
      else this.pendingPopulation += d;
    },
    getPurchasedPlots() { return [0, ...this.imps.map((e, k) => 1 + k), ...this.blds.map((e, k) => 100 + k)].map((k) => this.localId * 1000 + owner * 100000 + k); },
    Yields: { getNetYield: (y) => yieldOf(city, y) },
    Happiness: { netHappinessPerTurn: o.happy, hasUnrest: false },
    Workers: { getNumWorkers: () => 0 },
    Growth: {}
  };
  for (let i = 0; i < o.rural; i++) city.imps.push({ owner, id: elemSeq++, type: "IMPROVEMENT_FARM" });
  for (let i = 0; i < o.urban; i++) city.blds.push({ owner, id: elemSeq++, type: i === 0 ? "BUILDING_WALLS" : "BUILDING_LIBRARY" });
  CITIES.push(city);
  return city;
}
function yieldOf(city, y) {
  if (y === "YIELD_HAPPINESS") return city.happy;
  const tiles = city.tilesMode ? city.imps.length : city.fixedImps;
  const blds = city.tilesMode ? city.blds.length : city.fixedBlds;
  return (TILE[y] * tiles + BLDG[y] * blds) * city.econ;
}
function cityOfPlot(idx) { return CITIES.find((c) => Math.floor(idx / 1000) === c.localId + c.owner * 100); }
function plotK(idx) { return idx % 1000; }
globalThis.GameplayMap = {
  getPlotDistance: (ax, ay, bx, by) => Math.abs(ax - bx) + Math.abs(ay - by),
  getLocationFromIndex: (idx) => { const c = cityOfPlot(idx); if (!c) return null; const k = plotK(idx); return k === 0 ? c.location : plotLoc(c, k); },
  getResourceType: () => -1, isWater: () => false,
  getTerrainType: () => "TERRAIN_FLAT"
};
globalThis.GameInfo.Terrains = { lookup: (t) => ({ TerrainType: t }) };
globalThis.Districts = { getAtLocation: (loc) => {
  for (const c of CITIES) {
    for (let k = 0; k < c.imps.length; k++) { const l = plotLoc(c, 1 + k); if (l.x === loc.x && l.y === loc.y) return { getConstructibleIdsOfClass: () => [c.imps[k]], getConstructibleIds: () => [c.imps[k]] }; }
    for (let k = 0; k < c.blds.length; k++) { const l = plotLoc(c, 100 + k); if (l.x === loc.x && l.y === loc.y) return { getConstructibleIdsOfClass: () => [], getConstructibleIds: () => [c.blds[k]] }; }
  }
  return null;
} };
globalThis.MapConstructibles = { getConstructibles: () => [] };
globalThis.Constructibles = { getByComponentID: (e) => ({ type: e.type, damaged: false }) };
const requests = { destroy: 0, expand: 0 };
globalThis.Game = {
  turn: 1,
  PlayerOperations: {
    sendRequest: (pid, op, args) => {
      if (op !== "DESTROY_ELEMENT") return true;
      for (const c of CITIES) {
        const i = c.imps.findIndex((e) => e.id === args.LocalID && e.owner === args.Owner);
        if (i >= 0) { c.imps.splice(i, 1); requests.destroy++; return true; }
        const b = c.blds.findIndex((e) => e.id === args.LocalID && e.owner === args.Owner);
        if (b >= 0) { c.blds.splice(b, 1); requests.destroy++; return true; }
      }
      return false;
    },
    canStart: () => ({ Success: false })
  },
  CityCommands: {
    canStart: (id) => { const c = CITIES.find((k) => k.owner === id.owner && k.localId === id.id); return { Success: !!c && c.pendingPopulation > 0, Plots: c && c.pendingPopulation > 0 ? [1] : [] }; },
    sendRequest: (id) => { const c = CITIES.find((k) => k.owner === id.owner && k.localId === id.id); if (c && c.pendingPopulation > 0) { c.pendingPopulation--; c.imps.push({ owner: c.owner, id: elemSeq++, type: "IMPROVEMENT_FARM" }); requests.expand++; } return true; }
  },
  Notifications: { getEndTurnBlockingType: () => 0 }
};
function settleAI() { // the AI places its own pending points on its turn (watched in-game)
  for (const c of CITIES) if (c.owner !== GameContext.localPlayerID) while (c.pendingPopulation > 0) { c.pendingPopulation--; c.imps.push({ owner: c.owner, id: elemSeq++, type: "IMPROVEMENT_FARM" }); }
}
function major(cities, pid) {
  return { id: pid, isAlive: true, isMajor: true, isMinor: false, isIndependent: false, Cities: { getCities: () => cities },
    Diplomacy: { hasMet: () => true, getWarCount: () => 0, isAtWarWith: () => false, isAtWar: () => false },
    Culture: { isTraditionActive: () => false, getActiveTraditions: () => [] },
    Treasury: { get goldBalance() { return gold[pid] || 500; } }, Units: { getUnits: () => [] }, Stats: { getNetYield: () => 0 } };
}
function installWorld(byPid) {
  globalThis.Players = { get: (pid) => byPid[pid] || null, getAlive: () => Object.values(byPid), grantYield: (pid, y, amt) => { gold[pid] = (gold[pid] || 500) + amt; },
    Districts: { get: () => ({ getDistrictMaxHealth: () => 100, getDistrictHealth: () => 100 }) } };
}

function buildWorld(tilesMode) {
  CITIES.length = 0;
  Object.keys(gold).forEach((k) => delete gold[k]);
  // A steep world so the voluntary track really flows: a rich, happy leader, an average middle, a poor,
  // unhappy laggard, close enough that distance does not mute the pull.
  const civs = [{ pid: 1, econ: 1.8, happy: 22, x: 0 }, { pid: 2, econ: 1.0, happy: 4, x: 8 }, { pid: 3, econ: 0.55, happy: -14, x: 16 }];
  const byPid = {};
  for (const civ of civs) {
    const cities = [];
    for (let i = 0; i < 4; i++) {
      const c = makeCity(civ.pid, i + 1, { x: civ.x + i * 2, y: (i % 2) * 2, econ: civ.econ, happy: civ.happy + (i === 3 ? -6 : 0), rural: 8, urban: 4 });
      c.tilesMode = tilesMode; c.fixedImps = c.imps.length; c.fixedBlds = c.blds.length; c.tiles = tilesMode;
      cities.push(c);
    }
    byPid[civ.pid] = major(cities, civ.pid);
  }
  installWorld(byPid);
  return byPid;
}

function pinConfig(tilesMode) {
  Object.assign(CONFIG, CONFIG_DEFAULTS);
  Object.assign(CONFIG, {
    requireMet: false, bordersEnabled: false, transitLagTurns: 0, transitHexPerTurn: 100, includeCityStates: false,
    civTuningEnabled: false, polityModelEnabled: false, disastersEnabled: true, gameSpeedTuningEnabled: false,
    departureRemovesTile: tilesMode, arrivalPlacement: tilesMode ? 1 : 0,
    quartersEnabled: false, returnEnabled: false, refugeePoolEnabled: false
  });
  _setSyncFlushForTests(true);
}

function stats(byPid) {
  const civPop = {}; let world = 0, maxCity = 0, minCity = 1e9, floor = 0;
  for (const c of CITIES) { civPop[c.owner] = (civPop[c.owner] || 0) + c.population; world += c.population; maxCity = Math.max(maxCity, c.population); minCity = Math.min(minCity, c.population); if (c.ruralPopulation <= CONFIG.minRuralToEmigrate) floor++; }
  const richShare = civPop[1] / world;
  return { world, richShare: +richShare.toFixed(3), civPop, maxCity, minCity, floor };
}

// Disaster shapes: "sustained" pours 40 distress a turn for 20 turns (a stress bound no real event
// reaches: the mod's own spikes decay at disasterDecay); "spikes" is two real-sized hits (a volcano-class
// spike of 12 at turn 20 and again at turn 30) left to decay on their own.
function strike(shape, crisisCity, t) {
  if (!crisisCity) return;
  if (shape === "sustained" && t >= 20 && t < 40) addDistress(disasterKey(crisisCity), 40);
  if (shape === "spikes" && (t === 20 || t === 30)) addDistress(disasterKey(crisisCity), 12);
}

// ── enclave formation under the same flows (EMIG_QUARTERS=1): composition + automatic recognition ──
const QUARTERS = !!process.env.EMIG_QUARTERS;
const { recordCompositionPass, compositionForCity } = await import("/emigration/ui/emigration-composition.js");
const { maybeQuarter, tickContestedQuarters } = await import("/emigration/ui/emigration-quarter.js");
const { allQuarterEntries } = await import("/emigration/ui/emigration-quarter-state.js");
const { collectCitySignals: signalsNow } = await import("/emigration/ui/emigration-cities.js");
let PEAK = { share: 0, pts: 0, turn: 0, city: "" };
function quarterStats() {
  let maxShare = 0, foothold = 0, established = 0;
  for (const c of CITIES) {
    const comp = compositionForCity(c);
    const lead = comp && comp.civs.find((x) => x.civ !== c.owner);
    const share = lead ? lead.share : 0;
    if (share > maxShare) maxShare = share;
    if (lead && share > PEAK.share) PEAK = { share, pts: lead.pts, turn: Game.turn, city: c.name };
    if (lead && lead.pts >= CONFIG.quarterMinStock && share >= 0.25) foothold++;
    if (lead && lead.pts >= CONFIG.quarterMinStock && share >= CONFIG.quarterEstablishedShare) established++;
  }
  return { enclaves: allQuarterEntries().length, maxShare: +maxShare.toFixed(2), foothold, established };
}

function runScenario(tilesMode, turns, crisisSel, shape) {
  pinConfig(tilesMode);
  if (QUARTERS) {
    Object.assign(CONFIG, { quartersEnabled: true, quarterRecognition: 2, quarterPlaceImprovement: false, integrationEnabled: true });
    // Threshold experiments: EMIG_QSHARE (established share), EMIG_INTEG (integration rate), EMIG_DWELL (dwell turns).
    if (process.env.EMIG_QSHARE) CONFIG.quarterEstablishedShare = Number(process.env.EMIG_QSHARE);
    if (process.env.EMIG_INTEG) CONFIG.integrationRate = Number(process.env.EMIG_INTEG);
    if (process.env.EMIG_DWELL) CONFIG.quarterDwellTurns = Number(process.env.EMIG_DWELL);
  }
  installConfigStore();
  const byPid = buildWorld(tilesMode);
  const crisisCity = crisisSel ? CITIES.find((c) => c.owner === crisisSel.owner && c.localId === crisisSel.localId) : null;
  let moves = 0, deaths = 0, urban = 0; const rows = []; const track = [];
  const snapAt = new Set([0, 10, 25, 50, 100, 150, turns]);
  rows.push({ turn: 0, ...stats(byPid), moves, deaths, ...(QUARTERS ? quarterStats() : {}) });
  for (let t = 1; t <= turns; t++) {
    Game.turn = t;
    strike(shape || "sustained", crisisCity, t);
    const recs = runPass();
    if (QUARTERS) { const sigs = signalsNow(); recordCompositionPass(sigs, recs); maybeQuarter(sigs, false); tickContestedQuarters(sigs); quarterStats(); }
    settleAI();
    for (const r of recs) { if (r.cause === "attrition") deaths++; else if (r.phase === "move" || r.phase === "depart") moves++; if (r.subject === "building" || r.subject === "specialist") urban++; }
    if (snapAt.has(t)) rows.push({ turn: t, ...stats(byPid), moves, deaths, ...(QUARTERS ? quarterStats() : {}) });
    if (crisisCity && t >= 19 && t <= 60 && t % 3 === 0) track.push(`${t}:${crisisCity.ruralPopulation}r+${crisisCity.urbanPopulation}u`);
  }
  const peak = { ...PEAK }; PEAK = { share: 0, pts: 0, turn: 0, city: "" };
  return { rows, moves, deaths, urban, gold: { ...gold }, requests: { ...requests }, track, peak };
}

function show(label, r) {
  console.log(`\n${label}`);
  console.log("  turn | world | rich share | civ pops         | max/min city | at floor | moves | deaths");
  for (const x of r.rows) console.log(`  ${String(x.turn).padStart(4)} | ${String(x.world).padStart(5)} | ${String(x.richShare).padStart(10)} | ${Object.values(x.civPop).join("/").padEnd(16)} | ${String(x.maxCity).padStart(3)}/${String(x.minCity).padEnd(3)}      | ${String(x.floor).padStart(8)} | ${String(x.moves).padStart(5)} | ${x.deaths}` + (QUARTERS ? ` | enclaves ${x.enclaves} maxForeignShare ${x.maxShare} foothold ${x.foothold} established ${x.established}` : ""));
  console.log(`  urban points taken: ${r.urban}; gold balances: ${JSON.stringify(r.gold)}`);
  if (QUARTERS) console.log(`  PEAK single-origin foreign share ${r.peak.share.toFixed(2)} (${r.peak.pts.toFixed(1)} pts) in ${r.peak.city} at turn ${r.peak.turn}; enclaves formed ${r.rows[r.rows.length - 1].enclaves}; CONFIG share ${CONFIG.quarterEstablishedShare} stock ${CONFIG.quarterMinStock} integration ${CONFIG.integrationRate} dwell ${CONFIG.quarterDwellTurns}`);
}

requests.destroy = 0; requests.expand = 0;
show("OLD model (counter only): peacetime, 200 turns", runScenario(false, 200, null));
requests.destroy = 0; requests.expand = 0;
show("NEW model (tiles move with people): peacetime, 200 turns", runScenario(true, 200, null));
function disaster(tilesMode, shape, label) {
  requests.destroy = 0; requests.expand = 0;
  const r = runScenario(tilesMode, 80, { owner: 2, localId: 1 }, shape);
  show(label, r);
  const t = CITIES.find((c) => c.owner === 2 && c.localId === 1);
  console.log(`  stricken city end state: pop ${t.population} rural ${t.ruralPopulation} urban ${t.urbanPopulation} (started 12: 8 rural + 4 urban)`);
  console.log(`  stricken city track (turn:rural+urban): ${r.track.join(" ")}`);
}
disaster(true, "spikes", "NEW model: two real-sized disaster spikes (12 at turns 20 and 30), 80 turns");
disaster(false, "spikes", "OLD model: the same two spikes");
disaster(true, "sustained", "NEW model: SUSTAINED disaster (40 distress every turn, turns 20-39), 80 turns");
disaster(false, "sustained", "OLD model: the same sustained disaster");

// ── diagnostic: why does (or doesn't) the voluntary track move? ──────────
if (process.env.EMIG_DEBUG) {
  const { collectCitySignals } = await import("/emigration/ui/emigration-cities.js");
  const { rankByProsperity } = await import("/emigration/ui/emigration-prosperity.js");
  const pull = await import("/emigration/ui/emigration-pull.js");
  pinConfig(true); installConfigStore(); buildWorld(true); Game.turn = 5;
  const sigs = collectCitySignals();
  const ranked = rankByProsperity(sigs);
  for (const s of ranked) console.log(`  ${s.city.name} owner=${s.owner} pop=${s.population} rural=${s.rural} food=${s.food.toFixed(1)} prod=${s.production.toFixed(1)} happy=${s.happiness} pros=${(s.pros ?? s.prosperity ?? NaN).toFixed?.(2)} keys=${Object.keys(s).filter((k) => /pros|score|pull/.test(k)).join(",")}`);
  const src = ranked[ranked.length - 1];
  const ownerPop = {}; for (const s of sigs) ownerPop[s.owner] = (ownerPop[s.owner] || 0) + s.population;
  const best = pull.bestDestination ? pull.bestDestination(src, ranked, ownerPop) : null;
  console.log("  worst city:", src.city.name, "cause:", pull.migrationCause ? pull.migrationCause(src) : "?", "best:", best && { dest: best.dest && best.dest.city.name, adjusted: best.adjusted });
  console.log("  bar:", CONFIG.emigrationBar, "cooldown:", CONFIG.cooldownTurns, "crossCiv:", CONFIG.crossCivEnabled, "requireMet:", CONFIG.requireMet, "poachBlock:", CONFIG.poachBlock, "distanceFactor:", CONFIG.distanceFactor);
}
