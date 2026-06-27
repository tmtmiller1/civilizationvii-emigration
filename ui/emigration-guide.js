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
      { q: "Unhappiness / low yields", yes: true, note: "The main peacetime driver. Happiness is still the single biggest factor, but after the 1.4.1 rebalance a city's per-capita yields carry a real share of the decision too, so both an unhappy city AND a low-yield one bleed people, and a city that's both empties fastest. Unhappy settlements are doubly hit: 1.4.1 also suppresses their yields, which the prosperity score reads directly." },
      { q: "War damage to the districts", yes: true, note: "Damage to ANY of the city's districts (its center or an outer urban/rural quarter) is read from game state (fog-independent) and scales the war penalty. An assault that wrecks only the city's edge still registers, even while the center reads pristine." },
      { q: "Being besieged or attacked", yes: true, note: "Per-city: only the besieged city itself sheds people. Fires when ANY of its districts is besieged or has been overrun (captured/contested), even before its health drops. It is NOT a civ-wide score; a civ at war elsewhere keeps its unaffected cities." },
      { q: "Attacked by a city-state / Independent Power", yes: true, note: "Same per-city conflict pressure as a major-civ war: an Independent/minor raid on a city still drives THAT city's people out, attacker-agnostic." },
      { q: "Pillaged tiles in the city's borders", yes: true, note: "Pillaged improvements on the city's own plots count as violence in its borders (polled, fog-independent); more pillaged tiles means more pressure." },
      { q: "Starvation", yes: true, note: "A city with negative NET food is flagged starving: most of its people flee to better-fed cities, and, because famine kills those who can't escape in time, some also DIE (a death, not a migration). It clears once net food recovers." },
      { q: "Plague / disease", yes: true, note: "An infected city loses people, and migrants leaving it can carry the plague to their destination." },
      { q: "Natural disasters (floods, volcanoes)", yes: true, note: "Environmental-disaster distress adds a per-city penalty on a capped sliding scale, scaled by the disaster's real impact (its yield/damage tables, not the weak Severity flag). Like any lethal crisis it both displaces people AND kills some who can't flee. An eruption/flood strikes every city around its epicenter, so a volcano on unowned border terrain still hits the neighboring cities' people." },
      { q: "Overcrowding in a tall city", yes: true, note: "Urban population above a threshold adds pressure (the overcrowding term); the per-leader tuning can soften it via the overcrowding discount." },
      { q: "Empire-wide war weariness", yes: true, note: "A civ ground down by a prolonged war carries empire-wide war-weariness unhappiness (1.4.1), which adds a modest push to ALL its settlements, on top of the per-city violence at the front lines." }
    ]
  },
  {
    title: "What ATTRACTS people to a city",
    rows: [
      { q: "Higher prosperity (food, production, gold, science, culture)", yes: true, note: "Each city scores its per-capita weighted food, production, gold, science and culture; a higher score than nearby cities pulls migrants in." },
      { q: "Higher happiness", yes: true, note: "The biggest single pull factor. It's judged against the world average, so a city happier than its neighbours draws migrants. After the 1.4.1 rebalance it no longer drowns everything else out, so strong yields pull alongside it. 1.4.1's five happiness stages (Unhappy through Ecstatic) feed this directly." },
      { q: "A civilization in a Celebration (Golden Age)", yes: true, note: "1.4.1 celebrations are scarcer and feed Tourism, so a civ in a Celebration is a noticeably stronger draw for the few turns it lasts." },
      { q: "A happiness-friendly government", yes: true, note: "Governments whose passives reward happy settlements make a civ's cities a bit more attractive. The effect is deliberately small: most of a government's impact already reaches the model through the happiness and yields it produces." },
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
      { q: "War alone can empty a city to zero", yes: false, note: "No. War DISPLACEMENT is capped (siegeLossCapPct), and a city can never drop below its rural floor. A prolonged crisis (war / siege / famine) also kills some beyond the displacement cap, so a city can be devastated, but only an actual capture empties or transfers it." },
      { q: "Lethal crises kill, not just displace", yes: true, note: "War, siege, disaster, and famine kill SOME people who can't escape in time, even when there's somewhere to flee; those are deaths (a separate Losses tally), not migrations. Ordinary prosperity/unhappiness emigration NEVER kills; people just leave for better cities." }
    ]
  },
  {
    title: "Identity, integration & return",
    rows: [
      { q: "Each settlement remembers where its people came from", yes: true, note: "Every settlement keeps a running ethnic composition: the share of its population by the civilization each person descends from. A captured city keeps the origins of the people already living there. The Ethnic Composition lens (Shift+E) paints it as a per-tile mosaic, the dense urban core in the dominant origin's colour, minorities clustered on the rural fringe, with each origin's share preserved across the tiles, so a city's demographic history reads at a glance." },
      { q: "Newcomers integrate into their host over time", yes: true, note: "Migrants gradually take on their host civilization's identity, so a peaceful, settled city slowly absorbs a diaspora over many turns and the lens shows its colours blending toward the owner's. On by default; switchable under Options." },
      { q: "War or unrest keeps a minority distinct", yes: true, note: "Integration stalls while the host is at war with a minority's homeland, and slows in a city in unrest, so a contested or resentful city holds a distinct, unintegrated community that keeps its colour on the lens." },
      { q: "Diasporas return home when the homeland recovers", yes: true, note: "Return migration: once a people's original civilization is at peace with their host and prospering again, a fraction of those living abroad set out for home over time, moving real population back. A slow ebb over many turns, never a snap-back, and only while relations stay peaceful. On by default; switchable under Options." },
      { q: "Refugee waves can prompt a player decision", yes: true, note: "Occasionally, when a real upheaval (a neighbour's conquest spree, or a plague crisis) sends a large wave toward your lands, a short decision appears: welcome them, settle them on the frontier, or turn them away. Light effects, rare by design (a few times an age at most), and switchable under Options ▸ refugee decisions." }
    ]
  },
  {
    title: "Scope & limits",
    rows: [
      { q: "Change AI strategy or decisions", yes: false, note: "No. Only the movement of population is layered on; the base game's AI decision-making is untouched." },
      { q: "Replace or overwrite base-game files", yes: false, note: "No. Additive only; no base-game files are replaced or overwritten." },
      { q: "Move population instantly across the map", yes: false, note: "No. Distance-penalized; people move to nearby better settlements, not across the world in one step." },
      { q: "Let you directly place or pick individual migrants", yes: false, note: "No. Flows are simulated from prosperity, war, and policy; you shape them with yields and stances, not by hand." },
      { q: "Let one civ snowball the whole map's people", yes: false, note: "No. Three brakes compound: the field-relative prosperity model (every city is judged against the world average, so no single magnet's pull runs away without limit), a congestion headwind on a civ digesting a fresh surge of arrivals, and a self-correcting anti-snowball brake: the further a civ's population runs ahead of the world average, the stronger the headwind against further migration INTO it (it never slows a leader's own people leaving, only newcomers piling in). The 1.4.1 rebalance was snowball-checked and, by judging cities against a less-crushed field, actually narrows the gap that feeds a leader rather than widening it. All three brakes are tunable under Options ▸ Mods ▸ Emigration; the anti-snowball strength has Off / gentle / standard / strong settings." }
    ]
  },
  {
    title: "FAQ: How migration works",
    faq: [
      { q: "Where do people go when they leave?", a: "To the nearest higher-prosperity settlement they can reach. Migration is distance-penalized, so people move regionally, not to the single best city on the map." },
      { q: "Where do war refugees flee?", a: "Away from the nearest enemy, preferring their own civilization first, then neutral civs, and the attacker last." },
      { q: "How many people move, and how often?", a: "War- and disaster-driven refugees flee every turn; voluntary (prosperity/unhappiness) migration is more gradual, resting briefly between moves. Each civilization migrates on its own per-turn budget that scales with its size and active crises, so simultaneous wars never throttle one another. Counts show as scaled people or raw population points (your choice), and the whole sim runs on a turn interval you can lengthen in Options for large saves." },
      { q: "Do people die, or just move away?", a: "Both, depending on the cause. Ordinary (prosperity / unhappiness) migration NEVER kills; people simply leave for better cities. But a LETHAL crisis (war, siege, disaster, or famine) also kills some who can't escape in time: those deaths leave the world entirely (shown in the Losses/deaths tally, separate from refugees), even while the rest flee. So a city under crisis loses people two ways at once: most flee, a minority die." }
    ]
  },
  {
    title: "FAQ: War, conquest & recovery",
    faq: [
      { q: "What happens when I capture or lose a city?", a: "Its existing residents stay coded to the civ they came FROM (the prior owner), not to you. The Ethnicity lens paints the city's tiles in that origin's colour (a per-tile mosaic), and on the network diagram their dots keep the old civ's colour and name; only NEW population born after the capture counts as yours. So a conquered city carries real origin history that fades only as it regrows and its newcomers integrate. War can shrink it, but only an actual capture transfers it." },
      { q: "My city shrank from size 12 to 5 in a war, will it grow back?", a: "Yes. War displacement only moves population points; it never razes districts or deletes buildings (only the base game's own conquest does that). You keep the larger city's infrastructure with fewer people, and it regrows two ways, both additive: the base game's normal food growth (untouched), and immigration: once the fighting stops and its prosperity recovers, the surviving high-yield buildings/districts make it an attractive destination, so migrants move in and population is added back." },
      { q: "Do the same refugees who fled come back?", a: "Some now do, once the homeland recovers. Most resettle permanently where they fled, but Return Migration adds a homeward pull: when a diaspora's original civilization is at peace with their host and faring well again, a fraction set out for home over time, moving real population back. It's a slow ebb over many turns, never a snap-back, and it only flows while relations stay peaceful. A war-torn city still regrows mainly from births and new immigrants; returns are an additional, gentler source once peace and prosperity return. You can switch return migration off in Options." },
      { q: "Does repairing pillaged tiles restore the lost population?", a: "No. Pillaged tiles only apply pressure (a prosperity penalty that pushes people out). Repairing them removes that pressure, so the city stops bleeding people and recovers prosperity faster, but a repair never adds a population point back. It's a recovery accelerator, not a restore button." },
      { q: "How far can a war shrink a city?", a: "War DISPLACEMENT (people fleeing) is capped at 60% (siegeLossCapPct) of the city's population when the siege began; the remnant \"digs in\" and can't be pushed out further. A sustained siege also kills some who can't escape, and those deaths can take a city below that displacement cap, but never below its rural floor. Only an actual capture takes the city." },
      { q: "Fastest way to recover a war-torn city?", a: "Relieve the cause so it flips from a net exporter back to a magnet: make peace (violence decays in ~2-3 turns, lifting the war penalty), repair pillaged tiles (removes the lingering pressure), and raise happiness (the biggest prosperity factor: it both stops unhappiness emigration and pulls migrants in)." }
    ]
  },
  {
    title: "FAQ: Migrants in transit",
    faq: [
      { q: "What happens to a migrant while they're traveling between cities?", a: "Migration isn't instant; it has transit lag. The migrant leaves the source the turn they depart: its rural population point (and that worker's tile yields) is removed right away. They then spend the transit time belonging to NO city, working no tiles, producing nothing, but also costing no upkeep, gold, or happiness. They're added to the destination, which only then gains the yields and pays its one-time assimilation cost, when they ARRIVE. Transit is 1-4 turns, scaled by distance (~5 hexes per turn, capped at 4); refugees take at least 1 (they camp)." },
      { q: "How big is the economic impact of migrants in transit?", a: "Small and self-correcting. Per migrant it's tiny: one rural point's worth of yields suspended for ~1-2 turns (4 at most), and the source was losing that worker anyway, so only the delay before the destination picks them up is truly lost output. In aggregate it's roughly (migrants currently traveling) x (their per-pop yields): a rounding error in peacetime, but a noticeable pool of temporarily-idle population during a big war, since refugees flee every turn and more are in transit at once. It always drains back toward zero within a few turns of migration slowing. This transit lag is also why Emigration can tick up before Immigration catches up: the departure counts now, the arrival lands a few turns later. It does NOT distort Net Migration, which only counts settled cross-civ moves." }
    ]
  },
  {
    title: "FAQ: The 1.4.1 update",
    faq: [
      { q: "How does the mod use 1.4.1's happiness, government, and celebration changes?", a: "It reads them directly. Happiness is now a five-stage scale (Angry, Unhappy, Happy, Joyous, Ecstatic) that feeds a city's attractiveness; a civilization in a Celebration (Golden Age) becomes a stronger draw while it lasts; a government's happiness-friendly passives nudge its cities up a little; and empire-wide war weariness adds a push to a war-worn civ's settlements. 1.4.1 also makes unhappy cities lose more of their yields, which the per-capita prosperity score already picks up." },
      { q: "Did 1.4.1 change how strongly happiness drives migration?", a: "Yes, and the mod was rebalanced for it. Happiness is still the single biggest factor, but it no longer drowns out a city's economy: yields now carry a meaningful share of the decision, so raising a city's production, gold, or food visibly helps it keep and attract people. The rebalance was checked to make sure it doesn't let any civilization snowball, and it can be reverted to the exact pre-1.4.1 behaviour with one Options toggle." }
    ]
  },
  {
    title: "FAQ: Reading the dashboard",
    faq: [
      { q: "What do the \"people\" numbers mean, and why are they realistic now?", a: "Civ's population is abstract (1, 2, 3…). The mod turns each point into a representative head-count using Civilization VII's OWN per-era growth math, so the figure reads at a believable historical scale for whatever age you're in: a point leaving a town in Antiquity is a few thousand people, the same point in a sprawling Modern metropolis is far more, and the largest Modern cities reach the real 10–38 million megacity range. It changes smoothly at each age boundary (no sudden jump), two same-size settlements never read identically (the small spread follows their real happiness and urban/rural mix), and the figures match the Demographics mod exactly. Switch between scaled people and the raw Civ numbers any time with the unit toggle." },
      { q: "Does population keep scaling if I play past the end of the game?", a: "Yes. If you keep going on \"one more turn\" past the natural end, megacities keep growing into a speculative future instead of freezing at the historical cap (bounded so they can't run away)." },
      { q: "Can I see refugees a civ took IN, not just sent out?", a: "Yes. The Graphs tab has both: Refugees Out (people a civ displaced by war/disaster/conquest) and Refugees In (displaced people it resettled). Each line's tooltip splits the total by cause." },
      { q: "Why did a city suddenly lose a lot of people?", a: "An on-screen toast names the cause (war, disaster, unhappiness, etc.), and the per-city readout breaks down its current pressures. The Notifications tab now keeps the full event ledger, including the narrative Chronicle entries, so you can click any row to see what caused it, where it left, and where the people went." },
      { q: "Can I see which specific war or disaster drove it?", a: "Yes. On the Causes tab, each broad cause (War, Disaster, Unhappiness…) drills down to the SPECIFIC events behind it (a named war, a particular eruption/flood, or the active age crisis), with each event's emigration and deaths. An age crisis is attributed to itself: an Invasion crisis shows under War, a Plague crisis under Disaster, a Loyalty/Revolt crisis under Unhappiness, so you can see exactly how much of a civ's movement a single crisis caused. A war refugee event names both sides when you've met them, and reads \"<Civ> vs. an unmet civilization\" when you have not, so a war is always named without revealing a civ you haven't met." }
    ]
  },
  {
    title: "FAQ: Ethnicity, the Chronicle & decisions",
    faq: [
      { q: "What is the Ethnic Composition lens showing?", a: "Each settlement painted by where its people came from. Rather than one flat colour per city, every owned tile is shaded by an origin and by how densely it's populated: the urban core reads vivid in the dominant origin's colour, worked rural tiles fainter, and minorities cluster on the fringe. Minority and diaspora tiles stay clearly coloured rather than fading out, so even a small foreign community reads on the map, while a genuinely single-origin city still correctly shows one colour. Each origin's share of the population is preserved across the tiles, and a city founded by one civilization, half-emptied by war, then captured and regrown shows the captor's colour strengthening over time, the demographic shift, on the map. Press Shift+E to toggle it." },
      { q: "What is the Migration Chronicle?", a: "A written history of the world's great migrations, recorded as it happens. As large waves move, it captures the moments worth keeping, a city emptied by war or disaster, a diaspora taking root far from home, a people returning once their homeland recovered, each as a short line of prose. Each line is drawn from the settlement's real surroundings — a diaspora settling \"by the harbour\" or \"beyond the granaries\" only when that city actually has a coast or a granary — so the prose never invents a feature the place doesn't have, and it reads at the city's edge, exactly where the lens paints the newcomers. These appear in the Notifications tab as \"Chronicle\" entries, alongside the per-event detail, so the whole story lives in one place." },
      { q: "A pop-up asked me what to do about refugees, what is that?", a: "A refugee decision. When a real upheaval (a neighbour taking several cities in a short span, or a plague crisis) sends a wave toward your lands, you're occasionally asked how to receive them: welcome them in (a small gold cost, and they settle among you and, in time, become your people), settle them on the frontier, or turn them away. The effects are light and the event is rare, a few times an age at most. Turn the whole thing off under Options ▸ Mods ▸ Emigration ▸ refugee decisions." },
      { q: "How do I turn the new identity systems on or off?", a: "All three are on by default and each has its own switch under Options ▸ Mods ▸ Emigration: \"ethnic integration\" (newcomers drifting toward the host identity), \"return migration\" (diasporas going home), and \"refugee decisions\" (the occasional pop-up). The Ethnic Composition lens is always available, and Chronicle entries are recorded in the Notifications tab." }
    ]
  }
];

const STYLE_ID = "emig-guide-style";
const CSS =
  ".emig-guide{display:flex;flex-direction:column;width:100%;}" +
  // Pill row to switch the Guide between the "What counts" reference matrix and the FAQ page.
  ".emig-guide-pills{display:flex;flex-wrap:wrap;gap:0.4rem;justify-content:center;margin:0.2rem 0 0.5rem;}" +
  ".emig-guide-pill{cursor:pointer;padding:0.16rem 0.9rem;border-radius:0.9rem;font-size:1.0rem;" +
  "border:0.0555rem solid rgba(229,210,172,0.35);color:#e5d2ac;background:rgba(229,210,172,0.06);}" +
  ".emig-guide-pill.active{background:#f3c34c;color:#1c1408;border-color:#f3c34c;font-weight:bold;}" +
  ".emig-guide-body{display:flex;flex-direction:column;width:100%;}" +
  // Two balanced columns on a wide window (shorter line lengths, less endless scroll); they wrap to a
  // single column when the window is too narrow to fit both.
  ".emig-guide-cols{display:flex;flex-wrap:wrap;gap:0 2.5rem;align-items:flex-start;width:100%;}" +
  ".emig-guide-col{flex:1 1 26rem;min-width:0;display:flex;flex-direction:column;}" +
  ".emig-guide-h{font-family:\"TitleFont\";text-transform:uppercase;letter-spacing:0.05rem;color:#f3c34c;font-size:1.15rem;margin:0.6rem 0 0.1rem;border-bottom:0.0555rem solid rgba(201,162,76,0.3);padding-bottom:0.2rem;}" +
  // A matrix row stacks vertically: the icon + bold question on the top line, the explanation wrapping
  // full-width beneath it (instead of a cramped second column), with a clearer divider between rows.
  ".emig-guide-row{display:flex;align-items:flex-start;gap:0.7rem;padding:0.55rem 0.1rem;border-top:0.0555rem solid rgba(201,162,76,0.22);}" +
  ".emig-guide-ic{flex:0 0 1.6rem;font-weight:bold;text-align:center;font-size:1.3rem;line-height:1.3;}" +
  ".emig-guide-ic.y{color:#7fd08a;}.emig-guide-ic.n{color:#e0726a;font-size:1.55rem;line-height:1.05;}" +
  ".emig-guide-rowtext{display:flex;flex-direction:column;gap:0.2rem;flex:1 1 0;min-width:0;}" +
  ".emig-guide-q{color:#f6e7c0;font-weight:bold;font-size:1.18rem;line-height:1.3;}" +
  ".emig-guide-note{opacity:0.9;font-size:1.05rem;line-height:1.45;color:#e5d2ac;}" +
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
    const text = ce("div", "emig-guide-rowtext");
    text.appendChild(ce("div", "emig-guide-q", r.q));
    if (r.note) text.appendChild(ce("div", "emig-guide-note", r.note));
    row.appendChild(text);
    wrap.appendChild(row);
  }
}

/**
 * A section's rough height (heading + items), for balancing the two columns.
 * @param {*} g A guide section.
 * @returns {number} The weight.
 */
function sectionWeight(g) {
  const items = Array.isArray(g.rows) ? g.rows.length : Array.isArray(g.faq) ? g.faq.length : 0;
  return items + 1; // +1 for the heading itself
}

/**
 * Split sections into two order-preserving columns: fill the first column to about half the total
 * weight, then the rest into the second (so you read the left column top-to-bottom, then the right).
 * @param {*[]} sections The view's sections.
 * @returns {*[][]} [left, right] section lists.
 */
function splitColumns(sections) {
  const total = sections.reduce((a, g) => a + sectionWeight(g), 0);
  /** @type {*[][]} */
  const cols = [[], []];
  let acc = 0;
  for (const g of sections) {
    const left = !cols[0].length || acc < total / 2;
    cols[left ? 0 : 1].push(g);
    if (left) acc += sectionWeight(g);
  }
  return cols;
}

/**
 * Render one column's sections (each a heading + its matrix/FAQ body) into a column element.
 * @param {*[]} sections The sections for this column.
 * @returns {HTMLElement} The column.
 */
function buildGuideColumn(sections) {
  const col = ce("div", "emig-guide-col");
  for (const g of sections) {
    col.appendChild(ce("div", "emig-guide-h", g.title));
    renderGuideSection(col, g);
  }
  return col;
}

/**
 * Render the guide sections of one view into `body` as two balanced columns (so the wide window isn't
 * one long single-column scroll with over-long lines), clearing it first.
 * @param {HTMLElement} body The body element.
 * @param {*[]} sections The GUIDE sections for the active view.
 */
function renderGuideView(body, sections) {
  while (body.firstChild) body.removeChild(body.firstChild);
  const [left, right] = splitColumns(sections);
  const cols = ce("div", "emig-guide-cols");
  cols.appendChild(buildGuideColumn(left));
  if (right.length) cols.appendChild(buildGuideColumn(right));
  body.appendChild(cols);
}

/**
 * Render the Guide into a dashboard tab body as two pill-toggled pages, "What counts" (the ✓/✗
 * reference matrices) and "FAQ" (the Q→A page), so neither grows into one endless scroll. Defaults
 * to the reference page; the FAQ page is a click away.
 * @param {HTMLElement} container The tab body (already cleared by the caller).
 */
export function renderGuide(container) {
  try {
    if (!container) return;
    injectGuideStyle();
    const wrap = ce("div", "emig-guide");
    const views = [
      { id: "ref", label: "What counts", sections: GUIDE.filter((g) => Array.isArray(g.rows)) },
      { id: "faq", label: "FAQ", sections: GUIDE.filter((g) => Array.isArray(g.faq)) }
    ];
    const pills = ce("div", "emig-guide-pills");
    const body = ce("div", "emig-guide-body");
    /** @type {{el:HTMLElement, id:string}[]} */
    const pillEls = [];
    const select = (/** @type {string} */ id) => {
      const v = views.find((x) => x.id === id) || views[0];
      for (const pe of pillEls) pe.el.classList.toggle("active", pe.id === v.id);
      renderGuideView(body, v.sections);
    };
    for (const v of views) {
      const pill = ce("div", "emig-guide-pill", v.label);
      pill.addEventListener("click", () => select(v.id));
      pillEls.push({ el: pill, id: v.id });
      pills.appendChild(pill);
    }
    wrap.appendChild(pills);
    wrap.appendChild(body);
    select("ref");
    container.appendChild(wrap);
  } catch (_) {
    /* a guide-render failure must never break the dashboard */
  }
}
