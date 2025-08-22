import { generateAudioFileId } from "@/lib/core/utils/id";

interface RegisteredAudio {
  id: string;
  displayName: string;
  url: string;
  color: number;
  isVisible: boolean;
  isMuted: boolean;
  pan: number;
  audioBuffer?: AudioBuffer;
  peaks?: { min: number[]; max: number[] };
}

function ensureAPI(): any {
  const w = window as any;
  if (!w._waveRollAudio) {
    const store: { items: RegisteredAudio[] } = { items: [] };

    const api = {
      getFiles(): RegisteredAudio[] {
        return store.items.slice();
      },
      getVisiblePeaks(): Array<{ time: number; min: number; max: number; color: number }> {
        const out: Array<{ time: number; min: number; max: number; color: number }> = [];
        for (const a of store.items) {
          if (!a.isVisible || !a.peaks || !a.audioBuffer) continue;
          const { min, max } = a.peaks;
          const duration = a.audioBuffer.duration;
          for (let i = 0; i < max.length; i++) {
            const time = (i / max.length) * duration;
            out.push({ time, min: min[i], max: max[i], color: a.color });
          }
        }
        return out;
      },
      sampleAtTime(time: number): { min: number; max: number; color: number } | null {
        // Return the max of all visible audio tracks at this time
        let result: { min: number; max: number; color: number } | null = null;
        for (const a of store.items) {
          if (!a.isVisible || !a.peaks || !a.audioBuffer) continue;
          const duration = a.audioBuffer.duration;
          if (duration <= 0) continue;
          const idx = Math.max(0, Math.min(a.peaks.max.length - 1, Math.floor((time / duration) * a.peaks.max.length)));
          const v = {
            min: a.peaks.min[idx],
            max: a.peaks.max[idx],
            color: a.color,
          };
          if (!result || v.max > result.max) {
            result = v;
          }
        }
        return result;
      },
      toggleVisibility(id: string): void {
        const a = store.items.find((x) => x.id === id);
        if (a) a.isVisible = !a.isVisible;
      },
      toggleMute(id: string): void {
        const a = store.items.find((x) => x.id === id);
        if (a) a.isMuted = !a.isMuted;
      },
      setPan(id: string, pan: number): void {
        const a = store.items.find((x) => x.id === id);
        if (a) a.pan = Math.max(-1, Math.min(1, pan));
      },
      _store: store,
    };

    w._waveRollAudio = api;
  }
  return (window as any)._waveRollAudio;
}

export async function addAudioFileFromUrl(
  _fileManager: any,
  url: string,
  displayName?: string,
  color?: number
): Promise<string> {
  const api = ensureAPI();
  const id = generateAudioFileId();
  const entry: RegisteredAudio = {
    id,
    displayName: displayName || url.split("/").pop() || "Audio",
    url,
    color: color ?? 0x10b981,
    isVisible: true,
    isMuted: false,
    pan: 0,
  };
  api._store.items.push(entry);

  // Decode audio and compute peaks lazily
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const resp = await fetch(url);
    const arr = await resp.arrayBuffer();
    const buf = await ctx.decodeAudioData(arr);
    entry.audioBuffer = buf;
    // lightweight peak extraction (match granularity to width * 2)
    const target = Math.min(4000, Math.max(1000, Math.floor(buf.duration * 200)));
    const { getPeaksFromAudioBuffer } = await import("@/lib/core/waveform/peaks");
    entry.peaks = getPeaksFromAudioBuffer(buf, target);
  } catch (e) {
    // keep registered without peaks if decoding fails
    console.warn("Audio decode failed", e);
  }

  return id;
}


