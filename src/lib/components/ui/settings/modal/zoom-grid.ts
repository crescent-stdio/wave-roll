import { UIComponentDependencies } from "../../types";
import { createMinorStepGroup } from "../controls/minor-step-group";
import { createTimeStepGroup } from "../controls/time-step-group";
import { createHighlightModeGroup } from "../controls/highlight-mode-group";
import { createOffsetMinToleranceGroup } from "../controls/offset-min-tolerance-group";
import { createPedalElongateGroup } from "../controls/pedal-elongate-group";
import { createPedalThresholdGroup } from "../controls/pedal-threshold-group";
import { createMidiExportGroup } from "../controls/midi-export-group";
import { createSettingsModalSkeleton } from "./skeleton";
import { createModalHeader } from "./header";

/**
 * Create a section wrapper with title and children.
 * Removes border-top from first child to avoid double borders.
 */
function createSection(title: string, children: HTMLElement[]): HTMLElement {
  const section = document.createElement("div");
  section.style.cssText = "display:flex;flex-direction:column;gap:8px;";

  const heading = document.createElement("h3");
  heading.textContent = title;
  heading.style.cssText =
    "margin:0 0 12px;font-size:16px;font-weight:600;color:var(--text-primary);";
  section.appendChild(heading);

  children.forEach((child, index) => {
    // Remove border-top from first child to avoid double borders with section
    if (index === 0 && child.style.borderTop) {
      child.style.borderTop = "none";
      child.style.paddingTop = "0";
    }
    section.appendChild(child);
  });

  return section;
}

/**
 * Open the Settings modal (time step, minor step, and MIDI export).
 * Uses shared skeleton and header components for consistent UI.
 */
export function openZoomGridSettingsModal(deps: UIComponentDependencies): void {
  const { overlay, modal } = createSettingsModalSkeleton(
    "zoom-settings-overlay"
  );

  // If the modal is already populated, bring it to front and exit.
  if (modal.childElementCount > 0) {
    if (!overlay.parentElement) document.body.appendChild(overlay);
    return;
  }

  // ---- Build modal content ----

  // Header
  const header = createModalHeader("Settings", () => overlay.remove());
  modal.appendChild(header);

  // Onset markers toggle (directly after header, no section)
  const onsetRow = document.createElement("div");
  onsetRow.style.cssText = "display:flex;align-items:center;gap:8px;";
  const onsetCheckbox = document.createElement("input");
  onsetCheckbox.type = "checkbox";
  onsetCheckbox.checked =
    deps.stateManager.getState().visual.showOnsetMarkers ?? true;
  onsetCheckbox.addEventListener("change", () => {
    deps.stateManager.updateVisualState({
      showOnsetMarkers: onsetCheckbox.checked,
    });
  });
  const onsetLabel = document.createElement("label");
  onsetLabel.textContent = "Show onset markers";
  onsetLabel.style.cssText =
    "font-size:14px;font-weight:500;color:var(--text-primary);";
  onsetRow.append(onsetCheckbox, onsetLabel);
  modal.appendChild(onsetRow);

  // Grid & Display section
  const tsGroup = createTimeStepGroup(deps);
  const mnGroup = createMinorStepGroup(deps);
  const gridSection = createSection("Grid & Display", [tsGroup, mnGroup]);
  modal.appendChild(gridSection);

  // Evaluation section (non-solo mode only)
  if (!deps.soloMode) {
    const offsetTolGroup = createOffsetMinToleranceGroup(deps);
    const hlGroup = createHighlightModeGroup(deps);
    const evalSection = createSection("Evaluation", [offsetTolGroup, hlGroup]);
    modal.appendChild(evalSection);
  }

  // Sustain Pedal section
  const pedalGroup = createPedalElongateGroup(deps);

  // Sustain visibility toggle
  const sustainVisRow = document.createElement("div");
  sustainVisRow.style.cssText = "display:flex;align-items:center;gap:8px;";
  const sustainVisCheckbox = document.createElement("input");
  sustainVisCheckbox.type = "checkbox";
  // Get initial sustain visibility state from first file or default to true
  const files = deps.midiManager.getState().files;
  const initialSustainVisible =
    files.length > 0 ? (files[0].isSustainVisible ?? true) : true;
  sustainVisCheckbox.checked = initialSustainVisible;
  sustainVisCheckbox.addEventListener("change", () => {
    // Toggle sustain visibility for all files
    files.forEach((file: { id: string }) => {
      deps.midiManager.toggleSustainVisibility(file.id);
    });
  });
  const sustainVisLabel = document.createElement("label");
  sustainVisLabel.textContent = "Show Sustain Pedal Regions";
  sustainVisLabel.style.cssText =
    "font-size:14px;font-weight:500;color:var(--text-primary);";
  sustainVisRow.append(sustainVisCheckbox, sustainVisLabel);

  const pedalThresholdGroup = createPedalThresholdGroup(deps);
  const sustainSection = createSection("Sustain Pedal", [
    pedalGroup,
    sustainVisRow,
    pedalThresholdGroup,
  ]);
  modal.appendChild(sustainSection);

  // MIDI Export section (already has its own title, append directly)
  const midiExportGroup = createMidiExportGroup(deps);
  modal.appendChild(midiExportGroup);

  // Close when clicking outside the modal panel
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });

  document.body.appendChild(overlay);
}
