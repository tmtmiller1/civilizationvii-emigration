# Emigration: the rules, with the review's changes (draft, 2026-10-27)

The mod as a player would learn it if the changes in
[emigration-understandability-review.md](emigration-understandability-review.md) and the new way home were built.
**New** marks a new rule, **Changed** one that differs from 4.0. Everything else is how the mod works today.
"To set" is a number the lab decides. Nothing here is built.

## 1. Who takes part

- Major civilizations, AI and you, under the same rules. City-states and independents don't send or receive people,
  but their attacks can make people flee.
- Towns and cities alike.
- Civilizations you haven't met are simulated from turn one and stay hidden on the screens until you meet them.

## 2. Why people leave in peacetime

- Each settlement is compared with the places its people could reach. Happiness counts most, then Food, Production,
  Gold, Science and Culture per person, then war weariness, government and Celebrations. Crowded settlements push
  people out.
- What a settlement has built (wonders, and each kind of civic building) makes it a better place to live, so it works
  both ways: it holds the settlement's people and draws people from places that have less. A settlement that's
  built little loses people to better-built neighbours.
- When somewhere reachable is better off, pressure to leave builds each turn, and it drains when the gap closes. When
  it fills, one person leaves and the settlement rests for 8 turns (Standard speed).
- The card shows the reasons, how full the pressure is, a forecast ("about 3 in the next 4 turns") and what would stop
  it ("+2 Happiness here; an Arena gives +2").

## 3. Why people leave in a crisis

- War: fighting inside a settlement's borders (district damage, a siege, pillaged tiles). People flee once it has
  lasted 2 turns. A razed settlement empties at once.
- A siege where nobody attacks stalls after 3 turns and stops driving people out until the next attack.
- Disasters drive people out only where they did damage. Plague, famine and unrest drive people out too.
- **Changed:** people fleeing a plague carry it. A settlement without plague that takes them in gets plague pressure
  of its own. A settlement that already has plague gets nothing extra.
- Crisis flight happens each turn, without waiting for the pressure to fill.
- One siege drives out at most 60% of a settlement, one disaster 50%.
- People with nowhere safer to go can die. Under one siege, deaths stop once the settlement has lost 80%.
  **Changed:** while it's happening the card says "People are dying here: nowhere safer to go."

## 4. Where they go

- The best place they can reach, nearer places first, in your civilization or another's. Moving somewhere much bigger,
  or much smaller, is a little less appealing.
- Between civilizations, borders, alliances and war shape it, and Open Borders adds movement. **Changed:** the card
  names it ("Open Borders with Rome").
- Refugees go to their own civilization first, then neutrals, and avoid the attacker. A settlement in a crisis of its
  own draws far fewer people.
- **Changed:** a settlement already taking in a lot of people draws fewer because its Happiness is lower (section 6).
  This replaces the congestion brake.
- **Changed:** the largest civilizations draw fewer foreigners, and small civilizations hold on to their people, so one
  power can't empty its neighbours. Both rules stay as they are today; the card now says them in words ("Rome is the
  largest power around: fewer foreigners move there").
- **New:** people who fled a settlement are drawn back to it (section 8).
- At most 4 arrivals a settlement each turn. The rest wait on the road. **Changed:** the card says so.

## 5. What a move changes

- The settlement they leave loses an outlying rural tile and its yields: pillaged tiles first, Food tiles last in a
  famine. The card lists what was lost.
- Travel takes 1 to 4 turns at Standard speed. **Changed:** the card shows the turns left.
- On arrival you choose the tile, the settlement places them, or they come as a Migrant unit you settle. Refugees ask
  by default.

## 6. Settling in (New)

Replaces the civilization-wide newcomer fee, the refugee holding pool and the pool's upkeep.

- Newcomers cost 1 Happiness in the settlement they move to for their first 8 turns (to set), and 1 Food if growth
  should slow too (to decide). It shows in the game's own Happiness tooltip as "Newcomers settling in".
- A settlement that takes in more than it can carry goes unhappy, and the game's own penalty applies: 5% of its
  yields for each point below zero.
- Refugees settle in the same way. People coming home are free.
- The card reads "Settling in: 4 (-4 Happiness), the last settles in 6 turns."
- A Migrant unit you haven't settled costs Gold and Happiness each turn, shown on the unit.

## 7. Who lives where

- Each settlement keeps its people by civilization of origin, through capture. People who move carry the mix of the
  place they left.
- Newcomers become your people over time, about 3% of a minority a turn. It stops while you're at war with their
  homeland and slows in unrest.
- The Ethnic Composition lens (Shift+E) maps it tile by tile.

## 8. Coming home (New)

Replaces the free homecoming, the stay-or-go split, Hasten and the displaced-people reminder.

- Who: people driven out of one of your settlements by war, conquest or a disaster into another of yours.
- The draw home: while they're away, home counts as a reason to move. Once home recovers they drift back through
  ordinary migration. If where they live now is a lot better off, they stay.
- The draw fades over 20 turns (to set). After that they've settled where they are.
- A returnee rebuilds a tile their people lost, when the game still offers it.
- The moment: once home has been calm for 3 turns (10 after fighting) and 5 or more of its people are away, you get
  one decision:
  - **Bring them home:** pay Gold or Influence, the price per person on the button (to set), and they move now.
  - **Let them decide** (the default): the draw home brings them over the next turns.
  - **Let them settle where they are:** the draw ends, and they're that settlement's people now.
- "Bring them home" stays on the card afterwards.
- AI civilizations let them decide.
- The cards read "Pulled toward Pittsburgh, their old home (8 turns left)" where they live, and "Coming home from
  Boston" at home.

## 9. Your people abroad (Changed)

- People who leave for another civilization are its people now. They keep their origin, so they can form a community
  and an enclave there, and Consular Protection pays you for those enclaves.
- If their homeland becomes the better place, ordinary migration can carry people back across the border like anyone
  else.
- Call from abroad and the separate return rule for people abroad are gone.

## 10. Enclaves

- Foothold: a foreign community that's 25% of a settlement and at least 3 population.
- Established at 30%, or 6 population at any share (scaled to settlement size). It becomes a tile at the settlement's
  edge with its own yields.
- Recognized after 8 turns established. You choose a stance, which pays once in Culture, Science, Influence or Gold,
  sized to your income: 3 turns of that yield, for 2 turns of Gold. A Gold stance pays 1.5 turns of Gold and is free.
  The buttons show both.
- It fades after 12 turns below 12.5%, and ends if it's built over or the city is razed.
- At war with their homeland it's contested and gives half. **Changed:** it also costs 4 Happiness in its own
  settlement through the game's line, up to 12.
- At most 2 per origin in one civilization, and 3 new ones per civilization each age.

## 11. Policies and the Dissuade button

- **Pro-Immigration Stance** (Citizenship, Economics, Social Question). **Changed:** one migration effect, "more people
  choose your settlements" (+50%), plus +1/+2/+3 Influence and +2/+2/+3 Food in each city.
- **Anti-Immigration Stance** (the same civics). **Changed:** one migration effect, "fewer of your people leave for
  other civilizations, and fewer foreigners come", plus +2/+3/+4 Production and -2/-3/-4 Influence.
- **Talent Attraction** (Exploration, Modern): +1 Science per 5 Population (per 4 in Modern), -2 Gold a settlement (-3
  in Modern). Balance still open.
- **Consular Protection** (Exploration, Modern): +3 Influence (+5 in Modern), +1 more for each enclave of your people
  abroad up to +4, and grievances against a host that slots the Anti-Immigration Stance over them. **Changed:** the
  enclave Influence shows on the Policies tab.
- **With Diplomacy Extended:** its Talent Raid draws people from the target civilization and pays you a yield for each
  person it brings. **Changed:** the payment shows where you see the raid.
- **Dissuade newcomers**, a button on each settlement, unlocked with Citizenship. **Changed:** it's free. People who
  would have come choose again: another of your settlements, another civilization's, or they stay home. People on the
  road still arrive. The stance covers your whole civilization; Dissuade covers one settlement.

## 12. Refugee decisions

- Rarely, after a big upheaval like a conquest or a plague, you choose to welcome refugees, settle them on the
  frontier, or turn them away, each with its cost shown. At most 2 an age. AI hosts decide by a rule at the same cost.

## 13. Leaders and civilizations

- Some abilities would skew who comes and goes: Happiness and Celebration magnets, Khmer's Happiness loss outside the
  capital, civilizations forced to build tall, fortress civilizations. A tuning table evens these out so they follow
  the same rules as everyone else. **Changed:** its entries for the newcomer fee move onto the settling-in cost.

## 14. The AI

- Same rules as you. The AI chooses enclave stances, decides on refugees, calls its people home from abroad, and
  **Changed:** dissuades newcomers while a settlement is below zero Happiness. Two city strategies have AI cities build
  against losing people.

## 15. Where you see it

- The settlement cards (Arriving, Leaving, Arrived, Left), the city readout, notices beside End Turn and the
  Notifications log, the Chronicle, the two lenses, and the Demographics graphs.
- **Changed:** the Prosperity lens gets a name for what it shows (to set), since its tile points aren't the
  settlement score.

## Gone

- The civilization-wide newcomer fee and its wealth scaling
- The refugee holding pool and its upkeep
- The congestion brake
- The free homecoming's timers and batches, the stay-or-go split, Hasten and the displaced-people reminder
- Call from abroad, and the 6%-a-turn return migration from abroad
- The stance cards' extra parts: the refugee tilt and the enclave payout changes
- Dissuade's Influence charge

## What keeps it balanced

Each thing that goes had a job. This is what does that job afterwards, and how sure that is.

| Goes | Its job | Done afterwards by | How sure |
| --- | --- | --- | --- |
| Civilization-wide newcomer fee | Newcomers aren't free | Settling in (section 6) | Probed: the native cost works; the size of it needs a lab run |
| Refugee holding pool and upkeep | Refugee surges cost the host, and land gradually | Settling in for the cost; the 4-a-turn arrival limit for the pace | Reasoned, needs a lab run with a war |
| Congestion brake | A place taking in lots of people stops drawing more | Settling in lowers the place's Happiness, which weighs most in the score | Reasoned, needs a lab run |
| Homecoming timers, split, Hasten, reminder | War-hit settlements recover their people | The draw home and the decision (section 8) | Needs the comparison run on WashingtonAnt130 |
| Return from abroad | Diasporas go home to a recovered homeland | Ordinary migration toward the better place | Small: 6% a turn of an eligible diaspora |
| Call from abroad | A way to win people back | Nothing; people abroad are lost, and enclaves pay through Consular Protection | The AI almost never made a call abroad on its own |
| Stance cards' extra parts | Flavor on top of each card's main effect | The main effect | The Partisans mod reads the cards' protect/suspect reading, which stays |
| Dissuade's Influence charge | A reason to think before pressing | The people you lose, and the settling-in cost you avoid | Reasoned |

None of this gets cut on reasoning alone. Each removal is switched off in a long AI lab game with its replacement on,
against the same game with today's rules: the largest civilization's share of world population, the most people one
settlement takes in, and how many settlements empty.
