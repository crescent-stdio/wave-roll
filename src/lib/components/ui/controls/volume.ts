import { PLAYER_ICONS } from "@/assets/player-icons";
import { UIComponentDependencies } from "../types";

/**
 * Create a volume control element with vertical popup slider.
 *
 * @param dependencies - The UI component dependencies.
 * @returns The volume control element.
 */
export function createVolumeControlUI(
  dependencies: UIComponentDependencies
): HTMLElement {
  // Main container
  const container = document.createElement("div");
  container.style.cssText = `
    position: relative;
    display: inline-flex;
    align-items: center;
  `;

  // Volume icon button
  const iconBtn = document.createElement("button");
  iconBtn.innerHTML = PLAYER_ICONS.volume;
  iconBtn.style.cssText = `
    background: transparent;
    border: 1px solid var(--ui-border);
    padding: 0;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
    color: var(--text-muted);
  `;
  iconBtn.classList.add("wr-focusable");
  iconBtn.setAttribute("aria-label", "Master volume: 100%");
  iconBtn.title = "Master Volume";

  // Hover effect for button (consistent with other icon buttons)
  iconBtn.addEventListener("mouseenter", () => {
    iconBtn.style.transform = "translateY(-1px)";
    iconBtn.style.boxShadow = "0 2px 4px rgba(0, 0, 0, 0.1)";
  });
  iconBtn.addEventListener("mouseleave", () => {
    iconBtn.style.transform = "translateY(0)";
    iconBtn.style.boxShadow = "0 1px 2px rgba(0, 0, 0, 0.05)";
  });
  iconBtn.addEventListener("mousedown", () => {
    iconBtn.style.transform = "translateY(0) scale(0.96)";
  });
  iconBtn.addEventListener("mouseup", () => {
    iconBtn.style.transform = "translateY(-1px) scale(1)";
  });

  // Create slider container (popup)
  const sliderContainer = document.createElement("div");
  sliderContainer.style.cssText = `
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    margin-bottom: 4px;
    background: var(--surface);
    border: 1px solid var(--ui-border);
    border-radius: 8px;
    padding: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    display: none;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    z-index: 9999;
    width: 50px;
    height: 160px;
  `;

  // Master label
  const masterLabel = document.createElement("div");
  masterLabel.textContent = "Master";
  masterLabel.style.cssText = `
    font-size: 11px;
    font-weight: 600;
    color: var(--text-muted);
    margin-bottom: 4px;
    user-select: none;
  `;

  // Volume display
  const volumeDisplay = document.createElement("span");
  volumeDisplay.textContent = "100%";
  volumeDisplay.style.cssText = `
    font-size: 10px;
    color: var(--text-muted);
    font-weight: 600;
    user-select: none;
    margin-bottom: 4px;
  `;

  // Slider wrapper
  const sliderWrapper = document.createElement("div");
  sliderWrapper.style.cssText = `
    width: 24px;
    height: 80px;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  `;

  // Create vertical slider
  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "0";
  slider.max = "100";
  slider.value = "100";
  slider.setAttribute("aria-label", "Master volume slider");
  slider.setAttribute("aria-orientation", "vertical");
  slider.style.cssText = `
    width: 80px;
    height: 4px;
    transform: rotate(-90deg);
    transform-origin: center;
    position: absolute;
    cursor: pointer;
    -webkit-appearance: none;
    appearance: none;
    background: var(--ui-border);
    outline: none;
    border-radius: 2px;
  `;

  // Style the slider thumb
  const sliderId = `master-volume-slider-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  slider.className = sliderId;
  const style = document.createElement("style");
  style.textContent = `
    .${sliderId}::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 12px;
      height: 12px;
      background: #0d6efd;
      cursor: pointer;
      border-radius: 50%;
      border: 2px solid white;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
    }
    .${sliderId}::-moz-range-thumb {
      width: 12px;
      height: 12px;
      background: #0d6efd;
      cursor: pointer;
      border-radius: 50%;
      border: 2px solid white;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
    }
  `;
  document.head.appendChild(style);

  // Assemble slider container
  sliderWrapper.appendChild(slider);
  sliderContainer.appendChild(masterLabel);
  sliderContainer.appendChild(volumeDisplay);
  sliderContainer.appendChild(sliderWrapper);

  // Assemble main container
  container.appendChild(iconBtn);
  container.appendChild(sliderContainer);

  // State
  let currentVolume = 1.0;
  let lastNonZeroVolume = 1.0;
  let isSliderVisible = false;
  let hideTimeout: number | null = null;

  // Emit a single event for all per-file controls to mirror UI without engine writes
  function emitMasterMirror(
    mode: "mirror-mute" | "mirror-restore" | "mirror-set",
    volume?: number
  ): void {
    try {
      window.dispatchEvent(
        new CustomEvent("wr-master-mirror", { detail: { mode, volume } })
      );
    } catch {}
  }

  const updateSliderTrack = () => {
    const pct = currentVolume * 100;
    slider.style.background = `linear-gradient(to right, var(--accent) 0%, var(--accent) ${pct}%, var(--ui-border) ${pct}%, var(--ui-border) 100%)`;
  };

  const updateVolume = (vol: number) => {
    currentVolume = Math.max(0, Math.min(1, vol));

    // Apply to audio engine
    try {
      const anyPlayer = dependencies.audioPlayer as any;
      if (anyPlayer && typeof anyPlayer.masterVolume === "number") {
        anyPlayer.masterVolume = currentVolume;
      } else {
        dependencies.audioPlayer?.setVolume(currentVolume);
      }
    } catch {
      dependencies.audioPlayer?.setVolume(currentVolume);
    }

    // Update UI
    slider.value = String(currentVolume * 100);
    volumeDisplay.textContent = `${Math.round(currentVolume * 100)}%`;
    iconBtn.innerHTML =
      currentVolume === 0 ? PLAYER_ICONS.mute : PLAYER_ICONS.volume;
    iconBtn.style.color =
      currentVolume > 0 ? "var(--text-muted)" : "rgba(71,85,105,0.5)";
    iconBtn.setAttribute(
      "aria-label",
      `Master volume: ${Math.round(currentVolume * 100)}%`
    );
    updateSliderTrack();

    // Remember last audible volume
    if (currentVolume > 0) {
      lastNonZeroVolume = currentVolume;
    }

    // Sync master volume to SilenceDetector for auto-pause
    dependencies.silenceDetector?.setMasterVolume?.(currentVolume);

    // Mirror policy: when master becomes 0, emit event
    if (currentVolume === 0) {
      emitMasterMirror("mirror-mute");
    }
  };

  // Show/hide slider popup
  const showSlider = () => {
    if (hideTimeout !== null) {
      clearTimeout(hideTimeout);
      hideTimeout = null;
    }
    sliderContainer.style.display = "flex";
    isSliderVisible = true;
  };

  const hideSlider = () => {
    sliderContainer.style.display = "none";
    isSliderVisible = false;
  };

  const hideSliderDelayed = () => {
    if (hideTimeout !== null) {
      clearTimeout(hideTimeout);
    }
    hideTimeout = window.setTimeout(() => {
      hideSlider();
    }, 300);
  };

  // Event handlers for showing/hiding slider
  iconBtn.addEventListener("mouseenter", showSlider);
  iconBtn.addEventListener("focus", showSlider);
  sliderContainer.addEventListener("mouseenter", () => {
    if (hideTimeout !== null) {
      clearTimeout(hideTimeout);
      hideTimeout = null;
    }
  });
  sliderContainer.addEventListener("mouseleave", hideSliderDelayed);
  container.addEventListener("mouseleave", hideSliderDelayed);

  // Slider input
  slider.addEventListener("input", () => {
    updateVolume(parseFloat(slider.value) / 100);
  });

  // Initialize UI from engine masterVolume if available
  try {
    const anyPlayer = dependencies.audioPlayer as any;
    if (anyPlayer && typeof anyPlayer.masterVolume === "number") {
      const mv = anyPlayer.masterVolume as number;
      if (mv > 0) {
        lastNonZeroVolume = mv;
      }
      currentVolume = mv;
      updateVolume(mv);
    }
  } catch {}

  // Update initial track
  updateSliderTrack();

  // Reflect global all-silent state in master icon
  try {
    const updateIconVisual = (muted: boolean) => {
      iconBtn.innerHTML = muted ? PLAYER_ICONS.mute : PLAYER_ICONS.volume;
      iconBtn.style.color = muted ? "rgba(71,85,105,0.5)" : "var(--text-muted)";
    };
    const isMasterZero = (): boolean => {
      return currentVolume === 0;
    };
    const computeBothAllMuted = (): boolean => {
      try {
        const midiFiles = dependencies.midiManager?.getState?.()?.files || [];
        const api = (
          globalThis as unknown as {
            _waveRollAudio?: {
              getFiles?: () => Array<{ id: string; isMuted?: boolean }>;
            };
          }
        )._waveRollAudio;
        const wavs = api?.getFiles?.() || [];
        const midiAllMuted =
          midiFiles.length > 0 &&
          midiFiles.every((f: any) => f?.isMuted === true);
        const wavAllMuted =
          wavs.length > 0 && wavs.every((w: any) => w?.isMuted === true);
        return midiAllMuted && wavAllMuted;
      } catch {
        return false;
      }
    };
    // Initial icon state
    updateIconVisual(isMasterZero() || computeBothAllMuted());
    // Listen to silence changes
    window.addEventListener("wr-silence-changed", () => {
      const bothMuted = computeBothAllMuted();
      updateIconVisual(isMasterZero() || bothMuted);
      if (bothMuted) {
        if (currentVolume > 0) {
          lastNonZeroVolume = currentVolume;
          updateVolume(0);
        }
      }
    });
  } catch {}

  // Click on icon → toggle mute
  iconBtn.addEventListener("click", () => {
    if (currentVolume > 0) {
      lastNonZeroVolume = currentVolume;
      updateVolume(0);
      emitMasterMirror("mirror-mute");
    } else {
      const restore = lastNonZeroVolume > 0 ? lastNonZeroVolume : 1;
      updateVolume(restore);
      emitMasterMirror("mirror-restore");
    }
  });

  // Snapshot/restore of per-file states across master mute cycle
  let masterSnapshot: {
    midi: Record<string, { volume: number }>;
    wav: Record<string, { volume: number }>;
  } | null = null;

  window.addEventListener("wr-master-mirror", (e: Event) => {
    const detail = (
      e as CustomEvent<{
        mode: "mirror-mute" | "mirror-restore" | "mirror-set";
        volume?: number;
      }>
    ).detail;
    if (!detail || !detail.mode) return;
    if (detail.mode === "mirror-mute") {
      const snapMidi: Record<string, { volume: number }> = {};
      const midiNodes = Array.from(
        document.querySelectorAll('[data-role="file-volume"][data-file-id]')
      ) as any[];
      for (const node of midiNodes) {
        const id = node?.getAttribute?.("data-file-id");
        const inst = node?.__controlInstance;
        if (!id || !inst?.getLastNonZeroVolume) continue;
        const v = inst.getLastNonZeroVolume();
        const vol = typeof v === "number" ? Math.max(0, Math.min(1, v)) : 1;
        snapMidi[id] = { volume: vol };
      }
      const snapWav: Record<string, { volume: number }> = {};
      const wavNodes = Array.from(
        document.querySelectorAll('[data-role="wav-volume"][data-file-id]')
      ) as any[];
      for (const node of wavNodes) {
        const id = node?.getAttribute?.("data-file-id");
        const inst = node?.__controlInstance;
        if (!id || !inst?.getLastNonZeroVolume) continue;
        const v = inst.getLastNonZeroVolume();
        const vol = typeof v === "number" ? Math.max(0, Math.min(1, v)) : 1;
        snapWav[id] = { volume: vol };
      }
      masterSnapshot = { midi: snapMidi, wav: snapWav };
    } else if (detail.mode === "mirror-restore") {
      if (!masterSnapshot) return;
      const midiNodes = Array.from(
        document.querySelectorAll('[data-role="file-volume"][data-file-id]')
      ) as any[];
      for (const node of midiNodes) {
        const id = node?.getAttribute?.("data-file-id");
        const inst = node?.__controlInstance;
        const v = id && masterSnapshot.midi[id]?.volume;
        if (inst?.setVolume && typeof v === "number") inst.setVolume(v);
      }
      const wavNodes = Array.from(
        document.querySelectorAll('[data-role="wav-volume"][data-file-id]')
      ) as any[];
      for (const node of wavNodes) {
        const id = node?.getAttribute?.("data-file-id");
        const inst = node?.__controlInstance;
        const v = id && masterSnapshot.wav[id]?.volume;
        if (inst?.setVolume && typeof v === "number") inst.setVolume(v);
      }
    }
  });

  // Keyboard navigation
  container.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      hideSlider();
      iconBtn.focus();
    } else if (e.key === "ArrowUp" || e.key === "ArrowRight") {
      e.preventDefault();
      updateVolume(Math.min(1, currentVolume + 0.05));
    } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
      e.preventDefault();
      updateVolume(Math.max(0, currentVolume - 0.05));
    }
  });

  return container;
}
