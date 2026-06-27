const fallback = {
  push: () => {},
  pop: () => {}
};

const moduleShape = globalThis.__coreStubContextManagerModule || {};

function manager() {
  return globalThis.__coreStubContextManager || fallback;
}

const autoContextManager = {
  push(...args) {
    const m = manager();
    if (typeof m.push === "function") return m.push(...args);
    return undefined;
  },
  pop(...args) {
    const m = manager();
    if (typeof m.pop === "function") return m.pop(...args);
    return undefined;
  }
};

const ContextManager = Object.prototype.hasOwnProperty.call(moduleShape, "contextManager")
  ? moduleShape.contextManager
  : autoContextManager;

const defaultExport = Object.prototype.hasOwnProperty.call(moduleShape, "defaultExport")
  ? moduleShape.defaultExport
  : ContextManager;

export { ContextManager };
export default defaultExport;
