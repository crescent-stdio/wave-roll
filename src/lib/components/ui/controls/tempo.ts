import { UIComponentDependencies } from "../types";

/** Default tempo when no audio player state is available */
const DEFAULT_TEMPO = 120;
const MIN_TEMPO = 20;
const MAX_TEMPO = 300;

/**
 * Create a compact playback tempo control element.
 * Displays tempo as a badge "XXX BPM" with popover for direct input.
 *
 * @param dependencies - The UI component dependencies.
 * @returns The playback tempo control element.
 */
export function createTempoControlUI(
  dependencies: UIComponentDependencies
): HTMLElement {
  // Main container
  const container = document.createElement("div");
  container.style.cssText = `
    position: relative;
    display: inline-flex;
    align-items: center;
    height: 48px;
    background: var(--panel-bg);
    padding: 4px 8px;
    border-radius: 8px;
    box-shadow: var(--shadow-sm);
  `;

  // Get tempo state helper
  const getTempoState = () => {
    const state = dependencies.audioPlayer?.getState();
    const originalTempo = state?.originalTempo ?? DEFAULT_TEMPO;
    const currentTempo = state?.tempo ?? originalTempo;
    return { originalTempo, currentTempo };
  };

  const { currentTempo: initialTempo } = getTempoState();

  // Badge button (compact view)
  const badge = document.createElement("button");
  badge.textContent = `${Math.round(initialTempo)} BPM`;
  badge.title = "Playback Tempo";
  badge.style.cssText = `
    background: transparent;
    border: 1px solid var(--ui-border);
    padding: 0 10px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 32px;
    border-radius: 8px;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
    color: var(--text-muted);
    font-size: 12px;
    font-weight: 600;
    min-width: 70px;
  `;
  badge.classList.add("wr-focusable");
  badge.setAttribute("aria-label", `Playback tempo: ${Math.round(initialTempo)} BPM`);

  // Hover effect for badge (consistent with volume button)
  badge.addEventListener("mouseenter", () => {
    badge.style.transform = "translateY(-1px)";
    badge.style.boxShadow = "0 2px 4px rgba(0, 0, 0, 0.1)";
  });
  badge.addEventListener("mouseleave", () => {
    badge.style.transform = "translateY(0)";
    badge.style.boxShadow = "0 1px 2px rgba(0, 0, 0, 0.05)";
  });
  badge.addEventListener("mousedown", () => {
    badge.style.transform = "translateY(0) scale(0.96)";
  });
  badge.addEventListener("mouseup", () => {
    badge.style.transform = "translateY(-1px) scale(1)";
  });

  // Popover container
  const popover = document.createElement("div");
  popover.style.cssText = `
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    margin-bottom: 4px;
    background: var(--surface);
    border: 1px solid var(--ui-border);
    border-radius: 8px;
    padding: 10px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    display: none;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    z-index: 9999;
    min-width: 100px;
  `;

  // Tempo label
  const tempoLabel = document.createElement("div");
  tempoLabel.textContent = "Tempo";
  tempoLabel.style.cssText = `
    font-size: 11px;
    font-weight: 600;
    color: var(--text-muted);
    user-select: none;
  `;

  // Input row (input + buttons)
  const inputRow = document.createElement("div");
  inputRow.style.cssText = `
    display: flex;
    align-items: center;
    gap: 4px;
  `;

  // Decrement button
  const decrementBtn = document.createElement("button");
  decrementBtn.textContent = "−";
  decrementBtn.title = "Decrease tempo";
  decrementBtn.style.cssText = `
    width: 24px;
    height: 24px;
    border: 1px solid var(--ui-border);
    border-radius: 4px;
    background: var(--surface);
    color: var(--text-muted);
    cursor: pointer;
    font-size: 14px;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.1s ease;
  `;
  decrementBtn.addEventListener("mouseenter", () => {
    decrementBtn.style.background = "var(--surface-alt)";
  });
  decrementBtn.addEventListener("mouseleave", () => {
    decrementBtn.style.background = "var(--surface)";
  });

  // BPM input
  const input = document.createElement("input");
  input.type = "number";
  input.min = String(MIN_TEMPO);
  input.max = String(MAX_TEMPO);
  input.step = "1";
  input.value = String(Math.round(initialTempo));
  input.style.cssText = `
    width: 50px;
    padding: 4px 6px;
    border: 1px solid var(--ui-border);
    border-radius: 4px;
    font-size: 13px;
    font-weight: 600;
    color: var(--accent);
    background: var(--surface);
    text-align: center;
    outline: none;
  `;
  input.classList.add("wr-focusable");

  // Increment button
  const incrementBtn = document.createElement("button");
  incrementBtn.textContent = "+";
  incrementBtn.title = "Increase tempo";
  incrementBtn.style.cssText = `
    width: 24px;
    height: 24px;
    border: 1px solid var(--ui-border);
    border-radius: 4px;
    background: var(--surface);
    color: var(--text-muted);
    cursor: pointer;
    font-size: 14px;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.1s ease;
  `;
  incrementBtn.addEventListener("mouseenter", () => {
    incrementBtn.style.background = "var(--surface-alt)";
  });
  incrementBtn.addEventListener("mouseleave", () => {
    incrementBtn.style.background = "var(--surface)";
  });

  // BPM unit label
  const bpmUnit = document.createElement("span");
  bpmUnit.textContent = "BPM";
  bpmUnit.style.cssText = `
    font-size: 10px;
    font-weight: 600;
    color: var(--text-muted);
    user-select: none;
  `;

  // Assemble input row
  inputRow.appendChild(decrementBtn);
  inputRow.appendChild(input);
  inputRow.appendChild(incrementBtn);

  // Assemble popover
  popover.appendChild(tempoLabel);
  popover.appendChild(inputRow);
  popover.appendChild(bpmUnit);

  // Assemble container
  container.appendChild(badge);
  container.appendChild(popover);

  // State
  let currentTempo = initialTempo;
  let isPopoverVisible = false;
  let hideTimeout: number | null = null;

  // Helper to apply tempo safely
  const applyTempo = (bpm: number) => {
    const clampedBpm = Math.max(MIN_TEMPO, Math.min(MAX_TEMPO, Math.round(bpm)));
    currentTempo = clampedBpm;
    input.value = String(clampedBpm);
    badge.textContent = `${clampedBpm} BPM`;
    badge.setAttribute("aria-label", `Playback tempo: ${clampedBpm} BPM`);
    dependencies.audioPlayer?.setTempo(clampedBpm);

    const state = dependencies.audioPlayer?.getState();
    if (state && dependencies.updateSeekBar) {
      dependencies.updateSeekBar({ currentTime: state.currentTime, duration: state.duration });
    }
  };

  // Show/hide popover
  const showPopover = () => {
    if (hideTimeout !== null) {
      clearTimeout(hideTimeout);
      hideTimeout = null;
    }
    popover.style.display = "flex";
    isPopoverVisible = true;
  };

  const hidePopover = () => {
    popover.style.display = "none";
    isPopoverVisible = false;
  };

  const hidePopoverDelayed = () => {
    if (hideTimeout !== null) {
      clearTimeout(hideTimeout);
    }
    hideTimeout = window.setTimeout(() => {
      hidePopover();
    }, 300);
  };

  // Event handlers for showing/hiding popover
  badge.addEventListener("mouseenter", showPopover);
  badge.addEventListener("focus", showPopover);
  popover.addEventListener("mouseenter", () => {
    if (hideTimeout !== null) {
      clearTimeout(hideTimeout);
      hideTimeout = null;
    }
  });
  popover.addEventListener("mouseleave", hidePopoverDelayed);
  container.addEventListener("mouseleave", hidePopoverDelayed);

  // Input events
  input.addEventListener("focus", () => {
    input.style.borderColor = "var(--accent)";
    input.style.boxShadow = "0 0 0 2px rgba(37, 99, 235, 0.1)";
  });

  input.addEventListener("blur", () => {
    input.style.borderColor = "var(--ui-border)";
    input.style.boxShadow = "none";
    const bpm = parseFloat(input.value);
    if (!isNaN(bpm)) applyTempo(bpm);
  });

  input.addEventListener("change", () => {
    const bpm = parseFloat(input.value);
    if (!isNaN(bpm)) applyTempo(bpm);
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const bpm = parseFloat(input.value);
      if (!isNaN(bpm)) applyTempo(bpm);
      input.blur();
    } else if (e.key === "Escape") {
      hidePopover();
      badge.focus();
    }
  });

  // Increment/decrement buttons
  decrementBtn.addEventListener("click", () => {
    applyTempo(currentTempo - 5);
  });

  incrementBtn.addEventListener("click", () => {
    applyTempo(currentTempo + 5);
  });

  // Badge click to toggle popover
  badge.addEventListener("click", () => {
    if (isPopoverVisible) {
      hidePopover();
    } else {
      showPopover();
      input.focus();
      input.select();
    }
  });

  // Update UI when tempo changes externally
  const updateUI = () => {
    const { currentTempo: newTempo } = getTempoState();
    currentTempo = newTempo;
    badge.textContent = `${Math.round(newTempo)} BPM`;
    badge.setAttribute("aria-label", `Playback tempo: ${Math.round(newTempo)} BPM`);
    // Only update input if it's not focused
    if (document.activeElement !== input) {
      input.value = String(Math.round(newTempo));
    }
  };

  // Listen for UI refresh events
  const handleRefresh = () => updateUI();
  document.addEventListener("wr-force-ui-refresh", handleRefresh);

  // Cleanup on removal
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

  // Keyboard navigation
  container.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      hidePopover();
      badge.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      applyTempo(currentTempo + 1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      applyTempo(currentTempo - 1);
    }
  });

  return container;
}
