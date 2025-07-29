import { UIComponentDependencies } from "../../types";
import { parseMidi } from "@/lib/core/parsers/midi-parser";

/**
 * Build the “Add MIDI Files” upload section for the settings modal.
 *
 * @param deps - The UI component dependencies.
 */
export function createFileUploadSection(
  deps: UIComponentDependencies
): HTMLElement {
  const wrapper = document.createElement("div");

  // Section title
  const title = document.createElement("h3");
  title.textContent = "Add MIDI Files";
  title.style.cssText = "margin:0 0 12px;font-size:16px;font-weight:600;";

  // File input
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".mid,.midi";
  input.multiple = true;
  input.style.cssText = "display:block;margin-bottom:8px;font-size:14px;";

  // Status label - updated after each upload.
  const status = document.createElement("span");
  status.style.cssText = "font-size:12px;color:#6c757d;";

  input.onchange = async (e) => {
    const files = Array.from((e.target as HTMLInputElement).files || []);
    if (files.length === 0) return;

    status.textContent = "Parsing files…";

    for (const file of files) {
      try {
        const parsed = await parseMidi(file);
        deps.midiManager.addMidiFile(file.name, parsed);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("Failed to parse MIDI", err);
      }
    }
    status.textContent = "Upload complete";
    // Reset the input so the same file can be selected again if needed.
    input.value = "";
  };

  wrapper.append(title, input, status);
  return wrapper;
}
