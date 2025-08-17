import { createSettingsModalSkeleton } from "./skeleton";
import { createModalHeader } from "./header";
import { createFileList } from "../sections/file-list";
import { createPaletteSelectorSection } from "../sections/palette-selector";
import { createEvaluationSection } from "../sections/evaluation";
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
  const header = createModalHeader("MIDI Settings", () => overlay.remove());

  // Append sections
  const paletteSection = createPaletteSelectorSection(deps);
  const fileListSection = createFileList(deps);
  const evaluationSection = createEvaluationSection(deps);
  modal.appendChild(header);
  modal.appendChild(paletteSection);
  modal.appendChild(fileListSection);
  modal.appendChild(evaluationSection);

  // Close when clicking outside the modal panel.
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });

  document.body.appendChild(overlay);
}
