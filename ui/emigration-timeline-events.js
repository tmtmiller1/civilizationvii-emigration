// emigration-timeline-events.js
//
// Positions the turn-stamped WAR and DISASTER records onto the network view's timeline frames, so
// the scrubber can pin "why did everyone leave here?" against the migration it caused.
//
// The two record sources are stamped as the events fire, each with an AGE-LOCAL turn plus its age
// (turns reset at every age boundary, so neither number positions an event on its own):
//   • wars      — emigration-war.warEvents()               {turn, age, year, aggressor, victim, endTurn, endAge}
//   • disasters — EmigrationData.disasterEvents()          {turn, age, year, name, severity}
//
// Timeline frames are SNAPSHOTS taken every N turns (emigration-settings.getSnapshotInterval, and
// emigration-flow-history decimates them further by merging pairs), so an event's exact turn usually
// has no frame of its own. Each event is therefore placed on the first frame at-or-after it WITHIN
// ITS OWN AGE — the earliest snapshot whose migration could reflect it — and clamped to that age's
// last frame when it fired after the final snapshot of the age.
//
// Output is the shape the viz already consumes (emigration-network-viz.resolveEvents):
// `{ kind, label, from, to, civs }` with `from`/`to` as FRAME INDICES.

import { warRefugeeName } from "/emigration/ui/emigration-naming.js";
import { loc } from "/emigration/ui/emigration-loc.js";

/**
 * @typedef {object} TimelineEvent
 * @property {string} kind "war" | "disaster".
 * @property {string} label Player-facing event name.
 * @property {number} from First frame index the event covers.
 * @property {number} to Last frame index the event covers.
 * @property {number[]} civs Civ ids involved (empty for disasters — onsets aren't civ-stamped).
 */

/**
 * Group frames into their contiguous per-age index ranges. Frames are in time order and an age never
 * recurs, so one range per age is enough to scope a turn lookup.
 * @param {*[]} frames Frames (in time order).
 * @returns {Map<string, {start:number, end:number}>} age → inclusive frame-index range.
 */
function ageRanges(frames) {
  /** @type {Map<string, {start:number, end:number}>} */
  const ranges = new Map();
  for (let i = 0; i < frames.length; i++) {
    const age = frames[i].age || "";
    const r = ranges.get(age);
    if (r) r.end = i;
    else ranges.set(age, { start: i, end: i });
  }
  return ranges;
}

/**
 * The frame index an (age, age-local turn) stamp lands on: the first frame of that age at-or-after
 * the turn, else the age's last frame (the event fired after its final snapshot). Null when the age
 * has no frames at all — an event we cannot place honestly is dropped rather than guessed at.
 * @param {*[]} frames Frames. @param {Map<string, {start:number, end:number}>} ranges Age ranges.
 * @param {string} age Age type. @param {number} turn Age-local turn.
 * @returns {number|null} Frame index, or null when unplaceable.
 */
function frameIndexAt(frames, ranges, age, turn) {
  const r = ranges.get(age || "");
  if (!r) return null;
  for (let i = r.start; i <= r.end; i++) {
    if (frames[i].turn >= turn) return i;
  }
  return r.end;
}

/**
 * Map one turn-stamped war to its frame window: declaration → peace, or → the latest frame while the
 * war is still ongoing (`endTurn: null`). Null when the declaration can't be placed.
 * @param {*} w War record. @param {*[]} frames Frames.
 * @param {Map<string, {start:number, end:number}>} ranges Age ranges.
 * @returns {TimelineEvent|null} The event, or null.
 */
function warEventFor(w, frames, ranges) {
  const from = frameIndexAt(frames, ranges, w.age, w.turn);
  if (from == null) return null;
  const ended = w.endTurn != null
    ? frameIndexAt(frames, ranges, w.endAge || w.age, w.endTurn)
    : frames.length - 1;
  return {
    kind: "war",
    label: warRefugeeName(w.victim, [w.aggressor]),
    from,
    to: Math.max(from, ended == null ? frames.length - 1 : ended),
    civs: [w.aggressor, w.victim]
  };
}

/**
 * Map one disaster onset to its frame window. A disaster is a POINT event (only the onset is
 * stamped, never an end), so it occupies the single frame it landed on. Null when unplaceable.
 * @param {*} d Disaster record. @param {*[]} frames Frames.
 * @param {Map<string, {start:number, end:number}>} ranges Age ranges.
 * @returns {TimelineEvent|null} The event, or null.
 */
function disasterEventFor(d, frames, ranges) {
  const at = frameIndexAt(frames, ranges, d.age, d.turn);
  if (at == null) return null;
  // Onsets are stamped with an already-resolved display name (emigration-events records
  // disasterName(eventType)); the generic only covers a record stamped before the name resolved.
  const label = d.name || loc("LOC_EMIG_TL_PIN_DISASTER", "Disaster");
  return { kind: "disaster", label, from: at, to: at, civs: [] };
}

/**
 * Build the timeline's event specs from the turn-stamped war + disaster logs, positioned onto
 * `frames` and sorted by first frame (so same-column pins cluster in a stable order).
 *
 * Events that predate the war log's v3 schema upgrade, or whose age never made it into the frame
 * window, are dropped — a pin we cannot place honestly is worse than no pin.
 * @param {*[]} frames Timeline frames (in time order), each `{turn, age, ...}`.
 * @param {*[]} [disasters] Disaster onsets from EmigrationData.disasterEvents().
 * @param {*[]} [wars] Turn-stamped declarations from emigration-war.warEvents().
 * @returns {TimelineEvent[]} Event specs with frame-index windows.
 */
export function buildTimelineEvents(frames, disasters, wars) {
  const list = Array.isArray(frames) ? frames : [];
  if (list.length < 2) return []; // the timeline itself needs >= 2 frames (makeTimeline)
  const ranges = ageRanges(list);
  const out = [
    ...placeAll(wars, list, ranges, warEventFor),
    ...placeAll(disasters, list, ranges, disasterEventFor)
  ];
  return out.sort((a, b) => a.from - b.from);
}

/**
 * Map each record through `place`, dropping the rows that can't be positioned.
 * @param {*} records Candidate records (any non-array is treated as empty).
 * @param {*[]} frames Frames. @param {Map<string, {start:number, end:number}>} ranges Age ranges.
 * @param {(r:*, f:*[], g:Map<string, {start:number, end:number}>)=>TimelineEvent|null} place Mapper.
 * @returns {TimelineEvent[]} The placeable events.
 */
function placeAll(records, frames, ranges, place) {
  /** @type {TimelineEvent[]} */
  const out = [];
  for (const r of Array.isArray(records) ? records : []) {
    const e = r ? place(r, frames, ranges) : null;
    if (e) out.push(e);
  }
  return out;
}
