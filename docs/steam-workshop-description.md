[h1]Emigration[/h1]
Adds detailed migration and refugee systems to Civilization VII. When a settlement is starving, unhappy, or under siege, people leave. When it is thriving, they move there instead. Population moves between settlements, abandoning a rural improvement when it leaves and creating one when it arrives. Every move is logged with its cause.
[h2]Mechanics[/h2]
[list]
[*][b]Compatible with 1.5.0.[/b]
[*][b]Prosperity model.[/b] Each settlement scores on yields, happiness, war weariness, and government passives. Population moves from lower- to higher-scoring settlements each pass.
[*][b]Displacement.[/b] Combat damage, pillaging, sieges, starvation, unrest, and disasters produce refugees. A disaster displaces people only where it did damage. People fleeing a crisis prefer another settlement of their own civilization and only cross a border when their homeland has nothing to offer. The "Movement between civilizations" slider spans from that settled behavior up to free movement.
[*][b]Attrition.[/b] Population that cannot relocate under sustained siege, famine, war, or disaster dies. The death chance accrues over several turns rather than resolving in one.
[*][b]Real departures and arrivals.[/b] When people leave, one of the settlement's outlying rural tiles is abandoned with them: a pillaged tile first, a starving settlement keeps its farms, and a settlement never loses its last rural tiles. A crisis takes at most a fixed share of a settlement's people, so migration wounds a settlement without destroying it. When newcomers arrive in your city, a pop-up lets you choose where they settle, let the city decide, or wait; by default only refugees ask, and migrants and returnees are placed for you. Other civilizations settle their own arrivals. Options: automatic placement, or newcomers arriving as a population growth event.
[*][b]Cultural enclaves.[/b] A foreign community that holds its ground long enough puts down roots as a real tile on the map: its people's own unique improvement where they have one (a Goryeo enclave is a Gama, a Mongol one an Ortoo), otherwise a matching improvement or a village. It carries its improvement's yields, can be built over, and fades as its community dwindles. Recognizing an enclave pays a one-time sum of Culture, Science, Influence or Gold, sized to your own economy, usually at a price in Gold. Enclaves form on their own in every civilization's cities, or only in yours, or by your decision.
[*][b]Decisions on your terms.[/b] Each decision pop-up (refugees, newcomer placement, call-home offers, enclave stances) has its own switch in Options > Mods > Emigration; switched off, the mod decides without asking.
[*][b]Settlement delay.[/b] Arriving refugees are held before entering the working population. They produce no yields, carry a support cost, and appear on the map lens and city readout.
[*][b]Distance falloff.[/b] Nearby settlements are favored over cross-map moves.
[*][b]Borders and policy.[/b] Open Borders agreements and Pro-/Anti-Immigration policies adjust migration rate, settlement chance, retention, and integration cost.
[*][b]Integration cost.[/b] Each migrant applies a temporary gold cost to the host civilization and delays its next Celebration (the game gives mods no way to make a settlement unhappy). A congestion cap limits per-settlement intake.
[*][b]Origin tracking.[/b] Settlements record population origin. Minorities integrate over time, diasporas may return home, and a sustained foreign presence can form a cultural enclave.
[*][b]Every leader and civilization.[/b] The roster is read from your installed game, so all 38 leaders and 50 civilizations are tuned; alternate personas are judged separately.
[*][b]Attribution.[/b] Each move records its deciding factor (prosperity, distance, safety, open borders, allies, asylum, crisis, or war), shown in notifications, city readouts, crisis reports, and a persistent log.
[*][b]Fully localized.[/b] The whole interface is in all 12 of the game's languages.
[/list]
[h2]Migration dashboard and map lenses[/h2]
Open the dashboard from an optional dock button or from Demographics. Tabs cover the Migration Network, Net Migration, Why People Move, Settlements, Diversity, Immigration Policies, Notifications, and a Guide.
On the map, the Ethnic Composition lens paints each settlement by where its people came from, and the Prosperity lens shades each settlement's own land by how good its tiles are.
[h2]The displaced speak for themselves[/h2]
The refugee and newcomer pop-ups carry a quote chosen by the civilization the people come from, in the words of that people's own refugees, exiles, and migrants: Ovid from exile, the Zoroastrian refugees at Sanjan, Sugawara no Michizane leaving for Dazaifu, a Galician emigrant bound for Havana, Heine in Paris.
There are 109 source-checked quotes, listed in the repository.
[h2]Caveats and known issues[/h2]
[list]
[*][b]Single player only.[/b] Multiplayer is not supported yet.
[*][b]Saves need the mod.[/b] A game saved with Emigration needs it to load, so keep it enabled for the whole game. Adding it to a game in progress works.
[*][b]Policy cards added mid-game.[/b] Install the mod after finishing a civic and that civic's immigration policy card stays locked for the rest of the age.
[*][b]Enclave art is borrowed.[/b] Without a unique improvement of its people's own, an enclave borrows a similar one or a village; the label above the tile always names the true origin.
[/list]
[h2]A note on reality[/h2]
Migration and displacement are game systems; in life people leave home through war, persecution, disaster, or hardship. This mod aims to acknowledge, not trivialize, that.
I cannot sustain a per-subscriber pledge, but plan to mark major milestones with donations of time or money. Please consider supporting UNHCR, the IRC, Médecins Sans Frontières (MSF), IRAP, or local refugee and mutual-aid groups.
[b]Subscriber milestones[/b]
[list]
[*][b]100 subscribers:[/b] Donated $100 to the International Refugee Assistance Project.
[*][b]50 subscribers:[/b] Donated $50 to Médecins Sans Frontières.
[*][b]25 subscribers:[/b] Donated $25 to the International Rescue Committee.
[*][b]10 subscribers:[/b] Pledged one hour of volunteer time to a refugee-support, humanitarian, or mutual-aid organization.
[*][b]Release donation:[/b] Made an initial donation to the International Refugee Assistance Project.
[/list]
[url=https://github.com/tmtmiller1/civilizationvii-emigration/tree/main/donation-records]Anonymized receipts are in the repository.[/url]
[h2]Source and documentation[/h2]
[list]
[*][url=https://github.com/tmtmiller1/civilizationvii-emigration]Open source on GitHub[/url]
[*][url=https://github.com/tmtmiller1/civilizationvii-emigration/blob/main/README.md]Full documentation, with every formula and tuning knob[/url]
[*][url=https://github.com/tmtmiller1/civilizationvii-emigration/blob/main/README.pdf]The same document as a typeset PDF[/url]
[/list]
[h2]For modders[/h2]
This mod is developed with [url=https://github.com/tmtmiller1/civilizationvii_tower-bench]Tower Bench[/url], a free, open-source test bench for Civilization VII mods. It connects to a running game from your browser or the command line: inspect and change the map with every write verified and undoable, diff the world between two turns, prove your deployed code is what the game runs, find which mod causes a crash, and see which copy of each mod is actually loaded.
[h2]Credits[/h2]
[list]
[*][b]Tower[/b], for design and Civilization VII implementation.
[*][b]Tomahawk, Mk Z, and Tim_The_Texan[/b], creators of the Civilization V Emigration mod that inspired this project.
[/list]
[h2]Special Thanks[/h2]
[list]
[*][b]Potato McWhisky[/b], for teaching me to love again, Civilization-wise (Civ VI), after growing up as a Civilization II, IV, and V player. Making this mod is an act of faith that the community will eventually help make Civilization VII as good as the previous entries.
[/list]
