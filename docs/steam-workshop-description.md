[h1]Emigration[/h1]
Adds detailed migration and refugee systems to Civilization VII. When a settlement is starving, unhappy, or under siege, people leave. When a settlement is thriving, they move there instead. Population moves between settlements, abandoning a rural improvement when it leaves and creating a new one when it arrives. This changes yields, growth, and Influence, and every move is logged with its cause.
[h2]Mechanics[/h2]
[list]
[*][b]Compatible with 1.5.0.[/b]
[*][b]Prosperity model.[/b] Each settlement scores on yields, happiness, war weariness, and government passives. Population moves from lower- to higher-scoring settlements each pass.
[*][b]Displacement.[/b] Combat damage, pillaging, sieges, starvation, unrest, and disasters produce refugees. People fleeing a crisis prefer another settlement of their own civilization and only cross a border when their homeland has nothing to offer, which is how displacement mostly works. The "Movement between civilizations" slider spans from that settled behaviour up to free movement.
[*][b]Attrition.[/b] Population that cannot relocate under sustained siege, famine, war, or disaster dies. The death chance accrues over several turns rather than resolving in one.
[*][b]Real departures and arrivals.[/b] When people leave, one of the settlement's outlying rural tiles is abandoned with them: a pillaged tile first, a starving settlement keeps its farms, and a settlement never loses its last rural tiles. All the mod's pacing and caps still apply, and a crisis can take at most a fixed share of a settlement's people, so migration wounds a settlement without becoming another way to destroy it. When newcomers arrive in your city, a pop-up lets you choose where they settle, let the city decide, or wait; by default only refugees ask, and migrants and returnees are placed for you. Other civilizations settle their own arrivals. Options: automatic placement, or newcomers arriving as a population growth event.
[*][b]Cultural enclaves.[/b] A foreign community that holds its ground long enough puts down roots as a real tile on the map: its people's own unique improvement where they have one (a Goryeo enclave is a Gama, a Mongol one an Ortoo), otherwise a matching improvement or a village. The tile carries that improvement's yields, can be built over, and fades if the community that made it dwindles. Enclaves form on their own in every civilization's cities, or only in yours, or by your decision.
[*][b]Decisions on your terms.[/b] Every pop-up that asks you to decide something has its own on/off switch in Options > Mods > Emigration: refugee decisions, newcomer placement, call-home offers, and enclave stances. Turn one off and the mod carries on without asking.
[*][b]Settlement delay.[/b] Arriving refugees are held before entering the working population. They produce no yields, carry a support cost, and appear on the map lens and city readout.
[*][b]Distance falloff.[/b] Move probability decreases with distance. Nearby settlements are favored over cross-map moves.
[*][b]Borders and policy.[/b] Open Borders agreements and Pro-/Anti-Immigration policies adjust migration rate, settlement chance, retention, and integration cost.
[*][b]Integration cost.[/b] Each migrant applies a temporary gold cost to the host civilization and delays its next Celebration (the game gives mods no way to make a settlement unhappy). A congestion cap limits per-settlement intake.
[*][b]Origin tracking.[/b] Settlements record population origin. Minorities integrate over time, diasporas may return home, and a sustained foreign presence can form a cultural enclave.
[*][b]Every leader and civilization.[/b] The roster is read from your installed game, so all 38 leaders and 50 civilizations are tuned, alternate personas judged on their own abilities.
[*][b]Attribution.[/b] Each move records its deciding factor (prosperity, distance, safety, open borders, allies, asylum, crisis, or war), surfaced in notifications, city readouts, pressure warnings, crisis reports, and a persistent log.
[*][b]Fully localized.[/b] The entire interface is available in all 12 of the game's languages.
[/list]
[h2]Migration dashboard and map lenses[/h2]
The dashboard is available through an optional dock button or the Demographics mod's interface. Tabs cover the Migration Network, Net Migration, Why People Move, Settlements, Diversity, Immigration Policies, Notifications, and a Guide.
On the map, the Ethnic Composition lens paints each settlement by where its people came from, and the Prosperity lens shades each settlement's own land by how good its tiles are.
[h2]The displaced speak for themselves[/h2]
The refugee and newcomer pop-ups carry a quote chosen by the civilization the people come from, in the words of that people's own refugees, exiles, and migrants: Ovid from exile, the Zoroastrian refugees at Sanjan, Sugawara no Michizane leaving for Dazaifu, a Galician emigrant bound for Havana, Heine in Paris.
There are 109 quotes, each checked against its source and listed with it in the repository.
[h2]Caveats and known issues[/h2]
[list]
[*][b]Single player only.[/b] Multiplayer is not supported yet.
[*][b]Saves need the mod.[/b] A game saved with Emigration needs it to load, so keep it enabled for the whole game. Adding it to a game in progress works.
[*][b]Policy cards added mid-game.[/b] The immigration policy cards unlock when their civic completes. If you install the mod after finishing a civic, that civic's card stays locked for the rest of the age.
[*][b]Enclaves are uncommon.[/b] A community has to hold a real share of a city for several turns, and newcomers blend in over time. In testing, only a few enclaves formed per age across the whole map, most of them in AI cities. You can play a whole age without one forming in your cities.
[*][b]Enclave art is borrowed.[/b] An enclave uses its people's own unique improvement when they have one, and otherwise a similar improvement or a village, so the model may not match the people. The label above the tile always names the true origin.
[*][b]Enclaves can take a farm.[/b] If no empty plot is nearby, a new enclave takes over an outlying farm. Any yield the farm gave that the enclave does not is paid back to the city every turn.
[/list]
[h2]A note on the human reality behind this mod[/h2]
Migration and displacement are abstracted here into game systems. In reality, many people leave home because of war, persecution, disaster, or hardship. This mod aims to acknowledge those realities rather than trivialize them.
As part of creating [i]Emigration[/i] I donated to the International Refugee Assistance Project. I cannot sustain a per-subscriber pledge indefinitely, but I plan to mark major milestones with donations of time or money when I can. If you are able, please consider supporting UNHCR, the IRC, Médecins Sans Frontières (MSF), IRAP, or local refugee and mutual-aid groups.
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
[h2]Credits[/h2]
[list]
[*][b]Tower[/b], for design and Civilization VII implementation.
[*][b]Tomahawk, Mk Z, and Tim_The_Texan[/b], creators of the Civilization V Emigration mod that inspired this project.
[/list]
[h2]Special Thanks[/h2]
[list]
[*][b]Potato McWhisky[/b], for teaching me to love again, Civilization-wise (Civ VI), after growing up as a Civilization II, IV, and V player. Making this mod is an act of faith that the community will eventually help make Civilization VII as good as the previous entries.
[/list]
