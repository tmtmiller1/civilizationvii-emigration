// eep-modtest-mp3.js - Multiplayer plan (docs/player-experience-risks.md 8.9h) PROBE 3, single player.
//
// HYPOTHESIS (Carrier 3, the floor, plan 8.9d): a per-turn yield cost can be carried by a placed
// never-buildable constructible instead of Players.grantYield, so every client computes the same number
// from the database and no script write has to replicate. Carrier 1 is closed (mod test 119) and Carrier 2
// is unlikely, so this is what multiplayer would be built on if the element operations replicate.
//
// The building form is tested rather than the improvement form because an improvement takes a plot the
// settlement could otherwise use (plan 8.9d). Data: eep-building-carrier.xml, Population 0, YIELD_GOLD -2.
//
// CHEAPEST DISPROOF, in order. Each step alone can kill the carrier:
//   A. Does the row even load with a negative yield? Read it out of the live database.
//   B. Can CREATE_ELEMENT place it in a city centre, in the player's own city and in an AI city?
//   C. Does the cost reach the treasury, and does Population 0 leave urban population alone?
//   D. Does it survive AI turns (the 2.4 broker crash), and can DESTROY_ELEMENT take it away again?
//
// VERDICTS, fixed before the run:
//   ROW=NO                          -> a negative constructible yield cannot even be expressed; carrier dead.
//   PLACED=NO                       -> the carrier cannot be created at runtime; carrier dead.
//   CHARGED=NO                      -> it places but costs nothing; it is decoration, not a carrier.
//   POP=CHANGED                     -> it drags urban population with it; it would rewrite the city, not charge it.
//   SURVIVED=NO                     -> crash or vanish across AI turns; carrier dead.
//   ROW=YES PLACED=YES CHARGED=YES POP=SAME SURVIVED=YES -> the floor is real and multiplayer rests on probe 5.

const TAG = "[EmigTest]";
const TYPE = "BUILDING_EMIG_TEST_BURDEN";
const TURNS = 6;

let beginTries = 0;
let local = 0;
let done = false;
let blockedTries = 0;
const results = { row: "?", placedLocal: "?", placedAI: "?", charged: "?", pop: "?", survived: "?", destroyed: "?" };

/** @param {string} m Message. */
function emit(m) {
  try { console.error(TAG + " " + m); } catch (_) { /* ignore */ }
}

/** @param {()=>*} fn Body. @param {*} fb Fallback. @returns {*} Result or fallback. */
function safe(fn, fb) {
  try { return fn(); } catch (e) { return fb; }
}

/** @param {*} v Value. @returns {string} Compact JSON. */
function J(v) {
  return safe(() => JSON.stringify(v), "?");
}

/** @param {number} ms Delay. @returns {Promise<void>} Resolves after ms. */
function later(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** @param {*} c City. @returns {*} A snapshot of the fields this probe judges. */
function snap(c) {
  if (!c) return null;
  const s = {
    name: safe(() => Locale.compose(c.name), "?"), owner: c.owner,
    pop: c.population, urban: c.urbanPopulation, rural: c.ruralPopulation,
    gold: safe(() => Math.round(c.Yields.getNetYield(YieldTypes.YIELD_GOLD) * 100) / 100, null)
  };
  s.centre = typesAt(c.location);
  return s;
}

/** @param {*} loc Location. @returns {string[]} Constructible type names on the plot. */
function typesAt(loc) {
  return safe(() => (MapConstructibles.getConstructibles(loc.x, loc.y) || []).map((id) => {
    const inst = Constructibles.getByComponentID(id);
    return safe(() => GameInfo.Constructibles.lookup(inst.type).ConstructibleType, "?");
  }), []);
}

/** @param {number} pid Player id. @returns {number|null} The treasury balance. */
function gold(pid) {
  return safe(() => Math.round(Players.get(pid).Treasury.goldBalance * 100) / 100, null);
}

/** A: is the row in the live database, with its negative yield? */
function stepA() {
  const row = safe(() => GameInfo.Constructibles.lookup(TYPE), null);
  const yields = [];
  safe(() => {
    for (const y of GameInfo.Constructible_YieldChanges || []) {
      if (y.ConstructibleType === TYPE) yields.push(y.YieldType + "=" + y.YieldChange);
    }
  });
  emit("A1 row=" + (row ? J({ index: row.$index, cls: row.ConstructibleClass, pop: row.Population, cost: row.Cost }) : "null"));
  emit("A2 yieldChanges=" + J(yields));
  results.row = row && yields.length ? "YES" : "NO";
}

/** @param {*} city City. @param {string} label Log label. @returns {Promise<boolean>} True when placed. */
async function place(city, label) {
  const before = snap(city);
  const beforeGold = gold(city.owner);
  emit(label + " before=" + J(before) + " treasury=" + beforeGold);
  const index = safe(() => GameInfo.Constructibles.lookup(TYPE).$index, null);
  for (const [name, type] of [["string", TYPE], ["index", index]]) {
    const r = safe(() => Game.PlayerOperations.sendRequest(local, "CREATE_ELEMENT", {
      Kind: "CONSTRUCTIBLE", Type: type, Location: city.location, Parent: city.id, Owner: city.owner
    }), "ERR");
    await later(5000);
    const now = snap(city);
    const there = (now.centre || []).indexOf(TYPE) >= 0;
    emit(label + " CREATE " + name + " -> " + J(r) + " placed=" + there + " after=" + J(now) + " treasury=" + gold(city.owner));
    if (there) return true;
  }
  return false;
}

async function run() {
  local = GameContext.localPlayerID;
  emit("modtest-mp3 start (probe 3: a placed constructible as a yield carrier), local=" + local);
  stepA();
  if (results.row === "NO") {
    emit("A VERDICT row missing; the carrier cannot be expressed");
    finish();
    return;
  }

  const me = safe(() => Players.get(local), null);
  const mine = safe(() => me.Cities.getCities(), []) || [];
  const capital = mine.find((c) => safe(() => c.isCapital, false)) || mine[0];
  let ai = null;
  for (const p of safe(() => Players.getAlive(), []) || []) {
    if (p.id === local || !safe(() => p.isMajor, false)) continue;
    const cs = safe(() => p.Cities.getCities(), []) || [];
    if (cs.length) { ai = cs[0]; break; }
  }
  emit("B0 capital=" + J(snap(capital)) + " aiCity=" + J(snap(ai)));

  const popBefore = capital ? capital.urbanPopulation : null;
  const goldBefore = gold(local);
  results.placedLocal = capital && await place(capital, "B1 local") ? "YES" : "NO";
  results.placedAI = ai && await place(ai, "B2 ai") ? "YES" : "NO";
  const popAfter = capital ? capital.urbanPopulation : null;
  results.pop = popBefore === popAfter ? "SAME" : "CHANGED";
  emit("C1 urbanPopulation before=" + popBefore + " after=" + popAfter + " -> " + results.pop);
  emit("C2 treasury before=" + goldBefore + " after=" + gold(local));

  trackGold.push({ turn: safe(() => Game.turn, 0), gold: gold(local), cityGold: capital ? snap(capital).gold : null });
  endTurn();
}

/** @type {{turn:number, gold:number|null, cityGold:number|null}[]} Treasury by turn, to see the charge land. */
const trackGold = [];
let turnsRun = 0;
let endTurnTimer = null;

function onTurnStart() {
  turnsRun++;
  const capital = safe(() => {
    const cs = Players.get(local).Cities.getCities();
    return cs.find((c) => c.isCapital) || cs[0];
  }, null);
  const s = snap(capital);
  trackGold.push({ turn: safe(() => Game.turn, 0), gold: gold(local), cityGold: s ? s.gold : null });
  emit("D" + turnsRun + " turn=" + safe(() => Game.turn, 0) + " treasury=" + gold(local) + " cityGold=" + (s ? s.gold : null) +
    " centre=" + J(s ? s.centre : []) + " urban=" + (s ? s.urban : null));
  if (turnsRun >= TURNS) {
    finishAfterTurns(capital);
    return;
  }
  endTurnTimer = setTimeout(endTurn, 2000);
}

/** @param {*} capital The city the carrier was placed in. */
function finishAfterTurns(capital) {
  const still = capital ? (snap(capital).centre || []).indexOf(TYPE) >= 0 : false;
  results.survived = still ? "YES" : "NO";
  // Did the per-turn cost actually show up? Compare the city's gold yield with the run's first reading.
  const first = trackGold[0] || {};
  const last = trackGold[trackGold.length - 1] || {};
  emit("E1 goldTrack=" + J(trackGold));
  emit("E2 cityGold first=" + first.cityGold + " last=" + last.cityGold);
  // Remove it again, and confirm the plot and the yield come back.
  const id = safe(() => {
    for (const cid of MapConstructibles.getConstructibles(capital.location.x, capital.location.y) || []) {
      const inst = Constructibles.getByComponentID(cid);
      if (safe(() => GameInfo.Constructibles.lookup(inst.type).ConstructibleType, "") === TYPE) return cid;
    }
    return null;
  }, null);
  if (id) {
    safe(() => Game.PlayerOperations.sendRequest(local, "DESTROY_ELEMENT", { Kind: "CONSTRUCTIBLE", Owner: id.owner, LocalID: id.id }));
    setTimeout(() => {
      const after = snap(capital);
      results.destroyed = (after.centre || []).indexOf(TYPE) >= 0 ? "NO" : "YES";
      emit("E3 after destroy centre=" + J(after.centre) + " cityGold=" + after.gold + " urban=" + after.urban);
      finish();
    }, 6000);
  } else {
    finish();
  }
}

function finish() {
  if (done) return;
  done = true;
  if (endTurnTimer) safe(() => clearTimeout(endTurnTimer));
  // CHARGED: the city's gold yield fell when the carrier landed, or the treasury trend did.
  emit("VERDICT ROW=" + results.row + " PLACED_LOCAL=" + results.placedLocal + " PLACED_AI=" + results.placedAI +
    " POP=" + results.pop + " SURVIVED=" + results.survived + " DESTROYED=" + results.destroyed);
  emit("DONE modtest3 finished");
}

function endTurn() {
  if (done) return;
  try {
    const me = Players.get(local);
    if (!me.isTurnActive || GameContext.hasSentTurnComplete()) {
      endTurnTimer = setTimeout(endTurn, 3000);
      return;
    }
    const b = String(Game.Notifications.getEndTurnBlockingType(local));
    if (b !== String(EndTurnBlockingTypes.NONE)) {
      blockedTries++;
      if (blockedTries >= 3 && typeof Autoplay !== "undefined") {
        safe(() => {
          Autoplay.setTurns(1); Autoplay.setReturnAsPlayer(local);
          Autoplay.setObserveAsPlayer(local); Autoplay.setActive(true);
        });
        blockedTries = 0;
        endTurnTimer = setTimeout(endTurn, 30000);
        return;
      }
      endTurnTimer = setTimeout(endTurn, 4000);
      return;
    }
    safe(() => UI.Player.deselectAllUnits());
    GameContext.sendTurnComplete();
  } catch (e) {
    emit("ENDTURN threw " + e);
  }
  endTurnTimer = setTimeout(endTurn, 20000);
}

/** @returns {string} The loading state's name. */
function loadStateName() {
  return safe(() => {
    const s = UI.getGameLoadingState();
    for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k;
    return String(s);
  }, "?");
}

function beginPoll() {
  const st = loadStateName();
  if (st === "GameStarted") {
    setTimeout(() => {
      safe(() => engine.on("PlayerTurnActivated", (/** @type {*} */ d) => {
        const who = d && (d.player ?? d.Player);
        if (who === local && !done) onTurnStart();
      }));
      run().catch((e) => { emit("run threw " + e + " " + (e && e.stack)); finish(); });
    }, 10000);
    return;
  }
  beginTries++;
  if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady());
  if (beginTries < 90) setTimeout(beginPoll, 2000);
  else { emit("LOAD gave up"); emit("DONE modtest3 finished"); }
}

emit("modtest-mp3 attached");
setTimeout(beginPoll, 3000);
