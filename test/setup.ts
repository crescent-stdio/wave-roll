// Minimal browser API polyfills for Vitest (node environment)
// This avoids adding a full DOM for tests that don't require it.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const globalAny = globalThis as any;

// Provide a window object with basic event methods
if (!globalAny.window) {
  globalAny.window = globalAny;
}

if (typeof globalAny.window.addEventListener !== 'function') {
  const listeners = new Map<string, Set<(evt: unknown) => void>>();
  globalAny.window.addEventListener = (type: string, cb: (evt: unknown) => void) => {
    const set = listeners.get(type) ?? new Set();
    set.add(cb);
    listeners.set(type, set);
  };
  globalAny.window.removeEventListener = (type: string, cb: (evt: unknown) => void) => {
    const set = listeners.get(type);
    if (set) {
      set.delete(cb);
    }
  };
  globalAny.window.dispatchEvent = (evt: { type: string; detail?: unknown }) => {
    const set = listeners.get(evt?.type);
    if (set) {
      for (const fn of set) {
        try { fn(evt); } catch {}
      }
    }
    return true;
  };
}

// Minimal Event/CustomEvent shims
if (typeof globalAny.Event !== 'function') {
  class BasicEvent {
    type: string;
    constructor(type: string) { this.type = type; }
  }
  globalAny.Event = BasicEvent;
}

if (typeof globalAny.CustomEvent !== 'function') {
  class BasicCustomEvent<T = unknown> extends globalAny.Event {
    detail: T | undefined;
    constructor(type: string, init?: { detail?: T }) {
      super(type);
      this.detail = init?.detail;
    }
  }
  globalAny.CustomEvent = BasicCustomEvent;
}

// requestAnimationFrame polyfill
if (typeof globalAny.requestAnimationFrame !== 'function') {
  globalAny.requestAnimationFrame = (cb: (t: number) => void) => setTimeout(() => cb(Date.now()), 16);
}
if (typeof globalAny.cancelAnimationFrame !== 'function') {
  globalAny.cancelAnimationFrame = (id: ReturnType<typeof setTimeout>) => clearTimeout(id);
}

// Pointer Events polyfills used by seek-bar tests in jsdom
try {
  const ElementRef = globalAny.Element as undefined | { prototype: any };
  if (ElementRef && ElementRef.prototype) {
    if (typeof ElementRef.prototype.setPointerCapture !== 'function') {
      ElementRef.prototype.setPointerCapture = function () { /* no-op */ };
    }
    if (typeof ElementRef.prototype.releasePointerCapture !== 'function') {
      ElementRef.prototype.releasePointerCapture = function () { /* no-op */ };
    }
  }
} catch {}


