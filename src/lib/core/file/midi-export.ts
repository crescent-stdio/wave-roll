import { Midi } from "@tonejs/midi";
import { MidiInput } from "@/lib/midi/types";

/**
 * Load MIDI data from a File or URL and return as ArrayBuffer.
 *
 * @param input - Either a File object or a URL string
 * @returns Promise resolving to ArrayBuffer of MIDI data
 */
async function getMidiArrayBuffer(input: MidiInput): Promise<ArrayBuffer> {
  if (typeof input === "string") {
    const response = await fetch(input);
    if (!response.ok) {
      throw new Error(`Failed to fetch MIDI file: ${response.status} ${response.statusText}`);
    }
    return response.arrayBuffer();
  }
  return input.arrayBuffer();
}

/**
 * Trigger a download of a Blob as a file.
 *
 * @param blob - The Blob to download
 * @param filename - The filename for the download
 */
function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Generate a filename for the exported MIDI file.
 *
 * @param originalName - Original filename (optional)
 * @param newTempo - The new tempo in BPM
 * @returns Generated filename
 */
function generateExportFilename(originalName: string | undefined, newTempo: number): string {
  const baseName = originalName
    ? originalName.replace(/\.midi?$/i, "")
    : "exported";
  return `${baseName}_${Math.round(newTempo)}bpm.mid`;
}

/**
 * Export a MIDI file with a modified tempo.
 *
 * This function loads the original MIDI file, updates only the tempo metadata
 * (preserving all note ticks/times), and triggers a download of the modified file.
 *
 * Note: Only tempo metadata is modified. Note events keep their original tick
 * positions, so the musical content remains unchanged - it will simply play
 * at a different speed in DAWs and MIDI players.
 *
 * @param originalInput - The original MIDI file (File object or URL string)
 * @param newTempo - The new tempo in BPM to set
 * @param filename - Optional custom filename for the download
 * @throws Error if the MIDI file cannot be loaded or processed
 *
 * @example
 * ```typescript
 * // Export with tempo changed to 144 BPM
 * await exportMidiWithTempo(midiFile, 144);
 *
 * // Export with custom filename
 * await exportMidiWithTempo(midiFile, 144, "my_song_fast.mid");
 * ```
 */
export async function exportMidiWithTempo(
  originalInput: MidiInput,
  newTempo: number,
  filename?: string
): Promise<void> {
  // Validate tempo
  if (!Number.isFinite(newTempo) || newTempo <= 0) {
    throw new Error(`Invalid tempo: ${newTempo}. Tempo must be a positive number.`);
  }

  // Load original MIDI data
  const arrayBuffer = await getMidiArrayBuffer(originalInput);
  const midi = new Midi(arrayBuffer);

  // Update tempo metadata only (preserve note ticks)
  // Clear existing tempo events and set a single tempo at the beginning
  // This approach follows the recommendation to avoid double-scaling issues
  // See: https://github.com/Tonejs/Midi/issues/81
  midi.header.tempos = [
    {
      bpm: newTempo,
      ticks: 0,
      time: 0,
    },
  ];

  // Convert back to ArrayBuffer
  const outputArray = midi.toArray();
  const blob = new Blob([new Uint8Array(outputArray)], { type: "audio/midi" });

  // Determine filename
  const originalName = typeof originalInput === "string"
    ? originalInput.split("/").pop()
    : originalInput.name;
  const exportFilename = filename ?? generateExportFilename(originalName, newTempo);

  // Trigger download
  triggerDownload(blob, exportFilename);
}

/**
 * Export a MIDI file with tempo metadata, returning the Blob instead of triggering download.
 * Useful for programmatic use cases where the caller handles the file.
 *
 * @param originalInput - The original MIDI file (File object or URL string)
 * @param newTempo - The new tempo in BPM to set
 * @returns Promise resolving to Blob of the modified MIDI file
 */
export async function exportMidiWithTempoAsBlob(
  originalInput: MidiInput,
  newTempo: number
): Promise<Blob> {
  if (!Number.isFinite(newTempo) || newTempo <= 0) {
    throw new Error(`Invalid tempo: ${newTempo}. Tempo must be a positive number.`);
  }

  const arrayBuffer = await getMidiArrayBuffer(originalInput);
  const midi = new Midi(arrayBuffer);

  midi.header.tempos = [
    {
      bpm: newTempo,
      ticks: 0,
      time: 0,
    },
  ];

  const outputArray = midi.toArray();
  return new Blob([new Uint8Array(outputArray)], { type: "audio/midi" });
}

