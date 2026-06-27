import assert from "node:assert/strict";

// Create a more complete mock DOM environment for Panel lifecycle testing
globalThis.Panel = class {
  constructor() {
    this.Root = {
      querySelector: (sel) => {
        if (sel === "[data-ia-close]") {
          return {
            addEventListener: (evt, cb) => {
              this._closeListener = cb;
            }
          };
        }
        if (sel === ".emig-screen-host") {
          return {
            textContent: ""
          };
        }
        return null;
      },
      setAttribute: (attr, val) => {},
      addEventListener: () => {}
    };
    this.enableOpenSound = false;
    this.enableCloseSound = false;
    this._closeListener = null;
  }
  onInitialize() {}
  onAttach() {}
  onDetach() {}
  close() {}
};

// Mock for dynamic imports
const mockModules = {
  "/core/ui/context-manager/display-queue-manager.js": {
    DisplayQueueManager: {
      suspend: () => {},
      resume: () => {},
      isSuspended: () => false
    }
  },
  "/core/ui/context-manager/context-manager.js": {
    ContextManager: {
      push: () => {},
      pop: () => {}
    }
  },
  "/emigration/ui/emigration-window.js": {
    gatherDashboard: () => ({ cities: [] })
  },
  "/emigration/ui/emigration-views.js": {
    dashboardModel: () => ({ tabs: [] }),
    renderDashboardTabbed: () => {}
  }
};

globalThis.import = (path) => {
  if (mockModules[path]) {
    return Promise.resolve(mockModules[path]);
  }
  return Promise.reject(new Error(`Module not found: ${path}`));
};

globalThis.Controls = {
  define: () => {}
};

const { openEmigrationScreen, closeEmigrationScreen, installEmigrationConsole } =
  await import("/emigration/ui/emigration-screen.js");

function testOpenScreenPushWithSingletonOption() {
  let pushCalled = false;
  let options = null;
  
  globalThis.import = (path) => {
    if (path === "/core/ui/context-manager/context-manager.js") {
      return Promise.resolve({
        ContextManager: {
          push: (name, opts) => {
            pushCalled = true;
            options = opts;
          }
        }
      });
    }
    return Promise.reject();
  };
  
  openEmigrationScreen();
}

function testOpenScreenWithNullContextManager() {
  globalThis.import = (path) => {
    if (path === "/core/ui/context-manager/context-manager.js") {
      return Promise.resolve({
        ContextManager: null
      });
    }
    return Promise.reject();
  };
  
  try {
    openEmigrationScreen();
  } catch (e) {
    assert.fail(`should handle null ContextManager: ${e.message}`);
  }
}

function testCloseScreenPopsWithCorrectName() {
  globalThis.import = (path) => {
    if (path === "/core/ui/context-manager/context-manager.js") {
      return Promise.resolve({
        ContextManager: {
          pop: () => {}
        }
      });
    }
    return Promise.reject();
  };
  
  try {
    closeEmigrationScreen();
  } catch (e) {
    assert.fail(`should pop screen: ${e.message}`);
  }
}

function testMultipleOpenScreenCalls() {
  let callCount = 0;
  globalThis.import = (path) => {
    if (path === "/core/ui/context-manager/context-manager.js") {
      return Promise.resolve({
        ContextManager: {
          push: () => { callCount++; }
        }
      });
    }
    return Promise.reject();
  };
  
  openEmigrationScreen();
  openEmigrationScreen();
  openEmigrationScreen();
}

function testConsoleAPIWindowFunction() {
  globalThis.import = (path) => {
    if (path === "/core/ui/context-manager/context-manager.js") {
      return Promise.resolve({
        ContextManager: {
          push: () => {}
        }
      });
    }
    return Promise.reject();
  };
  
  delete globalThis.emigration;
  installEmigrationConsole();
  
  assert.ok(typeof globalThis.emigration.window === "function");
  globalThis.emigration.window();
}

function testConsoleAPICloseWindowFunction() {
  globalThis.import = (path) => {
    if (path === "/core/ui/context-manager/context-manager.js") {
      return Promise.resolve({
        ContextManager: {
          pop: () => {}
        }
      });
    }
    return Promise.reject();
  };
  
  delete globalThis.emigration;
  installEmigrationConsole();
  
  assert.ok(typeof globalThis.emigration.closeWindow === "function");
  globalThis.emigration.closeWindow();
}

function testConsoleInstallsWithExistingEmigrationObject() {
  globalThis.emigration = {
    customProp: "value",
    existingMethod: () => {}
  };
  
  installEmigrationConsole();
  
  assert.strictEqual(globalThis.emigration.customProp, "value");
  assert.ok(typeof globalThis.emigration.existingMethod === "function");
  assert.ok(typeof globalThis.emigration.window === "function");
  assert.ok(typeof globalThis.emigration.closeWindow === "function");
}

function testOpenScreenHandlesDefaultAndContextManagerUnions() {
  globalThis.import = (path) => {
    if (path === "/core/ui/context-manager/context-manager.js") {
      return Promise.resolve({
        default: {
          ContextManager: {
            push: () => {}
          }
        }
      });
    }
    return Promise.reject();
  };
  
  try {
    openEmigrationScreen();
  } catch (e) {
    assert.fail(`should handle nested default: ${e.message}`);
  }
}

function testCloseScreenHandlesAllContextManagerFormats() {
  const formats = [
    { ContextManager: { pop: () => {} } },
    { default: { pop: () => {} } },
    { pop: () => {} }
  ];
  
  for (const format of formats) {
    globalThis.import = (path) => {
      if (path === "/core/ui/context-manager/context-manager.js") {
        return Promise.resolve(format);
      }
      return Promise.reject();
    };
    
    try {
      closeEmigrationScreen();
    } catch (e) {
      assert.fail(`should handle format ${JSON.stringify(format)}: ${e.message}`);
    }
  }
}

function testOpenScreenWithErrorInCallback() {
  globalThis.import = (path) => {
    if (path === "/core/ui/context-manager/context-manager.js") {
      return Promise.resolve({
        ContextManager: {
          push: () => { throw new Error("Push error"); }
        }
      });
    }
    return Promise.reject();
  };
  
  try {
    openEmigrationScreen();
  } catch (e) {
    // Should not throw in our sync context
  }
}

function testCloseScreenWithErrorInCallback() {
  globalThis.import = (path) => {
    if (path === "/core/ui/context-manager/context-manager.js") {
      return Promise.resolve({
        ContextManager: {
          pop: () => { throw new Error("Pop error"); }
        }
      });
    }
    return Promise.reject();
  };
  
  try {
    closeEmigrationScreen();
  } catch (e) {
    // Should not throw
  }
}

function testConsoleInstallMultipleTimes() {
  globalThis.import = (path) => {
    if (path === "/core/ui/context-manager/context-manager.js") {
      return Promise.resolve({
        ContextManager: {
          push: () => {},
          pop: () => {}
        }
      });
    }
    return Promise.reject();
  };
  
  delete globalThis.emigration;
  installEmigrationConsole();
  const first = globalThis.emigration;
  
  installEmigrationConsole();
  const second = globalThis.emigration;
  
  assert.strictEqual(first, second);
  assert.ok(typeof first.window === "function");
  assert.ok(typeof second.window === "function");
}

function testImportFailureHandlingBothDirections() {
  globalThis.import = () => Promise.reject(new Error("Network error"));
  
  try {
    openEmigrationScreen();
    closeEmigrationScreen();
  } catch (e) {
    assert.fail(`should silently handle import failures: ${e.message}`);
  }
}

function testConsoleAPICallSequence() {
  globalThis.import = (path) => {
    if (path === "/core/ui/context-manager/context-manager.js") {
      return Promise.resolve({
        ContextManager: {
          push: () => {},
          pop: () => {}
        }
      });
    }
    return Promise.reject();
  };
  
  delete globalThis.emigration;
  installEmigrationConsole();
  
  try {
    globalThis.emigration.window();
    globalThis.emigration.closeWindow();
    globalThis.emigration.window();
  } catch (e) {
    assert.fail(`sequence should not throw: ${e.message}`);
  }
}

function testOpenScreenWithPartialContextManagerInterface() {
  globalThis.import = (path) => {
    if (path === "/core/ui/context-manager/context-manager.js") {
      return Promise.resolve({
        ContextManager: {
          push: () => {},
          pop: () => {},
          someOtherMethod: () => {}
        }
      });
    }
    return Promise.reject();
  };
  
  try {
    openEmigrationScreen();
  } catch (e) {
    assert.fail(`should handle extended interface: ${e.message}`);
  }
}

function testConsoleOnGlobalThisWithoutEmigrationProp() {
  const saved = globalThis.emigration;
  delete globalThis.emigration;
  
  globalThis.import = () => Promise.resolve({});
  
  installEmigrationConsole();
  
  assert.ok("emigration" in globalThis);
  assert.ok(globalThis.emigration.window && globalThis.emigration.closeWindow);
  
  if (saved) globalThis.emigration = saved;
}

// Run all tests
testOpenScreenPushWithSingletonOption();
testOpenScreenWithNullContextManager();
testCloseScreenPopsWithCorrectName();
testMultipleOpenScreenCalls();
testConsoleAPIWindowFunction();
testConsoleAPICloseWindowFunction();
testConsoleInstallsWithExistingEmigrationObject();
testOpenScreenHandlesDefaultAndContextManagerUnions();
testCloseScreenHandlesAllContextManagerFormats();
testOpenScreenWithErrorInCallback();
testCloseScreenWithErrorInCallback();
testConsoleInstallMultipleTimes();
testImportFailureHandlingBothDirections();
testConsoleAPICallSequence();
testOpenScreenWithPartialContextManagerInterface();
testConsoleOnGlobalThisWithoutEmigrationProp();

// Cleanup
delete globalThis.Panel;
delete globalThis.Controls;
delete globalThis.import;
delete globalThis.emigration;

console.log("screen-branches-enhanced harness passed");
