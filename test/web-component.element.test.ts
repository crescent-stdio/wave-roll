/**
 * Web Component (<wave-roll>) registration and init wiring.
 *
 * We avoid jsdom by stubbing minimal DOM APIs and mocking the heavy player factory.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Minimal HTMLElement stub compatible with src/web-component.ts
class FakeHTMLElement {
  public style: Record<string, any> = {};
  public innerHTML = '';
  public shadowRoot: any = null;
  private attrs = new Map<string, string>();
  setAttribute(name: string, value: string) { this.attrs.set(name, String(value)); }
  getAttribute(name: string) { return this.attrs.get(name) ?? null; }
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
      return { className: '' } as any;
    },
  } as any;
  (globalThis as any).Event = class {
    type: string;
    constructor(type: string) { this.type = type; }
  } as any;
}

// Mock heavy player factory to avoid pulling in full engine
vi.mock('@/lib/components/player/wave-roll/player', () => {
  return {
    createWaveRollPlayer: vi.fn(async (_container: any, _files: any) => ({
      destroy: vi.fn(),
      play: vi.fn(),
      pause: vi.fn(),
      seek: vi.fn(),
      getState: vi.fn(() => ({})),
    })),
  };
});

describe('<wave-roll> element', () => {
  let registry: Map<string, any>;

  beforeEach(() => {
    registry = installCustomElementsStub();
    installDomStubs();
    vi.resetModules();
  });

  it('registers the custom element on import', async () => {
    await import('@/web-component');
    expect((globalThis as any).customElements.get('wave-roll')).toBeTruthy();
  });

  it('initializes player when files JSON is provided', async () => {
    const playerMod = await import('@/lib/components/player/wave-roll/player');
    const { WaveRollElement } = await import('@/web-component');
    const el: any = new (WaveRollElement as any)();
    const files = [ { path: 'a.mid', displayName: 'A', type: 'midi' } ];
    el.setAttribute('files', JSON.stringify(files));
    // Simulate connection
    el.connectedCallback?.();
    // Allow microtasks in initialisePlayer
    await Promise.resolve();
    expect((playerMod as any).createWaveRollPlayer).toHaveBeenCalled();
  });

  it('maps name to internal structure', async () => {
    const playerMod = await import('@/lib/components/player/wave-roll/player');
    const { WaveRollElement } = await import('@/web-component');
    const el: any = new (WaveRollElement as any)();
    const files = [ { path: 'b.mid', name: 'LabelB', type: 'midi' } ];
    el.setAttribute('files', JSON.stringify(files));
    el.connectedCallback?.();
    await Promise.resolve();
    // Inspect the call arguments to ensure mapping occurred
    const calls = (playerMod as any).createWaveRollPlayer.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const args = calls[calls.length - 1];
    const normalized = args[1];
    expect(normalized[0].name).toBe('LabelB');
  });

  it('handles file with name property correctly', async () => {
    const playerMod = await import('@/lib/components/player/wave-roll/player');
    const { WaveRollElement } = await import('@/web-component');
    const el: any = new (WaveRollElement as any)();
    // Test file with name
    const files = [ { path: 'c.mid', name: 'FileName', type: 'midi' } ];
    el.setAttribute('files', JSON.stringify(files));
    el.connectedCallback?.();
    await Promise.resolve();
    // Inspect the call arguments to ensure name is handled correctly
    const calls = (playerMod as any).createWaveRollPlayer.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const args = calls[calls.length - 1];
    const normalized = args[1];
    expect(normalized[0].name).toBe('FileName');
  });

  it('uses provided name when available', async () => {
    const playerMod = await import('@/lib/components/player/wave-roll/player');
    const { WaveRollElement } = await import('@/web-component');
    const el: any = new (WaveRollElement as any)();
    // Test file with name
    const files = [ { path: 'd.mid', name: 'ProvidedName', type: 'midi' } ];
    el.setAttribute('files', JSON.stringify(files));
    el.connectedCallback?.();
    await Promise.resolve();
    // Inspect the call arguments to ensure name is passed through
    const calls = (playerMod as any).createWaveRollPlayer.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const args = calls[calls.length - 1];
    const normalized = args[1];
    expect(normalized[0].name).toBe('ProvidedName');
  });

  it('handles file without name property', async () => {
    const playerMod = await import('@/lib/components/player/wave-roll/player');
    const { WaveRollElement } = await import('@/web-component');
    const el: any = new (WaveRollElement as any)();
    // Test file with only path
    const files = [ { path: 'test-file.mid', type: 'midi' } ];
    el.setAttribute('files', JSON.stringify(files));
    el.connectedCallback?.();
    await Promise.resolve();
    // Inspect the call arguments to ensure filename is used as final fallback
    const calls = (playerMod as any).createWaveRollPlayer.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const args = calls[calls.length - 1];
    const normalized = args[1];
    // Should be undefined since no name was provided
    expect(normalized[0].name).toBeUndefined();
  });
});
