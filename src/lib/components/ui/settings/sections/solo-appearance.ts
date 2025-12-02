import { UIComponentDependencies } from "../../types";
import { renderOnsetSVG } from "@/assets/onset-icons";
import { toHexColor } from "@/lib/core/utils/color";
import { ONSET_MARKER_SHAPES } from "@/core/constants";
import { DEFAULT_PALETTES } from "@/lib/core/midi/palette";
import type { OnsetMarkerStyle, OnsetMarkerShape } from "@/types";

/**
 * Build a simplified appearance section for solo mode.
 * Shows color and onset marker selection for the single MIDI file.
 *
 * @param deps - The UI component dependencies.
 * @returns The root <div> for the solo appearance section.
 */
export function createSoloAppearanceSection(
  deps: UIComponentDependencies
): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.style.cssText = "margin-top:16px;";

  // Get the first (and only) file in solo mode
  const files = deps.midiManager.getState().files;
  if (files.length === 0) {
    const emptyMsg = document.createElement("p");
    emptyMsg.textContent = "No MIDI file loaded.";
    emptyMsg.style.cssText = "color:var(--text-muted);font-size:14px;";
    wrapper.appendChild(emptyMsg);
    return wrapper;
  }

  const file = files[0];
  const fileId = file.id;

  // Section title
  const title = document.createElement("h3");
  title.textContent = "Note Appearance";
  title.style.cssText = "margin:0 0 12px;font-size:16px;font-weight:600;color:var(--text-primary);";
  wrapper.appendChild(title);

  // Current color and style (mutable)
  let currentColorHex = toHexColor(file.color);
  let currentStyle = deps.stateManager.getOnsetMarkerForFile(fileId) 
    || deps.stateManager.ensureOnsetMarkerForFile(fileId);

  // Forward declarations for functions used in rebuildColorButtons
  let updateMarkerPreviews: () => void = () => {};
  let dispatchSettingsChange: () => void = () => {};

  // ---- Color Selection ----
  const colorSection = document.createElement("div");
  colorSection.style.cssText = "margin-bottom:16px;";

  const colorLabel = document.createElement("div");
  colorLabel.textContent = "Note Color";
  colorLabel.style.cssText = "font-size:13px;color:var(--text-muted);margin-bottom:8px;";
  colorSection.appendChild(colorLabel);

  const colorsRow = document.createElement("div");
  colorsRow.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;";

  const colorButtons: HTMLButtonElement[] = [];

  const updateColorSelection = () => {
    colorButtons.forEach((btn) => {
      const isSelected = (btn.dataset.hex || "").toLowerCase() === currentColorHex.toLowerCase();
      btn.style.outline = isSelected ? "2px solid var(--focus-ring)" : "none";
      btn.style.outlineOffset = isSelected ? "2px" : "0";
    });
  };

  /**
   * Rebuild color buttons based on the current active palette.
   * Called initially and when palette changes.
   */
  const rebuildColorButtons = () => {
    const state = deps.midiManager.getState();
    const allPalettes = [...DEFAULT_PALETTES, ...state.customPalettes];
    const palette = allPalettes.find((p) => p.id === state.activePaletteId) || DEFAULT_PALETTES[0];

    // Sync current color from file state (palette switch may have changed it)
    const currentFile = state.files.find((f) => f.id === fileId);
    if (currentFile) {
      currentColorHex = toHexColor(currentFile.color);
    }

    // Clear existing buttons
    colorsRow.innerHTML = "";
    colorButtons.length = 0;

    // Create buttons for the new palette colors
    palette.colors.forEach((color) => {
      const hex = toHexColor(color);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.hex = hex;
      btn.setAttribute("aria-label", `Select color ${hex}`);
      btn.style.cssText = `
        width:28px;height:28px;border-radius:6px;
        border:1px solid var(--ui-border);background:${hex};
        cursor:pointer;transition:transform 0.1s;
      `;
      btn.onmouseenter = () => { btn.style.transform = "scale(1.1)"; };
      btn.onmouseleave = () => { btn.style.transform = "scale(1)"; };
      btn.onclick = () => {
        deps.midiManager.updateColor(fileId, color);
        currentColorHex = hex;
        updateColorSelection();
        updateMarkerPreviews();
        dispatchSettingsChange();
      };
      colorButtons.push(btn);
      colorsRow.appendChild(btn);
    });

    updateColorSelection();
    updateMarkerPreviews();
  };

  colorSection.appendChild(colorsRow);
  wrapper.appendChild(colorSection);

  // ---- Onset Marker Style Selection with Toggle ----
  const markerSection = document.createElement("div");

  const markerLabel = document.createElement("div");
  markerLabel.textContent = "Onset Marker";
  markerLabel.style.cssText = "font-size:13px;color:var(--text-muted);margin-bottom:8px;";
  markerSection.appendChild(markerLabel);

  const markerWrapper = document.createElement("div");
  markerWrapper.style.cssText = "display:flex;flex-direction:column;gap:8px;";

  const variants: Array<OnsetMarkerStyle["variant"]> = ["filled", "outlined"];
  const markerButtons: HTMLButtonElement[] = [];
  let activeVariant: OnsetMarkerStyle["variant"] = currentStyle.variant;

  // Toggle button container
  const toggleContainer = document.createElement("div");
  toggleContainer.style.cssText = "display:flex;gap:2px;background:var(--ui-border);border-radius:6px;padding:2px;";

  const toggleButtons: HTMLButtonElement[] = [];
  const updateToggleStyles = () => {
    toggleButtons.forEach((btn) => {
      const isActive = btn.dataset.variant === activeVariant;
      btn.style.background = isActive ? "var(--surface)" : "transparent";
      btn.style.color = isActive ? "var(--text-primary)" : "var(--text-muted)";
      btn.style.fontWeight = isActive ? "600" : "400";
      btn.style.boxShadow = isActive ? "0 1px 2px rgba(0,0,0,0.1)" : "none";
    });
  };

  variants.forEach((variant) => {
    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.textContent = variant === "filled" ? "Filled" : "Outlined";
    toggleBtn.dataset.variant = variant;
    toggleBtn.style.cssText = `
      flex:1;padding:6px 12px;border:none;border-radius:4px;
      font-size:12px;cursor:pointer;transition:all 0.15s ease;
    `;
    toggleBtn.onclick = () => {
      activeVariant = variant;
      updateToggleStyles();
      updateMarkerGrid();
    };
    toggleButtons.push(toggleBtn);
    toggleContainer.appendChild(toggleBtn);
  });

  markerWrapper.appendChild(toggleContainer);

  // Single grid for active variant
  const grid = document.createElement("div");
  grid.style.cssText = "display:grid;grid-template-columns:repeat(7,32px);gap:6px;";

  const updateMarkerSelection = () => {
    markerButtons.forEach((btn) => {
      const isSelected = 
        btn.dataset.shape === currentStyle.shape && 
        btn.dataset.variant === currentStyle.variant;
      btn.style.outline = isSelected ? "2px solid var(--focus-ring)" : "none";
      btn.style.outlineOffset = isSelected ? "1px" : "0";
    });
  };

  // Assign the actual implementation
  updateMarkerPreviews = () => {
    markerButtons.forEach((btn) => {
      const shape = btn.dataset.shape as OnsetMarkerShape;
      const variant = btn.dataset.variant as OnsetMarkerStyle["variant"];
      const style: OnsetMarkerStyle = { shape, variant, size: 12, strokeWidth: 2 };
      btn.innerHTML = renderOnsetSVG(style, currentColorHex, 18);
    });
  };

  const updateMarkerGrid = () => {
    grid.innerHTML = "";
    markerButtons.length = 0;

    ONSET_MARKER_SHAPES.forEach((shape) => {
      const style: OnsetMarkerStyle = { 
        shape: shape as OnsetMarkerShape, 
        variant: activeVariant, 
        size: 12, 
        strokeWidth: 2 
      };
      const btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("aria-label", `${shape} ${activeVariant}`);
      btn.dataset.shape = shape;
      btn.dataset.variant = activeVariant;
      btn.style.cssText = `
        width:32px;height:32px;
        border:1px solid var(--ui-border);border-radius:6px;
        background:var(--surface);
        display:flex;align-items:center;justify-content:center;
        cursor:pointer;transition:background 0.1s;
      `;
      btn.innerHTML = renderOnsetSVG(style, currentColorHex, 18);
      btn.onmouseenter = () => { btn.style.background = "var(--hover-surface)"; };
      btn.onmouseleave = () => { btn.style.background = "var(--surface)"; };
      btn.onclick = () => {
        deps.stateManager.setOnsetMarkerForFile(fileId, style);
        currentStyle = style;
        updateMarkerSelection();
        dispatchSettingsChange();
      };
      markerButtons.push(btn);
      grid.appendChild(btn);
    });

    updateMarkerSelection();
  };

  // Dispatch custom event when settings change (for wave-roll-solo integration)
  dispatchSettingsChange = () => {
    const state = deps.midiManager.getState();
    const event = new CustomEvent("wr-appearance-change", {
      bubbles: true,
      detail: {
        paletteId: state.activePaletteId,
        noteColor: parseInt(currentColorHex.replace("#", ""), 16),
        onsetMarker: {
          shape: currentStyle.shape,
          variant: currentStyle.variant,
        },
      },
    });
    wrapper.dispatchEvent(event);
  };

  // Initialize UI
  rebuildColorButtons();
  updateToggleStyles();
  updateMarkerGrid();

  markerWrapper.appendChild(grid);
  markerSection.appendChild(markerWrapper);
  wrapper.appendChild(markerSection);

  // Subscribe to midiManager state changes to detect palette changes
  let lastPaletteId = deps.midiManager.getState().activePaletteId;
  const unsubscribe = deps.midiManager.subscribe((state) => {
    if (state.activePaletteId !== lastPaletteId) {
      lastPaletteId = state.activePaletteId;
      rebuildColorButtons();
    }
  });

  // Cleanup subscription when wrapper is removed from DOM
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.removedNodes) {
        if (node === wrapper || (node instanceof Element && node.contains(wrapper))) {
          unsubscribe();
          observer.disconnect();
          return;
        }
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  return wrapper;
}
