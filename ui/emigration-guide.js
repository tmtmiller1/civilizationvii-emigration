// emigration-guide.js
//
// The "What counts" reference: a yes/no matrix of common questions about what does and doesn't
// cause, attract, or participate in migration, kept in step with the mod's actual DEFAULT behavior.
// Rendered as flexbox rows (GameFace lays out neither <table> nor CSS grid) for the dashboard's
// Guide tab; the same matrix is mirrored in the README. Self-contained (own style + DOM) so the
// line-capped render core (emigration-views.js) only has to wire it in.

const YES = "✓"; // U+2713 CHECK MARK (renders in the GameFace body/title fonts)
// U+00D7 MULTIPLICATION SIGN, not U+2717 BALLOT X: the ballot-X glyph is absent from the GameFace
// fonts (it rendered blank, so "not covered" rows showed nothing), while × is present everywhere.
// Styled bold + larger via `.emig-guide-ic.n` so it reads as a clear red X.
const NO = "×";

/** @type {{title:string, rows?:{q:string, yes:boolean, note:string}[], faq?:{q:string, a:string}[]}[]} */
const GUIDE = [
  {
    title: "What makes people LEAVE a city",
    rows: [
      { q: "Unhappiness / low yields", yes: true, note: "The dominant driver of emigration: happiness is weighted more than any other factor, and yields are scored per-capita, so an unhappy, low-yield city bleeds people even at peace." },
      { q: "War damage to the districts", yes: true, note: "Damage to ANY of the city's districts — its center or an outer urban/rural quarter — is read from game state (fog-independent) and scales the war penalty. An assault that wrecks only the city's edge still registers, even while the center reads pristine." },
      { q: "Being besieged or attacked", yes: true, note: "Per-city: only the besieged city itself sheds people. Fires when ANY of its districts is besieged or has been overrun (captured/contested), even before its health drops. It is NOT a civ-wide score; a civ at war elsewhere keeps its unaffected cities." },
      { q: "Attacked by a city-state / Independent Power", yes: true, note: "Same per-city conflict pressure as a major-civ war: an Independent/minor raid on a city still drives THAT city's people out, attacker-agnostic." },
      { q: "Pillaged tiles in the city's borders", yes: true, note: "Pillaged improvements on the city's own plots count as violence in its borders (polled, fog-independent); more pillaged tiles means more pressure." },
      { q: "Starvation", yes: true, note: "A city with negative net food is flagged starving and takes a situational penalty, shedding population until its food recovers." },
      { q: "Plague / disease", yes: true, note: "An infected city loses people, and migrants leaving it can carry the plague to their destination." },
      { q: "Natural disasters (floods, volcanoes)", yes: true, note: "Environmental-disaster distress adds a per-city penalty on a capped sliding scale: strong, but it can't empty the city on its own. An eruption/flood strikes every city around its epicenter, so a volcano on unowned border terrain still displaces the neighboring cities' people." },
      { q: "Overcrowding in a tall city", yes: true, note: "Urban population above a threshold adds pressure (the overcrowding term); the per-leader tuning can soften it via the overcrowding discount." }
    ]
  },
  {
    title: "What ATTRACTS people to a city",
    rows: [
      { q: "Higher prosperity (food, production, gold, science, culture)", yes: true, note: "Each city scores its per-capita weighted food, production, gold, science and culture; a higher score than nearby cities pulls migrants in." },
      { q: "Higher happiness", yes: true, note: "Weighted more heavily than any other factor. In the shaped model it's measured against the world average and saturates, so a happy city is a strong magnet but can't run away without limit." },
      { q: "A Pro-Immigration stance policy", yes: true, note: "A civic-tree Pro-Immigration stance raises the pull into your cities and earns Influence (trading some retention)." },
      { q: "An Open Borders agreement", yes: true, note: "An Open Borders agreement adds a cross-civ pull bonus, so more people cross between the two civs." },
      { q: "Being nearby", yes: true, note: "Migration is distance-penalized, so people move to nearby better settlements rather than across the map." }
    ]
  },
  {
    title: "Who participates (sends / receives population)",
    rows: [
      { q: "Your civilization", yes: true, note: "Sends and receives population like any major civ; its cities both lose and gain migrants." },
      { q: "Towns, not just cities", yes: true, note: "Towns participate too; they send and receive migrants the same as cities." },
      { q: "Your own cities trade people (internal migration)", yes: true, note: "People also move between a civ's OWN settlements, not only across civs; the dashboard colours these internal moves separately." },
      { q: "Other major civilizations", yes: true, note: "Every major civ is simulated from turn one, met or not, so the migration map isn't biased by what you've explored." },
      { q: "City-states / minor civs / Independent Powers", yes: false, note: "Not currently: they neither send nor receive migrating population, though attacking a major civ's city still drives THAT city's people out." },
      { q: "Unmet civilizations", yes: true, note: "Fully simulated, but masked in the UI by default for spoiler protection until you widen the visibility policy." }
    ]
  },
  {
    title: "Behavior",
    rows: [
      { q: "Migration between different civilizations", yes: true, note: "People do cross borders, but the flow is throttled by borders, distance, and each side's immigration stance." },
      { q: "Migration driven by distant AI-vs-AI wars", yes: true, note: "Fog-independent: war pressure reads actual game state, so a far-off AI-vs-AI war displaces people the same as one you can see." },
      { q: "An Anti-Immigration stance retains your people", yes: true, note: "Raises retention (fewer people leave) and boosts Production, at the cost of Influence." },
      { q: "Closed Borders reduces cross-civ flow", yes: true, note: "Without an Open Borders agreement far fewer people cross between civs; closing borders tightens it further." },
      { q: "Population & yields actually change (not just a display)", yes: true, note: "Real per-turn gameplay writes: city populations and the yields they produce actually move; it isn't a cosmetic overlay." },
      { q: "Any layer can be tuned or switched off", yes: true, note: "Presets plus ~57 individual knobs under Options ▸ Mods ▸ Emigration; every layer is on by default and can be turned off." },
      { q: "Migrants arrive instantly", yes: false, note: "No. They travel, so arrival lags with distance, up to a few turns after they leave." },
      { q: "Absorbing migrants is free", yes: false, note: "No. Receiving migrants adds a temporary, decaying assimilation cost in happiness and gold." },
      { q: "War alone can empty a city to zero", yes: false, note: "No. Siege/war population loss is capped; a city can only be fully emptied by an actual capture." }
    ]
  },
  {
    title: "Scope & limits",
    rows: [
      { q: "Change AI strategy or decisions", yes: false, note: "No. Only the movement of population is layered on; the base game's AI decision-making is untouched." },
      { q: "Replace or overwrite base-game files", yes: false, note: "No. Additive only; no base-game files are replaced or overwritten." },
      { q: "Move population instantly across the map", yes: false, note: "No. Distance-penalized; people move to nearby better settlements, not across the world in one step." },
      { q: "Let you directly place or pick individual migrants", yes: false, note: "No. Flows are simulated from prosperity, war, and policy; you shape them with yields and stances, not by hand." },
      { q: "Let one magnet city drain the whole map", yes: false, note: "No. A congestion brake (plus the overcrowding discount) damps a runaway magnet, so no single city accretes the world." }
    ]
  },
  {
    title: "FAQ",
    faq: [
      { q: "Where do people go when they leave?", a: "To the nearest higher-prosperity settlement they can reach. Migration is distance-penalized, so people move regionally, not to the single best city on the map." },
      { q: "Where do war refugees flee?", a: "Away from the nearest enemy, preferring their own civilization first, then neutral civs, and the attacker last." },
      { q: "Can I see refugees a civ took IN, not just sent out?", a: "Yes. The Graphs tab has both: Refugees Out (people a civ displaced by war/disaster/conquest) and Refugees In (displaced people it resettled). Each line's tooltip splits the total by cause." },
      { q: "How many people move, and how often?", a: "War- and disaster-driven refugees flee every turn; voluntary (prosperity/unhappiness) migration is more gradual, resting briefly between moves. Each civilization migrates on its own per-turn budget that scales with its size and active crises, so simultaneous wars never throttle one another. Counts show as scaled people or raw population points (your choice), and the whole sim runs on a turn interval you can lengthen in Options for large saves." },
      { q: "What happens when I capture or lose a city?", a: "It keeps its residents' origin mix (what the Ethnicity lens paints), so a conquered city carries real origin history. War can shrink it, but only an actual capture transfers it." },
      { q: "Why did a city suddenly lose a lot of people?", a: "An on-screen toast names the cause (war, disaster, unhappiness, etc.), and the per-city readout breaks down its current pressures." }
    ]
  }
];

const STYLE_ID = "emig-guide-style";
const CSS =
  ".emig-guide{display:flex;flex-direction:column;width:100%;}" +
  ".emig-guide-h{font-family:\"TitleFont\";text-transform:uppercase;letter-spacing:0.05rem;color:#f3c34c;font-size:1.15rem;margin:0.6rem 0 0.1rem;border-bottom:0.0555rem solid rgba(201,162,76,0.3);padding-bottom:0.2rem;}" +
  ".emig-guide-row{display:flex;align-items:flex-start;gap:0.6rem;padding:0.32rem 0.1rem;border-top:0.0277rem solid rgba(229,210,172,0.1);}" +
  ".emig-guide-ic{flex:0 0 1.5rem;font-weight:bold;text-align:center;font-size:1.25rem;line-height:1.3;}" +
  ".emig-guide-ic.y{color:#7fd08a;}.emig-guide-ic.n{color:#e0726a;font-size:1.5rem;line-height:1.05;}" +
  ".emig-guide-q{flex:1.5 1 0;color:#f0dca8;font-size:1.15rem;}" +
  ".emig-guide-note{flex:2 1 0;opacity:0.8;font-size:1.05rem;}" +
  ".emig-guide-faq-q{color:#f0dca8;font-weight:bold;font-size:1.2rem;margin:0.5rem 0 0.1rem;padding-top:0.3rem;border-top:0.0277rem solid rgba(229,210,172,0.1);}" +
  ".emig-guide-faq-a{opacity:0.82;font-size:1.1rem;line-height:1.5;}";

/**
 * Create an element with an optional class + text.
 * @param {string} tag Tag name.
 * @param {string} [cls] Class.
 * @param {string} [text] Text content.
 * @returns {HTMLElement} The element.
 */
function ce(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/** Inject the guide stylesheet once. */
function injectGuideStyle() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const st = document.createElement("style");
  st.id = STYLE_ID;
  st.textContent = CSS;
  (document.head || document.documentElement).appendChild(st);
}

/**
 * Render one guide section's body: a `faq` section as Q→A pairs (no icon), else the ✓/✗ matrix rows.
 * @param {HTMLElement} wrap The guide container.
 * @param {*} g The section ({title} + either `rows` or `faq`).
 */
function renderGuideSection(wrap, g) {
  if (Array.isArray(g.faq)) {
    for (const f of g.faq) {
      wrap.appendChild(ce("div", "emig-guide-faq-q", f.q));
      wrap.appendChild(ce("div", "emig-guide-faq-a", f.a));
    }
    return;
  }
  for (const r of g.rows || []) {
    const row = ce("div", "emig-guide-row");
    row.appendChild(ce("div", "emig-guide-ic " + (r.yes ? "y" : "n"), r.yes ? YES : NO));
    row.appendChild(ce("div", "emig-guide-q", r.q));
    row.appendChild(ce("div", "emig-guide-note", r.note || ""));
    wrap.appendChild(row);
  }
}

/**
 * Render the "What counts" matrix + FAQ into a dashboard tab body (groups → ✓/✗ rows + notes, then
 * an FAQ of Q→A pairs).
 * @param {HTMLElement} container The tab body (already cleared by the caller).
 */
export function renderGuide(container) {
  try {
    if (!container) return;
    injectGuideStyle();
    const wrap = ce("div", "emig-guide");
    for (const g of GUIDE) {
      wrap.appendChild(ce("div", "emig-guide-h", g.title));
      renderGuideSection(wrap, g);
    }
    container.appendChild(wrap);
  } catch (_) {
    /* a guide-render failure must never break the dashboard */
  }
}
