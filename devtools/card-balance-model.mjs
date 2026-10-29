// Talent Attraction and Consular Protection against each other and against the game's own cards, on empires
// read from real games. Run: node devtools/card-balance-model.mjs
//
// A card is worth the share of income it adds: +20 Science on 200 is 10%, +20 Gold on 1,000 is 2%. That's the
// marginal value of a yield falling as you hold more of it (log utility), and it lets Science, Gold and Influence
// sit on one scale without a made-up exchange rate. Upkeep counts against the yield it's paid in. Happiness and
// Food costs on the game's cards are listed beside them, not scored.

/**
 * Empires. "read" rows come from a live read or a recorded table; "est" rows are interpolated or scaled and say
 * from what. urban and rural are the people the per-population effect counts; specialists aren't counted.
 */
const STATES = [
  // roadmap section 66, WashingtonExp106; urban share 132 of 287 from the same read
  { id: "player-ex106", age: "ex", src: "read", n: 18, cities: 3, urban: 132, rural: 155, spec: 30, sci: 261, gold: 1146, inf: 86, cityShare: 0.35 },
  // roadmap section 66, the strongest AI of the same game; urban share taken from the player's 46%
  { id: "ai-strong-ex", age: "ex", src: "read", n: 10, cities: 3, urban: 67, rural: 78, spec: 10, sci: 164, gold: 303, inf: 39, cityShare: 0.4 },
  // midpoint of the section 66 AI ranges
  { id: "ai-mid-ex", age: "ex", src: "est", n: 7, cities: 2, urban: 43, rural: 50, spec: 7, sci: 85, gold: 190, inf: 20, cityShare: 0.4 },
  // the low end of the section 66 AI ranges (Science lifted from 6 to 30: the 6 belongs to a different civ)
  { id: "ai-poor-ex", age: "ex", src: "est", n: 5, cities: 1, urban: 26, rural: 31, spec: 4, sci: 30, gold: 86, inf: 5, cityShare: 0.4 },
  // the owner's game, Modern turn 27, live read 2026-10-28; urban read for 14 of 18 settlements, the rest at 40%;
  // Influence wasn't read (the game closed), 120 is a guess between Exploration's 86 and the Modern card sizes
  { id: "player-mo27", age: "mo", src: "read", n: 18, cities: 3, urban: 186, rural: 205, spec: 46, sci: 549, gold: 1056, inf: 120, cityShare: 0.31 },
  // AI rows scaled from Exploration by the player's own Exploration-to-Modern change: population x1.36,
  // Science x2.1, Gold x1, Influence x1.4
  { id: "ai-strong-mo", age: "mo", src: "est", n: 10, cities: 3, urban: 91, rural: 106, spec: 14, sci: 344, gold: 303, inf: 55, cityShare: 0.35 },
  { id: "ai-mid-mo", age: "mo", src: "est", n: 7, cities: 2, urban: 58, rural: 68, spec: 10, sci: 178, gold: 190, inf: 28, cityShare: 0.35 },
  { id: "ai-poor-mo", age: "mo", src: "est", n: 5, cities: 1, urban: 35, rural: 42, spec: 5, sci: 63, gold: 86, inf: 7, cityShare: 0.35 }
];

/** Enclaves of the civ's people abroad. A host takes at most 3 an age, and pacing aims for one. */
const ENCLAVES = [0, 1, 2, 4];

/** @param {object} s @param {{sci?:number, gold?:number, inf?:number}} d @returns {number} Percent of income. */
function value(s, d) {
  return 100 * ((d.sci || 0) / s.sci + (d.gold || 0) / s.gold + (d.inf || 0) / s.inf);
}

const ex = (s, a, b) => (s.age === "ex" ? a : b);

/** Talent Attraction variants. Each returns the yields the card adds on state s. */
const TALENT = {
  "T0 now: all/5 Ex, all/4 Mo, -2/-3 Gold": (s) => ({ sci: (s.urban + s.rural) / ex(s, 5, 4), gold: -ex(s, 2, 3) * s.n }),
  "T1 urban/5 Ex, urban/4 Mo, same Gold": (s) => ({ sci: s.urban / ex(s, 5, 4), gold: -ex(s, 2, 3) * s.n }),
  "T2 all/10 Ex, all/8 Mo, same Gold": (s) => ({ sci: (s.urban + s.rural) / ex(s, 10, 8), gold: -ex(s, 2, 3) * s.n }),
  "T3 urban/4 Ex, urban/3 Mo, no Gold": (s) => ({ sci: s.urban / ex(s, 4, 3) }),
  "T5 urban/5 Ex, urban/4 Mo, no Gold": (s) => ({ sci: s.urban / ex(s, 5, 4) }),
  "T7 all/10 Ex, all/8 Mo, no Gold (built)": (s) => ({ sci: (s.urban + s.rural) / ex(s, 10, 8) }),
  "T6 urban/5 Ex, urban/4 Mo, -1 Gold": (s) => ({ sci: s.urban / ex(s, 5, 4), gold: -s.n }),
  "T4 +10% Science everywhere (reference)": (s) => ({ sci: 0.1 * s.sci })
};

/** Consular Protection variants, on state s with e enclaves abroad. The script part is invisible to the AI. */
const CONSULAR = {
  "C0 now: +3 Ex/+5 Mo, +1 per enclave to +4": (s, e) => ({ inf: ex(s, 3, 5) + Math.min(4, e) }),
  "C1 +4 Ex/+6 Mo, +1 per enclave to +4": (s, e) => ({ inf: ex(s, 4, 6) + Math.min(4, e) }),
  "C2 +4 Ex/+6 Mo, +2 per enclave to +6": (s, e) => ({ inf: ex(s, 4, 6) + Math.min(6, 2 * e) }),
  "C3 +2 Ex/+3 Mo per 5 settlements, +2 per enclave to +6": (s, e) => ({ inf: ex(s, 2, 3) * Math.max(1, Math.round(s.n / 5)) + Math.min(6, 2 * e) })
};

/**
 * Your people living in other civilizations' settlements (the composition ledger's byCiv for your civ, summed over
 * settlements you don't own). Not read from a game yet; section 66's AI groups abroad ran 6 to 20.
 */
const ABROAD = [0, 5, 10, 20, 40];

/**
 * Consular as Talent's mirror: paid per person of yours abroad, where Talent pays per person at home. The Influence
 * floor stays so the AI planner sees something. Talent costs Gold, this one earns it (remittances).
 */
const MIRROR = {
  "K1 +4/+6 Inf, +1 Inf per 5 abroad": (s, a) => ({ inf: ex(s, 4, 6) + a / 5 }),
  "K2 +4/+6 Inf, +1 Gold per 1 abroad (Mo 2) (built)": (s, a) => ({ inf: ex(s, 4, 6), gold: a * ex(s, 1, 2) }),
  "K3 +4/+6 Inf, +1 Inf per 10 and +1 Gold per 1 abroad (Mo 2)": (s, a) => ({ inf: ex(s, 4, 6) + a / 10, gold: a * ex(s, 1, 2) })
};

/** The game's own cards in the same ages that pay Science or Influence. cost: what isn't scored. */
const BASE = {
  ex: {
    "Enlightenment (+2 Sci/specialist)": { f: (s) => ({ sci: 2 * s.spec }), cost: "+1 Happiness upkeep a specialist" },
    "Rationalism (+15% Sci, Gold in converted cities)": { f: (s) => ({ sci: 0.15 * s.cityShare * s.sci, gold: 0.15 * s.cityShare * s.gold }), cost: "your religion in your cities" },
    "Divine Right (+4 Inf, +10 Happiness on Palace)": { f: () => ({ inf: 4 }), cost: "none; +10 Happiness unscored" }
  },
  mo: {
    "Social Science (+3 Sci/specialist)": { f: (s) => ({ sci: 3 * s.spec }), cost: "+1 Food and Happiness upkeep a specialist" },
    "Productive Forces (+3 Sci/specialist, -3 Gold/town)": { f: (s) => ({ sci: 3 * s.spec, gold: -3 * (s.n - s.cities) }), cost: "ideology branch" },
    "Ambassadors (+6 Inf)": { f: () => ({ inf: 6 }), cost: "none" },
    "Living Standards (25% off building upkeep, est.)": { f: (s) => ({ gold: 0.25 * 0.03 * s.gold * s.n }), cost: "+Happiness unscored; upkeep guessed" }
  }
};

const pct = (v) => (v >= 0 ? "+" : "") + v.toFixed(1) + "%";
const pad = (t, w) => String(t).padEnd(w);

function table(title, rows, cols) {
  console.log("\n" + title);
  console.log(pad("", 52) + cols.map((c) => pad(c, 14)).join(""));
  for (const [name, cells] of rows) console.log(pad(name, 52) + cells.map((c) => pad(c, 14)).join(""));
}

const ids = STATES.map((s) => s.id + (s.src === "est" ? "*" : ""));

/** @returns {string} Lowest to highest across the states: a card that's fair to every empire keeps this narrow. */
const spread = (vals) => Math.min(...vals).toFixed(0) + " to " + Math.max(...vals).toFixed(0);

table("Talent Attraction: share of income added (Science gain minus Gold upkeep)", Object.entries(TALENT).map(([k, f]) => { const v = STATES.map((s) => value(s, f(s))); return [k, v.map(pct).concat(spread(v))]; }), ids.concat("spread"));
table("Talent Attraction: raw Science / Gold", Object.entries(TALENT).map(([k, f]) => [k, STATES.map((s) => { const d = f(s); return Math.round(d.sci) + "/" + Math.round(d.gold || 0); })]), ids);

for (const e of ENCLAVES) {
  table(`Consular Protection with ${e} enclave(s) abroad: share of Influence income`, Object.entries(CONSULAR).map(([k, f]) => [k, STATES.map((s) => pct(value(s, f(s, e))))]), ids);
}
table("Consular Protection: what the AI planner sees (data floor only, no enclaves)", Object.entries(CONSULAR).map(([k, f]) => [k, STATES.map((s) => Math.round(f(s, 0).inf) + " inf")]), ids);

for (const a of ABROAD) {
  table(`Consular as Talent's mirror, ${a} of your people abroad: share of income`, Object.entries(MIRROR).map(([k, f]) => [k, STATES.map((s) => pct(value(s, f(s, a))))]), ids);
}

for (const age of ["ex", "mo"]) {
  const st = STATES.filter((s) => s.age === age);
  table(`The game's own cards (${age === "ex" ? "Exploration" : "Modern"})`, Object.entries(BASE[age]).map(([k, { f }]) => [k, st.map((s) => pct(value(s, f(s))))]), st.map((s) => s.id + (s.src === "est" ? "*" : "")));
}
console.log("\n* estimated state; see the source note on its row in STATES.");
