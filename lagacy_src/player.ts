/**
 * Deprecated MIDI Player stubs (html-midi-player dependency removed).
 * These APIs are kept for backwards compatibility but provide no-op implementations.
 */

export interface MidiPlayerOptions {
  showVisualizer?: boolean;
  soundFont?: boolean | string;
  className?: string;
  width?: string;
  height?: string;
}

/**
 * No-op player creation. Warns users and updates container with notice.
 */
export async function createMidiPlayer(
  container: HTMLElement,
  _input: unknown,
  _options: MidiPlayerOptions = {}
): Promise<void> {
  console.warn(
    "[wave-roll] createMidiPlayer is deprecated - html-midi-player was removed. " +
      "Please migrate to createAudioPlayer + createPianoRoll for playback and visualization."
  );
  if (container) {
    container.innerHTML =
      '<div style="text-align:center;padding:16px;color:#666;">' +
      "Interactive MIDI player is no longer available." +
      "</div>";
  }
}

export function arrayBufferToDataUrl(_arrayBuffer: ArrayBuffer): string {
  console.warn(
    "[wave-roll] arrayBufferToDataUrl is deprecated and returns an empty string."
  );
  return "";
}

export function arrayBufferToBlobUrl(_arrayBuffer: ArrayBuffer): string {
  console.warn(
    "[wave-roll] arrayBufferToBlobUrl is deprecated and returns an empty string."
  );
  return "";
}

export function cleanupBlobUrls(): void {
  /* no-op */
}

export async function loadPlayerComponents(): Promise<void> {
  /* no-op */
}

export function isPlayerAvailable(): boolean {
  return false;
}

export function debugPlayerState(): Record<string, never> {
  return {};
}
