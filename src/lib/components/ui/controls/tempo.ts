import { UIComponentDependencies } from "../types";

/** Default tempo when no audio player state is available */
const DEFAULT_TEMPO = 120;
const MIN_TEMPO = 20;
const MAX_TEMPO = 300;

/**
 * Create a playback tempo control element.
 * Displays tempo in BPM format: "originalTempo → currentTempo BPM"
 *
 * @param dependencies - The UI component dependencies.
 * @returns The playback tempo control element.
 */
export function createTempoControlUI(
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

  // Get initial tempo values with fallback
  const getTempoState = () => {
    const state = dependencies.audioPlayer?.getState();
    const originalTempo = state?.originalTempo ?? DEFAULT_TEMPO;
    const currentTempo = state?.tempo ?? originalTempo;
    return { originalTempo, currentTempo };
  };

  const { originalTempo: initialOriginal, currentTempo: initialCurrent } = getTempoState();

  // Original tempo display (read-only)
  const originalLabel = document.createElement("span");
  originalLabel.textContent = String(Math.round(initialOriginal));
  originalLabel.style.cssText = `
    font-size: 13px;
    font-weight: 600;
    color: var(--text-muted);
    min-width: 28px;
    text-align: right;
  `;

  // Arrow separator
  const arrow = document.createElement("span");
  arrow.textContent = "→";
  arrow.style.cssText = `
    font-size: 12px;
    color: var(--text-muted);
  `;

  // Current tempo input
  const input = document.createElement("input");
  input.type = "number";
  input.min = String(MIN_TEMPO);
  input.max = String(MAX_TEMPO);
  input.step = "1";
  input.value = String(Math.round(initialCurrent));
  input.style.cssText = `
    width: 54px;
    padding: 4px 6px;
    border: none;
    border-radius: 4px;
    font-size: 13px;
    font-weight: 600;
    color: var(--accent);
    background: rgba(37, 99, 235, 0.10);
    text-align: center;
  `;
  input.classList.add("wr-focusable");

  // BPM label
  const bpmLabel = document.createElement("span");
  bpmLabel.textContent = "BPM";
  bpmLabel.style.cssText = `
    font-size: 11px;
    font-weight: 600;
    color: var(--text-muted);
  `;

  // Focus effects
  input.addEventListener("focus", () => {
    input.style.background = "rgba(37, 99, 235, 0.12)";
  });

  input.addEventListener("blur", () => {
    input.style.background = "rgba(37, 99, 235, 0.10)";
  });

  // Helper to apply tempo safely
  const applyTempo = (bpm: number) => {
    const clampedBpm = Math.max(MIN_TEMPO, Math.min(MAX_TEMPO, Math.round(bpm)));
    input.value = String(clampedBpm);
    dependencies.audioPlayer?.setTempo(clampedBpm);

    const state = dependencies.audioPlayer?.getState();
    if (state && dependencies.updateSeekBar) {
      dependencies.updateSeekBar({ currentTime: state.currentTime, duration: state.duration });
    }
  };

  // Apply on change (avoid partial input while typing)
  input.addEventListener("change", () => {
    const bpm = parseFloat(input.value);
    if (!isNaN(bpm)) applyTempo(bpm);
  });

  // Apply on Enter
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const bpm = parseFloat(input.value);
      if (!isNaN(bpm)) applyTempo(bpm);
      input.blur();
    }
  });

  // Tempo button: prompt to enter BPM directly
  const adjustBtn = document.createElement("button");
  adjustBtn.textContent = "Tempo";
  adjustBtn.title = `Set playback tempo (${MIN_TEMPO}-${MAX_TEMPO} BPM)`;
  adjustBtn.style.cssText = `
    height: 28px;
    padding: 0 8px;
    border: none;
    border-radius: 6px;
    background: rgba(0,0,0,0.06);
    color: var(--text-primary);
    cursor: pointer;
    font-size: 12px;
    font-weight: 700;
  `;
  adjustBtn.onclick = () => {
    const current = parseFloat(input.value) || initialCurrent;
    const ans = window.prompt(`Playback tempo (${MIN_TEMPO}-${MAX_TEMPO} BPM)`, String(Math.round(current)));
    if (ans !== null) {
      const val = Number(ans);
      if (!isNaN(val)) applyTempo(val);
    }
  };

  // Update UI when tempo changes externally (e.g., from other controls)
  const updateUI = () => {
    const { originalTempo, currentTempo } = getTempoState();
    originalLabel.textContent = String(Math.round(originalTempo));
    // Only update input if it's not focused (avoid interrupting user input)
    if (document.activeElement !== input) {
      input.value = String(Math.round(currentTempo));
    }
  };

  // Listen for UI refresh events
  const handleRefresh = () => updateUI();
  document.addEventListener("wr-force-ui-refresh", handleRefresh);

  // Cleanup on removal (if container is removed from DOM)
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
  // Observe parent when attached
  requestAnimationFrame(() => {
    if (container.parentElement) {
      observer.observe(container.parentElement, { childList: true, subtree: true });
    }
  });

  // Assemble UI
  container.appendChild(originalLabel);
  container.appendChild(arrow);
  container.appendChild(input);
  container.appendChild(bpmLabel);
  container.appendChild(adjustBtn);

  return container;
}
