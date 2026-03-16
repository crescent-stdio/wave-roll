import type { InstrumentFamily } from "@/lib/core/utils/midi/types";
import type { MultiMidiManager } from "@/lib/core/midi/multi-midi-manager";
import { getInstrumentIcon } from "@/assets/instrument-icons";
import { FAMILY_REPRESENTATIVE_PROGRAM } from "@/lib/core/audio/gm-instruments";

/** Ordered list of instrument families displayed in the picker grid. */
const FAMILY_ORDER: InstrumentFamily[] = [
  "piano",
  "strings",
  "brass",
  "winds",
  "guitar",
  "bass",
  "organ",
  "mallet",
  "synth",
  "vocal",
  "drums",
  "others",
];

/** Display labels for each instrument family. */
const FAMILY_LABELS: Record<InstrumentFamily, string> = {
  piano: "Piano",
  strings: "Strings",
  drums: "Drums",
  guitar: "Guitar",
  bass: "Bass",
  synth: "Synth",
  winds: "Winds",
  brass: "Brass",
  vocal: "Vocal",
  organ: "Organ",
  mallet: "Mallet",
  others: "Others",
};

/**
 * Open a popover to choose an instrument family for a specific track.
 * Mounts on document.body for Shadow DOM compatibility.
 *
 * NOTE: All innerHTML assignments below use only pre-defined SVG icon strings
 * from getInstrumentIcon() and hardcoded label constants — no user input is
 * interpolated, so there is no XSS risk.
 */
export function openInstrumentPicker(
  midiManager: MultiMidiManager,
  fileId: string,
  trackId: number,
  anchorEl: HTMLElement,
  onClose?: () => void,
): void {
  // Ensure only one picker at a time
  const existing = document.getElementById("wr-instrument-picker-overlay");
  if (existing) {
    existing.remove();
  }

  const overlay = document.createElement("div");
  overlay.id = "wr-instrument-picker-overlay";
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 3000; background: transparent;
  `;

  const panel = document.createElement("div");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Instrument picker");
  panel.style.cssText = `
    position: absolute; width: 200px;
    background: var(--surface); border: 1px solid var(--ui-border);
    border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.18);
    padding: 8px; display: flex; flex-direction: column; gap: 6px;
  `;

  // Current state
  const currentOverride = midiManager.getTrackOverrideInstrumentFamily(fileId, trackId);
  const originalFamily = midiManager.getTrackInstrumentFamily(fileId, trackId);

  // Title
  const title = document.createElement("div");
  title.textContent = "Instrument";
  title.style.cssText = "font-size:11px;color:var(--text-muted);font-weight:500;padding:0 2px;";

  // Auto button (restore original)
  const autoBtn = document.createElement("button");
  autoBtn.type = "button";
  const isAuto = currentOverride === null;

  // Build auto button content safely using DOM methods + trusted SVG icons
  const autoIconSpan = document.createElement("span");
  autoIconSpan.style.cssText =
    "display:flex;align-items:center;justify-content:center;width:18px;height:18px;";
  autoIconSpan.innerHTML = getInstrumentIcon(originalFamily); // trusted SVG constant
  const autoLabelSpan = document.createElement("span");
  autoLabelSpan.textContent = `Auto (${FAMILY_LABELS[originalFamily]})`;
  autoBtn.appendChild(autoIconSpan);
  autoBtn.appendChild(autoLabelSpan);

  autoBtn.style.cssText = `
    display: flex; align-items: center; gap: 6px;
    width: 100%; padding: 4px 6px; border: 1px solid ${isAuto ? "var(--accent-primary, #3b82f6)" : "var(--ui-border)"};
    border-radius: 6px; background: ${isAuto ? "color-mix(in srgb, var(--accent-primary, #3b82f6) 10%, var(--surface))" : "var(--surface)"};
    cursor: pointer; font-size: 11px; color: var(--text-primary);
    transition: all 0.12s ease;
  `;
  autoBtn.onclick = () => {
    midiManager.setTrackOverrideInstrument(fileId, trackId, null);
    cleanup();
  };

  // Divider
  const hr = document.createElement("div");
  hr.style.cssText = "height:1px;background:var(--ui-border);margin:0;";

  // Grid of instrument families (4 columns × 3 rows)
  const grid = document.createElement("div");
  grid.style.cssText = "display:grid;grid-template-columns:repeat(4,1fr);gap:4px;";

  const gridButtons: HTMLButtonElement[] = [];

  FAMILY_ORDER.forEach((family, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.family = family;
    btn.dataset.index = String(idx);
    const isSelected = currentOverride === family;

    // Build button content with DOM methods + trusted SVG icon
    const iconSpan = document.createElement("span");
    iconSpan.style.cssText =
      "display:flex;align-items:center;justify-content:center;width:20px;height:20px;";
    iconSpan.innerHTML = getInstrumentIcon(family); // trusted SVG constant
    const labelSpan = document.createElement("span");
    labelSpan.textContent = FAMILY_LABELS[family];
    labelSpan.style.cssText =
      "font-size:9px;line-height:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
    btn.appendChild(iconSpan);
    btn.appendChild(labelSpan);

    btn.style.cssText = `
      display: flex; flex-direction: column; align-items: center; gap: 2px;
      padding: 4px 2px; border: 1px solid ${isSelected ? "var(--accent-primary, #3b82f6)" : "transparent"};
      border-radius: 6px; background: ${isSelected ? "color-mix(in srgb, var(--accent-primary, #3b82f6) 10%, var(--surface))" : "var(--surface)"};
      cursor: pointer; color: ${isSelected ? "var(--accent-primary, #3b82f6)" : "var(--text-primary)"};
      transition: all 0.12s ease; min-width: 0;
    `;
    btn.onmouseenter = () => {
      if (currentOverride !== family) {
        btn.style.background = "var(--surface-alt, #f1f5f9)";
      }
    };
    btn.onmouseleave = () => {
      if (currentOverride !== family) {
        btn.style.background = "var(--surface)";
      }
    };
    btn.onclick = () => {
      midiManager.setTrackOverrideInstrument(fileId, trackId, family);
      // Preload the SoundFont for immediate playback
      const program = FAMILY_REPRESENTATIVE_PROGRAM[family];
      const audioCtrl = (
        globalThis as unknown as {
          _waveRollAudioController?: {
            preloadProgramSamplers?: (programs: number[]) => Promise<void>;
          };
        }
      )._waveRollAudioController;
      audioCtrl?.preloadProgramSamplers?.([program])?.catch(() => {});
      cleanup();
    };
    grid.appendChild(btn);
    gridButtons.push(btn);
  });

  // Build panel
  panel.appendChild(title);
  panel.appendChild(autoBtn);
  panel.appendChild(hr);
  panel.appendChild(grid);
  overlay.appendChild(panel);

  // Close when clicking outside
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) cleanup();
  });

  // ESC to close
  overlay.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Escape") cleanup();
  });

  // Arrow-key navigation in grid (4 columns)
  const COLUMNS = 4;
  overlay.addEventListener("keydown", (e) => {
    const ev = e as KeyboardEvent;
    const target = ev.target as HTMLElement;
    if (!target?.hasAttribute("data-index")) return;

    const cur = Number(target.getAttribute("data-index") || "0");
    let next = cur;
    if (ev.key === "ArrowRight") next = Math.min(gridButtons.length - 1, cur + 1);
    else if (ev.key === "ArrowLeft") next = Math.max(0, cur - 1);
    else if (ev.key === "ArrowDown") next = Math.min(gridButtons.length - 1, cur + COLUMNS);
    else if (ev.key === "ArrowUp") next = Math.max(0, cur - COLUMNS);
    else if (ev.key === "Enter" || ev.key === " ") {
      (target as HTMLButtonElement).click();
      ev.preventDefault();
      return;
    }
    if (next !== cur) {
      ev.preventDefault();
      gridButtons[next]?.focus();
    }
  });

  document.body.appendChild(overlay);

  // Position after mount
  panel.style.visibility = "hidden";
  requestAnimationFrame(() => {
    panel.style.visibility = "visible";
    positionPanel();
  });

  // Reposition on viewport changes
  const reflow = () => positionPanel();
  window.addEventListener("resize", reflow);
  window.addEventListener("scroll", reflow, { passive: true });

  function cleanup(): void {
    window.removeEventListener("resize", reflow);
    window.removeEventListener("scroll", reflow);
    overlay.remove();
    onClose?.();
  }

  function positionPanel(): void {
    const padding = 8;
    const gap = 6;
    const rect = anchorEl.getBoundingClientRect();
    const ph = panel.offsetHeight;
    const pw = panel.offsetWidth;
    const spaceBelow = window.innerHeight - rect.bottom - padding;
    const spaceAbove = rect.top - padding;

    let top: number;
    if (ph <= spaceBelow || spaceBelow >= spaceAbove) {
      top = Math.min(rect.bottom + gap, window.innerHeight - ph - padding);
    } else {
      top = Math.max(padding, rect.top - ph - gap);
    }

    const left = Math.max(padding, Math.min(window.innerWidth - pw - padding, rect.left));

    panel.style.top = `${Math.round(top)}px`;
    panel.style.left = `${Math.round(left)}px`;
  }

  // Focus auto button initially
  setTimeout(() => autoBtn.focus(), 0);
}
