import { UIComponentDependencies } from "../../types";
import { createMinorStepGroup } from "../controls/minor-step-group";
import { createTimeStepGroup } from "../controls/time-step-group";
import { createHighlightModeGroup } from "../controls/highlight-mode-group";
import { createOffsetMinToleranceGroup } from "../controls/offset-min-tolerance-group";
import { createPedalElongateGroup } from "../controls/pedal-elongate-group";
import { createPedalThresholdGroup } from "../controls/pedal-threshold-group";

/**
 * Open the Zoom / Grid Settings modal (time step & minor step).
 * Prevents duplicates by checking the overlay id.
 */
export function openZoomGridSettingsModal(deps: UIComponentDependencies): void {
  const existing = document.getElementById("zoom-settings-overlay");
  if (existing) {
    // Bring to front if it exists but is detached.
    if (!existing.parentElement) document.body.appendChild(existing);
    return;
  }

  // --- Overlay ---
  const overlay = document.createElement("div");
  overlay.id = "zoom-settings-overlay";
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 2000;
  `;

  // --- Modal panel ---
  const modal = document.createElement("div");
  modal.style.cssText = `
    width: 320px;
    max-width: 90%;
    background: var(--panel-bg);
    border-radius: 10px;
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    box-sizing: border-box;
    overflow: hidden;
    word-break: break-word;
    overflow-wrap: anywhere;
  `;

  // Header (title + close button)
  const header = document.createElement("div");
  header.style.cssText =
    "display:flex;justify-content:space-between;align-items:center;";
  const title = document.createElement("h3");
  title.textContent = "View / Grid Settings";
  title.style.cssText = "margin:0;font-size:16px;font-weight:700;color:var(--text-primary);";
  const closeBtn = document.createElement("button");
  closeBtn.textContent = "✕";
  closeBtn.style.cssText =
    "border:none;background:transparent;font-size:20px;cursor:pointer;color:var(--text-muted);";
  closeBtn.onclick = () => overlay.remove();
  header.appendChild(title);
  header.appendChild(closeBtn);

  // Controls
  const tsGroup = createTimeStepGroup(deps);
  const mnGroup = createMinorStepGroup(deps);
  const offsetTolGroup = createOffsetMinToleranceGroup(deps);
  const hlGroup = createHighlightModeGroup(deps);
  const pedalGroup = createPedalElongateGroup(deps);
  const pedalThresholdGroup = createPedalThresholdGroup(deps);

  // Onset markers toggle (default false)
  const onsetRow = document.createElement("div");
  onsetRow.style.cssText = "display:flex;align-items:center;gap:8px;";
  const onsetLabel = document.createElement("label");
  onsetLabel.textContent = "Show onset markers";
  onsetLabel.style.cssText = "font-size:12px;font-weight:600;color:var(--text-primary);";
  const onsetCheckbox = document.createElement("input");
  onsetCheckbox.type = "checkbox";
  onsetCheckbox.checked = deps.stateManager.getState().visual.showOnsetMarkers ?? false;
  onsetCheckbox.addEventListener("change", () => {
    deps.stateManager.updateVisualState({ showOnsetMarkers: onsetCheckbox.checked });
  });
  onsetRow.append(onsetCheckbox, onsetLabel);

  // Assemble modal
  modal.appendChild(header);
  modal.appendChild(onsetRow);
  modal.appendChild(tsGroup);
  modal.appendChild(mnGroup);
  modal.appendChild(offsetTolGroup);
  modal.appendChild(hlGroup);
  modal.appendChild(pedalGroup);
  modal.appendChild(pedalThresholdGroup);
  overlay.appendChild(modal);

  // Close when clicking outside panel
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });

  document.body.appendChild(overlay);
}
