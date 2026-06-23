// DOM stub for testing window/element manipulation without a browser.
// Provides mocks for window, document, localStorage, and DOM elements.

const storageData = {};

export const localStorage = {
  getItem(key) {
    return storageData[key] || null;
  },
  setItem(key, value) {
    storageData[key] = String(value);
  },
  removeItem(key) {
    delete storageData[key];
  },
  clear() {
    for (const k of Object.keys(storageData)) delete storageData[k];
  }
};

class MockElement {
  constructor(tagName = "div") {
    this.tagName = tagName;
    this.className = "";
    this.innerHTML = "";
    this.textContent = "";
    this.style = {};
    this.children = [];
    this.childNodes = [];
    this._scrollTop = 0;
    this._scrollHeight = 0;
    this._clientHeight = 0;
    this._listeners = {};
  }

  appendChild(child) {
    if (child) {
      this.children.push(child);
      this.childNodes.push(child);
    }
    return child;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx >= 0) this.children.splice(idx, 1);
    const nidx = this.childNodes.indexOf(child);
    if (nidx >= 0) this.childNodes.splice(nidx, 1);
    return child;
  }

  addEventListener(event, handler) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(handler);
  }

  removeEventListener(event, handler) {
    if (this._listeners[event]) {
      const idx = this._listeners[event].indexOf(handler);
      if (idx >= 0) this._listeners[event].splice(idx, 1);
    }
  }

  dispatchEvent(event) {
    if (this._listeners[event.type]) {
      for (const handler of this._listeners[event.type]) {
        handler(event);
      }
    }
    return true;
  }

  get scrollTop() {
    return this._scrollTop;
  }
  set scrollTop(val) {
    this._scrollTop = val;
  }

  get scrollHeight() {
    return this._scrollHeight;
  }
  set scrollHeight(val) {
    this._scrollHeight = val;
  }

  get clientHeight() {
    return this._clientHeight;
  }
  set clientHeight(val) {
    this._clientHeight = val;
  }
}

export const document = {
  createElement(tagName) {
    return new MockElement(tagName);
  },
  getElementById(id) {
    // Return a mock element for any ID lookup
    return new MockElement("div");
  },
  querySelector(selector) {
    return new MockElement("div");
  },
  querySelectorAll(selector) {
    return [];
  }
};

export const window = {
  localStorage,
  document,
  scrollY: 0,
  innerHeight: 768,
  innerWidth: 1024,
  addEventListener(event, handler) {
    // Stub for window event listeners
  },
  removeEventListener(event, handler) {
    // Stub for window event listeners
  },
  requestAnimationFrame(callback) {
    // Synchronous stub
    callback(0);
    return 0;
  },
  cancelAnimationFrame(id) {
    // Stub
  }
};

export default { MockElement, window, document, localStorage };
