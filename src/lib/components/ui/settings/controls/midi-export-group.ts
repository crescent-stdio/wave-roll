import { UIComponentDependencies } from "../../types";
import { exportMidiWithTempo } from "@/lib/core/file/midi-export";

/** Default tempo when no audio player state is available */
const DEFAULT_TEMPO = 120;

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

  // Tempo info display
  const tempoInfo = document.createElement("div");
  tempoInfo.style.cssText = `
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
    font-size: 13px;
    color: var(--text-secondary);
  `;

  const getTempoState = () => {
    const state = deps.audioPlayer?.getState();
    const originalTempo = state?.originalTempo ?? DEFAULT_TEMPO;
    const currentTempo = state?.tempo ?? originalTempo;
    return { originalTempo, currentTempo };
  };

  const updateTempoInfo = () => {
    const { originalTempo, currentTempo } = getTempoState();
    const isSame = Math.abs(originalTempo - currentTempo) < 0.5;

    if (isSame) {
      tempoInfo.innerHTML = `Current tempo: <strong style="color:var(--text-primary)">${Math.round(currentTempo)} BPM</strong>`;
    } else {
      tempoInfo.innerHTML = `Tempo: <strong style="color:var(--text-primary)">${Math.round(originalTempo)} → ${Math.round(currentTempo)} BPM</strong>`;
    }
  };

  updateTempoInfo();

  // Listen for tempo changes
  const handleRefresh = () => updateTempoInfo();
  document.addEventListener("wr-force-ui-refresh", handleRefresh);

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
    container.appendChild(tempoInfo);
    container.appendChild(selectRow);
  } else {
    container.appendChild(title);
    container.appendChild(tempoInfo);
  }

  // Export button row
  const buttonRow = document.createElement("div");
  buttonRow.style.cssText = `
    display: flex;
    align-items: center;
    gap: 8px;
  `;

  const exportBtn = document.createElement("button");
  exportBtn.textContent = "Export with Current Tempo";
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
    const { currentTempo } = getTempoState();

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
      await exportMidiWithTempo(originalInput, currentTempo);
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
    "Downloads the MIDI file with the current tempo applied. Note positions remain unchanged; only the tempo metadata is modified.";
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

