import { UIComponentDependencies } from "../../types";
import { renderOnsetSVG } from "@/assets/onset-icons";
import { openOnsetPicker } from "../components/onset-picker";
import { PLAYER_ICONS } from "@/assets/player-icons";
import {
  getInstrumentIcon,
  CHEVRON_DOWN,
  CHEVRON_RIGHT,
} from "@/assets/instrument-icons";
import { toHexColor } from "@/lib/core/utils/color";
import { parseMidi } from "@/lib/core/parsers/midi-parser";
import { MidiFileEntry } from "@/core/midi";
import { TrackInfo } from "@/lib/midi/types";
import { DEFAULT_PALETTES } from "@/lib/core/midi/palette";
import {
  computeNoteMetrics,
  DEFAULT_TOLERANCES,
} from "@/lib/evaluation/transcription";

/** Supported MIDI file extensions */
const MIDI_EXTENSIONS = [".mid", ".midi"];

/**
 * Stores accordion expanded state per fileId.
 * Persists across re-renders so accordion doesn't collapse when track visibility changes.
 */
const accordionExpandedState = new Map<string, boolean>();

/**
 * Build the "MIDI Files" list section of the settings modal.
 * Returns the root <div> so the caller can append it to the modal.
 *
 * @param dependencies - The UI component dependencies.
 * @returns The root <div> for the file list section.
 */
export function createFileList(
  dependencies: UIComponentDependencies
): HTMLElement {
  // Section wrapper
  const filesSection = document.createElement("div");

  // Header row with title and uniform track color toggle
  const headerRow = document.createElement("div");
  headerRow.style.cssText =
    "display:flex;align-items:center;justify-content:space-between;margin:0 0 12px;";

  // Header
  const filesHeader = document.createElement("h3");
  filesHeader.textContent = "MIDI Files";
  filesHeader.style.cssText = "margin:0;font-size:16px;font-weight:600;";
  headerRow.appendChild(filesHeader);

  // Uniform Track Color toggle
  const uniformColorToggle = document.createElement("label");
  uniformColorToggle.style.cssText =
    "display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-muted);cursor:pointer;";

  const uniformColorCheckbox = document.createElement("input");
  uniformColorCheckbox.type = "checkbox";
  uniformColorCheckbox.checked =
    dependencies.stateManager.getState().visual.uniformTrackColor ?? false;
  uniformColorCheckbox.style.cssText = "cursor:pointer;";
  uniformColorCheckbox.onchange = () => {
    dependencies.stateManager.updateVisualState({
      uniformTrackColor: uniformColorCheckbox.checked,
    });
    // Refresh the file list to update track color dots
    refreshFileList();
  };

  const uniformColorLabel = document.createElement("span");
  uniformColorLabel.textContent = "Uniform Track Color";

  uniformColorToggle.appendChild(uniformColorCheckbox);
  uniformColorToggle.appendChild(uniformColorLabel);
  headerRow.appendChild(uniformColorToggle);

  filesSection.appendChild(headerRow);

  // List container
  const fileList = document.createElement("div");
  fileList.style.cssText = "display:flex;flex-direction:column;gap:8px;";
  filesSection.appendChild(fileList);

  /** Re-render the list from the current manager state. */
  const refreshFileList = () => {
    fileList.innerHTML = "";

    const currentFiles = dependencies.midiManager.getState().files;
    const canRemove = dependencies.permissions?.canRemoveFiles !== false;

    // ---- Enable container-level dragover / drop so that
    //      users can drop _below_ the last item (e.g. when only 2 files)
    //      Only for internal reorder - external file drops go to the drop zone
    const containerDragOver = (e: DragEvent) => {
      // Ignore external file drops
      if (e.dataTransfer?.types.includes("Files")) {
        return;
      }
      e.preventDefault();
    };

    const containerDrop = (e: DragEvent) => {
      // Ignore external file drops
      if (e.dataTransfer?.types.includes("Files")) {
        return;
      }
      e.preventDefault();
      const sourceIndex = parseInt(
        (e.dataTransfer as DataTransfer).getData("text/plain"),
        10
      );
      if (Number.isNaN(sourceIndex)) return;

      // If dropped on empty space, move item to the end
      const targetIndex = currentFiles.length - 1;
      if (sourceIndex !== targetIndex) {
        dependencies.midiManager.reorderFiles(sourceIndex, targetIndex);
        refreshFileList();
      }
    };

    // (Re)attach once per render to avoid duplicates
    fileList.removeEventListener("dragover", containerDragOver);
    fileList.removeEventListener("drop", containerDrop);
    fileList.addEventListener("dragover", containerDragOver);
    fileList.addEventListener("drop", containerDrop);

    currentFiles.forEach((file: MidiFileEntry, idx: number) => {
      // Row wrapper
      const row = document.createElement("div");
      row.style.cssText =
        "display:flex;align-items:center;gap:8px;background:var(--surface-alt);padding:8px;border-radius:6px;";

      // console.log("[file-list]", file.fileName, file.color);
      // Drag handle
      const handle = document.createElement("span");
      handle.id = `file-list-handle-${file.id}`;
      /* Make the handle itself draggable so users can start dragging by grabbing the icon.
         This avoids browsers ignoring drag attempts that originate from non-draggable descendants
         and fixes a bug where the drag cursor never appeared when only the default sample files
         were loaded. */
      handle.draggable = true;
      handle.innerHTML = PLAYER_ICONS.menu;
      handle.style.cssText =
        "cursor:grab;color:var(--text-muted);display:flex;align-items:center;justify-content:center;width:18px;user-select:none;";

      // Prevent drag on other elements
      const preventDrag = (e: Event) => {
        e.stopPropagation();
      };

      // ---- Color picker (swatch + dropdown) ----
      const initialHex = toHexColor(file.color);

      // Color picker container
      const colorPickerContainer = document.createElement("div");
      colorPickerContainer.style.cssText =
        "position:relative;display:flex;align-items:center;";

      // Visible swatch button (uses onset-like shape)
      const swatchBtn = document.createElement("button");
      swatchBtn.type = "button";
      swatchBtn.title = "Click to change color";
      swatchBtn.style.cssText = `width:24px;height:24px;border-radius:4px;border:1px solid var(--ui-border);cursor:pointer;background:transparent;position:relative;padding:0;display:flex;align-items:center;justify-content:center;`;
      const shapeHost = document.createElement("div");
      shapeHost.style.cssText = `width:18px;height:18px;display:flex;align-items:center;justify-content:center;`;
      // Unified onset marker SVG renderer for both swatch and marker picker
      const renderOnsetSvg = (
        style: import("@/types").OnsetMarkerStyle,
        color: string
      ) => renderOnsetSVG(style, color, 16);
      const ensuredStyle = dependencies.stateManager.ensureOnsetMarkerForFile(
        file.id
      );
      shapeHost.innerHTML = renderOnsetSvg(ensuredStyle, initialHex);
      swatchBtn.appendChild(shapeHost);

      // Hidden native color input (for OS picker)
      const colorInput = document.createElement("input");
      colorInput.type = "color";
      colorInput.value = initialHex;
      colorInput.style.cssText =
        "position:absolute;opacity:0;width:0;height:0;border:0;padding:0;";

      // Unified picker trigger (clicking the swatch opens the combined picker)
      swatchBtn.onclick = (e) => {
        openOnsetPicker(dependencies, file.id, swatchBtn, (style, hex) => {
          shapeHost.innerHTML = renderOnsetSvg(style, hex);
        });
      };

      // Handle color change from native picker
      colorInput.onchange = (e) => {
        const hex = (e.target as HTMLInputElement).value;

        // Update application state
        dependencies.midiManager.updateColor(
          file.id,
          parseInt(hex.substring(1), 16)
        );

        // Update swatch shape color
        const styleNow =
          dependencies.stateManager.getOnsetMarkerForFile(file.id) ||
          ensuredStyle;
        shapeHost.innerHTML = renderOnsetSvg(styleNow, hex);
      };

      // Mount color input inside button (keeps DOM grouped)
      swatchBtn.appendChild(colorInput);
      colorPickerContainer.appendChild(swatchBtn);
      // No separate palette button anymore (consolidated in the picker)

      // (Legacy) separate onset marker button removed — unified picker handles both

      // Name editor
      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.value = file.name;
      nameInput.onchange = (e) => {
        dependencies.midiManager.updateName(
          file.id,
          (e.target as HTMLInputElement).value
        );
      };
      nameInput.style.cssText =
        "flex:1;padding:4px 6px;border:1px solid var(--ui-border);border-radius:4px;background:var(--surface);color:var(--text-primary);";

      // Delete button (hidden in readonly / when canRemove is false)
      const delBtn = document.createElement("button");
      delBtn.setAttribute("aria-label", "Delete MIDI file");
      delBtn.innerHTML = PLAYER_ICONS.trash;
      delBtn.style.cssText =
        "border:none;background:transparent;cursor:pointer;width:24px;height:24px;display:flex;align-items:center;justify-content:center;color:var(--text-muted);";
      delBtn.onclick = () => {
        if (!canRemove) {
          return;
        }
        if (confirm(`Delete ${file.name}?`)) {
          dependencies.midiManager.removeMidiFile(file.id);
          refreshFileList();
        }
      };

      /* ---------------- drag & drop --------------- */
      // The logical order of the item in the list
      row.dataset.index = idx.toString();

      // ----- Drag start / end originate from the HANDLE -----
      /*
       * Begin dragging from the handle. We store the logical index of the row in
       * the DataTransfer payload so that the drop target can read it back.  Using
       * `row.dataset.index` (instead of the lexical `idx` variable) guarantees
       * the correct index even after a state refresh, which fixes an edge-case
       * where reordering two files sometimes failed on subsequent drags.
       */
      handle.addEventListener("dragstart", (e) => {
        (e.dataTransfer as DataTransfer).effectAllowed = "move";
        (e.dataTransfer as DataTransfer).setData(
          "text/plain",
          (row.dataset.index || "0").toString()
        );
        // Provide visual feedback while dragging
        row.style.opacity = "0.6";
        handle.style.cursor = "grabbing";
      });

      handle.addEventListener("dragend", () => {
        row.style.opacity = "1";
        handle.style.cursor = "grab";
        row.style.outline = "none";
      });

      // Prevent drag on the rest of the row - only the handle should initiate it.
      row.draggable = false;

      // Prevent drag on interactive elements
      [swatchBtn, nameInput, delBtn].forEach((element) => {
        element.addEventListener("mousedown", preventDrag);
        element.addEventListener("touchstart", preventDrag);
      });

      // Handle drag over (row) - only for internal reorder, not external file drops
      row.addEventListener("dragover", (e) => {
        // Ignore external file drops - those go to the drop zone only
        if (e.dataTransfer?.types.includes("Files")) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        // Highlight potential drop target for live feedback (internal reorder only)
        row.style.outline = "2px dashed var(--focus-ring)";
      });

      // Clear highlight when leaving the row
      row.addEventListener("dragleave", () => {
        row.style.outline = "none";
      });

      // Handle drag over (handle) - only for internal reorder
      handle.addEventListener("dragover", (e) => {
        // Ignore external file drops
        if (e.dataTransfer?.types.includes("Files")) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        row.style.outline = "2px dashed var(--focus-ring)";
      });

      // Unified drop handler - only for internal reorder
      const onDrop = (targetIndex: number) => (e: DragEvent) => {
        // Ignore external file drops - those go to the drop zone only
        if (e.dataTransfer?.types.includes("Files")) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        const sourceIndex = parseInt(
          (e.dataTransfer as DataTransfer).getData("text/plain"),
          10
        );
        if (!Number.isNaN(sourceIndex) && sourceIndex !== targetIndex) {
          dependencies.midiManager.reorderFiles(sourceIndex, targetIndex);
          refreshFileList();
        }
        // Remove any remaining highlight
        row.style.outline = "none";
      };

      // Attach drop listeners to both row and handle
      row.addEventListener("drop", onDrop(idx));
      handle.addEventListener("drop", onDrop(idx));

      // Check if this file has multiple tracks for accordion toggle
      const tracks = file.parsedData?.tracks;
      const hasMultipleTracks = tracks && tracks.length > 1;

      // Always create chevron space for alignment (empty for single-track files)
      let trackListEl: HTMLElement | null = null;
      let isExpanded = accordionExpandedState.get(file.id) ?? false;

      const chevronSpan = document.createElement("span");
      chevronSpan.style.cssText =
        "display:flex;align-items:center;width:16px;min-width:16px;";

      if (hasMultipleTracks) {
        chevronSpan.innerHTML = isExpanded ? CHEVRON_DOWN : CHEVRON_RIGHT;
        chevronSpan.style.cursor = "pointer";
        chevronSpan.style.color = "var(--text-muted)";
        chevronSpan.style.transition = "transform 0.2s";
        chevronSpan.title = `${tracks.length} tracks`;
      }

      row.appendChild(handle);
      row.appendChild(chevronSpan);
      row.appendChild(colorPickerContainer);
      row.appendChild(nameInput);
      if (canRemove) {
        row.appendChild(delBtn);
      }
      fileList.appendChild(row);

      // ---- Track Accordion (for multi-track MIDI files) ----
      if (hasMultipleTracks) {
        // Track list container - aligned with file row (handle + chevron + colorPicker width)
        trackListEl = document.createElement("div");
        trackListEl.style.cssText = `display:${isExpanded ? "flex" : "none"};flex-direction:column;gap:1px;padding:4px 8px;background:var(--surface);border-radius:4px;margin-left:60px;margin-top:2px;`;

        // Sort tracks: drums at the bottom, others by MIDI program number (ascending)
        const sortedTracks = [...tracks].sort((a, b) => {
          // Drums go to the bottom
          if (a.isDrum && !b.isDrum) return 1;
          if (!a.isDrum && b.isDrum) return -1;
          // Both drums or both non-drums: sort by program number
          return (a.program ?? 0) - (b.program ?? 0);
        });

        // Populate track items
        sortedTracks.forEach((track: TrackInfo) => {
          const trackRow = document.createElement("div");
          trackRow.style.cssText =
            "display:flex;align-items:center;gap:16px;padding:2px 0;";

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

          // Note count badge (third/last)
          const noteCount = document.createElement("span");
          noteCount.textContent = `${track.noteCount} notes`;
          noteCount.style.cssText =
            "font-size:10px;color:var(--text-muted);padding:2px 6px;background:var(--surface-alt);border-radius:10px;text-align:right;";

          // Append in new order: InstrumentIcon | TrackName | NoteCount
          trackRow.appendChild(iconSpan);
          trackRow.appendChild(trackName);
          trackRow.appendChild(noteCount);
          trackListEl!.appendChild(trackRow);
        });

        fileList.appendChild(trackListEl);

        // Toggle accordion on chevron click
        chevronSpan.onclick = (e: MouseEvent) => {
          e.stopPropagation();
          isExpanded = !isExpanded;
          accordionExpandedState.set(file.id, isExpanded);
          if (trackListEl) {
            trackListEl.style.display = isExpanded ? "flex" : "none";
          }
          chevronSpan.innerHTML = isExpanded ? CHEVRON_DOWN : CHEVRON_RIGHT;
        };
      }
    });

    /* ---------- Unified Drop Zone ---------- */
    const canAdd = dependencies.permissions?.canAddFiles !== false;

    // Drop zone container with dashed border
    const dropZone = document.createElement("div");
    dropZone.style.cssText = `
      margin-top:12px;
      padding:16px;
      border:2px dashed var(--ui-border);
      border-radius:8px;
      background:var(--surface);
      cursor:pointer;
      text-align:center;
      transition:all 0.2s ease;
    `;

    // Drop zone content
    const dropZoneContent = document.createElement("div");
    dropZoneContent.style.cssText = "pointer-events:none;";

    const dropZoneTitle = document.createElement("div");
    dropZoneTitle.textContent = "+ Add MIDI Files";
    dropZoneTitle.style.cssText = "font-size:14px;font-weight:500;color:var(--text-primary);margin-bottom:4px;";

    const dropZoneHint = document.createElement("div");
    dropZoneHint.textContent = "Click or drag & drop MIDI files";
    dropZoneHint.style.cssText = "font-size:12px;color:var(--text-muted);margin-bottom:2px;";

    const dropZoneFormats = document.createElement("div");
    dropZoneFormats.textContent = ".mid, .midi";
    dropZoneFormats.style.cssText = "font-size:10px;color:var(--text-muted);opacity:0.7;";

    dropZoneContent.appendChild(dropZoneTitle);
    dropZoneContent.appendChild(dropZoneHint);
    dropZoneContent.appendChild(dropZoneFormats);
    dropZone.appendChild(dropZoneContent);

    // Hidden file input (MIDI files only)
    const hiddenInput = document.createElement("input");
    hiddenInput.type = "file";
    hiddenInput.accept = ".mid,.midi";
    hiddenInput.multiple = true;
    hiddenInput.style.display = "none";

    /**
     * Process dropped/selected MIDI files.
     */
    const processFiles = async (files: File[]) => {
      if (!canAdd || files.length === 0) return;

      for (const file of files) {
        const ext = file.name.toLowerCase().match(/\.[^.]+$/)?.[0] || "";

        if (MIDI_EXTENSIONS.includes(ext)) {
          // Process MIDI file
          try {
            const state = dependencies.stateManager?.getState();
            const pedalElongate = state?.visual.pedalElongate ?? true;
            const pedalThreshold = state?.visual.pedalThreshold ?? 64;
            const parsed = await parseMidi(file, {
              applyPedalElongate: pedalElongate,
              pedalThreshold: pedalThreshold,
            });
            dependencies.midiManager.addMidiFile(
              file.name,
              parsed,
              undefined,
              file
            );
          } catch (err) {
            console.error("Failed to parse MIDI:", err);
          }
        }
        // Non-MIDI files are silently ignored (audio files should be added via WAV File section)
      }

      refreshFileList();

      // Update main screen file toggle section if available
      const fileToggleContainer = document.querySelector('[data-role="file-toggle"]') as HTMLElement | null;
      if (fileToggleContainer) {
        const FileToggleManager = (window as any).FileToggleManager;
        if (FileToggleManager) {
          FileToggleManager.updateFileToggleSection(fileToggleContainer, dependencies);
        }
      }
    };

    // Click to open file picker (or trigger external callback)
    dropZone.onclick = () => {
      if (!canAdd) return;
      // If external callback is registered (e.g., VS Code integration), use it
      if (dependencies.onFileAddRequest) {
        dependencies.onFileAddRequest();
      } else {
        hiddenInput.click();
      }
    };

    // File input change handler
    hiddenInput.onchange = async (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || []);
      await processFiles(files);
      hiddenInput.value = "";
    };

    // Drag & drop visual feedback
    const setDropZoneHighlight = (active: boolean) => {
      if (active) {
        dropZone.style.borderColor = "var(--focus-ring)";
        dropZone.style.background = "var(--surface-alt)";
        dropZoneTitle.textContent = "Drop MIDI files here";
      } else {
        dropZone.style.borderColor = "var(--ui-border)";
        dropZone.style.background = "var(--surface)";
        dropZoneTitle.textContent = "+ Add MIDI Files";
      }
    };

    // Drag enter/over - check if it's external files (not internal reorder)
    dropZone.addEventListener("dragenter", (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Only highlight for external file drops
      if (e.dataTransfer?.types.includes("Files")) {
        setDropZoneHighlight(true);
      }
    });

    dropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer?.types.includes("Files")) {
        e.dataTransfer.dropEffect = "copy";
      }
    });

    dropZone.addEventListener("dragleave", (e) => {
      e.preventDefault();
      e.stopPropagation();
      setDropZoneHighlight(false);
    });

    // Drop handler for external files
    dropZone.addEventListener("drop", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      setDropZoneHighlight(false);

      // Only process if it's external files (not internal reorder)
      if (!e.dataTransfer?.types.includes("Files")) {
        return;
      }

      const files = Array.from(e.dataTransfer.files);
      await processFiles(files);
    });

    if (canAdd) {
      dropZone.appendChild(hiddenInput);
      fileList.appendChild(dropZone);
    }
  };

  // Initial render
  refreshFileList();

  // Optional: auto‑refresh if the manager exposes a subscribe method
  if (typeof dependencies.midiManager.subscribe === "function") {
    dependencies.midiManager.subscribe(refreshFileList);
  }
  return filesSection;
}
