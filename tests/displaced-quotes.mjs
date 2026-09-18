// displaced-quotes.mjs
//
// The refugee and migrant epigraphs: the key scheme, the pick (own list, else pool, stable per seed), the
// unmet-civilization guard, and the registry's integrity against its LOC rows in every locale.
import assert from "node:assert/strict";
import fs from "node:fs";

const mod = await import("/emigration/ui/emigration-displaced-quotes.js");
const { DISPLACED_QUOTES, DISPLACED_POOLS, displacedQuoteKey, pickDisplacedQuote, displacedQuoteFor } = mod;
const { quoteRowText, renderableLine } = await import("/emigration/ui/emigration-quarter-bonuses.js");

// ── keys ─────────────────────────────────────────────────────────────────────────────────────────
assert.equal(displacedQuoteKey("CIVILIZATION_ROME", "refugee", 0), "LOC_EMIG_DQ_ROME_REFUGEE_1");
assert.equal(displacedQuoteKey("CIVILIZATION_DAI_VIET", "migrant", 1), "LOC_EMIG_DQ_DAI_VIET_MIGRANT_2");
assert.equal(displacedQuoteKey(null, "migrant", 2), "LOC_EMIG_DQ_POOL_MIGRANT_3");

// ── pick: own list first, pool for a missing kind or civ, null when nothing fits ─────────────────
{
  const qa = { text: "A", who: "a", source: "" };
  const qb = { text: "B", who: "b", source: "" };
  const qp = { text: "P", who: "p", source: "" };
  const reg = { CIVILIZATION_X: { refugee: [qa, qb] } };
  const pools = { refugee: [qp], migrant: [qp] };
  const own = pickDisplacedQuote("CIVILIZATION_X", "refugee", "s1", reg, pools);
  assert.ok(own && [qa, qb].includes(own.quote), "a civilization with its own list quotes from it");
  assert.match(own.key, /^LOC_EMIG_DQ_X_REFUGEE_[12]$/);
  assert.deepEqual(pickDisplacedQuote("CIVILIZATION_X", "migrant", "s1", reg, pools), { key: "LOC_EMIG_DQ_POOL_MIGRANT_1", quote: qp },
    "a missing kind falls back to the pool");
  assert.deepEqual(pickDisplacedQuote(null, "refugee", "s1", reg, pools), { key: "LOC_EMIG_DQ_POOL_REFUGEE_1", quote: qp },
    "no civilization (unknown or unmet) uses the pool");
  assert.equal(pickDisplacedQuote("CIVILIZATION_X", "conquest", "s1", reg, pools), null, "unknown kind shows nothing");
  assert.equal(pickDisplacedQuote(null, "refugee", "s1", reg, { refugee: [], migrant: [] }), null, "empty pool shows nothing");
  assert.deepEqual(pickDisplacedQuote("CIVILIZATION_X", "refugee", "same", reg, pools),
    pickDisplacedQuote("CIVILIZATION_X", "refugee", "same", reg, pools), "one seed always gives one quote");
  const seen = new Set();
  for (let i = 0; i < 40; i++) seen.add(pickDisplacedQuote("CIVILIZATION_X", "refugee", "seed" + i, reg, pools).quote.text);
  assert.equal(seen.size, 2, "different events spread across the list");
}

// ── the homecoming kind: a civilization's own row, else the pool, never empty ───────────────────
{
  assert.ok(DISPLACED_POOLS.return.length >= 5, "the return pool has a spread of voices");
  const own = pickDisplacedQuote("CIVILIZATION_GREECE", "return", "s");
  assert.ok(own && own.key.startsWith("LOC_EMIG_DQ_GREECE_RETURN_"), "Greece has its own homecoming lines");
  const pool = pickDisplacedQuote("CIVILIZATION_TONGA", "return", "s");
  assert.ok(pool && pool.key.startsWith("LOC_EMIG_DQ_POOL_RETURN_"), "a civilization without a row uses the pool");
  assert.ok(pickDisplacedQuote(null, "return", "s"), "an unknown origin still gets a pool line");
  const greece = DISPLACED_QUOTES.CIVILIZATION_GREECE;
  assert.ok(greece.refugee && greece.migrant && greece.return, "merging the return list keeps the other kinds");
}

// ── unmet or unknown origins never name a civilization ───────────────────────────────────────────
{
  globalThis.Players = { get: () => ({ civilizationType: 7 }) };
  globalThis.GameInfo = { Civilizations: { lookup: () => ({ CivilizationType: Object.keys(DISPLACED_QUOTES)[0] || "CIVILIZATION_ROME" }) } };
  const line = displacedQuoteFor(-1, "refugee", "x");
  const poolLine = pickDisplacedQuote(null, "refugee", "x");
  assert.equal(line === "", !poolLine, "an invalid player id quotes from the pool or shows nothing");
  delete globalThis.Players;
  delete globalThis.GameInfo;
}

// ── registry integrity: shape, length, LOC rows in en_us and every locale ────────────────────────
{
  const en = fs.readFileSync("text/en_us/ModText.xml", "utf8");
  const FOLDERS = ["de_de", "es_es", "fr_fr", "it_it", "ja_jp", "ko_kr", "pl_pl", "pt_br", "ru_ru", "zh_hans_cn", "zh_hant_hk"];
  const locales = FOLDERS.map((f) => [f, fs.readFileSync(`text/${f}/ModText.xml`, "utf8")]);
  const unescape = (t) => t.replace(/&quot;/g, "\"").replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  /** @type {[string|null, string, *[]][]} */
  const lists = [];
  for (const [civ, row] of Object.entries(DISPLACED_QUOTES)) {
    assert.match(civ, /^CIVILIZATION_[A-Z_]+$/, civ + " is a CivilizationType");
    for (const kind of Object.keys(row)) {
      assert.ok(kind === "refugee" || kind === "migrant" || kind === "return", civ + " has only refugee/migrant/return lists");
      lists.push([civ, kind, row[kind]]);
    }
  }
  lists.push([null, "refugee", DISPLACED_POOLS.refugee], [null, "migrant", DISPLACED_POOLS.migrant],
    [null, "return", DISPLACED_POOLS.return]);
  let rows = 0;
  for (const [civ, kind, list] of lists) {
    list.forEach((q, i) => {
      const key = displacedQuoteKey(civ, kind, i);
      assert.ok(q.text && q.who, key + " has text and a speaker");
      const all = q.text + q.who + q.source;
      assert.ok(!/re-verify|paraphrase/i.test(all) && !/\bTODO\b/.test(all), key + " carries no draft marker");
      const english = (q.text.match(/\(([^()]*)\)\s*$/) || [null, q.text])[1];
      assert.ok(english.length <= 240, key + " English stays short (" + english.length + ")");
      const m = en.match(new RegExp(`<Row Tag="${key}">\\s*<Text>([^<]*)</Text>`));
      assert.ok(m, key + " has an en_us row");
      assert.equal(unescape(m[1]), quoteRowText(q), key + " en_us row matches the registry");
      for (const [f, xml] of locales) assert.ok(xml.includes(`Tag="${key}"`), key + " exists in " + f);
      // What the player sees: a non-Latin original is reduced to its translation, which must survive whole.
      const shown = renderableLine(quoteRowText(q));
      assert.ok(shown.includes(english.trim()), key + " shows its full English in game: " + shown);
      assert.ok(!/[\u0370-\u03ff\u0400-\u04ff\u0590-\u06ff\u0b80-\u0bff\u3040-\u30ff\u4e00-\u9fff\uac00-\ud7af]/.test(shown),
        key + " shows no script the game font cannot draw: " + shown);
      rows++;
    });
  }
  console.log("displaced-quotes: ok (" + rows + " quotes)");
}
