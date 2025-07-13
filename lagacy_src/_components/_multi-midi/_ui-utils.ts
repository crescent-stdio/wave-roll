/**
 * Utility helpers shared by Multi-MIDI UI modules.
 */

export class UIUtils {
  /**
   * Convert seconds to `MM:SS` format.
   */
  static formatTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes.toString().padStart(2, "0")}:${remainingSeconds
      .toString()
      .padStart(2, "0")}`;
  }

  /**
   * Create an element with `styles` applied inline and optional `textContent`.
   */
  static createElement(
    tag: string,
    styles: string,
    textContent?: string
  ): HTMLElement {
    const element = document.createElement(tag);
    element.style.cssText = styles;
    if (textContent) element.textContent = textContent;
    return element;
  }
}
