import { Midi } from "@tonejs/midi";
import { MidiInput } from "@/lib/midi/types";
import { MidiExportOptions } from "@/lib/components/player/wave-roll/types";

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
 * Check if File System Access API is supported in the current browser.
 */
function isFileSystemAccessSupported(): boolean {
  return "showSaveFilePicker" in window;
}

/**
 * Save a Blob using the File System Access API (showSaveFilePicker).
 * Allows user to choose save location and filename.
 * Falls back to regular download if not supported or user cancels.
 *
 * @param blob - The Blob to save
 * @param suggestedName - Suggested filename for the save dialog
 * @returns Promise that resolves when save is complete, or rejects on error
 * @throws Error if save fails (but not if user cancels)
 */
async function saveWithFilePicker(blob: Blob, suggestedName: string): Promise<void> {
  if (!isFileSystemAccessSupported()) {
    // Fallback to regular download
    triggerDownload(blob, suggestedName);
    return;
  }

  try {
    const handle = await window.showSaveFilePicker({
      suggestedName,
      types: [
        {
          description: "MIDI Files",
          accept: {
            "audio/midi": [".mid", ".midi"],
          },
        },
      ],
    });

    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
  } catch (err) {
    // User cancelled the dialog - this is not an error
    if (err instanceof Error && err.name === "AbortError") {
      return;
    }
    throw err;
  }
}

/**
 * Generate a filename for the exported MIDI file.
 *
 * @param originalName - Original filename (optional)
 * @param newTempo - The new tempo in BPM
 * @returns Generated filename
 */
export function generateExportFilename(originalName: string | undefined, newTempo: number): string {
  const baseName = originalName
    ? originalName.replace(/\.midi?$/i, "")
    : "exported";
  return `${baseName}_${Math.round(newTempo)}bpm.mid`;
}

/**
 * Get the original filename from a MidiInput.
 *
 * @param input - MidiInput (File or URL string)
 * @returns Original filename or undefined
 */
export function getOriginalFilename(input: MidiInput): string | undefined {
  if (typeof input === "string") {
    return input.split("/").pop();
  }
  return input.name;
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
  const blob = await exportMidiWithTempoAsBlob(originalInput, newTempo);
  const originalName = getOriginalFilename(originalInput);
  const exportFilename = filename ?? generateExportFilename(originalName, newTempo);
  triggerDownload(blob, exportFilename);
}

/**
 * Export a MIDI file with options for different export modes.
 *
 * @param originalInput - The original MIDI file (File object or URL string)
 * @param newTempo - The new tempo in BPM to set
 * @param options - Export options (mode and custom handler)
 * @param filename - Optional custom filename override
 * @throws Error if the MIDI file cannot be loaded or processed
 *
 * @example
 * ```typescript
 * // Default download mode
 * await performMidiExport(midiFile, 144, { mode: 'download' });
 *
 * // Let user choose save location
 * await performMidiExport(midiFile, 144, { mode: 'saveAs' });
 *
 * // Custom handler (e.g., for VS Code extension)
 * await performMidiExport(midiFile, 144, {
 *   mode: 'custom',
 *   onExport: async (blob, filename) => {
 *     // Handle the blob as needed
 *   }
 * });
 * ```
 */
export async function performMidiExport(
  originalInput: MidiInput,
  newTempo: number,
  options: MidiExportOptions = {},
  filename?: string
): Promise<void> {
  const { mode = "download", onExport } = options;

  const blob = await exportMidiWithTempoAsBlob(originalInput, newTempo);
  const originalName = getOriginalFilename(originalInput);
  const exportFilename = filename ?? generateExportFilename(originalName, newTempo);

  switch (mode) {
    case "saveAs":
      await saveWithFilePicker(blob, exportFilename);
      break;

    case "custom":
      if (!onExport) {
        throw new Error("Custom export mode requires onExport handler");
      }
      await onExport(blob, exportFilename);
      break;

    case "download":
    default:
      triggerDownload(blob, exportFilename);
      break;
  }
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

