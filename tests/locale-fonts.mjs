import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Locale font lists. TitleFont and BodyFont have no Hangul, kana or Han glyphs, and canvases and world
// labels draw with the first face only, so for Chinese, Japanese and Korean the locale's CJK face must
// lead (watched 2026-10-01: Korean Emigration tab titles, city names and chips were missing-glyph
// boxes). The order mirrors the game's global-scaling.js getOrderedFontFamily.

const saved = globalThis.Locale;
let locale = "en_US";
globalThis.Locale = { getCurrentDisplayLocale: () => locale, compose: (k) => k };
const { localeFonts, localeFontFamily } = await import("/emigration/ui/emigration-loc.js");

const expectFirst = {
  en_US: "BodyFont", de_DE: "BodyFont", es_ES: "BodyFont", fr_FR: "BodyFont", it_IT: "BodyFont",
  pl_PL: "BodyFont", pt_BR: "BodyFont", ru_RU: "BodyFont",
  zh_Hans_CN: "BodyFont-SC", zh_Hant_HK: "BodyFont-TC", ja_JP: "BodyFont-JP", ko_KR: "BodyFont-KR"
};
try {
  for (const [loc, first] of Object.entries(expectFirst)) {
    locale = loc;
    assert.equal(localeFonts("body")[0], first, `${loc}: body faces lead with ${first}`);
    assert.equal(localeFonts("title")[0], first.replace("BodyFont", "TitleFont"), `${loc}: title faces`);
    assert.equal(new Set(localeFonts("title")).size, 5, `${loc}: every face once`);
    assert.ok(localeFontFamily("title").endsWith(", sans-serif"));
  }
  globalThis.Locale = undefined;
  assert.equal(localeFonts("body")[0], "BodyFont", "no Locale: Latin order");
  // No script or stylesheet names a game face directly (dev-only self-test styles aside): every font
  // list comes from localeFonts()/localeFontFamily(), so new UI cannot reintroduce a Latin-only list.
  const listFiles = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? listFiles(p) : /\.(js|css|html)$/.test(d.name) ? [p] : [];
  });
  const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1").replace(/<!--[\s\S]*?-->/g, "");
  const named = listFiles("ui")
    .filter((f) => !/emigration-loc\.js$|emigration-selftest/.test(f))
    .filter((f) => /\b(BodyFont|TitleFont|TitilliumWeb)\b/.test(strip(fs.readFileSync(f, "utf8"))));
  assert.deepEqual(named, [], "files naming a game font face instead of using localeFontFamily()");
  console.log("  ok   locale-fonts");
} finally {
  globalThis.Locale = saved;
}
