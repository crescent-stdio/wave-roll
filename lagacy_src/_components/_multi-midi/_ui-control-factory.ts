import { PLAYER_ICONS } from "@/assets/player-icons";
import {
  COLOR_PRIMARY,
  COLOR_A,
  COLOR_B,
  COLOR_OVERLAP,
} from "@/demos/multi-midi/ColorUtils";

import { UIComponentDependencies } from "./types";

/**
 * Builds playback / loop / volume / tempo / pan / zoom controls and the seek-bar.
 * Extracted from the original `UIComponents.ts`.
 */
export class UIControlFactory {
  // The full ~1 000-line implementation has been preserved below for parity.
  // clang-format / prettier will collapse the template-literal CSS blocks.

  /* ----------------------------------------------------------------------- */
  static setupUI(
    controlsContainer: HTMLElement,
    playerContainer: HTMLElement,
    dependencies: UIComponentDependencies
  ): void {
    controlsContainer.innerHTML = "";
    controlsContainer.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 8px;
      background: #f8f9fa;
      padding: 12px;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
    `;

    const controlsRow = document.createElement("div");
    controlsRow.style.cssText = `
      display: flex;
      align-items: center;
      gap: 20px;
      justify-content: flex-start;
      flex-wrap: nowrap;
      overflow-x: auto;
    `;

    controlsRow.appendChild(this.createPlaybackControls(dependencies));
    controlsRow.appendChild(this.createLoopControls(dependencies));
    controlsRow.appendChild(this.createVolumeControl(dependencies));
    controlsRow.appendChild(this.createTempoControl(dependencies));
    controlsRow.appendChild(this.createPanControls(dependencies));
    controlsRow.appendChild(this.createZoomControls(dependencies));
    controlsRow.appendChild(this.createSettingsControl(dependencies));

    controlsContainer.appendChild(controlsRow);
    controlsContainer.appendChild(this.createTimeDisplay(dependencies));

    playerContainer.appendChild(controlsContainer);
  }

  /* ------------------------------ playback ------------------------------ */
  private static createPlaybackControls(
    dependencies: UIComponentDependencies
  ): HTMLElement {
    const container = document.createElement("div");
    container.style.cssText = `
      display: flex;
      gap: 4px;
      align-items: center;
      height: 48px;
      background: rgba(255, 255, 255, 0.8);
      padding: 4px;
      border-radius: 8px;
      position: relative;
      z-index: 10;
    `;

    /* ---------------- play / pause ---------------- */
    const playBtn = document.createElement("button");
    playBtn.innerHTML = PLAYER_ICONS.play;
    playBtn.style.cssText = `
      width: 40px;
      height: 40px;
      padding: 0;
      border: none;
      border-radius: 8px;
      background: ${COLOR_PRIMARY};
      color: white;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
      position: relative;
    `;

    const updatePlayButton = () => {
      const state = dependencies.audioPlayer?.getState();
      if (state?.isPlaying) {
        playBtn.innerHTML = PLAYER_ICONS.pause;
        playBtn.style.background = "#28a745";
        playBtn.onclick = () => {
          dependencies.audioPlayer?.pause();
          updatePlayButton();
        };
      } else {
        playBtn.innerHTML = PLAYER_ICONS.play;
        playBtn.style.background = COLOR_PRIMARY;
        playBtn.onclick = async () => {
          try {
            await dependencies.audioPlayer?.play();
            updatePlayButton();
          } catch (error) {
            console.error("Failed to play:", error);
            alert(
              `Failed to start playback: ${
                error instanceof Error ? error.message : "Unknown error"
              }`
            );
          }
        };
      }
    };

    playBtn.addEventListener("mouseenter", () => {
      playBtn.style.transform = "scale(1.05)";
    });
    playBtn.addEventListener("mouseleave", () => {
      playBtn.style.transform = "scale(1)";
    });
    playBtn.addEventListener("mousedown", () => {
      playBtn.style.transform = "scale(0.95)";
    });
    playBtn.addEventListener("mouseup", () => {
      playBtn.style.transform = "scale(1.05)";
    });

    updatePlayButton();
    dependencies.updatePlayButton = updatePlayButton;

    /* ---------------- helper for small buttons ---------------- */
    const mkBtn = (icon: string, onClick: () => void): HTMLButtonElement => {
      const btn = document.createElement("button");
      btn.innerHTML = icon;
      btn.onclick = onClick;
      btn.style.cssText = `
        width: 32px;
        height: 32px;
        padding: 0;
        border: none;
        border-radius: 8px;
        background: transparent;
        color: #495057;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.15s ease;
      `;
      btn.addEventListener("mouseenter", () => {
        if (!btn.dataset.active) btn.style.background = "rgba(0,0,0,0.05)";
      });
      btn.addEventListener("mouseleave", () => {
        if (!btn.dataset.active) btn.style.background = "transparent";
      });
      return btn;
    };

    /* restart */
    const restartBtn = mkBtn(PLAYER_ICONS.restart, () => {
      dependencies.audioPlayer?.seek(0);
      if (!dependencies.audioPlayer?.getState().isPlaying) {
        dependencies.audioPlayer?.play();
      }
      updatePlayButton();
    });

    /* repeat toggle */
    const repeatBtn = mkBtn(PLAYER_ICONS.repeat, () => {
      const state = dependencies.audioPlayer?.getState();
      const newRepeat = !state?.isRepeating;
      dependencies.audioPlayer?.toggleRepeat(newRepeat);
      if (newRepeat) {
        repeatBtn.dataset.active = "true";
        repeatBtn.style.background = "rgba(0, 123, 255, 0.1)";
        repeatBtn.style.color = COLOR_PRIMARY;
      } else {
        delete repeatBtn.dataset.active;
        repeatBtn.style.background = "transparent";
        repeatBtn.style.color = "#495057";
      }
    });

    container.appendChild(restartBtn);
    container.appendChild(playBtn);
    container.appendChild(repeatBtn);
    return container;
  }

  /* --------------------------- A-B loop controls --------------------------- */
  private static createLoopControls(
    dependencies: UIComponentDependencies
  ): HTMLElement {
    const container = document.createElement("div");
    container.style.cssText = `
      display: flex;
      gap: 6px;
      align-items: center;
      height: 48px;
      background: rgba(255, 255, 255, 0.8);
      padding: 4px;
      border-radius: 8px;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
    `;

    // Virtual A-B points (in seconds)
    let pointA: number | null = null;
    let pointB: number | null = null;
    let isLooping = false;
    let isLoopRestartActive = false;

    // Create button helper
    const createLoopButton = (
      text: string,
      onClick: () => void,
      isActive = false
    ): HTMLButtonElement => {
      const btn = document.createElement("button");
      btn.textContent = text;
      btn.onclick = onClick;
      btn.style.cssText = `
        width: 32px;
        height: 32px;
        padding: 0;
        border: none;
        border-radius: 8px;
        background: ${isActive ? "rgba(0, 123, 255, 0.1)" : "transparent"};
        color: ${isActive ? COLOR_PRIMARY : "#495057"};
        cursor: pointer;
        font-size: 13px;
        font-weight: 600;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.15s ease;
      `;

      btn.addEventListener("mouseenter", () => {
        if (!btn.dataset.active) {
          btn.style.background = "rgba(0, 0, 0, 0.05)";
        }
      });
      btn.addEventListener("mouseleave", () => {
        if (!btn.dataset.active) {
          btn.style.background = "transparent";
        }
      });

      if (isActive) {
        btn.dataset.active = "true";
      }

      return btn;
    };

    // Loop restart button
    const btnLoopRestart = document.createElement("button");
    btnLoopRestart.innerHTML = PLAYER_ICONS.loop_restart;
    btnLoopRestart.onclick = () => {
      isLoopRestartActive = !isLoopRestartActive;

      if (isLoopRestartActive) {
        btnLoopRestart.dataset.active = "true";
        btnLoopRestart.style.background = "rgba(0, 123, 255, 0.1)";
        btnLoopRestart.style.color = COLOR_PRIMARY;

        if (pointA !== null && pointB !== null) {
          dependencies.audioPlayer?.setLoopPoints(pointA, pointB);
        } else if (pointA !== null) {
          dependencies.audioPlayer?.setLoopPoints(pointA, null);
        }

        const startPoint = pointA !== null ? pointA : 0;
        dependencies.audioPlayer?.seek(startPoint);
        if (!dependencies.audioPlayer?.getState().isPlaying) {
          dependencies.audioPlayer?.play();
        }
      } else {
        delete btnLoopRestart.dataset.active;
        btnLoopRestart.style.background = "transparent";
        btnLoopRestart.style.color = "#495057";
        dependencies.audioPlayer?.setLoopPoints(null, null);
      }
    };
    btnLoopRestart.style.cssText = `
      width: 32px;
      height: 32px;
      padding: 0;
      border: none;
      border-radius: 8px;
      background: transparent;
      color: #495057;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s ease;
    `;
    btnLoopRestart.title = "Toggle A-B Loop Mode";

    btnLoopRestart.addEventListener("mouseenter", () => {
      if (!btnLoopRestart.dataset.active) {
        btnLoopRestart.style.background = "rgba(0, 0, 0, 0.05)";
      }
    });
    btnLoopRestart.addEventListener("mouseleave", () => {
      if (!btnLoopRestart.dataset.active) {
        btnLoopRestart.style.background = "transparent";
      }
    });

    // A and B buttons
    const btnA = createLoopButton(
      "A",
      () => {
        const state = dependencies.audioPlayer?.getState();
        if (state) {
          pointA = state.currentTime;
          btnA.style.background = COLOR_A;
          btnA.style.color = "white";
          btnA.dataset.active = "true";
          dependencies.updateSeekBar?.();
        }
      },
      false
    );

    const btnB = createLoopButton(
      "B",
      () => {
        const state = dependencies.audioPlayer?.getState();
        if (state) {
          pointB = state.currentTime;
          btnB.style.background = COLOR_B;
          btnB.style.color = "white";
          btnB.dataset.active = "true";
          dependencies.updateSeekBar?.();
        }
      },
      false
    );

    // Clear button
    const btnClear = createLoopButton("✕", () => {
      pointA = null;
      pointB = null;
      isLooping = false;
      btnA.style.background = "transparent";
      btnA.style.color = "#495057";
      delete btnA.dataset.active;
      btnB.style.background = "transparent";
      btnB.style.color = "#495057";
      delete btnB.dataset.active;
      dependencies.updateSeekBar?.();
    });
    btnClear.style.fontSize = "16px";
    btnClear.title = "Clear A-B Loop";

    container.appendChild(btnLoopRestart);
    container.appendChild(btnA);
    container.appendChild(btnB);
    container.appendChild(btnClear);

    return container;
  }

  /* --------------------------- time display + seek bar --------------------------- */
  private static createTimeDisplay(
    dependencies: UIComponentDependencies
  ): HTMLElement {
    const container = document.createElement("div");
    container.style.cssText = `
      display: flex;
      align-items: center;
      gap: 12px;
      background: white;
      padding: 14px 14px 10px 14px;
      border-radius: 8px;
      margin-top: 4px;
    `;

    // Current time label
    const currentTimeLabel = document.createElement("span");
    currentTimeLabel.style.cssText = `
      font-family: 'SF Mono', 'Monaco', 'Inconsolata', monospace;
      font-size: 12px;
      font-weight: 500;
      color: #495057;
      min-width: 45px;
      text-align: right;
    `;
    currentTimeLabel.textContent = "00:00";

    // Seek bar container
    const seekBarContainer = document.createElement("div");
    seekBarContainer.style.cssText = `
      flex: 1;
      position: relative;
      height: 6px;
      background: #e9ecef;
      border-radius: 8px;
      cursor: pointer;
    `;

    // Progress bar
    const progressBar = document.createElement("div");
    progressBar.style.cssText = `
      height: 100%;
      background: linear-gradient(90deg, ${COLOR_PRIMARY}, #4dabf7);
      border-radius: 8px;
      width: 0%;
    `;

    // Seek handle
    const seekHandle = document.createElement("div");
    seekHandle.style.cssText = `
      position: absolute;
      top: 50%;
      transform: translate(-50%, -50%);
      width: 16px;
      height: 16px;
      background: ${COLOR_PRIMARY};
      border-radius: 50%;
      cursor: pointer;
      left: 0%;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    `;

    // Total time label
    const totalTimeLabel = document.createElement("span");
    totalTimeLabel.style.cssText = `
      font-family: 'SF Mono', 'Monaco', 'Inconsolata', monospace;
      font-size: 12px;
      font-weight: 500;
      color: #6c757d;
      min-width: 45px;
    `;
    totalTimeLabel.textContent = "00:00";

    // Assemble seek bar
    seekBarContainer.appendChild(progressBar);
    seekBarContainer.appendChild(seekHandle);

    // Assemble container
    container.appendChild(currentTimeLabel);
    container.appendChild(seekBarContainer);
    container.appendChild(totalTimeLabel);

    /**
     * ---- Seek-bar logic ----
     */
    const updateSeekBar = (override?: {
      currentTime: number;
      duration: number;
    }): void => {
      const state = override ?? dependencies.audioPlayer?.getState();
      const dbgCounters = (updateSeekBar as any)._dbg ?? {
        noState: 0,
        zeroDur: 0,
        normal: 0,
      };
      (updateSeekBar as any)._dbg = dbgCounters;

      if (!state) {
        if (dbgCounters.noState < 5) {
          console.warn("[UIControlFactory.updateSeekBar] no state");
          dbgCounters.noState++;
        }
        return;
      }

      if (state.duration === 0) {
        if (dbgCounters.zeroDur < 5) {
          console.warn("[UIControlFactory.updateSeekBar] duration 0", state);
          dbgCounters.zeroDur++;
        }
        return;
      }

      // Debug percent and currentTime (first few only)
      if (dbgCounters.normal < 5) {
        const dbgPercent = (state.currentTime / state.duration) * 100;
        console.log("[UIControlFactory.updateSeekBar]", {
          currentTime: state.currentTime.toFixed(2),
          duration: state.duration.toFixed(2),
          percent: dbgPercent.toFixed(1),
        });
        dbgCounters.normal++;
      }

      const percent = (state.currentTime / state.duration) * 100;
      progressBar.style.width = `${percent}%`;
      seekHandle.style.left = `${percent}%`;

      // Update labels
      currentTimeLabel.textContent = dependencies.formatTime(state.currentTime);
      totalTimeLabel.textContent = dependencies.formatTime(state.duration);
    };

    // Expose to external update loop
    dependencies.updateSeekBar = updateSeekBar;

    // Initial draw
    updateSeekBar();

    /** Click / seek interaction */
    const handleSeek = (evt: MouseEvent): void => {
      const rect = seekBarContainer.getBoundingClientRect();
      const percent = (evt.clientX - rect.left) / rect.width;
      const state = dependencies.audioPlayer?.getState();
      if (!state || state.duration === 0) {
        return;
      }
      const newTime = Math.max(
        0,
        Math.min(state.duration * percent, state.duration)
      );
      dependencies.audioPlayer?.seek(newTime, true);
      updateSeekBar();
    };

    seekBarContainer.addEventListener("click", handleSeek);

    return container;
  }

  /* --------------------------- volume control --------------------------- */
  private static createVolumeControl(
    dependencies: UIComponentDependencies
  ): HTMLElement {
    const container = document.createElement("div");
    container.style.cssText = `
      display: flex;
      align-items: center;
      gap: 10px;
      height: 48px;
      background: rgba(255, 255, 255, 0.8);
      padding: 4px 12px;
      border-radius: 8px;
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
      color: #495057;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: color 0.2s ease;
    `;

    // Volume slider
    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = "100";
    slider.value = "70";
    slider.style.cssText = `
      width: 70px;
      -webkit-appearance: none;
      appearance: none;
      height: 4px;
      background: #e9ecef;
      border-radius: 8px;
      outline: none;
      cursor: pointer;
    `;

    // Volume input
    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.max = "100";
    input.value = "70";
    input.style.cssText = `
      width: 52px;
      padding: 4px 6px;
      border: none;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      color: #007bff;
      background: rgba(0, 123, 255, 0.08);
      outline: none;
      text-align: center;
    `;

    // Volume control logic
    const updateVolume = (percent: number) => {
      const vol = Math.max(0, Math.min(100, percent)) / 100;
      dependencies.audioPlayer?.setVolume(vol);
      slider.value = (vol * 100).toString();
      input.value = (vol * 100).toString();
    };

    slider.addEventListener("input", () => {
      updateVolume(parseFloat(slider.value));
    });

    input.addEventListener("input", () => {
      updateVolume(parseFloat(input.value));
    });

    container.appendChild(iconBtn);
    container.appendChild(slider);
    container.appendChild(input);

    return container;
  }

  /* --------------------------- tempo control --------------------------- */
  private static createTempoControl(
    dependencies: UIComponentDependencies
  ): HTMLElement {
    const container = document.createElement("div");
    container.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      height: 48px;
      background: rgba(255, 255, 255, 0.8);
      padding: 4px 12px;
      border-radius: 8px;
    `;

    // Tempo input
    const input = document.createElement("input");
    input.type = "number";
    input.min = "40";
    input.max = "400";
    input.value = "120";
    input.style.cssText = `
      width: 80px;
      padding: 4px 8px;
      border: none;
      border-radius: 4px;
      font-size: 13px;
      font-weight: 600;
      color: ${COLOR_PRIMARY};
      background: rgba(0, 123, 255, 0.08);
      outline: none;
      text-align: center;
    `;

    const label = document.createElement("span");
    label.textContent = "BPM";
    label.style.cssText = `
      font-size: 12px;
      font-weight: 600;
      color: #6c757d;
    `;

    // Tempo control logic
    input.addEventListener("input", () => {
      const tempo = parseFloat(input.value);
      if (!isNaN(tempo) && tempo >= 40 && tempo <= 400) {
        dependencies.audioPlayer?.setTempo(tempo);
      }
    });

    container.appendChild(input);
    container.appendChild(label);

    return container;
  }

  /* --------------------------- pan control --------------------------- */
  private static createPanControls(
    dependencies: UIComponentDependencies
  ): HTMLElement {
    const container = document.createElement("div");
    container.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      height: 48px;
      background: rgba(255, 255, 255, 0.8);
      padding: 4px 12px;
      border-radius: 8px;
    `;

    // Pan slider
    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "-100";
    slider.max = "100";
    slider.value = "0";
    slider.style.cssText = `
      width: 80px;
      -webkit-appearance: none;
      appearance: none;
      height: 4px;
      background: #e9ecef;
      border-radius: 8px;
      outline: none;
      cursor: pointer;
    `;

    const label = document.createElement("span");
    label.textContent = "Pan";
    label.style.cssText = `
      font-size: 12px;
      font-weight: 600;
      color: #6c757d;
    `;

    // Sync pan value on input
    slider.addEventListener("input", () => {
      const panValue = parseFloat(slider.value) / 100; // -1 to 1
      dependencies.audioPlayer?.setPan(panValue);
    });

    // Double-click → reset to center (0)
    slider.addEventListener("dblclick", () => {
      dependencies.audioPlayer?.setPan(0);
    });

    container.appendChild(label);
    container.appendChild(slider);

    return container;
  }

  /* --------------------------- zoom control --------------------------- */
  private static createZoomControls(
    dependencies: UIComponentDependencies
  ): HTMLElement {
    const container = document.createElement("div");
    container.style.cssText = `
      display: flex;
      align-items: center;
      gap: 6px;
      height: 48px;
      background: rgba(255, 255, 255, 0.8);
      padding: 4px 8px;
      border-radius: 8px;
    `;

    // Numeric input for zoom factor
    const zoomInput = document.createElement("input");
    zoomInput.type = "number";
    zoomInput.min = "0.1";
    zoomInput.max = "10";
    zoomInput.step = "0.1";
    const initZoom = dependencies.pianoRollInstance?.getState?.().zoomX ?? 1;
    zoomInput.value = initZoom.toFixed(1);
    zoomInput.style.cssText = `
      width: 56px;
      padding: 4px 6px;
      border: 1px solid #ced4da;
      border-radius: 6px;
      font-size: 12px;
      text-align: center;
      color: #20c997;
      background: #ffffff;
    `;

    const clampZoom = (v: number) => Math.max(0.1, Math.min(10, v));

    const applyZoom = () => {
      const num = parseFloat(zoomInput.value);
      if (isNaN(num)) return;
      const newZoom = clampZoom(num);
      const currentZoom =
        dependencies.pianoRollInstance?.getState?.().zoomX ?? 1;
      const factor = newZoom / currentZoom;
      dependencies.pianoRollInstance?.zoomX?.(factor);
      zoomInput.value = newZoom.toFixed(1);
    };

    zoomInput.addEventListener("change", applyZoom);
    zoomInput.addEventListener("blur", applyZoom);
    zoomInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        applyZoom();
        zoomInput.blur();
      }
    });

    // Wheel over zoomInput → adjust ±0.1 steps; preventDefault() requires passive: false
    zoomInput.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.1 : -0.1;
        const num = parseFloat(zoomInput.value) || initZoom;
        zoomInput.value = (num + delta).toFixed(1);
        applyZoom();
      },
      { passive: false }
    );

    const suffix = document.createElement("span");
    suffix.textContent = "x";
    suffix.style.cssText = `
      font-size: 12px;
      font-weight: 600;
      color: #6c757d;
    `;

    // Reset button
    const resetBtn = document.createElement("button");
    resetBtn.innerHTML = PLAYER_ICONS.zoom_reset || "⟲";
    resetBtn.title = "Reset Zoom";
    resetBtn.style.cssText = `
      width: 32px;
      height: 32px;
      padding: 0;
      border: none;
      border-radius: 8px;
      background: transparent;
      color: #495057;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s ease;
    `;
    resetBtn.addEventListener("click", () => {
      dependencies.pianoRollInstance?.resetView?.();
      zoomInput.value = "1.0";
    });

    container.appendChild(zoomInput);
    container.appendChild(suffix);
    container.appendChild(resetBtn);

    // Expose zoomInput so outer update loop can sync value
    (dependencies as any).zoomInput = zoomInput;

    return container;
  }

  /* --------------------------- settings control --------------------------- */
  private static createSettingsControl(
    dependencies: UIComponentDependencies
  ): HTMLElement {
    const container = document.createElement("div");
    container.style.cssText = `
      display: flex;
      align-items: center;
    `;

    // Settings button
    const settingsBtn = this.createIconButton(PLAYER_ICONS.settings, () => {
      // Prevent multiple overlays
      if (document.getElementById("zoom-settings-overlay")) return;

      const overlay = document.createElement("div");
      overlay.id = "zoom-settings-overlay";
      overlay.style.cssText = `
        position:fixed;inset:0;background:rgba(0,0,0,0.5);
        display:flex;justify-content:center;align-items:center;z-index:2000;
      `;

      const modal = document.createElement("div");
      modal.style.cssText = `
        width:320px;max-width:90%;background:#fff;border-radius:10px;
        padding:24px;display:flex;flex-direction:column;gap:16px;
      `;

      const header = document.createElement("div");
      header.style.cssText = `display:flex;justify-content:space-between;align-items:center;`;
      const title = document.createElement("h3");
      title.textContent = "Zoom / Grid Settings";
      title.style.cssText = `margin:0;font-size:16px;font-weight:700;`;
      const close = document.createElement("button");
      close.textContent = "✕";
      close.style.cssText = `border:none;background:transparent;font-size:20px;cursor:pointer;color:#6c757d;`;
      close.onclick = () => overlay.remove();
      header.appendChild(title);
      header.appendChild(close);

      // TimeStep
      const tsGroup = document.createElement("div");
      tsGroup.style.cssText = `display:flex;align-items:center;gap:6px;`;
      const tsLabel = document.createElement("span");
      tsLabel.textContent = "Grid step:";
      tsLabel.style.cssText = `font-size:12px;font-weight:600;`;
      const tsInput = document.createElement("input");
      tsInput.type = "number";
      tsInput.min = "0.1";
      tsInput.step = "0.1";
      const curStep = dependencies.pianoRollInstance?.getTimeStep?.() ?? 1;
      tsInput.value = curStep.toString();
      tsInput.style.cssText = `width:64px;padding:4px 6px;border:1px solid #ced4da;border-radius:6px;font-size:12px;text-align:center;`;
      const tsSuffix = document.createElement("span");
      tsSuffix.textContent = "s";
      tsSuffix.style.cssText = tsLabel.style.cssText;
      const applyTS = () => {
        const v = parseFloat(tsInput.value);
        if (!isNaN(v) && v > 0) {
          dependencies.pianoRollInstance?.setTimeStep?.(v);
        }
      };
      tsInput.addEventListener("change", applyTS);
      tsInput.addEventListener("blur", applyTS);
      tsGroup.appendChild(tsLabel);
      tsGroup.appendChild(tsInput);
      tsGroup.appendChild(tsSuffix);

      // Minor step
      const mnGroup = document.createElement("div");
      mnGroup.style.cssText = tsGroup.style.cssText;
      const mnLabel = document.createElement("span");
      mnLabel.textContent = "Minor step:";
      mnLabel.style.cssText = tsLabel.style.cssText;
      const mnInput = document.createElement("input");
      mnInput.type = "number";
      mnInput.min = "0.05";
      mnInput.step = "0.05";
      const curMinor =
        dependencies.pianoRollInstance?.getMinorTimeStep?.() ??
        dependencies.minorTimeStep;
      mnInput.value = curMinor.toString();
      mnInput.style.cssText = tsInput.style.cssText;
      const mnSuffix = document.createElement("span");
      mnSuffix.textContent = "s";
      mnSuffix.style.cssText = tsLabel.style.cssText;
      const applyMinor = () => {
        const v = parseFloat(mnInput.value);
        if (!isNaN(v) && v > 0) {
          dependencies.pianoRollInstance?.setMinorTimeStep?.(v);
        }
      };
      mnInput.addEventListener("change", applyMinor);
      mnInput.addEventListener("blur", applyMinor);
      mnGroup.appendChild(mnLabel);
      mnGroup.appendChild(mnInput);
      mnGroup.appendChild(mnSuffix);

      modal.appendChild(header);
      modal.appendChild(tsGroup);
      modal.appendChild(mnGroup);
      overlay.appendChild(modal);
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) overlay.remove();
      });
      document.body.appendChild(overlay);
    });
    settingsBtn.title = "Zoom/Grid Settings";
    container.appendChild(settingsBtn);

    return container;
  }

  // Helper method
  private static createIconButton(
    icon: string,
    onClick: () => void,
    title?: string
  ): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.innerHTML = icon;
    btn.onclick = onClick;
    if (title) btn.title = title;
    btn.style.cssText = `
      width: 32px;
      height: 32px;
      padding: 0;
      border: none;
      border-radius: 8px;
      background: transparent;
      color: #495057;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s ease;
    `;
    return btn;
  }
}
