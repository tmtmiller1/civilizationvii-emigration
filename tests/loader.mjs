// Node ESM loader: map the mod's absolute `/emigration/...` import specifiers to
// files under the project root, so the pure modules can be unit-tested off-engine.
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const loaderDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(loaderDir, "..");
const MODULE_PREFIX = "/emigration/";
// Engine-served modules (/core, /base-standard) don't exist off-engine; route
// them to a tiny stub so settings/options modules that import them can be tested.
const CORE_STUB = pathToFileURL(path.join(loaderDir, "core-stub.mjs")).href;
const PANEL_SUPPORT_STUB = pathToFileURL(path.join(loaderDir, "stubs", "panel-support.mjs")).href;
const CONTEXT_MANAGER_STUB = pathToFileURL(path.join(loaderDir, "stubs", "context-manager.mjs")).href;
const DISPLAY_QUEUE_MANAGER_STUB = pathToFileURL(path.join(loaderDir, "stubs", "display-queue-manager.mjs")).href;

export async function resolve(specifier, context, defaultResolve) {
  if (specifier.startsWith(MODULE_PREFIX)) {
    const mapped = path.join(projectRoot, specifier.slice(MODULE_PREFIX.length));
    return {
      url: pathToFileURL(mapped).href,
      shortCircuit: true
    };
  }
  if (specifier === "/core/ui/panel-support.js") {
    return { url: PANEL_SUPPORT_STUB, shortCircuit: true };
  }
  if (specifier === "/core/ui/context-manager/context-manager.js") {
    return { url: CONTEXT_MANAGER_STUB, shortCircuit: true };
  }
  if (specifier === "/core/ui/context-manager/display-queue-manager.js") {
    return { url: DISPLAY_QUEUE_MANAGER_STUB, shortCircuit: true };
  }
  if (specifier.startsWith("/core/") || specifier.startsWith("/base-standard/")) {
    return { url: CORE_STUB, shortCircuit: true };
  }
  return defaultResolve(specifier, context, defaultResolve);
}
