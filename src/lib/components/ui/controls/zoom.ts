import { PLAYER_ICONS } from "@/assets/player-icons";
import { UIComponentDependencies } from "../types";
import { clamp } from "@/lib/core/utils/clamp";
import { createIconButton } from "../utils/icon-button";

/**
 * Create a zoom control element.
 *
 * @param dependencies - The UI component dependencies.
 * @returns The zoom control element.
 */
export function createZoomControlsUI(
  dependencies: UIComponentDependencies
): HTMLElement {
  const container = document.createElement("div");
  container.style.cssText = `
      display: flex;
      align-items: center;
      gap: 6px;
      height: 48px;
      background: var(--panel-bg);
      padding: 4px 8px;
      border-radius: 8px;
      box-shadow: var(--shadow-sm);
    `;

  // Numeric input for zoom factor
  const zoomInput = document.createElement("input");
  zoomInput.type = "number";
  zoomInput.min = "0.1";
  zoomInput.max = "10";
  zoomInput.step = "0.1";
  const initZoom = dependencies.pianoRoll?.getState?.().zoomX ?? 1;
  zoomInput.value = initZoom.toFixed(1);
  zoomInput.style.cssText = `
      width: 56px;
      padding: 4px 6px;
      border: 1px solid var(--ui-border);
      border-radius: 6px;
      font-size: 12px;
      text-align: center;
      color: var(--accent);
      background: var(--surface);
    `;
  zoomInput.classList.add("wr-focusable");

  const clampZoom = (v: number) => clamp(v, 0.1, 10);

  const applyZoom = () => {
    const num = parseFloat(zoomInput.value);
    if (isNaN(num)) return;
    const newZoom = clampZoom(num);
    const currentZoom = dependencies.pianoRoll?.getState?.().zoomX ?? 1;
    const factor = newZoom / currentZoom;
    dependencies.pianoRoll?.zoomX?.(factor);
    zoomInput.value = newZoom.toFixed(1);
  };

  zoomInput.addEventListener("change", applyZoom);
  zoomInput.addEventListener("blur", applyZoom);
  zoomInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      applyZoom();
      zoomInput.blur();
    }
  });

  // Wheel over zoomInput -> adjust ±0.1 steps; preventDefault() requires passive: false
  zoomInput.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.1 : -0.1;
      const num = parseFloat(zoomInput.value) || initZoom;
      zoomInput.value = (num + delta).toFixed(1);
      applyZoom();
    },
    { passive: false }
  );

  const suffix = document.createElement("span");
  suffix.textContent = "x";
  suffix.style.cssText = `
      font-size: 12px;
      font-weight: 600;
      color: var(--text-muted);
    `;

  // Reset button
  const resetBtn = createIconButton(PLAYER_ICONS.zoom_reset, () => {
    dependencies.pianoRoll?.resetView?.();
    zoomInput.value = "1.0";
  });
  resetBtn.title = "Reset Zoom";
  // Styling and click behavior handled by createIconButton

  container.appendChild(zoomInput);
  container.appendChild(suffix);
  container.appendChild(resetBtn);

  // Expose zoomInput so outer update loop can sync value
  // Store reference for coordinated UI updates
  (dependencies as UIComponentDependencies & { zoomInput?: HTMLInputElement }).zoomInput = zoomInput;

  return container;
}
