// network-refugees.mjs
//
// War and disaster refugees on the network diagram: each refugee dot is tagged with the event it fled,
// hovering the dot names that event, and the legend explains the ring. Driven through the real dot
// builder, the real pointer handlers (wireEvents) and the real legend helper.
//
// Before 2026-10-24 every refugee was tagged with whichever matching event came last in the list, so a
// civ that fought two wars had all its refugees ringed during the second one. The tooltip names the
// war, so the right one matters.

import assert from "node:assert/strict";

const { buildChronoDots, tagEventDots } = await import("/emigration/ui/emigration-network-dots.js");
const { wireEvents, addRingKeys } = await import("/emigration/ui/emigration-network-interact.js");

const WX = 1120;
const WY = 560;
const noop = () => {};

/** Two civs, one city each; Alpha's people fled to Beta from a war. */
function makeScene() {
  const frames = [{
    turn: 1,
    network: {
      nodes: [{ id: 1, name: "Alpha" }, { id: 2, name: "Beta" }],
      edges: [{ from: 1, to: 2, people: 5000, fromCity: "C0", toCity: "C0", byCause: { war: 5000 } }],
      cityEdges: [], maxEdge: 0, maxNode: 0
    },
    pops: { 1: { cities: [{ name: "C0", town: false, pop: 100, pts: 10 }] },
      2: { cities: [{ name: "C0", town: false, pop: 100, pts: 10 }] } }
  }];
  const centers = [
    { id: 1, name: "Alpha", x: 300, y: 280, fillColor: "#5aa9e6", color: "#5aa9e6" },
    { id: 2, name: "Beta", x: 800, y: 280, fillColor: "#f4a259", color: "#f4a259" }
  ];
  const byId = new Map([[1, 0], [2, 1]]);
  const dots = buildChronoDots(frames, centers, byId, new Map([[1, 0], [2, 1]]), 50);
  const state = {
    causes: new Set(), origin: null, focusDest: null, focusCity: null, scope: null,
    show: { resident: true, internal: true, immigrant: true }, showFlows: false,
    lens: "origin", frameIdx: 0, expanded: new Set([1, 2])
  };
  return { WX, WY, centers, dots, state, byId, events: [], civMode: false, frames };
}

/** Where the painter puts a dot (mirrors dotXY for a settled dot). */
function dotPos(scene, d) {
  const c = scene.centers[d.ci];
  return d.cm ? { x: c.x + d.cm.sx + d.cox, y: c.y + d.cm.sy + d.coy } : { x: c.x + d.ox, y: c.y + d.oy };
}

/** Wire the real handlers to a canvas stub and return a function that hovers a point and reads the tooltip. */
function hoverer(scene) {
  const on = {};
  const canvas = {
    style: {},
    addEventListener: (t, f) => {
      on[t] = f;
    },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: WX, height: WY })
  };
  const tip = { html: null, shown: false };
  wireEvents(/** @type {*} */ (canvas), { scene, dirty: false }, scene.state, {
    hide: () => {
      tip.shown = false;
    },
    show: () => {
      tip.shown = true;
    },
    move: noop,
    setHTML: (h) => {
      tip.html = h;
    }
  });
  return (x, y) => {
    on.mousemove({ clientX: x, clientY: y });
    return tip.shown ? tip.html : null;
  };
}

function testEachRefugeeGetsTheWarGoingOnWhenItArrived() {
  const war = (label, from, to) => ({ kind: "war", label, from, to, civs: [1, 3] });
  const dots = [
    { scope: "immigrant", cause: "war", originId: 1, appearFrame: 2 },
    { scope: "immigrant", cause: "war", originId: 1, appearFrame: 9 },
    { scope: "immigrant", cause: "war", originId: 1, appearFrame: 0 },
    { scope: "immigrant", cause: "war", originId: 2, appearFrame: 9 },
    { scope: "immigrant", cause: "disaster", originId: 1, appearFrame: 9 },
    { scope: "resident", cause: "native", originId: 1, appearFrame: 9 }
  ];
  tagEventDots(/** @type {*} */ (dots), [war("First War", 1, 4), war("Second War", 8, 12)]);
  assert.equal(dots[0].evLabel, "First War", "a refugee arriving during the first war belongs to it");
  assert.equal(dots[1].evLabel, "Second War", "a refugee arriving during the second war belongs to it");
  assert.equal(dots[2].evLabel, "First War", "one arriving before any recorded war gets the earliest");
  assert.deepEqual([dots[1].evFrom, dots[1].evTo, dots[1].evKind], [8, 12, "war"], "the ring follows its own war");
  assert.equal(dots[3].evLabel, undefined, "a civ outside the war isn't tagged");
  assert.equal(dots[4].evLabel, undefined, "a disaster refugee isn't tagged with a war");
  assert.equal(dots[5].evLabel, undefined, "residents aren't refugees");
}

function testHoveringARefugeeNamesTheWar() {
  const scene = makeScene();
  tagEventDots(scene.dots, [{ kind: "war", label: "Alpha–Beta War", from: 0, to: 0, civs: [1, 2] }]);
  const refugee = scene.dots.find((d) => d.evLabel);
  assert.ok(refugee, "the scene has a war refugee");
  const hover = hoverer(scene);
  const p = dotPos(scene, refugee);
  const html = hover(p.x, p.y);
  assert.ok(html && html.includes("Alpha–Beta War"), "the tooltip names the war: " + html);
  assert.ok(html.includes("Refugee from Alpha"), "and where the refugee came from: " + html);

  const resident = scene.dots.find((d) => d.scope === "resident" && d.destId === 1);
  const rp = dotPos(scene, resident);
  const other = hover(rp.x, rp.y);
  assert.ok(other && !other.includes("Refugee from"), "a resident's spot shows the usual breakdown");

  scene.state.origin = 2; // isolate Beta: the Alpha refugee dims and stops answering the hover
  const dimmed = hover(p.x, p.y);
  assert.ok(!dimmed || !dimmed.includes("Alpha–Beta War"), "a dimmed refugee doesn't take the tooltip");
}

/** A minimal DOM for the legend helper. */
function installDocument() {
  globalThis.document = /** @type {*} */ ({
    createElement: (tag) => ({
      tag, style: {}, children: [], className: "", textContent: "", title: "",
      appendChild(c) {
        this.children.push(c);
      }
    })
  });
}

function testLegendExplainsTheRingsPresent() {
  installDocument();
  const box = document.createElement("div");
  addRingKeys(/** @type {*} */ (box), /** @type {*} */ ([{ evKind: "war" }, { evKind: "war" }, {}]));
  assert.equal(box.children.length, 1, "one key for wars, none for disasters that never ringed a dot");
  const key = /** @type {*} */ (box.children[0]);
  assert.equal(key.children[1].textContent, "War refugees");
  assert.ok(key.title.includes("Hover a dot"), "the key's hover says how to find out which war");
  assert.ok(key.children[0].style.border.includes("#e5616b"), "the swatch is a ring in the war color");

  const empty = document.createElement("div");
  addRingKeys(/** @type {*} */ (empty), []);
  assert.equal(empty.children.length, 0, "no refugees, no key");
}

testEachRefugeeGetsTheWarGoingOnWhenItArrived();
testHoveringARefugeeNamesTheWar();
testLegendExplainsTheRingsPresent();
console.log("network-refugees: ok");
