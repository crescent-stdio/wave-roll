/**
 * Create the basic overlay + modal structure for the settings dialog.
 *
 * @param id - DOM id used for the overlay element (prevents duplicates)
 * @returns { overlay, modal } – caller should append overlay to <body>.
 */
export function createSettingsModalSkeleton(id = "multi-midi-settings-modal") {
  // Prevent multiple overlays with the same id.
  const existing = document.getElementById(id);
  if (existing) {
    return {
      overlay: existing as HTMLElement,
      modal: existing.firstElementChild as HTMLElement,
    };
  }

  // Overlay
  const overlay = document.createElement("div");
  overlay.id = id;
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 2000;
  `;

  // Modal panel
  const modal = document.createElement("div");
  modal.style.cssText = `
    width: 600px;
    max-width: 95%;
    max-height: 80vh;
    overflow-y: auto;
    background: #fff;
    border-radius: 12px;
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 24px;
  `;

  overlay.appendChild(modal);
  return { overlay, modal };
}
