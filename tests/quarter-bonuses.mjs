// quarter-bonuses.mjs
//
// The per-civilisation Cultural Quarter registry (emigration-quarter-bonuses.js). Pure data: validates
// that every civ row is well-formed (a demonym + two identity options, each a valid benefit/penalty
// yield pair with a "why"), that lookup falls back cleanly for unknown/DLC civs, and that the roster is
// broad (the point of the feature is per-origin uniqueness).

import assert from "node:assert/strict";
import fs from "node:fs";

const { QUARTER_BONUSES, NEUTRAL_QUARTER, quarterBonus, QUARTER_QUOTES, quarterQuote, quarterQuoteKey, quoteDisplay, renderableLine } =
  await import("/emigration/ui/emigration-quarter-bonuses.js");

const YIELDS = new Set([
  "YIELD_CULTURE", "YIELD_GOLD", "YIELD_PRODUCTION",
  "YIELD_SCIENCE", "YIELD_FAITH", "YIELD_FOOD", "YIELD_HAPPINESS"
]);

/** Assert one entry ({demonym, options:[a,b]}) is well-formed. */
function checkEntry(key, entry) {
  assert.ok(entry && typeof entry === "object", key + " is an object");
  assert.ok(typeof entry.demonym === "string", key + " has a demonym string");
  assert.ok(Array.isArray(entry.options) && entry.options.length === 2, key + " offers exactly two options");
  assert.deepEqual(entry.options.map((o) => o.id), ["a", "b"], key + " options are ids a, b");
  for (const o of entry.options) {
    assert.ok(YIELDS.has(o.benefit), key + "/" + o.id + " benefit is a known yield (" + o.benefit + ")");
    assert.ok(YIELDS.has(o.penalty), key + "/" + o.id + " penalty is a known yield (" + o.penalty + ")");
    assert.notEqual(o.benefit, o.penalty, key + "/" + o.id + " benefit and penalty differ");
    assert.ok(typeof o.why === "string" && o.why.length > 8, key + "/" + o.id + " has a real 'why' line");
  }
  // The two options should be a genuine choice, not duplicates.
  assert.notEqual(entry.options[0].benefit + "|" + entry.options[0].penalty,
    entry.options[1].benefit + "|" + entry.options[1].penalty, key + " options A and B differ");
}

// ── every registry row is well-formed ───────────────────────────────────────
{
  const keys = Object.keys(QUARTER_BONUSES);
  assert.ok(keys.length >= 40, "the registry covers a broad roster (>=40 civs), got " + keys.length);
  for (const key of keys) {
    assert.ok(/^CIVILIZATION_[A-Z_]+$/.test(key), key + " is a CivilizationType key");
    checkEntry(key, QUARTER_BONUSES[key]);
  }
}

// ── neutral fallback is itself well-formed ──────────────────────────────────
{
  assert.ok(Array.isArray(NEUTRAL_QUARTER.options) && NEUTRAL_QUARTER.options.length === 2,
    "the neutral fallback offers two options");
  for (const o of NEUTRAL_QUARTER.options) {
    assert.ok(YIELDS.has(o.benefit) && YIELDS.has(o.penalty), "neutral options use known yields");
  }
}

// ── quarterBonus: known, unknown, and null resolution ───────────────────────
{
  assert.equal(quarterBonus("CIVILIZATION_ROME"), QUARTER_BONUSES.CIVILIZATION_ROME, "resolves a known civ");
  assert.equal(quarterBonus("CIVILIZATION_NOT_REAL"), NEUTRAL_QUARTER, "unknown civ → neutral fallback");
  assert.equal(quarterBonus(null), NEUTRAL_QUARTER, "null civ → neutral fallback");
  assert.equal(quarterBonus(undefined), NEUTRAL_QUARTER, "undefined civ → neutral fallback");
}

// ── spot-check a few identity mappings from plan §7 ─────────────────────────
{
  assert.equal(QUARTER_BONUSES.CIVILIZATION_CARTHAGE.demonym, "Punic", "Carthage names a Punic Quarter");
  assert.equal(QUARTER_BONUSES.CIVILIZATION_GREECE.options[0].benefit, "YIELD_SCIENCE", "Greek agora grants Science");
  assert.equal(QUARTER_BONUSES.CIVILIZATION_SPAIN.options[1].benefit, "YIELD_FAITH", "Spanish missions grant Faith");
}

// ── flavour quotes: every option carries a real, attributed quote (plan §8) ──
{
  const bonusKeys = Object.keys(QUARTER_BONUSES).sort();
  const quoteKeys = Object.keys(QUARTER_QUOTES).sort();
  // Exact parity: every quoted civ has a bonus row and vice versa — no orphan quotes, none missing.
  assert.deepEqual(quoteKeys, bonusKeys, "QUARTER_QUOTES covers exactly the QUARTER_BONUSES roster");

  for (const civ of quoteKeys) {
    const row = QUARTER_QUOTES[civ];
    assert.deepEqual(Object.keys(row).sort(), ["a", "b"], civ + " quotes both options a and b");
    for (const id of ["a", "b"]) {
      const q = row[id];
      assert.ok(q && typeof q.text === "string" && q.text.length > 10, civ + "/" + id + " has a real quote text");
      assert.ok(typeof q.who === "string" && q.who.length > 0, civ + "/" + id + " names a speaker");
      // Every quote must carry a concrete source work, except a bare proverb whose "who" self-attributes.
      const isProverb = /proverb$/i.test(q.who);
      assert.ok(isProverb || (typeof q.source === "string" && q.source.length > 0),
        civ + "/" + id + " names a source work (or is a self-attributed proverb)");
      // No genocidaires / hate figures (curation rule).
      assert.doesNotMatch(q.who + " " + q.source, /\b(Hitler|Stalin)\b/i, civ + "/" + id + " uses no hate figure");
      // A quote must be attributed, not left as an unfilled placeholder.
      assert.doesNotMatch(q.text + " " + q.source, /\bplaceholder\b|historian'?s summary/i,
        civ + "/" + id + " is not an unfilled placeholder");
    }
  }
}

// ── quote accessors: key format, display composition, and null fallbacks ─────
{
  assert.equal(quarterQuoteKey("CIVILIZATION_ROME", "a"), "LOC_EMIG_QTR_Q_ROME_A", "quote key strips the CIVILIZATION_ prefix + uppercases the id");
  assert.equal(quarterQuoteKey("CIVILIZATION_DAI_VIET", "b"), "LOC_EMIG_QTR_Q_DAI_VIET_B", "quote key keeps interior underscores");
  for (const civ of Object.keys(QUARTER_QUOTES)) {
    for (const id of ["a", "b"]) {
      assert.match(quarterQuoteKey(civ, id), /^LOC_[A-Z0-9_]+$/, civ + "/" + id + " quote key is a valid LOC tag");
    }
  }
  assert.equal(quarterQuote("CIVILIZATION_ROME", "a"), QUARTER_QUOTES.CIVILIZATION_ROME.a, "resolves a known quote");
  assert.equal(quarterQuote("CIVILIZATION_NOT_REAL", "a"), null, "unknown civ → no quote");
  assert.equal(quarterQuote("CIVILIZATION_ROME", "ignore"), null, "the passive stance carries no quote");
  assert.equal(quarterQuote(null, "a"), null, "null civ → no quote");

  const disp = quoteDisplay(QUARTER_QUOTES.CIVILIZATION_ROME.a);
  assert.ok(disp.startsWith('"') && disp.includes(" — Frontinus"), "display wraps the text in quotes and em-dashes the speaker");
  // A parenthetical source joins with a space (no stray comma); a normal source with a comma.
  assert.ok(quoteDisplay(QUARTER_QUOTES.CIVILIZATION_SHAWNEE.a).includes("Tecumseh (1810)"), "parenthetical source joins with a space");
  assert.ok(quoteDisplay(QUARTER_QUOTES.CIVILIZATION_ROME.b).includes("Aelius Aristides, Roman Oration"), "worded source joins with a comma");
  assert.equal(quoteDisplay(null), "", "no quote → empty display");
}

// ── data ↔ LOC parity: every quote has an en_us ModText row under its key ────
{
  const enXml = fs.readFileSync("text/en_us/ModText.xml", "utf8");
  const have = new Set([...enXml.matchAll(/Tag="(LOC_EMIG_QTR_Q_[A-Z0-9_]+)"/g)].map((m) => m[1]));
  for (const civ of Object.keys(QUARTER_QUOTES)) {
    for (const id of ["a", "b"]) {
      const key = quarterQuoteKey(civ, id);
      assert.ok(have.has(key), key + " has an en_us ModText row (re-run i18n_extract + i18n_apply after editing quotes)");
    }
  }
  assert.equal(have.size, Object.keys(QUARTER_QUOTES).length * 2, "no orphan LOC_EMIG_QTR_Q_ rows in en_us");
}

// ── renderableLine: the enclave pop-up must never show a script the dialog font can't draw ───
// In-game the quote comes back WHOLE from Locale.compose (the raw-script LOC row), skipping quoteDisplay's
// own guard, so renderableLine is the last line of defence. Every shipped quote row, once passed through
// it, must be free of unrenderable script — this is what was showing as tofu boxes / scrambled RTL.
{
  const UNRENDERABLE = /[Ͱ-ϿЀ-ӿ֐-׿؀-ۿሀ-፿぀-ヿ一-鿿가-힯]/;
  const enXml = fs.readFileSync("text/en_us/ModText.xml", "utf8");
  const rows = [...enXml.matchAll(/Tag="(LOC_EMIG_QTR_Q_[A-Z0-9_]+)"\s*>\s*<Text>([\s\S]*?)<\/Text>/g)];
  assert.ok(rows.length > 0, "found quote rows to check");
  for (const [, tag, raw] of rows) {
    const text = raw.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
    const out = renderableLine(text);
    assert.ok(!UNRENDERABLE.test(out), tag + " still carries unrenderable script after renderableLine: " + out);
    assert.ok(out.startsWith('"'), tag + " keeps its opening quote after renderableLine: " + out);
  }
  // A run of unrenderable script paired with a "(translation)" collapses to just the translation…
  assert.equal(
    renderableLine('"農，天下之大本也 (Agriculture is the foundation.)" — Emperor Wen'),
    '"Agriculture is the foundation." — Emperor Wen',
    "collapses <original> (translation) to the translation");
  // …while an all-Latin line (incl. diacritics) is returned untouched.
  const latin = '"A project fit only for a nation of shopkeepers." — Adam Smith, The Wealth of Nations (1776)';
  assert.equal(renderableLine(latin), latin, "all-Latin line passes through unchanged");
  assert.equal(renderableLine(""), "", "empty line stays empty");
}

console.log("quarter-bonuses harness passed");
