/**
 * FileLoader batch load behavior with state flag and callbacks.
 */
import { describe, it, expect, vi } from 'vitest';
import { FileLoader } from '@/lib/components/player/wave-roll/file-loader';
import { StateManager } from '@/lib/core/state';

describe('FileLoader batch loading', () => {
  it('toggles isBatchLoading and invokes FileManager loaders + onComplete', async () => {
    const sm = new StateManager();
    const fm = {
      loadSampleFiles: vi.fn(async () => {}),
      loadSampleAudioFiles: vi.fn(async () => {}),
    } as any;
    const loader = new FileLoader(sm, fm);

    const onComplete = vi.fn();
    const files = [
      { path: 'a.mid', displayName: 'A', type: 'midi' as const },
      { path: 'b.wav', displayName: 'B', type: 'audio' as const },
    ];

    // Spy state updates
    const spyUpdate = vi.spyOn(sm, 'updateUIState');

    await loader.loadSampleFiles(files, { onComplete });

    // isBatchLoading toggled
    expect(spyUpdate).toHaveBeenCalledWith({ isBatchLoading: true });
    expect(spyUpdate).toHaveBeenCalledWith({ isBatchLoading: false });

    // FileManager calls
    expect(fm.loadSampleFiles).toHaveBeenCalledTimes(1);
    expect(fm.loadSampleAudioFiles).toHaveBeenCalledTimes(1);

    // Callback
    expect(onComplete).toHaveBeenCalled();
  });
});

