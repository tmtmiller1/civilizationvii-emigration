# Emigration — Player Experience Risks and Mitigations

What is likely to make a player upset or disappointed on a playthrough, why it happens in the current
implementation, and how each risk can be addressed without re-tuning every number. Each entry names the
symptom the player sees, the mechanism behind it, the reason it reads as unfair, and the mitigations,
with the modules and knobs involved. Status lines say what is built and what is only proposed.

The ordering is by how likely the risk is to sour a game, not by how hard it is to fix. Section 1 is the
short list of structural fixes that remove whole categories of complaint. Sections 2 to 5 are the full
discussion. Section 6 is the recommended order of work. Sections 7 and 8 are the implementation plans,
hook by hook.

Items that have been addressed to a satisfactory degree are moved out of this file into
[player-experience-addressed.md](player-experience-addressed.md), with what was done and whether it was
watched in game. This file holds only what is still open.

Everything here describes the shipped defaults as of 2026-09-13. Numbers are cited so the reader can
check them against `ui/emigration-config.js`; they are not proposals to change.

---

## 1. Summary

The pattern across the risks is not that the numbers are wrong. It is that the player has no agency
before a loss, no warning that it is coming, and no path back afterward. The mitigations therefore
follow three lines:

1. **Warn and offer counterplay before a loss lands.** A pre-departure state, a per-city intake toggle,
   a protect-this-city action, a preview before an enclave takes a tile.
2. **Break feedback spirals structurally.** Charge once per crisis rather than per point, disarm the
   punishments when a city is already at the floor, stop counting a siege that is not progressing.
3. **Make losses reversible and legible.** Abandoned tiles come back as pillaged rather than deleted,
   removed buildings return to the queue at a discount, every loss notification names its cause and its
   remedy.

Three changes remove the most complaint for the least work: the pre-departure warning (2.1), the siege
stalemate rule (2.3), and the per-city intake toggle (2.4).

---

## 2. Risks most likely to upset a player

### 2.1 The mod kicks a player while they are down

**Symptom.** A city becomes unhappy or starts starving. People leave. Each departure destroys an
improvement. The city's yields fall. The treasury is charged gold. The city gets unhappier. Repeat.

**Mechanism.** Three rules compound on the same city in the same turns:

- Prosperity emigration (`emigration-prosperity.js`, `emigration-pull.js`): low happiness and low
  per-capita yields raise pressure; at `emigrationBar` (30) a point leaves, then the source rests for
  `cooldownTurns` (8).
- Real departures (`emigration-departure-tile.js`, `departureRemovesTile` on): the point leaves with one
  outlying rural improvement. The yields of that tile are gone until the city regrows and places a new
  one.
- The base game's own unhappiness penalties, which the prosperity score reads and which the yield loss
  deepens.

**Why it reads as unfair.** The player is punished twice for one problem. The base game already punishes
an unhappy city. Adding a tile loss on top makes recovery slower exactly when the player is trying to
recover.

**Mitigations.**

- *Pre-departure warning state.* When a city crosses `emigrationBar`, do not move a point yet. Enter a
  visible "people are preparing to leave" state on the city for a small number of turns (2 to 3), fire
  one notification naming the cause and the remedy, and only then depart if the pressure is still above
  the bar. The city readout (`emigration-city-readout.js`) already shows the pressures; the state adds a
  countdown. A loss the player was told about is fair. Status: proposed.
- *Charge gold once per crisis, not per point.* Replace the per-point charge with a single relocation
  cost the first time a city starts bleeding in a crisis window, then nothing until the window resets.
  Same flavor, no compounding. The per-turn cap already exists in `chargeDepartureGold`; the change is
  a per-city "charged this crisis" flag with a 30-turn quiet reset. Status:
  proposed.
- *Disarm the punishments at the floor.* Skip the tile loss and the gold charge while the city's
  happiness is already below the game's Unhappy stage or the treasury is under a small floor. The counter
  decrement still happens, so the population still moves, but the mod stops adding to what the base game
  is already doing. The polity stage is already read per city (`emigration-polity.js`). Status:
  proposed.
- *A protect-this-city action.* A one-time, costly reaction the player can take from the city readout:
  spend gold or Influence to hold a city's people for N turns. This converts the gold from a deduction
  into a choice. The dilemma module (`emigration-dilemma.js`) already has the cost-and-choice pattern
  and the notification plumbing. Status: proposed.

### 2.2 Buildings vanish in a crisis

Status: resolved 2026-09-14 by removing the crisis urban leg. No building or specialist is ever taken; crisis
flight and deaths stop at the rural floor. The specialist step never worked (`docs/engine-limits-from-probes.md`
1.4). The text below describes the removed code.

**Symptom.** A flood, a plague, or a border war deletes a building the player spent hundreds of
production on.

**Mechanism.** `urbanEmigrationEnabled` (on). Once a settlement in crisis has no rural improvement above
its floor, the next crisis point leaves from the urban core: a specialist in the player's own cities,
otherwise a building, removed by the engine with one urban population point. Earlier-age buildings go
first, then the cheapest, then the farthest. Walls and defensive buildings are never taken. Three caps
apply: `urbanFloor` (1), `maxUrbanLossPerCityPerTurn` (1), and `urbanLossCapPct` (0.34) per crisis,
resetting after `urbanRecoveryTurns` (30) without a loss.

**Why it reads as unfair.** The caps are invisible to the player. They see "the mod deleted my
Library". The choice of building is deterministic but not explained, and there is no way to get it back
except rebuilding at full price.

**Mitigations.**

- *Damage instead of delete.* Probed 2026-09-14 (mod tests 36 to 38) and closed: the engine exposes no
  script path that damages a constructible, unit pillage is refused on the owner's own tiles, and a
  half-built re-creation is an orphan the city cannot finish. See the addressed ledger. Status: not
  possible.
- *Return the building to the queue at a discount.* If removal must stay, record the removed type on the
  city and grant a production rebate on the next build of that type. The record exists (the departure
  record carries `subject: "building"` and the type). Status: proposed.
- *Name it and explain it.* The notification for a building loss should say which building, why it was
  chosen (oldest age, cheapest), and that it is the last resort after rural tiles. Status: the cause is
  in the record; the explanatory line is not shown.
- *Ship it off by default.* Set `urbanEmigrationEnabled` to false in the defaults and leave it as an
  opt-in for players who want a crisis to reach the core. Status: not made.
- *Exempt the AI.* See 3.4.

### 2.3 Sieges the AI never finishes

**Symptom.** An AI army parks next to a city. The city bleeds people, then dies down, then loses
buildings, for twenty or thirty turns. The AI never assaults. The player can do little except sortie.

**Mechanism.** `emigration-violence.js` treats a district as besieged when the engine's
`districtBesieged` flag is set, which happens when enemy units stand adjacent. That alone holds the
violence fraction at `siegeBesiegedFloor` (0.3) with no damage at all. Violence feeds the war penalty,
the flee vector, and crisis death (`emigration-engine.js`: `crisisDeathShare` 0.2 of the trapped
rate, ramping over `deathRampTurns` 6). War displacement is capped at `siegeLossCapPct` (0.6) of the
onset population, but crisis death is not capped, and the urban leg (2.2) follows once rural tiles are
gone. The AI is bad at capturing cities and good at leaving units in place, so this state can persist
for a whole war.

**Why it reads as unfair.** Real sieges should hurt. A stalemate should not. The player is losing a
city to units that are not attacking it, and the base game gives them no signal that anything is wrong.

**Mitigations.**

- *Stalemate rule.* If a district has been besieged for N turns (10 is a reasonable start) with no
  fresh damage to any district and no capture, mark the siege stalled: hold the violence fraction to
  the decayed value instead of the `siegeBesiegedFloor`, stop crisis death from the siege cause, and
  say "siege stalled" in the readout. Fresh damage restarts it. The signals already exist
  (`districtDamageFrac`, `districtBesieged`, `violenceDecay`); the addition is a per-city
  turns-since-damage counter. Status: proposed.
- *Cap siege deaths the way displacement is capped.* Apply a per-siege death cap analogous to
  `siegeLossCapPct` so a siege can wound a city but cannot empty it without a capture. This is a
  smaller change than the stalemate rule and covers the same worst case. Status: proposed.
- *Never let a siege reach the urban core without damage.* Gate the urban leg on real district damage
  in the current crisis, not on the besieged flag alone. Status: proposed.

### 2.4 Immigration the player did not ask for

**Symptom.** A prosperous city keeps receiving migrants. Each arrival drains happiness and gold for
several turns. The player did nothing and cannot stop it without a policy.

**Mechanism.** Arrivals (`emigration-arrivals.js`) land at the most attractive reachable city. Each
migrant adds assimilation load (`assimilationLoadPerMigrant` 1.0, plus `assimilationCostPerPop` 0.05
per destination population point), which decays at `assimilationDecay` 0.7 per turn and drains
`assimilationHappiness` 0.5 happiness and `assimilationGold` 1.5 gold per unit of load, with a
wealth-aware multiplier on the gold. The inbound cap is `maxGainPerCityPerTurn` (4). The only player
lever is the Anti-Immigration Stance policy, which costs Influence and applies empire-wide.

**Why it reads as unfair.** Players expect to control their cities. The mod is spending their happiness
for them, in their best cities, with no per-city control. The costs are bounded and the migrants are a
net gain over time, but the drain arrives first and the gain is silent.

**Mitigations.**

- *Per-city intake toggle.* A button on the city readout that sets a city to closed: it takes no
  migrants and pays no assimilation cost. Flows reroute to the next best destination. No policy, no
  Influence, one click. The readout already exists (`emigration-city-readout.js`); the toggle is a
  per-city flag read by the destination selection in `emigration-pull.js`. Status: proposed.
- *Prompt for large waves.* The refugee decision (`emigration-dilemma.js`) fires only on conquest sprees
  and plague crises. Extend the trigger to any single-turn inbound wave above a size threshold so the
  player accepts the cost knowingly or turns the wave away. The choice and cost pattern is already
  built. Status: proposed.
- *Show the gain next to the cost.* The city panel should show the yield the arrivals now produce beside
  the assimilation drain, so the trade is visible. Status: the panel shows the drain; the gain is not
  called out.

---

## 3. Risks likely to disappoint

### 3.1 Enclaves are rare for the human player

**Symptom.** A player with six cities finishes an age without an enclave. The feature reads as absent.

**Mechanism.** Formation needs a foreign community with `quarterMinStock` (3) points and either
`quarterEstablishedShare` (0.30) of the settlement or the scaled size bar (`quarterEstablishedStock` 6
at a mean settlement population of `quarterStockRefPop` 18), held for `quarterDwellTurns` (8) with
`quarterDwellGrace` (3). Integration erodes a minority at `integrationRate` 0.03 per turn, so only a
concentrated inflow reaches the bar. Measured in mod test 31: three enclaves in forty turns on a
seven-civ map, all in AI cities.

**Why it disappoints.** The headline feature is invisible to the player who read about it. Enclaves in
AI cities are visible on the map, but the player does not host one.

**Mitigations.**

- *Earn enclaves through play.* Count a "welcome them" refugee decision and Open Borders arrivals double
  toward the enclave stock in the player's cities. The player then causes enclaves rather than waiting on
  the dice. Status: proposed.
- *Pace formation per age.* Instead of pausing integration, the outcome is paced: while a host has
  formed no enclave this age, its formation bars fall with the age's progress, and a per-age cap closes
  the age. Status: built 2026-09-14 (`emigration-enclave-pacing.js`); see the addressed ledger.
- *Show progress.* The readout shows the leading foreign community against the live bars and its
  settling clock; the dashboard's Diversity table has an Enclave column. Status: built 2026-09-14.

### 3.2 Borrowed art breaks immersion

**Symptom.** A Roman enclave appears as a Bulgarian Hidden Fortress. A Han enclave places a Great Wall
segment in the player's city.

**Mechanism.** The engine binds improvement art by type name, so an enclave must be an existing type.
`enclaveTileSkin` 1 (THEMED) tries the origin's own unique improvement, then another civilization's
improvement of the same yield family, then the Village (`emigration-enclave-skins.js`). The marker
names the true origin above the tile.

**Why it disappoints.** The model contradicts the label. Wall segments and terrace farms carry strong
identities that do not transfer.

**Mitigations.**

- *Village for mismatches.* Use the Village skin whenever the only candidate is another civilization's
  signature improvement, and reserve borrowed art for yield-only fallbacks that read as generic
  (Caravanserai, Hillfort, Megalith). Drop the wall segments from `FAMILY_SKINS` and `UNIQUE_IMPROVEMENTS`
  for placement purposes. Status: a table edit; not made.
- *Player choice of skin.* `enclaveTileSkin` 2 (VILLAGE) already exists. Surface it in the first-launch
  summary (5.3) so players who dislike the borrowed art know the switch exists. Status: option exists;
  not surfaced.

### 3.3 Automatic recognition takes a farm without asking

**Symptom.** An enclave overwrites an outlying farmstead. The player did not choose the tile or the
stance.

**Mechanism.** `quarterRecognition` 2 (automatic everywhere) forms the enclave with the origin's first
stance. `placeEnclave` prefers an empty plot, otherwise takes over the farthest plain farmstead. Any
yield the old tile gave that the new one does not is paid back each turn as `placed.compensation`.

**Why it disappoints.** The compensation makes it fair on paper. The player still watched a tile change
without consent, in their own city.

**Mitigations.**

- *Preview and veto.* In the player's own cities, announce the enclave one turn before placement: "an
  enclave will form in Rome on this tile", with options to move it to another plot or decline. AI hosts
  stay automatic. The pop-up mode (`quarterRecognition` 0) has the decision plumbing. Status: proposed.
- *Prefer empty plots harder.* Purchase or claim an adjacent unowned plot for the enclave before taking
  a farm, when the city has the gold. `purchasePlot` lands after the call (watched). Status: proposed.

### 3.4 The AI cannot play the system

**Symptom.** Over a long game AI empires shrink or stall more than the player's. The game gets easier
and the feature feels one-sided.

**Mechanism.** Every rule applies to every civilization: departures with tile loss,
urban building removal, assimilation costs, enclave placement. The AI does not raise happiness to keep
people, does not adopt the stance policies deliberately, and does not rebuild abandoned tiles on
purpose. It only benefits from the parts that need no decision (arrivals, enclave yields).

**Why it disappoints.** A migration system that quietly hollows out the opposition removes the
challenge it was meant to add.

**Mitigations.**

- *Exempt the AI from the parts it cannot answer.* Skip the urban leg for AI
  civilizations, or apply them at half. The player still feels the full system. The owner check is a
  one-line gate in `chargeDepartureGold` and the urban branch of `commitSourcePoint`. Status: proposed.
- *Give the AI the arrivals bias.* Weight the destination score slightly toward AI cities at higher
  difficulty, mirroring the base game's difficulty bonuses. Status: proposed.
- *Measure it.* Extend `scripts/tile-transfer-stress.mjs` or a probe to report per-civilization net
  population and tile count over a hundred turns, human versus AI, before changing anything. Status:
  the harness exists; the comparison is not scripted.

---

## 4. Things to state up front

### 4.1 Multiplayer is not supported yet

The mod assumes one human on one client. Checked against the code on 2026-09-17 (game 1.5.0), these break
when a second human joins:

- **Every client runs the pass.** `onTurnActivated` in `emigration-main.js` runs `doPass`, the dead-district
  sweep, and the calm-empire call-home offer on the local player's activation, and `chargePerTurnCosts` on
  every civilization's activation. In a network game each client is its own script isolate with its own
  `lastLocalTurnRun`, so three humans send three sets of departures, arrivals, enclave placements, district
  removals, and treasury charges each turn. Hotseat was watched (mod test 121) and behaves differently for one
  reason: both humans share one client, so the second human's activation is skipped by that same module
  variable. The activation itself does fire for each human, and the local player changes with the handoff
  (player 0 as local 0, then player 1 as local 1, inside one game turn), so the work that is not
  interval-gated, the sweep and the call-home offer, still runs once per human.
- **Some writes are not requests.** Tile, district, and unit writes (`CREATE_ELEMENT`, `DESTROY_ELEMENT`) and
  arrival placement (`EXPAND`, `ASSIGN_WORKER` with `Amount: 1`) go through the engine's request queue. The
  yield and counter writes do not. `Players.grantYield` (assimilation, migrant holding, the refugee burden,
  the attraction dividend, enclave stance yields, decision and call-home costs) and `addRuralPopulation`
  (arrivals in settlements the local player does not own, refugee settlement, restored returns, and the -1
  where no tile is left) change the simulation directly. Direct mutators apply even before Begin Game, when no
  request lands (engine limits 6.5). A direct change on one client is a desync.
- **The planner reads the local player's view.** Tile scoring reads `GameplayMap.getYields(plot,
  localPlayerID)` (`emigration-tile-score.js`), and with the `requireMet` option on (off by default) the model
  drops every civilization the local player has not met (`localHasMet` in `emigration-cities.js`). Clients
  planning the same turn would plan different worlds, and a single planner would impose its own player's view
  on everyone.
- **Sixteen stores live in the game configuration, and two belong to one viewer.** Simulation state and shared
  records (`EmigrationState_v1` and the composition, assimilation, dividend, dilemma, disaster, quarter,
  refugee pool and burden, return, war, violence, migration statistics, and chronicle keys) are written with
  `Configuration.editGame().setValue`; nothing shows that an in-game edit reaches the other clients. The
  notification log and the announced-news keys (`EmigrationNotif_v1`, `EmigrationNews_v1`) are one viewer's
  history in a store every client would share. Option values are mirrored there from `localStorage`, so each
  client's settings would describe a different game. Demographics publishes its effective analytics policy,
  which is per player, to one shared key that Emigration reads first.
- **Some state lives only in memory.** The call-home cooldowns (`_lastCall`), the combat ledger and its reader
  cursors, the pending local arrivals, and `lastLocalTurnRun` are module variables. A host change loses them;
  the call-home cooldown is already lost on a single-player reload.
- **"The player" means the local player.** Fourteen modules read `GameContext.localPlayerID`. The refugee
  decision, the enclave recognition pop-up, the Newcomers pop-up and automatic placement, the migrant unit,
  the call-home offer, and every toast are shown or applied for the local player only. Requests are accepted
  only under the sender's own id (engine limits 3.3).
- **The game's own Grow City prompt follows mod arrivals.** A point the mod adds raises a blocking "Grow City"
  notification for its owner from the next turn until it is placed (mod tests 59 to 67). What a turn timer
  does to an unplaced point in a simultaneous-turn game has not been seen.

Turning the write layers off in multiplayer is not a mitigation. Every feature of the mod is a write, so what
would remain is a dashboard for a mod that does nothing.

**Mitigation.** Run the mod with full writes in multiplayer. One client is the authority: it plans from inputs
that do not depend on who is watching, and sends every world write through a channel the engine replicates.
Simulation state travels the same way; per-viewer logs and preferences are kept per player. Each human's
client shows its own notifications, runs its own arrival placement, and hosts its own decisions and call-home
requests, which reach the authority by a replicated route. The design, its carriers, and the probes that
choose between them are in 8.9. Status: designed, probe-gated, revised 2026-09-17. The script carrier was
probed and closed that day (mod test 119). Nothing else about multiplayer has been watched, and whether the
remaining carrier replicates at all needs a two-client game.

### 4.2 The mod cannot be removed from a save

The modinfo does not set `AffectsSavedGames` to 0, so the game treats the mod as affecting saved
games, which is the default. A save made with the mod needs it to load. Enclave tiles placed as other
civilizations' unique improvements would persist as foreign improvements if the flag were ever changed.

**Mitigation.** A first-launch summary (5.3) that says this before the first save. Status: not written.

### 4.3 Complexity

Eighty-five knobs, a five-tab dashboard, two lenses, and a guide. Most players never open Options. The
defaults carry the whole experience, which is why the risks in section 2 matter more than any tuning.

**Mitigation.** Three presets already exist (Low, Medium, High). Add a fourth, "Gentle", that turns
off the urban leg and crisis death, and make it the first-launch suggestion for new
players. Status: proposed.

---

## 5. Cross-cutting mitigations

### 5.1 Every loss names its cause and its remedy

The departure record carries `cause` and `subject` (`tile`, `specialist`, `building`, `counter`). The
notification (`emigration-notifications.js`) shows the cause. It does not show what was lost or what
would stop it. Add a remedy line per cause: unhappiness, "raise happiness or build an entertainment
building"; starvation, "restore net food"; war, "relieve the siege or make peace"; disaster, "it clears
as distress fades". Status: proposed.

### 5.2 Losses come back

Where the engine allows it, prefer damaged states to deletion (2.2), and record removed things so a
rebuild is discounted. A player who has a task after a loss is a player who keeps playing.

### 5.3 A first-launch summary

One screen the first time the mod loads in a game. It says what the mod will do to cities (people
leave, tiles go with them, crises kill), that migrants arrive and cost happiness for a few turns, that
enclaves are real tiles, that the mod cannot be removed from the save, what multiplayer support has been
watched (4.1), and where the presets and the per-city controls are. Players forgive what they were told. The modal
plumbing in `emigration-dilemma-view.js` can host it. Status: proposed.

---

## 6. Recommended order of work

1. Pre-departure warning state (2.1) and the remedy line in loss notifications (5.1). Together they
   turn every loss into an announced one.
2. Siege stalemate rule or per-siege death cap (2.3).
3. Per-city intake toggle (2.4).
4. AI exemption from the urban leg (3.4).
5. Damage-instead-of-delete probe for buildings (2.2). If the engine has no damage operation, the
   discounted rebuild.
6. First-launch summary with the save statement and the multiplayer status (5.3, 4.2, 4.1).
   Multiplayer itself is a separate track (8.9), starting with a single-player probe.
7. Enclave preview in the player's cities (3.3), Village for mismatched art (3.2), and progress-to-bar
   in the readout (3.1).

Each item is independent. None requires re-tuning the existing caps, which were calibrated in game
(`devtools/engine-probe/README.md`, mod tests 4 to 35) and should stay as they are.

---

## 7. Implementation plan for Summary item 1: warn and offer counterplay

Item 1 has four pieces: the pre-departure state, the per-city intake toggle, the protect-this-city
action, and the enclave preview. Each is laid out below with what exists, what to build, where it hooks,
what it stores, what it shows, and how it is verified. The gates that apply to every piece are listed
once at the end.

### 7.1 What already exists and is reused

- **A rising-pressure cue.** `noteVoluntaryCue` in `emigration-engine.js` records any voluntary source
  above `voluntaryCueFraction` (0.66) of the bar. `reportPressureCues` in `emigration-feedback.js`
  toasts it for the local player, one per settlement per `voluntaryCueCooldownTurns` (12). This is a
  warning, but it is a toast with no hold behind it, and it says nothing about what would stop the
  departure. The crisis track has no cue at all.
- **Per-source persisted state.** `state.sources[key]` holds `pressure`, `cooldown`,
  `crisisPressure`, `crisisCooldown`, saved as `EmigrationState_v1` in the game configuration by
  `saveState` and normalized on load by `normalizeSourceEntry`. New per-city fields go here.
- **A destination predicate.** `bestDestination(src, ranked, ownerPop, acceptDest)` in
  `emigration-pull.js` skips any candidate the predicate rejects. `bestOpenDestination` already passes
  the inbound-cap predicate. The intake toggle is one more clause in that predicate.
- **A choice-and-cost modal.** `emigration-dilemma.js` builds choices with a label, an effect string
  computed from live config, and a note, shows them with `showDilemma`, and applies costs with
  `deduct`. The protect action reuses this shape without the modal.
- **The city readout.** `emigration-city-readout.js` renders a per-city panel on
  `CitySelectionChanged` from a snapshot built in `emigration-city-readout-data.js`, which already
  carries `pressureToBar`, `onCooldown`, `atRisk`, and `riskReasons`. Buttons and the countdown belong
  on this panel.

### 7.2 The pre-departure state

**Behavior.** A voluntary departure does not fire the first time a source crosses the bar. The source
enters a "preparing to leave" state for `departureNoticeTurns` (default 2) turns. While in it, the
readout shows a countdown and the remedy, and one notification fires. When the notice expires, the
point departs if pressure is still at or above the bar. If pressure fell below the bar during the
notice, the state clears and nothing leaves. The crisis track keeps its every-turn flight, because
forced displacement should not wait, but it gets a notification on the first crisis point of a crisis
window with the same remedy line.

**Why a hold and not just a louder cue.** The existing cue fires at two thirds of the bar with no
promise attached. A player who reacts and fixes the cause can still lose the point next turn because
pressure kept accumulating. The hold gives the fix time to register in the prosperity score, which is
read fresh each pass.

**State.** Two fields on the source entry: `noticeUntil` (mono turn, 0 when idle) and `noticedCause`
(the cause string at the time the notice began, so the readout names it). Both normalized in
`normalizeSourceEntry` with the existing finite-number and string helpers.

**Hook.** `shedVoluntary` in `emigration-engine.js`. Today it accumulates pressure, cues below the bar,
and calls `shedBurst` at or above it. The change:

    at or above the bar, notice idle      → set noticeUntil = monoTurn + noticeTurns, push a notice
                                            record, return [] (nothing leaves)
    at or above the bar, notice running   → return [] until monoTurn >= noticeUntil
    at or above the bar, notice expired   → shedBurst as today, then clear the notice
    below the bar, notice running         → clear the notice, push a "stayed" record

The notice record is a transient like the pressure cues: a new `takeDepartureNotices` drain read by the
reporter each pass. `emigration-engine.js` is at the file-size gate, so the notice logic lives in a new
`emigration-departure-notice.js` exporting `noticeGate(st, monoTurn, cfg)` that returns one of
`start`, `wait`, `fire`, `stayed`, and `shedVoluntary` switches on it.

**Config.** `departureNoticeEnabled` (true), `departureNoticeTurns` (2, scaled by game speed through
`speedTurns`), `departureNoticeCrisisCue` (true). Option rows and `LOC_EMIG_T_*` text in the eleven
locales.

**Feedback.** One notification on `start`, own-loss accent per the color rule in §9 of the README,
titled "People are preparing to leave {city}" with the cause and a remedy line from a small
cause-to-remedy table in `emigration-causes.js`: unhappiness, "raise happiness"; prosperity, "raise
yields per citizen or happiness"; starvation, "restore net food"; war, "relieve the siege or make
peace"; disaster, "distress clears on its own". One notification on `stayed`, neutral accent, "The
people of {city} decided to stay". Both logged to the Notifications tab through `logNotification`. The
readout gains a line: "Departure in {n} turns unless {remedy}".

**Tests.** `tests/departure-notice.mjs`: the four gate outcomes, speed scaling, the notice clearing when
pressure drops, the notice surviving a save and load through `normalizeSourceEntry`, and the AI path
unchanged when the option is off. Extend `tests/causes.mjs` for the remedy table.

**Probe.** A modtest on a human save with one unhappy city: force pressure to the bar, end a turn, read
the notification log and the readout snapshot, end two more turns, confirm the departure record and the
tile removal, then repeat with happiness raised during the notice and confirm nothing left.

**Warning surface.** The banner pressure bar is built (see the addressed ledger). It reads the existing
pressure signal, so the countdown attaches to it once the notice state exists.

**Should we.** Yes. This is the single change that turns every voluntary loss into an announced one.

### 7.3 The per-city intake toggle

**Behavior.** A city can be set to closed by its owner. A closed city is skipped as a destination for
every source, its in-transit arrivals are rerouted, and it pays no assimilation load for new arrivals
because none land. The AI never closes a city. Crisis refugees with no other destination are not forced
into a closed city; they take the next destination or the attrition outlet as today.

**State.** A `cities` map on the persisted state, keyed by city key, holding `{closed: boolean}`.
Normalized like `sources`. A city that changes hands clears its entry (the owner check happens at read
time, so a captured closed city reopens by itself).

**Hooks.**

- `bestOpenDestination` in `emigration-engine.js`: the predicate becomes
  `canReceiveInbound(d.key, ctx) && !isClosed(d.key)`.
- `planSource` calls `bestDestination` without a predicate for the planning pass. Pass the same closed
  check so the plan and the shed agree.
- `resolveArrival` in `emigration-arrivals.js`: an arrival due at a city that closed while the migrant
  traveled goes through `recoverFailedArrival`, which already handles a captured or full destination.
- `readoutModel` in `emigration-city-readout.js`: a line "Closed to newcomers" when set.

**UI.** A button on the readout panel, "Close to newcomers" / "Open to newcomers", shown only for the
local player's cities. The panel is plain DOM built by `renderPanel`; the button calls a
`setCityClosed(cityKey, on)` export in `emigration-state.js` and re-renders. Keyboard users get the
same through the dashboard's per-city rows if the readout is closed.

**Config.** `cityIntakeToggleEnabled` (true). No numbers.

**Tests.** `tests/intake-toggle.mjs`: a closed city is never chosen, the plan and the shed agree, an
in-transit arrival to a newly closed city is rerouted and population is conserved, a captured city
reopens, and the state round-trips through save and load.

**Probe.** Close the player's most attractive city on a save with a known inbound flow, end three
turns, confirm zero arrivals there and the flow landing elsewhere, then reopen and confirm arrivals
resume.

**Should we.** Yes. It is small, and it removes the "the mod spends my happiness" complaint without
touching the assimilation numbers.

### 7.4 The protect-this-city action

**Behavior.** From the readout of an own city in the preparing-to-leave state or under crisis, the
player can pay once to hold the city's people for `protectTurns` (default 5). While protected, the
voluntary track does not fire for that city and pressure does not accumulate. The crisis track still
fires, but crisis death for that city is suspended. Protection cannot be renewed until it lapses plus
`protectCooldownTurns` (10). The cost is `protectGold` (30) or, when the treasury cannot pay,
`protectInfluence` (20). Both are shown before the click, in the same label-effect-note shape the
dilemma uses.

**State.** On the `cities` map entry: `protectedUntil` (mono turn) and `protectCooldownUntil`.

**Hooks.**

- `shedVoluntary`: return early while protected, without accumulating pressure.
- `processOutletDeath` in `emigration-engine.js`: skip while protected.
- `applyChoice`-style cost application through `deduct`, in a new `emigration-protect.js` that owns
  the cost table, the eligibility check (own city, not on cooldown, can pay), and the chronicle line.
- `readoutModel`: "Protected for {n} turns" or the button.

**UI.** A second readout button beside the intake toggle, enabled only when eligible, with the cost in
its label. A chronicle entry when used, so the decision is part of the written history like the
refugee decision is.

**Config.** `protectEnabled` (true), `protectTurns` (5), `protectCooldownTurns` (10), `protectGold`
(30), `protectInfluence` (20).

**Tests.** `tests/protect.mjs`: eligibility, cost selection, no voluntary fire and no death while
protected, crisis flight still fires, cooldown enforcement, round-trip through save and load.

**Probe.** On the notice probe from 7.2, protect during the notice and confirm nothing leaves for five
turns and the gold was charged once.

**Should we.** Yes, after 7.2 and 7.3, because it depends on the notice state to be worth using and on
the readout buttons that 7.3 introduces. It is also the piece that lets the player spend to keep people,
now that nothing is charged when they leave.

### 7.5 The enclave preview

**Behavior.** In the local player's cities, an enclave that would form this pass is announced instead
and placed on the next pass. The announcement names the origin, the city, the tile the placer chose, and
the stance. During the one-turn window the player can decline (the community keeps its standing, the
dwell clock restarts, no enclave forms this time) or move it (the placer takes the next candidate plot).
Doing nothing lets it form. AI hosts stay automatic. The pop-up mode is unchanged.

**State.** A `pending` field on the quarter record, `{origin, plot, stance, sinceTurn, action}` where
`action` is `form`, `move`, or `decline`. Normalized in `emigration-quarter-state.js` with the
existing optional-field helpers.

**Hooks.**

- `recognizeAutomatically` in `emigration-quarter.js`: for the local owner, when
  `quarterRecognition` is 2 or 1 and `enclavePreviewEnabled` is on, write `pending` with the plot from
  a dry run of the placer instead of placing. `placeEnclave` needs a `dryRun` flag that returns the
  chosen candidate without sending `CREATE_ELEMENT`; `placeOnEmpty` and `takeOverFarmstead` already
  separate choice from the engine call.
- The same function on the next pass: if `pending` exists and is one turn old, act on `action`:
  `form` places on the recorded plot, `move` re-runs the placer excluding that plot, `decline` drops
  `pending` and restarts the dwell clock.
- `readoutModel`: "An enclave will form here next turn on tile {x,y}" with two buttons, "Move" and
  "Decline".

**Feedback.** One notification, neutral accent, "An enclave is forming in {city}", logged. The
existing "An Enclave Takes Root" chronicle entry fires when it forms.

**Config.** `enclavePreviewEnabled` (true). Depends on `quarterRecognition` not being 0.

**Tests.** Extend `tests/quarter.mjs`: a pending record is written and not placed, `form` places on
the recorded plot, `move` picks a different plot, `decline` restarts dwell and drops the record, AI
owners are never given `pending`, and the record round-trips.

**Probe.** The seeded-community probe from mod tests 20 to 34 on a human save: confirm the pending
notification and readout line on the first pass, decline, confirm no tile, re-seed, move, confirm the
tile landed on a different plot than announced.

**Should we.** Yes, but last. Enclaves in the player's cities are rare (3.1), so this affects few
turns per game. It still removes the one case where the mod changes a player's tile without a word.

### 7.6 Order, gates, and effort

Order: 7.2, then 7.3, then 7.4, then 7.5. Each piece ships behind its own option, on by default, so a
player who wants the old behavior turns one switch.

Gates for every piece, in the order they are run: eslint (max-len 120, complexity 10, max-statements
18, max-lines 500, which is why each piece gets its own module), tsc, the unit suite through
`tests/loader.mjs`, locale parity across the eleven locales after `scripts/i18n_extract.mjs` and
`scripts/i18n_apply.mjs`, `validate-package`, and the modinfo import closure for every new `ui/*.js`.
Then the probe for that piece from `devtools/engine-probe/`, recorded in its README ledger, and a
README and Guide update in the same change.

Rough size: 7.2 and 7.3 are each one new module, one engine touch, one readout touch, a test file, and
a probe. 7.4 is the same plus a cost table. 7.5 is a quarter-module change and a placer flag. None
touches a calibrated cap.

---

## 8. Implementation plans for every other mitigation

The same layout as section 7, one subsection per issue in sections 2 to 5. Where a mitigation is already
planned in section 7 it is cross-referenced, not repeated. Each mitigation ends with a verdict: build,
build later, or probe first.

### 8.1 The down-spiral (issue 2.1)

The pre-departure notice and the protect action are in 7.2 and 7.4. One piece remains.

**8.1a Disarm the punishments at the floor.**

- *Behavior.* While a city is at the game's Unhappy stage or below, or its owner's treasury is under
  `departureFloorGold` (20), a departure takes the counter decrement, not a tile, and charges nothing.
  The population still moves. The mod stops adding to what the base game is already doing to that city.
- *Hooks.* `cityHappinessStage(city)` in `emigration-polity.js` gives the stage. `treasuryOf(pid)` in
  `emigration-departure-tile.js` gives the balance. Both are checked in `commitSourcePoint` before the
  tile or gold branch. The departure record gets `subject: "counter"` and a new `spared: true` flag so
  the readout can say the city was spared.
- *Config.* `departureSpareUnhappy` (true), `departureFloorGold` (20).
- *Tests.* Stage at Unhappy spares the tile and the gold. Stage at Happy does not. Treasury under the
  floor spares the gold and the tile.
- *Verdict.* Build. Small and it targets the exact case that makes players quit.

### 8.2 Buildings vanish in a crisis (issue 2.2)

Status: moot 2026-09-14. The urban leg was removed (see 2.2); nothing below is to be built.

**8.2a Damage instead of delete.** Probed and closed 2026-09-14 (mod tests 36 to 38, and
`docs/wont-implement-with-justifications.md`). No player, city, or unit operation damages a constructible
from script; the instance's `setProperty` is metadata; unit pillage answers false on the owner's own
plots; the tuner's `Progress` argument creates an incomplete instance the build system never continues
(the city queues a second copy instead). The fallback is 8.2b.

**8.2b Discounted rebuild through a gold refund.**

- *Behavior.* When a building is removed, the owner is refunded `urbanLossRefundPct` (0.5) of the
  building's production cost as gold. The record already knows the cost:
  `findDepartureBuilding` sorts by `cost`.
- *Hook.* `takeUrbanPoint` returns the chosen building. Grant the refund in `commitSourcePoint` through
  the same `deduct` helper with a positive amount. Mention the refund in the notification.
- *Config.* `urbanLossRefundPct` (0.5).
- *Tests.* Refund equals half the cost, zero when the option is 0, none for a specialist.
- *Verdict.* Build. 8.2a failed, and a true production discount on the next build is not reachable
  from script, so gold is the honest substitute. Note that an obsolete-age building (taken first) cannot
  be rebuilt in the current age at all, so for those the refund is the only recovery.

**8.2c Name it and explain it.**

- *Behavior.* The loss notification says which building, that it was chosen as the oldest and cheapest,
  and that it was the last resort after the rural tiles.
- *Hook.* The departure record carries `subject` and the building type. `toastPerCause` in
  `emigration-feedback.js` builds the message. Add the type name (`Locale.compose` of the constructible's
  name) and a one-line reason keyed by `subject`.
- *Text.* `LOC_EMIG_NOTIF_LOST_BUILDING` with placeholders for city, building, and remedy.
- *Verdict.* Build with 8.2a or 8.2b.

**8.2d Ship the urban leg off by default.** (Strengthened by the 8.2a verdict: there is no gentler
form of the building loss.)

- Set `urbanEmigrationEnabled` to false in `emigration-config.js`. The Gentle preset (8.11) also sets it
  false. Update the README default and the Guide row.
- *Verdict.* Build now, independent of the others. It is the cheapest way to remove the sharpest
  complaint until 8.2a or 8.2b lands.

**8.2e AI exemption.** See 8.8a.

### 8.3 Sieges the AI never finishes (issue 2.3)

**8.3a Stalemate rule.**

- *Behavior.* A besieged city that has taken no fresh district damage for `siegeStallTurns` (10) is
  stalled. While stalled, the besieged floor is not applied, siege-cause crisis death stops, and the
  readout says "Siege stalled". Fresh damage ends the stall and restarts the siege ramp from its current
  tenure.
- *State.* `lastDamageTurn` per city key in the violence state, next to `tenure`, `onsetPop`, and
  `warLoss`, normalized in `normalizeViolence`.
- *Hooks.* `applyObservation` in `emigration-violence.js` computes `fresh` damage. Stamp
  `lastDamageTurn` when `fresh > 0`. Compute `stalled` from tenure and the stamp. Use
  `siegeFrac = frac` instead of the `siegeBesiegedFloor` floor while stalled. Export
  `siegeStalled(city)`. `lethalDistress` in `emigration-prosperity.js` drops the siege component when
  stalled. The readout snapshot gains `siegeStalled`.
- *Config.* `siegeStallTurns` (10, speed-scaled).
- *Tests.* `tests/violence.mjs`: ten quiet turns stall, fresh damage unstalls, the floor is not applied
  while stalled, and `siegeStalled` round-trips through the persisted state.
- *Probe.* A save where an AI unit stands next to the player's city. End twelve turns with the unit in
  place. Confirm the readout line, no deaths after turn ten, and departures resume when the unit attacks.
- *Verdict.* Build. It fixes the cause instead of capping the symptom.

**8.3b Per-siege death cap.**

- *Behavior.* Siege deaths count toward the same per-siege tally as siege displacement, and the tally
  is capped at `siegeTotalLossCapPct` (0.8) of onset population. Past the cap the city stops losing
  people to the siege until the siege ends.
- *Hooks.* `recordWarLoss(city)` in `emigration-violence.js` counts war emigration into `warLoss`.
  Call it for attrition deaths under a positive siege tenure too. `siegeEscalation` already returns 0
  at the displacement cap. Add a second check in `processOutletDeath` against the total cap.
- *Config.* `siegeTotalLossCapPct` (0.8).
- *Tests.* Deaths count toward the tally, the outlet stops at the cap, the tally clears when the siege
  ends.
- *Verdict.* Build after 8.3a. It is the guarantee behind the stalemate rule.

**8.3c Urban leg only after real damage.**

Status: moot 2026-09-14. The urban leg was removed (see 2.2).

- *Behavior.* For the war cause, the urban core is reached only when the city has fresh district damage
  in the current crisis window. A besieged but undamaged city never loses a building.
- *Hook.* The consume path that sets `deferredUrban` checks `districtDamageFrac(city) > 0` for war
  causes. Disaster and famine are unchanged.
- *Verdict.* Build with 8.3a. Two lines.

### 8.4 Immigration the player did not ask for (issue 2.4)

The per-city intake toggle is 7.3.

**8.4a Prompt for large waves.**

- *Behavior.* When the transit queue holds `dilemmaWavePoints` (3) or more points due to land in the
  player's cities next pass, a decision fires before they land: welcome them, or turn them away. Turning
  them away reroutes the wave at no Influence cost, because the player did not cause it.
- *Hooks.* `partitionDue` in `emigration-arrivals.js` knows what lands next pass. A new
  `detectWaveDilemma(state, me)` in `emigration-dilemma.js` sums due points by local destination. The
  choice "away" marks those transit rows `rerouted` and `resolveArrival` sends them through
  `recoverFailedArrival`. The wave prompt has its own cap, `dilemmaWaveMaxPerAge` (3), separate from
  `dilemmaMaxPerAge`, so it does not starve the refugee decision.
- *Config.* `dilemmaWaveEnabled` (true), `dilemmaWavePoints` (3), `dilemmaWaveMaxPerAge` (3).
- *Tests.* `tests/dilemma.mjs`: a wave below the threshold does not fire, at the threshold fires once,
  "away" reroutes and conserves population, the cap holds.
- *Verdict.* Build after 7.3. The toggle covers the steady case; the prompt covers the spike.

**8.4b Show the gain beside the cost.**

- *Behavior.* The readout shows what the newcomers produce next to what they cost: "Newcomers this
  age: {people}, about {yield} yields per turn".
- *Hook.* `readoutModel` in `emigration-city-readout.js` already prints the assimilation cost from
  `assimLoad` and `assimCostGold`. Add `arrivedPoints` (from the migration records for the city this
  age) to the snapshot in `emigration-city-readout-data.js`, and estimate yield as the city's net
  yields per population point times arrived points.
- *Verdict.* Build. Display only.

### 8.5 Enclaves are rare for the human player (issue 3.1)

**8.5a Earn enclaves through play.**

- *Behavior.* Two player actions count double toward a community's enclave stock in the player's
  cities: refugees the player welcomed through a decision, and arrivals under an Open Borders agreement.
- *Hooks.* `applyMigrationDest` in `emigration-composition.js` adds points to the destination's origin
  bucket. Multiply by `quarterWelcomeWeight` (2) when the migration carries the decision flag, and by
  `quarterOpenBordersWeight` (1.5) when the pair has open borders (the `ob` flag that `permeability` in
  `emigration-pull.js` already computes; pass it on the migration record). The refugee decision's
  `settleInto` passes the flag through `arriveRural`.
  The bucket total is renormalized to the city population as today, so the weight shifts share, not
  head-count.
- *Config.* `quarterWelcomeWeight` (2), `quarterOpenBordersWeight` (1.5).
- *Tests.* `tests/composition.mjs`: weighted arrivals shift share, unweighted do not, totals stay
  normalized.
- *Verdict.* Build. It ties the rare feature to choices the player already makes.

**8.5b Integration grace for a new community.** Withdrawn 2026-09-14 in favor of per-age pacing of the
outcome (built; see the addressed ledger). Integration stays as it is.

**8.5c Progress-to-bar in the readout.** Built 2026-09-14: the readout line, the dashboard's Diversity
column, and `enclaveProgressForComposition` in `emigration-diaspora.js` carrying the live bars.

### 8.6 Borrowed art breaks immersion (issue 3.2)

**8.6a Village for mismatches.**

- *Behavior.* In THEMED mode, the origin's own unique improvement is used. If it is unavailable, only
  generic-looking fallbacks are tried (Caravanserai, Hillfort, Megalith, Baray), then the Village.
  Signature types with strong identities (both Great Walls, Terrace Farm, Thing, Jinja, Gama,
  Pairidaeza, Ortoo, Hidden Fortress, Mawaskawe Skote, Water Puppet Theater, Hawelt) are used only for
  their own civilization.
- *Hook.* `emigration-enclave-skins.js`: split `FAMILY_SKINS` into `GENERIC_SKINS` and keep the
  signature types in `UNIQUE_IMPROVEMENTS` only. `skinCandidates` reads the generic table. Add a
  `PLACEMENT_EXCLUDED` set for the two Great Walls, so even a Han enclave places the Village, because a
  single wall segment reads wrong anywhere.
- *Tests.* `tests/enclave-place.mjs`: a Roman enclave never yields a signature type, a Goryeo enclave
  still yields the Gama, a Han enclave yields the Village.
- *Verdict.* Build. A table edit with tests.

**8.6b Surface the skin option.**

- Name the option in the first-launch summary (8.10) and in the "An Enclave Takes Root" notification
  body: "Change the tile look under Options, Enclaves". One LOC edit in eleven locales.
- *Verdict.* Build with 8.10.

### 8.7 Automatic recognition takes a farm (issue 3.3)

The preview is 7.5.

**8.7a Prefer an empty plot by purchase.**

- *Behavior.* When a host city has no empty owned plot, the placer purchases an adjacent unowned land
  plot for the enclave before taking a farmstead, if the host can pay.
- *What is known.* `purchasePlot` lands after the call and ownership blocks founding (watched, 1.4.2).
  Whether the purchase operation works for a non-local owner is not known.
- *Probe.* Purchase a plot for an AI city from the local player's request. If it fails, the purchase
  path is human-only and AI hosts keep the takeover.
- *Hook.* `placeEnclave` in `emigration-enclave-place.js`, between `placeOnEmpty` and
  `takeOverFarmstead`. The purchase cost comes from the game's plot price; skip when the treasury is
  under it. The enclave record notes `purchased: true` so compensation is not computed.
- *Config.* `enclavePurchasePlot` (true).
- *Verdict.* Probe first, then build for whichever owners it works for.

### 8.8 The AI cannot play the system (issue 3.4)

**8.8a Exempt the AI from the parts it cannot answer.**

Status: moot 2026-09-14. The urban leg was removed (see 2.2), so no civilization loses buildings.

- *Behavior.* AI civilizations lose no buildings to the urban leg. They still
  lose tiles and people, so the population model stays symmetric.
- *Hooks.* The mod has no human-player check today. An AI owner is one whose player object has
  `isHuman` false, not any owner other than `GameContext.localPlayerID`, so the check stays right with
  several humans (8.9c). The consume path skips `deferredUrban` for such owners when `aiUrbanLoss` is
  off, taking the counter decrement instead.
- *Config.* `aiUrbanLoss` (false).
- *Tests.* The urban branch is skipped for an AI owner and taken for the local player.
- *Verdict.* Build now. One gate.

**8.8b Difficulty bias on arrivals.**

- *Behavior.* At higher difficulty, AI cities get a small multiplier on inbound pull, mirroring the
  base game's difficulty bonuses.
- *What is known.* No difficulty read exists in the mod. The player difficulty is in the game
  configuration; the exact accessor needs a probe.
- *Hook.* `adjustedPull` in `emigration-pull.js`, a destination-side multiplier from a small table keyed
  by difficulty.
- *Verdict.* Probe the accessor, then build only if 8.8c shows the AI falling behind.

**8.8c Measure human versus AI over a long run.**

- *Method.* An engine probe, not the synthetic harness, because the synthetic flows are too thin. Load a
  seven-civ save, run one-turn Autoplay loops for a hundred turns (multi-turn Autoplay skips the mod's
  pass), and log per civilization every ten turns: total population, rural tile count, buildings, gold.
  Diff human against the AI mean.
- *Verdict.* Do this first in 8.8. It decides 8.8b.

### 8.9 Multiplayer with full writes (issue 4.1)

Revised 2026-09-17 against the mod as it stands (game 1.5.0, probe ledger through mod test 118). The
2026-09-14 draft predates the removal of the urban leg and the source-side departure gold, the dead-district
cleanup, call home, return migration's seeded roll, per-kind arrival prompts, refugee staging and the host
intake limit, the combat event ledger, and the Grow City and fog findings. Its owner-order design for
specialists has no subject any more. The first version, which turned the write layers off in multiplayer,
stays withdrawn.

The plan has six parts: what multiplayer has to carry (8.9a), one authority (8.9b), planning that does not
depend on who is watching (8.9c), replicated writes (8.9d), shared and per-player stores (8.9e), and owner-side
work and decisions (8.9f). 8.9g records what was rejected, the probes in 8.9h choose the carriers, and 8.9i
orders the work.

**8.9a What multiplayer has to carry.**

| Surface | Today (single player) | In multiplayer |
| --- | --- | --- |
| Turn pass (`doPass`) | Local player's `PlayerTurnActivated`; 0.3 to 1.6 s at 76 to 113 settlements, 10 migrations a pass on average and 30 at most (mod test 57) | Authority only (8.9b) |
| Per-civilization charges (`chargePerTurnCosts`: assimilation, migrant holding, refugee burden, attraction dividend) | `grantYield` on every civilization's activation | Authority only, through the yield carrier (8.9d) |
| Enclave stance yields (`applyQuarterYields`) | `grantYield`, signed | Yield carrier |
| Departures and crisis deaths | `DESTROY_ELEMENT` on a rural improvement, local sender, foreign `Owner` | Authority, element operation |
| Dead-district cleanup (`emigration-plot-cleanup.js`) | `DESTROY_ELEMENT {Kind:"DISTRICT"}` 2 s after each destroy; a sweep once a loaded game starts and at each local turn | Authority only |
| Enclave placement, takeover, fading | `CREATE_ELEMENT` district then constructible; `DESTROY_ELEMENT` | Authority, element operations |
| Counter writes (`emigration-population.js`) | `addRuralPopulation` +1 (arrivals in settlements the local player does not own, refugee settlement, restored returns) and -1 (where no tile is left) | Counter carrier (8.9d) |
| Arrival placement in the local player's settlements | 250 ms flush: Auto (`EXPAND`, or `ASSIGN_WORKER Amount: 1` for a specialist), Ask me (Newcomers pop-up for the kinds asked about), Unit (`CREATE_ELEMENT UNIT_MIGRANT`) | Owner's client (8.9f) |
| The game's Grow City prompt | Raised for its owner from the turn after a mod arrival; blocks the end of turn (mod tests 59 to 67) | Unchanged; turn-timer behavior probed (8.9h) |
| Refugee decision | Local pop-up; the choice charges gold, celebration, or Influence and settles into the local player's settlements | Owner decides, authority applies (8.9f) |
| Enclave recognition pop-up (`quarterRecognition` 0) | Local settlements only | Owner decides, authority places (8.9f) |
| Call home | Dialog or console call; offered after the local pass when the empire is calm; charges gold or Influence; moves points with `moveReturnees`; cooldown in module memory | Owner requests, authority executes; cooldown in the shared store (8.9f) |
| Seeded rolls | Return (`gameSeed`), call home (`gameGUIDHexString`), arrivals and refugee staging (seeds built from state) | Run by the planner on the authority; batches carry the outcomes |
| Event feeds | `Combat`, `UnitKilledInCombat`, `DistrictDamageChanged` (fog-independent, mod test 111), `RandomEventOccurred`, war and peace, `CityRemovedFromMap` | Recorded by the authority; the polled violence signals cover a host change |
| Planner reads | Tile score from `getYields(plot, localPlayerID)`; `requireMet` through the local player's `hasMet` | View-independent (8.9c) |
| Game-configuration stores | 16 keys | Shared or per player (8.9e) |
| Options | `localStorage` `modSettings`, mirrored to the game configuration | Rules from the authority, preferences per player (8.9e) |
| Cross-mod reads | Demographics' casualty tally (`DemographicsData.casualtyCumFor`) and analytics policy keys; Diplomacy Extended raid actions | 8.9e |
| Policy cards | `TRADITION_EMIG_*` rows, slotted by the player with the base game's operation | Nothing to do: database rows and a base-game request |
| Lenses, dashboard, readout, network, Guide, enclave markers | Read the stores and the map | Read the shared stores on every client |

**8.9b One authority.**

- *Who.* In a network game, the client where `Network.getHostPlayerId()` equals `GameContext.localPlayerID`,
  the check the base staging screens use. In hotseat, the one client. In single player, the local client, as
  today. Watched (mod test 121): `Network.getHostPlayerId()` answers, while `Network.isHost` DOES NOT EXIST at
  runtime and `Configuration.getGame().isHost` is undefined. Demographics' `canSetHostPolicy` calls
  `Network.isHost()`, so it can never resolve host status in a multiplayer game. Both mods move to one host
  helper built on `getHostPlayerId()`.
- *What only the authority runs.* `doPass`; `chargePerTurnCosts` for every civilization; the dead-district
  sweep and the delayed district removal; the event recorders' writes to the shared stores; the application of
  every decision and call-home request (8.9f).
- *What every client runs.* The views; its own toasts and notification log; its own arrival flush; its own
  decision pop-ups; its own calm-empire call-home offer, which reads the cooldown from the shared store.
- *Trigger.* The pass keys on the game turn, not on whose turn activated. In simultaneous turns the host's
  activation comes once per game turn. Hotseat watched (mod test 121): `PlayerTurnActivated` fires for each
  human on the one client and the local player changes with the handoff, but today's pass is skipped for the
  second human anyway, because both humans share one `lastLocalTurnRun`. That accident is what the gate
  replaces with intent: `lastLocalTurnRun` becomes `lastPassTurn` in the shared state, keeping its
  age-boundary rebase, and the pass runs on the first human activation of a game turn. The sweep and the
  call-home offer, which no interval gates today, stop running once per human.
- *Host migration.* The authority check is re-read at each trigger. A new host finds `lastPassTurn` behind and
  runs the pass. Every write batch carries a `(monoTurn, seq)` id stored before it is sent; on takeover, the
  new authority re-reads the world for stored batches whose effect is not observed and does not re-send them.
  The combat ledger is in memory and is lost, but violence already takes the stronger of the event reading
  and the polled district and unit signals, so the new host reads the war from polling until events build up
  again.
- *Hooks.* A new `emigration-session.js` exports `sessionKind()` (single, hotseat, or network, from
  `Configuration.getGame().isHotseat` and `isNetworkMultiplayer`), `isAuthority()`, `hostPlayerId()`, and
  `humanPlayers()`. `onTurnActivated` gates the authority work on `isAuthority()`, and so do the load sweep and
  `scheduleDistrictCleanup` in `emigration-plot-cleanup.js`.

**8.9c Planning that does not depend on who is watching.**

One authority does not desync by planning from its own player's view, but it lets that player's map
knowledge and diplomacy decide migration for everyone. Every planner read becomes view-independent, and a
test holds the plan identical when `localPlayerID` changes.

- *Tile score.* `plotScore` passes the settlement owner's id to `getYields`. Watched free (mod test 119):
  reading as the viewer and as the owner returned identical values on all 72 foreign plots compared, revealed
  and unrevealed, so this changes no single-player behavior.
- *`requireMet`.* With the option on, the model drops civilizations the local player has not met. It becomes
  "met by at least one human": identical in single player, the same on every client, and still true to the
  option's purpose of leaving out civilizations no player has encountered.
- *Owner and viewer.* Every `localPlayerID` read is classified. Owner reads (is this settlement human-owned,
  which player's arrival preferences apply, who pays a decision's cost) use the owner's id and `isHuman`.
  Viewer reads (whose toasts, readout, pop-ups, and quote pool appear on this screen; the analytics policy)
  keep the local id. The AI check in 8.8a is "the owner is not human". An eslint `no-restricted-properties`
  rule allows `localPlayerID` only in `emigration-session.js` and the view modules.

**8.9d Replicated writes.**

Every engine write moves into a new `emigration-write.js` (`destroyElement`, `createElement`, `grantYield`,
`adjustRural`, `expandCity`, `placeSpecialist`, `spawnMigrant`). It groups a pass's writes into a batch with
its id and sends the batch over the carrier `emigration-session.js` selects. The modules with engine writes
today call it instead: `emigration-departure-tile.js`, `emigration-enclave-place.js`,
`emigration-plot-cleanup.js`, `emigration-arrival-placement.js`, `emigration-population.js`,
`emigration-effects.js`, `emigration-dividend.js`, and `emigration-refugee-burden.js`. Refugee staging, return
migration, the refugee decision, call home, and the stance yields already write through those modules. In
single player the funnel sends exactly what is sent today.

Tile, district, unit, and placement writes are requests already. The yield and counter writes need a carrier,
in this order:

- *Carrier 1: a gameplay-context script reached by `EXECUTE_SCRIPT`.* **Closed 2026-09-17, mod test 119.** The
  idea was that a mod registers a script with the `ScenarioScripts` modinfo action, the authority sends one
  `EXECUTE_SCRIPT` per batch, and every client's simulation applies it at the same point in its command
  stream, so `grantYield`, `addRuralPopulation`, and the state writes would run inside the lockstep. Watched
  on 1.5.0: the script never ran. It left no receipt and no log line, and the engine registered it under
  neither initial-script type (`Default` held all 98 UI scripts, `Sandbox` none), while `Modding.log` shows
  its mod scanned and loaded. `EXECUTE_SCRIPT` is a real operation and answered `canStart` Success and
  `sendRequest` true for all nine argument shapes tried, including `{}`, which is engine limits 2.8 rather
  than a channel. `ScenarioScripts` sits in the engine's action table beside the scenario DLC packages, so it
  is most likely scenario-content-only, and the base game asks for no script host but `Default`. A UI mod has
  no way into the simulation's own context in an ordinary game.
- *Carrier 2: the direct mutators, if the engine replicates them.* Unlikely, since they apply before any
  request can land (engine limits 6.5), but the cheapest to test (probe 5).
- *Carrier 3: yields carried by placed constructibles.* **Watched 2026-09-17, mod test 120: it works, with
  two rules.** Lasting yield effects (assimilation, the refugee burden, migrant holding, the dividend, stance
  yields) become never-buildable mod constructibles that the authority places and removes as the load changes;
  their yields come from the database, so every client computes the same number. A custom BUILDING with
  `Population="0"` and `YIELD_GOLD="-2"` loaded, placed by `CREATE_ELEMENT` in the player's capital and in an
  AI city, charged the city's gold at once, left urban population unchanged, survived six turns of AI play
  with no crash, and came off again with `DESTROY_ELEMENT`. The two rules the probe found:
  - *Only where a slot is free.* The AI city's center was full, so the carrier replaced its Granary and took
    a population point with it. The placer must read the district's free slots first; otherwise a "cost"
    silently destroys a real building.
  - *The data number is not the cost.* Removing a carrier whose data says -2 gold returned 12.31 gold a turn:
    the figure is scaled by whatever multiplies that city's gold, so the same carrier charges a rich
    settlement far more than a poor one. The effect has to be computed against the city's own multipliers.

  The other limits still apply: no model, so it renders invisible (2.3); as an improvement it would need a
  rural district first (2.6) and would take a plot, which is why the building form is used. Its happiness
  would be real settlement happiness, while `grantYield` moves only the celebration stockpile (1.2), so
  carrying a happiness cost this way changes the rule and the option text that calls it a celebration delay.
  One-off charges (decision and call-home costs) become a short-lived carrier over a set number of turns.
  This carrier needs only element operations, which is why it is the floor.
- *Counter writes without Carrier 1 or 2.* A +1 becomes a placed improvement on a plot the settlement's
  `EXPAND` offers (run 6 re-created a standard improvement in a foreign city). In an AI settlement that gives a
  rural tile where the AI often seats a specialist today (run 4). In another human's settlement the arrival is
  placed for them, so that player's Newcomers pop-up and placement choice are lost for it. The -1 where no tile
  is left is dropped, because it removes only a number (engine limits 1.1): such a settlement keeps the point.
- *If the element operations do not replicate.* They are the developer tuner's operations, and a network
  game may refuse them. With Carrier 1 closed (mod test 119) there is no second route: a UI mod would then
  have no way to write the world in a network game, and this plan could not be built. Probe 5 is therefore
  the question the whole design rests on, and it is the one probe that needs a second client.

**8.9e Shared and per-player stores.**

| Store | Holds | In multiplayer |
| --- | --- | --- |
| `EmigrationState_v1` | Pressures, cooldowns, transit, `monoTurn` | Shared, written by the authority; gains `lastPassTurn`, stored batch ids, owed migrant units, and the call-home cooldowns |
| `EmigrationEthnos_v1` | Composition ledger | Shared |
| `EmigrationAssim_v1`, `EmigrationDividend_v1`, `EmigrationRefugeeBurden_v1` | Per-civilization charges | Shared |
| `EmigrationRefugeePool_v1`, `EmigrationReturn_v1` | Refugees held and resettling; return state | Shared |
| `EmigrationQuarters_v1` | Enclaves, candidacies, pacing counters | Shared |
| `EmigrationDilemma_v1` | Conquest-spree tracker and decision throttle | Shared; the throttle counts per deciding player |
| `EmigrationDisaster_v1`, `EmigrationWar_v1`, `EmigrationViolence_v2` | Event-fed and polled crisis state | Shared, recorded by the authority |
| `EmigrationMigStats_v1` | Flow matrices and counters | Shared; sent as deltas |
| `EmigrationChronicle_v1` | Written history | Shared; entries name the players they concern and each client words them for its own player |
| `EmigrationNotif_v1`, `EmigrationNews_v1` | One viewer's notification log and announced keys | Keyed per player id and written by that player's client from the shared records |
| Options mirror | Every option | Split into rules and preferences, below |
| `DemographicsAnalyticsPolicy_v1` | Demographics' host ceiling | Unchanged: host-written already |
| `DemographicsAnalyticsPolicyEffective_v1` | One player's effective analytics policy in one shared key | Keyed per player by Demographics; Emigration reads its own player's entry |

- *Carriers for the shared stores, in order.* First, the game configuration itself, if a host's in-game
  `setValue` reaches the joiner (probe 5). Second, Carrier 1: the script applies each batch's state delta in
  gameplay context and pushes it to every UI with `SendScriptEventToApp`. Third, neither: the authority alone
  holds the stores. Then the other players' lenses, dashboard history, composition, and enclave progress show
  only what the world itself shows, a host change restarts pressures and cooldowns, and each arrival lands on
  the pass that sends it so no migrant exists only in the authority's memory. The third carrier keeps every
  write but not every view, and the README would say so.
- *Rules and preferences.* Rules are every option that changes what the pass does: rates, bars, caps, pacing,
  the enclave recognition mode, the refugee host limit, call-home prices and cooldown, and the presets. The
  authority's values govern and the Options screen shows them read-only to the other players. Preferences
  are each player's own and are stored per player id in the shared store, so the authority can read them:
  `arrivalPlacement`, `arrivalAskRefugees`, `arrivalAskMigrants`, `arrivalAskReturnees`,
  `callHomeOfferWhenCalm`, and the `visuals` and `readout` groups. `localStorage` stays the shell and new-game
  default only; the UI engine wipes it between isolates (the `emigration-settings.js` header) and has returned
  another key's value.
- *In-memory state.* The call-home cooldowns move into `EmigrationState_v1`. The combat ledger stays in
  memory on the authority (8.9b covers its loss). The pending-arrival map and its flush timer are owner-side
  and rebuild from the shared arrival records.
- *Cross-mod.* The war-severity term reads the authority's own Demographics casualty tally. A host that was
  present from the start holds the whole game's tally; a late joiner who becomes host holds less, which
  softens war severity for a while and breaks nothing, because violence takes the strongest of its signals.
  Diplomacy Extended's raids are native diplomatic actions and replicate with the game.

**8.9f Owner-side work and decisions.**

- *Arrival placement.* The authority writes the arrival (the +1 through the counter carrier) and a shared
  arrival record with its kind. Each human's client runs today's flush over the records for its own
  settlements: Auto sends `EXPAND` or `ASSIGN_WORKER Amount: 1` under its own id, and Ask me raises the
  Newcomers pop-up for the kinds that player asks about. A player who does nothing is held by the game's own
  Grow City prompt until the point is placed, as in single player; probe 6 settles what a turn timer does.
- *Migrant units.* When the owner's preference is Unit, the authority does not raise the counter. It records
  the arrival as owed to the owner, whose client sends `CREATE_ELEMENT UNIT_MIGRANT` under its own id and
  clears the record. A record still owed after `ownerOrderTurns` (2) is written by the authority as an ordinary
  +1, so an absent player never loses the point.
- *Decisions.* The refugee decision and the enclave recognition pop-up appear only on the deciding player's
  screen. The choice reaches the authority by that player's own `EXECUTE_SCRIPT` (Carrier 1) or, if in-game
  player-configuration values replicate, by a value on that player's configuration (`Configuration.editPlayer`;
  probe 5). The authority applies the cost and the settlement or placement. With no return route, the decision
  takes its automatic default for players other than the host, which is what AI civilizations get today.
- *Call home.* The calm-empire offer and the dialog appear on the calling player's screen, priced from that
  player's treasury. The request travels by the same route, and the authority runs `callHomeNow` for that
  player: the charge, `moveReturnees`, the cooldown, and the chronicle entry. The roll's seed (game id, pair,
  turn) is unchanged. Call home has no automatic default, so with no return route it cannot be sent by players
  other than the host, and the dialog says so.
- *Section 7 controls.* The intake toggle (7.3), protect (7.4), and the enclave preview (7.5) use the same
  route when they are built.
- *Notifications.* The authority toasts nothing for other players. Each client derives its toasts from the
  shared records filtered to its own player and writes them to its own entry in the notification log.

**8.9g What was considered and rejected.**

- *Every client runs the pass and trusts identical results.* UI scripts run outside the simulation tick, so
  each client's pass reads the world at a different point in the command stream, and the direct mutators
  diverge. The simulation's determinism (mod test 58b) does not help, because the UI's reads are not part of
  the command stream. Carrier 1 is the lockstep version done right: the pass is planned once and applied
  inside the simulation.
- *Each human runs the pass for their own settlements.* Flows cross owners, AI settlements have no client, and
  refugee pools, return migration, call home, and enclaves span civilizations. Two planners break population
  conservation.
- *Turning the write layers off in multiplayer.* Withdrawn 2026-09-14; see 4.1.

**8.9h Probes, cheapest first.**

All on game 1.5.x. Each probe can prove its carrier wrong. When one fails, take the next carrier; do not build
past a failed probe.

1. *Script context, single player, this machine.* **Done 2026-09-17 (mod test 119): FAILED, Carrier 1
   closed.** The script never ran and `EXECUTE_SCRIPT` reached nothing; see 8.9d. What was run: a probe
   modinfo adds a `ScenarioScripts` file that logs on
   load, and the UI sends `EXECUTE_SCRIPT` with a small payload. Watch for the load line; the handler firing
   (its name is unknown, so the script registers candidate listeners and logs any call); whether
   `Players.grantYield`, `city.addRuralPopulation`, and `city.Growth` exist there; and a
   `SendScriptEventToApp` round trip to the UI. Then apply one real batch through it (a gold charge, a +1 and a
   -1) and read the results on the next turn with the pass off. Decides Carrier 1 and the script state
   carrier.
2. *Tile score by viewer, single player.* **Done 2026-09-17 (mod test 119): identical on all 72 plots
   compared, so the 8.9c change is free.** What was run: read `getYields(plot, localPlayerID)` and
   `getYields(plot, owner)`
   on every owned plot of three foreign civilizations, revealed and unrevealed. Identical values make the
   8.9c change free. Different values mean the planner has been scoring a view, and the change is a tuning
   change to measure with the paired scale run (mod tests 57 and 58).
3. *Carrier 3 building, single player.* **Done 2026-09-17 (mod test 120): the floor works, with two rules.**
   A never-buildable custom building with `Population` 0 and -2 gold placed in the player's capital and in an
   AI city, charged the city at once, left urban population alone, survived six AI turns and came off again.
   It must only be placed where the district has a free slot (it evicted a Granary and a citizen from a full
   center), and its real cost is the data figure scaled by the city's own gold multipliers (-2 in the data
   returned 12.31 a turn when removed). See 8.9d.
4. *Hotseat, this machine.* **Done 2026-09-17 (mod test 121).** The session reads all answer
   (`isHotseat`, `isAnyMultiplayer`, `isLocalMultiplayer`, `humanPlayerIDs`), `Network.isHost` does not exist
   at runtime, the local player changes with the handoff, and the pass does not double-run on one client
   because both humans share `lastLocalTurnRun` (see 8.9b). Starting a hotseat game headless needs
   `Network.hostGame(ServerType.SERVER_TYPE_HOTSEAT)`; Play Now silently starts single player. Not covered:
   the pop-ups per owner, since the game never reached a turn with settlements, and player 1's turn could not
   be passed.
5. *Network game, two clients.* Needs a second machine or a second Steam account. The host sends
   `DESTROY_ELEMENT` on a joiner's rural improvement and on an empty rural district, `CREATE_ELEMENT` of a
   district and an improvement in a joiner's settlement, `CREATE_ELEMENT UNIT_MIGRANT` for the joiner,
   `Players.grantYield(joiner, GOLD, -10)`, `addRuralPopulation(+1)` on a joiner's settlement, and a
   game-configuration `setValue`. The joiner reads each on its own client a turn later, and both logs are
   checked for an out-of-sync report (find that log line before the run, so its absence means something). Then
   the joiner sends `EXPAND` and `ASSIGN_WORKER Amount: 1` on its own settlement, sets a value on its own
   player configuration, and sends `EXECUTE_SCRIPT` if probe 1 passed. Decides whether element operations
   replicate at all (the floor), Carrier 2, the configuration store carrier, and the decision routes. The base
   game ships `automation-test-multiplayer-host.js`, but `-autojson` does not start a run (engine limits 6.3),
   so both clients are driven by probe scripts or by hand.
6. *Grow City under a turn timer.* In the same game with a short turn timer, add a point to the joiner's
   settlement and let the joiner's timer run out without placing it. Watch whether the game places it, carries
   it, or holds the turn for everyone.
7. *Host migration.* The host quits mid-age. Confirm the new host's pass resumes at `lastPassTurn`, no
   departure or charge is sent twice, and violence continues from the polled signals.

**8.9i Order, tests, text, verdict.**

- *Now: no probe, no change in single player.* The authority gate and `emigration-session.js`, with one host
  helper shared with Demographics (8.9b). The write funnel, with a characterization test that the single-player
  request and mutator stream is identical (8.9d). The owner/viewer classification, the lint rule, and "met by
  at least one human" for `requireMet` (8.9c). Per-player keys for the notification and news logs and for the
  preferences (8.9e). The call-home cooldown moved into `EmigrationState_v1`, which also stops a single-player
  reload from clearing it.
- *Probes 1 to 4 are done (2026-09-17, mod tests 119 to 121).* Carrier 1 is closed, the tile-score change is
  free, the Carrier 3 floor works with two rules, and the session reads and the owner/viewer split are
  confirmed. Nothing local is left to run.
- *Then probe 5 and the carriers it chooses. Probes 6 and 7 run before anything is called supported.*
- *Tests.* `tests/session.mjs`: the authority per session kind, the hotseat once-per-turn gate, host migration
  from `lastPassTurn`, stored batch ids not re-sent. `tests/write-funnel.mjs`: the single-player
  characterization, each carrier producing the same effects from one batch, and an owed migrant unit written as
  a +1 after `ownerOrderTurns`. `tests/planner-view.mjs`: the pass plans the same moves when `localPlayerID`
  changes. `tests/stores-mp.mjs`: every persisted key classified, per-player keys isolated, preferences read
  for the owner rather than the viewer.
- *Config.* `ownerOrderTurns` (2). No multiplayer switch: the session picks the carriers.
- *Text.* The README says the mod is for single-player games until probe 5 passes and its carriers are built;
  then it says which parts of multiplayer were watched. A decision that fell back to automatic, and a call home
  that cannot be sent, tell the affected player so.
- *Verdict.* Build the no-probe items now: they change nothing in single player and every remaining carrier
  needs them. The design rests on probe 5, which needs a second machine or Steam account: if the element
  operations do not replicate in a network game, a UI mod cannot support multiplayer at all. Probes 3 and 4
  are worth running first only because they are free and they shape what probe 5 must test.

### 8.10 First-launch summary (issues 4.2 and 5.3)

- *Behavior.* The first time the mod runs in a game for this player, a single modal explains what it
  does: people leave and take a tile, crises kill, migrants arrive and cost happiness for a few turns,
  enclaves are real tiles, the mod cannot be removed from the save, which parts of multiplayer have been
  watched (8.9i), where the presets and the per-city buttons are. Two choices: "Got it" and "Use the Gentle preset".
- *State.* A `introSeen` flag in the shared settings blob (`emigration-settings.js`), which mirrors to
  the game configuration, so it shows once per player rather than once per game. An Options row "Show
  the introduction again" resets it.
- *Hooks.* `showDilemma` in `emigration-dilemma-view.js` renders the modal. "Use the Gentle preset"
  applies the preset through `emigration-tunables.js`.
- *Text.* One title, one body, two choice labels, in eleven locales.
- *Tests.* The flag gates the modal, the reset row clears it, the preset choice writes the preset.
- *Probe.* Load a fresh game, confirm the modal, choose Gentle, confirm the knobs changed.
- *Verdict.* Build after 8.11, since it offers the preset.

### 8.11 Gentle preset (issue 4.3)

- *Behavior.* A fourth preset beside Low, Medium, and High: `crisisDeathEnabled` false, `siegeLossCapPct` 0.4,
  `disasterLossCapPct` 0.3, `quarterRecognition` 1 (automatic in the player's cities only).
- *Hooks.* `PRESETS` and `PRESET_NAMES` in `emigration-tunables.js`. The dropdown in
  `emigration-options.js` builds from `PRESET_NAMES`, so it appears without UI work. Add
  `LOC_EMIG_PRESET_GENTLE` in eleven locales.
- *Tests.* `tests/tunables.mjs`: the preset applies every listed key and no other, and hand-editing
  flips to Custom as today.
- *Verdict.* Build now. Small, and 8.10 depends on it.

### 8.12 Every loss names its cause and its remedy (issue 5.1)

- *What exists.* `readoutModel` already appends `actionHint(cause, city)` from `emigration-naming.js`, a
  per-cause action line in the readout. Notifications do not use it.
- *Change.* Lift the hint table into `emigration-causes.js` as `causeRemedy(cause)` and have
  `actionHint` read it. Use it in the
  pre-departure notice (7.2), the loss toasts in `toastPerCause`, the building-loss notification (8.2c),
  and the readout as today. One table, four readers.
- *Tests.* Extend `tests/causes.mjs`: every cause has a remedy, and the readout and notification agree.
- *Verdict.* Build with 7.2.

### 8.13 Losses come back (issue 5.2)

Covered by 8.2b (refund) and 8.1a (spare the tile at the floor). The pillage-instead-of-destroy idea for
abandoned tiles is closed by the same probes as 8.2a: nothing from script can set an improvement to the
pillaged state, and unit pillage is refused on the owner's own plots.

### 8.14 Order across sections 7 and 8

1. Immediate, no probe: 8.2d (urban leg off by default), 8.8a (AI exemptions, with the `isHuman` owner
   check), 8.11 (Gentle preset), 8.6a (Village for mismatches), the README single-player sentence and the
   no-probe multiplayer groundwork (8.9i).
2. The notice and remedy line: 7.2 and 8.12.
3. The spiral: 8.1a.
4. Sieges: 8.3a, 8.3b, 8.3c.
5. Immigration control: 7.3, then 8.4a and 8.4b.
6. The protect action: 7.4.
7. Probes: 8.7a (purchase for another owner), 8.8c (human versus AI run), 8.9h probes 1 to 4
   (script context, tile score by viewer, the Carrier 3 building, hotseat). Then the builds each unlocks:
   8.7a, 8.8b, and the tile-score change and carriers 8.9 selects. Then 8.9h probes 5 to 7 (network, turn
   timer, host migration).
   8.2a is closed; build 8.2b.
8. Enclave presence: 8.5a, 7.5.
9. Onboarding: 8.10 and 8.6b.

Every step ships behind its own option and passes the gates in 7.6. None changes a calibrated cap
except through the Gentle preset, which the player chooses.
