import { UIComponentDependencies } from "../../types";
import { performMidiExport, generateExportFilename } from "@/lib/core/file/midi-export";

/** Default tempo when no audio player state is available */
const DEFAULT_TEMPO = 120;
const MIN_TEMPO = 20;
const MAX_TEMPO = 300;

/**
 * Create a MIDI export control group.
 *
 * - In solo mode: exports the first (single) file
 * - In multi mode: provides a dropdown to select which file to export
 *
 * @param deps - UI component dependencies
 * @returns HTMLElement containing the export UI
 */
export function createMidiExportGroup(
  deps: UIComponentDependencies
): HTMLElement {
  const container = document.createElement("div");
  container.style.cssText = `
    padding: 12px 0;
    border-top: 1px solid var(--ui-border);
  `;

  // Section title
  const title = document.createElement("div");
  title.textContent = "MIDI Export";
  title.style.cssText = `
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 12px;
  `;

  // Tempo input row
  const tempoInputRow = document.createElement("div");
  tempoInputRow.style.cssText = `
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
  `;

  const tempoLabel = document.createElement("label");
  tempoLabel.textContent = "Export tempo:";
  tempoLabel.style.cssText = `
    font-size: 12px;
    font-weight: 600;
    color: var(--text-primary);
  `;

  const tempoInput = document.createElement("input");
  tempoInput.type = "number";
  tempoInput.min = String(MIN_TEMPO);
  tempoInput.max = String(MAX_TEMPO);
  tempoInput.step = "1";
  tempoInput.style.cssText = `
    width: 64px;
    padding: 4px 6px;
    border: 1px solid var(--ui-border);
    border-radius: 6px;
    background: var(--surface);
    color: var(--text-primary);
    font-size: 12px;
    font-weight: 600;
    text-align: center;
  `;
  tempoInput.classList.add("wr-focusable");

  const bpmLabel = document.createElement("span");
  bpmLabel.textContent = "BPM";
  bpmLabel.style.cssText = `
    font-size: 12px;
    font-weight: 600;
    color: var(--text-primary);
  `;

  const getTempoState = () => {
    const state = deps.audioPlayer?.getState();
    const originalTempo = state?.originalTempo ?? DEFAULT_TEMPO;
    const currentTempo = state?.tempo ?? originalTempo;
    return { originalTempo, currentTempo };
  };

  // Export tempo state (independent from playback tempo)
  let exportTempo = Math.round(getTempoState().currentTempo);

  // Initialize input with current tempo
  tempoInput.value = String(exportTempo);

  // Confirm tempo on blur or Enter key
  const confirmTempo = () => {
    const inputValue = parseFloat(tempoInput.value);
    if (isNaN(inputValue) || inputValue <= 0) {
      tempoInput.value = String(exportTempo);
      return;
    }
    const clamped = Math.max(MIN_TEMPO, Math.min(MAX_TEMPO, Math.round(inputValue)));
    exportTempo = clamped;
    tempoInput.value = String(clamped);
  };

  tempoInput.addEventListener("blur", confirmTempo);
  tempoInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      confirmTempo();
      tempoInput.blur();
    }
  });

  // No auto-refresh: export tempo is independent from playback tempo
  const handleRefresh = () => {
    // Intentionally empty - export tempo should not change with playback tempo
  };
  document.addEventListener("wr-force-ui-refresh", handleRefresh);

  tempoInputRow.appendChild(tempoLabel);
  tempoInputRow.appendChild(tempoInput);
  tempoInputRow.appendChild(bpmLabel);

  // File selector (only for multi-mode)
  let fileSelect: HTMLSelectElement | null = null;
  const files = deps.midiManager.getState().files;

  if (!deps.soloMode && files.length > 1) {
    const selectRow = document.createElement("div");
    selectRow.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
    `;

    const selectLabel = document.createElement("label");
    selectLabel.textContent = "File:";
    selectLabel.style.cssText = `
      font-size: 13px;
      color: var(--text-secondary);
    `;

    fileSelect = document.createElement("select");
    fileSelect.style.cssText = `
      flex: 1;
      padding: 6px 8px;
      border: 1px solid var(--ui-border);
      border-radius: 4px;
      background: var(--panel-bg);
      color: var(--text-primary);
      font-size: 13px;
      cursor: pointer;
    `;

    files.forEach((file, index) => {
      const option = document.createElement("option");
      option.value = file.id;
      option.textContent = file.name || `File ${index + 1}`;
      fileSelect!.appendChild(option);
    });

    selectRow.appendChild(selectLabel);
    selectRow.appendChild(fileSelect);
    container.appendChild(title);
    container.appendChild(tempoInputRow);
    container.appendChild(selectRow);
  } else {
    container.appendChild(title);
    container.appendChild(tempoInputRow);
  }

  // Export button row
  const buttonRow = document.createElement("div");
  buttonRow.style.cssText = `
    display: flex;
    align-items: center;
    gap: 8px;
  `;

  const exportBtn = document.createElement("button");
  exportBtn.textContent = "Export MIDI";
  exportBtn.style.cssText = `
    padding: 8px 16px;
    border: none;
    border-radius: 6px;
    background: var(--accent);
    color: white;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.2s;
  `;

  exportBtn.addEventListener("mouseenter", () => {
    exportBtn.style.opacity = "0.9";
  });

  exportBtn.addEventListener("mouseleave", () => {
    exportBtn.style.opacity = "1";
  });

  // Status message
  const statusMsg = document.createElement("span");
  statusMsg.style.cssText = `
    font-size: 12px;
    color: var(--text-muted);
  `;

  // Export handler
  exportBtn.addEventListener("click", async () => {
    // Use the confirmed export tempo

    // Determine which file to export
    let targetFile = files[0]; // Default to first file
    if (fileSelect && fileSelect.value) {
      targetFile = files.find((f) => f.id === fileSelect.value) ?? files[0];
    }

    if (!targetFile) {
      statusMsg.textContent = "No file available to export";
      statusMsg.style.color = "var(--error, #ef4444)";
      return;
    }

    const originalInput = targetFile.originalInput;
    if (!originalInput) {
      statusMsg.textContent = "Original file data not available";
      statusMsg.style.color = "var(--error, #ef4444)";
      return;
    }

    // Disable button during export
    exportBtn.disabled = true;
    exportBtn.style.opacity = "0.6";
    statusMsg.textContent = "Exporting...";
    statusMsg.style.color = "var(--text-muted)";

    try {
      // Use midiExport options if provided, otherwise use saveAs mode (File System Access API)
      // Generate filename from actual file name (not Blob URL which gives UUID)
      const exportFilename = generateExportFilename(targetFile.name, exportTempo);
      const exportOptions = deps.midiExport ?? { mode: "saveAs" as const };
      await performMidiExport(originalInput, exportTempo, exportOptions, exportFilename);
      statusMsg.textContent = "Export complete!";
      statusMsg.style.color = "var(--success, #22c55e)";

      // Clear success message after 3 seconds
      setTimeout(() => {
        statusMsg.textContent = "";
      }, 3000);
    } catch (error) {
      console.error("MIDI export failed:", error);
      statusMsg.textContent = "Export failed";
      statusMsg.style.color = "var(--error, #ef4444)";
    } finally {
      exportBtn.disabled = false;
      exportBtn.style.opacity = "1";
    }
  });

  buttonRow.appendChild(exportBtn);
  buttonRow.appendChild(statusMsg);
  container.appendChild(buttonRow);

  // Description
  const description = document.createElement("div");
  description.style.cssText = `
    margin-top: 10px;
    font-size: 11px;
    color: var(--text-muted);
    line-height: 1.4;
  `;
  description.textContent =
    "Downloads the MIDI file with the specified tempo applied. Note positions remain unchanged; only the tempo metadata is modified.";
  container.appendChild(description);

  // Cleanup observer when removed from DOM
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.removedNodes) {
        if (node === container || (node instanceof Element && node.contains(container))) {
          document.removeEventListener("wr-force-ui-refresh", handleRefresh);
          observer.disconnect();
          return;
        }
      }
    }
  });

  requestAnimationFrame(() => {
    if (container.parentElement) {
      observer.observe(container.parentElement, { childList: true, subtree: true });
    }
  });

  return container;
}

