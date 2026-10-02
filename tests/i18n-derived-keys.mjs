import assert from "node:assert/strict";
import fs from "node:fs";

// Derived-key drift guard. i18n-ui-keys only sees whole LOC_ literals; keys built from a position or an
// id ("LOC_EMIG_GUIDE_" + i + "_R" + r + "_Q", "LOC_EMIG_QTR_WHY_" + civ + "_" + id, …) slip past it, and a
// missing one shows the English fallback in every language. This drives each family with every input
// it can take, records the keys handed to Locale.compose, and checks that every mod-owned one is defined
// in en_us. The Chronicle quote families (LOC_EMIG_DQ_*, LOC_EMIG_QTR_Q_*) have their own parity tests in
// displaced-quotes.mjs and quarter-bonuses.mjs.

const defined = new Set(
  [...fs.readFileSync("text/en_us/ModText.xml", "utf8").matchAll(/<Row\s+Tag="([^"]+)"/g)].map((m) => m[1])
);

/** @type {Map<string, string>} key → family that asked for it */
const seen = new Map();
let family = "";
const saved = globalThis.Locale;
globalThis.Locale = {
  compose: (k) => {
    if (typeof k === "string" && !seen.has(k)) seen.set(k, family);
    return k; // echo the key, so every helper takes its English fallback
  },
  getCurrentDisplayLocale: () => "en_US"
};

try {
  const { __test: guide } = await import("/emigration/ui/emigration-guide.js");
  const { quarterOptionsFor } = await import("/emigration/ui/emigration-quarter-registry.js");
  const { QUARTER_BONUSES } = await import("/emigration/ui/emigration-quarter-bonuses.js");
  const { factorLabel } = await import("/emigration/ui/emigration-explain.js");
  const causes = await import("/emigration/ui/emigration-causes.js");
  const naming = await import("/emigration/ui/emigration-naming.js");
  const narrative = await import("/emigration/ui/emigration-narrative.js");
  const phrases = await import("/emigration/ui/emigration-quarter-phrases.js");
  const reasons = await import("/emigration/ui/emigration-move-reasons.js");
  const { msgText } = await import("/emigration/ui/emigration-loc.js");

  // The Guide's section titles, matrix rows and FAQ pairs, keyed by position. The keys are rebuilt here
  // exactly as renderGuideSection builds them, from the same data.
  family = "guide";
  for (const g of guide.GUIDE) {
    Locale.compose("LOC_EMIG_GUIDE_" + g._i + "_TITLE");
    (g.rows || []).forEach((r, ri) => {
      Locale.compose("LOC_EMIG_GUIDE_" + g._i + "_R" + ri + "_Q");
      if (r.note) Locale.compose("LOC_EMIG_GUIDE_" + g._i + "_R" + ri + "_N");
    });
    (g.faq || []).forEach((_f, fi) => {
      Locale.compose("LOC_EMIG_GUIDE_" + g._i + "_F" + fi + "_Q");
      Locale.compose("LOC_EMIG_GUIDE_" + g._i + "_F" + fi + "_A");
    });
  }

  // Enclave stances: each civ's options (why / label / yield / act keys) and the neutral fallback.
  family = "quarter-registry";
  for (const civ of [...Object.keys(QUARTER_BONUSES), null]) quarterOptionsFor(civ);

  // Explain-view factor labels: every term in the source's FALLBACK table.
  family = "explain";
  const explainSrc = fs.readFileSync("ui/emigration-explain.js", "utf8");
  const fbBlock = explainSrc.slice(explainSrc.indexOf("const FALLBACK"), explainSrc.indexOf("};", explainSrc.indexOf("const FALLBACK")));
  for (const m of fbBlock.matchAll(/^\s+(\w+):\s*"/gm)) factorLabel(m[1]);

  // Cause labels, hints (with and without a settlement), permanence cues and the stance tip.
  family = "causes";
  const CAUSES = ["unhappiness", "prosperity", "war", "disaster", "conquest", "attrition", "return", "crisis",
    "chronicle", "other"];
  for (const c of CAUSES) {
    causes.causeLabel(c);
    causes.causeHint(c);
    causes.causeHint(c, "Rome");
    naming.permanenceCue(c);
    naming.lossHeadline(c, "3", "Rome");
    naming.localDigestMessage({ cause: c, people: "3", city: "Rome", destName: "Ostia", why: "nearby", crossCiv: true,
      destGold: 4, stanceTip: true });
    naming.localDigestMessage({ cause: c, people: "3", city: "Rome", byCiv: "Carthage" });
    naming.refugeeHeadline({ cause: c, people: "3", civ: "Roman" });
    naming.refugeeHeadline({ cause: c, people: "" });
  }
  naming.inboundDigestMessage({ people: "3", city: "Rome", fromCiv: "Carthaginian" });
  naming.pressureCueMessage("Rome", "Ostia");
  naming.eventDisplayName("famine");
  naming.eventDisplayName("crisis:AGE_CRISIS_PLAGUE");
  naming.eventDisplayName("crisis:");

  // Move reasons, singly and joined.
  family = "reasons";
  const tags = [...Object.values(reasons.REASON), ...Object.values(reasons.DEATH_REASON)];
  for (const t of tags) reasons.reasonLabel(t);
  reasons.pullReasonsPhrase(tags);

  // Chronicle prose: every fragment slot across enough seeds to land on each template and fragment.
  family = "narrative";
  for (let i = 0; i < 64; i++) {
    const seed = "seed" + i;
    for (const cause of ["war", "disaster", "prosperity"]) {
      msgText(narrative.exodusLineMsg({ cause, civ: "Roman", city: "Rome", people: "3", event: "the War", seed }));
    }
    narrative.exodusLine({ cause: "war", civ: "Roman", city: "Rome", people: "3", seed, framed: true });
    narrative.foundingLine({ origin: "Roman", host: "Greek", city: "Rome", pct: 20, seed });
    narrative.foundingLine({ origin: "Roman", host: "Greek", city: "Rome", pct: 20, seed, framed: true });
    narrative.returnLine({ origin: "Roman", city: "Rome", people: "3", reason: "at peace", seed });
    narrative.returnLine({ origin: "Roman", city: "Rome", people: "3", reason: "at peace", seed, framed: true });
    for (const kind of ["founding", "return", "exodus", "other"]) {
      narrative.chronicleTitle({ kind, civ: "Roman", city: "Rome", seed });
    }
    for (const kind of ["plague", "conquest"]) {
      narrative.dilemmaPrompt({ kind, seed, people: "3", origin: { adj: "Roman", framed: i % 2 === 0 },
        instigator: { adj: "Greek", framed: i % 2 === 1 } });
    }
    phrases.resolveQuarter([], seed);
    phrases.resolveQuarter(phrases.__test.FEATURE_ORDER, seed);
    for (const f of phrases.__test.FEATURE_ORDER) phrases.resolveQuarter([f], seed);
  }

  const missing = [...seen].filter(([k]) => k.includes("EMIG") && !defined.has(k));
  assert.deepEqual(missing, [], "derived keys missing from en_us: " + missing.map(([k, f]) => k + " (" + f + ")").join(", "));
  console.log(`  ok   i18n-derived-keys, ${[...seen.keys()].filter((k) => k.includes("EMIG")).length} derived mod keys all defined`);
} finally {
  globalThis.Locale = saved;
}
