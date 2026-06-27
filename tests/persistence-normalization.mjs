import assert from "node:assert/strict";

// Regression guard for the chronicle + notification persistence hardening:
//   (1) malformed / old-schema entries are normalized or dropped on LOAD (never reach the view as a
//       wrong-typed value), and
//   (2) writes round-trip cleanly — the in-memory cache stays byte-identical to the persisted blob,
//       i.e. absent optional fields are OMITTED, not written as `undefined` (which JSON.stringify drops,
//       silently diverging the cache from disk until reload).
// We seed corrupt blobs BEFORE importing the modules so their lazy load() must cope.

const CHRON_KEY = "EmigrationChronicle_v1";
const NOTIF_KEY = "EmigrationNotif_v1";

const chronBlob = [
  { turn: 5, kind: "exodus", title: "Real", body: "A real line", civ: "Roman", people: 1000, cause: "war", dedupeKey: "k1" },
  { turn: 6, body: 123 }, // body not a string → drop
  { turn: 7 }, // no body → drop
  "nope", // not an object → drop
  { body: "kept", kind: 5, title: null, people: "x", civ: 9 } // body ok; bad fields coerced/omitted
];
const notifBlob = [
  { turn: 5, cause: "war", kind: "cause", summary: "Real", people: 10, points: 1, fromCity: "Rome" },
  "nope", // not an object → drop
  { summary: "kept", cause: 7, people: "x", event: 9 } // coerced/omitted
];

const KV = { [CHRON_KEY]: JSON.stringify(chronBlob), [NOTIF_KEY]: JSON.stringify(notifBlob) };
globalThis.Configuration = {
  getGame: () => ({ getValue: (k) => (k in KV ? KV[k] : null) }),
  editGame: () => ({ setValue: (k, v) => (KV[k] = v) })
};
globalThis.Game = { turn: 10 };

const { chronicle, chronicleLog } = await import("/emigration/ui/emigration-chronicle.js");
const { logNotification, notificationLog } = await import("/emigration/ui/emigration-notifications.js");

// ── (1) malformed load: bad entries dropped, kept entry coerced, no throw ──────────────────────────
const chron = chronicleLog();
assert.equal(chron.length, 2, "two malformed chronicle entries should drop (body 123, no-body, non-object)");
const kept = chron.find((e) => e.body === "kept");
assert.ok(kept, "the body-only entry should survive");
assert.equal(kept.kind, "exodus", "non-string kind should default");
assert.equal(kept.title, "", "null title should default to empty");
assert.ok(!("civ" in kept), "non-string civ should be omitted");
assert.ok(!("people" in kept), "non-number people should be omitted");

const notif = notificationLog();
assert.equal(notif.length, 2, "one non-object notification should drop");
const nkept = notif.find((e) => e.summary === "kept");
assert.equal(nkept.cause, "other", "non-string cause should default");
assert.equal(nkept.people, 0, "non-number people should default to 0");
assert.ok(!("event" in nkept), "non-string event should be omitted");

// ── (2) round-trip parity: in-memory cache deep-equals the persisted blob ───────────────────────────
// Write entries that OMIT optional fields; the persisted JSON must match the cache exactly.
chronicle({ kind: "founding", title: "T", body: "B", civ: "Roman" }); // no people/cause/dedupeKey
assert.deepStrictEqual(JSON.parse(KV[CHRON_KEY]), chronicleLog(),
  "persisted chronicle must equal the in-memory cache (no undefined-key divergence)");

logNotification({ cause: "war", kind: "cause", summary: "S", people: 5, points: 1 }); // no event/from*/to*
assert.deepStrictEqual(JSON.parse(KV[NOTIF_KEY]), notificationLog(),
  "persisted notif log must equal the in-memory cache (no undefined-key divergence)");

delete globalThis.Configuration;
delete globalThis.Game;
console.log("persistence-normalization harness passed");
