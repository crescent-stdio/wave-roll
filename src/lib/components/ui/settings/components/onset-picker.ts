import { UIComponentDependencies } from "../../types";
import { DEFAULT_PALETTES } from "@/lib/core/midi/palette";
import { renderOnsetSVG } from "@/assets/onset-icons";
import type { OnsetMarkerStyle, OnsetMarkerShape } from "@/types";
import { ONSET_MARKER_SHAPES } from "@/core/constants";
import { toHexColor } from "@/lib/core/utils/color";

/**
 * Open a popover anchored to the provided element to choose color + onset marker.
 */
export function openOnsetPicker(
  deps: UIComponentDependencies,
  fileId: string,
  anchorEl: HTMLElement,
  onUpdate?: (style: OnsetMarkerStyle, colorHex: string) => void
): void {
  // Ensure only one picker exists at a time
  const existing = document.getElementById("wr-onset-picker-overlay");
  if (existing) {
    existing.remove();
  }
  const overlay = document.createElement("div");
  overlay.id = "wr-onset-picker-overlay";
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 3000; background: transparent; 
  `;

  const panel = document.createElement("div");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Onset marker picker");
  panel.style.cssText = `
    position: absolute; min-width: 240px; max-width: 420px; 
    background: var(--surface); border: 1px solid var(--ui-border);
    border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.18);
    padding: 10px; display: flex; flex-direction: column; gap: 10px;
  `;

  // Defer positioning until attached so we can read actual size and flip above when needed
  function positionPanel(): void {
    const padding = 8;
    const gap = 6;
    const rect = anchorEl.getBoundingClientRect();
    const ph = panel.offsetHeight;
    const pw = panel.offsetWidth;
    const spaceBelow = window.innerHeight - rect.bottom - padding;
    const spaceAbove = rect.top - padding;

    // Decide vertical placement: prefer below, flip to above if not enough space
    let top: number;
    if (ph <= spaceBelow || spaceBelow >= spaceAbove) {
      top = Math.min(rect.bottom + gap, window.innerHeight - ph - padding);
    } else {
      top = Math.max(padding, rect.top - ph - gap);
    }

    // Horizontal clamping
    let left = Math.max(padding, Math.min(window.innerWidth - pw - padding, rect.left));

    panel.style.top = `${Math.round(top)}px`;
    panel.style.left = `${Math.round(left)}px`;
  }

  // Header (optional)
  const title = document.createElement("div");
  title.textContent = "Choose color & marker";
  title.style.cssText = "font-size:12px;color:var(--text-muted);margin-bottom:2px;";

  // Read current palette/colors
  const { activePaletteId, customPalettes } = deps.midiManager.getState();
  const allPalettes = [...DEFAULT_PALETTES, ...customPalettes];
  const palette = allPalettes.find((p) => p.id === activePaletteId) || DEFAULT_PALETTES[0];

  // Current color/style
  const file = deps.midiManager.getState().files.find((f) => f.id === fileId);
  const currentColorHex = toHexColor(file?.color ?? 0x000000);
  const currentStyle = deps.stateManager.getOnsetMarkerForFile(fileId) || deps.stateManager.ensureOnsetMarkerForFile(fileId);

  // Color chips row
  const colorsRow = document.createElement("div");
  colorsRow.setAttribute("role", "listbox");
  colorsRow.style.cssText = "display:flex;gap:6px;flex-wrap:wrap;";
  const colorButtons: HTMLButtonElement[] = [];
  let selectedColorHex = currentColorHex;
  const highlightSelectedColor = () => {
    colorButtons.forEach((b) => {
      const isSel = (b.dataset.hex || "").toLowerCase() === selectedColorHex.toLowerCase();
      b.style.outline = isSel ? "2px solid var(--focus-ring)" : "none";
      b.setAttribute("aria-selected", String(isSel));
      b.tabIndex = isSel ? 0 : -1;
    });
  };
  palette.colors.forEach((color, idx) => {
    const hex = toHexColor(color);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.hex = hex;
    btn.setAttribute("aria-label", `Select color ${hex}`);
    btn.style.cssText = `width:22px;height:22px;border-radius:4px;border:1px solid var(--ui-border);background:${hex};cursor:pointer;`;
    btn.onclick = () => {
      deps.midiManager.updateColor(fileId, color);
      selectedColorHex = hex;
      highlightSelectedColor();
      if (onUpdate) onUpdate(currentStyle, hex);
    };
    if (idx === 0) btn.tabIndex = 0;
    colorButtons.push(btn);
    colorsRow.appendChild(btn);
  });
  highlightSelectedColor();

  // Divider
  const hr = document.createElement("div");
  hr.style.cssText = "height:1px;background:var(--ui-border);margin:2px 0;";

  // Marker grid with Filled/Outlined toggle
  const gridWrapper = document.createElement("div");
  gridWrapper.style.cssText = "display:flex;flex-direction:column;gap:6px;";

  const variants: Array<OnsetMarkerStyle["variant"]> = ["filled", "outlined"];
  const shapeButtons: HTMLButtonElement[] = [];
  let selectedStyle: OnsetMarkerStyle = { ...currentStyle };
  let activeVariant: OnsetMarkerStyle["variant"] = currentStyle.variant;
  const COLUMNS = 7;

  // Toggle button container
  const toggleContainer = document.createElement("div");
  toggleContainer.style.cssText = "display:flex;gap:2px;margin-bottom:6px;background:var(--ui-border);border-radius:6px;padding:2px;";

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
      flex:1;padding:4px 8px;border:none;border-radius:4px;
      font-size:11px;cursor:pointer;transition:all 0.15s ease;
    `;
    toggleBtn.onclick = () => {
      activeVariant = variant;
      updateToggleStyles();
      updateGrid();
    };
    toggleButtons.push(toggleBtn);
    toggleContainer.appendChild(toggleBtn);
  });

  // Single grid for active variant
  const grid = document.createElement("div");
  grid.style.cssText = "display:grid;grid-template-columns:repeat(7,28px);gap:6px;";

  const highlightSelectedStyle = () => {
    shapeButtons.forEach((b) => {
      const isSel = b.dataset.shape === selectedStyle.shape && b.dataset.variant === selectedStyle.variant;
      b.style.outline = isSel ? "2px solid var(--focus-ring)" : "none";
      b.setAttribute("aria-pressed", String(isSel));
      if (isSel) b.tabIndex = 0;
    });
  };

  const updateGrid = () => {
    grid.innerHTML = "";
    shapeButtons.length = 0;

    ONSET_MARKER_SHAPES.forEach((shape) => {
      const style: OnsetMarkerStyle = { shape: shape as OnsetMarkerShape, variant: activeVariant, size: 12, strokeWidth: 2 };
      const btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("aria-label", `${shape} ${activeVariant}`);
      btn.dataset.shape = String(shape);
      btn.dataset.variant = String(activeVariant);
      btn.dataset.index = String(shapeButtons.length);
      btn.style.cssText = "width:28px;height:28px;border:1px solid var(--ui-border);border-radius:6px;background:var(--surface);display:flex;align-items:center;justify-content:center;cursor:pointer;";
      btn.innerHTML = renderOnsetSVG(style, currentColorHex, 16);
      btn.onclick = () => {
        deps.stateManager.setOnsetMarkerForFile(fileId, style);
        const f = deps.midiManager.getState().files.find((x) => x.id === fileId);
        const hex = toHexColor(f?.color ?? 0x000000);
        selectedStyle = style;
        highlightSelectedStyle();
        if (onUpdate) onUpdate(style, hex);
      };
      grid.appendChild(btn);
      shapeButtons.push(btn);
    });

    highlightSelectedStyle();
  };

  // Initialize
  updateToggleStyles();
  updateGrid();

  gridWrapper.appendChild(toggleContainer);
  gridWrapper.appendChild(grid);

  // Footer actions
  const footer = document.createElement("div");
  footer.style.cssText = "display:flex;gap:8px;justify-content:flex-end;";
  const autoBtn = document.createElement("button");
  autoBtn.type = "button";
  autoBtn.textContent = "Auto assign";
  autoBtn.style.cssText = "padding:4px 8px;border:1px solid var(--ui-border);border-radius:4px;background:var(--surface);cursor:pointer;";
  autoBtn.onclick = () => {
    const picked = deps.stateManager.assignNextUniqueOnsetMarker
      ? deps.stateManager.assignNextUniqueOnsetMarker(fileId)
      : deps.stateManager.ensureOnsetMarkerForFile(fileId);
    const f = deps.midiManager.getState().files.find((x) => x.id === fileId);
    const hex = toHexColor(f?.color ?? 0x000000);
    // Update local selection highlight
    selectedStyle = picked;
    highlightSelectedStyle();
    if (onUpdate) onUpdate(picked, hex);
  };

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.textContent = "Close";
  closeBtn.style.cssText = "padding:4px 8px;border:1px solid var(--ui-border);border-radius:4px;background:var(--surface);cursor:pointer;";
  closeBtn.onclick = () => overlay.remove();

  footer.appendChild(autoBtn);
  footer.appendChild(closeBtn);

  // Build panel
  panel.appendChild(title);
  panel.appendChild(colorsRow);
  panel.appendChild(hr);
  panel.appendChild(gridWrapper);
  panel.appendChild(footer);
  overlay.appendChild(panel);

  // Close when clicking outside
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
  // ESC to close
  overlay.addEventListener("keydown", (e) => { if ((e as KeyboardEvent).key === "Escape") overlay.remove(); });
  // Arrow-key navigation in grids
  overlay.addEventListener("keydown", (e) => {
    const ev = e as KeyboardEvent;
    const target = ev.target as HTMLElement;
    if (target && target.tagName.toLowerCase() === 'button') {
      const isShape = target.hasAttribute('data-index');
      if (isShape) {
        const cur = Number(target.getAttribute('data-index') || '0');
        let next = cur;
        if (ev.key === 'ArrowRight') next = Math.min(shapeButtons.length - 1, cur + 1);
        else if (ev.key === 'ArrowLeft') next = Math.max(0, cur - 1);
        else if (ev.key === 'ArrowDown') next = Math.min(shapeButtons.length - 1, cur + 7);
        else if (ev.key === 'ArrowUp') next = Math.max(0, cur - 7);
        else if (ev.key === 'Enter' || ev.key === ' ') {
          (target as HTMLButtonElement).click();
          ev.preventDefault();
          return;
        }
        if (next !== cur) {
          ev.preventDefault();
          shapeButtons[next]?.focus();
        }
      } else if (colorsRow.contains(target)) {
        const idx = colorButtons.indexOf(target as HTMLButtonElement);
        if (idx >= 0) {
          let next = idx;
          if (ev.key === 'ArrowRight') next = Math.min(colorButtons.length - 1, idx + 1);
          else if (ev.key === 'ArrowLeft') next = Math.max(0, idx - 1);
          else if (ev.key === 'Enter' || ev.key === ' ') {
            (target as HTMLButtonElement).click();
            ev.preventDefault();
            return;
          }
          if (next !== idx) {
            ev.preventDefault();
            colorButtons[next]?.focus();
          }
        }
      }
    }
  });
  document.body.appendChild(overlay);

  // Position after mount (needs dimensions)
  // Hide briefly to avoid flicker during initial measure
  panel.style.visibility = "hidden";
  requestAnimationFrame(() => {
    panel.style.visibility = "visible";
    positionPanel();
  });

  // Reposition on viewport changes
  const reflow = () => positionPanel();
  window.addEventListener("resize", reflow);
  window.addEventListener("scroll", reflow, { passive: true });
  const cleanup = () => {
    window.removeEventListener("resize", reflow);
    window.removeEventListener("scroll", reflow);
  };
  overlay.addEventListener("remove", cleanup);

  // Focus first interactive
  setTimeout(() => {
    const first = panel.querySelector("button");
    (first as HTMLButtonElement | null)?.focus?.();
  }, 0);
}


