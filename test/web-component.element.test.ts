/**
 * Web Component (<wave-roll>) registration and init wiring.
 *
 * We avoid jsdom by stubbing minimal DOM APIs and mocking the heavy player factory.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Minimal HTMLElement stub
class FakeHTMLElement {
  public style: Record<string, any> = {};
  public innerHTML = '';
  private attrs = new Map<string, string>();
  setAttribute(name: string, value: string) { this.attrs.set(name, String(value)); }
  getAttribute(name: string) { return this.attrs.get(name) ?? null; }
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

// We will spy on the module-local createWaveRollPlayer exported by element.ts

describe('<wave-roll> element', () => {
  let registry: Map<string, any>;

  beforeEach(() => {
    registry = installCustomElementsStub();
  });

  it('registers the custom element on import', async () => {
    // Import after installing stubs so module sees them
    await import('@/lib/components/player/wave-roll/element');
    expect((globalThis as any).customElements.get('wave-roll')).toBeTruthy();
  });

  it('parses files attribute (JSON) into structured list', async () => {
    const mod = await import('@/lib/components/player/wave-roll/element');
    const el: any = new (mod as any).WaveRollElement();
    const files = [
      { path: 'a.mid', displayName: 'A', type: 'midi' },
      { path: 'b.wav', displayName: 'B', type: 'audio' },
    ];
    const parsed = (el as any).parseFilesAttribute(JSON.stringify(files));
    expect(parsed).toEqual(files);
  });

  it('parses files attribute (CSV) and infers types', async () => {
    const mod = await import('@/lib/components/player/wave-roll/element');
    const el: any = new (mod as any).WaveRollElement();
    const parsed = (el as any).parseFilesAttribute('x.mid|X, y.mp3|Y');
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({ path: 'x.mid', displayName: 'X', type: 'midi' });
    expect(parsed[1]).toMatchObject({ path: 'y.mp3', displayName: 'Y', type: 'audio' });
  });
});
