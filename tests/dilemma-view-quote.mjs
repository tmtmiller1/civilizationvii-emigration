// dilemma-view-quote.mjs
//
// The enclave quote is drawn as its own framed block: splitQuote separates the quote from its attribution at
// the last `" — `, the display format every locale keeps (emigration-quarter-bonuses.quoteDisplay).
import assert from "node:assert/strict";

const { splitQuote, quoteRows } = await import("/emigration/ui/emigration-dilemma-view.js");

assert.deepEqual(
  splitQuote("\"El solitario mexicano ama las fiestas. (The solitary Mexican loves fiestas.)\" — Octavio Paz, The Labyrinth of Solitude (1950, trans.)"),
  { text: "\"El solitario mexicano ama las fiestas. (The solitary Mexican loves fiestas.)\"", who: "— Octavio Paz, The Labyrinth of Solitude (1950, trans.)" }
);
assert.deepEqual(splitQuote("\"A \\\"nested — dash\\\" line\" — Author"), { text: "\"A \\\"nested — dash\\\" line\"", who: "— Author" },
  "splits at the LAST quote-dash, so a dash inside the quote stays in the quote");
assert.deepEqual(splitQuote("No attribution here"), { text: "No attribution here", who: "" });
assert.deepEqual(splitQuote(""), { text: "", who: "" });
assert.deepEqual(splitQuote(null), { text: "", who: "" });
const paz = "\"El solitario mexicano ama las fiestas y las reuniones públicas. (The solitary Mexican loves fiestas and "
  + "public gatherings.)\" — Octavio Paz, The Labyrinth of Solitude (1950, trans.)";
const rows = quoteRows(paz);
assert.ok(rows.text.length >= 2, "a long quote wraps to more than one row");
assert.ok(rows.text.every((r) => r.length <= 64), "no quote row is wider than the body");
assert.equal(rows.text.join(" "), splitQuote(paz).text, "wrapping keeps every word in order");
assert.deepEqual(rows.who, ["— Octavio Paz, The Labyrinth of Solitude (1950, trans.)"]);
assert.deepEqual(quoteRows("\"Short.\" — A"), { text: ["\"Short.\""], who: ["— A"] });
assert.deepEqual(quoteRows(""), { text: [], who: [] });
console.log("dilemma-view-quote: ok");
