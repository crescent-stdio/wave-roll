import { createSettingsModalSkeleton } from "./skeleton";
import { createModalHeader } from "./header";
import { createFileList } from "../sections/file-list";
import { createPaletteSelectorSection } from "../sections/palette-selector";
import { createWaveListSection } from "../sections/wave-list";
import { createSoloAppearanceSection } from "../sections/solo-appearance";
import { UIComponentDependencies } from "@/lib/components/ui";

/**
 * Open (or focus) the MIDI settings modal.
 * Creates the modal only once and re‑uses it on subsequent calls.
 *
 * @param deps - The UI component dependencies.
 */
export function openSettingsModal(deps: UIComponentDependencies): void {
  const { overlay, modal } = createSettingsModalSkeleton();

  // If the modal is already populated, bring it to front and exit.
  if (modal.childElementCount > 0) {
    if (!overlay.parentElement) document.body.appendChild(overlay);
    return;
  }

  // ---- Build modal content ----
  const isSoloMode = deps.soloMode === true;
  const headerTitle = isSoloMode ? "Appearance" : "Files & Appearance";
  const header = createModalHeader(headerTitle, () => overlay.remove());
  modal.appendChild(header);

  // Append sections based on mode
  const paletteSection = createPaletteSelectorSection(deps);
  modal.appendChild(paletteSection);

  if (isSoloMode) {
    // Solo mode: show simplified single-file appearance section
    const soloAppearanceSection = createSoloAppearanceSection(deps);
    modal.appendChild(soloAppearanceSection);
  } else {
    // Normal mode: show wave list and file list
    const waveListSection = createWaveListSection(deps);
    const fileListSection = createFileList(deps);
    modal.appendChild(waveListSection);
    modal.appendChild(fileListSection);
  }

  // Close when clicking outside the modal panel.
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });

  document.body.appendChild(overlay);
}
