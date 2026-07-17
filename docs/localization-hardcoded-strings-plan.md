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

Decisions locked with the user:
- **Translations:** author real translations in all 11 locale files (not English placeholders).
- **Scope:** Tier 1 (options) + Tier 2 (Demographics charts) + Tier 3 (concatenated fragments) +
  the L1 lens tooltips already tracked in docs. **Skip** `emigration-demo-data.js` sample-preview
  text and log it as a deliberate wont-fix.

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

**[ui/emigration-tunables.js](../ui/emigration-tunables.js)** — `choiceLabels` arrays (L101, L115–117). Convert to `LOC_` keys resolved at render time. Confirm how `choiceLabels` reach the dropdown in `emigration-advanced-editor.js`: if the editor renders them verbatim, either store keys and `loc()` them at build time in the editor, or store `LOC_` strings if the dropdown widget auto-resolves. Keys: `LOC_EMIG_CHOICE_OFF/WEAK/STANDARD/STRONG`, `LOC_EMIG_CHOICE_OFF/IMPORTANT/VERBOSE`, `LOC_EMIG_CHOICE_ANY/MINOR/MODERATE/MAJOR`. (Numeric `"30%"` labels stay literal.)

**[ui/options/emigration-advanced-editor.js](../ui/options/emigration-advanced-editor.js)** — 3 UI-chrome strings via `loc()`:
- L263 placeholder "Search settings…" → `LOC_EMIG_ADV_SEARCH_PLACEHOLDER`
- L271 caption "Reset all to defaults" → `LOC_EMIG_ADV_RESET_ALL`
- L339 tooltip "Reset to default" → `LOC_EMIG_ADV_RESET_ONE`

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
2. **Reconcile dead keys:** existing `LOC_DEMOGRAPHICS_METRIC_EMIG_NET_MIGRATION` / `_IN` / `_OUT`
   (+ their `_SUBTITLE`s) do **not** match any `id` → the host never composes them. Grep the whole repo
   for each; if unreferenced, remove them (all 12 files) to avoid confusion; if referenced elsewhere,
   leave and note. `EMIG_REFUGEES*` correctly matches id `emig_refugees` — keep.
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

- **[ui/emigration-naming.js](../ui/emigration-naming.js)** (largest): war name `victim + "–" + aggressor + " War"` (L366) and `"the … War"` (L367) → `LOC_EMIG_WARNAME_TWO` `"{1_Victim}–{2_Aggressor} War"` / `LOC_EMIG_WARNAME_ONE`. `" Enclave"` (L152/154, `"foreign enclave"`) → `LOC_EMIG_QUARTER_ENCLAVE` `"{1_Demonym} Enclave"` / `LOC_EMIG_QUARTER_ENCLAVE_FOREIGN`. `" Crisis"` (L203) → `LOC_EMIG_EVENT_CRISIS_SUFFIX` template. Generic fallbacks (`UNMET_LABEL="an unmet civilization"` L17/288, `"a people"` L72, `"a disaster"` L171, and the `|| "people"/"a settlement"/"A nation"/"A disaster"/"war"` at L390–417) → `LOC_EMIG_FALLBACK_UNMET_CIV`, `_A_PEOPLE`, `_A_DISASTER`, `_PEOPLE`, `_A_SETTLEMENT`, `_A_NATION`, `_WAR`. (These are already `loc(key) || fallback` in places — where a key already exists, just ensure it's defined; where the literal is the only source, add a key.)
- **[ui/emigration-events.js:316](../ui/emigration-events.js)** — `name + " strikes " + place + "! "` → `LOC_EMIG_DISASTER_STRIKES_AT` `"{1_Name} strikes {2_Place}! "` and `LOC_EMIG_DISASTER_STRIKES` `"{1_Name} strikes! "`.
- **[ui/emigration-narrative.js:228](../ui/emigration-narrative.js)** — `Math.round(e.pct) + " percent"` feeding `{n_Pct}`. Prefer `Locale.toPercent`/existing percent helper; if a bare number is needed, add `LOC_EMIG_PERCENT` `"{1_N} percent"`. Check for an existing percent formatter in the mod first.
- **[ui/emigration-return.js:251](../ui/emigration-return.js)** — `reason: "at peace again"` → `LOC_EMIG_RETURN_REASON_PEACE`, composed before passing as `{4_Reason}`.
- **[ui/emigration-feedback.js:640](../ui/emigration-feedback.js)** — `UNMET_CIV_LABEL="an unmet civilization"` → reuse `LOC_EMIG_FALLBACK_UNMET_CIV` from naming.js.
- **[ui/emigration-causes.js:255](../ui/emigration-causes.js)** — `` `+${n} more` `` → `LOC_EMIG_CAUSES_MORE` `"+{1_N} more"`.
- **[ui/emigration-quarter-phrases.js](../ui/emigration-quarter-phrases.js)** — ~20 diaspora phrases (L16–33) with **no `_KEYS` sibling**. `emigration-narrative.js` already has localized parallel copies WITH `_KEYS` arrays; **converge on that**: add `LOC_EMIG_QTR_FEATURE_*` / `LOC_EMIG_QTR_GENERIC_*` keys and a parallel `_KEYS` array here, and confirm `emigration-diaspora.js` (`chronicleEstablished`) consumes the localized version. Reuse the narrative.js keys if the phrase text is identical.

---

## L1 — Lens tooltips (already tracked in docs/emigration-roadmap-and-backlog.md)

- **[ui/emigration-prosperity-tooltip.js](../ui/emigration-prosperity-tooltip.js)** (L44–50, 61–67) and **[ui/emigration-ethnicity-tooltip.js](../ui/emigration-ethnicity-tooltip.js)** (L36, 55, 88, 107): route hardcoded English through `loc()` with `LOC_EMIG_LENS_*` keys, and replace `Math.round(t*100)+"%"` with `Locale.toPercent` (mirror the graceful-fallback number helper the demographics mod / emigration already use). Mark L1 resolved in [emigration-roadmap-and-backlog.md](emigration-roadmap-and-backlog.md).

---

## Deliberate non-changes (log, don't fix)

- **[ui/emigration-demo-data.js](../ui/emigration-demo-data.js)** — sample event names ("Nile flood", "Roman–Greek War") and `" BC"`/`" AD"` suffixes (L175–204). Visible only in the opt-in **Sample** data-preview mode. Log to
  [wont-fix-with-justifications.md](wont-fix-with-justifications.md) with verdict + reasoning (developer/preview-only fixture data, not live gameplay).

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
7. **Version bump + CHANGELOG** entry (mirror demographics' "full interface localization" note).

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
