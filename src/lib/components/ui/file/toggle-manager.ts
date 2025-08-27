import { PLAYER_ICONS } from "@/assets/player-icons";
import { MidiFileEntry } from "@/lib/core/midi";

import { UIComponentDependencies } from "@/lib/components/ui";
import { createIconButton } from "../utils/icon-button";
import { FileVolumeControl } from "../controls/file-volume";

/**
 * Manages file visibility and per-file audio controls.
 */
export class FileToggleManager {
  static setupFileToggleSection(
    playerContainer: HTMLElement,
    dependencies: UIComponentDependencies
  ): HTMLElement {
    const fileToggleContainer = document.createElement("div");
    fileToggleContainer.setAttribute("data-role", "file-toggle");
    fileToggleContainer.style.cssText = `
      background: #f8f9fa;
      padding: 12px;
      border-radius: 8px;
      margin-top: 12px;
    `;

    // Title and settings button container
    const headerContainer = document.createElement("div");
    headerContainer.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
    `;

    // Title (general section header, not specific to MIDI or WAV)
    const title = document.createElement("h4");
    title.textContent = "Files";
    title.style.cssText = `
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      color: #495057;
    `;

    // MIDI Settings button and Evaluation Results button
    const btnBar = document.createElement("div");
    btnBar.style.cssText = `
      display: flex;
      align-items: center;
      gap: 6px;
    `;

    const midiSettingsBtn = document.createElement("button");
    midiSettingsBtn.innerHTML = `${PLAYER_ICONS.file} <span>Settings</span>`;
    midiSettingsBtn.style.cssText = `
      padding: 4px 8px;
      border: none;
      border-radius: 4px;
      background: #e9ecef;
      color: #495057;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 4px;
      transition: all 0.2s ease;
    `;
    midiSettingsBtn.addEventListener("mouseenter", () => {
      midiSettingsBtn.style.background = "#dee2e6";
    });
    midiSettingsBtn.addEventListener("mouseleave", () => {
      midiSettingsBtn.style.background = "#e9ecef";
    });
    midiSettingsBtn.addEventListener("click", () => {
      dependencies.openSettingsModal();
    });

    const evalResultsBtn = document.createElement("button");
    evalResultsBtn.innerHTML = `${(PLAYER_ICONS as any).results ?? ""} <span>Evaluation Results</span>`;
    evalResultsBtn.style.cssText = `
      padding: 4px 8px;
      border: none;
      border-radius: 4px;
      background: #e9ecef;
      color: #495057;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 4px;
      transition: all 0.2s ease;
    `;
    evalResultsBtn.addEventListener("mouseenter", () => {
      evalResultsBtn.style.background = "#dee2e6";
    });
    evalResultsBtn.addEventListener("mouseleave", () => {
      evalResultsBtn.style.background = "#e9ecef";
    });
    evalResultsBtn.addEventListener("click", () => {
      (dependencies as any).openEvaluationResultsModal?.();
    });

    btnBar.appendChild(midiSettingsBtn);
    btnBar.appendChild(evalResultsBtn);

    headerContainer.appendChild(title);
    headerContainer.appendChild(btnBar);
    fileToggleContainer.appendChild(headerContainer);

    // --- WAV/MP3 section header ---
    const audioHeader = document.createElement("h4");
    audioHeader.textContent = "WAV Files";
    audioHeader.style.cssText = `
      margin: 12px 0 8px 0;
      font-size: 14px;
      font-weight: 600;
      color: #495057;
    `;
    audioHeader.id = "audio-header";
    fileToggleContainer.appendChild(audioHeader);

    // Audio controls container
    const audioControlsContainer = document.createElement("div");
    audioControlsContainer.id = "audio-controls";
    audioControlsContainer.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 8px;
    `;
    fileToggleContainer.appendChild(audioControlsContainer);

    // Insert explicit MIDI section header after WAV section
    const midiHeader = document.createElement("h4");
    midiHeader.textContent = "MIDI Files";
    midiHeader.style.cssText = `
      margin: 12px 0 8px 0;
      font-size: 14px;
      font-weight: 600;
      color: #495057;
    `;
    midiHeader.id = "midi-header";
    fileToggleContainer.appendChild(midiHeader);

    // File controls container (MIDI) - placed after WAV section
    const fileControlsContainer = document.createElement("div");
    fileControlsContainer.id = "file-controls";
    fileControlsContainer.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 8px;
    `;
    fileToggleContainer.appendChild(fileControlsContainer);

    playerContainer.appendChild(fileToggleContainer);
    return fileToggleContainer;
  }

  static updateFileToggleSection(
    fileToggleContainer: HTMLElement,
    dependencies: UIComponentDependencies
  ): void {
    const fileControls = fileToggleContainer.querySelector("#file-controls");
    if (!fileControls) return;

    fileControls.innerHTML = "";
    const state = dependencies.midiManager.getState();

    // --- Show/Hide headers based on availability ---
    const audioHeader = fileToggleContainer.querySelector(
      "#audio-header"
    ) as HTMLElement | null;
    const midiHeader = fileToggleContainer.querySelector(
      "#midi-header"
    ) as HTMLElement | null;
    const audioControls = fileToggleContainer.querySelector(
      "#audio-controls"
    ) as HTMLElement | null;

    // Determine counts
    const midiCount = state.files.length;
    const audioList = (window as any)._waveRollAudio?.getFiles?.() ?? [];
    const audioCount = Array.isArray(audioList) ? audioList.length : 0;

    if (audioHeader) {
      audioHeader.style.display = audioCount > 0 ? "" : "none";
    }
    if (audioControls) {
      audioControls.style.display = audioCount > 0 ? "" : "none";
    }
    if (midiHeader) {
      midiHeader.style.display = midiCount > 0 ? "" : "none";
    }

    // Ensure default reference file: if files exist and no ref is set,
    // activate the top-most file as the reference for eval-* highlights.
    const evalState = dependencies.stateManager.getState().evaluation;
    const files = state.files;
    const currentRef = evalState.refId;
    const refStillExists = currentRef
      ? files.some((f) => f.id === currentRef)
      : false;
    if (!currentRef && files.length > 0) {
      dependencies.stateManager.updateEvaluationState({ refId: files[0].id });
    } else if (currentRef && !refStillExists) {
      dependencies.stateManager.updateEvaluationState({
        refId: files.length > 0 ? files[0].id : null,
      });
    }

    // Ensure default estimated files: if none selected and multiple files exist,
    // auto-select the first non-ref file.
    const latestEval = dependencies.stateManager.getState().evaluation;
    if (latestEval.estIds.length === 0 && files.length > 1) {
      const refCandidate = latestEval.refId ?? files[0].id;
      const defaultEst = files.find((f) => f.id !== refCandidate);
      if (defaultEst) {
        dependencies.stateManager.updateEvaluationState({
          estIds: [defaultEst.id],
        });
      }
    }

    // Sanitize: ensure refId is not inside estIds
    {
      const sEval = dependencies.stateManager.getState().evaluation;
      if (sEval.refId && sEval.estIds.includes(sEval.refId)) {
        const filtered = sEval.estIds.filter((id) => id !== sEval.refId);
        dependencies.stateManager.updateEvaluationState({ estIds: filtered });
      }
    }

    state.files.forEach((file: MidiFileEntry) => {
      const fileControl = this.createFileToggleItem(file, dependencies);
      fileControls.appendChild(fileControl);
    });

    // Audio controls refresh
    if (audioControls) {
      audioControls.innerHTML = "";
      for (const a of audioList) {
        audioControls.appendChild(this.createAudioToggleItem(a, dependencies));
      }
    }
  }

  static createFileToggleItem(
    file: MidiFileEntry,
    dependencies: UIComponentDependencies
  ): HTMLElement {
    const item = document.createElement("div");
    item.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 8px;
      background: #f8f9fa;
      border-radius: 6px;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
      border: 1px solid #dee2e6;
    `;

    // Color indicator
    const colorIndicator = document.createElement("div");
    colorIndicator.style.cssText = `
      width: 12px;
      height: 12px;
      background: #${file.color.toString(16).padStart(6, "0")};
    `;

    // File name
    const fileName = document.createElement("span");
    fileName.textContent = file.displayName;
    fileName.style.cssText = `
      flex: 1;
      font-size: 14px;
      color: ${file.isPianoRollVisible ? "#343a40" : "#6c757d"};
    `;

    // Visibility toggle with eye icon (reusable button)
    const visBtn = createIconButton(
      file.isPianoRollVisible ? PLAYER_ICONS.eye_open : PLAYER_ICONS.eye_closed,
      () => dependencies.midiManager.toggleVisibility(file.id),
      "Toggle visibility",
      { size: 24 }
    );
    visBtn.style.color = file.isPianoRollVisible ? "#495057" : "#adb5bd";
    visBtn.style.border = "none";
    visBtn.style.boxShadow = "none";

    // Reference pin toggle (eval ref)
    const currentEval = dependencies.stateManager.getState().evaluation;
    const isRef = currentEval.refId === file.id;
    const pinBtn = createIconButton(
      (PLAYER_ICONS as any).pin ?? "",
      () => {
        const evalState = dependencies.stateManager.getState().evaluation;
        const nextRef = evalState.refId === file.id ? null : file.id;
        const nextEstIds = nextRef
          ? evalState.estIds.filter((id) => id !== nextRef)
          : evalState.estIds.slice();
        dependencies.stateManager.updateEvaluationState({
          refId: nextRef,
          estIds: nextEstIds,
        });

        // Optimistically update all pin buttons in the current list so
        // the visual state reflects the new ref immediately without a
        // full re-render cycle.
        const container = item.parentElement; // #file-controls
        if (container) {
          const buttons = Array.from(
            container.querySelectorAll<HTMLButtonElement>(
              "button[data-role=ref-pin]"
            )
          );
          buttons.forEach((btn) => {
            const fid = btn.getAttribute("data-file-id");
            const active = nextRef !== null && fid === nextRef;
            btn.style.color = active ? "#0d6efd" : "#adb5bd";
            btn.title = active ? "Unset as reference" : "Set as reference";
          });

          // Also optimistically refresh est-toggle buttons to reflect
          // the new ref (ref cannot be an estimated file).
          const estButtons = Array.from(
            container.querySelectorAll<HTMLButtonElement>(
              "button[data-role=est-toggle]"
            )
          );
          estButtons.forEach((btn) => {
            const fid = btn.getAttribute("data-file-id") || "";
            const isRefBtn = nextRef !== null && fid === nextRef;
            const isActive = nextEstIds.includes(fid);
            btn.style.color = isActive ? "#198754" : "#adb5bd";
            btn.title = isActive ? "Unset as estimated" : "Set as estimated";
            if (isRefBtn) {
              btn.style.opacity = "0.5";
              btn.style.pointerEvents = "none";
              btn.title = "Cannot set Reference as Estimated";
            } else {
              btn.style.opacity = "1";
              btn.style.pointerEvents = "auto";
            }
          });
        }
      },
      isRef ? "Unset as reference" : "Set as reference",
      { size: 24 }
    );
    pinBtn.style.color = isRef ? "#0d6efd" : "#adb5bd";
    pinBtn.style.border = "none";
    pinBtn.style.boxShadow = "none";
    pinBtn.setAttribute("data-role", "ref-pin");
    pinBtn.setAttribute("data-file-id", file.id);

    /* -------- estimation toggle (eval estIds) -------- */
    const isEst = currentEval.estIds.includes(file.id);
    const estBtn = createIconButton(
      (PLAYER_ICONS as any).est ?? "E",
      () => {
        const evalState = dependencies.stateManager.getState().evaluation;
        if (evalState.refId === file.id) {
          return; // Do not allow marking ref as estimated
        }
        const already = evalState.estIds.includes(file.id);
        const next = already
          ? evalState.estIds.filter((id) => id !== file.id)
          : [...evalState.estIds, file.id];
        const filtered = evalState.refId
          ? next.filter((id) => id !== evalState.refId)
          : next;
        dependencies.stateManager.updateEvaluationState({ estIds: filtered });

        // Optimistically update all est buttons
        const container = item.parentElement; // #file-controls
        if (container) {
          const buttons = Array.from(
            container.querySelectorAll<HTMLButtonElement>(
              "button[data-role=est-toggle]"
            )
          );
          const refId = dependencies.stateManager.getState().evaluation.refId;
          buttons.forEach((btn) => {
            const fid = btn.getAttribute("data-file-id") || "";
            const active = filtered.includes(fid);
            const isRefBtn = refId !== null && fid === refId;
            btn.style.color = active ? "#198754" : "#adb5bd";
            btn.title = active ? "Unset as estimated" : "Set as estimated";
            if (isRefBtn) {
              btn.style.opacity = "0.5";
              btn.style.pointerEvents = "none";
              btn.title = "Cannot set Reference as Estimated";
            } else {
              btn.style.opacity = "1";
              btn.style.pointerEvents = "auto";
            }
          });
        }
      },
      isEst ? "Unset as estimated" : "Set as estimated",
      { size: 24 }
    );
    estBtn.style.color = isEst ? "#198754" : "#adb5bd";
    estBtn.style.border = "none";
    estBtn.style.boxShadow = "none";
    estBtn.setAttribute("data-role", "est-toggle");
    estBtn.setAttribute("data-file-id", file.id);
    if (isRef) {
      estBtn.style.opacity = "0.5";
      estBtn.style.pointerEvents = "none";
      estBtn.title = "Cannot set Reference as Estimated";
    }

    /* -------- sustain toggle -------- */
    const sustainBtn = document.createElement("button");
    const isSustainVisible = (file as any).isSustainVisible ?? true;
    sustainBtn.innerHTML = (PLAYER_ICONS as any).sustain ?? "S";
    sustainBtn.style.cssText = `
        width: 20px;
        height: 20px;
        padding: 0;
        border: none;
        background: transparent;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        color: ${isSustainVisible ? "#495057" : "#adb5bd"};
        transition: color 0.15s ease;
      `;

    sustainBtn.addEventListener("click", () => {
      dependencies.midiManager.toggleSustainVisibility(file.id);
    });

    // Stereo labels for clarity
    const labelL = document.createElement("span");
    labelL.textContent = "L";
    labelL.style.cssText = `font-size: 12px; color: #6c757d;`;

    const labelR = document.createElement("span");
    labelR.textContent = "R";
    labelR.style.cssText = `font-size: 12px; color: #6c757d;`;

    // Per-file Pan Slider (L/R)
    const panSlider = document.createElement("input");
    panSlider.type = "range";
    panSlider.min = "-100";
    panSlider.max = "100";
    panSlider.step = "1";
    const initPan = (dependencies.filePanValues?.[file.id] ?? 0) * 100;
    panSlider.value = initPan.toString();
    panSlider.title = "Pan (L • R)";
    panSlider.style.cssText = `
      width: 80px;
      -webkit-appearance: none;
      appearance: none;
      height: 4px;
      background: #e9ecef;
      border-radius: 8px;
      outline: none;
      cursor: pointer;
    `;

    // Sync pan value on input
    panSlider.addEventListener("input", () => {
      const panValue = parseFloat(panSlider.value) / 100; // -1 to 1
      if (dependencies.filePanValues) {
        dependencies.filePanValues[file.id] = panValue;
      }

      // Prefer per-file panning if supported by the audio player
      const playerAny = dependencies.audioPlayer as any;
      if (playerAny?.setFilePan) {
        playerAny.setFilePan(file.id, panValue);
      } else {
        // Fallback to global pan (legacy single-file player)
        dependencies.audioPlayer?.setPan(panValue);
      }
    });

    // Double-click -> reset to center (0)
    panSlider.addEventListener("dblclick", () => {
      panSlider.value = "0"; // Update the slider UI to reflect the reset
      if (dependencies.filePanValues) {
        dependencies.filePanValues[file.id] = 0;
      }

      const playerAny = dependencies.audioPlayer as any;
      if (playerAny?.setFilePan) {
        playerAny.setFilePan(file.id, 0);
      } else {
        dependencies.audioPlayer?.setPan(0);
      }
    });

    // Add volume control with integrated mute functionality
    const volumeControl = new FileVolumeControl({
      initialVolume: file.isMuted ? 0 : 1.0,
      fileId: file.id,
      lastNonZeroVolume: 1.0,
      onVolumeChange: (volume) => {
        // Update mute state based on volume
        const shouldMute = volume === 0;
        if (file.isMuted !== shouldMute) {
          dependencies.midiManager.toggleMute(file.id);
        }

        // Apply volume to the audio engine - this will trigger auto-pause if needed
        const playerAny = dependencies.audioPlayer as any;
        if (playerAny?.setFileVolume) {
          playerAny.setFileVolume(file.id, volume);
        }
        
        // Also explicitly call setFileMute to ensure mute state is properly set
        if (playerAny?.setFileMute) {
          playerAny.setFileMute(file.id, shouldMute);
        }

        // Also update silence detector for tracking
        dependencies.silenceDetector?.setFileVolume?.(file.id, volume);
        dependencies.silenceDetector?.setFileMute?.(file.id, shouldMute);
      },
    });

    // order: color - name - pin - est - vis - sustain - volume - pan
    item.appendChild(colorIndicator);
    item.appendChild(fileName);
    item.appendChild(pinBtn);
    item.appendChild(estBtn);
    item.appendChild(visBtn);
    item.appendChild(sustainBtn);
    item.appendChild(volumeControl.getElement());
    item.appendChild(labelL);
    item.appendChild(panSlider);
    item.appendChild(labelR);
    return item;
  }

  // --- Audio (WAV/MP3) toggle item ---
  static createAudioToggleItem(
    audio: {
      id: string;
      displayName: string;
      color: number;
      isVisible: boolean;
      isMuted: boolean;
      pan: number;
    },
    dependencies: UIComponentDependencies
  ): HTMLElement {
    const item = document.createElement("div");
    item.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 8px;
      background: #f8f9fa;
      border-radius: 6px;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
      border: 1px solid #dee2e6;
    `;

    const colorIndicator = document.createElement("div");
    colorIndicator.style.cssText = `
      width: 12px;
      height: 12px;
      background: #${audio.color.toString(16).padStart(6, "0")};
    `;

    const name = document.createElement("span");
    name.textContent = audio.displayName;
    name.style.cssText = `
      flex: 1;
      font-size: 14px;
      color: ${audio.isVisible ? "#343a40" : "#6c757d"};
    `;

    // Visibility toggle (waveform overlay)
    const visBtn = createIconButton(
      audio.isVisible ? PLAYER_ICONS.eye_open : PLAYER_ICONS.eye_closed,
      () => {
        (window as any)._waveRollAudio?.toggleVisibility?.(audio.id);
        const container = item.closest(
          '[data-role="file-toggle"]'
        ) as HTMLElement | null;
        if (container) {
          FileToggleManager.updateFileToggleSection(container, dependencies);
        }
      },
      "Toggle waveform visibility",
      { size: 24 }
    );
    visBtn.style.color = audio.isVisible ? "#495057" : "#adb5bd";
    visBtn.style.border = "none";
    visBtn.style.boxShadow = "none";

    // Add volume control for WAV with integrated mute functionality
    const volumeControl = new FileVolumeControl({
      initialVolume: audio.isMuted ? 0 : 1.0,
      fileId: audio.id,
      lastNonZeroVolume: 1.0,
      onVolumeChange: (volume) => {
        // Update mute state based on volume
        const shouldMute = volume === 0;
        if ((window as any)._waveRollAudio) {
          const api = (window as any)._waveRollAudio;
          const files = api.getFiles?.() || [];
          const file = files.find((f: any) => f.id === audio.id);
          if (file && file.isMuted !== shouldMute) {
            api.toggleMute?.(audio.id);
          }
        }

        // Apply volume to the audio player - this will trigger auto-pause if needed
        const playerAny = dependencies.audioPlayer as any;
        if (playerAny?.setWavVolume) {
          playerAny.setWavVolume(audio.id, volume);
        }

        // Refresh audio players - this should handle mute state and auto-pause
        if (
          dependencies.audioPlayer &&
          (dependencies.audioPlayer as any).refreshAudioPlayers
        ) {
          (dependencies.audioPlayer as any).refreshAudioPlayers();
        }

        // Also update silence detector for tracking
        dependencies.silenceDetector?.setWavVolume?.(audio.id, volume);
        dependencies.silenceDetector?.setWavMute?.(audio.id, shouldMute);
      },
    });

    // Pan slider
    const labelL = document.createElement("span");
    labelL.textContent = "L";
    labelL.style.cssText = `font-size: 12px; color: #6c757d;`;
    const labelR = document.createElement("span");
    labelR.textContent = "R";
    labelR.style.cssText = `font-size: 12px; color: #6c757d;`;

    const panSlider = document.createElement("input");
    panSlider.type = "range";
    panSlider.min = "-100";
    panSlider.max = "100";
    panSlider.step = "1";
    panSlider.value = String((audio.pan ?? 0) * 100);
    panSlider.title = "Pan (L • R)";
    panSlider.style.cssText = `
      width: 80px;
      -webkit-appearance: none;
      appearance: none;
      height: 4px;
      background: #e9ecef;
      border-radius: 8px;
      outline: none;
      cursor: pointer;
    `;
    panSlider.addEventListener("input", () => {
      const pan = parseFloat(panSlider.value) / 100;
      (window as any)._waveRollAudio?.setPan?.(audio.id, pan);
    });
    panSlider.addEventListener("dblclick", () => {
      (window as any)._waveRollAudio?.setPan?.(audio.id, 0);
      panSlider.value = "0";
    });

    item.appendChild(colorIndicator);
    item.appendChild(name);
    item.appendChild(visBtn);
    item.appendChild(volumeControl.getElement());
    item.appendChild(labelL);
    item.appendChild(panSlider);
    item.appendChild(labelR);
    return item;
  }
}
