import { UIComponentDependencies } from "../../types";
import { DEFAULT_PALETTE_ID, DEFAULT_PALETTES } from "@/lib/core/midi/palette";
import { openPaletteEditorModal } from "../modal/palette-editor";
import { PLAYER_ICONS } from "@/assets/player-icons";
import { toHexColor } from "@/lib/core/utils/color";

/**
 * Build an interactive palette selector with color previews.
 */
export function createPaletteSelectorSection(
  deps: UIComponentDependencies
): HTMLElement {
  const wrapper = document.createElement("div");
  // Mark wrapper for easy replacement after palette updates
  wrapper.setAttribute("data-palette-selector", "true");

  const title = document.createElement("h3");
  title.id = "palette-title";
  title.textContent = "Color Palette";
  title.style.cssText = "margin:0 0 12px;font-size:16px;font-weight:600;";

  // Container for palette buttons
  const paletteGrid = document.createElement("div");
  paletteGrid.id = "palette-grid";
  paletteGrid.style.cssText =
    "display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:12px;";

  const { customPalettes, activePaletteId } = deps.midiManager.getState();
  const palettes = [...DEFAULT_PALETTES, ...customPalettes];

  // Collapsible details panel shown when a card is clicked
  const detailsRow = document.createElement("div");
  detailsRow.style.cssText =
    "margin-top:12px;padding:8px;border:1px solid #ced4da;border-radius:6px;background:#f8f9fa;display:none;flex-wrap:wrap;gap:12px;align-items:center;";

  // No palette selected initially so we can programmatically expand one.
  let currentDetailsId: string = "";

  const renderDetails = (palette: (typeof palettes)[number]) => {
    if (currentDetailsId === palette.id) {
      // Toggle off when clicking the same palette
      detailsRow.style.display = "none";
      detailsRow.innerHTML = "";
      currentDetailsId = "";
      return;
    }

    currentDetailsId = palette.id;
    detailsRow.innerHTML = "";

    // ----- Large swatch preview -----
    const preview = document.createElement("div");
    preview.style.cssText = "display:flex;gap:4px;flex-wrap:wrap;";
    palette.colors.forEach((col) => {
      const sw = document.createElement("div");
      sw.style.cssText = `width:20px;height:20px;border-radius:3px;background:${toHexColor(
        col
      )}`;
      preview.appendChild(sw);
    });

    // ----- Palette name -----
    const name = document.createElement("span");
    name.textContent = palette.name;
    name.style.cssText = "font-size:14px;font-weight:600;color:#212529;";

    // ----- Action buttons -----
    const btnBar = document.createElement("div");
    btnBar.style.cssText = "display:flex;gap:8px;margin-left:auto;";

    const createIconBtn = (svg: string, title: string, handler: () => void) => {
      const el = document.createElement("button");
      el.type = "button";
      el.title = title;
      el.innerHTML = svg;
      el.style.cssText =
        "width:24px;height:24px;display:flex;align-items:center;justify-content:center;border:none;background:none;cursor:pointer;color:#495057;";
      el.onclick = (e) => {
        e.stopPropagation();
        handler();
      };
      return el;
    };

    // Duplicate available for all palettes
    btnBar.appendChild(
      createIconBtn(PLAYER_ICONS.duplicate, "Duplicate", () => {
        openPaletteEditorModal(
          deps,
          palette as any,
          () => {
            const newSection = createPaletteSelectorSection(deps);
            wrapper.replaceWith(newSection);
          },
          "clone"
        );
      })
    );

    const isCustom = customPalettes.some((p) => p.id === palette.id);
    if (isCustom) {
      // Edit
      btnBar.appendChild(
        createIconBtn(PLAYER_ICONS.edit, "Edit", () => {
          openPaletteEditorModal(
            deps,
            palette as any,
            () => {
              const newSection = createPaletteSelectorSection(deps);
              wrapper.replaceWith(newSection);
            },
            "edit"
          );
        })
      );

      // Delete
      btnBar.appendChild(
        createIconBtn(PLAYER_ICONS.trash, "Delete", () => {
          if (
            confirm(
              `Delete palette \"${palette.name}\"? This action cannot be undone.`
            )
          ) {
            deps.midiManager.removeCustomPalette(palette.id);
            const newSection = createPaletteSelectorSection(deps);
            wrapper.replaceWith(newSection);
          }
        })
      );
    }

    detailsRow.append(preview, name, btnBar);
    detailsRow.style.display = "flex";
  };

  palettes.forEach((palette) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.style.cssText = `display:flex;flex-direction:column;align-items:center;padding:6px 4px;border:1px solid #ced4da;border-radius:6px;cursor:pointer;background:${
      palette.id === activePaletteId ? "#e9ecef" : "#fff"
    };transition:background 0.2s;`;

    // Swatch row
    const swatchRow = document.createElement("div");
    swatchRow.style.cssText = "display:flex;gap:2px;margin-bottom:4px;";
    palette.colors.slice(0, 8).forEach((col) => {
      const sw = document.createElement("div");
      sw.style.cssText = `width:12px;height:12px;border-radius:2px;background:${toHexColor(
        col
      )}`;
      swatchRow.appendChild(sw);
    });

    const label = document.createElement("span");
    label.textContent = palette.name;
    label.style.cssText = "font-size:12px;color:#495057;";

    // ---- Actions toolbar (appears on hover/focus) ----
    const actionsBar = document.createElement("div");
    // Position at top-right so it does not cover the palette label.
    actionsBar.style.cssText =
      "display:flex;gap:4px;position:absolute;top:4px;right:4px;opacity:0;transition:opacity 0.15s;";

    // Show/Hide toolbar on hover / focus
    const showBar = () => (actionsBar.style.opacity = "1");
    const hideBar = () => (actionsBar.style.opacity = "0");
    btn.addEventListener("mouseenter", showBar);
    btn.addEventListener("mouseleave", hideBar);
    btn.addEventListener("focus", showBar);
    btn.addEventListener("blur", hideBar);

    // Small palette preview should remain uncluttered—no edit/duplicate icons here.

    btn.onclick = () => {
      if (deps.midiManager.getState().activePaletteId !== palette.id) {
        deps.midiManager.setActivePalette(palette.id);
      }
      // Highlight selection visually
      [...paletteGrid.children].forEach(
        (c) => c instanceof HTMLElement && (c.style.background = "#fff")
      );
      btn.style.background = "#e9ecef";
      renderDetails(palette); // Show details for the clicked palette
    };

    btn.style.position = "relative";
    btn.append(swatchRow, label);

    paletteGrid.appendChild(btn);
  });

  /* ------------------------------------------------------------------
   * "New Palette" card (shown alongside palette previews)
   * ------------------------------------------------------------------ */
  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.style.cssText =
    "display:flex;flex-direction:column;align-items:center;justify-content:center;padding:6px 4px;border:1px dashed #ced4da;border-radius:6px;cursor:pointer;background:#fff;gap:4px;transition:background 0.2s;";

  const plusSign = document.createElement("span");
  plusSign.textContent = "+";
  plusSign.style.cssText = "font-size:20px;line-height:1;color:#495057;";

  const plusLabel = document.createElement("span");
  plusLabel.textContent = "New Palette";
  plusLabel.style.cssText = "font-size:12px;color:#495057;";

  addBtn.append(plusSign, plusLabel);

  addBtn.onclick = () => {
    openPaletteEditorModal(deps, null, () => {
      const newSection = createPaletteSelectorSection(deps);
      wrapper.replaceWith(newSection);
    });
  };

  paletteGrid.appendChild(addBtn);

  // Auto-expand the details view for the initial palette so that users immediately see palette information.
  const initialPalette =
    palettes.find((p) => p.id === activePaletteId) ?? palettes[0];
  renderDetails(initialPalette);

  wrapper.append(title, paletteGrid, detailsRow);
  return wrapper;
}
