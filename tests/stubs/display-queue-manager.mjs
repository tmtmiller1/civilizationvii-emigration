const state = {
  suspended: false
};

const moduleShape = globalThis.__coreStubDisplayQueueModule || {};

const autoDisplayQueueManager = {
  suspend() {
    state.suspended = true;
  },
  resume() {
    state.suspended = false;
  },
  isSuspended() {
    return state.suspended;
  }
};

const DisplayQueueManager = Object.prototype.hasOwnProperty.call(moduleShape, "displayQueueManager")
  ? moduleShape.displayQueueManager
  : autoDisplayQueueManager;

const defaultExport = Object.prototype.hasOwnProperty.call(moduleShape, "defaultExport")
  ? moduleShape.defaultExport
  : DisplayQueueManager;

export { DisplayQueueManager };
export default defaultExport;
