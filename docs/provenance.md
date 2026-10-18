# Where Emigration comes from

This page compares Emigration 3.6.2 for Civilization VII with "Emigration (v 6)" for Civilization V, the Workshop mod
by killmeplease, Tim_the_Texan and Tomahawk.nsk (its Lua file headers name Mk Z as the author). The Civ V copy used
here is the Workshop release, checked file by file against the MD5 list in its own `.modinfo`. Every function,
setting, string and data row in it was compared with this repo, and the text was scanned for shared runs of words.

The short version: Emigration takes the shape of the Civ V mod's Prosperity model and some of its setting values. The
Civ V mod's code, text and data aren't in it. About 80 lines of the roughly 26,200 lines of shipping UI code (0.3%)
trace to a specific formula or value in the original. If you count every line of every function that holds one of
those 80 lines, it's 286 lines, or 1.1%. The text and data files that ship with the mod (about 36,000 lines across 12
languages) are all new.

Those 80 lines matter more than their count suggests, because they're the arithmetic behind voluntary,
prosperity-driven migration, which is the part the credit names. Everything else (crisis flight, war and disaster,
the gameplay consequences of moving people, ethnicity and enclaves, return migration, policies, and the reporting
screens) was built for this mod.

## What came from the Civ V mod

### The idea, in one paragraph

Each city gets a Prosperity score: per-citizen yields, plus happiness, minus a population term, then scaled by a sum
of percent modifiers for things like siege and starvation. When one city is more prosperous than another, the gap
minus a set of emigration barriers (base reluctance, a bigger destination, city-states, distance) is the urge to
move. The square root of that urge fills a 30-point bar. When the bar fills, one citizen moves, and the city that lost
them rests on a cooldown. Bar and cooldown both scale with game speed. That's the Civ V design, and it's the core of
Emigration's voluntary track.

### The Prosperity score, side by side

Civ V line numbers are from `Lua/Prosperity.lua` unless another file is named. Emigration line numbers are from
`ui/emigration-prosperity.js` unless another file is named.

| Step | Civ V (`Prosperity.lua`) | Emigration (`ui/emigration-prosperity.js`) |
| --- | --- | --- |
| Productiveness | `round(((F + P + G) + 0.25·S + C + GPP + Faith + Tourism) / pop)` (L27-42) | `(2.5F + 2.5P + 2.5G + 0.625S + 1.25C) / pop^0.85` (L25-39) |
| Happiness | `+ localHappiness × 1.0` (L44) and `+ empireExcessHappiness × 1.0` (L52) | By default `prod × clamp(1 + 0.2H, 0.2, 1.8) + 4H`, where `H = tanh((h − mean)/8)` and the unhappy side is 1.8 times steeper (L159-163). The linear option is `h × 6.0` (L156) |
| Population | `− pop × 1.0` (L48) | `− pop × 1.0` (L148) |
| Other base terms | `+ policies × 0`, `+ 5` with Order (L56-65) | Civ bias, polity (stage, celebrations, government) and what the settlement has built (L149-153) |
| Percent modifiers | starvation `−200/√(fill% + 1)`, religion `−10·(n − 1)`, `−10` per unemployed citizen, danger `−15`, war `−10`, siege `−100 × damage%` (only while at war), Freedom `+25` (L93-154) | violence `−min(220, 12v)` scaled by siege length, disaster `−min(200, 10d)`, siege (being razed) `−100`, starvation `−90`, unrest `−60`, war weariness `−12` (L183-230) |
| Combine | `floor(base + mod/100 × |base|)` (L156-161) | `base × (1 + mod/100)`, kept negative when both are negative (L276-285) |
| Ranking | Sort cities by Prosperity, highest first (`Emigration.lua` L13-33) | Same (`rankByProsperity`, L294-299) |

The two combine rules give the same answer whenever the base is positive. They split when the base is negative: in
Civ V a penalty pushes a poor city further down, while in Emigration it shrinks the score toward zero unless the
modifiers add up to more than −100%.

### Barriers, urge and the bar

| Step | Civ V | Emigration |
| --- | --- | --- |
| Base reluctance | `5` (`GetBarrierBase`, L165) | `4` (`ui/emigration-pull.js` L183) |
| Bigger destination | `round(0.5 × Δpop)` (`GetBarrierPop`, L176) | `0.5 × Δpop`, plus a matching charge for moving to a smaller city (`sizeFriction`, `ui/emigration-pull.js` L141-147) |
| City-state | `5 × era`, when the source is a city-state (L169) | A flat `5` when either side is a city-state (`ui/emigration-pull.js` L185) |
| Distance | `round(log2(d) − 1)` (L185) | `0.6 × d`, linear (`ui/emigration-geography.js` L228) |
| Recent emigration | `ceil(cooldownLeft / 18) × 5` (`EmigrationDummies.lua` L24) | A source on cooldown can't send anyone until it ends (`ui/emigration-engine.js` L150, L460) |
| Autocracy | `10` (L192) | Not carried over. Closed Borders retention is a separate policy-card mechanic |
| Another civ | `PoachBlock 2` is the extra urge a city needs to take over another city's partner | `poachBlock 30` is a charge on every move to another civ (`ui/emigration-pull.js` L113-119, L188) |
| Urge | `floor((ΔPros − barrier)^0.5)` when positive (`GetUrge`, L206-215) | `max(0, pull)^0.5`, where the pull also carries tilt, brakes and a borders multiplier (`ui/emigration-engine.js` L461) |
| Bar | The destination adds urge to its partner city's bar each turn; a citizen moves at `30 × GrowthPercent/100` (`Emigration.lua` L91-110) | Each source adds urge toward its current best destination; a citizen moves at `30 × CostMultiplier/100`. Stored pressure keeps 90% a turn (`pressureRetention`, `ui/emigration-config.js` L36, applied in `ui/emigration-state.js` L326) |
| Cooldown | `18 × speed` turns (`EmigrationRules.lua` L13) | `8 × speed` turns (`ui/emigration-engine.js` L477) |
| Who chooses | A destination with food surplus of 2 or more picks a source it reaches by trade route (`Emigration.lua` L64-89) | Every source picks its best destination each pass, and doesn't need a route (`ui/emigration-pull.js` L514-527) |

### Function map

Every function and top-level block in the Civ V mod, and where its job went. "Ported" means the logic is the same
line for line, "adapted" means the same step with different inputs, values or triggers, "replaced" means the role
survives but a different mechanism fills it, and "not carried over" means Emigration leaves it out.

| Civ V function | Emigration counterpart | Class |
| --- | --- | --- |
| `GetProsperityFromProductiveness` (Prosperity.lua:27) | `productiveness` (emigration-prosperity.js:25) | adapted |
| `GetProsperityFromLocalHappiness` (:44) | `happinessForScore` and `baseBreakdown` (prosperity.js:77, :143) | adapted; the default happiness shape is new |
| `GetProsperityFromPopulation` (:48) | the `population` term of `baseBreakdown` (prosperity.js:148) | ported |
| `GetProsperityFromHappiness` (:52) | Civ VII doesn't have an empire happiness pool | not carried over |
| `GetProsperityFromPolicies` (:56), `GetProsperityFromOrder` (:60), `GetFreedomModifier` (:67) | `polityBonus` (prosperity.js:92) reads Civ VII governments its own way | not carried over |
| `GetReligionModifier` (:74) | | not carried over |
| `GetUnemployedModifier` (:93) | The first release had an unemployment term; it was gone by 1.0 | not carried over |
| `GetWarModifier` (:97) | Left out on purpose: being at war somewhere doesn't push people out of a peaceful city | not carried over |
| `GetDangerModifier` (:104) | `violencePercent` and `ui/emigration-violence.js` | replaced |
| `GetSiegeModifier` (:113) | the `siege` term of `situationalBreakdown` (prosperity.js:223) | adapted; same value, new trigger |
| `GetStarvationModifier` (:121) | the `starvation` term of `situationalBreakdown` (prosperity.js:224) | adapted; flat instead of curved |
| `GetBaseProsperity` (:129) | `baseBreakdown` and `baseScore` (prosperity.js:143, :173) | adapted |
| `GetProsperityModifier` (:141) | `situationalBreakdown` and `situationalPercent` (prosperity.js:219, :238) | adapted |
| `GetProsperity` (:156) | `prosperity` (prosperity.js:276) | adapted |
| `GetBarrierBase` (:165) | `adjustedPull` (emigration-pull.js:183) | ported; value 4 instead of 5 |
| `GetBarrierCS` (:169) | `adjustedPull` (pull.js:185) | adapted |
| `GetBarrierPop` (:176) | `sizeFriction` (pull.js:141) | ported, plus a new term for smaller destinations |
| `GetBarrierDist` (:185) | the distance term of `geoBreakdown` (emigration-geography.js:228) | replaced; linear instead of log |
| `GetBarrierAut` (:192) | | not carried over |
| `GetEmigrationBarrier` (:200) | the friction block of `adjustedPull` (pull.js:182-195) | adapted |
| `GetUrge` (:206) | `adjustedPull` and the `Math.pow(..., deltaExponent)` step (pull.js:175; engine.js:385, :461, :728) | adapted |
| `GetMigrationInfo` (:217) | `pickSource` (emigration-city-readout-data.js:113) | same idea (bar progress), new code |
| `GetMigrationTooltip` (:264), `GetProsperityTooltip` (:309), `AddLine` (:254) | `ui/emigration-explain.js`, `ui/emigration-prosperity-tooltip.js` | same idea (an itemized breakdown), new code and text |
| `GetProsperityRating` (Emigration.lua:13) | `collectCitySignals` and `rankByProsperity` (emigration-cities.js:253, prosperity.js:294) | adapted; ranks every city by default instead of only met civs at peace |
| `Migration` (Emigration.lua:35) | `shedVoluntary`, `legacyEmigrate`, `planSource` (engine.js:459, :381, :720) and `bestDestination` (pull.js:514) | adapted; the bar loop stays, pairing goes |
| `MoveCitizen` (Emigration.lua:116) | `applyOneMove` and `shedBurst` (engine.js:227, :334), plus the arrival and departure modules | new code (tiles, travel time, ethnic makeup); the religion step isn't carried over |
| `BreakPairsOnWarDeclared` (Emigration.lua:158) | Emigration doesn't pair cities; `permWar` 0.6 dampens moves between civs at war | not carried over |
| `MetAndNoWar`, `IsValid`, `GetPlayerName`, `hasSOL` (Emigration.lua:181-207) | | not carried over |
| Speed scaling (EmigrationRules.lua:9-13) | `speedBar` and `speedTurns` (emigration-game-speed.js:88, :76) | adapted; reads a different speed column and also scales decay |
| `SetCooldown` through `BreakPair` (EmigrationDummies.lua:14-73) | `sourceState` (engine.js:186) and `ui/emigration-state.js` | replaced; the per-source pressure and cooldown stay, stored in the save instead of in dummy buildings |
| `OnCityCapture`, `GetProximityRating`, `GetDestination` (Refugees.lua) | `refugeesPercent: 50` is kept in `ui/emigration-config.js` (L106), but the code doesn't read it | not carried over |
| All of `MkzReligion.lua` and `MkzUtils.lua` | | not carried over |
| The CityView.lua additions | `ui/emigration-city-readout.js`, `ui/emigration-city-panel.js` | same idea (Prosperity on the city screen), new code |

Of the Civ V mod's 60 functions and top-level blocks, 3 are ported, 13 are adapted, 17 are replaced or survive only as
an idea (10 of those are the dummy-building storage helpers), and 27 aren't carried over.

### Settings and constants

Every setting in the Civ V mod's `EmigrationSettings.xml`, plus the numbers written into its Lua. Emigration's line
numbers are in `ui/emigration-config.js`.

| Civ V setting | Civ V value | Emigration key | Emigration value | Same? |
| --- | --- | --- | --- | --- |
| `EmigrationBar` | 30 | `emigrationBar` (L29) | 30 | yes |
| `DeltaExponent` | 0.5 | `deltaExponent` (L30) | 0.5 | yes |
| `PoachBlock` | 2 | `poachBlock` (L93) | 30 | no, and it means something else |
| `Cooldown` | 18 | `cooldownTurns` (L104) | 8 | no |
| `RefugeesPercent` | 50 | `refugeesPercent` (L106) | 50 | yes, though Emigration doesn't use it |
| `ScienceFactor` | 25% | `scienceFactor` (L126) | 0.625 against 2.5 for food | same ratio, 25% |
| `HappinessFactor` | 100% | | | not carried over |
| `LocalHappinessFactor` | 100% | `localHappinessFactor` (L130) | 6.0, linear model only (off by default) | no |
| `PopulationFactor` | 100% | `populationFactor` (L131) | 1.0 | yes |
| `NumberOfPoliciesFactor` | 0 | | | not carried over |
| `OrderBonus` | 5 | | | not carried over |
| `FreedomModifier` | 25 | | | not carried over |
| `ReligionModifier` | −10 | | | not carried over |
| `UnemployedModifier` | −10 | | | not carried over |
| `WarModifier` | −10 | `warWearinessModifier` is a different thing, a −12 read of Civ VII war weariness | | not carried over |
| `DangerModifier` | −15 | the violence model (`violencePerPoint` 12, cap 220) | | no |
| `SiegeModifier` | −100 | `siegeModifier` (L144) | −100 | yes, with a different trigger |
| `StarvationModifier` | −200 | `starvationModifier` (L145) | −90 | no (earlier versions used −200) |
| `BaseReluctance` | 5 | `baseReluctance` (L197) | 4 | no |
| `CityState` | 5 × era | `cityStateBarrier` (L203) | 5, flat | same base value |
| `PerExtraPop` | 0.5 | `perExtraPop` (L198) | 0.5 | yes |
| `RecentEmigration` | 5 | | | not carried over |
| `AutocracyBarrier` | 10 | | | not carried over |
| Food, production, gold weight (in the Lua) | 1 each | `foodFactor`, `productionFactor`, `goldFactor` (L123-125) | 2.5 each (1.0 in earlier versions) | same ratio |
| Culture weight (in the Lua) | 1 | `cultureFactor` (L127) | 1.25 | no |
| Great people, faith and tourism in productiveness | 1 each | | | not carried over |
| Food surplus a destination needs | 2 or more | | | not carried over |
| Population a source keeps | more than 1 | `minRuralToEmigrate` (L105) | rural population more than 1 | similar |
| Distance barrier | `log2(d) − 1` | `distanceFactor` (L206) | 0.6 per tile | no |
| Refugee weight | `99999 / (d − 2)²`, half distance for the original owner's cities | | | not carried over |
| AI unhappiness (`Handicaps.xml`) | 100 / 95 / 90 | | | not carried over |
| Speed scaling | `GrowthPercent / 100` | `CostMultiplier / 100` | | same idea |

Seven of the Civ V mod's 23 named settings keep their value. Emigration's config has 260 top-level keys; 17 of them
trace to the original (13 renamed settings and the four yield weights), and the rest are new. Four comments in
`ui/emigration-config.js` paraphrase the original's settings comments:

| Civ V (`EmigrationSettings.xml`, `EmigrationRules.lua`) | Emigration (`ui/emigration-config.js`) |
| --- | --- |
| `only 25% of the science as its disproportional to other yields` (L31) | `weighted down (disproportionate magnitude)` (L126) |
| `destination city is bigger` (L92) | `destination already bigger than the source` (L198) |
| `percent of population lost on conquest escape as refugees` (L25) | `% of rural pop that flees a conquered/razed city` (L106) |
| `EMIGRATION BARRIERS` section header (L82; EmigrationRules.lua L21) | `// emigration barriers (added to a source's reluctance)` (L196) |

### Parts of the Civ V mod that stayed behind

The Civ V mod pairs cities: a growing destination with a food surplus picks one source it can reach by an open trade
route, and another destination can take that source over if its urge beats the old one by the poach margin. Emigration
skips pairing and trade routes, and every source looks for its own best destination each turn. When a city is
captured in Civ V, half the lost population scatters as refugees by a distance-weighted draw. Emigration's crisis
track handles displacement differently, and the Civ V refugee code isn't carried over. A follower of the right
religion moves with each Civ V migrant (`MkzReligion.lua`); Emigration leaves religion out of migration.

The Civ V mod also keeps its per-city state in hidden dummy buildings, replaces the game's city screen
(`CityView.lua` and its two layouts) to show Prosperity, raises AI unhappiness at Emperor, Immortal and Deity, and
breaks pairs when war is declared. Civ VII has real save storage and its own UI hooks, so Emigration uses those
instead, and it leaves the difficulty settings alone. The empire-happiness, policy, Order, Freedom, Autocracy,
religion, unemployment and war-at-large terms of the score aren't carried over either.

## What's new

Shipping UI code grouped by system (JavaScript, HTML and CSS code lines, about 26,200 in all).

| System | Files | Code lines | Counterpart in the Civ V mod |
| --- | --- | --- | --- |
| Core loop: Prosperity score, pull, pressure bar, state, game speed, config | 7 | 1,545 | Partial. About 257 lines sit in functions that adapt the Civ V model. The rest is new: shaped happiness, polity and built terms, tilt and borders permeability, brakes against snowballing and draining small civs, pressure decay, the voluntary and crisis tracks, move budgets, travel time, deaths in a crisis, and the stance preview |
| War, violence and disasters: district damage, pillage, combat events, siege length and loss cap, natural disasters and plague, raids, war naming | 10 | 1,315 | The Civ V mod had a flat −10% at war and −15% with enemies nearby |
| Polity, built environment, per-civ tuning and civ roster, borders, geography and flee direction, cause tracking, the push and pull explainer | 11 | 1,736 | Only the idea of a distance barrier |
| Gameplay effects: departures take a real tile, arrival placement and migrant units, travel time, refugee holding pools and their burden, assimilation costs, attraction dividends, population numbers that match Demographics | 14 | 1,892 | The Civ V mod changed population counts and moved a religious follower |
| Identity: ethnic makeup and integration, the ethnicity lens, diasporas, cultural enclaves (stances, payouts, tiles, skins, pacing), return migration, Call Home, refugee decisions, displaced people's quotes, the Migration Chronicle | 39 | 6,941 | The Civ V mod didn't have these |
| Reporting and UI: the migration dashboard, network flow map and timeline, notifications and the notification train, Prosperity lens and tooltips, city readout and panel, Demographics graphs, telemetry, self-test | 56 | 10,969 | The Civ V city-screen Prosperity box and its two tooltips |
| Settings and options: presets, advanced editor, grouped sliders, the shared Settings Keeper | 5 | 1,815 | The Civ V mod used an XML settings table |
| Total | 142 | 26,213 | |

Beyond the UI code, Emigration adds policy cards across three ages, the enclave improvement and village data,
Civilopedia pages, a full UI in 12 languages, a test suite of about 21,000 lines, and in-game probe tooling.

## Text and data

Every tracked text file in this repo (code, tests, dev tooling, docs, and the text in all 12 languages) was scanned
for runs of six or more words shared with the Civ V mod's own files (all its Lua and XML, its `.modinfo`, and its
additions to `CityView`). The only matches were `<?xml version="1.0" encoding="utf-8"?>` headers, `.modinfo`
boilerplate, and two runs made of XML tag names around the words "per turn" and "Prosperity". Dropping to five words
gives the same result.

- **Strings.** The Civ V mod's 33 strings ("A citizen from X left for the Y", "Emigration in N turns", "Religious
  tensions", "Enemy on the outskirts", "Prosperity difference" and the rest) don't appear in Emigration's text in any
  language. The one shared word is "Prosperity", the name of the score.
- **Text keys.** The Civ V mod uses 33 `TXT_KEY_*` keys. Emigration's 2,752 `LOC_*` keys are its own, and they don't
  match even in their endings.
- **Notifications.** The Civ V mod reuses two of the game's notification types with one-line messages. Emigration's
  notifications, digest lines and toasts are a separate design.
- **Data.** The Civ V mod's data is five dummy buildings and three difficulty updates. Emigration's 13 data files
  (policy cards, enclave improvements, notification types, Civilopedia pages and icons) don't share a row, type or table
  with it.
- **Descriptions.** The Civ V mod ships without a readme, and the description in its `.modinfo` isn't echoed
  anywhere here. Emigration's README explains its own formulas in its own words.
- **Quotations.** The Civ V mod doesn't have any quotations, so the roughly 180 historical quotes Emigration shows (in
  `ui/emigration-displaced-quotes.js`, `ui/emigration-return-quotes.js`, `ui/emigration-quarter-bonuses.js` and the
  Civilopedia) came from elsewhere. [quote-sources.md](quote-sources.md) lists where each one was read.

## Credits and licensing

The Civ V mod doesn't carry a license, copyright line or permission note in any of its files. Its `.modinfo` names its
authors as killmeplease, Tim_the_Texan and Tomahawk.nsk, thanks Afforess, alpaca, Bhruic, doktorstick, gmJamez,
Sneaks, Thalassicus and whoward69, and gives `http://folu.me/Emigration` as its homepage. Six of its Lua files say
"Author: Mk Z" in their header. The files don't say whether Mk Z and killmeplease are the same person, so Emigration
credits both.

Emigration credits "killmeplease, Tomahawk, Mk Z, and Tim_The_Texan" in `emigration.modinfo` (Special Thanks), in the
README's credits, and on the Civilopedia credits page in all 12 languages. The [LICENSE](../LICENSE) names the Civ V
mod as the source of the migration model and says its code and text aren't included. The headers of
`ui/emigration-config.js` and `ui/emigration-prosperity.js` say those files started from the Civ V model and point
here.

## How this was checked

- **The Civ V copy.** The Workshop release of "Emigration (v 6)", confirmed by matching all 14 MD5s listed in its
  `.modinfo`.
- **Line counts.** Non-blank lines that aren't only a comment, counted over the files each mod's `.modinfo` lists.
- **Function map and constants.** Every function in the Civ V Lua and every row of `EmigrationSettings.xml` was read
  and looked up in Emigration's source. Traceable lines were counted by hand inside the functions in the map, and the
  upper bound counts every code line of those functions.
- **Text overlap.** Lower-cased runs of six (and then five) or more words from the Civ V mod's own files, matched
  against every tracked text file in this repo.
- **Line numbers.** Civ V line numbers are from the Workshop release. Emigration line numbers are from version 3.6.2
  and will drift as the code changes.
