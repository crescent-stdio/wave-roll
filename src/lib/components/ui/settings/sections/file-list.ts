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
import { createIconButton } from "@/lib/components/ui/utils/icon-button";

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

  // Header
  const filesHeader = document.createElement("h3");
  filesHeader.textContent = "MIDI Files";
  filesHeader.style.cssText = "margin:0 0 12px;font-size:16px;font-weight:600;";
  filesSection.appendChild(filesHeader);

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
    const containerDragOver = (e: DragEvent) => {
      e.preventDefault();
    };

    const containerDrop = (e: DragEvent) => {
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

      // Handle drag over (row)
      row.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Highlight potential drop target for live feedback
        row.style.outline = "2px dashed var(--focus-ring)"; // focus color
      });

      // Clear highlight when leaving the row
      row.addEventListener("dragleave", () => {
        row.style.outline = "none";
      });

      // Handle drag over (handle) - allows dropping directly on the handle area
      handle.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.stopPropagation();
        row.style.outline = "2px dashed var(--focus-ring)";
      });

      // Unified drop handler
      const onDrop = (targetIndex: number) => (e: DragEvent) => {
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

      row.appendChild(handle);
      row.appendChild(colorPickerContainer);
      row.appendChild(nameInput);
      if (canRemove) {
        row.appendChild(delBtn);
      }
      fileList.appendChild(row);

      // ---- Track Accordion (for multi-track MIDI files) ----
      const tracks = file.parsedData?.tracks;
      if (tracks && tracks.length > 1) {
        // Restore expanded state from module-level Map
        let isExpanded = accordionExpandedState.get(file.id) ?? false;

        // Create accordion container
        const accordionContainer = document.createElement("div");
        accordionContainer.style.cssText =
          "margin-left:26px;margin-top:4px;margin-bottom:4px;";

        // Accordion header (toggle button)
        const accordionHeader = document.createElement("button");
        accordionHeader.type = "button";
        accordionHeader.style.cssText =
          "display:flex;align-items:center;gap:6px;padding:4px 8px;border:none;background:transparent;cursor:pointer;color:var(--text-muted);font-size:12px;width:100%;text-align:left;";

        const chevronSpan = document.createElement("span");
        chevronSpan.innerHTML = isExpanded ? CHEVRON_DOWN : CHEVRON_RIGHT;
        chevronSpan.style.cssText =
          "display:flex;align-items:center;transition:transform 0.2s;";

        const trackCountText = document.createElement("span");
        trackCountText.textContent = `${tracks.length} tracks`;

        accordionHeader.appendChild(chevronSpan);
        accordionHeader.appendChild(trackCountText);

        // Track list (restore display state)
        const trackList = document.createElement("div");
        trackList.style.cssText = `display:${isExpanded ? "flex" : "none"};flex-direction:column;gap:4px;padding:8px;background:var(--surface);border-radius:4px;margin-top:4px;`;

        // Populate track items
        tracks.forEach((track: TrackInfo) => {
          const trackRow = document.createElement("div");
          trackRow.style.cssText =
            "display:flex;align-items:center;gap:8px;padding:4px;";

          // Eye icon button for track visibility (replaces checkbox)
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
            { size: 18 }
          );
          // Override onclick to add stopPropagation
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
          visBtn.style.minWidth = "18px";

          // Mute icon button for track audio
          const isTrackMuted = dependencies.midiManager.isTrackMuted(
            file.id,
            track.id
          );
          const muteBtn = createIconButton(
            isTrackMuted ? PLAYER_ICONS.mute : PLAYER_ICONS.volume,
            () => {
              dependencies.midiManager.toggleTrackMute(file.id, track.id);
            },
            "Toggle track mute",
            { size: 18 }
          );
          // Override onclick to add stopPropagation
          muteBtn.onclick = (e: MouseEvent) => {
            e.stopPropagation();
            dependencies.midiManager.toggleTrackMute(file.id, track.id);
          };
          muteBtn.style.color = isTrackMuted
            ? "rgba(71,85,105,0.4)"
            : "var(--text-muted)";
          muteBtn.style.border = "none";
          muteBtn.style.boxShadow = "none";
          muteBtn.style.padding = "0";
          muteBtn.style.minWidth = "18px";

          // Instrument icon
          const iconSpan = document.createElement("span");
          iconSpan.innerHTML = getInstrumentIcon(track.instrumentFamily);
          iconSpan.style.cssText =
            "display:flex;align-items:center;justify-content:center;width:16px;height:16px;color:var(--text-muted);";
          iconSpan.title = track.instrumentFamily;

          // Track name
          const trackName = document.createElement("span");
          trackName.textContent = track.name;
          trackName.style.cssText =
            "flex:1;font-size:12px;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";

          // Note count badge
          const noteCount = document.createElement("span");
          noteCount.textContent = `${track.noteCount} notes`;
          noteCount.style.cssText =
            "font-size:10px;color:var(--text-muted);padding:2px 6px;background:var(--surface-alt);border-radius:10px;";

          trackRow.appendChild(visBtn);
          trackRow.appendChild(muteBtn);
          trackRow.appendChild(iconSpan);
          trackRow.appendChild(trackName);
          trackRow.appendChild(noteCount);
          trackList.appendChild(trackRow);
        });

        // Toggle accordion on header click and persist state
        accordionHeader.onclick = () => {
          isExpanded = !isExpanded;
          accordionExpandedState.set(file.id, isExpanded);
          trackList.style.display = isExpanded ? "flex" : "none";
          chevronSpan.innerHTML = isExpanded ? CHEVRON_DOWN : CHEVRON_RIGHT;
        };

        accordionContainer.appendChild(accordionHeader);
        accordionContainer.appendChild(trackList);
        fileList.appendChild(accordionContainer);
      }
    });

    /* ---------- Add MIDI button ---------- */
    const canAdd = dependencies.permissions?.canAddFiles !== false;
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.textContent = "Add MIDI Files";
    addBtn.style.cssText =
      "margin-top:12px;padding:8px;border:1px solid var(--ui-border);border-radius:6px;background:var(--surface);cursor:pointer;font-size:14px;color:var(--text-primary);";

    const hiddenInput = document.createElement("input");
    hiddenInput.type = "file";
    hiddenInput.accept = ".mid,.midi";
    hiddenInput.multiple = true;
    hiddenInput.style.display = "none";

    addBtn.onclick = () => {
      if (canAdd) hiddenInput.click();
    };

    hiddenInput.onchange = async (e) => {
      if (!canAdd) {
        return;
      }
      const files = Array.from((e.target as HTMLInputElement).files || []);
      if (files.length === 0) return;

      for (const file of files) {
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
          console.error("Failed to parse MIDI", err);
        }
      }
      refreshFileList();
      hiddenInput.value = "";
    };
    if (canAdd) {
      fileList.appendChild(addBtn);
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
