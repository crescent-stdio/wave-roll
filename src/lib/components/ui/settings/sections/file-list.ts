import { UIComponentDependencies } from "../../types";
import { renderOnsetSVG } from "@/assets/onset-icons";
import { PLAYER_ICONS } from "@/assets/player-icons";
import { toHexColor } from "@/lib/core/utils/color";
import { parseMidi } from "@/lib/core/parsers/midi-parser";
import { MidiFileEntry } from "@/core/midi";
import { DEFAULT_PALETTES } from "@/lib/core/midi/palette";
import {
  computeNoteMetrics,
  DEFAULT_TOLERANCES,
} from "@/lib/evaluation/transcription";

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
      const renderOnsetSvg = (style: import("@/types").OnsetMarkerStyle, color: string) => renderOnsetSVG(style, color, 16);
      const ensuredStyle = dependencies.stateManager.ensureOnsetMarkerForFile(file.id);
      shapeHost.innerHTML = renderOnsetSvg(ensuredStyle, initialHex);
      swatchBtn.appendChild(shapeHost);

      // Hidden native color input (for OS picker)
      const colorInput = document.createElement("input");
      colorInput.type = "color";
      colorInput.value = initialHex;
      colorInput.style.cssText =
        "position:absolute;opacity:0;width:0;height:0;border:0;padding:0;";

      // Palette dropdown button
      const paletteBtn = document.createElement("button");
      paletteBtn.type = "button";
      paletteBtn.title = "Choose from palette";
      paletteBtn.innerHTML = PLAYER_ICONS.palette;
      paletteBtn.style.cssText =
        "width:20px;height:20px;border:none;background:transparent;cursor:pointer;margin-left:4px;display:flex;align-items:center;justify-content:center;color:var(--text-muted);";

      // Palette dropdown
      const paletteDropdown = document.createElement("div");
      paletteDropdown.style.cssText =
        "position:absolute;top:100%;left:0;background:var(--surface);border:1px solid var(--ui-border);border-radius:4px;box-shadow:0 2px 8px rgba(0,0,0,0.1);z-index:1000;display:none;padding:8px;min-width:120px;";

      // Get current palette colors
      const currentPalette =
        dependencies.midiManager.getState().activePaletteId;
      const allPalettes = [
        ...DEFAULT_PALETTES,
        ...dependencies.midiManager.getState().customPalettes,
      ];
      const palette =
        allPalettes.find((p) => p.id === currentPalette) || DEFAULT_PALETTES[0];

      // Create palette color swatches
      palette.colors.forEach((color) => {
        const swatch = document.createElement("button");
        swatch.type = "button";
        swatch.style.cssText = `width:20px;height:20px;border-radius:3px;border:1px solid var(--ui-border);background:${toHexColor(color)};cursor:pointer;margin:2px;`;
        swatch.title = `Select ${toHexColor(color)}`;

        swatch.onclick = () => {
          dependencies.midiManager.updateColor(file.id, color);
          const styleNow = dependencies.stateManager.getOnsetMarkerForFile(file.id) || ensuredStyle;
          shapeHost.innerHTML = renderOnsetSvg(styleNow, toHexColor(color));
          paletteDropdown.style.display = "none";
        };

        paletteDropdown.appendChild(swatch);
      });

      // Open picker when swatch clicked
      swatchBtn.onclick = () => colorInput.click();

      // Toggle palette dropdown
      paletteBtn.onclick = (e) => {
        e.stopPropagation();
        paletteDropdown.style.display =
          paletteDropdown.style.display === "none" ? "block" : "none";
      };

      // Close dropdown when clicking outside
      document.addEventListener("click", () => {
        paletteDropdown.style.display = "none";
      });

      // Handle color change from native picker
      colorInput.onchange = (e) => {
        const hex = (e.target as HTMLInputElement).value;

        // Update application state
        dependencies.midiManager.updateColor(
          file.id,
          parseInt(hex.substring(1), 16)
        );

        // Update swatch shape color
        const styleNow = dependencies.stateManager.getOnsetMarkerForFile(file.id) || ensuredStyle;
        shapeHost.innerHTML = renderOnsetSvg(styleNow, hex);
      };

      // Mount color input inside button (keeps DOM grouped)
      swatchBtn.appendChild(colorInput);
      colorPickerContainer.appendChild(swatchBtn);
      colorPickerContainer.appendChild(paletteBtn);
      colorPickerContainer.appendChild(paletteDropdown);

      // ---- Onset marker selector ----
      const markerContainer = document.createElement("div");
      markerContainer.style.cssText = "position:relative;display:flex;align-items:center;";
      const markerBtn = document.createElement("button");
      markerBtn.type = "button";
      markerBtn.title = "Choose onset marker";
      markerBtn.style.cssText =
        "width:24px;height:24px;border-radius:4px;border:1px solid var(--ui-border);cursor:pointer;background:transparent;position:relative;padding:0;display:flex;align-items:center;justify-content:center;margin-left:6px;";
      const markerHost = document.createElement("div");
      markerHost.style.cssText = "width:18px;height:18px;display:flex;align-items:center;justify-content:center;";


      // Resolve current style (ensure one exists)
      const ensured = dependencies.stateManager.ensureOnsetMarkerForFile(file.id);
      markerHost.innerHTML = renderOnsetSvg(ensured, initialHex);
      markerBtn.appendChild(markerHost);

      const markerDropdown = document.createElement("div");
      markerDropdown.style.cssText =
        "position:absolute;top:100%;left:0;background:var(--surface);border:1px solid var(--ui-border);border-radius:4px;box-shadow:0 2px 8px rgba(0,0,0,0.1);z-index:1000;display:none;padding:8px;min-width:160px;";

      // Build grid of shapes (filled + outlined)
      const wrapper = document.createElement("div");
      wrapper.style.cssText = "display:grid;grid-template-columns:repeat(7,24px);gap:6px;";
      const SHAPES: import("@/types").OnsetMarkerShape[] = [
        "circle","square","diamond","triangle-up","triangle-down","triangle-left","triangle-right",
        "star","cross","plus","hexagon","pentagon","chevron-up","chevron-down"
      ];
      const VARIANTS: Array<import("@/types").OnsetMarkerStyle["variant"]> = ["filled","outlined"];
      VARIANTS.forEach((variant) => {
        SHAPES.forEach((shape) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.style.cssText = "width:24px;height:24px;border:1px solid var(--ui-border);border-radius:4px;background:var(--surface);display:flex;align-items:center;justify-content:center;cursor:pointer;";
          const style: import("@/types").OnsetMarkerStyle = { shape, variant, size: 12, strokeWidth: 2 };
          btn.innerHTML = renderOnsetSvg(style, initialHex);
          btn.onclick = () => {
            dependencies.stateManager.setOnsetMarkerForFile(file.id, style);
            markerHost.innerHTML = renderOnsetSvg(style, initialHex);
            // Keep color swatch shape in sync as well
            shapeHost.innerHTML = renderOnsetSvg(style, toHexColor(file.color));
            markerDropdown.style.display = "none";
          };
          wrapper.appendChild(btn);
        });
      });
      markerDropdown.appendChild(wrapper);

      markerBtn.onclick = (e) => {
        e.stopPropagation();
        markerDropdown.style.display = markerDropdown.style.display === "none" ? "block" : "none";
      };
      document.addEventListener("click", () => { markerDropdown.style.display = "none"; });

      markerContainer.appendChild(markerBtn);
      markerContainer.appendChild(markerDropdown);

      // Name editor
      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.value = file.displayName;
      nameInput.onchange = (e) => {
        dependencies.midiManager.updateDisplayName(
          file.id,
          (e.target as HTMLInputElement).value
        );
      };
      nameInput.style.cssText =
        "flex:1;padding:4px 6px;border:1px solid var(--ui-border);border-radius:4px;background:var(--surface);color:var(--text-primary);";

      // Delete button
      const delBtn = document.createElement("button");
      delBtn.innerHTML = PLAYER_ICONS.trash;
      delBtn.style.cssText =
        "border:none;background:transparent;cursor:pointer;width:24px;height:24px;display:flex;align-items:center;justify-content:center;color:var(--text-muted);";
      delBtn.onclick = () => {
        if (confirm(`Delete ${file.displayName}?`)) {
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
      [swatchBtn, paletteBtn, nameInput, delBtn].forEach((element) => {
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
      row.appendChild(markerContainer);
      row.appendChild(nameInput);
      row.appendChild(delBtn);
      fileList.appendChild(row);
    });

    /* ---------- Add MIDI button ---------- */
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

    addBtn.onclick = () => hiddenInput.click();

    hiddenInput.onchange = async (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || []);
      if (files.length === 0) return;

      for (const file of files) {
        try {
          const state = dependencies.stateManager?.getState();
          const pedalElongate = state?.visual.pedalElongate ?? true;
          const pedalThreshold = state?.visual.pedalThreshold ?? 64;
          const parsed = await parseMidi(file, { 
            applyPedalElongate: pedalElongate,
            pedalThreshold: pedalThreshold 
          });
          dependencies.midiManager.addMidiFile(file.name, parsed, undefined, file);
        } catch (err) {
          console.error("Failed to parse MIDI", err);
        }
      }
      refreshFileList();
      hiddenInput.value = "";
    };

    fileList.appendChild(addBtn);
  };

  // Initial render
  refreshFileList();

  // Optional: auto‑refresh if the manager exposes a subscribe method
  if (typeof dependencies.midiManager.subscribe === "function") {
    dependencies.midiManager.subscribe(refreshFileList);
  }
  return filesSection;
}
