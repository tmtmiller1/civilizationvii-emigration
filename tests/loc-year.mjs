import assert from "node:assert/strict";

// Stored turn dates keep the engine's English text ("1060 CE", "2850 BCE"): other code parses them. The
// display goes through locYear, which re-composes the era through LOC_EMIG_YEAR_BCE / _CE and passes
// anything it does not recognize through untouched.

const saved = globalThis.Locale;
const DE = { LOC_EMIG_YEAR_BCE: "{1_Year} v. Chr.", LOC_EMIG_YEAR_CE: "{1_Year} n. Chr." };
let table = null;
globalThis.Locale = {
  compose: (k, ...a) => (table && table[k] ? table[k].replace("{1_Year}", String(a[0])) : k)
};
const { locYear } = await import("/emigration/ui/emigration-loc.js");

try {
  // No translation available: the English text comes back as stored.
  assert.equal(locYear("1060 CE"), "1060 CE");
  assert.equal(locYear("2850 BCE"), "2850 BCE");
  assert.equal(locYear("1,250 BCE"), "1,250 BCE", "grouped digits stay as written");

  table = DE;
  assert.equal(locYear("1060 CE"), "1060 n. Chr.");
  assert.equal(locYear("2850 BCE"), "2850 v. Chr.");
  assert.equal(locYear("  1060 CE "), "1060 n. Chr.", "edge whitespace tolerated");
  assert.equal(locYear("500 BC"), "500 v. Chr.", "BC reads as BCE");
  assert.equal(locYear("1200 AD"), "1200 n. Chr.", "AD reads as CE");
  assert.equal(locYear("1060CE"), "1060 n. Chr.", "no space before the era");

  // Anything else passes through.
  assert.equal(locYear("1060 n. Chr."), "1060 n. Chr.", "already-localized text is left alone");
  assert.equal(locYear("Turn 30"), "Turn 30");
  assert.equal(locYear("CE 1060"), "CE 1060");
  assert.equal(locYear(""), "");
  assert.equal(locYear(undefined), "");
  assert.equal(locYear(null), "");
  assert.equal(locYear(1060), "", "a non-string is not a stored year");

  globalThis.Locale = undefined;
  assert.equal(locYear("1060 CE"), "1060 CE", "off-engine: the English template");
  console.log("  ok   loc-year");
} finally {
  globalThis.Locale = saved;
}
