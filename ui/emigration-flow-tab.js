// emigration-flow-tab.js
//
// The combined "Network" sub-tab: a Dots/Flows toggle that swaps between the animated dot-swarm
// network view (emigration-network-viz.js) and the arrow flow map (emigration-network-flow.js).
// Both read the same {network, frames, events} section model, so the toggle just swaps renderers.
// Kept in its own module so emigration-views.js stays under the modularization line gate.

import { renderNetworkViz } from "/emigration/ui/emigration-network-viz.js";
import { renderFlowMap } from "/emigration/ui/emigration-network-flow.js";

/** Selected view inside the combined tab: "network" (dot swarm) | "flowmap" (arrows). Persists. */
let _flowView = "network";

/**
 * Create a div with a class and optional text.
 * @param {string} cls Class name.
 * @param {string} [txt] Text content.
 * @returns {HTMLElement} The element.
 */
function div(cls, txt) {
  const d = document.createElement("div");
  d.className = cls;
  if (txt != null) d.textContent = txt;
  return d;
}

/**
 * Render the combined Network/Flows section: a Dots/Flows toggle, then the selected visualization.
 * @param {HTMLElement} body The section body.
 * @param {*} section The combined section ({network, frames, events}).
 */
export function renderNetworkOrFlow(body, section) {
  body.innerHTML = "";
  const bar = div("emig-flow-toggle");
  const mk = (/** @type {string} */ view, /** @type {string} */ label) => {
    const b = div("emig-flow-tog" + (_flowView === view ? " active" : ""), label);
    b.addEventListener("click", () => {
      if (_flowView === view) return;
      _flowView = view;
      renderNetworkOrFlow(body, section);
    });
    return b;
  };
  bar.appendChild(mk("network", "Dots"));
  bar.appendChild(mk("flowmap", "Flows"));
  body.appendChild(bar);
  const view = div("emig-flow-view");
  body.appendChild(view);
  if (_flowView === "flowmap") renderFlowMap(view, section);
  else renderNetworkViz(view, section);
}
