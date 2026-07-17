// emigration-city-panel.js
//
// Surfaces the mod's per-city emigration data inside the base game's City Details panel, so it is
// legible without opening the standalone dashboard. Uses the same Controls.decorate hook as the
// dock button (emigration-dock-decorator.js): on the vanilla panel-city-details we append two
// sections, split by the panel's own tabs -
//   • population (Citizen Growth tab): origin mix, emigration OUT with destinations, immigration IN
//     with origins, and refugees held awaiting settlement.
//   • quarters (Building Breakdown tab): the established Cultural Quarter record, if any.
// All numbers are LIVE engine reads gathered at panel-open (and on each city switch, via the panel's
// own "update-city-details" event). The pure formatting lives in emigration-city-panel-data.js; this
// module only reads the engine and paints the DOM, and never throws into the game.

import { cityPanelModel } from "/emigration/ui/emigration-city-panel-data.js";
import { compositionForCity } from "/emigration/ui/emigration-composition.js";
import { enclaveProgressForCity } from "/emigration/ui/emigration-diaspora.js";
import { migrationFlows } from "/emigration/ui/emigration-migration-stats.js";
import { quarterAt } from "/emigration/ui/emigration-quarter-state.js";
import { quarterOptionFor } from "/emigration/ui/emigration-quarter-registry.js";
import { refugeePoolTotal } from "/emigration/ui/emigration-refugee-pool.js";
import { cityName } from "/emigration/ui/emigration-migration-records.js";
import { civAdjective, quarterName, civType } from "/emigration/ui/emigration-naming.js";
import { causeLabel, topCause } from "/emigration/ui/emigration-causes.js";

const DBG = false;
/**
 * Debug logger, no-op unless {@link DBG} is set.
 * @param {...*} a Values to log.
 */
function dlog(...a) {
  if (DBG) console.warn("[Emigration.cityPanel]", ...a);
}
/**
 * Error logger; always emits.
 * @param {...*} a Values to log.
 */
function derr(...a) {
  console.error("[Emigration.cityPanel]", ...a);
}

/**
 * Resolve a LOC key to its localized string, or null when unavailable. Mirrors the private `loc`
 * wrapper in emigration-naming.js: guards a missing Locale surface, rejects an unresolved key (the
 * engine echoes back the raw "LOC_..." tag), and never throws. Injected into the pure view-model so
 * all panel text is localized while the model stays testable off-engine.
 * @param {string} key The LOC key.
 * @param {...*} args Substitution args.
 * @returns {string|null} The localized string, or null.
 */
function compose(key, ...args) {
  try {
    if (typeof Locale !== "undefined" && typeof Locale.compose === "function") {
      const v = Locale.compose(key, ...args);
      if (typeof v === "string" && v.length && !v.startsWith("LOC_")) return v;
    }
  } catch (_e) { /* ignore */ }
  return null;
}

// The base panel's own refresh event (model-city-details.js), fired on open and on prev/next city
// cycling. The panel toggles a `hidden` class instead of detaching, so afterAttach runs once; this
// event is how we re-fill when the player switches the selected city.
const UPDATE_EVENT = "update-city-details";
const GROWTH_SECTION_ID = "emigration-city-growth";
const BUILDINGS_SECTION_ID = "emigration-city-quarters";

/**
 * The tile key ("x,y") for a city's centre plot, or null when unreadable. Mirrors locKey/tileKeyOf
 * in the composition/quarter modules (kept local so this module owns its engine boundary).
 * @param {*} city A live city object.
 * @returns {string|null} The key, or null.
 */
function tileKeyOf(city) {
  const loc = city && city.location;
  if (!loc || typeof loc.x !== "number" || typeof loc.y !== "number") return null;
  return loc.x + "," + loc.y;
}

/**
 * The currently selected city object, or null. Defensive against a missing engine surface.
 * @returns {*} The city, or null.
 */
function selectedCity() {
  try {
    const cid = typeof UI !== "undefined" && UI.Player && UI.Player.getHeadSelectedCity
      ? UI.Player.getHeadSelectedCity() : null;
    if (!cid) return null;
    return typeof Cities !== "undefined" && Cities.get ? Cities.get(cid) : null;
  } catch (e) {
    derr("selectedCity threw:", e);
    return null;
  }
}

/**
 * All migration flow edges, or an empty list when the store is unreadable.
 * @returns {*[]} The flows.
 */
function safeFlows() {
  try {
    return migrationFlows() || [];
  } catch (e) {
    derr("migrationFlows threw:", e);
    return [];
  }
}

/**
 * The refugee holding size for a city, keyed by its signal key ("owner:localId").
 * @param {*} city A live city object.
 * @returns {number} Held refugees (points), 0 when none/unreadable.
 */
function refugeePoolFor(city) {
  try {
    const owner = city.owner;
    const localId = city.localId != null ? city.localId : city.id;
    if (owner == null || localId == null) return 0;
    return refugeePoolTotal(owner + ":" + localId);
  } catch (e) {
    derr("refugeePoolFor threw:", e);
    return 0;
  }
}

/**
 * The resolved quarter record for a city (civ ids turned into display strings), or null.
 * @param {*} city A live city object.
 * @returns {*} The resolved quarter, or null.
 */
function gatherQuarter(city) {
  try {
    const key = tileKeyOf(city);
    const rec = key ? quarterAt(key) : null;
    if (!rec) return null;
    const applied = rec.applied || {};
    return {
      originName: quarterName(rec.civ),
      stanceLabel: quarterOptionFor(civType(rec.civ), rec.optionId).label,
      contested: !!rec.contested,
      // Once the enclave is BUILT the stance grant steps aside (roadmap §22a), so the panel must not keep
      // claiming the dividend. Resolve a legacy record's origin from its player id, as the grant path does.
      invested: false, // cultural-enclave BUILD feature removed; nothing is ever built/invested
      benefitYield: applied.benefitYield || null,
      benefitAmount: applied.benefitAmount || 0,
      penaltyYield: applied.penaltyYield || null,
      penaltyAmount: applied.penaltyAmount || 0
    };
  } catch (e) {
    derr("gatherQuarter threw:", e);
    return null;
  }
}

/**
 * The pending/forming cultural-enclave readout for a city that has NO settled quarter yet, or null.
 * Surfaces the lead foreign origin's progress toward the enclave bar (the same numbers the decision
 * mechanic uses) so the player can see a qualifying-but-unoffered enclave ("awaits your decision") or
 * one still forming, instead of the bare "no enclave has taken root" when one actually has. Only shown
 * from the foothold stage up, so a small foreign sprinkle doesn't clutter the panel.
 * @param {*} city A live city object.
 * @returns {*} The resolved enclave-progress readout, or null.
 */
function gatherEnclaveProgress(city) {
  try {
    const p = enclaveProgressForCity(city);
    if (!p || p.stage === "none") return null;
    return {
      originName: quarterName(p.civ),
      pending: p.stage === "established", // qualifies now, but the decision hasn't been offered/made
      sharePct: Math.round((p.share || 0) * 100),
      thresholdPct: Math.round((p.establishedShare || 0) * 100),
      stock: Math.round(p.stock || 0),
      minStock: Math.round(p.minStock || 0)
    };
  } catch (e) {
    derr("gatherEnclaveProgress threw:", e);
    return null;
  }
}

/**
 * The origin composition parts for a city, with civ ids resolved to adjectives.
 * @param {*} comp The raw compositionForCity result (or null).
 * @returns {{name:string, share:number}[]} The resolved parts.
 */
function resolveParts(comp) {
  if (!comp || !Array.isArray(comp.civs)) return [];
  return comp.civs.map((/** @type {*} */ c) => ({ name: civAdjective(c.civ), share: c.share }));
}

/**
 * The display label of the cause that moved most of an edge's people, or "" when the edge carries no
 * per-cause detail (a legacy flat-number flow value, from a save written before per-cause flows).
 * Resolved HERE rather than in the pure view-model because localizing a cause is an engine read, the
 * same reason civ ids are turned into names on this side of the boundary.
 * @param {*} f A flow edge from migrationFlows() ({byCause}).
 * @returns {string} The resolved cause label, or "".
 */
function topCauseName(f) {
  const c = topCause(f && f.byCause);
  return c ? causeLabel(c) : "";
}

/**
 * Gather the LIVE, resolved inputs for the selected city, ready for the pure view-model. Never
 * throws; returns null when there is no selected city.
 * @param {*} city The selected city object (or null).
 * @returns {*} The resolved inputs, or null.
 */
function gatherPanelInput(city) {
  if (!city) return null;
  const name = cityName(city);
  const comp = compositionForCity(city);
  const quarter = gatherQuarter(city);
  const flows = safeFlows();
  const outflows = flows.filter((f) => f.srcCity === name)
    .map((f) => ({ place: f.destCity, civName: civAdjective(f.dest), people: f.people, causeName: topCauseName(f) }));
  const inflows = flows.filter((f) => f.destCity === name)
    .map((f) => ({ place: f.srcCity, civName: civAdjective(f.src), people: f.people, causeName: topCauseName(f) }));
  return {
    cityName: name,
    composition: comp ? { total: comp.total, parts: resolveParts(comp) } : null,
    outflows,
    inflows,
    refugeePool: refugeePoolFor(city),
    quarter,
    // Only surface pending/forming enclave progress when no quarter is settled yet (once decided, the
    // settled record above is authoritative).
    enclave: quarter ? null : gatherEnclaveProgress(city)
  };
}

/**
 * Inject the one-time `<style>` that visually separates our sections from the base content with a
 * thin top rule. Idempotent.
 */
function injectPanelStyle() {
  if (document.getElementById("emigration-city-panel-style")) return;
  const style = document.createElement("style");
  style.id = "emigration-city-panel-style";
  style.textContent =
    ".emigration-city-section {" +
    " border-top: 0.0555555556rem solid rgba(77, 83, 102, 0.30);" +
    " padding-top: 0.3333333333rem;" +
    " margin-top: 0.3333333333rem;" +
    " }";
  document.head.appendChild(style);
  dlog("panel style injected");
}

/**
 * Remove any prior section with the given id from a host and append a fresh empty one, so a refresh
 * replaces its contents rather than stacking duplicates on each city switch.
 * @param {*} host The container element.
 * @param {string} id The section id.
 * @returns {*} The new section element.
 */
function replaceSection(host, id) {
  const prev = host.querySelector("#" + id);
  if (prev && prev.remove) prev.remove();
  const el = document.createElement("div");
  el.id = id;
  el.className = "emigration-city-section flex flex-col m-1";
  host.appendChild(el);
  return el;
}

/**
 * Append a section header line.
 * @param {*} sec The section element.
 * @param {string} text The header text.
 */
function addHeader(sec, text) {
  const p = document.createElement("p");
  p.className = "font-title ml-4 mt-2 uppercase text-gradient-secondary";
  p.textContent = text;
  sec.appendChild(p);
}

/**
 * Append a single data row.
 * @param {*} sec The section element.
 * @param {string} text The row text.
 */
function addRow(sec, text) {
  const d = document.createElement("div");
  d.className = "ml-6 mr-4 text-sm text-accent-4";
  d.textContent = text;
  sec.appendChild(d);
}

/**
 * Append a titled sub-block (a small heading plus its rows), or nothing when there are no rows.
 * @param {*} sec The section element.
 * @param {string} title The sub-heading text.
 * @param {string[]} rows The rows.
 */
function addBlock(sec, title, rows) {
  if (!rows || !rows.length) return;
  const h = document.createElement("div");
  h.className = "font-title ml-4 mt-1 text-accent-2 text-sm uppercase";
  h.textContent = title;
  sec.appendChild(h);
  for (const r of rows) addRow(sec, r);
}

/**
 * Decorator for the vanilla City Details panel that injects the emigration population and quarter
 * sections and refreshes them when the selected city changes.
 */
export class EmigrationCityDetailsDecorator {
  /**
   * @param {*} val The panel handle supplied by the factory (its `.Root` is the panel element).
   */
  constructor(val) {
    this._panel = val;
    this._growthHost = null;
    this._buildingsHost = null;
    this._onUpdate = () => this._refresh();
  }

  /** Lifecycle hook fired before the panel attaches. */
  beforeAttach() {}

  /** Lifecycle hook fired after the panel attaches: inject the sections and start listening. */
  afterAttach() {
    try {
      injectPanelStyle();
    } catch (e) {
      derr("injectPanelStyle threw:", e);
    }
    this._findHosts();
    this._refresh();
    try {
      window.addEventListener(UPDATE_EVENT, this._onUpdate);
    } catch (e) {
      derr("addEventListener threw:", e);
    }
  }

  /** Lifecycle hook fired before the panel detaches. */
  beforeDetach() {}

  /** Lifecycle hook fired after the panel detaches: stop listening. */
  afterDetach() {
    try {
      window.removeEventListener(UPDATE_EVENT, this._onUpdate);
    } catch (e) {
      derr("removeEventListener threw:", e);
    }
  }

  /** Locate the growth scrollable and the buildings list container within the panel. */
  _findHosts() {
    try {
      const root = this._panel && this._panel.Root ? this._panel.Root : null;
      if (!root || !root.querySelector) return;
      this._growthHost = root.querySelector("#city-details-tab-growth fxs-scrollable");
      const buildingsList = root.querySelector("#city-details-tab-buildings .buildings-list");
      this._buildingsHost = buildingsList ? buildingsList.parentElement : null;
    } catch (e) {
      derr("_findHosts threw:", e);
    }
  }

  /** Rebuild both sections from a live read of the selected city. Never throws. */
  _refresh() {
    try {
      if (!this._growthHost && !this._buildingsHost) return;
      const model = cityPanelModel(gatherPanelInput(selectedCity()), compose);
      if (this._growthHost) this._renderPopulation(model.population);
      if (this._buildingsHost) this._renderQuarters(model.quarters);
    } catch (e) {
      derr("_refresh threw:", e);
    }
  }

  /**
   * Paint the population section into the growth tab.
   * @param {*} pop The population view-model.
   */
  _renderPopulation(pop) {
    const sec = replaceSection(this._growthHost, GROWTH_SECTION_ID);
    addHeader(sec, pop.title);
    if (!pop.hasData) {
      addRow(sec, pop.noDataText);
      return;
    }
    addBlock(sec, pop.originsHeading, pop.originLines);
    addBlock(sec, pop.departingHeading, pop.outflowLines);
    addBlock(sec, pop.arrivingHeading, pop.inflowLines);
    if (pop.refugeeLine) addRow(sec, pop.refugeeLine);
  }

  /**
   * Paint the quarter section into the buildings tab.
   * @param {*} quarters The quarters view-model.
   */
  _renderQuarters(quarters) {
    const sec = replaceSection(this._buildingsHost, BUILDINGS_SECTION_ID);
    addHeader(sec, quarters.title);
    if (!quarters.present) {
      addRow(sec, quarters.noQuarterText);
      return;
    }
    for (const line of quarters.lines) addRow(sec, line);
  }
}

/**
 * Register the City Details panel decorator with the engine. Called once from boot(). Safe to call
 * when the Controls API is unavailable (older shells): it simply does nothing.
 */
export function installEmigrationCityPanel() {
  try {
    if (typeof Controls !== "undefined" && typeof Controls.decorate === "function") {
      Controls.decorate(
        "panel-city-details",
        (/** @type {*} */ val) => new EmigrationCityDetailsDecorator(val)
      );
      dlog("city-details decorator registered");
    } else {
      dlog("Controls.decorate unavailable; city panel not registered");
    }
  } catch (e) {
    derr("Controls.decorate THREW:", e);
  }
}
