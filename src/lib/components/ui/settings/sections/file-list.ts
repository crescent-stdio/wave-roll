import { UIComponentDependencies } from "../../types";

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

    dependencies.midiManager.getState().files.forEach((file: any) => {
      // Row wrapper
      const row = document.createElement("div");
      row.style.cssText =
        "display:flex;align-items:center;gap:8px;background:#f8f9fa;padding:8px;border-radius:6px;";

      // Color picker
      const colorInput = document.createElement("input");
      colorInput.type = "color";
      colorInput.value = `#${file.color.toString(16).padStart(6, "0")}`;
      colorInput.onchange = (e) => {
        const hex = (e.target as HTMLInputElement).value;
        dependencies.midiManager.updateColor(
          file.id,
          parseInt(hex.substring(1), 16)
        );
      };

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
      delBtn.textContent = "🗑";
      delBtn.style.cssText =
        "border:none;background:transparent;cursor:pointer;font-size:16px;";
      delBtn.onclick = () => {
        if (confirm(`Delete ${file.displayName}?`)) {
          dependencies.midiManager.removeMidiFile(file.id);
          refreshFileList();
        }
      };

      row.appendChild(colorInput);
      row.appendChild(nameInput);
      row.appendChild(delBtn);
      fileList.appendChild(row);
    });
  };

  // Initial render
  refreshFileList();

  // Optional: auto‑refresh if the manager exposes a subscribe method
  if (typeof (dependencies.midiManager as any).subscribe === "function") {
    (dependencies.midiManager as any).subscribe(refreshFileList);
  }

  return filesSection;
}
