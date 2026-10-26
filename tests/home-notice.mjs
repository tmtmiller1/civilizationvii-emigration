// home-notice.mjs
//
// The reminder that replaces the call-home pop-up (emigration-home-notice.js): once a home is calm and enough
// people are away, a small pop-up offers to open the Displaced tab, wait, or stop the reminders for good. It
// repeats only when the count has grown by half and ten turns have passed; the switch that used to gate the
// old pop-up gates it.

import assert from "node:assert/strict";

globalThis.Locale = { compose: (s) => s };
const { CONFIG } = await import("/emigration/ui/emigration-config.js");
const { homeNoticeDue, noticeDisplacedWhenCalm, homeNoticeView, NOTICE_GAP } =
  await import("/emigration/ui/emigration-home-notice.js");

CONFIG.callHomeEnabled = true;
CONFIG.callHomeOfferWhenCalm = true;
CONFIG.homeNoticeMinAway = 5;

function testDue() {
  assert.equal(homeNoticeDue(null, 0, 10), false, "nobody away: quiet");
  assert.equal(homeNoticeDue(null, 4, 10), false, "under the threshold: quiet");
  assert.equal(homeNoticeDue(null, 5, 10), true, "at the threshold, the first time: speak");
  assert.equal(homeNoticeDue({ turn: 10, away: 66 }, 83, 14), false, "a quarter more, four turns on: quiet (this save's own numbers)");
  assert.equal(homeNoticeDue({ turn: 10, away: 66 }, 99, 14), false, "half again as many, but inside the ten-turn gap: quiet");
  assert.equal(homeNoticeDue({ turn: 10, away: 66 }, 98, 10 + NOTICE_GAP), false, "ten turns on, not yet half again: quiet");
  assert.equal(homeNoticeDue({ turn: 10, away: 66 }, 99, 10 + NOTICE_GAP), true, "ten turns on and half again as many: speak");
  assert.equal(homeNoticeDue({ turn: 10, away: 66 }, 66, 10 + 100), false, "a count that stands still never repeats");
  assert.equal(homeNoticeDue({ turn: 10, away: 6 }, 9, 10 + NOTICE_GAP), false, "small counts: half again is less than the threshold");
  assert.equal(homeNoticeDue({ turn: 10, away: 6 }, 11, 10 + NOTICE_GAP), true, "so the threshold's worth more is the bar");
  assert.equal(homeNoticeDue(null, 1, 10, 1), true, "a threshold of one: any one person");
}

function testView() {
  const v = homeNoticeView(23);
  assert.equal(v.title, "Your people can come home");
  assert.match(v.body, /^23 of your people are displaced from settlements you still hold, and a settlement they fled is safe again\./);
  assert.deepEqual(v.choices.map((c) => [c.id, c.label]),
    [["open", "Open the Settlements tab"], ["later", "Not now"], ["never", "Don't remind me again"]]);
  assert.equal(v.dismissId, "later", "closing the pop-up is a Not now");
  assert.match(v.choices[1].note, /at least 10 turns/);
  assert.equal(v.quote, "", "no epigraph unless one is given");
  assert.equal(homeNoticeView(23, "\"x\" y").quote, "\"x\" y", "the epigraph rides on the view");
}

function testNotice() {
  const shown = [];
  const quotes = [];
  const acts = [];
  let last = null;
  let answer = "later";
  const deps = {
    calm: () => true, away: () => 23, last: () => last, remember: (pid, rec) => { last = rec; },
    show: (view, onChoice) => { shown.push(view.body); quotes.push(view.quote); onChoice(answer); },
    open: () => acts.push("open"), stop: () => acts.push("stop"), turn: () => 130
  };
  assert.equal(noticeDisplacedWhenCalm(0, deps), true);
  assert.equal(shown.length, 1);
  assert.ok(quotes[0].startsWith("\"") && quotes[0].length > 40, "a homecoming epigraph with its attribution: " + quotes[0]);
  assert.deepEqual(last, { turn: 130, away: 23 }, "remembered in the save, Not now included");
  assert.deepEqual(acts, [], "Not now does nothing else");
  assert.equal(noticeDisplacedWhenCalm(0, deps), false, "not again the same turn");
  assert.equal(noticeDisplacedWhenCalm(0, { ...deps, calm: () => false, away: () => 99 }), false, "not while no home can receive them");
  assert.equal(noticeDisplacedWhenCalm(0, { ...deps, away: () => 99, turn: () => 135 }), false, "many more, but too soon: quiet");
  answer = "open";
  assert.equal(noticeDisplacedWhenCalm(0, { ...deps, away: () => 40, turn: () => 141 }), true, "half again as many, eleven turns on: again");
  assert.deepEqual(acts, ["open"], "Open opens the tab");
  answer = "never";
  assert.equal(noticeDisplacedWhenCalm(0, { ...deps, away: () => 90, turn: () => 160 }), true);
  assert.deepEqual(acts, ["open", "stop"], "Don't remind me again stops them");
  CONFIG.callHomeOfferWhenCalm = false;
  assert.equal(noticeDisplacedWhenCalm(0, { ...deps, away: () => 999, turn: () => 999 }), false, "the switch silences it");
  CONFIG.callHomeOfferWhenCalm = true;
  assert.equal(noticeDisplacedWhenCalm(-1, deps), false, "no local player: quiet");
  assert.equal(noticeDisplacedWhenCalm(0, { ...deps, away: () => { throw new Error("unreadable"); } }), false, "a bad read is quiet");
  assert.equal(shown.length, 3);
  noticeDisplacedWhenCalm(0, { ...deps, away: () => 500, turn: () => 300, quote: "\"x\" y" });
  assert.equal(quotes[3], "\"x\" y", "an injected epigraph is used as is");
}

testDue();
testView();
testNotice();
console.log("home-notice: ok");
