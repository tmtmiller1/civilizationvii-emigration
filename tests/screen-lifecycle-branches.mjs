import assert from "node:assert/strict";

// Mock all globals BEFORE importing the module
globalThis.Panel = class {
  constructor() {
    this.Root = {
      querySelector: () => null,
      setAttribute: () => {}
    };
    this.enableOpenSound = false;
    this.enableCloseSound = false;
  }
  onInitialize() {}
  onAttach() {}
  onDetach() {}
  close() {}
};

let controlsDefineCalls = [];
globalThis.Controls = {
  define: (name, config) => {
    controlsDefineCalls.push({ name, config });
  }
};

// Mocks for imports in screen.js
globalThis.gatherDashboard = () => ({ cities: [] });
globalThis.dashboardModel = () => ({ tabs: [] });
globalThis.renderDashboardTabbed = (host, model, rebuild) => {};

const mockDisplayQueueManager = {
  suspend: () => {},
  resume: () => {},
  isSuspended: () => false
};

globalThis.import = (path) => {
  if (path === "/core/ui/context-manager/display-queue-manager.js") {
    return Promise.resolve({ DisplayQueueManager: mockDisplayQueueManager });
  }
  if (path === "/core/ui/context-manager/context-manager.js") {
    return Promise.resolve({ ContextManager: { push: () => {}, pop: () => {} } });
  }
  return Promise.reject(new Error(`Module not found: ${path}`));
};

// Import the module
await import("/emigration/ui/emigration-screen.js");

// Get the exported functions
const { openEmigrationScreen, closeEmigrationScreen, installEmigrationConsole } =
  await import("/emigration/ui/emigration-screen.js");

const panelMod = await import("/core/ui/panel-support.js");
const displayQueueMod = await import("/core/ui/context-manager/display-queue-manager.js");

function flushAsync() {
  return new Promise((resolve) => setTimeout(resolve, 20));
}

function testControlsDefineCalledWithScreenEmigration() {
  const screenCall = controlsDefineCalls.find(c => c.name === "screen-emigration");
  assert.ok(screenCall, "should register screen-emigration with Controls");
  assert.ok(screenCall.config.createInstance, "should have createInstance function");
}

function testOpenEmigrationScreenPushesContextManager() {
  let seen = null;
  globalThis.__coreStubContextManager = {
    push: (name, opts) => {
      seen = { name, opts };
    }
  };
  openEmigrationScreen();
  return flushAsync().then(() => {
    assert.ok(seen, "open should call ContextManager.push");
    assert.strictEqual(seen.name, "screen-emigration");
    assert.ok(seen.opts.singleton);
    assert.ok(seen.opts.createMouseGuard);
  });
}

function testOpenEmigrationScreenHandlesMissingContextManager() {
  globalThis.import = () => Promise.reject(new Error("Not found"));
  
  try {
    openEmigrationScreen();
  } catch (e) {
    assert.fail(`should handle missing context manager: ${e.message}`);
  }
}

function testOpenEmigrationScreenHandlesNullContextManager() {
  globalThis.import = (path) => {
    if (path === "/core/ui/context-manager/context-manager.js") {
      return Promise.resolve(null);
    }
    return Promise.reject();
  };
  
  try {
    openEmigrationScreen();
  } catch (e) {
    assert.fail(`should handle null context manager: ${e.message}`);
  }
}

function testOpenEmigrationScreenHandlesPushError() {
  globalThis.import = (path) => {
    if (path === "/core/ui/context-manager/context-manager.js") {
      return Promise.resolve({
        ContextManager: {
          push: () => { throw new Error("Push failed"); }
        }
      });
    }
    return Promise.reject();
  };
  
  try {
    openEmigrationScreen();
  } catch (e) {
    assert.fail(`should handle push error: ${e.message}`);
  }
}

function testCloseEmigrationScreenPopsContextManager() {
  let popped = null;
  globalThis.__coreStubContextManager = {
    pop: (name) => {
      popped = name;
    }
  };
  closeEmigrationScreen();
  return flushAsync().then(() => {
    assert.strictEqual(popped, "screen-emigration");
  });
}

function testCloseEmigrationScreenHandlesMissingContextManager() {
  globalThis.import = () => Promise.reject(new Error("Not found"));
  
  try {
    closeEmigrationScreen();
  } catch (e) {
    assert.fail(`should handle missing context manager: ${e.message}`);
  }
}

function testCloseEmigrationScreenHandlesNullContextManager() {
  globalThis.import = (path) => {
    if (path === "/core/ui/context-manager/context-manager.js") {
      return Promise.resolve(null);
    }
    return Promise.reject();
  };
  
  try {
    closeEmigrationScreen();
  } catch (e) {
    assert.fail(`should handle null context manager: ${e.message}`);
  }
}

function testCloseEmigrationScreenHandlesPopError() {
  globalThis.import = (path) => {
    if (path === "/core/ui/context-manager/context-manager.js") {
      return Promise.resolve({
        ContextManager: {
          pop: () => { throw new Error("Pop failed"); }
        }
      });
    }
    return Promise.reject();
  };
  
  try {
    closeEmigrationScreen();
  } catch (e) {
    assert.fail(`should handle pop error: ${e.message}`);
  }
}

function testInstallEmigrationConsoleCreatesAPI() {
  delete globalThis.emigration;
  
  installEmigrationConsole();
  
  assert.ok(globalThis.emigration);
  assert.ok(typeof globalThis.emigration.window === "function");
  assert.ok(typeof globalThis.emigration.closeWindow === "function");
}

function testInstallEmigrationConsolePreservesExisting() {
  globalThis.emigration = { existingProp: "value" };
  
  installEmigrationConsole();
  
  assert.strictEqual(globalThis.emigration.existingProp, "value");
  assert.ok(typeof globalThis.emigration.window === "function");
  assert.ok(typeof globalThis.emigration.closeWindow === "function");
}

function testInstallEmigrationConsoleWindowCallsOpen() {
  delete globalThis.emigration;
  
  let openCalled = false;
  globalThis.import = (path) => {
    if (path === "/core/ui/context-manager/context-manager.js") {
      return Promise.resolve({
        ContextManager: {
          push: () => { openCalled = true; }
        }
      });
    }
    return Promise.reject();
  };
  
  installEmigrationConsole();
  globalThis.emigration.window();
}

function testInstallEmigrationConsoleCloseWindowCallsClose() {
  delete globalThis.emigration;
  
  let closeCalled = false;
  globalThis.import = (path) => {
    if (path === "/core/ui/context-manager/context-manager.js") {
      return Promise.resolve({
        ContextManager: {
          pop: () => { closeCalled = true; }
        }
      });
    }
    return Promise.reject();
  };
  
  installEmigrationConsole();
  globalThis.emigration.closeWindow();
}

function testInstallEmigrationConsoleMultipleCalls() {
  delete globalThis.emigration;
  
  installEmigrationConsole();
  const first = globalThis.emigration;
  
  installEmigrationConsole();
  const second = globalThis.emigration;
  
  assert.strictEqual(first, second, "should reuse same object");
}

function testOpenAndCloseSequence() {
  return flushAsync().then(() => {
    let pushes = 0;
    let pops = 0;
    globalThis.__coreStubContextManager = {
      push: () => {
        pushes++;
      },
      pop: () => {
        pops++;
      }
    };
    openEmigrationScreen();
    closeEmigrationScreen();
    openEmigrationScreen();
    return flushAsync().then(() => {
      assert.equal(pushes, 2);
      assert.equal(pops, 1);
    });
  });
}

function testScreenCloseResumesPopupsWhenSuperCloseThrows() {
  const screenCall = controlsDefineCalls.find((c) => c.name === "screen-emigration");
  assert.ok(screenCall, "screen-emigration should be registered");

  const ScreenCtor = screenCall.config.createInstance;
  const instance = new ScreenCtor();
  instance.popupsSuspended = true;

  const PanelCtor = panelMod.default;
  const priorClose = PanelCtor.prototype.close;
  PanelCtor.prototype.close = () => {
    throw new Error("close boom");
  };

  const dq = displayQueueMod.DisplayQueueManager;
  const priorResume = dq.resume;
  const priorIsSuspended = dq.isSuspended;
  let resumed = 0;
  dq.isSuspended = () => true;
  dq.resume = () => {
    resumed++;
  };

  instance.close();

  return flushAsync().then(() => {
    try {
      assert.ok(resumed >= 1, "close should resume deferred popups even if super.close throws");
    } finally {
      PanelCtor.prototype.close = priorClose;
      dq.resume = priorResume;
      dq.isSuspended = priorIsSuspended;
    }
  });
}

function testScreenAttachDetachSurvivesSuperThrows() {
  const screenCall = controlsDefineCalls.find((c) => c.name === "screen-emigration");
  assert.ok(screenCall, "screen-emigration should be registered");

  const ScreenCtor = screenCall.config.createInstance;
  const instance = new ScreenCtor();
  instance.Root = {
    querySelector: (sel) => {
      if (sel === "[data-ia-close]") return { addEventListener: () => {} };
      if (sel === ".emig-screen-host") return { textContent: "" };
      return null;
    },
    setAttribute: () => {}
  };

  const PanelCtor = panelMod.default;
  const priorAttach = PanelCtor.prototype.onAttach;
  const priorDetach = PanelCtor.prototype.onDetach;
  PanelCtor.prototype.onAttach = () => {
    throw new Error("attach boom");
  };
  PanelCtor.prototype.onDetach = () => {
    throw new Error("detach boom");
  };

  try {
    assert.doesNotThrow(() => instance.onAttach());
    assert.doesNotThrow(() => instance.onDetach());
  } finally {
    PanelCtor.prototype.onAttach = priorAttach;
    PanelCtor.prototype.onDetach = priorDetach;
  }
}

function testOpenWithDefaultContextManagerExport() {
  globalThis.import = (path) => {
    if (path === "/core/ui/context-manager/context-manager.js") {
      return Promise.resolve({
        default: {
          push: () => {}
        }
      });
    }
    return Promise.reject();
  };
  
  try {
    openEmigrationScreen();
  } catch (e) {
    assert.fail(`should handle default export: ${e.message}`);
  }
}

function testCloseWithDefaultContextManagerExport() {
  globalThis.import = (path) => {
    if (path === "/core/ui/context-manager/context-manager.js") {
      return Promise.resolve({
        default: {
          pop: () => {}
        }
      });
    }
    return Promise.reject();
  };
  
  try {
    closeEmigrationScreen();
  } catch (e) {
    assert.fail(`should handle default export: ${e.message}`);
  }
}

function testOpenWithContextManagerAsDirectExport() {
  globalThis.import = (path) => {
    if (path === "/core/ui/context-manager/context-manager.js") {
      return Promise.resolve({
        push: () => {}
      });
    }
    return Promise.reject();
  };
  
  try {
    openEmigrationScreen();
  } catch (e) {
    assert.fail(`should handle direct export: ${e.message}`);
  }
}

function testCloseWithContextManagerAsDirectExport() {
  globalThis.import = (path) => {
    if (path === "/core/ui/context-manager/context-manager.js") {
      return Promise.resolve({
        pop: () => {}
      });
    }
    return Promise.reject();
  };
  
  try {
    closeEmigrationScreen();
  } catch (e) {
    assert.fail(`should handle direct export: ${e.message}`);
  }
}

// Run all tests
async function run() {
  testControlsDefineCalledWithScreenEmigration();
  await testOpenEmigrationScreenPushesContextManager();
  testOpenEmigrationScreenHandlesMissingContextManager();
  testOpenEmigrationScreenHandlesNullContextManager();
  testOpenEmigrationScreenHandlesPushError();
  await testCloseEmigrationScreenPopsContextManager();
  testCloseEmigrationScreenHandlesMissingContextManager();
  testCloseEmigrationScreenHandlesNullContextManager();
  testCloseEmigrationScreenHandlesPopError();
  testInstallEmigrationConsoleCreatesAPI();
  testInstallEmigrationConsolePreservesExisting();
  testInstallEmigrationConsoleWindowCallsOpen();
  testInstallEmigrationConsoleCloseWindowCallsClose();
  testInstallEmigrationConsoleMultipleCalls();
  await testOpenAndCloseSequence();
  testOpenWithDefaultContextManagerExport();
  testCloseWithDefaultContextManagerExport();
  testOpenWithContextManagerAsDirectExport();
  testCloseWithContextManagerAsDirectExport();
  await testScreenCloseResumesPopupsWhenSuperCloseThrows();
  testScreenAttachDetachSurvivesSuperThrows();
}

await run();

// Cleanup
delete globalThis.Panel;
delete globalThis.Controls;
delete globalThis.gatherDashboard;
delete globalThis.dashboardModel;
delete globalThis.renderDashboardTabbed;
delete globalThis.import;
delete globalThis.emigration;
delete globalThis.__coreStubContextManager;

console.log("screen-lifecycle-branches harness passed");
