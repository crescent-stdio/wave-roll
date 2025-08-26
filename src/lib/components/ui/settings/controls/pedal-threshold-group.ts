import { UIComponentDependencies } from "../../types";

/**
 * Create a slider control for setting the sustain pedal threshold.
 * This affects the CC64 value required to activate sustain.
 */
export function createPedalThresholdGroup(
  deps: UIComponentDependencies
): HTMLElement {
  const container = document.createElement("div");
  container.style.cssText = `
    padding: 12px 0;
  `;

  // Label and value display
  const header = document.createElement("div");
  header.style.cssText = `
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  `;

  const label = document.createElement("label");
  label.textContent = "Pedal Threshold";
  label.style.cssText = `
    font-size: 14px;
    font-weight: 500;
    color: #333;
  `;

  const valueDisplay = document.createElement("span");
  valueDisplay.style.cssText = `
    font-size: 14px;
    color: #666;
    min-width: 35px;
    text-align: right;
  `;

  // Slider container
  const sliderContainer = document.createElement("div");
  sliderContainer.style.cssText = `
    display: flex;
    align-items: center;
    gap: 10px;
    margin-left: 24px;
  `;

  // Slider
  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "0";
  slider.max = "127";
  slider.step = "1";
  slider.style.cssText = `
    flex: 1;
    cursor: pointer;
  `;

  // Get initial state
  const initialValue = deps.stateManager?.getState().visual.pedalThreshold ?? 64;
  slider.value = String(initialValue);
  valueDisplay.textContent = String(initialValue);

  // Min/Max labels
  const minLabel = document.createElement("span");
  minLabel.textContent = "0";
  minLabel.style.cssText = `
    font-size: 12px;
    color: #999;
  `;

  const maxLabel = document.createElement("span");
  maxLabel.textContent = "127";
  maxLabel.style.cssText = `
    font-size: 12px;
    color: #999;
  `;

  // Description
  const description = document.createElement("div");
  description.style.cssText = `
    margin-top: 8px;
    margin-left: 24px;
    font-size: 12px;
    color: #666;
    line-height: 1.4;
  `;
  description.textContent = "MIDI CC64 value threshold for sustain pedal activation. Standard value is 64. Lower values make the pedal more sensitive.";

  // Loading indicator (initially hidden)
  const loadingIndicator = document.createElement("div");
  loadingIndicator.style.cssText = `
    display: none;
    margin-top: 8px;
    margin-left: 24px;
    font-size: 12px;
    color: #007bff;
    font-style: italic;
  `;
  loadingIndicator.textContent = "Reprocessing files...";

  // Debounce timer
  let debounceTimer: number | null = null;

  // Handle slider change
  const handleChange = async () => {
    const value = parseInt(slider.value);
    valueDisplay.textContent = String(value);
    
    // Update state
    deps.stateManager?.updateVisualState({ pedalThreshold: value });
    
    // Clear existing timer
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
    }
    
    // Debounce the reprocessing
    debounceTimer = window.setTimeout(async () => {
      // Only reprocess if pedal elongate is enabled
      const state = deps.stateManager?.getState();
      if (!state?.visual.pedalElongate) {
        return;
      }
      
      // Show loading indicator
      loadingIndicator.style.display = "block";
      slider.disabled = true;
      
      try {
        // Reparse all MIDI files with the new threshold
        if (deps.midiManager) {
          await deps.midiManager.reparseAllFiles(
            { 
              applyPedalElongate: true,
              pedalThreshold: value 
            },
            (current, total) => {
              loadingIndicator.textContent = `Reprocessing files... (${current}/${total})`;
            }
          );
          
          // Visualization will refresh via midiManager state change listener
        }
        
        console.log(`Pedal threshold set to ${value}`);
      } catch (error) {
        console.error("Failed to reprocess files:", error);
      } finally {
        // Hide loading indicator
        loadingIndicator.style.display = "none";
        loadingIndicator.textContent = "Reprocessing files...";
        slider.disabled = false;
        debounceTimer = null;
      }
    }, 500); // 500ms debounce
  };

  // Handle slider input (immediate visual feedback)
  slider.addEventListener("input", () => {
    valueDisplay.textContent = slider.value;
  });

  // Handle slider change (debounced processing)
  slider.addEventListener("change", handleChange);

  // Assemble
  header.appendChild(label);
  header.appendChild(valueDisplay);
  
  sliderContainer.appendChild(minLabel);
  sliderContainer.appendChild(slider);
  sliderContainer.appendChild(maxLabel);
  
  container.appendChild(header);
  container.appendChild(sliderContainer);
  container.appendChild(description);
  container.appendChild(loadingIndicator);

  return container;
}