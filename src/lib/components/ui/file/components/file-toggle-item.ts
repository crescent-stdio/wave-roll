/**
 * MIDI file toggle item component
 */

import { PLAYER_ICONS } from "@/assets/player-icons";
import {
  getInstrumentIcon,
  CHEVRON_DOWN,
  CHEVRON_RIGHT,
} from "@/assets/instrument-icons";
import { MidiFileEntry } from "@/lib/core/midi";
import { TrackInfo } from "@/lib/midi/types";
import { UIComponentDependencies } from "@/lib/components/ui";
import { createIconButton } from "../../utils/icon-button";
import { FileVolumeControl } from "../../controls/file-volume";
import { ShapeRenderer } from "../utils/shape-renderer";
import { EvaluationControls } from "./evaluation-controls";

/**
 * Stores accordion expanded state per fileId.
 * Persists across re-renders so accordion doesn't collapse when track visibility changes.
 */
const accordionExpandedState = new Map<string, boolean>();

export class FileToggleItem {
  /**
   * Create a MIDI file toggle item with optional track accordion
   */
  static create(
    file: MidiFileEntry,
    dependencies: UIComponentDependencies
  ): HTMLElement {
    // Container for file row + track accordion
    const container = document.createElement("div");
    container.style.cssText = `display:flex;flex-direction:column;gap:0;`;

    const item = document.createElement("div");
    item.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 8px;
      background: var(--surface-alt);
      border-radius: 6px;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
      border: 1px solid var(--ui-border);
    `;

    // Check if this file has multiple tracks for accordion toggle
    const tracks = file.parsedData?.tracks;
    const hasMultipleTracks = tracks && tracks.length > 1;

    // Add accordion toggle chevron at the start if multi-track
    let chevronSpan: HTMLElement | null = null;
    let trackList: HTMLElement | null = null;
    let isExpanded = accordionExpandedState.get(file.id) ?? false;

    if (hasMultipleTracks) {
      chevronSpan = document.createElement("span");
      chevronSpan.innerHTML = isExpanded ? CHEVRON_DOWN : CHEVRON_RIGHT;
      chevronSpan.style.cssText =
        "display:flex;align-items:center;cursor:pointer;color:var(--text-muted);transition:transform 0.2s;";
      chevronSpan.title = `${tracks.length} tracks`;
      item.appendChild(chevronSpan);
    }

    // Add all components
    item.appendChild(this.createColorIndicator(file, dependencies));
    item.appendChild(this.createFileName(file));

    // Group REF/EST buttons to reduce spacing specifically between them
    const evalGroup = document.createElement("div");
    evalGroup.style.cssText = `display:flex;align-items:center;gap:2px;`;
    evalGroup.appendChild(this.createReferenceButton(file, dependencies, item));
    evalGroup.appendChild(
      this.createEstimationButton(file, dependencies, item)
    );
    item.appendChild(evalGroup);
    item.appendChild(this.createVisibilityButton(file, dependencies));
    item.appendChild(this.createSustainButton(file, dependencies));
    item.appendChild(this.createVolumeControl(file, dependencies));

    const { labelL, slider, labelR } = this.createPanControls(
      file,
      dependencies
    );
    item.appendChild(labelL);
    item.appendChild(slider);
    item.appendChild(labelR);

    // Dim/tooltip when master muted
    const handleMasterMirror = (e: Event) => {
      const detail = (
        e as CustomEvent<{
          mode: "mirror-mute" | "mirror-restore" | "mirror-set";
          volume?: number;
        }>
      ).detail;
      if (!detail || !detail.mode) return;
      if (detail.mode === "mirror-mute") {
        item.style.opacity = "0.6";
        item.title = "Master muted — changes apply after unmute";
      } else if (detail.mode === "mirror-restore") {
        item.style.opacity = "";
        item.removeAttribute("title");
      }
    };
    window.addEventListener("wr-master-mirror", handleMasterMirror);
    (item as any).__cleanupMasterMirror = () =>
      window.removeEventListener("wr-master-mirror", handleMasterMirror);

    container.appendChild(item);

    // Add track accordion for multi-track MIDI files
    if (hasMultipleTracks && chevronSpan) {
      const accordionResult = this.createTrackAccordion(
        file,
        tracks,
        dependencies,
        isExpanded
      );
      trackList = accordionResult.trackList;
      container.appendChild(trackList);

      // Toggle accordion on chevron click
      chevronSpan.onclick = (e: MouseEvent) => {
        e.stopPropagation();
        isExpanded = !isExpanded;
        accordionExpandedState.set(file.id, isExpanded);
        if (trackList) {
          trackList.style.display = isExpanded ? "flex" : "none";
        }
        if (chevronSpan) {
          chevronSpan.innerHTML = isExpanded ? CHEVRON_DOWN : CHEVRON_RIGHT;
        }
      };
    }

    return container;
  }

  /**
   * Create track accordion for multi-track MIDI files
   * Returns the track list element for external toggle control
   */
  private static createTrackAccordion(
    file: MidiFileEntry,
    tracks: TrackInfo[],
    dependencies: UIComponentDependencies,
    isExpanded: boolean
  ): { trackList: HTMLElement } {
    // Track list container - aligned with file row (chevron + colorIndicator width)
    const trackList = document.createElement("div");
    trackList.style.cssText = `display:${isExpanded ? "flex" : "none"};flex-direction:column;gap:1px;padding:4px 8px;background:var(--surface);border-radius:4px;margin-left:32px;margin-top:2px;`;

    // Sort tracks by MIDI program number (ascending)
    const sortedTracks = [...tracks].sort(
      (a, b) => (a.program ?? 0) - (b.program ?? 0)
    );

    // Populate track items
    sortedTracks.forEach((track: TrackInfo) => {
      const trackRow = document.createElement("div");
      trackRow.style.cssText =
        "display:flex;align-items:center;gap:8px;padding:2px 0;";

      // Instrument icon (first)
      const iconSpan = document.createElement("span");
      iconSpan.innerHTML = getInstrumentIcon(track.instrumentFamily);
      iconSpan.style.cssText =
        "display:flex;align-items:center;justify-content:center;width:18px;height:18px;color:var(--text-muted);";
      iconSpan.title = track.instrumentFamily;

      // Track name (second)
      const trackName = document.createElement("span");
      trackName.textContent = track.name;
      trackName.style.cssText =
        "flex:1;font-size:12px;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";

      // Eye icon button for track visibility (third)
      const isTrackVisible = dependencies.midiManager.isTrackVisible(
        file.id,
        track.id
      );
      const visBtn = createIconButton(
        isTrackVisible ? PLAYER_ICONS.eye_open : PLAYER_ICONS.eye_closed,
        () => {
          dependencies.midiManager.toggleTrackVisibility(file.id, track.id);
        },
        "Toggle track visibility",
        { size: 20 }
      );
      visBtn.onclick = (e: MouseEvent) => {
        e.stopPropagation();
        dependencies.midiManager.toggleTrackVisibility(file.id, track.id);
      };
      visBtn.style.color = isTrackVisible
        ? "var(--text-muted)"
        : "rgba(71,85,105,0.4)";
      visBtn.style.border = "none";
      visBtn.style.boxShadow = "none";
      visBtn.style.padding = "0";
      visBtn.style.minWidth = "20px";

      // Auto-instrument toggle button (fourth) - between Eye and Volume
      const isAutoInstrument =
        dependencies.midiManager.isTrackAutoInstrument?.(file.id, track.id) ??
        false;
      const autoInstrumentBtn = document.createElement("button");
      // Show piano icon when OFF (default piano), show track's instrument icon when ON (auto)
      autoInstrumentBtn.innerHTML = isAutoInstrument
        ? getInstrumentIcon(track.instrumentFamily)
        : getInstrumentIcon("piano");
      autoInstrumentBtn.style.cssText = `
        width: 20px;
        height: 20px;
        padding: 0;
        border: none;
        background: transparent;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        color: ${isAutoInstrument ? "var(--accent-primary, #3b82f6)" : "var(--text-muted)"};
        transition: color 0.15s ease;
        `;
      // margin-right: 28px;
      autoInstrumentBtn.title = isAutoInstrument
        ? `Using ${track.instrumentFamily} sound (click for piano)`
        : "Using piano sound (click for auto instrument)";
      autoInstrumentBtn.onclick = (e: MouseEvent) => {
        e.stopPropagation();
        const newState = !dependencies.midiManager.isTrackAutoInstrument?.(
          file.id,
          track.id
        );
        dependencies.midiManager.setTrackAutoInstrument?.(
          file.id,
          track.id,
          newState
        );
      };

      // Volume slider for track audio (fifth) - increased size
      const isTrackMuted = dependencies.midiManager.isTrackMuted(
        file.id,
        track.id
      );
      const trackVolume = dependencies.midiManager.getTrackVolume(
        file.id,
        track.id
      );
      const trackLastNonZeroVolume =
        dependencies.midiManager.getTrackLastNonZeroVolume(file.id, track.id);
      const volumeControl = new FileVolumeControl({
        initialVolume: isTrackMuted ? 0 : trackVolume,
        lastNonZeroVolume: trackLastNonZeroVolume,
        size: 22,
        onVolumeChange: (volume) => {
          dependencies.midiManager.setTrackVolume(file.id, track.id, volume);
          // Also toggle mute state based on volume
          const shouldMute = volume === 0;
          const currentlyMuted = dependencies.midiManager.isTrackMuted(
            file.id,
            track.id
          );
          if (shouldMute !== currentlyMuted) {
            dependencies.midiManager.toggleTrackMute(file.id, track.id);
          }
        },
      });
      const volumeEl = volumeControl.getElement();

      // Note count badge (fifth/last) - aligns with file row's L-slider-R (Pan control) ~106px
      const noteCount = document.createElement("span");
      noteCount.textContent = `${track.noteCount} notes`;
      noteCount.style.cssText =
        "font-size:10px;color:var(--text-muted);padding:2px 6px;background:var(--surface-alt);border-radius:10px;min-width:106px;text-align:center;";

      // Append in new order: InstrumentIcon | TrackName | Eye | AutoInstrument | Volume | NoteCount
      trackRow.appendChild(iconSpan);
      trackRow.appendChild(trackName);
      trackRow.appendChild(visBtn);
      trackRow.appendChild(autoInstrumentBtn);
      trackRow.appendChild(volumeEl);
      trackRow.appendChild(noteCount);
      trackList.appendChild(trackRow);
    });

    return { trackList };
  }

  private static createColorIndicator(
    file: MidiFileEntry,
    dependencies: UIComponentDependencies
  ): HTMLElement {
    const fileColor = `#${file.color.toString(16).padStart(6, "0")}`;
    return ShapeRenderer.createColorIndicator(
      file.id,
      fileColor,
      dependencies.stateManager as any
    );
  }

  private static createFileName(file: MidiFileEntry): HTMLElement {
    const fileName = document.createElement("span");
    fileName.textContent = file.name;
    fileName.style.cssText = `
      flex: 1;
      font-size: 14px;
      color: ${file.isPianoRollVisible ? "var(--text-primary)" : "var(--text-muted)"};
    `;
    return fileName;
  }

  private static createReferenceButton(
    file: MidiFileEntry,
    dependencies: UIComponentDependencies,
    container: HTMLElement
  ): HTMLButtonElement {
    const evalState = dependencies.stateManager.getState().evaluation;
    return EvaluationControls.createReferenceButton({
      fileId: file.id,
      isReference: evalState.refId === file.id,
      isEstimated: evalState.estIds.includes(file.id),
      dependencies,
      container: container.parentElement || container,
    });
  }

  private static createEstimationButton(
    file: MidiFileEntry,
    dependencies: UIComponentDependencies,
    container: HTMLElement
  ): HTMLButtonElement {
    const evalState = dependencies.stateManager.getState().evaluation;
    return EvaluationControls.createEstimationButton({
      fileId: file.id,
      isReference: evalState.refId === file.id,
      isEstimated: evalState.estIds.includes(file.id),
      dependencies,
      container: container.parentElement || container,
    });
  }

  private static createVisibilityButton(
    file: MidiFileEntry,
    dependencies: UIComponentDependencies
  ): HTMLButtonElement {
    const visBtn = createIconButton(
      file.isPianoRollVisible ? PLAYER_ICONS.eye_open : PLAYER_ICONS.eye_closed,
      () => dependencies.midiManager.toggleVisibility(file.id),
      "Toggle visibility",
      { size: 24 }
    );

    visBtn.style.color = file.isPianoRollVisible
      ? "var(--text-muted)"
      : "rgba(71,85,105,0.5)";
    visBtn.style.border = "none";
    visBtn.style.boxShadow = "none";

    return visBtn;
  }

  private static createSustainButton(
    file: MidiFileEntry,
    dependencies: UIComponentDependencies
  ): HTMLButtonElement {
    const sustainBtn = document.createElement("button");
    const isSustainVisible = file.isSustainVisible ?? true;
    sustainBtn.innerHTML = PLAYER_ICONS.sustain;
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

    return sustainBtn;
  }

  private static createVolumeControl(
    file: MidiFileEntry,
    dependencies: UIComponentDependencies
  ): HTMLElement {
    const volumeControl = new FileVolumeControl({
      initialVolume: file.isMuted ? 0 : (file.volume ?? 1.0),
      fileId: file.id,
      lastNonZeroVolume: file.volume ?? 1.0,
      onVolumeChange: (volume) => {
        // Update mute state based on volume
        const shouldMute = volume === 0;
        if (file.isMuted !== shouldMute) {
          dependencies.midiManager.toggleMute(file.id);
        }

        // Apply volume to the audio engine
        if (dependencies.audioPlayer?.setFileVolume) {
          dependencies.audioPlayer.setFileVolume(file.id, volume);
        }

        // Also explicitly call setFileMute to ensure mute state is properly set
        if (dependencies.audioPlayer?.setFileMute) {
          dependencies.audioPlayer.setFileMute(file.id, shouldMute);
        }

        // Update silence detector for tracking
        dependencies.silenceDetector?.setFileVolume?.(file.id, volume);
        dependencies.silenceDetector?.setFileMute?.(file.id, shouldMute);
      },
    });

    const el = volumeControl.getElement();
    el.setAttribute("data-role", "file-volume");
    el.setAttribute("data-file-id", file.id);
    return el;
  }

  private static createPanControls(
    file: MidiFileEntry,
    dependencies: UIComponentDependencies
  ): { labelL: HTMLElement; slider: HTMLInputElement; labelR: HTMLElement } {
    // Left label
    const labelL = document.createElement("span");
    labelL.textContent = "L";
    labelL.style.cssText = `font-size: 12px; color: #6c757d;`;

    // Right label
    const labelR = document.createElement("span");
    labelR.textContent = "R";
    labelR.style.cssText = `font-size: 12px; color: #6c757d;`;

    // Pan slider
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

      // Per-file panning in v2
      dependencies.audioPlayer?.setFilePan?.(file.id, panValue);
    });

    // Double-click -> reset to center (0)
    panSlider.addEventListener("dblclick", () => {
      panSlider.value = "0";
      if (dependencies.filePanValues) {
        dependencies.filePanValues[file.id] = 0;
      }

      dependencies.audioPlayer?.setFilePan?.(file.id, 0);
    });

    return { labelL, slider: panSlider, labelR };
  }
}
