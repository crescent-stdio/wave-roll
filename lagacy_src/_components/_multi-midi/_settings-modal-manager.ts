import { UIComponentDependencies } from "./types";

/**
 * Handles the main MIDI settings modal for file management.
 */
export class SettingsModalManager {
  static openSettingsModal(dependencies: UIComponentDependencies): void {
    // Prevent multiple modals
    if (document.getElementById("multi-midi-settings-modal")) return;

    const overlay = document.createElement("div");
    overlay.id = "multi-midi-settings-modal";
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.5);
      display:flex;
      justify-content:center;
      align-items:center;
      z-index:2000;
    `;

    const modal = document.createElement("div");
    modal.style.cssText = `
      width:600px;max-width:95%;max-height:80vh;overflow-y:auto;
      background:#fff;border-radius:12px;padding:24px;display:flex;flex-direction:column;gap:24px;
    `;

    // Header
    const header = document.createElement("div");
    header.style.cssText = `display:flex;justify-content:space-between;align-items:center;`;
    const title = document.createElement("h2");
    title.textContent = "MIDI Settings";
    title.style.cssText = `margin:0;font-size:20px;font-weight:700;`;
    const closeBtn = document.createElement("button");
    closeBtn.textContent = "✕";
    closeBtn.style.cssText = `border:none;background:transparent;font-size:24px;cursor:pointer;color:#6c757d;`;
    closeBtn.onclick = () => overlay.remove();
    header.appendChild(title);
    header.appendChild(closeBtn);

    // Files section
    const filesSection = document.createElement("div");
    const filesHeader = document.createElement("h3");
    filesHeader.textContent = "MIDI Files";
    filesHeader.style.cssText = `margin:0 0 12px;font-size:16px;font-weight:600;`;
    filesSection.appendChild(filesHeader);

    const fileList = document.createElement("div");
    fileList.style.cssText = `display:flex;flex-direction:column;gap:8px;`;

    const refreshFileList = () => {
      fileList.innerHTML = "";
      dependencies.midiManager.getState().files.forEach((file: any) => {
        const row = document.createElement("div");
        row.style.cssText = `display:flex;align-items:center;gap:8px;background:#f8f9fa;padding:8px;border-radius:6px;`;

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

        const nameInput = document.createElement("input");
        nameInput.type = "text";
        nameInput.value = file.displayName;
        nameInput.onchange = (e) => {
          dependencies.midiManager.updateDisplayName(
            file.id,
            (e.target as HTMLInputElement).value
          );
        };
        nameInput.style.cssText = `flex:1;padding:4px 6px;border:1px solid #ced4da;border-radius:4px;`;

        const delBtn = document.createElement("button");
        delBtn.textContent = "🗑";
        delBtn.style.cssText = `border:none;background:transparent;cursor:pointer;font-size:16px;`;
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
    refreshFileList();

    filesSection.appendChild(fileList);
    modal.appendChild(header);
    modal.appendChild(filesSection);
    overlay.appendChild(modal);

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.remove();
    });

    document.body.appendChild(overlay);
  }
}
