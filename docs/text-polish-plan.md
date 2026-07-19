# Emigration — text / language / presentation polish plan

**Status:** Tiers 0, 1, 2, and 4 executed (en_us only) 2026-07-19; Tier 3 executed
(en_us only) — items 20 and 21 both fully done (the Readouts-group / self-test naming decision
resolved: prefix only genuine children, `_SELFTEST`→"Diagnostics:"). All tiers now executed for en_us.
Also landed one code fix beyond copy: the mis-filed `cityReadout`/`sparkline`/`selftest` tunables were
regrouped out of `notify` (→ `readout` / `visuals`) so they render under the right Advanced-settings
header — see item 21. *Caveat: none of the Tier 3 string/label/render changes have been watched in-game yet.*
Tier 4: the attribution credit line is resolved (see below); item 27's LaTeX-block relocation was
**closed as won't-do** (premise stale — GitHub renders `$$` math; moved to
[wont-fix-with-justifications.md](wont-fix-with-justifications.md)). *(The README §8 native-sub-tab
roster + Chronicle accuracy pass, formerly flagged under item 25, is now DONE.)* A second code change beyond
copy then landed at the author's request: the orphaned `emigration-chronicle-view.js` renderer (dead
since v1.6.0 folded the Chronicle into Notifications) and all its references — modinfo, `.c8rc.json`,
the stale `emigration-views.js` comment, 6 now-unused `LOC_EMIG_CHRONICLE_*` keys across all 12
`ModText.xml` + 12 `i18n/*.json`, and the roadmap/wont-fix mentions — were removed (i18n parity still
green; the Chronicle model and `LOC_EMIG_CAUSE_LABEL_CHRONICLE` stay). See item 25 note for detail.
**Date:** 2026-07-19
**Scope decided:** full pass (Tier 0–4).
**Method:** four read-only copy-edit passes over the distinct player-facing surfaces
(in-game `ModText.xml`, civilopedia + policy XML, README + Steam copy, UI/HTML +
hardcoded-string layer), synthesized here. No files were changed during analysis.

All line numbers below refer to `text/en_us/ModText.xml` unless another file is named.

---

## 0. Constraints that shape the whole pass (read first)

Two of these are **documented house conventions** — the pass honors them rather than
"correcting" them:

1. **British spelling is intentional** (`colour`, `centre`, `flavours`) — see
   `docs/wont-fix-with-justifications.md`. Spelling work therefore means unifying
   *toward British* and removing the accidental American spellings that crept in, **not**
   Americanizing. The real defect is the *mix* (e.g. the caption at L565 uses both
   "colour" and "Color" in one string).
2. **The spaced-comma-as-em-dash is a deliberate rhetorical device**, codebase-wide.
   The tell that separates a genuine comma splice from the device: the empty-state
   strings are inconsistent with *themselves* — L518 / L791 use a comma where the
   identical-pattern L1028 correctly uses a semicolon. The splices listed in Tier 2
   are the genuine ones, not the house device.
3. **Translation re-sync.** `en_us` has 11 sibling locale files. Every English string edit desyncs the
   translations. *(Resolved: the edits landed en_us-only; the 11 locales are now semantically stale for
   the revised keys — parity still green, since the keys exist. Re-translation is tracked as a hand pass
   in [localization-hardcoded-strings-plan.md](localization-hardcoded-strings-plan.md). The i18n pipeline
   is **NOT** an option: `scripts/i18n_apply.mjs` regenerates `text/**` from the stale `i18n/*.json` and
   would clobber hand-authored translations.)* This re-translation is the single biggest execution cost of
   a full pass.
4. **The enclave/quarter decision system is LIVE.** Only the *buildable tile-improvement*
   was removed (commit `e623457`). `maybeQuarter` / `tickContestedQuarters` still run
   every pass (`emigration-main.js:127-128`), `quartersEnabled: true` by default, real
   per-turn `Players.grantYield` writes. So its strings **stay**; the only dead enclave
   text is the 3 orphaned `IMPROVEMENT` strings (Tier 0, item 6).

---

## Tier 0 — Ship-blockers (tiny effort, high embarrassment)

1. ✅ **DONE — Shipped author TODOs visible to players.** Remove the `(re-verify before ship)`
   trailing notes in `LOC_EMIG_QTR_Q_MING_B` (L1301) and `LOC_EMIG_QTR_Q_NEPAL_A`
   (L1412). *Both trailing notes removed.*
2. ✅ **DONE — Developer jargon leaking into option tooltips.** Rewrite in player language:
   - raw unit id `UNIT_MIGRANT` — L219 (`_MHHAP_D`), L221 (`_MHGOLD_D`) → "held migrant". *Done.*
   - "Inferred lever, if it no-ops in your build…" — L214 (`_ASHAP_D`), L219. *→ "(If it has no effect in your game, use the gold cost instead.)"*
   - "Probe-confirmed deduction lever…" — L216 (`_ASGOLD_D`), L221. *Removed; the useful "across civilizations" fact folded into L216's sentence.*
   - raw code var `siegeLossCapPct` in the Guide — L1640, L1684. *Parentheticals removed.*
   - "legacy linear weight" / "legacy flat violence penalty" — L157, L182 (internal register). *→ "simpler flat happiness weight" / "simpler flat violence penalty".*
3. ✅ **DONE — Malformed `" ; "` separators** (read like unfinished strings) → colon or em-dash:
   L704 (`_VIEW_SAMPLE_BADGE`) → em-dash; L776 (`_CF_DIR_IMMIGRANTS`), L779 (`_CF_DIR_EMIGRANTS`) → colon.
4. ✅ **DONE — Self-contradictory enclave-cap sentence.** Civilopedia L478 stated the per-origin
   cap two incompatible ways ("at most two … across your empire, but two of each
   civilization"). *Rewritten to state the rule once: "A single origin civilization can hold at
   most two enclaves across your empire; the cap is counted per origin…"*
5. ✅ **DONE (verified — no bug, no change).** `LOC_EMIG_PCT` (L1745) and
   `LOC_EMIG_PCT_SIGNED` (L1746) are byte-identical, but the `+`/`−` sign is applied by the
   **caller**: `ui/emigration-prosperity-tooltip.js:99` substitutes `(pct >= 0 ? "+" : "") + pct`
   into `{1_Pct}`. The LOC string is a correct percent wrapper — leaving it as-is is right.
6. ✅ **DONE — Removed the 3 orphaned buildable-improvement strings** (`LOC_EMIG_ENCLAVE_IMPROVEMENT_NAME` /
   `_DESCRIPTION` / `_TOOLTIP`). *Confirmed zero references in any `.js/.sql/.html/.modinfo`
   before deleting; they lived only in the locale text files.*

---

## Tier 1 — Terminology unification (highest-value consistency work)

7. ✅ **DONE — "Cultural Quarters" → "Cultural Enclave".** L107 (`_COSMO_DESC`) was the lone
   player-facing "Cultural Quarters" → "Cultural Enclaves". *Audit result: the `{1_Quarter}`
   placeholder (L620) shows no literal noun (the param name is invisible), and the "district"
   uses (L478, L914, L1175, L1721) all read as location/flavor prose beside a canonical
   "Cultural Enclave" — kept as flavor per the policy.*
8. ✅ **DONE — "Assimilation" → "Integration".** Readout `_RO_ASSIM_COST` "Assimilation cost:"
   → "Integration cost:" (the only player-facing "Assimilation"; tag name unchanged).
9. ✅ **DONE — Border-policy naming → "Stance".** Card references renamed off "Open/Closed
   Borders": `_BORDERS_D`, the three slider labels + their `_D` bodies (`_CLOSEDOPEN`/
   `_CLOSEDRETAIN`/`_OPENOPEN` → "Anti-Immigration openness/retention", "Pro-Immigration
   boost"), and Guide `_R3_Q` ("An Anti-Immigration Stance reduces cross-civ flow").
   "Stance" capitalized where it names the card (L446, L474, and Guide L1603/1604/1627).
   *Kept as-is: the 5 "Open Borders **agreement**" (base-game diplomatic) refs, and L355
   `_REASON_OPEN_BORDERS` = "open borders" (already lowercase cause label).*
10. ✅ **DONE — "Ethnicity lens" → "Ethnic Composition lens"** at Guide `_7_F0_A`; menu label
    "Ethnicity" (`_LENS_MENU`) kept as the compact label.
11. ✅ **DONE — "Most diverse cities" → "Most diverse settlements"** (all 4 occurrences: the
    option label, its `_D`, and the two dashboard headings). Body already said "settlements".
12. ✅ **DONE — Civilopedia card names.** `_ATTRACTION_BODY` → "The Talent Attraction, Cultural
    Magnetism, and Commercial Draw policies…" (matches the actual card names).
13. ✅ **DONE — Register fixes:** "per-civ tuning" → "per-civilization tuning" (L470); "culture"
    → "Culture" (the yield, `_ATTRACTION_BODY`); bare narrative "civ"/"civs" → "civilization(s)"
    across civilopedia + Guide prose (~24 spots). *Preserved deliberately: the compact coinage
    "cross-civ" (8×), "civ-wide"/"major-civ" compound adjectives, "Civ Pop"/"Civ" (the game's
    population measure), and the compact slider labels "per-leader/civ tuning" / "civ-tuning
    strength".*
14. ✅ **DONE — British-spelling unification** *(per Constraint 1)*: `color`→`colour`
    (L454/474/476 + the `Color by:` button and its L565 caption ref, resolving the
    self-contradiction), `neighbor`→`neighbour` (all forms), `behavior`→`behaviour` (all
    forms), `-ize`→`-ise` ("organised", "Recognise"). *"center"/"centre" deliberately NOT
    touched — the plan's item-14 list omits it (likely aligns with base-game "City Center").*

---

## Tier 2 — Grammar & mechanics sweep

15. ✅ **DONE — Genuine comma splices** *(not the house device — see Constraint 2)*:
    L278 (`_ATTRITION_D`), L212 (`_ASDECAY_D`), L210 (`_ASPOP_D`), L470
    (`_CIVTUNING_BODY`), L472 (`_VISIBILITY_BODY`), and the empty-states L518 / L791.
    *In-prose splices joined with em-dashes (L472 uses a colon — the second clause explains
    "honest"); the two empty-states aligned to the semicolon per L1028.*
16. ✅ **DONE — Spaced-hyphen where an em-dash belongs** in panel titles: L581
    (`_PANEL_POP_TITLE`), L1091 (`_RO_TITLE`), L1037 (`_RO_WARN_DISTRESS`). *All three → em-dash.*
17. ✅ **DONE — Policy-card parallelism / formatting** (cards are player-visible):
    - The two Asylum descriptions (L434 / L436). *Made parallel: both now lead with
      `[icon:YIELD_POPULATION]` (the icon belongs — every other card family carries it and
      these are population cards) and use the same frame, "Refugees fleeing war and disaster
      are strongly drawn to you, the most desperate first; you earn …".*
    - "Immigration … rises by 50%" (Open) vs "falls to 40%" (Closed). *Both now relative
      deltas: Closed → "falls by 60%" (all 3 tiers, L421–423). **Verified against code:**
      `closedBordersOpenness: 0.4` (`ui/emigration-config.js:472`, comment "60% of immigration
      turned away") = a 60% reduction; also makes the Closed card consistent with its own
      "40% fewer … leave".*
18. ✅ **DONE — Casing / range consistency:** page titles → "Ethnicity &amp; Integration"
    (L475), "The Chronicle &amp; Refugee Decisions" (L479). Numeric ranges standardized on
    **en-dash** (matching L1701): L1686, L1689, L1691. *(Grep confirmed those were the only
    hyphen ranges, so all numeric ranges are now en-dash.)*
19. ✅ **DONE — Non-parallel list items:** REFUGEES L451 middle item → "damage to its
    districts" (noun phrase, parallel to its siblings); DASHBOARD L474 two outliers → "A
    settlements list, …" / "A policies view, …" so every bullet begins "A …".

---

## Tier 3 — Readability / density (most subjective)

20. ✅ **DONE (en_us) — Trimmed the run-on option tooltips** (40–90 words, stacked clauses).
    *All five done:* `_HSHAPED_D` (~65→~48w, folded the saturation parenthetical, all four
    mechanics kept), `_DNOTIFYMODE_D` (trimmed padding; the 0/1/2 definitions kept verbatim),
    `_MAXLOSS_D` / `_MAXGAIN_D` (dropped the parentheticals + "hemorrhaging" flourish,
    comma-splices → em-dash; all preset numbers kept), `_NETC_CAPTION` (~90→~75w; kept the dot
    legend, the arrow colours, and every control name — done after Tier 1's colour fix landed),
    and `_ANTISNOWBALL_D` (comma-splice → em-dash, "grows with how far ahead it is"→"with its
    lead"; **kept "cross-civ"** — Tier 1 item 13 deliberately preserves that coinage, so no
    conflict). Guide/FAQ/civilopedia long-form bodies left long by design.
21. ✅ **DONE (en_us) — Added the missing "Category:" label prefixes.** *Clean prefixes:* the
    lone "•"-bullet `…NUMBERS` label at L11 → "Emigration: migration counts"; `_ESCAPE` →
    "Geography: crisis escape (flee abroad)" (matches its 5 Geography siblings).
    *Naming decision (resolved — reflect real structure, don't mechanically prefix):* the
    Readouts group carries the category in its header, so only genuine children get a
    parent-prefix — `_COSMO` (L49) → "Diversity ranking: cosmopolitanism column" (it adds a
    column to the ranking; "label"→"column" per its desc), leaving the two standalone features
    bare (`_DIVERSITY` L47 "Most diverse settlements ranking", `_EXPLAINER` L53 "Migration
    explainer"); `_DIVERSITYROWS` L51 already correct. `_SELFTEST` (L275) → "Diagnostics:
    on-screen self-test panel" (an honest prefix — it's a diagnostics tool, not a readout).
    ✅ **Structural fix DONE (code + copy):** `_CITYREADOUT`/`_SPARKLINE`/`_SELFTEST` were
    mis-filed in the `notify` tunable group, so they rendered under the "Notifications" header.
    Regrouped in `ui/emigration-tunables.js`: the two per-city readout panels → `readout` (they
    now render under "Readouts &amp; rankings", exactly the "later readout features JOIN this
    group" case the code comment invites), and the self-test panel → `visuals` (UI-only, touches
    nothing in the sim). `.group` is read only by `emigration-advanced-editor.js` for render
    grouping, so keys/persistence/behaviour are unchanged. Because the two readout panels now sit
    under the self-naming "Readouts" header, their old "Readout:" label prefix was redundant, so
    the labels were realigned to the group's parent/child pattern: `_CITYREADOUT` → "Per-city
    migration readout" (standalone, bare) and its child `_SPARKLINE` → "Per-city readout:
    recent-trend sparkline". `_SELFTEST` keeps "Diagnostics: on-screen self-test panel" (not
    redundant under the "Visuals" header). *Not yet watched rendering in-game.*

---

## Tier 4 — Store & README copy

22. ✅ **DONE — Fixed the ungrammatical Steam hook.** `docs/steam-workshop-description.md:3`
    ("Population moves … changes yields, growth, and Influence as they move") — ported the
    README's already-correct wording ("…changing yields, growth, and Influence as it goes").
    *"with justification" → "with its cause".*
23. ✅ **DONE — Strengthened both openings.** Both now lead with the concrete cause-and-effect
    line ("When a settlement is starving … people leave. When … thriving, they move there instead.")
    ahead of the "adds … systems" clause — Steam short (`steam-workshop-description-short.md:1`),
    Steam long (`:3`), and README (`:3`).
24. ✅ **DONE — Reordered the Steam long description.** **Mechanics** now sits directly under the
    hook, the **Migration dashboard** blurb follows, and the human-reality note comes after the
    feature lists. *The five-line milestone ledger was condensed to one line pointing at the
    repository for receipts + the full ledger.*
25. ✅ **DONE — Reconciled all three rosters against the code, each to its own surface.**
    - **The two standalone rosters** (Steam `:38`, README dashboard blurb `:58-60`) now read
      "Migration Network, Net Migration, Why People Move, Settlements, Diversity, Immigration
      Policies, Notifications, and a Guide" — matched to the standalone `dashboardModel` sections
      (`ui/emigration-views.js:267-279`); the README "Notifications log" + "Migration notifications"
      duplicate is gone (they were two names for the one "Migration notifications" section).
    - **The README §8 Demographics native-sub-tab roster** (`:749-751`) now reads "Network, Causes,
      Settlements, Diversity, Immigration Policies, Notifications, and Guide" — matched to the panel
      path's `SUBTABS` (`ui/emigration-migration-page.js:25-39`; the `ledger` entry is intentionally
      hidden). The two phantom tabs — **"Civilizations"** (never existed) and **"Chronicle"** —
      were removed, and the real **"Diversity"** tab (gated on `diversityRanking`, default `true`)
      added.
    - Core-mechanic name standardized on **"Prosperity model"** (Steam `:25` + README `:34`, was
      "Migration scoring").
    - **Chronicle accuracy pass (the formerly-open flag) — resolved by tracing the code.** The
      Chronicle *model* is live (`emigration-chronicle.js`; `recordChroniclePass` runs every pass via
      `emigration-main.js:119`), but there is **no Chronicle sub-tab**: `renderChronicle`
      (`emigration-chronicle-view.js:95`) has zero callers anywhere in the mod, and the file is loaded
      as a UIScript yet never invoked (orphaned renderer). Chronicled moments surface by being
      **mirrored into the Notifications log** as `"chronicle"`-kind entries (`emigration-chronicle.js:166`
      `mirrorToNotifications`, rendered by `emigration-notifications-view.js:157` `chronicleDetail`) —
      "so the Notifications tab is the single home for every migration event, the story prose included."
      Fixed the three stale "Chronicle **tab**" claims accordingly: README `:192` (feature table),
      `:673` (§6h "its own dashboard tab"), and the `:752` §8 bullet.
    - ✅ **Dead-code removal (done at author's request, 2026-07-19).** Deleted the orphaned
      `ui/emigration-chronicle-view.js` (git history confirms v1.6.0 `08b1575` folded the Chronicle
      into Notifications and left the renderer behind) and every reference: the `emigration.modinfo`
      UIScript entry (+ comment), the `.c8rc.json` coverage entry, the stale `emigration-views.js:705`
      section-kind comment, the 6 now-orphaned `LOC_EMIG_CHRONICLE_KIND_*/_TITLE_FALLBACK/_TURN/_EMPTY`
      strings across all 12 `ModText.xml` + 12 `i18n/*.json` (i18n parity harness still green, 1013
      keys), and the roadmap/wont-fix mentions (§17.1 marked *Dropped*; §21 + `KIND_LABEL` "three
      spots" → "two spots" guidance updated). Dated historical log entries in the backlog were left as
      history. `LOC_EMIG_CAUSE_LABEL_CHRONICLE` (the live Notifications cause label) was preserved.
26. ✅ **DONE — De-jargoned the player-facing surfaces.** Removed "Real gameplay writes, not a
    UI-only layer" from the Steam short (rephrased to "real gameplay effects, not just a display")
    and dropped "UI VM (GameFace JS)" from the README pitch (`README.md:62`), which now points to
    §12 for the runtime detail (that detail already lives at `README.md:910`).
27. ✅ **DONE (signpost) + CLOSED (relocation won't-do).** The marketing→manual signpost shipped
    (one-line note under "## System Guide and Feature Reference"). The LaTeX-block relocation was
    closed as won't-do — GitHub renders `$$…$$` math natively (since May 2022), so the premise was
    stale — and moved to [wont-fix-with-justifications.md](wont-fix-with-justifications.md).
28. ✅ **PARTIAL — Unified charity name / receipts wording.** "Doctors Without Borders" →
    "Médecins Sans Frontières" (Steam short `:5`, unglossed to avoid a nested parenthetical);
    the Steam long milestone rewrite uses "Médecins Sans Frontières (MSF)"; "the github" → "the
    repository" (Steam long). *README already internally consistent ("Médecins Sans Frontières"
    at the detailed mention, "MSF" in the org list) — no "Doctors Without Borders" there.*
    ✅ **Resolved (2026-07-19):** the credit belongs to **Tomahawk, Mk Z, and Tim_The_Texan**.
    The stray "Machiavelli" attribution in `emigration.modinfo:7` was wrong and has been corrected.

---

## Open decisions (need input before those items execute)

- ~~**[BLOCKER for the credit line] Attribution conflict — factual.**~~ **Resolved
  (2026-07-19):** the inspiring Civ V mod is credited to **Tomahawk, Mk Z, and Tim_The_Texan**
  (matching `README.md` / Steam). The stray "Machiavelli" credit in `emigration.modinfo:7` was
  incorrect and has been removed.
- ~~**Translation re-sync preference** (Constraint 3) — pipeline-refresh vs edit-en_us-only.~~
  **Moved out (2026-07-19):** the en_us-only Tier 0–3 edits left the 11 locales' translations
  semantically stale (parity still green — keys exist — but they translate the old English). This is now
  tracked as a hand re-translation follow-up in
  [localization-hardcoded-strings-plan.md](localization-hardcoded-strings-plan.md) ("Follow-up — re-translate
  the strings revised by the text/language polish pass"). The pipeline option is off the table there (it
  regenerates from stale `i18n/*.json`), so there is no open decision left — only the re-translation work.

---

## Out of scope for this pass

- **Hardcoded-string localization** is already a documented, deferred plan
  (`docs/localization-hardcoded-strings-plan.md`) whose inventory holds up under
  spot-checking. **The one gap flagged here has now been audited and folded into that doc**
  (2026-07-19, "Tier 1b — Guide tab nav-pill labels"): a full audit of `ui/emigration-guide.js`
  confirmed the file is otherwise fully localized (157 `LOC_EMIG_GUIDE_*` keys); the *only* leak is the
  two nav-pill labels "What counts" / "FAQ" (defined L311-312, rendered raw L324), fixed by a
  `LOC_EMIG_GUIDE_VIEW_REF` / `_FAQ` pair. Nothing else to do here.
- **UI presentation layer (HTML/CSS) is clean** — flexbox throughout, no `display:grid`
  / `1fr` GameFace trap, no selector/class mismatch, no structural issues. Nothing to do.

---

## Suggested execution order

1. **Tier 0** first — smallest, zero naming ambiguity, highest embarrassment-per-fix; no
   translation decision needed to start (removals + jargon rewrites).
2. **Tier 1** terminology, after confirming the Stance/Enclave nouns above.
3. **Tier 2** grammar sweep.
4. **Tier 4** store/README — independent of the in-game strings; can run in parallel
   (attribution fact now confirmed: Tomahawk, Mk Z, and Tim_The_Texan).
5. **Tier 3** density/readability last (most subjective, most re-translation churn).
6. Before shipping: re-translate the revised strings into the 11 locales by hand (tracked in
   [localization-hardcoded-strings-plan.md](localization-hardcoded-strings-plan.md) — **not** via the
   i18n pipeline, which uses stale data), and run `tests/i18n.mjs` (parity gate) +
   `tests/validate-package.mjs`. Also: none of the Tier 3 string/label/render changes have been watched
   in-game yet — verify in-game before release.
