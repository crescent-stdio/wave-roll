import { PLAYER_ICONS } from "@/assets/player-icons";
import { UIComponentDependencies } from "../types";

/**
 * Create a volume control element.
 *
 * @param dependencies - The UI component dependencies.
 * @returns The volume control element.
 */
export function createVolumeControlUI(
  dependencies: UIComponentDependencies
): HTMLElement {
  const container = document.createElement("div");
  container.style.cssText = `
      display: flex;
      align-items: center;
      gap: 10px;
      height: 48px;
      background: var(--panel-bg);
      padding: 4px 12px;
      border-radius: 8px;
      box-shadow: var(--shadow-sm);
    `;

  // Volume icon button
  const iconBtn = document.createElement("button");
  iconBtn.innerHTML = PLAYER_ICONS.volume;
  iconBtn.style.cssText = `
      width: 20px;
      height: 20px;
      padding: 0;
      border: none;
      background: none;
      color: var(--text-muted);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: color 0.2s ease;
    `;
  iconBtn.classList.add("wr-focusable");

  // Note: silence sync is registered after slider/updateVolume are defined below

  // Volume slider
  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "0";
  slider.max = "100";
  slider.value = "100";
  slider.style.cssText = `
      width: 70px;
      -webkit-appearance: none;
      appearance: none;
      height: 4px;
      background: var(--track-bg);
      border-radius: 8px;
      outline: none;
      cursor: pointer;
    `;
  slider.classList.add("wr-slider", "wr-focusable");

  // Volume input
  const input = document.createElement("input");
  input.type = "number";
  input.min = "0";
  input.max = "100";
  input.value = "100";
  input.style.cssText = `
      width: 52px;
      padding: 4px 6px;
      border: none;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      color: var(--accent);
      background: rgba(37, 99, 235, 0.10);
      text-align: center;
    `;
  input.classList.add("wr-focusable");

  // Volume control logic
  // Keep track of the last non-zero master volume so master unmute can restore it
  let lastNonZeroVolume = 1.0;

  // Emit a single event for all per-file controls to mirror UI without engine writes
  function emitMasterMirror(mode: 'mirror-mute' | 'mirror-restore' | 'mirror-set', volume?: number): void {
    try {
      window.dispatchEvent(new CustomEvent('wr-master-mirror', { detail: { mode, volume } }));
    } catch {}
  }

  const updateVolume = (percent: number) => {
    const vol = Math.max(0, Math.min(100, percent)) / 100;
    // Apply to audio engine (prefer v2 masterVolume property)
    try {
      const anyPlayer = dependencies.audioPlayer as any;
      if (anyPlayer && typeof anyPlayer.masterVolume === 'number') {
        anyPlayer.masterVolume = vol;
      } else {
        dependencies.audioPlayer?.setVolume(vol);
      }
    } catch {
    dependencies.audioPlayer?.setVolume(vol);
    }

    // Reflect in UI controls
    const percentStr = (vol * 100).toString();
    slider.value = percentStr;
    input.value = percentStr;

    // Update icon visual state
    iconBtn.innerHTML = vol === 0 ? PLAYER_ICONS.mute : PLAYER_ICONS.volume;

    // Remember last audible volume for unmute restoration
    if (vol > 0) {
      lastNonZeroVolume = vol;
    }

    // Sync master volume to SilenceDetector for auto-pause
    dependencies.silenceDetector?.setMasterVolume?.(vol);

    // Mirror policy: when master becomes 0, drop all per-file UI to 0 via event (no engine/file calls)
    if (vol === 0) {
      emitMasterMirror('mirror-mute');
    }
  };

  // Initialize UI from engine masterVolume if available
  try {
    const anyPlayer = dependencies.audioPlayer as any;
    if (anyPlayer && typeof anyPlayer.masterVolume === 'number') {
      const mv = anyPlayer.masterVolume as number;
      if (mv > 0) {
        lastNonZeroVolume = mv;
      }
      updateVolume(mv * 100);
    }
  } catch {}

  slider.addEventListener("input", () => {
    updateVolume(parseFloat(slider.value));
  });

  input.addEventListener("input", () => {
    updateVolume(parseFloat(input.value));
  });

  // Reflect global all-silent state in master icon, and if both WAV+MIDI are muted, set master to 0 (no auto-restore)
  try {
    const updateIconVisual = (muted: boolean) => {
      iconBtn.innerHTML = muted ? PLAYER_ICONS.mute : PLAYER_ICONS.volume;
      iconBtn.style.color = muted ? "rgba(71,85,105,0.5)" : "var(--text-muted)";
    };
    const isMasterZero = (): boolean => {
      try {
        const anyPlayer = dependencies.audioPlayer as any;
        if (anyPlayer && typeof anyPlayer.masterVolume === 'number') {
          return anyPlayer.masterVolume === 0;
        }
      } catch {}
      const current = Math.max(0, Math.min(100, parseFloat(slider.value))) / 100;
      return current === 0;
    };
    const computeBothAllMuted = (): boolean => {
      try {
        const midiFiles = dependencies.midiManager?.getState?.()?.files || [];
        const api = (globalThis as unknown as { _waveRollAudio?: { getFiles?: () => Array<{ id: string; isMuted?: boolean }> } })._waveRollAudio;
        const wavs = api?.getFiles?.() || [];
        const midiAllMuted = midiFiles.length > 0 && midiFiles.every((f: any) => f?.isMuted === true);
        const wavAllMuted = wavs.length > 0 && wavs.every((w: any) => w?.isMuted === true);
        return midiAllMuted && wavAllMuted;
      } catch {
        return false;
      }
    };
    // Initial icon state considers master 0 OR both muted
    updateIconVisual(isMasterZero() || computeBothAllMuted());
    // Listen to silence changes
    window.addEventListener('wr-silence-changed', () => {
      const bothMuted = computeBothAllMuted();
      // Icon is muted when master is zero OR both muted
      updateIconVisual(isMasterZero() || bothMuted);
      if (bothMuted) {
        const current = Math.max(0, Math.min(100, parseFloat(slider.value))) / 100;
        if (current > 0) {
          lastNonZeroVolume = current;
          updateVolume(0);
        }
      }
    });
  } catch {}

  // Single-click on the master volume icon → toggle master mute visually and mirror per-file UI only
  iconBtn.addEventListener("click", () => {
    const current = Math.max(0, Math.min(100, parseFloat(slider.value))) / 100;
    if (current > 0) {
      // Mute master and mirror all file controls to 0
      lastNonZeroVolume = current;
      updateVolume(0);
      emitMasterMirror('mirror-mute');
    } else {
      // Unmute master and restore all file controls from their last values
      const restore = lastNonZeroVolume > 0 ? lastNonZeroVolume : 1;
      updateVolume(restore * 100);
      emitMasterMirror('mirror-restore');
    }
  });

  // Snapshot/restore of per-file states across master mute cycle
  // Snapshot is logical: real engine/file states are left intact; we remember desired UI states
  let masterSnapshot: {
    midi: Record<string, { volume: number }>;
    wav: Record<string, { volume: number }>;
  } | null = null;

  window.addEventListener('wr-master-mirror', (e: Event) => {
    const detail = (e as CustomEvent<{ mode: 'mirror-mute' | 'mirror-restore' | 'mirror-set'; volume?: number }>).detail;
    if (!detail || !detail.mode) return;
    if (detail.mode === 'mirror-mute') {
      // Take snapshot from UI controls; do not change per-file UI
      const snapMidi: Record<string, { volume: number }> = {};
      const midiNodes = Array.from(document.querySelectorAll('[data-role="file-volume"][data-file-id]')) as any[];
      for (const node of midiNodes) {
        const id = node?.getAttribute?.('data-file-id');
        const inst = node?.__controlInstance;
        if (!id || !inst?.getLastNonZeroVolume) continue;
        const v = inst.getLastNonZeroVolume();
        const vol = typeof v === 'number' ? Math.max(0, Math.min(1, v)) : 1;
        snapMidi[id] = { volume: vol };
      }
      const snapWav: Record<string, { volume: number }> = {};
      const wavNodes = Array.from(document.querySelectorAll('[data-role="wav-volume"][data-file-id]')) as any[];
      for (const node of wavNodes) {
        const id = node?.getAttribute?.('data-file-id');
        const inst = node?.__controlInstance;
        if (!id || !inst?.getLastNonZeroVolume) continue;
        const v = inst.getLastNonZeroVolume();
        const vol = typeof v === 'number' ? Math.max(0, Math.min(1, v)) : 1;
        snapWav[id] = { volume: vol };
      }
      masterSnapshot = { midi: snapMidi, wav: snapWav };
    } else if (detail.mode === 'mirror-restore') {
      // Restore snapshot to UI controls with previous volume values
      if (!masterSnapshot) return;
      const midiNodes = Array.from(document.querySelectorAll('[data-role="file-volume"][data-file-id]')) as any[];
      for (const node of midiNodes) {
        const id = node?.getAttribute?.('data-file-id');
        const inst = node?.__controlInstance;
        const v = id && masterSnapshot.midi[id]?.volume;
        if (inst?.setVolume && typeof v === 'number') inst.setVolume(v);
      }
      const wavNodes = Array.from(document.querySelectorAll('[data-role="wav-volume"][data-file-id]')) as any[];
      for (const node of wavNodes) {
        const id = node?.getAttribute?.('data-file-id');
        const inst = node?.__controlInstance;
        const v = id && masterSnapshot.wav[id]?.volume;
        if (inst?.setVolume && typeof v === 'number') inst.setVolume(v);
      }
    }
  });

  container.appendChild(iconBtn);
  container.appendChild(slider);
  container.appendChild(input);

  return container;
}
