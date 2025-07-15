import { UIComponentDependencies } from "../../types";
import { PLAYER_ICONS } from "@/assets/player-icons";
import { parseMidi } from "@/lib/core/parsers/midi-parser";

/**
 * Build the “MIDI Files” list section of the settings modal.
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

    dependencies.midiManager
      .getState()
      .files.forEach((file: any, idx: number) => {
        // Row wrapper
        const row = document.createElement("div");
        row.style.cssText =
          "display:flex;align-items:center;gap:8px;background:#f8f9fa;padding:8px;border-radius:6px;";

        // Drag handle
        const handle = document.createElement("span");
        handle.innerHTML = PLAYER_ICONS.menu;
        handle.style.cssText =
          "cursor:grab;color:#6c757d;display:flex;align-items:center;justify-content:center;width:18px;";

        // Use handle to start drag so the whole row isn't accidentally dragged.
        handle.addEventListener("mousedown", () => {
          row.draggable = true;
        });
        handle.addEventListener("mouseup", () => {
          row.draggable = false;
        });

        // ---- Color picker (swatch + hidden native input) ----
        const initialHex = `#${file.color.toString(16).padStart(6, "0")}`;

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

        // Open picker when swatch clicked
        swatchBtn.onclick = () => colorInput.click();

        // Handle color change
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
        row.draggable = true;
        row.dataset.index = idx.toString();

        row.addEventListener("dragstart", (e) => {
          (e.dataTransfer as DataTransfer).effectAllowed = "move";
          (e.dataTransfer as DataTransfer).setData(
            "text/plain",
            idx.toString()
          );
          row.style.opacity = "0.6";
        });

        row.addEventListener("dragend", () => {
          row.style.opacity = "1";
        });

        row.addEventListener("dragover", (e) => {
          e.preventDefault();
        });

        row.addEventListener("drop", (e) => {
          e.preventDefault();
          const sourceIndex = parseInt(
            (e.dataTransfer as DataTransfer).getData("text/plain"),
            10
          );
          const targetIndex = idx;
          if (!Number.isNaN(sourceIndex)) {
            dependencies.midiManager.reorderFiles(sourceIndex, targetIndex);
            refreshFileList();
          }
        });

        row.appendChild(handle);
        row.appendChild(swatchBtn);
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
