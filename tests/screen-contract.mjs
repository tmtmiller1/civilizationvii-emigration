import assert from "node:assert/strict";

const dq = await import("/core/ui/context-manager/display-queue-manager.js");
const settings = await import("/emigration/ui/emigration-settings.js");

function installControlsMock() {
  const defined = [];
  const decorated = [];
  globalThis.Controls = {
    define: (id, spec) => defined.push({ id, spec }),
    decorate: (target, factory) => decorated.push({ target, factory })
  };
  return { defined, decorated };
}

function flushMicrotasks() {
  return new Promise((resolve) => setImmediate(resolve));
}

async function waitFor(predicate, timeoutMs = 250) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return false;
}

const controls = installControlsMock();
const {
  openEmigrationScreen,
  closeEmigrationScreen,
  installEmigrationConsole
} = await import("/emigration/ui/emigration-screen.js");
const {
  installEmigrationDock,
  EmigrationDockDecorator
} = await import("/emigration/ui/emigration-dock-decorator.js");

function testScreenRegistersWithControlsDefine() {
  const hasRegistration = controls.defined.some((d) => d.id === "screen-emigration");
  assert.equal(hasRegistration, true, "screen definition must be registered when Controls.define exists");
}

async function testOpenCloseUseContextManagerWhenAvailable() {
  const pushes = [];
  const pops = [];
  globalThis.__coreStubContextManager = {
    push: (...args) => pushes.push(args),
    pop: (...args) => pops.push(args)
  };

  openEmigrationScreen();
  await waitFor(() => pushes.length === 1);
  assert.equal(pushes.length, 1, "open should push a screen context");
  assert.equal(pushes[0][0], "screen-emigration");

  closeEmigrationScreen();
  await waitFor(() => pops.length === 1);
  assert.equal(pops.length, 1, "close should pop a screen context");
  assert.equal(pops[0][0], "screen-emigration");
}

async function testOpenCloseDoNotThrowWhenContextManagerMissingMethods() {
  globalThis.__coreStubContextManager = {};
  await assert.doesNotReject(async () => {
    openEmigrationScreen();
    await flushMicrotasks();
    closeEmigrationScreen();
    await flushMicrotasks();
  });
}

function testInstallConsoleAddsApiMethods() {
  delete globalThis.emigration;
  installEmigrationConsole();
  assert.equal(typeof globalThis.emigration.window, "function");
  assert.equal(typeof globalThis.emigration.closeWindow, "function");
}

function testInstallDockRegistersDecorator() {
  const before = controls.decorated.length;
  installEmigrationDock();
  assert.equal(controls.decorated.length, before + 1, "dock decorator should register exactly once per call");
  assert.equal(controls.decorated[controls.decorated.length - 1].target, "panel-sub-system-dock");
}

function testDockDecoratorDefensiveWithMissingAddButton() {
  const dec = new EmigrationDockDecorator({});
  assert.doesNotThrow(() => dec._addDockButton());
}

async function testPanelLifecycleSuspendsAndResumesPopups() {
  const spec = controls.defined.find((d) => d.id === "screen-emigration");
  assert.ok(spec && spec.spec && typeof spec.spec.createInstance === "function");

  const btn = {
    _handler: null,
    addEventListener(name, handler) {
      if (name === "action-activate") this._handler = handler;
    }
  };
  const host = {};

  const panel = new spec.spec.createInstance();
  panel.Root = {
    setAttribute(name, value) {
      this.last = { name, value };
    },
    querySelector(selector) {
      if (selector === "[data-ia-close]") return btn;
      if (selector === ".emig-screen-host") return host;
      return null;
    }
  };

  panel.onInitialize();
  assert.equal(panel.enableOpenSound, true);
  assert.equal(panel.enableCloseSound, true);

  dq.default.resume();
  panel.onAttach();
  await waitFor(() => dq.default.isSuspended());
  assert.equal(dq.default.isSuspended(), true, "attach should suspend display queue");

  let closeCalls = 0;
  panel.close = () => {
    closeCalls++;
  };
  assert.equal(typeof btn._handler, "function");
  btn._handler();
  assert.equal(closeCalls, 1, "wired close button should invoke panel.close");

  panel.onDetach();
  await waitFor(() => !dq.default.isSuspended());
  assert.equal(dq.default.isSuspended(), false, "detach should resume queue when panel owns suspension");
}

async function testPanelDoesNotResumeExternalSuspension() {
  const spec = controls.defined.find((d) => d.id === "screen-emigration");
  const panel = new spec.spec.createInstance();
  panel.Root = {
    querySelector() {
      return null;
    },
    setAttribute() {}
  };

  dq.default.suspend();
  panel.onAttach();
  await flushMicrotasks();
  panel.onDetach();
  await flushMicrotasks();
  assert.equal(dq.default.isSuspended(), true, "panel should not resume queue it did not suspend");
  dq.default.resume();
}

function testDockAfterAttachAddsButtonAndHonorsToggle() {
  globalThis.localStorage = {
    _m: {},
    getItem(k) {
      return this._m[k] ?? null;
    },
    setItem(k, v) {
      this._m[k] = String(v);
    }
  };

  const headChildren = [];
  globalThis.document = {
    head: {
      appendChild(node) {
        headChildren.push(node);
      }
    },
    createElement() {
      return { id: "", textContent: "" };
    },
    getElementById(id) {
      return headChildren.find((n) => n.id === id) || null;
    }
  };

  settings.setShowDockButton(true);
  let addCalls = 0;
  const dec = new EmigrationDockDecorator({
    addButton(opts) {
      addCalls++;
      assert.equal(opts.modifierClass, "emigration");
      assert.equal(typeof opts.callback, "function");
    }
  });
  dec.afterAttach();
  assert.equal(addCalls, 1);
  assert.equal(headChildren.length, 1, "icon style should be injected once");

  settings.setShowDockButton(false);
  const decDisabled = new EmigrationDockDecorator({ addButton() { addCalls++; } });
  decDisabled.afterAttach();
  assert.equal(addCalls, 1, "disabled option should skip addButton");

  delete globalThis.document;
  delete globalThis.localStorage;
}

function testInstallDockNoopsWithoutControlsOrOnThrow() {
  const priorControls = globalThis.Controls;
  delete globalThis.Controls;
  assert.doesNotThrow(() => installEmigrationDock());

  globalThis.Controls = {
    decorate() {
      throw new Error("decorate failed");
    }
  };
  assert.doesNotThrow(() => installEmigrationDock());
  globalThis.Controls = priorControls;
}

testScreenRegistersWithControlsDefine();
await testOpenCloseUseContextManagerWhenAvailable();
await testOpenCloseDoNotThrowWhenContextManagerMissingMethods();
testInstallConsoleAddsApiMethods();
testInstallDockRegistersDecorator();
testDockDecoratorDefensiveWithMissingAddButton();
await testPanelLifecycleSuspendsAndResumesPopups();
await testPanelDoesNotResumeExternalSuspension();
testDockAfterAttachAddsButtonAndHonorsToggle();
testInstallDockNoopsWithoutControlsOrOnThrow();

delete globalThis.__coreStubContextManager;

console.log("screen-contract harness passed");
