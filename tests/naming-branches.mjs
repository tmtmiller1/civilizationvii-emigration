import assert from "node:assert/strict";

globalThis.localStorage = {
  _m: {},
  getItem(k) {
    return this._m[k] ?? null;
  },
  setItem(k, v) {
    this._m[k] = String(v);
  }
};

globalThis.GameContext = { localPlayerID: 0 };

const metSet = new Set([1, 3, 4]);
const players = {
  0: {
    isMajor: true,
    civilizationType: "ROME",
    civilizationName: "LOC_CIV_NAME_ROME",
    Diplomacy: {
      hasMet(pid) {
        return metSet.has(pid);
      }
    }
  },
  1: { isMajor: true, civilizationType: "ROME", civilizationName: "LOC_CIV_NAME_ROME" },
  2: { isMajor: true, civilizationType: "EGYPT", civilizationName: "LOC_CIV_NAME_EGYPT" },
  3: { isMajor: false, isMinor: true, civilizationType: "INDEPENDENT", civilizationName: "LOC_CIV_NAME_MINOR" },
  4: { isMajor: true, civilizationType: "PERSIA", civilizationName: "LOC_CIV_NAME_PERSIA" }
};

globalThis.Players = {
  get(pid) {
    return players[pid] || null;
  },
  getAlive() {
    return [{ id: 0 }, { id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
  }
};

globalThis.GameInfo = {
  Civilizations: {
    lookup(type) {
      return { CivilizationType: "CIVILIZATION_" + String(type || "").toUpperCase() };
    }
  },
  RandomEvents: {
    lookup() {
      return { Name: "LOC_RANDOM_EVENT_THERA" };
    }
  },
  AgeCrisisEventTypes: {
    lookup(type) {
      if (type === "ANTIQUITY_CRISIS_PLAGUE") return { Name: "LOC_CRISIS_PLAGUE" };
      return null;
    }
  }
};

globalThis.Locale = {
  compose(key, ...args) {
    const map = {
      LOC_CIVILIZATION_ROME_ADJECTIVE: "Roman",
      LOC_CIVILIZATION_EGYPT_ADJECTIVE: "Egyptian",
      LOC_CIVILIZATION_PERSIA_ADJECTIVE: "Persian",
      LOC_CIV_NAME_ROME: "Rome",
      LOC_CIV_NAME_EGYPT: "Egypt",
      LOC_CIV_NAME_PERSIA: "Persia",
      LOC_RANDOM_EVENT_THERA: "Thera",
      LOC_CRISIS_PLAGUE: "The Great Plague",
      LOC_EMIG_EVENT_FAMINE: "Famine",
      LOC_EMIG_WAR_VS_UNMET: `${args[0]} vs. an unmet civilization`,
      LOC_EMIG_NEWS_WHO: `${args[0]}: ${args[1]}`,
      LOC_IP_CARTHAGE: "Carthage"
    };
    return map[key] ?? key;
  }
};

globalThis.Game = {
  IndependentPowers: {
    independentName(pid) {
      return pid === 3 ? "LOC_IP_CARTHAGE" : null;
    }
  },
  Diplomacy: {
    getJointEvents(a, b) {
      if (a === 1 && b === 4) return [{ actionTypeName: "DIPLOMACY_ACTION_DECLARE_WAR", uniqueID: 91 }];
      return [];
    },
    getWarData(id) {
      if (id === 91) return { warName: "Persian-Roman War" };
      return null;
    }
  }
};

const settings = await import("/emigration/ui/emigration-settings.js");
const {
  civAdjective,
  narrativeCiv,
  eventDisplayName,
  warRefugeeName,
  disasterName,
  crisisName,
  refugeeHeadline
} = await import("/emigration/ui/emigration-naming.js");

function testAdjectivesAndNarrativeMasking() {
  settings.setVisibilityOverride(2);
  assert.equal(civAdjective(1), "Roman");
  assert.equal(civAdjective(3), "Carthage", "minor civ should use independent name");

  settings.setVisibilityOverride(1);
  const unmet = narrativeCiv(2);
  assert.equal(unmet.adj, "Egyptian");
  assert.equal(unmet.framed, true, "narrative should mark unmet civ as hearsay");
}

function testEventDisplayNameDispatch() {
  settings.setVisibilityOverride(2);
  assert.equal(eventDisplayName(""), null);
  assert.equal(eventDisplayName("famine"), "Famine");
  assert.equal(eventDisplayName("crisis:ANTIQUITY_CRISIS_PLAGUE"), "The Great Plague");
  assert.equal(eventDisplayName("disaster:random"), "Thera");
  assert.equal(eventDisplayName("UNKNOWN_EVENT_TYPE"), "Unknown Type");

  const warName = eventDisplayName("war:1:4");
  assert.equal(warName, "Persian-Roman War");
}

function testWarNamingMaskedAndFallbackBranches() {
  settings.setVisibilityOverride(1);
  const masked = warRefugeeName(1, [2]);
  assert.equal(masked, "Roman vs. an unmet civilization");

  settings.setVisibilityOverride(2);
  const pairFallback = warRefugeeName(1, [99]);
  assert.equal(pairFallback, "Roman–a people War");

  const singleFallback = warRefugeeName(1, []);
  assert.match(singleFallback, /War$/);
}

function testDisasterCrisisAndWhoLedHeadline() {
  assert.equal(disasterName("anything"), "Thera");
  assert.equal(crisisName("ANTIQUITY_CRISIS_PLAGUE"), "The Great Plague");
  assert.equal(crisisName("RANDOM_EVENT_MYSTERY"), "Mystery Crisis");

  const h = refugeeHeadline({
    cause: "war",
    warName: "Border War",
    people: "8,000 people",
    civ: "roman"
  });
  assert.ok(h.startsWith("Roman:"));
  assert.ok(h.includes("Border War"));
}

testAdjectivesAndNarrativeMasking();
testEventDisplayNameDispatch();
testWarNamingMaskedAndFallbackBranches();
testDisasterCrisisAndWhoLedHeadline();

delete globalThis.Game;
delete globalThis.GameInfo;
delete globalThis.Locale;
delete globalThis.Players;
delete globalThis.GameContext;
delete globalThis.localStorage;

console.log("naming-branches harness passed");
