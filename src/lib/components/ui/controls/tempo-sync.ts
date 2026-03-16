import { UIComponentDependencies } from "../types";
import { createIconButton } from "../utils/icon-button";
import { attachHoverBackground } from "@/core/controls/utils/hover-background";
import { COLOR_PRIMARY } from "@/lib/core/constants/index";
import { attachTooltip } from "../utils/tooltip";

/**
 * SVG icon: two horizontal lines with arrows indicating tempo alignment
 * Represents synchronizing different tempos to a common reference.
 */
const TEMPO_SYNC_ICON = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <path d="M2 5h12M2 11h12"/>
  <path d="M5 2l-3 3 3 3"/>
  <path d="M11 8l3 3-3 3"/>
</svg>`;

/**
 * Create a tempo sync toggle button for the main control bar.
 *
 * When enabled, non-reference MIDI files are time-stretched to align
 * with the reference file's tempo for visual comparison.
 */
export function createTempoSyncControl(deps: UIComponentDependencies): HTMLElement {
  const { stateManager, midiManager } = deps;

  const getTooltip = (enabled: boolean): string => {
    const state = stateManager.getState();
    const evalState = state.evaluation;
    const midiState = midiManager?.getState();

    if (!evalState?.refId) {
      return "Tempo Sync: No reference file selected";
    }

    const refFile = midiState?.files.find((f) => f.id === evalState.refId);
    const refTempo = (refFile?.parsedData?.header as any)?.tempos?.[0]?.bpm ?? 120;

    // Check if all files have the same tempo
    const allSameTempo = midiState?.files.every((f) => {
      const t = (f.parsedData?.header as any)?.tempos?.[0]?.bpm ?? refTempo;
      return Math.abs(t - refTempo) < 0.01;
    });

    if (allSameTempo) {
      return "Tempo Sync: All files have same tempo";
    }

    if (enabled) {
      return `Tempo Sync: On - Aligned to ${refTempo.toFixed(0)} BPM`;
    }
    return "Tempo Sync: Off - Original tempo";
  };

  // Track current state for tooltip
  let currentEnabled = stateManager.getState().visual.tempoSyncEnabled;

  const updateVisual = (active: boolean) => {
    currentEnabled = active;
    if (active) {
      btn.dataset.active = "true";
      btn.style.background = "rgba(0, 123, 255, 0.1)";
      btn.style.color = COLOR_PRIMARY;
    } else {
      delete btn.dataset.active;
      btn.style.background = "transparent";
      btn.style.color = "var(--text-muted)";
    }
  };

  const btn = createIconButton(
    TEMPO_SYNC_ICON,
    () => {
      const current = stateManager.getState().visual.tempoSyncEnabled;
      stateManager.updateVisualState({ tempoSyncEnabled: !current });
      updateVisual(!current);
    },
    "", // No native title - using DOM tooltip
  );

  btn.setAttribute("aria-label", "Toggle tempo sync");
  attachHoverBackground(btn);
  attachTooltip(btn, { getText: () => getTooltip(currentEnabled) });
  updateVisual(currentEnabled);

  return btn;
}
