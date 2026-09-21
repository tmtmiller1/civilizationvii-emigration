// gen-enclave-improvements.mjs
//
// Generates the per-civilization, per-stance "Cultural Enclave" IMPROVEMENT data from the QUARTER_BONUSES
// registry (ui/emigration-quarter-bonuses.js): two improvements per origin civ (one per stance option),
// each carrying that option's benefit yield as a NATIVE Constructible_YieldChanges row, the civ's symbol
// as its icon, and en_us text. Run: `node scripts/gen-enclave-improvements.mjs`.
//
// NEVER BUILDABLE, ONLY PLACED. The 2026-07-17 buildable version crashed the AI turn (the AI's
// ConstructibleBroker evaluated a universally buildable custom improvement in every city and segfaulted).
// These rows carry RequiresUnlock="true" with NO unlock row and CityBuildable/TownBuildable="false", so no
// build query ever lists them. The mod PLACES one with the engine's CREATE_ELEMENT operation when the
// player recognizes an enclave (ui/emigration-enclave-place.js); watched in-game 2026-09-12: a
// never-buildable custom improvement placed this way carried its yields and survived seven AI turns on a
// human city and on an AI city (devtools/engine-probe/, runs 7 and 8).
//
// Emits:
//   data/emigration-enclave-improvements.xml   (UpdateDatabase, all ages: no Constructibles.Age, like a farm)
//   data/emigration-enclave-icons.xml          (UpdateIcons)
//   text/en_us/EnclaveText.xml                 (UpdateText, en_us only; the engine falls back to English)

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { QUARTER_BONUSES } from "../ui/emigration-quarter-bonuses.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// The placed enclave's native tile yield: the SAME amount the stance grant paid (CONFIG.quarterRewardAmount,
// 2), because the improvement REPLACES that grant (emigration-quarter.js drops the benefit leg once the
// tile stands). The tile also settles one population point (Population="1"), the enclave community itself.
// The stance's drawback stays on the per-turn grant path (a negative native yield row was the other
// suspect in the July crash and is deliberately not shipped).
export const ENCLAVE_BENEFIT = 2;

// Civ VII tile yields (Constructible_YieldChanges.YieldType FK → Yields). YIELD_FAITH does not exist, so
// Faith benefits map to Culture (closest theme).
const VALID_YIELDS = new Set(["YIELD_CULTURE", "YIELD_DIPLOMACY", "YIELD_FOOD", "YIELD_GOLD", "YIELD_HAPPINESS", "YIELD_PRODUCTION", "YIELD_SCIENCE"]);
const validYield = (y) => (VALID_YIELDS.has(y) ? y : "YIELD_CULTURE");

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const shortOf = (civ) => civ.replace(/^CIVILIZATION_/, "");
/** CIVILIZATION_ROME + "a" -> IMPROVEMENT_EMIG_ENCLAVE_ROME_A. Mirrored by enclaveTypeFor() in emigration-enclave-place.js. */
export const typeOf = (civ, optionId) => "IMPROVEMENT_EMIG_ENCLAVE_" + shortOf(civ) + "_" + String(optionId).toUpperCase();
const ICON_OVERRIDE = { OTTOMAN: "ottomans" };
const iconPathOf = (civ) => "fs://game/civ_sym_" + (ICON_OVERRIDE[shortOf(civ)] || shortOf(civ).toLowerCase());
const yieldWord = (y) => { const s = y.replace(/^YIELD_/, "").toLowerCase(); return s.charAt(0).toUpperCase() + s.slice(1); };

const civs = Object.keys(QUARTER_BONUSES);
const types = [], cons = [], imps = [], districts = [], terrains = [], yields = [], icons = [], text = [];

for (const civ of civs) {
  const entry = QUARTER_BONUSES[civ];
  for (const option of entry.options) {
    const t = typeOf(civ, option.id);
    const benefit = validYield(option.benefit);
    const penalty = validYield(option.penalty);
    types.push(`        <Row Type="${t}" Kind="KIND_CONSTRUCTIBLE"/>`);
    // No Age (like IMPROVEMENT_FARM): the tile persists across ages. RequiresUnlock with no unlock row +
    // CityBuildable/TownBuildable false = never in any build query, never evaluated by the AI broker.
    cons.push(`        <Row ConstructibleType="${t}" Name="LOC_${t}_NAME" Description="LOC_${t}_DESCRIPTION" Tooltip="LOC_${t}_TOOLTIP"` +
      ` ConstructibleClass="IMPROVEMENT" Cost="40" Population="1" CostProgressionModel="NO_COST_PROGRESSION" CostProgressionParam1="0" RequiresUnlock="true"/>`);
    imps.push(`        <Row ConstructibleType="${t}" Domain="DOMAIN_LAND" CanBuildOnNonDistrict="true" CanBuildOutsideTerritory="false" ResourceTier="0" CityBuildable="false" TownBuildable="false" Workable="true"/>`);
    districts.push(`        <Row ConstructibleType="${t}" DistrictType="DISTRICT_RURAL"/>`);
    terrains.push(`        <Row ConstructibleType="${t}" TerrainType="TERRAIN_FLAT"/>`);
    terrains.push(`        <Row ConstructibleType="${t}" TerrainType="TERRAIN_HILL"/>`);
    yields.push(`        <Row ConstructibleType="${t}" YieldType="${benefit}" YieldChange="${ENCLAVE_BENEFIT}"/>`);
    icons.push(`        <Row>\n            <ID>${t}</ID>\n            <Path>${iconPathOf(civ)}</Path>\n        </Row>`);
    const why = option.tileWhy.charAt(0).toUpperCase() + option.tileWhy.slice(1);
    text.push(`        <Row Tag="LOC_${t}_NAME"><Text>${esc(entry.demonym)} Enclave</Text></Row>`);
    text.push(`        <Row Tag="LOC_${t}_DESCRIPTION"><Text>${esc("A quarter settled by " + entry.demonym + " migrants who have put down roots in the city. " +
      why + ". The enclave itself works this tile: +" + ENCLAVE_BENEFIT + " " + yieldWord(benefit) + " (its " + yieldWord(penalty).toLowerCase() +
      " cost is charged to the treasury each turn).")}</Text></Row>`);
    text.push(`        <Row Tag="LOC_${t}_TOOLTIP"><Text>${esc(entry.demonym + " Enclave: +" + ENCLAVE_BENEFIT + " " + yieldWord(benefit) + ". Recognized by the city; it cannot be built, only formed.")}</Text></Row>`);
  }
}

const HEADER = "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<!-- GENERATED by scripts/gen-enclave-improvements.mjs from ui/emigration-quarter-bonuses.js. Do not hand-edit; regenerate. -->";
const improvementsXml = `${HEADER}
<Database>
    <Types>
${types.join("\n")}
    </Types>
    <Constructibles>
${cons.join("\n")}
    </Constructibles>
    <Improvements>
${imps.join("\n")}
    </Improvements>
    <Constructible_ValidDistricts>
${districts.join("\n")}
    </Constructible_ValidDistricts>
    <Constructible_ValidTerrains>
${terrains.join("\n")}
    </Constructible_ValidTerrains>
    <Constructible_YieldChanges>
${yields.join("\n")}
    </Constructible_YieldChanges>
</Database>
`;
const iconsXml = `${HEADER}
<Database>
    <IconDefinitions>
${icons.join("\n")}
    </IconDefinitions>
</Database>
`;
const textXml = `${HEADER}
<Database>
    <EnglishText>
${text.join("\n")}
    </EnglishText>
</Database>
`;

writeFileSync(join(ROOT, "data/emigration-enclave-improvements.xml"), improvementsXml);
writeFileSync(join(ROOT, "data/emigration-enclave-icons.xml"), iconsXml);
writeFileSync(join(ROOT, "text/en_us/EnclaveText.xml"), textXml);
console.log(`Generated ${types.length} enclave improvements (${civs.length} civs x 2 stances), ${icons.length} icons, ${text.length} strings`);
