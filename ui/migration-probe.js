// migration-probe.js
//
// Original five behavioral questions (rural population) - SETTLED:
//   (1) removal - addRuralPopulation(-1) decrements. ✓
//   (2) cross-civ - works on another player's city, NOT owner-gated. ✓
//   (3) placement - added rural pop places cleanly. ✓
//   (4) urban/worker - only addRuralPopulation exists (no urban/worker write). ✓
//   (5) persistence - sticks across turns. ✓
//
// NEW write-surface questions (from Izica's cheat panel, corpus mod 3506929756,
// which uses these undocumented UI-VM gameplay writes). Testing whether they're
// reachable for OUR purposes, and crucially whether they work CROSS-CIV:
//   (6) CREATE_ELEMENT - Game.PlayerOperations.sendRequest(pid,"CREATE_ELEMENT",
//       {Kind:"UNIT",Type,Location,Owner}) - does it SPAWN a unit? (overturns
//       "the UI VM can't create units")
//   (7) cross-civ create - set Owner to a FOREIGN player; does it create for them?
//   (8) grantYield - Players.grantYield(pid, YIELD_GOLD, n) - does it write a yield?
//   (9) NEGATIVE grant - grantYield(..., -n) - can a yield be DEDUCTED (a cost)?
//   (10) cross-civ grant - grantYield on a FOREIGN player - does it affect them?
//
// All operations target the SELECTED city (else the local capital). Output goes
// to UI.log via GameFace's CSS-parse channel (mod console.log doesn't reach the
// log files): grep MIGPROBE in
//   ~/Library/Application Support/Civilization VII/Logs/UI.log

const LOG = "[MigProbe]";
const TAG = "MIGPROBE_";

/**
 * Emit a value to UI.log via an unparseable CSS declaration (chunked for length).
 * @param {string} val Encoded value.
 */
function emitCss(val) {
  const el = document.createElement("div");
  el.style.cssText = "border-top-color:" + val;
}

/**
 * Log to console + UI.log (chunked).
 * @param {string} msg Message.
 */
function log(msg) {
  try {
    console.log(LOG + " " + msg);
  } catch (_) {
    /* ignore */
  }
  try {
    const safe = String(msg).replace(/[^A-Za-z0-9]+/g, "_");
    const CH = 170;
    if (safe.length <= CH) {
      emitCss(TAG + safe);
      return;
    }
    for (let i = 0, p = 0; i < safe.length; i += CH, p++) emitCss(TAG + "c" + p + "_" + safe.slice(i, i + CH));
  } catch (_) {
    /* ignore */
  }
}

/**
 * All property/method names on an object incl. its prototype chain.
 * @param {*} obj Any object.
 * @returns {string[]} Sorted names.
 */
function methodsOf(obj) {
  const names = new Set();
  let o = obj;
  let d = 0;
  while (o && d < 5) {
    try {
      for (const n of Object.getOwnPropertyNames(o)) names.add(n);
    } catch (_) {
      /* ignore */
    }
    try {
      o = Object.getPrototypeOf(o);
    } catch (_) {
      break;
    }
    d++;
  }
  return Array.from(names).filter((n) => n !== "constructor" && !n.startsWith("__")).sort();
}

/**
 * Resolve a YieldTypes enum value, or undefined.
 * @param {string} key e.g. "YIELD_HAPPINESS".
 * @returns {*} The enum value.
 */
function yieldEnum(key) {
  try {
    return typeof YieldTypes !== "undefined" ? YieldTypes[key] : undefined;
  } catch (_) {
    return undefined;
  }
}

/**
 * The selected city object, or null.
 * @returns {*} City or null.
 */
function selectedCity() {
  try {
    const cid = UI?.Player?.getHeadSelectedCity?.();
    if (cid) return Cities.get(cid);
  } catch (_) {
    /* ignore */
  }
  return null;
}

/**
 * A player's capital (or first city), or null. Robust: tries the proven
 * Players.Cities.get(pid).getCapital() path first, then iterates getCities()
 * with for-of (NO reliance on .length - the collection is iterable but may not
 * expose a length property, which silently broke the first probe build).
 * @param {number} pid Player id.
 * @returns {*} City or null.
 */
function playerCapital(pid) {
  try {
    const cap = Players?.Cities?.get?.(pid)?.getCapital?.();
    if (cap) return cap;
  } catch (_) {
    /* ignore */
  }
  try {
    const list = Players.get(pid)?.Cities?.getCities?.();
    if (list) {
      for (const c of list) {
        if (c?.isCapital) return c;
      }
      for (const c of list) return c; // first city
    }
  } catch (_) {
    /* ignore */
  }
  return null;
}

/**
 * The local player's capital (or first city), or null.
 * @returns {*} City or null.
 */
function localCapital() {
  try {
    return playerCapital(GameContext.localPlayerID);
  } catch (_) {
    return null;
  }
}

/**
 * The city to act on: selected, else local capital.
 * @returns {*} City or null.
 */
function targetCity() {
  return selectedCity() || localCapital();
}

/**
 * Read one yield off a city defensively.
 * @param {*} city City.
 * @param {string} key Yield enum key.
 * @returns {*} The yield value.
 */
function cityYield(city, key) {
  try {
    return city?.Yields?.getYield?.(yieldEnum(key));
  } catch (_) {
    return "?";
  }
}

/**
 * Log a city's population breakdown + key yields + owner.
 * @param {*} city City.
 * @param {string} label Log label.
 */
function inspectCity(city, label) {
  if (!city) {
    log((label || "city") + " is null (select a city or have a capital)");
    return;
  }
  try {
    log(
      (label || "city") +
        " owner " +
        city.owner +
        " pop " +
        city.population +
        " urban " +
        city.urbanPopulation +
        " rural " +
        city.ruralPopulation +
        " worker " +
        city.workerPopulation +
        " happy " +
        cityYield(city, "YIELD_HAPPINESS") +
        " food " +
        cityYield(city, "YIELD_FOOD") +
        " prod " +
        cityYield(city, "YIELD_PRODUCTION")
    );
  } catch (e) {
    log("inspect threw " + e);
  }
}

/**
 * Reflect the City object (+ its sub-objects) to reveal the full population API
 * - answers "is there addUrban / removeRural / setPopulation / a Growth method".
 */
function dumpCity() {
  const c = targetCity();
  if (!c) {
    log("dumpCity no target city");
    return;
  }
  log("CITY methods " + methodsOf(c).join(" "));
  for (const sub of ["Growth", "Population", "Happiness", "Workers", "Yields"]) {
    try {
      if (c[sub]) log("CITY_" + sub + " methods " + methodsOf(c[sub]).join(" "));
    } catch (_) {
      /* ignore */
    }
  }
}

/**
 * Call a population mutator by name on the target city and log before/after.
 * @param {string} method e.g. "addRuralPopulation".
 * @param {number} amount Delta (negative tests removal).
 */
function tryPopMethod(method, amount) {
  const c = targetCity();
  if (!c) {
    log(method + " no target city");
    return;
  }
  if (typeof c[method] !== "function") {
    log(method + " NOT a function on city");
    return;
  }
  log("POPCALL " + method + " " + amount + " begin");
  inspectCity(c, "before");
  try {
    c[method](amount);
  } catch (e) {
    log(method + " THREW " + e);
    return;
  }
  setTimeout(() => {
    inspectCity(c, "after");
    log("POPCALL " + method + " done");
  }, 500);
}

/**
 * Cross-civ test: find the first city of another alive player and try
 * addRuralPopulation(+1) on it, logging before/after.
 */
function foreignTest() {
  const f = firstForeign(); // robust capital finder (getCapital / for-of)
  if (!f) {
    log("FOREIGN no other-player city found (meet a civ / capture intel first)");
    return;
  }
  const c = f.city;
  log("FOREIGN found city owner " + f.pid);
  inspectCity(c, "foreign before");
  if (typeof c.addRuralPopulation !== "function") {
    log("foreign city has no addRuralPopulation");
    return;
  }
  try {
    c.addRuralPopulation(1);
  } catch (e) {
    log("foreign addRuralPopulation THREW " + e);
    return;
  }
  setTimeout(() => {
    inspectCity(c, "foreign after");
    log("FOREIGN test done (did rural rise on a non-owned city?)");
  }, 500);
}

// ── NEW: write-surface probes (CREATE_ELEMENT + grantYield, local & cross-civ) ──

/**
 * A player's gold balance, defensively (to confirm grantYield landed).
 * @param {number} pid Player id.
 * @returns {*} Gold balance, or "?".
 */
function playerGold(pid) {
  try {
    const t = Players.get(pid)?.Treasury;
    if (t && typeof t.goldBalance === "number") return t.goldBalance;
    if (t && typeof t.getGoldBalance === "function") return t.getGoldBalance();
  } catch (_) {
    /* ignore */
  }
  return "?";
}

/**
 * A player's unit count, defensively (to confirm CREATE_ELEMENT spawned one).
 * @param {number} pid Player id.
 * @returns {*} Count, or "?".
 */
function unitCount(pid) {
  try {
    const u = Players.get(pid)?.Units?.getUnits?.();
    return u ? u.length : "?";
  } catch (_) {
    return "?";
  }
}

/**
 * The first met other-player's first city, or null.
 * @returns {{pid:number, city:*}|null}
 */
function firstForeign() {
  let me = -1;
  try {
    me = GameContext.localPlayerID;
  } catch (_) {
    /* ignore */
  }
  for (let pid = 0; pid < 64; pid++) {
    if (pid === me) continue;
    const cap = playerCapital(pid); // robust: getCapital() / for-of, no .length
    if (cap) return { pid, city: cap };
  }
  return null;
}

/**
 * grantYield test: grant `amount` of gold to player `pid`, logging gold
 * before/after. A negative amount tests whether yields can be DEDUCTED (cost).
 * @param {number} pid Player id.
 * @param {number} amount Gold delta (negative = deduction test).
 */
function testGrant(pid, amount) {
  if (typeof Players?.grantYield !== "function") {
    log("GRANT Players.grantYield is NOT a function");
    return;
  }
  log("GRANT gold " + amount + " -> player " + pid + " (gold before " + playerGold(pid) + ")");
  try {
    Players.grantYield(pid, yieldEnum("YIELD_GOLD"), amount);
  } catch (e) {
    log("GRANT THREW " + e);
    return;
  }
  setTimeout(() => {
    log("GRANT done - gold after " + playerGold(pid) + " (expected to " + (amount < 0 ? "DROP" : "rise") + ")");
  }, 500);
}

/**
 * CREATE_ELEMENT test: create a `type` unit owned by `ownerPid` at `location`,
 * logging that player's unit count before/after.
 * @param {number} ownerPid Owner player id.
 * @param {*} location Plot {x,y}.
 * @param {string} type Unit type, e.g. "UNIT_SETTLER".
 */
function testCreateUnit(ownerPid, location, type) {
  if (!location) {
    log("CREATE no location (need a city)");
    return;
  }
  if (!Game?.PlayerOperations?.sendRequest) {
    log("CREATE Game.PlayerOperations.sendRequest unavailable");
    return;
  }
  log("CREATE " + type + " owner " + ownerPid + " @ " + location.x + "," + location.y + " (units before " + unitCount(ownerPid) + ")");
  try {
    Game.PlayerOperations.sendRequest(ownerPid, "CREATE_ELEMENT", {
      IndependentIndex: -1,
      Kind: "UNIT",
      Location: location,
      Owner: ownerPid,
      Type: type
    });
  } catch (e) {
    log("CREATE THREW " + e);
    return;
  }
  setTimeout(() => {
    log("CREATE done - units after " + unitCount(ownerPid) + " (did a " + type + " appear?)");
  }, 600);
}

/** Create a settler at the LOCAL capital (proven cheat-panel call). */
function createLocal() {
  const c = localCapital();
  testCreateUnit(GameContext.localPlayerID, c?.location, "UNIT_SETTLER");
}

/** CROSS-CIV create: spawn a unit OWNED BY a foreign civ in its territory. */
function createForeign() {
  const f = firstForeign();
  if (!f) {
    log("CREATE foreign: no met other-player city found");
    return;
  }
  testCreateUnit(f.pid, f.city.location, "UNIT_SETTLER");
}

/** CROSS-CIV grant: grant gold to a foreign civ (does it affect them?). */
function grantForeign() {
  const f = firstForeign();
  if (!f) {
    log("GRANT foreign: no met other-player found");
    return;
  }
  testGrant(f.pid, 500);
}

// ── NEW: verify settlement-cap reading + migrant counting + foreign units ──

/**
 * Migrant detection (mirrors emigration-effects.isMigrant) for the probe.
 * @param {*} u Unit.
 * @returns {boolean} True if it looks like a migrant.
 */
function isMigrantProbe(u) {
  try {
    const h = typeof Database !== "undefined" && Database.makeHash ? Database.makeHash("UNIT_MIGRANT") : undefined;
    if (h != null && u?.type === h) return true;
    if (typeof u?.name === "string" && /migrant/i.test(u.name)) return true;
  } catch (_) {
    /* ignore */
  }
  return false;
}

/**
 * Log a player's settlement cap + unit/migrant counts + a sample unit's shape.
 * @param {number} pid Player id.
 * @param {string} label Log label.
 */
function dumpUnitsAndStats(pid, label) {
  try {
    const p = Players.get(pid);
    const st = p?.Stats;
    log(label + " p" + pid + " settlementCap=" + st?.settlementCap + " numSettlements=" + st?.numSettlements);
    const units = p?.Units?.getUnits?.();
    let total = 0;
    let migrants = 0;
    let sample = "(no units enumerated)";
    if (units) {
      for (const u of units) {
        total++;
        if (isMigrantProbe(u)) migrants++;
        if (total === 1 && u) sample = "sample type=" + u.type + " name=" + u.name;
      }
    }
    log(label + " p" + pid + " units=" + total + " migrants=" + migrants + " " + sample);
  } catch (e) {
    log(label + " dumpUnitsAndStats threw " + e);
  }
}

/** Verify the new signals: settlement cap, migrant counting, foreign enumeration. */
function verifyNew() {
  log("VERIFY settlement-cap + migrant counting");
  dumpUnitsAndStats(GameContext.localPlayerID, "LOCAL");
  const f = firstForeign();
  if (f) dumpUnitsAndStats(f.pid, "FOREIGN");
  else log("VERIFY no foreign player for the unit-enumeration test");
}

// ── NEW: 3 API confirmations for the algorithmic-improvements design ──────
// Settle the data dependencies before coding Algorithms B (specialist discount),
// C (per-civ congestion), and the per-civ tuning table:
//   (3-1) leader/civ identity - is player.leaderType / civilizationType a stable
//         key we can hash a tuning table on? Resolve its GameInfo string name.
//   (3-2) specialist semantics - does city.workerPopulation / Workers.getNumWorkers
//         equal the assigned-specialist count (vs total urban pop), and where does
//         the per-specialist HAPPINESS cost live in GameInfo?
//   (3-3) per-civ aggregate - can we cheaply sum population per owner in one pass
//         (for civPopulation in the congestion headwind)?

/**
 * Log a player's leader/civ type values + their resolved GameInfo string names.
 * @param {number} pid Player id.
 * @param {string} label Log label.
 */
function playerIdentity(pid, label) {
  try {
    const p = Players.get(pid);
    if (!p) {
      log(label + " p" + pid + " no player");
      return;
    }
    const lt = p.leaderType;
    const ct = p.civilizationType;
    let lName = "?";
    let cName = "?";
    try {
      lName = GameInfo?.Leaders?.lookup?.(lt)?.LeaderType ?? "?";
    } catch (_) {
      /* ignore */
    }
    try {
      cName = GameInfo?.Civilizations?.lookup?.(ct)?.CivilizationType ?? "?";
    } catch (_) {
      /* ignore */
    }
    log(
      label +
        " p" +
        pid +
        " leaderType=" +
        lt +
        " typeof=" +
        typeof lt +
        " name=" +
        lName +
        " civType=" +
        ct +
        " typeof=" +
        typeof ct +
        " name=" +
        cName
    );
  } catch (e) {
    log(label + " identity threw " + e);
  }
}

/** (3-1) Dump local + up to 4 other players' leader/civ identity. */
function probeIdentity() {
  log("API3-1 leader/civ identity (stable tuning-table key?)");
  let me = -1;
  try {
    me = GameContext.localPlayerID;
  } catch (_) {
    /* ignore */
  }
  playerIdentity(me, "LOCAL");
  let met = 0;
  for (let pid = 0; pid < 64 && met < 4; pid++) {
    if (pid === me) continue;
    if (playerCapital(pid)) {
      playerIdentity(pid, "OTHER");
      met++;
    }
  }
  if (!met) log("API3-1 no other players with cities resolved (meet a civ first)");
}

/**
 * Probe a set of candidate specialist-count getters on the city's Workers
 * component, logging which exist and what each returns (arg-less call).
 * @param {*} city City.
 */
function probeWorkerGetters(city) {
  const w = city?.Workers;
  const names = [
    "getNumWorkers",
    "getCityWorkerCap",
    "getNumWorkersAtLocation",
    "getWorkerCount",
    "getNumSpecialists",
    "getSpecialists",
    "getAllWorkers",
    "getWorkers"
  ];
  for (const n of names) {
    const fn = w?.[n];
    if (typeof fn !== "function") {
      log("API3-2 " + n + " = (not a function)");
      continue;
    }
    let out;
    try {
      out = JSON.stringify(fn.call(w));
    } catch (e) {
      log("API3-2 " + n + "() threw " + e);
      continue;
    }
    log("API3-2 " + n + "() = " + (out == null ? "undefined" : out));
  }
}

/** Scan GlobalParameters for per-specialist happiness/food/maintenance rules. */
function scanGlobalParams() {
  try {
    const gp = GameInfo?.GlobalParameters;
    if (!gp) {
      log("API3-2 no GameInfo.GlobalParameters");
      return;
    }
    let hits = 0;
    for (const row of gp) {
      const name = row?.Name || row?.ParameterName || row?.Type || "";
      if (/SPECIALIST|HAPPINESS|MAINTENANCE|WORKER/i.test(name)) {
        log("API3-2 GP " + name + "=" + (row.Value ?? row.IntValue ?? row.Default ?? "?"));
        if (++hits >= 16) break;
      }
    }
    if (!hits) log("API3-2 no SPECIALIST/HAPPINESS GlobalParameters matched");
  } catch (e) {
    log("API3-2 scanGlobalParams threw " + e);
  }
}

/** Surface GameInfo tables about specialists/workers/maintenance + their columns + GlobalParameters. */
function dumpSpecialistRules() {
  try {
    const re = /specialist|worker|maintenance/i;
    const keys = Object.keys(GameInfo || {}).filter((k) => re.test(k));
    log("API3-2 GameInfo tables (specialist|worker|maintenance): " + (keys.join(" ") || "(none)"));
    for (const k of keys.slice(0, 6)) {
      let cols = "";
      let n = 0;
      try {
        for (const row of GameInfo[k]) {
          if (n === 0 && row) cols = Object.keys(row).join(",");
          n++;
        }
      } catch (_) {
        /* ignore */
      }
      log("API3-2 " + k + " rows=" + n + " cols=" + cols);
    }
    scanGlobalParams();
  } catch (e) {
    log("API3-2 dumpSpecialistRules threw " + e);
  }
}

/** (3-2) Specialist semantics: Workers API surface, count getters, GameInfo rules. */
function probeSpecialists() {
  log("API3-2 specialist semantics (Workers API + counts + happiness rule)");
  const c = targetCity();
  if (!c) {
    log("API3-2 no target city (select a developed city - needs specialists to be meaningful)");
  } else {
    log(
      "API3-2 owner " +
        c.owner +
        " pop=" +
        c.population +
        " urban=" +
        c.urbanPopulation +
        " rural=" +
        c.ruralPopulation +
        " workerPopulation=" +
        c.workerPopulation +
        " happy=" +
        cityYield(c, "YIELD_HAPPINESS")
    );
    try {
      if (c.Workers) log("API3-2 Workers methods " + methodsOf(c.Workers).join(" "));
      else log("API3-2 city has NO Workers component");
    } catch (e) {
      log("API3-2 Workers methods dump threw " + e);
    }
    probeWorkerGetters(c);
  }
  dumpSpecialistRules();
}

/** (3-3) Sum cities + population per owner in one pass (cheap civPopulation?). */
function probeAggregate() {
  log("API3-3 per-civ population aggregate (one-pass civPopulation?)");
  let players = 0;
  for (let pid = 0; pid < 64; pid++) {
    let list = null;
    try {
      list = Players.get(pid)?.Cities?.getCities?.();
    } catch (_) {
      /* ignore */
    }
    if (!list) continue;
    let cities = 0;
    let pop = 0;
    for (const c of list) {
      cities++;
      pop += typeof c?.population === "number" ? c.population : 0;
    }
    if (cities > 0) {
      players++;
      log("API3-3 p" + pid + " cities=" + cities + " totalPop=" + pop);
    }
  }
  log("API3-3 players-with-cities=" + players);
}

/**
 * (3-2b) Whether `city.Yields.getYield` returns yields PRE- or POST- the
 * happiness-deficit penalty (the double-count check for Algorithms A/B). Dumps the
 * Yields method surface and probes candidate base/net accessors per yield. Most
 * informative on an UNHAPPY city (negative happiness → the penalty is active).
 */
function probeYieldPenalty() {
  log("API3-2b yields pre/post happiness penalty (getYield vs base)");
  const c = targetCity();
  if (!c) {
    log("API3-2b no target city (ideally an UNHAPPY one)");
    return;
  }
  log("API3-2b owner " + c.owner + " happy=" + cityYield(c, "YIELD_HAPPINESS") + " (negative = deficit penalty active)");
  try {
    if (c.Yields) log("API3-2b Yields methods " + methodsOf(c.Yields).join(" "));
    else log("API3-2b city has NO Yields component");
  } catch (e) {
    log("API3-2b Yields methods dump threw " + e);
  }
  const yields = ["YIELD_FOOD", "YIELD_PRODUCTION", "YIELD_GOLD", "YIELD_SCIENCE", "YIELD_CULTURE"];
  const getters = ["getYield", "getBaseYield", "getNetYield", "getYieldGross", "getYieldNet", "getModifiedYield"];
  for (const y of yields) {
    const ye = yieldEnum(y);
    const parts = [];
    for (const g of getters) {
      const fn = c.Yields?.[g];
      if (typeof fn !== "function") continue;
      let v;
      try {
        v = JSON.stringify(fn.call(c.Yields, ye));
      } catch (_) {
        v = "threw";
      }
      parts.push(g + "=" + v);
    }
    log("API3-2b " + y + " " + (parts.join(" ") || "(only getYield, or none)"));
  }
}

/** Run all API confirmations in sequence (3-1, 3-2, 3-2b, 3-3). */
function probeApi3() {
  log("API3 begin - confirmations for algorithmic-improvements");
  probeIdentity();
  probeSpecialists();
  probeYieldPenalty();
  probeAggregate();
  log("API3 done");
}

// ── NEW: API4 - confirmations for the interactive-extensions build ────────
// Settle the open in-engine questions before building the feedback layer, the DB
// policy cards, and the disaster/influence wiring:
//   (4-1) Influence write - DiplomacyTreasury.changeDiplomacyBalance(±n), local AND
//         foreign (cross-civ - the government-stance linchpin).
//   (4-2) Government + policies - Culture.getGovernmentType / getActiveTraditions /
//         isTraditionActive for local + foreign.
//   (4-3) Plague - city.isInfected for local + foreign cities (fog-independence).
//   (4-4) Disasters - dump GameInfo.RandomEvents (Name / EventClass / Severity).
//   (4-5) Notifications / WorldAnchor - what surface exists for in-game feedback?
// Plus PASSIVE recorders (logged when they fire during play): DiplomacyDeclareWar
// (aggressor/target field names) and RandomEventOccurred (payload shape).

/**
 * Read a player's influence (diplomacy) balance + net yield, defensively.
 * @param {number} pid Player id.
 * @returns {string} "balance=… net=…".
 */
function influenceOf(pid) {
  let bal = "?";
  let net = "?";
  try {
    bal = Players.get(pid)?.DiplomacyTreasury?.diplomacyBalance ?? "?";
  } catch (_) {
    /* ignore */
  }
  try {
    const yt = typeof YieldTypes !== "undefined" ? YieldTypes.YIELD_DIPLOMACY : undefined;
    net = Players.get(pid)?.Stats?.getNetYield?.(yt) ?? "?";
  } catch (_) {
    /* ignore */
  }
  return "balance=" + bal + " net=" + net;
}

/**
 * Try to move a player's influence by `amt` via changeDiplomacyBalance, logging
 * before/after (then reverses it). Confirms the cross-civ influence lever.
 * @param {number} pid Player id.
 * @param {string} label Log label.
 * @param {number} amt Amount to add then subtract.
 */
function tryInfluence(pid, label, amt) {
  const t = Players.get(pid)?.DiplomacyTreasury;
  if (typeof t?.changeDiplomacyBalance !== "function") {
    log("API4-1 " + label + " p" + pid + " changeDiplomacyBalance NOT a function");
    return;
  }
  log("API4-1 " + label + " p" + pid + " before " + influenceOf(pid));
  try {
    t.changeDiplomacyBalance(amt);
  } catch (e) {
    log("API4-1 " + label + " threw " + e);
    return;
  }
  setTimeout(() => {
    log("API4-1 " + label + " p" + pid + " after +" + amt + " " + influenceOf(pid));
    try {
      t.changeDiplomacyBalance(-amt);
    } catch (_) {
      /* ignore */
    }
  }, 400);
}

/** (4-1) Influence write, local + first foreign. */
function probeInfluence() {
  log("API4-1 influence write (changeDiplomacyBalance, cross-civ)");
  tryInfluence(GameContext.localPlayerID, "LOCAL", 100);
  const f = firstForeign();
  if (f) tryInfluence(f.pid, "FOREIGN", 100);
  else log("API4-1 no foreign player");
}

/** (4-2) Government + slotted policies for a player. */
function probeGovPolicies(pid, label) {
  try {
    const culture = Players.get(pid)?.Culture;
    const g = culture?.getGovernmentType?.();
    const gName = GameInfo?.Governments?.lookup?.(g)?.GovernmentType ?? "?";
    log("API4-2 " + label + " p" + pid + " government=" + gName);
    if (typeof culture?.getActiveTraditions === "function") {
      const slotNames = ["POLICY_CULTURE_SLOT", "TRADITION_CULTURE_SLOT"];
      for (const slot of slotNames) {
        const t = readSlot(culture, slot);
        log("API4-2 " + label + " p" + pid + " " + slot + " active=" + t);
      }
    } else {
      log("API4-2 " + label + " getActiveTraditions NOT a function");
    }
  } catch (e) {
    log("API4-2 " + label + " threw " + e);
  }
}

/**
 * Active traditions in a slot as a space-joined name list (best-effort).
 * @param {*} culture A player Culture component.
 * @param {string} slotName A CultureSlotTypes key.
 * @returns {string} The names, or "(none)".
 */
function readSlot(culture, slotName) {
  try {
    const slot = typeof CultureSlotTypes !== "undefined" ? CultureSlotTypes[slotName] : slotName;
    const list = culture.getActiveTraditions(slot) || [];
    const names = [];
    for (const t of list) {
      names.push(GameInfo?.Traditions?.lookup?.(t)?.TraditionType ?? String(t));
    }
    return names.length ? names.join(" ") : "(none)";
  } catch (e) {
    return "threw " + e;
  }
}

/** (4-3) Plague: city.isInfected for local + foreign cities. */
function probeInfected() {
  const c = targetCity();
  log("API4-3 LOCAL city isInfected=" + (c ? c.isInfected : "(no city)"));
  const f = firstForeign();
  if (f) log("API4-3 FOREIGN city isInfected=" + f.city.isInfected + " owner " + f.pid);
}

/** (4-4) Disaster definitions: Name / EventClass / Severity from GameInfo. */
function probeRandomEvents() {
  try {
    const t = GameInfo?.RandomEvents;
    if (!t) {
      log("API4-4 no GameInfo.RandomEvents");
      return;
    }
    let n = 0;
    for (const row of t) {
      if (n < 6) {
        const name = row?.Name && Locale?.compose ? Locale.compose(row.Name) : row?.Name;
        log("API4-4 " + row?.RandomEventType + " class=" + row?.EventClass + " sev=" + row?.Severity + " name=" + name);
      }
      n++;
    }
    log("API4-4 RandomEvents rows=" + n);
  } catch (e) {
    log("API4-4 threw " + e);
  }
}

/** (4-5) Notification + WorldAnchor surface for in-game feedback. */
function probeNotifySurface() {
  try {
    const gn = typeof Game !== "undefined" ? Game.Notifications : undefined;
    log("API4-5 Game.Notifications methods " + (gn ? methodsOf(gn).join(" ") : "(absent)"));
    log("API4-5 WorldAnchor=" + typeof WorldAnchor + " WorldUI=" + typeof WorldUI + " createNotification=" + typeof createNotification);
    const nt = GameInfo?.Notifications || GameInfo?.NotificationTypes;
    log("API4-5 GameInfo notification table " + (nt ? "present" : "absent"));
  } catch (e) {
    log("API4-5 threw " + e);
  }
}

/** Run all API4 synchronous confirmations. */
function probeApi4() {
  log("API4 begin - confirmations for interactive-extensions");
  probeInfluence();
  probeGovPolicies(GameContext.localPlayerID, "LOCAL");
  const f = firstForeign();
  if (f) probeGovPolicies(f.pid, "FOREIGN");
  probeInfected();
  probeRandomEvents();
  probeNotifySurface();
  log("API4 done (war + random-event payloads log passively when they fire)");
}

/** Log an event payload's keys + scalar values (passive recorder). */
function dumpPayload(tag, data) {
  try {
    if (!data || typeof data !== "object") {
      log(tag + " payload=" + data);
      return;
    }
    const parts = [];
    for (const k of Object.keys(data)) {
      const v = data[k];
      if (v == null || typeof v !== "object") parts.push(k + "=" + v);
      else parts.push(k + "=<obj>");
    }
    log(tag + " " + parts.join(" "));
  } catch (e) {
    log(tag + " dump threw " + e);
  }
}

/** Register passive recorders for DiplomacyDeclareWar + RandomEventOccurred. */
function installRecorders() {
  try {
    if (typeof engine === "undefined" || typeof engine.on !== "function") return;
    engine.on("DiplomacyDeclareWar", (/** @type {*} */ d) => dumpPayload("API4-B DeclareWar", d));
    engine.on("DiplomacyMakePeace", (/** @type {*} */ d) => dumpPayload("API4-B MakePeace", d));
    engine.on("RandomEventOccurred", (/** @type {*} */ d) => dumpPayload("API4-B RandomEvent", d));
    log("API4 passive recorders installed (DeclareWar / MakePeace / RandomEventOccurred)");
  } catch (e) {
    log("API4 installRecorders threw " + e);
  }
}

/** One-time icon tint for the dock buttons. */
function injectStyle() {
  try {
    if (document.getElementById("migration-probe-style")) return;
    const s = document.createElement("style");
    s.id = "migration-probe-style";
    s.textContent =
      ".ssb__button-icon.migp-inspect{background-color:#2aa;border-radius:50%;}" +
      ".ssb__button-icon.migp-dump{background-color:#ccc;border-radius:50%;}" +
      ".ssb__button-icon.migp-add{background-color:#7a2;border-radius:50%;}" +
      ".ssb__button-icon.migp-sub{background-color:#a72;border-radius:50%;}" +
      ".ssb__button-icon.migp-foreign{background-color:#c2a;border-radius:50%;}" +
      ".ssb__button-icon.migp-create{background-color:#28c;border-radius:50%;}" +
      ".ssb__button-icon.migp-createf{background-color:#15a;border-radius:50%;}" +
      ".ssb__button-icon.migp-grant{background-color:#dd2;border-radius:50%;}" +
      ".ssb__button-icon.migp-grantn{background-color:#d62;border-radius:50%;}" +
      ".ssb__button-icon.migp-grantf{background-color:#d29;border-radius:50%;}" +
      ".ssb__button-icon.migp-verify{background-color:#494;border-radius:50%;}" +
      ".ssb__button-icon.migp-api3{background-color:#92c;border-radius:50%;}" +
      ".ssb__button-icon.migp-api4{background-color:#27a;border-radius:50%;}";
    document.head.appendChild(s);
  } catch (e) {
    log("injectStyle threw " + e);
  }
}

/** Dock decorator that adds the probe buttons (same path the Demographics button uses). */
class MigrationDockDecorator {
  /** @param {*} val Dock panel handle. */
  constructor(val) {
    this._panel = val;
  }
  beforeAttach() {}
  afterAttach() {
    injectStyle();
    try {
      if (!this._panel || typeof this._panel.addButton !== "function") {
        log("dock addButton missing");
        return;
      }
      // Show ONLY the new API3 button for now. Flip SHOW_ALL to true to restore
      // the full probe button set.
      this._panel.addButton({
        tooltip: "API3: leader/civ identity + specialist semantics + per-civ pop aggregate",
        modifierClass: "migp-api3",
        callback: () => probeApi3(),
        class: ["migp-api3"]
      });
      this._panel.addButton({
        tooltip: "API4: influence write + government/policies + plague + disasters + notify surface",
        modifierClass: "migp-api4",
        callback: () => probeApi4(),
        class: ["migp-api4"]
      });
      log("API3 + API4 buttons added");
      const SHOW_ALL = false;
      if (!SHOW_ALL) return;
      this._panel.addButton({
        tooltip: "Migration: inspect selected city (pop urban/rural/worker + yields)",
        modifierClass: "migp-inspect",
        callback: () => inspectCity(targetCity(), "city"),
        class: ["migp-inspect"]
      });
      this._panel.addButton({
        tooltip: "Migration: DUMP City object methods (full population API)",
        modifierClass: "migp-dump",
        callback: () => dumpCity(),
        class: ["migp-dump"]
      });
      this._panel.addButton({
        tooltip: "Migration: add Rural +1 to selected city",
        modifierClass: "migp-add",
        callback: () => tryPopMethod("addRuralPopulation", 1),
        class: ["migp-add"]
      });
      this._panel.addButton({
        tooltip: "Migration: add Rural -1 to selected city (REMOVAL test)",
        modifierClass: "migp-sub",
        callback: () => tryPopMethod("addRuralPopulation", -1),
        class: ["migp-sub"]
      });
      this._panel.addButton({
        tooltip: "Migration: CROSS-CIV test - add Rural +1 to another civ's city",
        modifierClass: "migp-foreign",
        callback: () => foreignTest(),
        class: ["migp-foreign"]
      });
      this._panel.addButton({
        tooltip: "WRITE-SURFACE: CREATE_ELEMENT a settler at your capital (spawn-unit test)",
        modifierClass: "migp-create",
        callback: () => createLocal(),
        class: ["migp-create"]
      });
      this._panel.addButton({
        tooltip: "WRITE-SURFACE: CROSS-CIV create - spawn a unit OWNED by a foreign civ",
        modifierClass: "migp-createf",
        callback: () => createForeign(),
        class: ["migp-createf"]
      });
      this._panel.addButton({
        tooltip: "WRITE-SURFACE: grantYield +1000 gold to YOU (yield-write test)",
        modifierClass: "migp-grant",
        callback: () => testGrant(GameContext.localPlayerID, 1000),
        class: ["migp-grant"]
      });
      this._panel.addButton({
        tooltip: "WRITE-SURFACE: grantYield -200 gold to YOU (NEGATIVE / cost test)",
        modifierClass: "migp-grantn",
        callback: () => testGrant(GameContext.localPlayerID, -200),
        class: ["migp-grantn"]
      });
      this._panel.addButton({
        tooltip: "WRITE-SURFACE: CROSS-CIV grantYield - give gold to a foreign civ",
        modifierClass: "migp-grantf",
        callback: () => grantForeign(),
        class: ["migp-grantf"]
      });
      this._panel.addButton({
        tooltip: "VERIFY: settlement cap + migrant counting (local & foreign units)",
        modifierClass: "migp-verify",
        callback: () => verifyNew(),
        class: ["migp-verify"]
      });
      log("dock buttons added");
    } catch (e) {
      log("addButton threw " + e);
    }
  }
  beforeDetach() {}
  afterDetach() {}
}

/**
 * G2/G3 reconnaissance (read-only): inventory the diplomacy API surface so we can decide whether
 * a mod can add an initiable DiplomacyActionType (D2 ; native raids/agreements), must fall back to
 * a mod panel (D3), or should ride existing agreements (D1). Logs only; changes nothing. Run via
 * the console: `mig.diplo()`. See docs/immigration-interaction-plan.md §11 / gate G2.
 */
function probeDiplomacy() {
  log("=== DIPLO PROBE (read-only) ===");
  try {
    const d = typeof Game !== "undefined" ? Game.Diplomacy : undefined;
    log("Game.Diplomacy typeof=" + typeof d);
    if (d) {
      const methods = [];
      for (const k in d) {
        if (typeof d[k] === "function") methods.push(k);
      }
      log("Diplomacy methods: " + methods.sort().join(", "));
      // The D2 gate: is there a surface to enumerate / initiate an action against a target?
      for (const k of ["getAvailableActions", "getProjectsForTarget", "canStartAction", "startAction", "proposeAction", "initiateProject"]) {
        log("  Diplomacy." + k + " = " + typeof d[k]);
      }
    }
    const acts = typeof GameInfo !== "undefined" ? GameInfo.DiplomacyActions : undefined;
    if (acts) {
      let n = 0;
      const names = [];
      for (const a of acts) {
        n++;
        if (names.length < 12) names.push(a.DiplomacyActionType);
      }
      log("GameInfo.DiplomacyActions count=" + n + " e.g. " + names.join(", "));
    } else {
      log("GameInfo.DiplomacyActions: not enumerable");
    }
    const me = GameContext.localPlayerID;
    let other = null;
    const alive = typeof Players !== "undefined" && Players.getAlive ? Players.getAlive() : null;
    for (const p of alive || []) {
      const pid = p?.id ?? p;
      if (pid !== me && Players.get(me)?.Diplomacy?.hasMet?.(pid)) {
        other = pid;
        break;
      }
    }
    log("local=" + me + " firstMet=" + other);
    if (other != null && typeof d?.getJointEvents === "function") {
      const ev = d.getJointEvents(me, other, false) || [];
      log("jointEvents(" + me + "," + other + ") count=" + ev.length);
      for (const e of ev.slice(0, 8)) log("  event: " + (e?.actionTypeName ?? "?"));
    }
  } catch (e) {
    log("diplo probe threw " + e);
  }
  log("=== END DIPLO PROBE ===");
}

// ── Audit probes (war name via getWarData, happiness grant effect) ──────────────────────────────

/**
 * All readable happiness values for a player (player-level accessors + the capital's YIELD_HAPPINESS),
 * so a grant test can see whether ANY of them moves.
 * @param {number} pid Player id.
 * @returns {Record<string,*>} The readings.
 */
function happinessReadings(pid) {
  /** @type {Record<string,*>} */
  const out = {};
  try {
    const h = Players.get(pid)?.Happiness;
    for (const m of ["getHappiness", "getNetHappiness", "getHappinessPerTurn"]) {
      if (h && typeof h[m] === "function") {
        try {
          out[m] = h[m]();
        } catch (_) {
          out[m] = "threw";
        }
      }
    }
    const cap = playerCapital(pid);
    if (cap) out.capitalYieldHappiness = cityYield(cap, "YIELD_HAPPINESS");
  } catch (_) {
    /* ignore */
  }
  return out;
}

/**
 * Happiness-grant probe: read happiness, grantYield(YIELD_HAPPINESS, -20), re-read. If nothing moves,
 * happiness is NOT a grantable stockpile and the assimilation-cost happiness leg is a no-op.
 * @param {number} [pid] Target player (default local).
 */
function probeHappiness(pid) {
  const target = pid == null ? GameContext.localPlayerID : pid;
  if (typeof Players?.grantYield !== "function") {
    log("HAPPY grantYield is NOT a function");
    return;
  }
  log("HAPPY grant test -> player " + target + " before " + JSON.stringify(happinessReadings(target)));
  try {
    Players.grantYield(target, yieldEnum("YIELD_HAPPINESS"), -20);
  } catch (e) {
    log("HAPPY grantYield(YIELD_HAPPINESS,-20) THREW " + e);
    return;
  }
  setTimeout(() => {
    log("HAPPY after grant(-20) " + JSON.stringify(happinessReadings(target)));
    log("HAPPY => if UNCHANGED, grantYield(YIELD_HAPPINESS) is a NO-OP (only the gold cost bites)");
  }, 600);
}

/**
 * Log the engine war name for each active declare-war between `me` and `pid`. Returns how many were
 * found. Confirms the getJointEvents -> uniqueID -> getWarData(uniqueID, me).warName path.
 * @param {number} me Local player id. @param {number} pid Other player id.
 * @returns {number} Wars found.
 */
function probeWarBetween(me, pid) {
  let events = null;
  try {
    events = Game?.Diplomacy?.getJointEvents?.(me, pid, false);
  } catch (_) {
    return 0;
  }
  let n = 0;
  for (const e of events || []) {
    if (!e || e.actionTypeName !== "DIPLOMACY_ACTION_DECLARE_WAR") continue;
    n++;
    let name = "?";
    try {
      name = Game.Diplomacy.getWarData(e.uniqueID, me)?.warName;
    } catch (err) {
      name = "threw " + err;
    }
    log("WARNAME " + me + " vs " + pid + " uniqueID=" + e.uniqueID + " warName=" + name);
  }
  return n;
}

/** War-name probe: scan the local player's active declare-war events and log each engine warName. */
function probeWarName() {
  log("WARNAME test: getJointEvents -> DECLARE_WAR uniqueID -> getWarData(uniqueID, me).warName");
  let me = -1;
  try {
    me = GameContext.localPlayerID;
  } catch (_) {
    /* ignore */
  }
  let found = 0;
  for (let pid = 0; pid < 64; pid++) {
    if (pid !== me) found += probeWarBetween(me, pid);
  }
  if (!found) log("WARNAME no active declare-war events for the local player (be at war first)");
}

/** Console fallback. */
function exposeGlobals() {
  try {
    globalThis.mig = {
      inspect: () => inspectCity(targetCity(), "city"),
      dump: () => dumpCity(),
      add: (n) => tryPopMethod("addRuralPopulation", n == null ? 1 : n),
      call: (m, n) => tryPopMethod(m, n == null ? 1 : n),
      foreign: () => foreignTest(),
      // write-surface probes
      createLocal: () => createLocal(),
      createForeign: () => createForeign(),
      // create any unit type for any player at a {x,y}: mig.create("UNIT_MIGRANT", pid, loc)
      create: (type, pid, loc) =>
        testCreateUnit(pid == null ? GameContext.localPlayerID : pid, loc || localCapital()?.location, type || "UNIT_SETTLER"),
      grant: (n) => testGrant(GameContext.localPlayerID, n == null ? 1000 : n),
      grantForeign: () => grantForeign(),
      // grant any amount to any player: mig.grantTo(pid, amount)
      grantTo: (pid, n) => testGrant(pid, n == null ? 500 : n),
      // verify settlement cap + migrant counting (local & foreign)
      verify: () => verifyNew(),
      // the 3 API confirmations for algorithmic-improvements (run all, or each)
      api3: () => probeApi3(),
      api4: () => probeApi4(),
      ident: () => probeIdentity(),
      spec: () => probeSpecialists(),
      yield2b: () => probeYieldPenalty(),
      agg: () => probeAggregate(),
      // G2/G3 diplomacy recon (read-only) , informs the §11 D2/D3 decision
      diplo: () => probeDiplomacy(),
      // AUDIT: confirm the engine war NAME resolves (getWarData), and whether happiness is grantable.
      warName: () => probeWarName(),
      happy: (/** @type {number} */ pid) => probeHappiness(pid)
    };
  } catch (e) {
    log("exposeGlobals threw " + e);
  }
}

/** Boot. */
function boot() {
  log("boot start");
  exposeGlobals();
  installRecorders(); // passive DiplomacyDeclareWar / RandomEventOccurred payload logging
  try {
    if (typeof Controls !== "undefined" && typeof Controls.decorate === "function") {
      Controls.decorate("panel-sub-system-dock", (val) => new MigrationDockDecorator(val));
      log("dock decorator registered");
    } else {
      log("Controls.decorate unavailable");
    }
  } catch (e) {
    log("decorate registration threw " + e);
  }
}

boot();
