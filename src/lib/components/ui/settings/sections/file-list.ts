import { UIComponentDependencies } from "../../types";
import { PLAYER_ICONS } from "@/assets/player-icons";
import { toHexColor } from "@/lib/core/utils/color";
import { parseMidi } from "@/lib/core/parsers/midi-parser";
import { MidiFileEntry } from "@/core/midi";
import { DEFAULT_PALETTES } from "@/lib/core/midi/palette";

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
    fileList.removeEventListener("dragover", containerDragOver as any);
    fileList.removeEventListener("drop", containerDrop as any);
    fileList.addEventListener("dragover", containerDragOver);
    fileList.addEventListener("drop", containerDrop);

    currentFiles.forEach((file: MidiFileEntry, idx: number) => {
      // Row wrapper
      const row = document.createElement("div");
      row.style.cssText =
        "display:flex;align-items:center;gap:8px;background:#f8f9fa;padding:8px;border-radius:6px;";

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
        "cursor:grab;color:#6c757d;display:flex;align-items:center;justify-content:center;width:18px;user-select:none;";

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

      // Visible swatch button
      const swatchBtn = document.createElement("button");
      swatchBtn.type = "button";
      swatchBtn.title = "Click to change color";
      swatchBtn.style.cssText = `width:24px;height:24px;border-radius:4px;border:1px solid #ced4da;cursor:pointer;background:${initialHex};position:relative;padding:0;`;

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
        "width:20px;height:20px;border:none;background:transparent;cursor:pointer;margin-left:4px;display:flex;align-items:center;justify-content:center;";

      // Palette dropdown
      const paletteDropdown = document.createElement("div");
      paletteDropdown.style.cssText =
        "position:absolute;top:100%;left:0;background:white;border:1px solid #ced4da;border-radius:4px;box-shadow:0 2px 8px rgba(0,0,0,0.1);z-index:1000;display:none;padding:8px;min-width:120px;";

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
        swatch.style.cssText = `width:20px;height:20px;border-radius:3px;border:1px solid #ced4da;background:${toHexColor(color)};cursor:pointer;margin:2px;`;
        swatch.title = `Select ${toHexColor(color)}`;

        swatch.onclick = () => {
          dependencies.midiManager.updateColor(file.id, color);
          swatchBtn.style.background = toHexColor(color);
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

        // Update swatch fill
        swatchBtn.style.background = hex;
      };

      // Mount color input inside button (keeps DOM grouped)
      swatchBtn.appendChild(colorInput);
      colorPickerContainer.appendChild(swatchBtn);
      colorPickerContainer.appendChild(paletteBtn);
      colorPickerContainer.appendChild(paletteDropdown);

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
        "flex:1;padding:4px 6px;border:1px solid #ced4da;border-radius:4px;";

      // Delete button
      const delBtn = document.createElement("button");
      delBtn.innerHTML = PLAYER_ICONS.trash;
      delBtn.style.cssText =
        "border:none;background:transparent;cursor:pointer;width:24px;height:24px;display:flex;align-items:center;justify-content:center;";
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

      // Prevent drag on the rest of the row – only the handle should initiate it.
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
        row.style.outline = "2px dashed #3b82f6"; // Tailwind's blue-500
      });

      // Clear highlight when leaving the row
      row.addEventListener("dragleave", () => {
        row.style.outline = "none";
      });

      // Handle drag over (handle) – allows dropping directly on the handle area
      handle.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.stopPropagation();
        row.style.outline = "2px dashed #3b82f6";
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
      row.appendChild(delBtn);
      fileList.appendChild(row);
    });

    /* ---------- Add MIDI button ---------- */
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.textContent = "Add MIDI Files";
    addBtn.style.cssText =
      "margin-top:12px;padding:8px;border:1px solid #ced4da;border-radius:6px;background:#fff;cursor:pointer;font-size:14px;";

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
          const parsed = await parseMidi(file);
          dependencies.midiManager.addMidiFile(file.name, parsed);
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
  if (typeof (dependencies.midiManager as any).subscribe === "function") {
    (dependencies.midiManager as any).subscribe(refreshFileList);
  }

  return filesSection;
}
