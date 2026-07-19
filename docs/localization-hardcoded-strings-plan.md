# Emigration mod — full localization of remaining hardcoded strings

## Context

The demographics mod completed a full interface-localization pass (v2.3.0/v2.3.3): every
user-facing string routes through a `LOC_` tag resolved at runtime via `Locale.compose`, with
numbers formatted locale-aware. The emigration mod is *mostly* there (947 `LOC_` keys, disciplined
`loc()/tr()/pick()` helpers) but a read-only audit found **14 `ui/` files still emitting hardcoded
English** that never round-trips through the localization DB. In non-English locales these render as
raw English — in the in-game Settings panel, the Advanced-settings editor, the Demographics charts,
and inside notification / world-news / chronicle sentences.

Goal: convert every player-visible hardcoded string (except the opt-in Sample-preview text) into
`LOC_` keys, author **real translations across all 11 non-English locales**, and add a guard so this
class of drift is caught in CI going forward. Outcome: a fully localized emigration UI with no
English leaks in supported languages.

> **The counts and file inventory above are the original audit snapshot.** For what is actually done
> vs. pending as of 2026-07-19, see **[Current status](#current-status-audited-2026-07-19-mod-at-changelog-2010)** below — the L1 lens tooltips
> have since shipped; every other tier is still outstanding.

Decisions locked with the user:
- **Translations:** author real translations in all 11 locale files (not English placeholders).
- **Scope:** Tier 1 (options) + Tier 2 (Demographics charts) + Tier 3 (concatenated fragments) +
  the L1 lens tooltips already tracked in docs. **Skip** `emigration-demo-data.js` sample-preview
  text and log it as a deliberate wont-fix.

---

## Current status (audited 2026-07-19, mod at CHANGELOG 2.0.10)

A read-only re-audit of the live `ui/**` tree against this plan. `text/en_us/ModText.xml` now holds
**1,014 `<Row>` keys** (up from the ~947 cited below); ~572 distinct `LOC_` literals are referenced in
`ui/`. State of each tier:

| Tier | Status | Notes |
|------|--------|-------|
| **L1 — Lens tooltips** | ✅ **DONE** | Both files now route through `loc()`; keys exist in ModText. See the L1 section for the one residual leak. |
| **Tier 1 — Options / tunables / advanced editor** | ❌ Not started | All literals intact; none of the proposed `LOC_OPTIONS_EMIG_*` / `LOC_EMIG_CHOICE_*` / `LOC_EMIG_ADV_*` keys exist. Line numbers drifted — corrected inline below. |
| **Tier 1b — Guide nav-pills** | ❌ Not started | `"What counts"` / `"FAQ"` still literal in `views[]`. Line refs still accurate. |
| **Tier 2 — Demographics chart specs** | ❌ Not started | No `LOC_DEMOGRAPHICS_METRIC_EMIG_*` id-derived keys added; view labels / `"people / turn"` unit still literal. Dead `…_EMIG_NET_MIGRATION` keys still present (2 rows). |
| **Tier 3 — Concatenated fragments** | ❌ Not started | Every literal still present. Line numbers drifted in `naming.js` / `causes.js` — corrected inline below. |
| **Hardening — CI guard** | ❌ Not created | `tests/i18n-ui-keys.mjs` does not exist. |
| **Follow-up — re-translate polished en_us** | ⏳ Pending | Still applies; batch with the new-key work as written. |

Net: **L1 is the only completed piece.** Everything else remains exactly as scoped — the plan below
holds, with the line-number corrections noted per section.

### Key reconciliation (which `LOC_` codes we need vs. don't) — audited 2026-07-19

Cross-checked every key this plan proposes against the 1,014 en_us tags.

- **We DO need to add all of them — none are stray.** Every proposed Tier 1 / 1b / 2 / 3 key is
  genuinely **absent** from ModText (verified by exact-tag grep). Nothing on the "to add" list already
  exists, so there's no redundant work to prune.
- **Two Tier-2 keys already exist and stay:** `LOC_DEMOGRAPHICS_METRIC_EMIG_REFUGEES` and its
  `_SUBTITLE` (they correctly match id `emig_refugees`). Do **not** re-add them.
- **Six Tier-2 keys we DON'T want — remove, don't add:** `LOC_DEMOGRAPHICS_METRIC_EMIG_NET_MIGRATION`,
  `_EMIG_IN`, `_EMIG_OUT` (+ their `_SUBTITLE`s) are defined in all 12 locale files but are dead
  (no matching id, zero references). **72 rows to delete.** See Tier 2 step 2.
- **`emigration-migration-page.js` needs NO new keys** — the `SUBTABS`/`HUB_PAGES` labels it hardcodes
  ("Network", "Net Migration (Table)", "Causes", …) already have shipped siblings in
  `emigration-views.js` (`LOC_EMIG_VIEW_TAB_NETWORK`, `_TAB_NET_TABLE`, `_TAB_CAUSES`, `_TAB_POLICIES`,
  `_TAB_MY_CITIES`, `_TAB_DIVERSITY`, `_TAB_NOTIFICATIONS`, `_TAB_GUIDE`). Reuse them; only mint a new
  key where the label text differs (e.g. migration-page's "Settlements" vs. views' "My Cities",
  "Immigration Policies" vs. "Policies") — decide per label whether to reuse the near-equivalent or add one.
- **Two keys the plan didn't list but we'd need if we close the L1 residual:** localizing the
  `cityTitle(..., "Prosperity")` / `cityTitle(..., "Ethnic Composition")` fallback titles (see L1
  section) would add `LOC_EMIG_PROS_TITLE` / `LOC_EMIG_ETH_TITLE_FALLBACK` (names TBD). Optional.

### Version target

**Next release = `2.1.0`** (minor bump — "full interface localization" is a feature, mirroring the
demographics mod's localization release), not a `2.0.11` patch. CHANGELOG's `[Unreleased]` section is
currently empty; the localization work lands there under `## [2.1.0]`.

---

## Localization machinery to reuse (do NOT reinvent)

- **Helper:** `loc(key, fallback, ...args)` in [ui/emigration-loc.js](../ui/emigration-loc.js) — composes via `Locale.compose`, returns the English `fallback` (with `{1_X}` placeholder fill) on any miss/throw. Import as
  `import { loc } from "/emigration/ui/emigration-loc.js";` (or `loc as tr`). Several files carry
  local `loc`/`pick` copies (`emigration-naming.js:26`, `emigration-report.js:35`,
  `emigration-move-reasons.js:82`, `emigration-network-viz.js:92`); reuse the file's existing local
  helper rather than adding a second import.
- **12 ModText files:** `text/en_us/ModText.xml` uses `<EnglishText>` / `<Row Tag="…"><Text>…</Text></Row>`.
  The 11 others use `<LocalizedText>` / `<Replace Tag="…" Language="xx_XX"><Text>…</Text></Replace>`.
  **`Language=` codes** (mixed-case, from modinfo): `de_DE es_ES fr_FR it_IT ja_JP ko_KR pl_PL pt_BR ru_RU zh_Hans_CN zh_Hant_HK`.
  Every new key = **1 `<Row>` in en_us + 11 `<Replace>` rows** (one per locale, correct `Language=`).
- **Namespace invariant (enforced):** every en_us tag must contain `EMIG`/`EMIGRATION` or `DEMOGRAPHICS`
  (`tests/validate-package.mjs:182`).
- **Do NOT run the `i18n/` pipeline.** `scripts/i18n_apply.mjs` regenerates `text/**` from the
  **stale** `i18n/*.json` (936 keys / pl_pl 804) and would clobber hand-authored translations. Edit
  `text/**/ModText.xml` by hand only. `release.sh` already excludes `i18n/` and never regenerates.
- **Parity gate:** `tests/i18n.mjs` (`npm run test:i18n`) asserts every en_us key exists in all 11
  locale files — this catches any locale you forget. `tests/validate-package.mjs` checks XML
  well-formedness + namespace + data-XML key references.
- **Translation consistency:** before translating, extract how existing keys render domain terms per
  locale (e.g. de "Auswanderung"=Emigration, "Einwanderung"=Immigration, "Flüchtlinge"=Refugees) and
  reuse that vocabulary so new strings match the established voice in each language.

---

## Tier 1 — Options & Advanced editor (in-game Settings, highest value)

These sit next to siblings that already use `LOC_` keys — pure inconsistency.

**[ui/emigration-options.js](../ui/emigration-options.js)** — the Options framework resolves a bare `LOC_` string automatically, so replace each hardcoded `label:`/`description:` with a `LOC_` key:
- `SNAP_ITEMS` (L68–73): 5 dropdown labels → `LOC_OPTIONS_EMIG_SNAP_1`…`_5` (or `_EVERY_TURN`, `_2`…).
- `VISIBILITY_ITEMS` (L79–82): 3 labels → `LOC_OPTIONS_EMIG_VISIBILITY_FOLLOW` / `_HIDE` / `_SHOWALL`.
  (Delete the "no localization round-trip needed" comment.)
- Checkbox/dropdown label+description pairs (L187, 206, 222, 240, 257, 274…): 6 `label` + 6 `description`
  → `LOC_OPTIONS_EMIG_MINIMIZE` / `_DESCRIPTION`, `_NOTIFICATIONS` / `_DESCRIPTION`, `_VISIBILITY` /
  `_DESCRIPTION`, `_DILEMMAS` / `_DESCRIPTION`, `_ETHNIC` / `_DESCRIPTION`, `_RETURN` / `_DESCRIPTION`.
  Follow the existing `LOC_OPTIONS_EMIGRATION_*` / `_DESCRIPTION` convention already in the file.

**[ui/emigration-tunables.js](../ui/emigration-tunables.js)** — `choiceLabels` arrays (current lines: L111 `Off/Weak/Standard/Strong`, L125 & L127 `Off/Important/Verbose`, L126 `Any/Minor+/Moderate+/Major only`). Convert to `LOC_` keys resolved at render time. Confirm how `choiceLabels` reach the dropdown in `emigration-advanced-editor.js`: if the editor renders them verbatim, either store keys and `loc()` them at build time in the editor, or store `LOC_` strings if the dropdown widget auto-resolves. Keys: `LOC_EMIG_CHOICE_OFF/WEAK/STANDARD/STRONG`, `LOC_EMIG_CHOICE_OFF/IMPORTANT/VERBOSE`, `LOC_EMIG_CHOICE_ANY/MINOR/MODERATE/MAJOR`. (Numeric `"30%"` labels at L109 stay literal.)

**[ui/options/emigration-advanced-editor.js](../ui/options/emigration-advanced-editor.js)** — 3 UI-chrome strings via `loc()` (current lines):
- L268 placeholder "Search settings…" → `LOC_EMIG_ADV_SEARCH_PLACEHOLDER`
- L276 caption "Reset all to defaults" → `LOC_EMIG_ADV_RESET_ALL`
- L344 tooltip "Reset to default" → `LOC_EMIG_ADV_RESET_ONE`

---

## Tier 1b — Guide tab nav-pill labels (found in the 2026-07-19 text-polish audit)

**[ui/emigration-guide.js](../ui/emigration-guide.js)** — *not in the original 14-file inventory; a full
audit of this file was run 2026-07-19.* The Guide tab is otherwise **fully localized**: 157
`LOC_EMIG_GUIDE_*` keys already cover every section title (`_<i>_TITLE`), matrix row (`_<i>_R<n>_Q` /
`_N`), and FAQ pair (`_<i>_F<n>_Q` / `_A`) via stable, position-derived keys resolved through `loc()` at
render (L225–235, 278). The **only** hardcoded leak is the two nav-pill labels — `"What counts"` and
`"FAQ"` — defined in the `views[]` array (L311–312) and rendered raw at L324
(`ce("div", "emig-guide-pill", v.label)`). **Fix:** add a `key:` to each `views[]` entry and wrap at
render — `loc("LOC_EMIG_GUIDE_VIEW_REF", "What counts")` / `loc("LOC_EMIG_GUIDE_VIEW_FAQ", "FAQ")`; add
both keys as 1 en_us `<Row>` + 11 `<Replace>` rows. (The `YES`/`NO` `✓` / `×` are glyphs, not
translatable — leave them. No other hardcoded visible text exists in the file.)

---

## Tier 2 — Demographics chart specs (needs the id-derived key mechanism, not a simple wrap)

**Critical mechanism:** the Demographics host does **not** compose the `label`/`title`/`subtitle`
strings emigration passes. `localizedMetricName()` (demographics `ui/metrics/demographics-metrics.js:622`)
builds the key **from the metric `id`**: `LOC_DEMOGRAPHICS_METRIC_<ID.toUpperCase()>`, with
`_TITLE` and `_SUBTITLE` variants (`history-tabs.js:271,318`). Raw English is fallback only.
Therefore:

1. **Add id-derived keys for every spec `id`** in
   [ui/emigration-demographics.js](../ui/emigration-demographics.js) and
   [ui/emigration-demographics-per-cause-metrics.js](../ui/emigration-demographics-per-cause-metrics.js). The **exact** keys (from the audited ids):
   - `LOC_DEMOGRAPHICS_METRIC_EMIG_NET_CUM` (+`_TITLE` +`_SUBTITLE`), `…_EMIG_NET_CUM_PTS`,
     `…_EMIG_REFUGEES` (+`_SUBTITLE`, already exists), `…_EMIG_REFUGEES_PTS`, `…_EMIG_REFUGEES_IN`,
     `…_EMIG_REFUGEES_IN_PTS`, `…_EMIG_OUT_CUM`, `…_EMIG_OUT_CUM_PTS`, `…_EMIG_IN_CUM`,
     `…_EMIG_IN_CUM_PTS`, `…_EMIG_POPULATION`.
   - Per-cause: `…_EMIG_WAR_EMIGRATION`, `…_EMIG_DISASTER_EMIGRATION`, `…_EMIG_PROSPERITY_EMIGRATION`,
     `…_EMIG_UNHAPPINESS_EMIGRATION`, `…_EMIG_WAR_IMMIGRATION`, `…_EMIG_DISASTER_IMMIGRATION`,
     `…_EMIG_PROSPERITY_IMMIGRATION`.
   Keep the raw English `label`/`title`/`subtitle` in the spec objects as the fallback.
2. **Reconcile dead keys — ✅ confirmed dead (audited 2026-07-19):** `LOC_DEMOGRAPHICS_METRIC_EMIG_NET_MIGRATION`,
   `_EMIG_IN`, `_EMIG_OUT` (+ their three `_SUBTITLE`s) exist but match **no** metric `id` and are
   **referenced nowhere** in `ui/` or `data/` (whole-word grep = 0 hits outside their own ModText rows).
   → **Remove all 6 keys, all 12 locale files = 72 `<Row>`/`<Replace>` rows.** `EMIG_REFUGEES` /
   `_SUBTITLE` **already exist and correctly match** id `emig_refugees` — keep (don't re-add).
3. **`description` has no host key path** — the host renders `metricObj.description` verbatim as the
   title hover-tooltip (`history-tabs.js:295`). To localize, **pre-compose in the spec**: set
   `description: loc("LOC_DEMOGRAPHICS_METRIC_EMIG_<ID>_DESC", "<english>")`. (Import/using the file's
   `loc`.) Add the `_DESC` keys to ModText.
4. **`unit`:** `"people"` / `"points"` are already in the host's `UNIT_LOC` table → leave as-is (they
   localize). The per-cause `unit: "people / turn"` is **not** in `UNIT_LOC` → pre-compose it:
   `unit: loc("LOC_DEMOGRAPHICS_UNIT_PEOPLE_PER_TURN", "people / turn")`, and add that key.
5. **Group + view labels:** the `emig_graphs` group (`registerMetricGroup`, L384/420) and the
   sub-tab/view labels (L385–398: "Data", "Scaled Population", "Civ Population", "Net Migration
   (Graph/Table)", …), plus the `"Sources: "` tooltip prefix (L152/162). **Verify** how the host
   renders group name + view labels (does `registerMetricGroup` localize via a key, or verbatim?).
   If verbatim, pre-compose via `loc()`; add `LOC_DEMOGRAPHICS_METRIC_EMIG_GRAPHS`, `LOC_EMIG_VIEW_*`,
   `LOC_EMIG_SOURCES_PREFIX` keys. (Reuse existing `LOC_EMIG_VIEW_*` keys if present.)

**[ui/emigration-migration-page.js](../ui/emigration-migration-page.js)** — `SUBTABS`/`HUB_PAGES` labels+titles (L25–36, 122–128) and page title "Migration" (L99). The standalone window (`emigration-views.js:516`) already localizes the same tab bar via `loc()` — **reuse the exact same `LOC_` keys** here rather than minting new ones; wrap the embedded copies in `loc()`.

---

## Tier 3 — Concatenated fragments in notifications / world-news / chronicle

The connectors/fallbacks glued onto localized names leak English. Fix by moving the whole sentence
into a `LOC_` template with `{n_X}` placeholders (the `loc()` helper fills them), instead of `+`
concatenation.

- **[ui/emigration-naming.js](../ui/emigration-naming.js)** (largest; current lines): war name `victim + "–" + aggressor + " War"` (L389) and `(victim || "the") + " War"` (L390) → `LOC_EMIG_WARNAME_TWO` `"{1_Victim}–{2_Aggressor} War"` / `LOC_EMIG_WARNAME_ONE`. `" Enclave"` (L175/177, `"foreign enclave"`) → `LOC_EMIG_QUARTER_ENCLAVE` `"{1_Demonym} Enclave"` / `LOC_EMIG_QUARTER_ENCLAVE_FOREIGN`. `" Crisis"` (L226) → `LOC_EMIG_EVENT_CRISIS_SUFFIX` template. Generic fallbacks (`UNMET_LABEL="an unmet civilization"` def L17, used L311/348–350, `"a people"` L72, `"a disaster"` L194, and the `|| "people"/"a settlement"/"A nation"/"A disaster"/"war"` at L413–440) → `LOC_EMIG_FALLBACK_UNMET_CIV`, `_A_PEOPLE`, `_A_DISASTER`, `_PEOPLE`, `_A_SETTLEMENT`, `_A_NATION`, `_WAR`. (These are already `loc(key) || fallback` in places — where a key already exists, just ensure it's defined; where the literal is the only source, add a key.)
- **[ui/emigration-events.js:316](../ui/emigration-events.js)** — `name + " strikes " + place + "! "` → `LOC_EMIG_DISASTER_STRIKES_AT` `"{1_Name} strikes {2_Place}! "` and `LOC_EMIG_DISASTER_STRIKES` `"{1_Name} strikes! "`.
- **[ui/emigration-narrative.js:228](../ui/emigration-narrative.js)** — `Math.round(e.pct) + " percent"` feeding `{n_Pct}`. Prefer `Locale.toPercent`/existing percent helper; if a bare number is needed, add `LOC_EMIG_PERCENT` `"{1_N} percent"`. Check for an existing percent formatter in the mod first.
- **[ui/emigration-return.js:251](../ui/emigration-return.js)** — `reason: "at peace again"` → `LOC_EMIG_RETURN_REASON_PEACE`, composed before passing as `{4_Reason}`.
- **[ui/emigration-feedback.js:641](../ui/emigration-feedback.js)** — `UNMET_CIV_LABEL="an unmet civilization"` (def L641; used L468/654/685/778) → reuse `LOC_EMIG_FALLBACK_UNMET_CIV` from naming.js.
- **[ui/emigration-causes.js:279](../ui/emigration-causes.js)** — `` `+${rows.length - 4} more` `` → `LOC_EMIG_CAUSES_MORE` `"+{1_N} more"`.
- **[ui/emigration-quarter-phrases.js](../ui/emigration-quarter-phrases.js)** — ~20 diaspora phrases (L16–33) with **no `_KEYS` sibling**. `emigration-narrative.js` already has localized parallel copies WITH `_KEYS` arrays; **converge on that**: add `LOC_EMIG_QTR_FEATURE_*` / `LOC_EMIG_QTR_GENERIC_*` keys and a parallel `_KEYS` array here, and confirm `emigration-diaspora.js` (`chronicleEstablished`) consumes the localized version. Reuse the narrative.js keys if the phrase text is identical.

---

## L1 — Lens tooltips — ✅ DONE (already tracked in docs/emigration-roadmap-and-backlog.md)

**Completed.** Both tooltip files now route every visible string through `loc()` and the keys are
defined in ModText:
- **[ui/emigration-prosperity-tooltip.js](../ui/emigration-prosperity-tooltip.js)** — tier labels
  `LOC_EMIG_PROS_TIER_*` (L47–51), pressure rows `LOC_EMIG_PRESSURE_*` (L63–68); the signed percent is
  `loc("LOC_EMIG_PCT_SIGNED", "{1_Pct}%", …)` (L99), not a bare `Math.round(t*100)+"%"`.
- **[ui/emigration-ethnicity-tooltip.js](../ui/emigration-ethnicity-tooltip.js)** — `LOC_EMIG_ETH_MORE`
  (L37), `LOC_EMIG_ETH_UNKNOWN` (L43/56/89), `LOC_EMIG_ETH_TITLE` / `_TILE_SUFFIX` (L106/108), and the
  per-row percent via `loc("LOC_EMIG_PCT", "{1_Pct}%", …)` (L109).

**One residual leak (optional cleanup, not blocking):** the panel *title fallback* passed to
`cityTitle(city, fallback)` ([emigration-lens-hover-panel.js:295](../ui/emigration-lens-hover-panel.js#L295))
is still raw English — `"Prosperity"` (prosperity-tooltip L103) and `"Ethnic Composition"`
(ethnicity-tooltip L106). `cityTitle` returns the resolved settlement name when it can, so this string
only surfaces when the name can't resolve. If localizing it, wrap the fallback in `loc()` before the
call. (The keys chosen were `LOC_EMIG_PROS_TIER_*` / `LOC_EMIG_PRESSURE_*` / `LOC_EMIG_ETH_*`, **not** the
`LOC_EMIG_LENS_*` namespace this plan originally proposed — match the shipped keys.) L1 is marked
resolved in [emigration-roadmap-and-backlog.md](emigration-roadmap-and-backlog.md).

---

## Deliberate non-changes (log, don't fix)

- **[ui/emigration-demo-data.js](../ui/emigration-demo-data.js)** — sample event names ("Nile flood", "Roman–Greek War") and `" BC"`/`" AD"` suffixes (L175–204). Visible only in the opt-in **Sample** data-preview mode. Log to
  [wont-fix-with-justifications.md](wont-fix-with-justifications.md) with verdict + reasoning (developer/preview-only fixture data, not live gameplay).

---

## Follow-up — re-translate the strings revised by the text/language polish pass

Carried over from `docs/text-polish-plan.md` (Tiers 0–3 executed **en_us-only**, 2026-07-19). Those tiers
revised many **existing** en_us strings — grammar fixes, terminology unification ("Enclave"/"Integration"/
"Stance"), British-spelling normalization, and readability trims. This is a **re-translation** task, not a
missing-key one:

- **Nothing to add, nothing failing.** The parity gate (`tests/i18n.mjs`) stays green — the keys still
  exist in all 11 locales. But each revised key's 11 `<Replace>` rows now translate the *old* English and
  are semantically **stale**.
- **The "pipeline vs. accept-drift" question is already resolved here.** Per *Localization machinery* above,
  the i18n pipeline is **off the table** (it regenerates from stale `i18n/*.json` and clobbers
  hand-authored translations). So the resolution is a **hand re-translation pass** of the affected
  `<Replace>` rows in `text/**/ModText.xml`, reusing each locale's established vocabulary — *not* a pipeline
  run. This retires the open decision `text-polish-plan.md` used to carry.
- **Which keys:** every en_us `<Row>` whose text changed in Tiers 0–3 — the ✅ items in
  `text-polish-plan.md` cite the exact tags/lines. Fastest precise set: `git diff` `text/en_us/ModText.xml`
  against the last pre-polish commit.
- **Batch it** with the new-key work above so translators touch each locale file once.

**Addendum (2026-07-19) — three mechanics fixes also revised en_us copy.** The lower-confidence
border/enclave/crisis fixes changed the *meaning* of some strings (not just their wording), so these
stale-translation rows carry a mechanics change, not only a polish edit — re-translate with the same
hand pass:
- **Closed-Borders / Anti-Immigration** now notes refugees settle more slowly: `LOC_EMIG_T_CLOSEDOPEN_D`
  and `LOC_EMIG_POLICY_CLOSED_BORDERS_DESC` + `_EX` / `_MO`.
- **Contested enclave** now *reduces the enclave's yield* (new `contestedQuarterYieldFactor`), so the
  "happiness strain only" framing is gone: `LOC_EMIGRATION_PANEL_QUARTER_CONTESTED`, `LOC_EMIG_T_QUARTERS_D`,
  `LOC_EMIG_GUIDE_12_F4_A`. (README + `ui/emigration-guide.js` FAQ fallback updated in en_us only, as usual.)

---

## Hardening — catch this class of drift in CI

There is currently **no test that a `loc()`/`tr()` key referenced in `ui/*.js` exists in ModText**
(only data-XML keys are checked, `validate-package.mjs:140`). Add a lightweight guard
(e.g. `tests/i18n-ui-keys.mjs`, wired into `npm run verify`): scan `ui/**/*.js` for
`LOC_[A-Z0-9_]+` literals passed to `loc`/`tr`/`pick`/spec fields, assert each exists in
`text/en_us/ModText.xml`. Accept a small allowlist for dynamically-built keys
(`"LOC_EMIG_PRESET_" + n.toUpperCase()` etc.). This protects the ~150 new keys from spelling drift.

---

## Execution order

1. **Draft en_us keys** for all tiers (real English), grouped by file, following naming conventions.
2. **Wire the JS** — swap literals for `loc()`/keys per file; verify the Tier-2 id↔key match and the
   `registerMetricGroup`/view-label rendering path (read the host code once to confirm verbatim vs key).
3. **Translate** — add all 11 `<Replace>` rows per key, reusing each locale's established vocabulary.
4. **Reconcile** dead `LOC_DEMOGRAPHICS_METRIC_*` keys.
5. **Log** demo-data wont-fix; mark L1 done in open-items.
6. **Add** the UI-key CI guard.
7. **Version bump to `2.1.0` + CHANGELOG** entry under `## [2.1.0]` (minor bump; mirror demographics'
   "full interface localization" note). Also sync the `emigration.modinfo` version if it tracks releases
   (currently shows a stale `1.0`).

## Verification

- `npm run test:i18n` — all 11 locales have every new key (parity gate).
- `npm run test:validate-package` — XML well-formed, namespace invariant holds, locales declared in modinfo.
- New `tests/i18n-ui-keys.mjs` — every JS-referenced `LOC_` key is defined.
- `npm run verify` — full suite green.
- **In-game smoke (per the Mac no-CLI / drag-drop workflow):** deploy, set game language to a
  non-English locale (e.g. de_DE), and confirm: Settings→Mods Emigration options render translated;
  Advanced editor search/reset chrome translated; Demographics Emigration charts show translated
  metric names/titles/subtitles/units; trigger a war + disaster and read the world-news/notification
  lines and a Migration Chronicle entry for any remaining English leak. Restart fully between deploys
  (Gameface module cache), enable then save+reload (game-scope attaches at load).
- Confirm `git status` shows edits confined to `text/**/ModText.xml`, the listed `ui/**` files, the
  new test, CHANGELOG, modinfo/version, and the two docs — and that **no `i18n/*.json` changed**.
