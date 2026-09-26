// eep-modtest161.js - can script damage (pillage) a chosen tile by another route than mod test 37's own-unit pillage?
// Save: the turn-106 promo save (run-promo144.sh with SCRIPT=eep-modtest161.js).
//
// R1  what Game.RandomEvents exposes (own + prototype keys), and every op enum key that is event/disaster-shaped
// R3  write the storm/flood/eruption percent chances to 100: do they read back, and do events fire over the turns?
// U   an INDEPENDENT unit created on one of the local player's farms: canStart/sendRequest PILLAGE from script
//     (two argument shapes); the farm's damaged flag at +3 s and +8 s
// U2  end 2 turns: does the independent's own AI pillage the farm or a neighbor? (independents are always hostile)
// R2  LAST (could crash): CREATE_ELEMENT with event-shaped Kinds and a RandomEvents type on the farm
// Every native call is logged BEFORE it is made, so a crash names its call.
const TAG = "[EmigTest]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { const v = fn(); return v === undefined ? fb : v; } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function later(ms) { return new Promise((r) => setTimeout(r, ms)); }
let local = -1;

const events = [];
safe(() => engine.on("RandomEventOccurred", (d) => { events.push(d); emit("EVENT RandomEventOccurred " + J(d)); }));

function consAt(x, y) {
  return safe(() => (MapConstructibles.getConstructibles(x, y) || []).map((cid) => {
    const c = Constructibles.getByComponentID(cid);
    const info = c ? GameInfo.Constructibles.lookup(c.type) : null;
    return { type: info ? info.ConstructibleType : "?", damaged: !!(c && c.damaged) };
  }), []);
}
function damagedNear(loc, r) {
  const out = [];
  for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
    const x = loc.x + dx, y = loc.y + dy;
    if (safe(() => GameplayMap.getPlotDistance(loc.x, loc.y, x, y), 99) > r) continue;
    const c = consAt(x, y).filter((k) => k.damaged);
    if (c.length) out.push({ x, y, c: c.map((k) => k.type) });
  }
  return out;
}
function worldDamaged() {
  let n = 0;
  for (const p of safe(() => Players.getAlive(), []) || []) for (const c of safe(() => p.Cities.getCities(), []) || [])
    for (const idx of safe(() => c.getPurchasedPlots(), []) || []) {
      const loc = safe(() => GameplayMap.getLocationFromIndex(idx), null);
      if (loc && consAt(loc.x, loc.y).some((k) => k.damaged)) n++;
    }
  return n;
}
function unitsAt(x, y) {
  return safe(() => (MapUnits.getUnits(x, y) || []).map((id) => { const u = Units.get(id); return u ? { id: u.id, owner: u.owner, type: safe(() => GameInfo.Units.lookup(u.type).UnitType, "?"), hp: safe(() => u.Health?.damage, null) } : null; }).filter(Boolean), []);
}
function findUnit(pid, typeName) {
  const p = Players.get(pid);
  return safe(() => (p.Units.getUnits() || []).find((u) => safe(() => GameInfo.Units.lookup(u.type).UnitType) === typeName), null);
}

let endTurnTimer = null, blockedTries = 0, usedAutoplay = 0, phase = "setup", turnResolve = null, turnAtSend = -1;
function blockerName() {
  return safe(() => {
    const id = Game.Notifications.findEndTurnBlocking(local, Game.Notifications.getEndTurnBlockingType(local));
    const n = id && Game.Notifications.find(id);
    return n ? Game.Notifications.getTypeName(n.Type) : "none";
  }, "?");
}
function clearBlocker() {
  // mod test 60: the recurring ASSIGN_NEW_RESOURCES blocker passes with dismiss + CONSIDER_ASSIGN_RESOURCE
  safe(() => { for (const id of Game.Notifications.getIdsForPlayer(local) || []) { const n = Game.Notifications.find(id); if (n && /ASSIGN_NEW_RESOURCES/.test(Game.Notifications.getTypeName(n.Type))) Game.Notifications.dismiss(id); } });
  safe(() => Game.PlayerOperations.sendRequest(local, "CONSIDER_ASSIGN_RESOURCE", {}));
  const d = Array.from(document.querySelectorAll("screen-dialog-box")).pop();
  if (d) { const b = Array.from(d.querySelectorAll("fxs-button")); if (b.length) safe(() => b[b.length - 1].dispatchEvent(new CustomEvent("action-activate", { bubbles: true }))); }
}
function endTurn() {
  try {
    const me = Players.get(local);
    if (!me.isTurnActive || GameContext.hasSentTurnComplete()) return;
    clearBlocker();
    const b = String(Game.Notifications.getEndTurnBlockingType(local));
    if (b !== String(EndTurnBlockingTypes.NONE)) {
      blockedTries++;
      if (blockedTries === 1) emit("ENDTURN blocked by " + blockerName());
      if (blockedTries >= 6 && typeof Autoplay !== "undefined") {
        usedAutoplay++;
        emit("ENDTURN still blocked by " + blockerName() + ": ONE AUTOPLAY TURN (the AI plays the local civ)");
        safe(() => { Autoplay.setTurns(1); Autoplay.setReturnAsPlayer(local); Autoplay.setObserveAsPlayer(local); Autoplay.setActive(true); });
        blockedTries = 0; endTurnTimer = setTimeout(endTurn, 40000); return;
      }
      endTurnTimer = setTimeout(endTurn, 4000); return;
    }
    safe(() => UI.Player.deselectAllUnits()); GameContext.sendTurnComplete();
  } catch (e) { emit("ENDTURN threw " + e); }
  endTurnTimer = setTimeout(() => { if (safe(() => Players.get(local).isTurnActive, false) && !GameContext.hasSentTurnComplete()) endTurn(); }, 12000);
}
function nextTurn() {
  return new Promise((res) => {
    turnAtSend = safe(() => Game.turn, -1); turnResolve = res; blockedTries = 0; phase = "turn";
    endTurn();
    setTimeout(() => { if (turnResolve === res) { turnResolve = null; emit("TURN never advanced"); res(false); } }, 300000);
  });
}
engine.on("PlayerTurnActivated", (d) => {
  const who = d && (d.player ?? d.Player);
  if (who !== GameContext.localPlayerID || phase !== "turn") return;
  if (!(safe(() => Game.turn, -1) > turnAtSend)) return;
  if (endTurnTimer) { clearTimeout(endTurnTimer); endTurnTimer = null; }
  phase = "work";
  const res = turnResolve; turnResolve = null;
  setTimeout(() => { if (res) res(true); }, 8000);
});

function pickFarm() {
  const me = Players.get(local);
  for (const c of safe(() => me.Cities.getCities(), []) || []) {
    for (const idx of safe(() => c.getPurchasedPlots(), []) || []) {
      const loc = GameplayMap.getLocationFromIndex(idx);
      if (safe(() => GameplayMap.getPlotDistance(loc.x, loc.y, c.location.x, c.location.y), 0) < 2) continue;
      const cs = consAt(loc.x, loc.y);
      if (cs.length === 1 && cs[0].type === "IMPROVEMENT_FARM" && !cs[0].damaged && unitsAt(loc.x, loc.y).length === 0) {
        return { loc, idx, city: safe(() => Locale.compose(c.name), "?") };
      }
    }
  }
  return null;
}

async function run() {
  local = safe(() => GameContext.localPlayerID, -1);
  emit("start turn=" + safe(() => Game.turn) + " local=" + local + " worldDamaged=" + worldDamaged());

  // R1
  const RE = safe(() => Game.RandomEvents, null);
  emit("R1 Game.RandomEvents typeof=" + typeof RE + " own=" + J(safe(() => Object.getOwnPropertyNames(RE), [])) +
    " proto=" + J(safe(() => Object.getOwnPropertyNames(Object.getPrototypeOf(RE)), [])));
  emit("R1 values " + J(safe(() => { const o = {}; for (const k of Object.getOwnPropertyNames(RE)) o[k] = typeof RE[k] === "function" ? "fn" : RE[k]; for (const k of Object.getOwnPropertyNames(Object.getPrototypeOf(RE))) o["proto." + k] = typeof RE[k] === "function" ? "fn" : safe(() => RE[k]); return o; }, null)));
  const shaped = /RANDOM|EVENT|DISASTER|STORM|FLOOD|ERUPT|VOLCAN|DAMAGE|PILLAGE|CHEAT|DEBUG|TUNER/;
  for (const en of ["PlayerOperationTypes", "CityOperationTypes", "CityCommandTypes", "UnitOperationTypes", "UnitCommandTypes", "PlayerCommandTypes"]) {
    emit("R1 " + en + " shaped=" + J(safe(() => Object.keys(globalThis[en]).filter((k) => shaped.test(k)), "absent")));
  }
  emit("R1 Game keys shaped=" + J(safe(() => Object.getOwnPropertyNames(Game).filter((k) => /Random|Event|Disaster|Climate|Map/i.test(k)), [])));
  emit("R1 disaster setup " + J(safe(() => { const g = Configuration.getGame(); return { disasters: safe(() => g.getValue("DisasterIntensity")), rand: safe(() => g.getValue("RandomEvents")) }; }, null)));

  // R3
  emit("R3 writing chances to 100");
  for (const k of ["stormPercentChance", "floodPercentChance", "eruptionPercentChance"]) {
    const before = safe(() => RE[k]);
    safe(() => { RE[k] = 100; });
    emit("R3 " + k + " before=" + before + " after=" + safe(() => RE[k]));
  }

  // U
  const farm = pickFarm();
  if (!farm) { emit("U no clean outlying farm found"); } else {
    const { loc } = farm;
    emit("U target farm " + J(farm) + " cons=" + J(consAt(loc.x, loc.y)));
    const indep = safe(() => (Players.getAlive() || []).filter((p) => p.isIndependent === true || (p.isMajor === false && p.isMinor === false)).map((p) => p.id), []);
    emit("U independents " + J(indep));
    let unit = null, owner = -1;
    for (const pid of indep.slice(0, 3)) {
      for (const typeName of ["UNIT_KNIGHT", "UNIT_MAN_AT_ARMS"]) {
        emit("U CREATE_ELEMENT UNIT " + typeName + " owner=" + pid);
        const r = safe(() => Game.PlayerOperations.sendRequest(local, "CREATE_ELEMENT", { Kind: "UNIT", Type: typeName, Location: loc, Owner: pid, IndependentIndex: -1 }));
        await later(4000);
        const here = unitsAt(loc.x, loc.y).filter((u) => u.owner === pid);
        emit("U create -> " + J(r) + " unitsHere=" + J(unitsAt(loc.x, loc.y)));
        if (here.length) { unit = Units.get(here[0].id); owner = pid; break; }
      }
      if (unit) break;
    }
    if (!unit) emit("U no independent unit could be placed on the farm");
    else {
      const uid = unit.id;
      emit("U unit " + J(uid) + " owner=" + owner + " atWarWithLocal=" + safe(() => Players.get(owner).Diplomacy?.isAtWarWith(local)));
      for (const [label, args] of [["{}", {}], ["{X,Y}", { X: loc.x, Y: loc.y }]]) {
        emit("U canStart PILLAGE " + label);
        const c = safe(() => Game.UnitOperations.canStart(uid, UnitOperationTypes.PILLAGE, args, false));
        emit("U canStart PILLAGE " + label + " = " + J(c));
        emit("U sendRequest PILLAGE " + label);
        const s = safe(() => Game.UnitOperations.sendRequest(uid, UnitOperationTypes.PILLAGE, args));
        await later(3000);
        const m = consAt(loc.x, loc.y);
        await later(5000);
        emit("U sendRequest PILLAGE " + label + " -> " + J(s) + " +3s=" + J(m) + " +8s=" + J(consAt(loc.x, loc.y)));
      }
      // U2: let the independent's AI act
      for (let t = 1; t <= 2; t++) {
        const ok = await nextTurn();
        const u = safe(() => Units.get(uid), null);
        emit("U2 turn=" + safe(() => Game.turn) + " advanced=" + ok + " autoplay=" + usedAutoplay + " unit=" +
          J(u ? { loc: u.location, dmg: safe(() => u.Health?.damage) } : "gone") + " farm=" + J(consAt(loc.x, loc.y)) +
          " damagedWithin3=" + J(damagedNear(loc, 3)) + " worldDamaged=" + worldDamaged() + " events=" + events.length);
        if (!ok) break;
      }
      // cleanup
      const u = safe(() => Units.get(uid), null);
      if (u) {
        emit("U DESTROY_ELEMENT UNIT");
        const r = safe(() => Game.PlayerOperations.sendRequest(local, "DESTROY_ELEMENT", { Kind: "UNIT", Owner: uid.owner, LocalID: uid.id }));
        await later(4000);
        emit("U destroy -> " + J(r) + " unitStill=" + !!safe(() => Units.get(uid), null));
      }
    }
    emit("R3 chances now " + J({ storm: safe(() => RE.stormPercentChance), flood: safe(() => RE.floodPercentChance), eruption: safe(() => RE.eruptionPercentChance) }) + " eventsSeen=" + events.length);

    // R2 (last: could crash)
    const typeIdx = safe(() => GameInfo.RandomEvents.lookup("RANDOM_EVENT_THUNDERSTORM_SUPERCELL").$index, -1);
    const typeHash = safe(() => GameInfo.Types.lookup("RANDOM_EVENT_THUNDERSTORM_SUPERCELL").Hash, -1);
    for (const kind of ["RANDOM_EVENT", "EVENT", "DISASTER", "PLOT_EFFECT"]) {
      for (const [tl, type] of [["name", "RANDOM_EVENT_THUNDERSTORM_SUPERCELL"], ["index", typeIdx], ["hash", typeHash]]) {
        emit("R2 CREATE_ELEMENT Kind=" + kind + " Type(" + tl + ")=" + type);
        const r = safe(() => Game.PlayerOperations.sendRequest(local, "CREATE_ELEMENT", { Kind: kind, Type: type, Location: loc, Owner: local }));
        await later(2500);
        emit("R2 -> " + J(r) + " farm=" + J(consAt(loc.x, loc.y)) + " events=" + events.length);
      }
    }
    emit("R2 end damagedWithin3=" + J(damagedNear(loc, 3)) + " worldDamaged=" + worldDamaged());
  }
  emit("DONE modtest161 finished");
}

emit("modtest161 attached");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() {
  const st = loadStateName();
  if (st === "GameStarted") {
    setTimeout(() => { run().catch((e) => { emit("run threw " + e + " " + (e && e.stack)); emit("DONE modtest161 finished"); }); }, 10000);
    return;
  }
  beginTries++;
  if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady());
  if (beginTries < 90) setTimeout(beginPoll, 2000); else { emit("LOAD gave up"); emit("DONE modtest161 finished"); }
}
setTimeout(beginPoll, 3000);
