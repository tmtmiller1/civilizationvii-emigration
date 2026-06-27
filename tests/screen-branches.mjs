import assert from "node:assert/strict";

// Mock Panel class
globalThis.Panel = class {
  constructor() {
    this.Root = {
      querySelector: () => null,
      setAttribute: () => {}
    };
  }
  onInitialize() {}
  onAttach() {}
  onDetach() {}
  close() {}
};

// Track Controls.define calls
let controlsDefined = false;
globalThis.Controls = {
  define: (name, config) => {
    if (name === "screen-emigration") {
      controlsDefined = true;
    }
  }
};

// Mock gatherDashboard and views
globalThis.gatherDashboard = () => ({ cities: [] });
globalThis.dashboardModel = () => ({ tabs: [] });
globalThis.renderDashboardTabbed = () => {};

const { openEmigrationScreen, closeEmigrationScreen, installEmigrationConsole } =
  await import("/emigration/ui/emigration-screen.js");

function testControlsDefinedWhenAvailable() {
  assert.ok(controlsDefined, "screen-emigration should be registered with Controls.define");
}

function testOpenEmigrationScreenNoThrow() {
  // Should not throw when ContextManager is unavailable
  try {
    openEmigrationScreen();
  } catch (e) {
    assert.fail(`openEmigrationScreen should not throw: ${e.message}`);
  }
}

function testCloseEmigrationScreenNoThrow() {
  // Should not throw even if ContextManager is unavailable
  try {
    closeEmigrationScreen();
  } catch (e) {
    assert.fail(`closeEmigrationScreen should not throw: ${e.message}`);
  }
}

function testInstallEmigrationConsoleAddsApi() {
  // Clean up any prior installation
  delete globalThis.emigration;
  
  installEmigrationConsole();
  assert.ok(typeof globalThis.emigration === "object", "emigration API should be added");
  assert.ok(typeof globalThis.emigration.window === "function", "emigration.window should be a function");
  assert.ok(typeof globalThis.emigration.closeWindow === "function", "emigration.closeWindow should be a function");
}

function testEmigrationConsoleWindowFunctionWorks() {
  delete globalThis.emigration;
  installEmigrationConsole();
  
  // Should not throw when calling the window function
  try {
    globalThis.emigration.window();
  } catch (e) {
    assert.fail(`emigration.window() should not throw: ${e.message}`);
  }
}

function testEmigrationConsoleCloseWindowFunctionWorks() {
  delete globalThis.emigration;
  installEmigrationConsole();
  
  // Should not throw when calling the closeWindow function
  try {
    globalThis.emigration.closeWindow();
  } catch (e) {
    assert.fail(`emigration.closeWindow() should not throw: ${e.message}`);
  }
}

testControlsDefinedWhenAvailable();
testOpenEmigrationScreenNoThrow();
testCloseEmigrationScreenNoThrow();
testInstallEmigrationConsoleAddsApi();
testEmigrationConsoleWindowFunctionWorks();
testEmigrationConsoleCloseWindowFunctionWorks();

delete globalThis.Panel;
delete globalThis.Controls;
delete globalThis.gatherDashboard;
delete globalThis.dashboardModel;
delete globalThis.renderDashboardTabbed;
delete globalThis.emigration;

console.log("screen-branches harness passed");
