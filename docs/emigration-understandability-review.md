# Emigration: can a player explain it back? (review, 2026-10-27)

This review goes through what a player meets in Emigration 4.0.x and checks each piece against five tests. Nothing
here is built or decided. It's a list to choose from.

## The five tests

1. **The cause is where they're looking.** It shows on the settlement: the game's own tooltip, our card, or the city
   readout. A log, a Civilopedia page or an Advanced setting doesn't count.
2. **It's in the game's units.** Population, Happiness, Food, Gold, Influence, turns. The mod's own scores
   (prosperity, pull, pressure, load) are the model's working, and a player can't weigh them.
3. **They can predict it.** They know what will happen before it does, from a rule they could say out loud.
4. **It reads as a reason.** "They left because Food ran short," the way a person would say it.
5. **A lever shows what it does.** Press a button, slot a card or build something, and the card says what changes.

A formula is fine when its result is shown before the player acts: prices and payouts on buttons pass, because the
player reads the number, not the formula. A formula fails when it decides something the player only finds out
afterwards.

## What the mod already does well

These pass, and they're the patterns to copy:

- **The fix line.** "What would stop it: +2 Happiness here (Arena gives +2)." It turns the model's gap into the
  smallest amount of a yield the player knows, and the building that gives it.
- **The loss advice.** "Raise Roma's Happiness to stop its people leaving."
- **Departures take a tile you can name.** Pillaged tiles go first, Food tiles go last in a famine, and the card
  says "Lost: 2 Farms, 1 Woodcutter."
- **Prices on the buttons.** Hasten, Call from abroad (with its odds), the enclave stance payouts and the refugee
  decisions all show what they cost and pay before you press.
- **Enclave stages in words.** "Greek community: foothold," "Becomes an enclave at 30% of Mutsu (now 22%)."
- **Crisis rules a player can say.** People flee once fighting has lasted two turns, a siege that stops attacking
  stalls after three, and one siege can drive out at most 60% of a settlement.

## The patterns that get in the way

### 1. Five hidden brakes do one job

A settlement that's taking in a lot of people gets less attractive. That one idea is spread over five rules. Four of
them show as a weighted row in the card's pull hover, with a label and a bar but no amount the player knows and no
way to act on it, so they fail tests 2, 3 and 5:

| Rule | What it does | What the player sees |
| --- | --- | --- |
| Congestion headwind (`congestWeight`) | Pull penalty from the civilization's assimilation load | "Congestion" row |
| Anti-snowball (`antiSnowballWeight`) | Pull penalty on moves into a civilization above 1.25× the average size | "Dominant power" row |
| Size friction (`perExtraPop`, `perFewerPop`) | Moving to a bigger, or a smaller, settlement costs pull | "Overcrowding" and "Leaving a larger settlement" rows |
| Inbound cap (`maxGainPerCityPerTurn` 4) | At most 4 arrivals a turn; the rest wait on the road | Nothing, unless they read the log |
| Drain (`drainFor`) | Less outflow from civilizations below their fair share | "Small civilization brake" row |

**Proposal:** one visible rule. Newcomers cost Happiness in the settlement they move to while they settle in (the
cost probed in roadmap section 67). An unhappy settlement scores lower, so it draws fewer people on its own, and the
player can see why in the game's own Happiness tooltip. That replaces the congestion brake. Anti-snowball and drain
work at the civilization level, which a settlement's Happiness can't, so they stay and get worded on the card ("Rome is
the largest power around: fewer foreigners move there"). The inbound cap can stay as a safety limit if the card says
"2 more on the road, arriving as there's room."

### 2. Newcomers cost something in four places

| Cost | Where it's charged | Shown |
| --- | --- | --- |
| Assimilation fee | Gold and the civilization's Happiness stockpile (delays the next Celebration) | One readout line, civilization-wide |
| Refugee holding pool | Gold and Happiness per refugee still waiting to settle | Nothing |
| Migrant-unit holding cost | Gold and Happiness per unsettled Migrant unit | Nothing |
| Contested enclave strain | The civilization's Happiness stockpile, 4 a turn per enclave while at war with its homeland, up to 12 | The enclave tooltip says "contested"; the cost isn't shown |

**Proposal:** one cost and one state. Every arrival is "settling in" for a set number of turns, and while they are,
they cost Happiness (and Food, if you want growth slowed) in that settlement, through the native line. Refugees
settle in the same way, so the holding pool and its separate upkeep go. The Migrant-unit cost can stay, since that
setting is opt-in and the unit sits on the map where the player can see it. Its cost should show on the unit's
tooltip. Contested strain moves into the same native settlement line.

### 3. Three ways home, three rule sets

| Mechanic | Who | Rule |
| --- | --- | --- |
| Coming home (homecoming) | Your own people displaced inside your civilization | Calm 3 turns (10 after fighting), one back every 4 turns, then the split formula |
| Return migration | A diaspora abroad | 6% of them a turn when the homeland is at peace and doing well, at most one move per settlement every 6 turns, a quarter as many with an enclave |
| Call from abroad | Your people abroad, paid | 18% odds a person, price shown |

A player who learns one can't use it to predict the others.

**Proposal:** one rule for people going home on their own, wherever they are. "People who left because of trouble
start going home once home has been calm for a few turns. Most go back after a short absence. The longer they've
been away, or the better off they are where they live now, the more of them stay." Return migration becomes this
rule for people abroad. The paid buttons stay as the way to bring people sooner.

### 4. Formulas that decide things after the fact

| Formula | Decides | Proposal |
| --- | --- | --- |
| Return split: 80%, minus 2 points a turn after 5, floor 30%, ×0.75 if 15+ prosperity better off | How many come home | Say the rule in words, and show each group's reason: "11 coming back, 12 staying: they've been away 30 turns." |
| Enclave bars scaled by average settlement size, relaxed through the age while a civilization has none | When an enclave forms | Passes already: the readout shows the bar in force ("at 30%, now 22%"). Keep it. |
| Fade: under 12.5% and under the size bar for 12 turns | When an enclave ends | Passes: the readout counts the turns down. Keep it. |
| Refugee settle rate: ×1.25 happy, ×0.6 unhappy, -0.25 per crowded urban point | How fast refugees join | Goes with the holding pool (pattern 2). |
| Crisis deaths: 20% of the trapped rate while fleeing, ramped over 6 turns | Who dies | Show "People are dying here: nowhere safer to go" on the card while it's happening. |

### 5. Two numbers called prosperity

The settlement score that moves people runs from about -12 to 34. The Prosperity lens scores tiles in points (a
wonder +6, a building +2) with bands named Flourishing to Blighted. They share a name and are different scales, and
the lens score doesn't decide anything.

**Proposal:** rename the lens to what it shows (how built-up and cared-for the land is, for example "Settled land"),
or make it show the settlement score's terms. And keep the settlement score off the screen: where a number would
appear, give the reason instead, the way the fix line does.

### 6. Leader and civilization tuning: keep it

`civTuningEnabled` (on, strength 0.7) offsets leader and civilization abilities that would otherwise skew the model:
Khmer's -5 Happiness in non-capital settlements would bleed them of people, so their push to leave is offset;
Franklin, Isabella and the Ottomans' Happiness and Celebration engines would make runaway magnets, so their pull is
damped; Babylon and Carthage are forced tall, so they're shielded from the density penalty; Normans and Dai Viet hold
more people under siege, to match their fortifications. It's there so these civilizations behave the way a player
would expect from the rest of the rules, so it helps understanding rather than hurting it. Keep it.

Two follow-ups:

- `assimilationEase` (conquerors pay more to absorb the people they take) and `integrationSpeed` scale the
  civilization-wide newcomer fee. If the settling-in cost replaces the fee (pattern 2), these entries move onto the
  new cost or get decided again. The Happiness, density, siege and source entries aren't affected.
- Franklin may be damped twice: the shaped happiness model already cut his Glass Armonica effect from about 50× to
  about 2×, and he also has the 0.75 tuning and the memento's 0.9. Worth one comparison before changing anything.

### 7. Policy cards with too many parts

| Card | Parts | Proposal |
| --- | --- | --- |
| Pro-Immigration Stance | +50% pull, refugees tilted toward you, enclaves paid in full at war, +Influence, +Food | One migration effect ("More people choose your settlements") plus its native yield. Drop the refugee tilt and the wartime enclave rule from it. |
| Anti-Immigration Stance | Inbound ×0.4, outbound ×0.6, refugee pool ×0.4, enclaves paid ×0.5, +Production, -Influence | One migration effect ("Fewer of your people leave, and fewer foreigners come") plus its native yields. The refugee-pool part goes with the pool. Drop the enclave cut. |
| Talent Attraction | +1 Science per 5 Population (per 4 in Modern), -2 Gold a settlement | Understandable as written. Its problem is balance and that it pays on all population, not newcomers (roadmap section 66). |
| Consular Protection | +1 Influence per enclave of yours abroad (up to +4), grievances against a host on the Anti-Immigration Stance | Understandable. The Influence is a script grant outside the yield breakdown; it should show on the card or in the Policies tab. |

"+50% pull" fails test 2: pull is the model's number. Worded as an outcome, the player can check it on the Arriving
pane.

### 8. One idea, several words

- **Taking people in:** assimilation, integration, resettlement and settling in are four words for nearly the same
  thing. Proposal: "settling in" for the turns a newcomer costs something, and "integration" only for people
  becoming your people over time (the composition pies).
- **Turning people away:** the Anti-Immigration Stance and Dissuade newcomers both mean fewer come. They differ in
  reach (the whole civilization against one settlement), and the card should say that in one line where both show.

### 9. Turning things off by hand

There are 122 Advanced settings, plus presets and sliders. That's fine as a workbench, but a player who changes
one can't predict what it does. The Options-tab sliders (movement between civilizations, refugees from conflict) and
the presets are the player-facing part. Proposal: leave Advanced as it is, and when a mechanic above is cut, remove
its setting with it rather than leaving it at 0.

## Mechanic by mechanic

P = passes, H = half, F = fails, against tests 1 to 5.

| What the player meets | 1 | 2 | 3 | 4 | 5 | Note |
| --- | --- | --- | --- | --- | --- | --- |
| Why people leave (pressure gauge, five words) | P | H | H | P | P | The gauge is a model number with words on it; the reasons and the fix line carry it |
| Departure forecast ("about 3 in the next 4 turns") | P | P | P | P | H | Good; doesn't say what would change it |
| Where they go (Pulled toward, Attracting from) | P | H | H | P | P | Pull terms show as weights; the five hidden brakes (pattern 1) make it hard to predict |
| Tile lost at the source | P | P | P | P | P | Keep |
| Transit, 1 to 4 turns | H | P | H | P | n/a | "On the road" should show the turns left |
| Arrival placement (ask, automatic, Migrant unit) | P | P | P | P | P | Keep |
| Newcomer cost | F | H | F | F | F | Pattern 2 |
| Refugee holding pool | F | F | F | F | F | Pattern 2 |
| War refugees, caps, stalled sieges | P | P | P | P | P | Keep |
| Crisis deaths | H | P | F | H | n/a | Pattern 4 |
| Refugee decisions | P | P | P | P | P | Keep |
| Disaster refugees (only where it did damage) | H | P | P | P | P | The card could say "the flood damaged 2 tiles here" |
| Plague carried by migrants | F | F | F | H | n/a | Keep; only into settlements without plague; name it on the arrival notice |
| Policy cards | P | H | H | P | H | Pattern 7 |
| Open Borders adds movement | H | F | H | H | n/a | Shows only inside "Border permeability"; name it ("Open Borders with Rome") |
| Dissuade newcomers | P | P | P | P | H | Its reason to exist is pattern 2's cost |
| Integration (composition) | P | P | P | P | n/a | Keep; rename the cost (pattern 8) |
| Return migration (diaspora) | F | P | F | H | n/a | Pattern 3 |
| Enclaves: stages, recognition, payouts | P | P | P | P | P | Keep |
| Contested enclave strain | F | H | F | H | n/a | Pattern 2 |
| Coming home and the split | P | P | F | H | P | Patterns 3 and 4 |
| Hasten and Call from abroad | P | P | P | P | P | Keep |
| Prosperity lens | P | F | n/a | H | n/a | Pattern 5 |
| Leader and civilization tuning | n/a | n/a | P | n/a | n/a | Keeps outcomes predictable across leaders; pattern 6 |
| Attraction dividend for raids | F | P | F | H | n/a | Keep; it's Diplomacy Extended's raid payoff. Show it where the raid is |

## A suggested order

1. **Newcomers settle in (patterns 1 and 2).** One native cost replaces the fee, the holding pool's upkeep and three
   of the five brakes. It's the biggest gain in understanding, and the probe says it works.
2. **One rule home (patterns 3 and 4).** Homecoming and return migration under one rule, said in words, with each
   group's reason on the card.
3. **The cards (pattern 7).** One migration effect each, worded as an outcome.
4. **Plague carry and the raid dividend stay.** Plague carry changes to reach only settlements without plague. The
   raid dividend (Diplomacy Extended's Talent Raid) gets shown where the raid is.
5. **Words (patterns 5 and 8)** once the mechanics settle, along with the translations.

Each step is a mechanics change, so each needs a lab run before release, and the watch list gets an item per step.
