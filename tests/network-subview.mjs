// network-subview.mjs
//
// The combined Network tab's Dots/Flow sub-view choice (emigration-flow-tab.js): it must be PERSISTED
// (emigration-settings.js), so a panel re-render or a fresh UIScript isolate keeps the player on the
// view they picked instead of bouncing them back to Dots. Also guards that the inline Units toggle
// re-renders the CURRENT sub-view in place without duplicating the shared controls row.

import assert from "node:assert/strict";

// ── A minimal DOM: children, innerHTML="" clears, firstChild, classList, click(). ──
let ID = 0;
class E {
  constructor(tag) { this.tagName = tag; this.id = "e" + (ID++); this._class = ""; this.textContent = ""; this.style = {}; this.children = []; this._l = {}; this.parentNode = null; this.title = ""; this.width = 300; this.height = 150; }
  set className(v) { this._class = v; } get className() { return this._class; }
  get classList() { const self = this; const set = () => new Set(self._class.split(/\s+/).filter(Boolean));
    return { add(c) { const s = set(); s.add(c); self._class = [...s].join(" "); },
      remove(c) { const s = set(); s.delete(c); self._class = [...s].join(" "); },
      toggle(c, on) { const s = set(); const want = on === undefined ? !s.has(c) : on; if (want) s.add(c); else s.delete(c); self._class = [...s].join(" "); },
      contains(c) { return set().has(c); } }; }
  set innerHTML(v) { if (v === "") { for (const c of this.children) c.parentNode = null; this.children = []; } this._html = v; } get innerHTML() { return this._html || ""; }
  get firstChild() { return this.children[0] || null; }
  appendChild(c) { if (c) { c.parentNode = this; this.children.push(c); } return c; }
  removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) { this.children.splice(i, 1); c.parentNode = null; } return c; }
  addEventListener(t, h) { (this._l[t] || (this._l[t] = [])).push(h); }
  removeEventListener() {}
  click() { for (const h of (this._l.click || [])) h({ type: "click", stopPropagation() {}, preventDefault() {} }); }
  getBoundingClientRect() { return { width: 600, height: 300, top: 100, bottom: 400, left: 0, right: 600 }; }
  getContext() { return CTX; }
  contains(n) { if (n === this) return true; return this.children.some((c) => c.contains && c.contains(n)); }
  find(pred, out = []) { if (pred(this)) out.push(this); for (const c of this.children) c.find && c.find(pred, out); return out; }
}
const noop = () => {};
const CTX = new Proxy({}, { get: (_t, k) => { if (k === "measureText") return () => ({ width: 10 }); if (k === "createLinearGradient") return () => ({ addColorStop: noop }); if (k === "canvas") return { width: 300, height: 150 }; return noop; } });
const head = new E("head"), body = new E("body");
globalThis.document = { head, body, documentElement: new E("html"), createElement: (t) => new E(t),
  getElementById: (id) => head.find((e) => e.id === id)[0] || body.find((e) => e.id === id)[0] || null };
globalThis.window = { devicePixelRatio: 2, innerHeight: 800, addEventListener: noop, removeEventListener: noop };
globalThis.getComputedStyle = () => ({ overflowY: "visible", paddingBottom: "0" });
globalThis.localStorage = { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } };
// No requestAnimationFrame/setTimeout on globalThis → the viz paints once synchronously (no loops).

const { renderNetworkOrFlow } = await import("/emigration/ui/emigration-flow-tab.js");
const { getFlowView, setFlowView } = await import("/emigration/ui/emigration-settings.js");

const net = {
  nodes: [{ id: 1, name: "British" }, { id: 2, name: "French" }],
  edges: [{ from: 1, to: 2, people: 100, points: 5, byCause: { prosperity: 100 }, fromName: "British", toName: "French" }],
  cityEdges: []
};
const section = { kind: "flow", title: "Network", network: net, frames: [{ turn: 1, network: net, pops: {}, intra: [] }], events: [] };

// Fresh state: default is Dots.
setFlowView("network");

const viewKind = (container) => {
  const v = container.find((e) => e._class === "emig-flow-view")[0];
  if (!v) return "none";
  const flow = v.find((e) => e._class === "emig-flow-leg").length > 0;
  const dots = v.find((e) => e._class === "emig-legend").length > 0;
  return dots && !flow ? "DOTS" : flow && !dots ? "FLOW" : "ambiguous";
};
const unitBtns = (host) => host.find((e) => (e.textContent === "Civ Pop" || e.textContent === "Scaled Pop") && e._class.includes("emig-filter-btn"));

// ── Default renders Dots. ──
const c1 = new E("div"), controls = new E("div"); body.appendChild(c1);
renderNetworkOrFlow(c1, section, controls);
assert.equal(viewKind(c1), "DOTS", "defaults to the Dots view");

// ── Clicking Flow switches to the flow map AND persists the choice. ──
c1.find((e) => e.textContent === "Flow" && e._class.includes("emig-flow-tog"))[0].click();
assert.equal(viewKind(c1), "FLOW", "clicking Flow shows the flow map");
assert.equal(getFlowView(), "flowmap", "the Flow choice is persisted");

// ── The inline Units toggle keeps us on Flow and does NOT duplicate the controls row. ──
assert.equal(unitBtns(controls).length, 2, "flow view shows exactly the two Units buttons");
unitBtns(controls).find((b) => b.textContent === "Civ Pop").click();
assert.equal(viewKind(c1), "FLOW", "clicking a Units button stays on the flow map (no bounce to Dots)");
assert.equal(unitBtns(controls).length, 2, "the Units buttons are not duplicated after a rescale");

// ── A fresh render (simulating a panel re-render / fresh isolate) restores Flow from persistence. ──
const c2 = new E("div"); body.appendChild(c2);
renderNetworkOrFlow(c2, section, controls);
assert.equal(viewKind(c2), "FLOW", "a re-render restores the persisted Flow view, not the Dots default");
assert.ok(/"networkView":"flowmap"/.test(globalThis.localStorage.getItem("modSettings")), "the sub-view is written to the persisted store");

// ── Switching back to Dots persists too. ──
c2.find((e) => e.textContent === "Dots" && e._class.includes("emig-flow-tog"))[0].click();
assert.equal(viewKind(c2), "DOTS", "clicking Dots switches back");
assert.equal(getFlowView(), "network", "the Dots choice is persisted");

console.log("network-subview harness passed");
