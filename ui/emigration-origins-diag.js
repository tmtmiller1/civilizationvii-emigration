// emigration-origins-diag.js
//
// A console-only diagnostic: `emigration.origins("Carthage")` dumps, for each matching settlement,
// the RAW recorded ethnic ledger (compositionForCity's per-origin points/shares) alongside the
// all-game inbound migration corridors that fed it (migrationFlows, with the per-cause breakdown that
// now rides each edge). It exists to answer "why does the City Details Population-origins block show
// origin X% for a settlement the base game shows as wholly civ Y?" — the base game has no ethnicity
// concept, so this shows what the MOD modeled, and where it came from (immigration vs a conquest
// baseline vs a possible mis-attribution), plus whether integration is on and who the owner is at war
// with (a war with an origin's homeland stalls that origin's integration).
//
// Read-only and self-guarding; never throws into the console object that wires it.

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { allCityCompositions } from "/emigration/ui/emigration-composition.js";
import { migrationFlows } from "/emigration/ui/emigration-migration-stats.js";
import { civAdjective } from "/emigration/ui/emigration-naming.js";
import { causeLabel } from "/emigration/ui/emigration-causes.js";
import { warOpponents } from "/emigration/ui/emigration-war.js";
import { dlog } from "/emigration/ui/emigration-log.js";

/**
 * Round to one decimal place (for readable percentages), tolerating non-finite input.
 * @param {number} n A number.
 * @returns {number} n rounded to 0.1, or 0.
 */
function round1(n) {
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : 0;
}

/**
 * The per-cause split of one corridor as resolved-label → people, biggest first.
 * @param {Record<string,number>} [byCause] People per cause on the edge.
 * @returns {{cause:string, people:number}[]} The split (people > 0), sorted.
 */
function causeSplit(byCause) {
  /** @type {Record<string,number>} */
  const m = byCause || {};
  return Object.keys(m)
    .map((/** @type {string} */ c) => ({ cause: causeLabel(c), people: Math.round(m[c] || 0) }))
    .filter((r) => r.people > 0)
    .sort((a, b) => b.people - a.people);
}

/**
 * The all-game inbound corridors feeding one settlement (arrivals recorded into `name`), each with its
 * origin civ, people moved, and per-cause split — the provenance of the settlement's foreign origins.
 * @param {*[]} flows migrationFlows() edges.
 * @param {string} name The settlement name.
 * @returns {{from:string, civ:string, people:number, causes:{cause:string, people:number}[]}[]} Corridors.
 */
function inboundCorridors(flows, name) {
  return flows
    .filter((f) => f && f.destCity === name && f.src !== f.dest && f.people > 0)
    .map((f) => ({ from: f.srcCity || "?", civ: civAdjective(f.src), people: Math.round(f.people), causes: causeSplit(f.byCause) }))
    .sort((a, b) => b.people - a.people);
}

/**
 * The war opponents of a player, resolved to civ adjectives (empty on any failure). Names the
 * homelands whose ongoing war stalls their diaspora's integration in the owner's cities.
 * @param {number} owner Owner player id.
 * @returns {string[]} Opponent civ adjectives.
 */
function opponentsOf(owner) {
  try {
    return [...(warOpponents(owner) || [])].map((/** @type {number} */ id) => civAdjective(id));
  } catch (_) {
    return [];
  }
}

/**
 * One settlement's origin report: resolved mix, inbound provenance, and the integration context.
 * @param {*} entry An allCityCompositions() entry ({name, owner, comp}).
 * @param {*[]} flows migrationFlows() edges.
 * @returns {*} A plain report object.
 */
function cityReport(entry, flows) {
  const comp = entry.comp;
  const owner = entry.owner;
  return {
    name: entry.name,
    owner: civAdjective(owner),
    totalPts: Math.round(comp.total),
    mix: comp.civs.map((/** @type {{civ:number, pts:number, share:number}} */ c) =>
      ({ civ: civAdjective(c.civ), pct: round1(c.share * 100), pts: Math.round(c.pts) })),
    inbound: inboundCorridors(flows, entry.name),
    integrationEnabled: CONFIG.integrationEnabled === true,
    ownerAtWarWith: opponentsOf(owner)
  };
}

/**
 * Dump the recorded ethnic ledger + inbound provenance for settlements whose name contains `filter`
 * (case-insensitive; omit for every tracked settlement). Logs a readable summary and RETURNS the
 * structured reports (the reliable channel when debug logging is muted). Console API only.
 * @param {string} [filter] Case-insensitive settlement-name substring.
 * @returns {*[]} One report per matching settlement.
 */
export function dumpOrigins(filter) {
  let reports = [];
  try {
    const needle = typeof filter === "string" ? filter.toLowerCase() : null;
    const flows = migrationFlows() || [];
    const entries = allCityCompositions()
      .filter((e) => e && e.comp && (needle === null || (e.name || "").toLowerCase().includes(needle)));
    reports = entries.map((e) => cityReport(e, flows));
  } catch (e) {
    dlog("origins diag threw " + e);
    return [];
  }
  for (const r of reports) {
    const mix = r.mix.map((/** @type {*} */ m) => `${m.civ} ${m.pct}% (${m.pts})`).join(", ");
    dlog(`origins "${r.name}" owner=${r.owner} total=${r.totalPts}pts: ${mix}`);
    for (const c of r.inbound) {
      const why = c.causes.map((/** @type {*} */ x) => `${x.cause} ${x.people}`).join(", ");
      dlog(`  ← ${c.people} from ${c.from} (${c.civ})${why ? " — " + why : ""}`);
    }
    dlog(`  integration=${r.integrationEnabled ? "ON" : "OFF"} ownerAtWarWith=[${r.ownerAtWarWith.join(", ")}]`);
  }
  if (!reports.length) dlog(`origins: no tracked settlement matches ${filter ? `"${filter}"` : "(all)"}`);
  return reports;
}
