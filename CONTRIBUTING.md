# Contributing

Emigration is a gameplay Civilization VII UI-VM mod: it moves population between
settlements based on a Prosperity model. This doc covers the setup, the one check
to run before you submit, and the conventions the code follows. It mirrors the
[Demographics](../demographics) mod's standards so both hold to the same bar.

## Typed JavaScript, no build step

The mod is typed JavaScript, not TypeScript. Civ VII loads `.js` files
directly into the Coherent GameFace engine at runtime. There is no transpile in
the mod pipeline, and what ships is exactly what you wrote (no minification,
no generated output). Types come from JSDoc annotations checked by
`tsc --noEmit` (`checkJs`), so the `/** @param … */` blocks are the type system.
Keep them on exported functions and anywhere a type isn't obvious. Don't
add `.ts` files or a build step.

## Setup

```sh
npm install
```

## Before you submit: `npm run verify`

```sh
npm run verify
```

This must pass with zero errors and zero warnings. It runs:

1. `tsc --noEmit`, JSDoc type checking (`checkJs`).
2. `eslint ui`, style and size limits.
3. the node test harness (`tests/*.mjs`).

## Style limits (enforced by ESLint)

- cyclomatic complexity ≤ 10
- max statements per function ≤ 18
- max nesting depth ≤ 4
- max parameters ≤ 5 (bundle extras into a single options/context object)
- max lines per function ≤ 50
- line length ≤ 100 (warning)

When a function trips a limit, prefer extracting a small, named helper or a
context object over disabling the rule.

## Conventions

- Defensive engine access. The GameFace API surface can be absent or throw.
  Guard with `typeof X !== "undefined"` or optional chaining and carry on
  without the feature; don't assume an engine global exists.
- Persistence. Per-game emigration state (pressure, cooldowns, the monotonic
  scaling turn) lives in the GameConfiguration KV store
  (`Configuration.editGame().setValue` / `getGame().getValue`). The display
  setting lives in the shared `localStorage` `modSettings` key. Only ever
  write the single `emigration` slice; never add a second top-level `localStorage`
  key, as other mods wipe `localStorage` when they see more than one.
- Localization. User-facing strings are LOC keys, translated into all 12
  locales under `text/<locale>/ModText.xml` (en_us is the base and fallback), including
  the Advanced tunable labels (`LOC_EMIG_T_*`). The non-English files are
  generated, not hand-edited: author English in `text/en_us/ModText.xml`, then run the
  three steps in this order:
  `node scripts/i18n_ingest.mjs` (locale XML → `i18n/<locale>.json`, so nothing hand-written is lost),
  `node scripts/i18n_extract.mjs` (en_us → `i18n/i18n-source.json`) and
  `node scripts/i18n_apply.mjs` (`i18n/<locale>.json` → `text/<locale>/ModText.xml`).
  Translations live in `i18n/<locale>.json` (key → string); a missing key falls
  back to English. If you do edit a locale file directly, run ingest before apply: apply cannot see
  those edits and would replace them with English. It refuses to run when that would happen
  (`npm run test:i18n-pipeline` guards the same thing). `npm run verify` includes a parity gate (`tests/i18n.mjs`) that
  fails if any en_us key is absent from a locale. Preserve `{1_…}` placeholders and code
  tokens (`UNIT_MIGRANT`, `Demographics`) verbatim.
- Debug logging. Modules gate verbose traces behind a module-level
  `const DBG` via the local `dlog` helper. `release.sh` flips `const DBG = true`
  to `false` in the shipped copy. Mod `console.log` does not reach `UI.log` from
  the UI VM, so `dlog` also emits through the CSS-parse channel when `DBG` is set.
- Comments. Explain *why* (engine quirks, workarounds), not *what*.

## Project layout

The main entry points; `ui/` holds one module per subsystem beyond these.

```
ui/
  emigration-main.js     entry UIScript (turn hook, reporting, dev dock controls)
  emigration-config.js   tunable settings (the Civ V model) + scaling constants
  emigration-cities.js   enumerate cities + read prosperity signals
  emigration-prosperity.js   the per-city Prosperity score
  emigration-engine.js   ranking, pressure, destination selection, the move, persistence
  emigration-population.js   pop read/write + Demographics-aligned scaling
  emigration-settings.js     the migration-count display preference (no Options-UI dep)
  emigration-options.js      registers the Options "Mods" tab dropdown
  options/mod-options.js     shared "Mods" category + cascade-safe modSettings store
devtools/
  migration-probe.js     dev-only API probe (separate modinfo; not shipped)
text/<locale>/ModText.xml    localized strings (12 locales)
```

## Releasing

`./release.sh` produces the upload zip. It mutes debug logging in the dist copy
and always ships readable JS; there is no minification path. The shipped

file layout matches the dev tree. The dev probe, docs, tests, and dev configs are
excluded by an allow-list audit.

## License

Changes go under the same terms as the mod: the Tower Mod License 1.0 in [LICENSE](LICENSE), with `ui/settings-keeper.js` under
MIT. By sending a change, you agree I can release it under those terms.
