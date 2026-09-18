// network-events.mjs
//
// The migration-network chart's event badges (the red war / disaster flags under each cluster).
// Every badge used to be drawn at its cluster's fixed y with no dedupe, so two events on one cluster
// printed on top of each other: a player screenshot (2026-09-15) showed "Songhai vs Chola" and the war's
// own name overlapping into unreadable text, and the same on the Mongolian cluster. The layout step is
// pure, so it is pinned here; the drawing step nudges any remaining overlap through the same
// `resolveY` the settlement labels use.

import assert from "node:assert/strict";

const { eventBadgeRequests } = await import("/emigration/ui/emigration-network-paint.js");

const centers = [
  { x: 100, y: 200, clusterR: 30, name: "Songhai" },
  { x: 400, y: 260, clusterR: 50, name: "Mongolian" }
];
const scene = (events, frameIdx) => ({ centers, events, state: { frameIdx } });

// ── two events on one cluster are two badges, not one printed over the other ──
{
  const reqs = eventBadgeRequests(scene([
    { kind: "war", label: "Songhai vs Chola", from: 0, to: 10, cis: [0] },
    { kind: "war", label: "Songhai-Chola War", from: 0, to: 10, cis: [0] }
  ], 5));
  assert.equal(reqs.length, 2, "both events on the cluster are laid out");
  assert.deepEqual(reqs.map((r) => r.text), ["⚑ Songhai vs Chola", "⚑ Songhai-Chola War"], "each keeps its own label");
  assert.equal(reqs[0].x, 100, "anchored on its cluster");
}

// ── the same event pinned twice on one cluster is one badge ──────────────────
{
  const ev = { kind: "war", label: "Chola vs an unmet civilization", from: 0, to: 10, cis: [1, 1] };
  const reqs = eventBadgeRequests(scene([ev, ev], 5));
  assert.equal(reqs.length, 1, "a duplicate pin draws once, not twice on the same pixels");
}

// ── only the events active at the current frame ──────────────────────────────
{
  const events = [
    { kind: "war", label: "Over", from: 0, to: 3, cis: [0] },
    { kind: "disaster", label: "Now", from: 4, to: 8, cis: [0] },
    { kind: "war", label: "Later", from: 9, to: 12, cis: [0] }
  ];
  assert.deepEqual(eventBadgeRequests(scene(events, 5)).map((r) => r.text), ["⚑ Now"], "the window is inclusive of now only");
  assert.equal(eventBadgeRequests(scene(events, 20)).length, 0, "past the last event, nothing is badged");
  // Pre-existing behaviour, pinned so it can't drift silently: with no scrubber frame the clock reads as past
  // every window, so nothing is badged.
  assert.equal(eventBadgeRequests({ centers, events, state: {} }).length, 0, "no frame index: no badges");
}

// ── anchored below its cluster, and robust to a missing one ──────────────────
{
  const reqs = eventBadgeRequests(scene([{ kind: "war", label: "W", from: 0, to: 9, cis: [1] }], 1));
  assert.equal(reqs[0].y, 260 + 50 + 13, "sits below the cluster disc");
  assert.equal(reqs[0].color.length > 0, true, "carries its kind's colour");
  assert.equal(eventBadgeRequests(scene([{ kind: "war", label: "W", from: 0, to: 9, cis: [7] }], 1)).length, 0,
    "an event pinned to a cluster that isn't drawn is skipped");
  assert.deepEqual(eventBadgeRequests({}), [], "no scene, no badges");
}

console.log("network-events harness passed");
