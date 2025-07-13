import { MidiInput } from "@/lib/midi/types";
import { FileValidationResult } from "./types";
import { parseMidi } from "@/lib/core/parsers/midi-parser";

/**
 * Validate a MIDI file before loading
 * @param input - File input to validate
 * @returns Promise that resolves to validation result
 */
export async function validateFile(
  input: MidiInput
): Promise<FileValidationResult> {
  try {
    const parsedData = await parseMidi(input);

    // Basic validation checks
    if (!parsedData.notes || parsedData.notes.length === 0) {
      return {
        isValid: false,
        error: "No notes found in MIDI file",
      };
    }

    if (parsedData.duration <= 0) {
      return {
        isValid: false,
        error: "Invalid MIDI file duration",
      };
    }

    return {
      isValid: true,
      parsedData,
    };
  } catch (error) {
    return {
      isValid: false,
      error:
        error instanceof Error ? error.message : "Unknown validation error",
    };
  }
}
