import { createSettingsModalSkeleton } from "./skeleton";
import { UIComponentDependencies } from "../../types";
import { ColorPalette } from "@/lib/core/midi/types";
import { toHexColor } from "@/lib/core/utils/color";

/**
 * Open the palette editor modal.
 *
 * @param deps       UI component dependencies (gives access to midiManager).
 * @param palette    When provided, the modal works in *edit* mode; otherwise *create*.
 * @param onSave     Callback fired once a palette is saved/updated (e.g. to re-render selector).
 */
export function openPaletteEditorModal(
  deps: UIComponentDependencies,
  palette: ColorPalette | null,
  onSave: () => void,
  mode: "create" | "edit" | "clone" = palette ? "edit" : "create"
): void {
  const { overlay, modal } = createSettingsModalSkeleton(
    "palette-editor-modal"
  );

  // Clear any existing children so that reopening resets the form.
  while (modal.firstChild) modal.removeChild(modal.firstChild);

  const isEdit = mode === "edit";
  const workingId = isEdit && palette ? palette.id : Date.now().toString();
  const workingName =
    mode === "clone" && palette
      ? `${palette.name} Copy`
      : (palette?.name ?? "");
  const workingColors: string[] = (palette?.colors ?? [0x000000]).map((c) =>
    toHexColor(c)
  );

  // ---------- Name input ----------
  const nameLabel = document.createElement("label");
  nameLabel.textContent = "Palette name";
  nameLabel.style.cssText =
    "font-weight:600;font-size:14px;display:block;margin-bottom:4px;";

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.value = workingName;
  nameInput.placeholder = "My palette";
  nameInput.style.cssText =
    "width:100%;padding:6px 8px;border:1px solid #ced4da;border-radius:6px;margin-bottom:12px;";

  // ---------- Color grid ----------
  const colorGrid = document.createElement("div");
  colorGrid.style.cssText =
    "display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;";

  const renderColorCells = () => {
    // Clear grid first
    while (colorGrid.firstChild) colorGrid.removeChild(colorGrid.firstChild);

    workingColors.forEach((hex, idx) => {
      // Wrapper so we can stack swatch + HEX input vertically.
      const wrapper = document.createElement("div");
      wrapper.style.cssText =
        "display:flex;flex-direction:column;align-items:center;gap:4px;";

      const cell = document.createElement("button");
      cell.type = "button";
      cell.title = "Click to change color, right-click to remove";
      cell.style.cssText = `width:32px;height:32px;border-radius:4px;border:1px solid #ced4da;background:${hex};cursor:pointer;position:relative;`;

      // HEX text input (declared early so it is in scope for colorInput handler)
      const hexInput = document.createElement("input");
      hexInput.type = "text";
      hexInput.maxLength = 7; // including '#'
      hexInput.placeholder = "#000000";
      hexInput.value = hex;
      hexInput.style.cssText =
        "width:70px;padding:2px 4px;font-size:10px;font-family:monospace;text-align:center;border:1px solid #ced4da;border-radius:4px;";

      // Hidden <input type="color"> used as native picker
      const colorInput = document.createElement("input");
      colorInput.type = "color";
      colorInput.value = hex;
      colorInput.style.cssText =
        "position:absolute;opacity:0;width:0;height:0;border:0;padding:0;";
      colorInput.onchange = () => {
        workingColors[idx] = colorInput.value;
        cell.style.background = colorInput.value;
        hexInput.value = colorInput.value.replace("#", "");
      };

      cell.onclick = () => colorInput.click();
      cell.oncontextmenu = (e) => {
        e.preventDefault();
        if (workingColors.length > 1) {
          workingColors.splice(idx, 1);
          renderColorCells();
        }
      };

      cell.appendChild(colorInput);

      // Update color when user edits HEX manually
      hexInput.oninput = () => {
        const raw = hexInput.value.trim();
        if (/^#[0-9a-fA-F]{0,6}$/.test(raw)) {
          // Update live when # + 6 chars entered
          if (raw.length === 7) {
            workingColors[idx] = raw;
            cell.style.background = raw;
            colorInput.value = raw;
          }
        }
      };

      wrapper.appendChild(cell);
      wrapper.appendChild(hexInput);
      colorGrid.appendChild(wrapper);
    });
  };

  renderColorCells();

  // ---------- Add color button ----------
  const addColorBtn = document.createElement("button");
  addColorBtn.type = "button";
  addColorBtn.textContent = "+ Add color";
  addColorBtn.style.cssText =
    "padding:6px 8px;border:1px dashed #ced4da;border-radius:6px;background:#fff;font-size:12px;cursor:pointer;margin-bottom:16px;";
  addColorBtn.onclick = () => {
    workingColors.push("#000000");
    renderColorCells();
  };

  // ---------- Action buttons ----------
  const actionsRow = document.createElement("div");
  actionsRow.style.cssText = "display:flex;justify-content:flex-end;gap:8px;";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.textContent = "Cancel";
  cancelBtn.style.cssText =
    "padding:6px 12px;border:1px solid #ced4da;border-radius:6px;background:#fff;cursor:pointer;";
  cancelBtn.onclick = () => overlay.remove();

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.textContent = isEdit ? "Update" : "Create";
  saveBtn.style.cssText =
    "padding:6px 12px;border:1px solid #495057;border-radius:6px;background:#495057;color:#fff;cursor:pointer;";
  saveBtn.onclick = () => {
    // Validate
    const name = nameInput.value.trim();
    if (!name) {
      alert("Palette name is required");
      return;
    }

    const parsedColors = workingColors
      .map((h) => h.replace("#", ""))
      .filter((c) => /^([0-9a-fA-F]{6})$/.test(c))
      .map((hex) => parseInt(hex, 16));

    if (parsedColors.length === 0) {
      alert("At least one valid color is required");
      return;
    }

    if (isEdit) {
      deps.midiManager.updateCustomPalette(workingId, {
        name,
        colors: parsedColors,
      });
    } else {
      deps.midiManager.addCustomPalette({
        id: workingId,
        name,
        colors: parsedColors,
      });
    }

    overlay.remove();
    onSave();
  };

  actionsRow.append(cancelBtn, saveBtn);
  modal.append(nameLabel, nameInput, colorGrid, addColorBtn, actionsRow);

  document.body.appendChild(overlay);
}
