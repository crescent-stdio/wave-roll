import { COLOR_PRIMARY } from "@/lib/core/constants";
import { clamp } from "@/lib/core/utils";
import type { PianoRollInstance } from "@/lib/core/visualization/piano-roll/types";

/**
 * Zoom controls - numeric input that updates piano roll zoomX.
 */
export function createZoomControls({
  pianoRoll,
}: {
  pianoRoll: PianoRollInstance;
}): HTMLElement {
  if (!pianoRoll) {
    throw new Error("Piano roll is required");
  }
  const container = document.createElement("div");
  container.style.cssText = `
    display: flex;
    align-items: center;
    height: 48px;
    background: rgba(255, 255, 255, 0.8);
    padding: 4px;
    border-radius: 8px;
    gap: 4px;
  `;

  const currentZoom = pianoRoll?.getState?.().zoomX ?? 1;

  const zoomInput = document.createElement("input");
  zoomInput.type = "number";
  zoomInput.min = "0.1";
  zoomInput.max = "10";
  zoomInput.step = "0.1";
  zoomInput.value = currentZoom.toFixed(1);
  zoomInput.style.cssText = `
    width: 56px;
    padding: 4px 6px;
    border: 1px solid #ced4da;
    border-radius: 6px;
    font-size: 12px;
    text-align: center;
    color: ${COLOR_PRIMARY};
    background: #ffffff;
  `;

  const clampZoom = (v: number) => clamp(v, 0.1, 10);

  const applyZoom = () => {
    const numericVal = parseFloat(zoomInput.value);
    if (isNaN(numericVal)) {
      const current = pianoRoll?.getState?.().zoomX ?? 1;
      zoomInput.value = current.toFixed(1);
      return;
    }
    const safe = clampZoom(numericVal);
    zoomInput.value = safe.toFixed(1);
    pianoRoll?.zoomX?.(safe);
  };

  zoomInput.addEventListener("input", applyZoom);
  zoomInput.addEventListener("blur", applyZoom);
  zoomInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      applyZoom();
      zoomInput.blur();
    }
  });

  container.appendChild(zoomInput);
  return container;
}
