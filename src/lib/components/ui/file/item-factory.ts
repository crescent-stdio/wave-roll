import { PLAYER_ICONS } from "@/assets/player-icons";
import { MidiFileEntry, MultiMidiManager } from "@/lib/core/midi";

/**
 * Creates lightweight DOM elements representing MIDI files in the sidebar list.
 */
export class FileItemFactory {
  static createFileItem(
    file: MidiFileEntry,
    midiManager: MultiMidiManager
  ): HTMLElement {
    const item = document.createElement("div");
    item.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: var(--surface);
      border-radius: 6px;
      border: 1px solid var(--ui-border);
      transition: all 0.2s ease;
    `;

    /* -------- visibility toggle -------- */
    const visBtn = document.createElement("button");
    const isVisible = file.isVisible;
    visBtn.innerHTML = isVisible
      ? PLAYER_ICONS.eye_open
      : PLAYER_ICONS.eye_closed;
    visBtn.style.cssText = `
      width: 20px;
      height: 20px;
      padding: 0;
      border: none;
      background: transparent;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: ${isVisible ? "var(--text-muted)" : "rgba(71,85,105,0.5)"};
      transition: color 0.15s ease;
    `;

    visBtn.addEventListener("click", () => {
      midiManager.toggleVisibility(file.id);
    });

    /* color tag */
    const colorIndicator = document.createElement("div");
    colorIndicator.style.cssText = `
      width: 12px;
      height: 12px;
      border-radius: 3px;
      background: #${file.color.toString(16).padStart(6, "0")};
      flex-shrink: 0;
    `;

    /* name */
    const fileName = document.createElement("span");
    fileName.textContent = file.displayName;
    fileName.style.cssText = `
      flex: 1;
      font-size: 14px;
      color: ${file.isVisible ? "var(--text-primary)" : "var(--text-muted)"};
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 100%;
    `;

    /* hover feedback */
    item.addEventListener("mouseenter", () => {
      item.style.borderColor = "var(--accent)";
      item.style.boxShadow = "0 2px 4px rgba(0, 0, 0, 0.1)";
    });
    item.addEventListener("mouseleave", () => {
      item.style.borderColor = "var(--ui-border)";
      item.style.boxShadow = "none";
    });

    // order: color - name - (eye)
    item.appendChild(colorIndicator);
    item.appendChild(fileName);
    item.appendChild(visBtn);

    return item;
  }
}
