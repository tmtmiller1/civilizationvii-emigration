import assert from "node:assert/strict";

globalThis.localStorage = {
  _m: {},
  getItem(k) {
    return Object.prototype.hasOwnProperty.call(this._m, k) ? this._m[k] : null;
  },
  setItem(k, v) {
    this._m[k] = String(v);
  },
  removeItem(k) {
    delete this._m[k];
  }
};

const nodesById = new Map();
const headChildren = [];
function mkNode(tag) {
  return {
    tagName: tag,
    id: "",
    className: "",
    textContent: "",
    children: [],
    appendChild(child) {
      this.children.push(child);
      if (child && child.id) nodesById.set(child.id, child);
      return child;
    }
  };
}

globalThis.document = {
  head: {
    appendChild(node) {
      headChildren.push(node);
      if (node && node.id) nodesById.set(node.id, node);
      return node;
    }
  },
  documentElement: {
    appendChild(node) {
      headChildren.push(node);
      if (node && node.id) nodesById.set(node.id, node);
      return node;
    }
  },
  createElement(tag) {
    return mkNode(tag);
  },
  getElementById(id) {
    return nodesById.get(id) || null;
  }
};

globalThis.window = { localStorage: globalThis.localStorage };

const settings = await import("/emigration/ui/emigration-settings.js");
const { timelineDetailText, appendSnapshotReminder } = await import("/emigration/ui/emigration-snapshot-reminder.js");

function testTimelineTextTracksSnapshotInterval() {
  settings.setSnapshotInterval(1);
  assert.equal(timelineDetailText(), "");

  settings.setSnapshotInterval(4);
  const text = timelineDetailText();
  assert.ok(text.includes("every 4 turns"));
  assert.ok(text.includes("up to 4 turns"));
}

function testAppendReminderInjectsSingleStyleAndBadge() {
  settings.setSnapshotInterval(3);
  const wrap = mkNode("div");

  appendSnapshotReminder(wrap);
  appendSnapshotReminder(wrap);

  assert.equal(headChildren.filter((n) => n.id === "emig-snap-badge-style").length, 1);
  assert.equal(wrap.children.length, 2);
  assert.equal(wrap.children[0].className, "emig-snap-badge font-body text-sm");
  assert.ok(wrap.children[0].textContent.includes("every 3 turns"));
}

function testAppendNoopsWhenFineDetail() {
  settings.setSnapshotInterval(1);
  const wrap = mkNode("div");
  appendSnapshotReminder(wrap);
  assert.equal(wrap.children.length, 0);
}

testTimelineTextTracksSnapshotInterval();
testAppendReminderInjectsSingleStyleAndBadge();
testAppendNoopsWhenFineDetail();

delete globalThis.window;
delete globalThis.document;
delete globalThis.localStorage;
console.log("snapshot-reminder harness passed");
