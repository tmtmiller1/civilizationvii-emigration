// emigration-guide.js
//
// The "What counts" reference: a yes/no matrix of common questions about what does and doesn't
// cause, attract, or participate in migration, kept in step with the mod's actual DEFAULT behavior.
// Rendered as flexbox rows (GameFace lays out neither <table> nor CSS grid) for the dashboard's
// Guide tab; the same matrix is mirrored in the README. Self-contained (own style + DOM) so the
// line-capped render core (emigration-views.js) only has to wire it in. Every visible string is
// localized at render through a stable, position-derived LOC key (LOC_EMIG_GUIDE_<section>_...), with
// the English text below kept in code as the fallback.

import { loc } from "/emigration/ui/emigration-loc.js";

const YES = "✓"; // U+2713 CHECK MARK (renders in the GameFace body/title fonts)
// U+00D7 MULTIPLICATION SIGN, not U+2717 BALLOT X: the ballot-X glyph is absent from the GameFace
// fonts (it rendered blank, so "not covered" rows showed nothing), while × is present everywhere.
// Styled bold + larger via `.emig-guide-ic.n` so it reads as a clear red X.
const NO = "×";

/**
 * @typedef {Object} GuideSection
 * @property {string} title @property {number} [_i] Stable index (for LOC keys).
 * @property {{q:string, yes:boolean, note:string}[]} [rows] @property {{q:string, a:string}[]} [faq]
 */
/** @type {GuideSection[]} */
const GUIDE = [
  {
    title: "What makes people LEAVE a city",
    rows: [
      { q: "Unhappiness / low yields", yes: true, note: "Main peacetime driver; happiness weighs most, low per-capita yields add to it (1.4.1 also suppresses unhappy cities' yields, which the score reads)." },
      { q: "War damage to the districts", yes: true, note: "Damage to any district (center or outer quarter), read from game state (fog-independent), scales the war penalty; edge damage counts even while the center reads pristine." },
      { q: "Being besieged or attacked", yes: true, note: "Only the besieged city itself; fires when any of its districts is besieged or overrun, before health drops. Not civ-wide." },
      { q: "Attacked by a city-state / Independent Power", yes: true, note: "Same conflict pressure as a major-civ war; attacker-agnostic." },
      { q: "Pillaged tiles in the city's borders", yes: true, note: "Damaged improvements on the city's own plots (polled, fog-independent); more pillage, more pressure." },
      { q: "Starvation", yes: true, note: "Negative net food: most flee to better-fed cities, some die (famine kills those who can't escape), until net food recovers." },
      { q: "Plague / disease", yes: true, note: "An infected city loses people; migrants leaving it can carry the plague onward." },
      { q: "Natural disasters (floods, volcanoes)", yes: true, note: "A capped per-city penalty scaled by the disaster's real impact; it both displaces and kills some. A strike hits every city around its epicenter, so an eruption on unowned terrain still hits neighbors." },
      { q: "Overcrowding in a tall city", yes: true, note: "Urban population over a threshold; softened by the per-leader overcrowding discount." },
      { q: "Empire-wide war weariness", yes: true, note: "A modest empire-wide push (1.4.1 war weariness), on top of the per-city violence at the front." }
    ]
  },
  {
    title: "What ATTRACTS people to a city",
    rows: [
      { q: "Higher prosperity (food, production, gold, science, culture)", yes: true, note: "Per-capita weighted food, production, gold, science, and culture above nearby cities." },
      { q: "Higher happiness", yes: true, note: "The biggest pull; judged against the world average and (in the shaped model) saturating, so no runaway. Feeds 1.4.1's five stages." },
      { q: "A civilization in a Celebration (Golden Age)", yes: true, note: "A civ in a Celebration is a stronger draw for the few turns it lasts." },
      { q: "A happiness-friendly government", yes: true, note: "A small nudge; most of a government's effect already reaches the model through happiness and yields." },
      { q: "A Pro-Immigration stance policy", yes: true, note: "Raises inbound pull and earns Influence (trading some retention)." },
      { q: "An Open Borders agreement", yes: true, note: "Adds a cross-civ pull bonus." },
      { q: "Being nearby", yes: true, note: "Distance-penalized; people move to nearby better settlements." }
    ]
  },
  {
    title: "Who participates (sends / receives population)",
    rows: [
      { q: "Your civilization", yes: true, note: "Sends and receives like any major civ." },
      { q: "Towns, not just cities", yes: true, note: "Participate the same as cities." },
      { q: "Your own cities trade people (internal migration)", yes: true, note: "People also move within a civ; the dashboard colours internal moves separately." },
      { q: "Other major civilizations", yes: true, note: "All simulated from turn one, met or not, so the map isn't exploration-biased." },
      { q: "City-states / minor civs / Independent Powers", yes: false, note: "Don't send or receive, though attacking a major civ's city still drives that city's people out." },
      { q: "Unmet civilizations", yes: true, note: "Simulated, masked in the UI by default until you widen the visibility policy." }
    ]
  },
  {
    title: "Behavior",
    rows: [
      { q: "Migration between different civilizations", yes: true, note: "Crosses borders, throttled by borders, distance, and each side's stance." },
      { q: "Migration driven by distant AI-vs-AI wars", yes: true, note: "Fog-independent: reads game state, so a far-off war displaces people like one you can see." },
      { q: "An Anti-Immigration stance retains your people", yes: true, note: "More retention and Production, at the cost of Influence." },
      { q: "Closed Borders reduces cross-civ flow", yes: true, note: "Far fewer cross without an Open Borders agreement." },
      { q: "Population & yields actually change (not just a display)", yes: true, note: "Real per-turn gameplay writes, not a cosmetic overlay." },
      { q: "Any layer can be tuned or switched off", yes: true, note: "Presets + ~57 knobs under Options ▸ Mods ▸ Emigration; all on by default." },
      { q: "Migrants arrive instantly", yes: false, note: "No; they travel, arriving up to a few turns later." },
      { q: "Absorbing migrants is free", yes: false, note: "No; a temporary, decaying happiness + gold cost." },
      { q: "War alone can empty a city to zero", yes: false, note: "No. Displacement is capped (siegeLossCapPct) above the rural floor. Crisis deaths are separate and unfloored: a long crisis can wear rural population down (gently at first, building over time), but only rural, so the urban core and settlement survive until a capture." },
      { q: "Lethal crises kill, not just displace", yes: true, note: "War, siege, disaster, and famine kill some who can't escape (a separate Losses tally); ordinary prosperity/unhappiness migration never kills." }
    ]
  },
  {
    title: "Identity, integration & return",
    rows: [
      { q: "Each settlement remembers where its people came from", yes: true, note: "A running composition by the origin civ of its people, painted as a per-tile mosaic (Shift+E); kept through capture, so demographic history reads at a glance." },
      { q: "Newcomers integrate into their host over time", yes: true, note: "Migrants drift toward the host identity over many turns; the lens blends toward the owner. On by default." },
      { q: "War or unrest keeps a community distinct", yes: true, note: "Integration stalls at war with a diaspora's homeland and slows in unrest, holding a distinct community." },
      { q: "Diasporas return home when the homeland recovers", yes: true, note: "Once a homeland is at peace with the host and prospering, a fraction return over time, moving real population. A slow ebb, never a snap-back. On by default." },
      { q: "Refugee waves can prompt a player decision", yes: true, note: "A rare modal on a conquest spree or plague crisis: welcome them, settle the frontier, or turn away. Light effects, a few times an age. On by default (Options ▸ refugee decisions)." }
    ]
  },
  {
    title: "Scope & limits",
    rows: [
      { q: "Change AI strategy or decisions", yes: false, note: "No; only population movement is layered on, AI decisions untouched." },
      { q: "Replace or overwrite base-game files", yes: false, note: "No; additive only." },
      { q: "Move population instantly across the map", yes: false, note: "No; distance-penalized." },
      { q: "Let you directly place or pick individual migrants", yes: false, note: "No; flows are simulated, shaped by yields and stances." },
      { q: "Let one civ snowball the whole map's people", yes: false, note: "No. Three brakes: field-relative scoring (judged against the world average), a congestion headwind on fresh arrivals, and an anti-snowball headwind on cross-civ inflow into a runaway leader (never its own outflow). All tunable (anti-snowball: Off / gentle / standard / strong)." }
    ]
  },
  {
    title: "FAQ: How migration works",
    faq: [
      { q: "Where do people go when they leave?", a: "The nearest higher-prosperity settlement they can reach; migration is regional, not to the single best city on the map." },
      { q: "Where do war refugees flee?", a: "Away from the nearest enemy: own civ first, then neutrals, attacker last." },
      { q: "How many people move, and how often?", a: "War/disaster refugees flee every turn; voluntary migration is gradual, resting between moves. Each civ has its own per-turn budget (scaled by size and crises), so simultaneous wars don't throttle one another. Counts show as people or raw points; the sim runs on a turn interval you can lengthen for large saves." },
      { q: "Do people die, or just move away?", a: "Both. Ordinary (prosperity/unhappiness) migration never kills. A lethal crisis (war, siege, disaster, famine) also kills some who can't escape (a separate Losses tally, distinct from refugees), building gradually and easing if it lifts. A refugee can also perish in transit if the destination is captured, razed, or stays full." }
    ]
  },
  {
    title: "FAQ: War, conquest & recovery",
    faq: [
      { q: "What happens when I capture or lose a city?", a: "Its residents stay coded to the civ they came from; the lens and network dots keep that origin's colour, and only new post-capture population counts as yours. So a conquered city carries real origin history that fades as it regrows. War can shrink it, but only a capture transfers it." },
      { q: "My city shrank from size 12 to 5 in a war, will it grow back?", a: "Yes. Displacement only moves population points, never razes districts or deletes buildings (only base-game conquest does). You keep the infrastructure with fewer people, and it regrows via normal food growth and immigration once fighting stops and prosperity recovers." },
      { q: "Do the same refugees who fled come back?", a: "Some do, via Return Migration: once a diaspora's homeland is at peace with the host and faring well, a fraction set out for home over time, moving real population back. A slow ebb, never a snap-back, only while relations stay peaceful. Off in Options." },
      { q: "Does repairing pillaged tiles restore the lost population?", a: "No. Pillaged tiles apply pressure; repairing them removes it (the city stops bleeding and recovers faster) but never adds a population point back." },
      { q: "How far can a war shrink a city?", a: "Displacement is capped at 60% (siegeLossCapPct) of the population when the siege began; the remnant digs in. Crisis deaths are separate and uncapped and can wear rural population past that (building gradually, easing if the siege lifts), but the urban core stands until a capture." },
      { q: "Fastest way to recover a war-torn city?", a: "Flip it from net exporter back to magnet: make peace (violence decays in ~2-3 turns), repair pillaged tiles, and raise happiness (the biggest prosperity factor)." }
    ]
  },
  {
    title: "FAQ: Migrants in transit",
    faq: [
      { q: "What happens to a migrant while they're traveling between cities?", a: "Departure removes the source's rural point (and that tile's yields) immediately. In transit the migrant belongs to no city (no yields, no upkeep). The destination gains them and pays the one-time integration cost only on arrival. Transit is 1-4 turns (~5 hexes/turn, capped at 4); refugees take at least 1. If the destination is full that turn they wait and retry; if it's captured/razed or still full after several turns, they perish in transit (a loss, not an arrival)." },
      { q: "How big is the economic impact of migrants in transit?", a: "Small and self-correcting: roughly (migrants traveling) x their per-pop yields, a rounding error in peacetime, a larger idle pool during a big war, draining to zero within a few turns of migration slowing. It's why Emigration can tick up before Immigration catches up, but it doesn't distort Net Migration (settled cross-civ moves only)." },
      { q: "Is there a limit on how many people one city gains or loses per turn?", a: "Yes, both ways: at most a few points lost (so a besieged city bleeds steadily) and a few gained (so no boomtown swallows dozens at once); overflow waits in transit. Both caps scale with the intensity preset (Low/Medium/High) and are individually tunable. Deaths are a separate channel, not counted against either." }
    ]
  },
  {
    title: "FAQ: The 1.4.1 update",
    faq: [
      { q: "How does the mod use 1.4.1's happiness, government, and celebration changes?", a: "It reads them: the five happiness stages (Angry to Ecstatic) feed attractiveness, a Celebration is a stronger draw while it lasts, happiness-friendly governments nudge up, and war weariness pushes a war-worn civ. Unhappy cities also lose yields, which the score reads." },
      { q: "Did 1.4.1 change how strongly happiness drives migration?", a: "Yes, and the mod was rebalanced: happiness is still biggest but no longer drowns out yields, so raising production, gold, or food visibly helps. Snowball-checked, and revertible to pre-1.4.1 with one Options toggle." }
    ]
  },
  {
    title: "FAQ: Reading the dashboard",
    faq: [
      { q: "What do the \"people\" numbers mean, and why are they realistic now?", a: "Civ population is abstract (1, 2, 3…); the mod converts each point to a head-count via Civ VII's own per-era growth math, so it reads at a believable scale for the age: a few thousand in Antiquity, up to the real 10-38 million range for the largest Modern cities. Smooth at each age boundary, two same-size cities never read identically (the spread follows their happiness and urban/rural mix), and it matches Demographics exactly. Toggle to raw Civ numbers any time." },
      { q: "Does population keep scaling if I play past the end of the game?", a: "Yes; on \"one more turn\" past the natural end, megacities keep growing (bounded) instead of freezing at the historical cap." },
      { q: "Can I see refugees a civ took IN, not just sent out?", a: "Yes: Refugees Out (displaced by war/disaster/conquest) and Refugees In (resettled), each tooltip split by cause." },
      { q: "Why did a city suddenly lose a lot of people?", a: "A toast names the cause and the per-city readout breaks down its pressures; the Notifications tab keeps the full event ledger and Chronicle, click any row for detail." },
      { q: "Can I see which specific war or disaster drove it?", a: "Yes: the Causes tab drills each broad cause down to the named events (a war, an eruption/flood, or the active age crisis) with emigration and deaths. An age crisis is attributed to itself (Invasion under War, Plague under Disaster, Loyalty/Revolt under Unhappiness). An unmet belligerent reads \"<Civ> vs. an unmet civilization\"." }
    ]
  },
  {
    title: "FAQ: Ethnicity, the Chronicle & decisions",
    faq: [
      { q: "What is the Ethnic Composition lens showing?", a: "Each settlement painted by where its people came from: a per-tile mosaic weighted by density, the core vivid in the dominant origin's colour, diaspora tiles staying clearly coloured so even a small community reads (a single-origin city still shows one colour). It shows demographic shift over time, e.g. a captor's colour strengthening as a conquered city regrows. Shift+E to toggle." },
      { q: "What is the Migration Chronicle?", a: "A written history of the great migrations as they happen (a city emptied by war, a diaspora taking root, a people returning home), each a short line drawn from the city's real surroundings, so it never invents a feature the place lacks. Appears in the Notifications tab as Chronicle entries." },
      { q: "A pop-up asked me what to do about refugees, what is that?", a: "A refugee decision: when an upheaval (a conquest spree or plague crisis) sends a wave your way, you choose to welcome them (small gold cost, they settle and integrate), settle the frontier, or turn them away. Light effects, rare. Off under Options ▸ Mods ▸ Emigration ▸ refugee decisions." },
      { q: "How do I turn the new identity systems on or off?", a: "Each has its own switch under Options ▸ Mods ▸ Emigration (all on by default): ethnic integration, return migration, and refugee decisions. The lens is always available; Chronicle entries log to Notifications." }
    ]
  },
  {
    title: "FAQ: Cultural Enclaves",
    faq: [
      { q: "What is a Cultural Enclave?", a: "When a foreign community becomes a lasting part of one of your cities (a standing presence, not a lifetime-arrivals total), it takes root as a Cultural Enclave on an edge tile, named for the origin people (the Roman Enclave, the Punic Enclave). You make a one-time choice of how the city makes room for it. On by default (Options ▸ Mods ▸ Emigration ▸ cultural enclaves)." },
      { q: "What are the choices?", a: "Two options grounded in the origin's character, each a small benefit with a matching drawback (a Roman enclave leans Production; a Persian one brings Gold but stirs resentment), plus a passive 'let them be.' No strictly best option. The chosen stance applies its small yields every turn, so it reads in the city; dismissing (Escape or click outside) settles into 'let them be.'" },
      { q: "What's the quote below the prose?", a: "A real, attributed historical quote for the enclave, in the origin people's own language with an English translation (Greek, Chinese, Persian, Latin, Old Norse, and more), each verified against a primary source. First enclave shows one quote, second shows the other." },
      { q: "How many enclaves can one civilization have?", a: "At most two, per civilization, not overall, so you can hold two Roman and two Norman and two Han at once; reaching the cap for one origin never blocks another. A different people overtaking the tile is a change of hands (the Chronicle notes it, you choose again), not a third stacked enclave." },
      { q: "What happens if I go to war with an enclave's homeland?", a: "The enclave turns contested: a small, capped happiness strain while the war lasts, framed as wartime unease falling on families who did not choose the fighting, not as the enclave being disloyal. It settles once peace returns." }
    ]
  }
];

// Tag each section with its stable position so render-time LOC keys don't depend on column layout.
GUIDE.forEach((g, i) => { g._i = i; });

const STYLE_ID = "emig-guide-style";
const CSS =
  ".emig-guide{display:flex;flex-direction:column;width:100%;}" +
  // Pill row to switch the Guide between the "What counts" reference matrix and the FAQ page.
  ".emig-guide-pills{display:flex;flex-wrap:wrap;gap:0.4rem;justify-content:center;margin:0.2rem 0 0.5rem;}" +
  ".emig-guide-pill{cursor:pointer;padding:0.16rem 0.9rem;border-radius:0.9rem;font-size:var(--dg-fs-95);" +
  "border:0.0555rem solid rgba(229,210,172,0.35);color:#e5d2ac;background:rgba(229,210,172,0.06);}" +
  ".emig-guide-pill.active{background:#f3c34c;color:#1c1408;border-color:#f3c34c;font-weight:bold;}" +
  ".emig-guide-body{display:flex;flex-direction:column;width:100%;}" +
  // Two balanced columns on a wide window (shorter line lengths, less endless scroll); they wrap to a
  // single column when the window is too narrow to fit both.
  ".emig-guide-cols{display:flex;flex-wrap:wrap;gap:0 2.5rem;align-items:flex-start;width:100%;}" +
  ".emig-guide-col{flex:1 1 26rem;min-width:0;display:flex;flex-direction:column;}" +
  ".emig-guide-h{font-family:\"TitleFont\";text-transform:uppercase;letter-spacing:0.05rem;color:#f3c34c;font-size:var(--dg-fs-120);margin:0.6rem 0 0.1rem;border-bottom:0.0555rem solid rgba(201,162,76,0.3);padding-bottom:0.2rem;}" +
  // A matrix row stacks vertically: the icon + bold question on the top line, the explanation wrapping
  // full-width beneath it (instead of a cramped second column), with a clearer divider between rows.
  ".emig-guide-row{display:flex;align-items:flex-start;gap:0.7rem;padding:0.55rem 0.1rem;border-top:0.0555rem solid rgba(201,162,76,0.22);}" +
  ".emig-guide-ic{flex:0 0 1.6rem;font-weight:bold;text-align:center;font-size:var(--dg-fs-140);line-height:1.3;}" +
  ".emig-guide-ic.y{color:#7fd08a;}.emig-guide-ic.n{color:#e0726a;font-size:var(--dg-fs-160);line-height:1.05;}" +
  ".emig-guide-rowtext{display:flex;flex-direction:column;gap:0.2rem;flex:1 1 0;min-width:0;}" +
  ".emig-guide-q{color:#f6e7c0;font-weight:bold;font-size:var(--dg-fs-120);line-height:1.3;}" +
  ".emig-guide-note{opacity:0.9;font-size:var(--dg-fs-105);line-height:1.45;color:#e5d2ac;}" +
  ".emig-guide-faq-q{color:#f0dca8;font-weight:bold;font-size:var(--dg-fs-120);margin:0.5rem 0 0.1rem;padding-top:0.3rem;border-top:0.0277rem solid rgba(229,210,172,0.1);}" +
  ".emig-guide-faq-a{opacity:0.82;font-size:var(--dg-fs-105);line-height:1.5;}";

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
 * @param {GuideSection} g The section ({title} + either `rows` or `faq`).
 */
function renderGuideSection(wrap, g) {
  const base = "LOC_EMIG_GUIDE_" + g._i;
  if (Array.isArray(g.faq)) {
    g.faq.forEach((f, fi) => {
      wrap.appendChild(ce("div", "emig-guide-faq-q", loc(base + "_F" + fi + "_Q", f.q)));
      wrap.appendChild(ce("div", "emig-guide-faq-a", loc(base + "_F" + fi + "_A", f.a)));
    });
    return;
  }
  (g.rows || []).forEach((r, ri) => {
    const row = ce("div", "emig-guide-row");
    row.appendChild(ce("div", "emig-guide-ic " + (r.yes ? "y" : "n"), r.yes ? YES : NO));
    const text = ce("div", "emig-guide-rowtext");
    text.appendChild(ce("div", "emig-guide-q", loc(base + "_R" + ri + "_Q", r.q)));
    if (r.note) text.appendChild(ce("div", "emig-guide-note", loc(base + "_R" + ri + "_N", r.note)));
    row.appendChild(text);
    wrap.appendChild(row);
  });
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
    col.appendChild(ce("div", "emig-guide-h", loc("LOC_EMIG_GUIDE_" + g._i + "_TITLE", g.title)));
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

// Test hook: the section data (its LOC keys and English fallbacks are generated from this).
export const __test = { GUIDE };
