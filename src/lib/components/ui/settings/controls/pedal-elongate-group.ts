import { UIComponentDependencies } from "../../types";

/**
 * Create a checkbox control for enabling/disabling sustain pedal elongation.
 * This affects how MIDI notes are processed when parsing files.
 */
export function createPedalElongateGroup(
  deps: UIComponentDependencies
): HTMLElement {
  const container = document.createElement("div");
  container.style.cssText = `
    padding: 12px 0;
    border-top: 1px solid var(--ui-border);
    position: relative;
  `;

  // Label
  const label = document.createElement("label");
  label.style.cssText = `
    display: flex;
    align-items: center;
    cursor: pointer;
    user-select: none;
  `;

  // Checkbox
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.style.cssText = `
    margin-right: 8px;
    cursor: pointer;
  `;

  // Get initial state
  const initialState =
    deps.stateManager?.getState().visual.pedalElongate ?? false;
  checkbox.checked = initialState;

  // Label text
  const labelText = document.createElement("span");
  labelText.textContent = "Apply Sustain Pedal Elongation";
  labelText.style.cssText = `
    font-size: 14px;
    font-weight: 500;
    color: var(--text-primary);
  `;

  // Loading indicator (initially hidden)
  const loadingIndicator = document.createElement("div");
  loadingIndicator.style.cssText = `
    display: none;
    position: absolute;
    top: 12px;
    right: 0;
    font-size: 12px;
    color: var(--accent);
    font-style: italic;
  `;
  loadingIndicator.textContent = "Reprocessing files...";

  // Description
  const description = document.createElement("div");
  description.style.cssText = `
    margin-top: 8px;
    margin-left: 24px;
    font-size: 12px;
    color: var(--text-muted);
    line-height: 1.4;
  `;
  description.textContent =
    "When enabled, notes will be elongated based on sustain pedal (CC64) events in the MIDI file. Changing this setting will reprocess all loaded files.";

  // Handle checkbox change
  checkbox.addEventListener("change", async () => {
    const isChecked = checkbox.checked;

    // Update state
    deps.stateManager?.updateVisualState({ pedalElongate: isChecked });

    // Show loading indicator
    loadingIndicator.style.display = "block";
    checkbox.disabled = true;

    try {
      // Reparse all MIDI files with the new setting
      if (deps.midiManager) {
        const threshold =
          deps.stateManager?.getState().visual.pedalThreshold ?? 64;
        await deps.midiManager.reparseAllFiles(
          {
            applyPedalElongate: isChecked,
            pedalThreshold: threshold,
          },
          (current, total) => {
            loadingIndicator.textContent = `Reprocessing files... (${current}/${total})`;
          }
        );
      }

      // console.log(
      //   `Pedal elongate ${isChecked ? "enabled" : "disabled"} - files reprocessed`
      // );
    } catch (error) {
      console.error("Failed to reprocess files:", error);
      // Revert checkbox on error
      checkbox.checked = !isChecked;
      deps.stateManager?.updateVisualState({ pedalElongate: !isChecked });
    } finally {
      // Hide loading indicator
      loadingIndicator.style.display = "none";
      loadingIndicator.textContent = "Reprocessing files...";
      checkbox.disabled = false;
    }
  });

  // Assemble
  label.appendChild(checkbox);
  label.appendChild(labelText);
  container.appendChild(label);
  container.appendChild(loadingIndicator);
  container.appendChild(description);

  return container;
}
