// chronicle.mjs
//
// The Migration Chronicle's pure pieces: the prose engine (emigration-narrative.js), the persistent
// store + dedupe (emigration-chronicle.js), and the pass detection helpers (emigration-diaspora.js).
// No engine stubs; the store degrades to an in-memory cache without GameConfiguration.
//
// Includes a STYLE guard: the generated prose must avoid em dashes and the usual machine-written
// tells, matching the mod's house style.

import assert from "node:assert/strict";
import { exodusLine, foundingLine, returnLine, chronicleTitle } from "/emigration/ui/emigration-narrative.js";
import { chronicle, chronicled, chronicleLog, clearChronicle } from "/emigration/ui/emigration-chronicle.js";
import { __test as dia } from "/emigration/ui/emigration-diaspora.js";

// ── Prose: deterministic, non-empty, and grammatical fills ───────────────────
{
  const e = { cause: "war", civ: "Roman", city: "Mediolanum", people: "84,000", event: "the Roman-Gallic War", seed: "Mediolanum|war|120" };
  const a = exodusLine(e);
  const b = exodusLine(e);
  assert.equal(a, b, "same event → same line (deterministic)");
  assert.ok(a.length > 20 && /\.$/.test(a), "an exodus line is a real sentence");
  assert.ok(a.includes("84,000"), "the exact count appears in the prose");

  // Different seeds spread across the phrasings (not all identical).
  const variants = new Set();
  for (let i = 0; i < 50; i++) {
    variants.add(exodusLine({ ...e, seed: "city" + i + "|war|" + i }));
  }
  assert.ok(variants.size >= 3, "exodus phrasing varies across events");
}

// Founding + return + titles compose cleanly.
{
  const f = foundingLine({ origin: "Carthaginian", host: "Roman", city: "Ostia", pct: 31, seed: "Ostia|3|2" });
  assert.ok(f.includes("Carthaginian") && f.includes("Ostia") && f.includes("31 percent"), "founding names origin, city, share");
  const r = returnLine({ origin: "Greek", city: "Carthage", people: "12,000", reason: "at peace again", seed: "Carthage|g|1" });
  assert.ok(r.includes("Greek") && r.includes("12,000"), "return names origin + count");
  assert.ok(chronicleTitle({ kind: "founding", civ: "Greek", city: "Carthage", seed: "s" }).includes("Carthage"), "founding title names the city");
}

// ── STYLE guard: no em dashes, no machine-written tells ──────────────────────
{
  const causes = ["war", "disaster", "unhappiness", "conquest"];
  const samples = [];
  for (let i = 0; i < 40; i++) {
    const c = causes[i % causes.length];
    samples.push(exodusLine({ cause: c, civ: "Aksumite", city: "Adulis" + i, people: "20,000", event: "the war", seed: "s" + i + c }));
    samples.push(foundingLine({ origin: "Norman", host: "Frankish", city: "Rouen" + i, pct: 15 + i, seed: "f" + i }));
    samples.push(returnLine({ origin: "Songhai", city: "Gao" + i, people: "9,000", reason: "prosperous", seed: "r" + i }));
  }
  const text = samples.join("\n");
  assert.ok(!text.includes("-"), "no em dashes in chronicle prose");
  const tells = ["tapestry", "testament", "vibrant", "rich history", "boasts", "nestled", "not only", "bustling", "delve"];
  for (const t of tells) {
    assert.ok(!new RegExp(t, "i").test(text), `prose avoids the AI tell "${t}"`);
  }
}

// ── Store: append, newest-first, and dedupe ─────────────────────────────────
{
  clearChronicle();
  assert.equal(chronicleLog().length, 0, "starts empty");
  assert.ok(chronicle({ kind: "exodus", title: "A", body: "First.", dedupeKey: "k1" }), "first entry added");
  assert.ok(chronicle({ kind: "founding", title: "B", body: "Second.", dedupeKey: "k2" }), "second entry added");
  assert.equal(chronicle({ kind: "exodus", title: "A", body: "Dup.", dedupeKey: "k1" }), false, "dedupeKey blocks a repeat");
  assert.ok(chronicled("k1") && !chronicled("k3"), "chronicled() reflects what was written");
  const log = chronicleLog();
  assert.equal(log.length, 2, "only two distinct entries");
  assert.equal(log[0].body, "Second.", "newest-first");
  assert.equal(chronicle({ body: "" }), false, "empty body rejected");
  clearChronicle();
}

// ── Diaspora detection helpers ──────────────────────────────────────────────
{
  const migs = [
    { cause: "war", srcOwner: 1, srcName: "Tyre", people: 50000, eventKey: "war:1:2" },
    { cause: "war", srcOwner: 1, srcName: "Tyre", people: 30000 },
    { cause: "prosperity", srcOwner: 1, srcName: "Tyre", people: 99999 }, // excluded (economic)
    { cause: "disaster", srcOwner: 3, srcName: "Pompeii", people: 12000 }
  ];
  const waves = dia.wavesByCityCause(migs);
  assert.equal(waves.get("Tyre|war").people, 80000, "war wave sums per settlement+cause");
  assert.equal(waves.get("Tyre|war").eventKey, "war:1:2", "wave keeps the event behind it");
  assert.ok(!waves.has("Tyre|prosperity"), "economic drift is not an exodus");

  const comp = { owner: 5, civs: [{ civ: 5, share: 0.7 }, { civ: 9, share: 0.25 }, { civ: 4, share: 0.05 }] };
  const lead = dia.leadForeignOrigin(comp);
  assert.equal(lead.civ, 9, "lead foreign origin is the largest non-owner origin");
  assert.equal(dia.leadForeignOrigin({ owner: 5, civs: [{ civ: 5, share: 1 }] }), null, "single-origin city → no foreign lead");
}

console.log("chronicle harness passed");
