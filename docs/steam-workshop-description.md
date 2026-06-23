[h1]Emigration[/h1]

[i]Emigration[/i] adds population migration and refugee systems to Civilization VII. Unhappy, poor, besieged, starving, or disaster-struck cities lose people; prosperous, safe, welcoming ones attract them, within and between civilizations. Immigration brings growth, costs, and politics, including civic-tree immigration policies in every age, plus graphs, lenses, and tooltips to see it all. It pairs with the [b]Demographics[/b] mod but runs standalone, and everything is tunable in Options.

Storytelling is a core purpose: the mod aims to make migration pressures and demographic change legible as a human narrative, not just systems and totals.

[b]A note on the human reality behind this mod[/b]
[i]Emigration[/i] turns migration and displacement into systems: population flows, prosperity scores, policy choices, refugee events. In a strategy game that abstraction is useful; in reality it is anything but. People leave home under war, disaster, poverty, persecution, or collapse, often with no good choices and no welcome waiting on the other side.

It is meant as a small, respectful acknowledgment of that reality, an attempt to model [i]why[/i] people move and what it costs them, not to trivialize their suffering or profit from it. The “refugees,” “assimilation costs,” and “crises” here are mechanics. The people they are inspired by are not.

As part of releasing it I made a personal donation to organizations supporting refugees and migrants. This is a free, one-person mod, so I can't pledge per subscriber, but if [i]Emigration[/i] grows I'll mark major milestones with capped donations of time and money within my means. If you are able, please consider supporting groups like UNHCR, the IRC, Doctors Without Borders / MSF, IRAP, or a local resettlement or mutual-aid group near you. Thank you.

[b]What Emigration does[/b]
[list]
[*][b]Updated for Civilization VII 1.4.1.[/b] Reads the reworked systems directly: the five happiness stages (Angry to Ecstatic), governments' happiness-friendly passives, [b]Celebrations[/b] (Golden Ages) as a stronger draw, and empire-wide [b]war weariness[/b] as a push. The happiness and economy balance was re-tuned for 1.4.1's sharper happiness, so a city's yields now matter alongside its mood. You can revert it in Options.
[*][b]Prosperity-driven movement.[/b] Each turn every visible city is scored by a Civ V-style Prosperity model: per-capita food, production, gold, science, and culture, with [b]happiness as the strongest single factor[/b], then bent by a situational penalty from war, sieges, starvation, unrest, and disasters. Unhappy, low-yield cities bleed people even at peace, though after the 1.4.1 rebalance happiness no longer drowns out a city's economy. People move toward higher-prosperity settlements, within and across civilizations.
[*][b]Real, fog-independent war displacement.[/b] War migration keys on [i]actual violence inside a city's borders[/i] (district damage, pillaged tiles), read from game state rather than line of sight, so it works the same for your wars and distant AI-vs-AI wars. A capped, time-gated siege model lets a besieged city shed heavy population but never be emptied without an actual capture.
[*][b]Refugees flee the invader.[/b] War refugees move [i]away[/i] from the nearest enemy, preferring their own civilization first, neutrals next, the attacker last. A trapped, dying population gets an outlet rather than being bottled up forever.
[*][b]Regional, not teleporting.[/b] Migration is distance-penalized, so people move to [i]nearby[/i] better settlements, not across the map.
[*][b]Borders and policy matter.[/b] Pro- and Anti-Immigration stance policies (in each age's civic tree) and base-game Open Borders agreements throttle who crosses and which way, trading Influence, Production, and retention.
[*][b]Growth has a price.[/b] Receiving migrants adds a temporary, decaying assimilation cost (happiness and gold), and a congestion brake stops any single magnet from accreting the world. You cannot out-gold it.
[*][b]It tells you [i]why[/i].[/b] In-the-moment toasts (cause, what to do, whether it's temporary, who pays), per-city readouts, named refugee headlines, and throttled world-news for major crises.
[/list]
[i]Full formulas, the four advanced algorithms (shaped happiness, overcrowding discount, congestion headwind, capped war displacement), and the per-leader tuning table are documented in the README (see Source).[/i]

[b]Migration dashboard[/b]
A full dashboard (optional dock button, or the console `emigration.window()`), in tabs:
[list]
[*][b]Migration network[/b]: an animated graph of civilizations sized by throughput, with migrant particles flowing along the edges.
[*][b]Flow map[/b]: the cross-civ flows as arrows, drillable to individual city-to-city moves.
[*][b]Civilizations[/b]: a per-civ ledger (in / out / net / refugees / losses).
[*][b]Why people move[/b]: the causes (war, disaster, attraction, unhappiness) as pie charts.
[*][b]Settlements[/b]: your cities ranked by how close each is to shedding population.
[*][b]Immigration policies[/b]: who holds Pro-/Anti-Immigration stances, and the effect.
[*]A [b]timeline scrubber[/b] replays how the flows built up across the game.
[/list]
[b]Ethnic Composition map lens[/b] (Shift+E): paints each settlement by the [b]dominant origin civilization[/b] of its people, intensity scaling with that civ's share, so a city founded by one civ, gutted by war, captured, and regrown visibly shifts over time. Hover a settled tile for the exact [b]per-origin percentages[/b], drawn from the same ledger as the dashboard, so map, tooltip, and graphs always agree.

[b]Demographics integration[/b]
Pairs with the [b]Demographics[/b] mod through an order-independent handshake (degrading gracefully on older versions):
[list]
[*][b]Net migration, Emigration, and Immigration[/b] graphs per civilization over time, in the same scaled-people units as Population, each with a [i]Sources:[/i] tooltip by cause (War / Disaster / Attraction / Unhappiness).
[*]A [b]Refugees[/b] graph on the Conflicts page, plus a Refugees row in the war-effects tooltip.
[*]A dedicated [b]Migration[/b] page that shows the whole dashboard as [b]native Demographics sub-tabs[/b], like the Crises and Conflicts pages.
[*][b]Simulate everything, reveal selectively.[/b] The whole world is simulated from turn one (so the topology isn't biased by what you've explored, and a conquered city carries real origin history), while the dashboard and lens [b]mask unmet civilizations for spoiler protection[/b] until you widen the policy.
[*]The dock button is optional, turn it off to open everything from the Migration page instead.
[/list]

[b]Tuning[/b]
[list]
[*][b]Presets[/b] (Low / Medium / High / Custom), plus roughly 57 individual tunables under [b]Options, Mods, Emigration - Advanced[/b] (pacing, scope, prosperity weights, the advanced model, war, borders, geography, assimilation, disasters, notifications, attrition). Every layer is on by default and can be switched off.
[*][b]Counts[/b] shown as game population points, historically scaled people, or both, aligned with Demographics.
[*][b]Scope and visibility are independent[/b] knobs: whole-world vs met-only simulation, and what's shown on screen.
[*][b]Performance, large saves[/b]: lower Demographics' sampling frequency, then raise Emigration's turn interval; both change only how often data updates, never the behavior.
[*]Localized in all 10 supported languages.
[/list]
[i]Every tunable, its default, and the math behind it are in the README (see Source).[/i]

[b]A real gameplay mod, not UI-only[/b]
Population actually moves, and the yields and Influence it produces change with it. Every update is a real per-turn gameplay write.

[b]What it does not do[/b]
[list]
[*]No base-game files replaced.
[*]No AI rewrite; it adds the movement of population on top of normal play.
[*]Per-save data, so it is safe to add or remove.
[/list]

[b]Source[/b]
[list]
[*]Open source on GitHub: https://github.com/tmtmiller1/civilizationvii-emigration
[/list]

[b]Credits[/b]
[list]
[*]Tower, for the design and Civilization VII implementation.
[*]Tomahawk, Mk Z, and Tim_The_Texan, for the canonical "Emigration" mod for Civilization V that served as the prior art for this effort.
[/list]

[b]Special Thanks[/b]
[list]
[*] Potato McWhisky: for teaching me to love again (Civilization VI) after being a Civilization II, IV, V player. Making this mod was an act of faith that they'll eventually make this game as good as the previous entries.