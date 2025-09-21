import { describe, it, expect, vi, beforeEach } from 'vitest';

// Minimal HTMLElement stub compatible with src/web-component.ts
class FakeHTMLElement {
  public style: Record<string, any> = {};
  public innerHTML = '';
  public shadowRoot: any = null;
  private attrs = new Map<string, string>();
  setAttribute(name: string, value: string) { this.attrs.set(name, String(value)); }
  getAttribute(name: string) { return this.attrs.get(name) ?? null; }
  hasAttribute(name: string) { return this.attrs.has(name); }
  removeAttribute(name: string) { this.attrs.delete(name); }
  attachShadow(_init: { mode: 'open' | 'closed' }) {
    const root: any = {
      innerHTML: '',
      appendChild: (_: any) => {},
    };
    this.shadowRoot = root;
    return root;
  }
  dispatchEvent(_e: Event) { return true; }
  // Lifecycle placeholders used by custom elements
  connectedCallback?(): void;
  disconnectedCallback?(): void;
}

// Minimal customElements registry stub
function installCustomElementsStub() {
  const registry = new Map<string, any>();
  (globalThis as any).customElements = {
    define: (name: string, ctor: any) => { registry.set(name, ctor); },
    get: (name: string) => registry.get(name),
  };
  return registry;
}

// Provide HTMLElement global
(globalThis as any).HTMLElement = FakeHTMLElement as any;

// Minimal document and Event stubs for Node environment
function installDomStubs() {
  (globalThis as any).document = {
    createElement: (tag: string) => {
      if (tag === 'style') {
        return { textContent: '' } as any;
      }
      return { className: '', style: {}, appendChild: (_: any) => {}, innerHTML: '' } as any;
    },
  } as any;
  (globalThis as any).Event = class {
    type: string;
    constructor(type: string) { this.type = type; }
  } as any;
}

describe('<wave-roll readonly> behavior', () => {
  let registry: Map<string, any>;

  beforeEach(() => {
    registry = installCustomElementsStub();
    installDomStubs();
    vi.resetModules();
  });

  it('applies readonly by calling player.setPermissions(false, false)', async () => {
    const setPermissions = vi.fn();
    vi.mock('@/lib/components/player/wave-roll/player', () => {
      return {
        createWaveRollPlayer: vi.fn(async (_container: any, _files: any) => ({
          destroy: vi.fn(),
          play: vi.fn(),
          pause: vi.fn(),
          seek: vi.fn(),
          getState: vi.fn(() => ({})),
          setPermissions,
        })),
      };
    });

    const { WaveRollElement } = await import('@/web-component');
    const el: any = new (WaveRollElement as any)();
    // Set readonly before connecting so initializePlayer applies it after creation
    el.setAttribute('readonly', '');
    el.connectedCallback?.();
    await Promise.resolve();

    expect(setPermissions).toHaveBeenCalled();
    const last = setPermissions.mock.calls[setPermissions.mock.calls.length - 1]?.[0];
    expect(last).toEqual({ canAddFiles: false, canRemoveFiles: false });
  });
});


