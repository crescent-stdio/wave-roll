import { UIComponentDependencies } from "../../types";
import { addAudioFileFromUrl } from "@/lib/core/waveform/register";
import { PLAYER_ICONS } from "@/assets/player-icons";

/** Supported audio file extensions */
const AUDIO_EXTENSIONS = [".wav", ".mp3", ".m4a", ".ogg"];

export function createWaveListSection(
  deps: UIComponentDependencies
): HTMLElement {
  const section = document.createElement("div");
  const header = document.createElement("h3");
  header.textContent = "WAV File";
  header.style.cssText =
    "margin:0 0 12px;font-size:16px;font-weight:600;color:var(--text-primary);";
  section.appendChild(header);

  const list = document.createElement("div");
  list.style.cssText = "display:flex;flex-direction:column;gap:8px;";
  section.appendChild(list);

  // Minimal typed accessor for the global audio API
  type WaveRollAudioAPI = {
    getFiles?: () => Array<{ id: string; color: number; name: string }>;
    updateColor?: (id: string, color: number) => void;
    updateName?: (id: string, name: string) => void;
    remove?: (id: string) => void;
  };
  const getWaveRollAudio = (): WaveRollAudioAPI | undefined => {
    const w = globalThis as unknown as { _waveRollAudio?: WaveRollAudioAPI };
    return w._waveRollAudio;
  };

  const refresh = () => {
    list.innerHTML = "";
    const api = getWaveRollAudio();
    const files = (api?.getFiles?.() ?? []) as Array<{
      id: string;
      color: number;
      name: string;
    }>;
    files.forEach((a) => {
      const row = document.createElement("div");
      row.style.cssText =
        "display:flex;align-items:center;gap:8px;background:var(--surface-alt);padding:8px;border-radius:6px;border:1px solid var(--ui-border);";

      // color swatch (square)
      const colorBtn = document.createElement("button");
      colorBtn.type = "button";
      const hex = `#${(a.color >>> 0).toString(16).padStart(6, "0")}`;
      colorBtn.style.cssText = `width:20px;height:20px;border-radius:3px;border:1px solid var(--ui-border);background:${hex};cursor:pointer;position:relative;padding:0;`;
      const input = document.createElement("input");
      input.type = "color";
      input.value = hex;
      input.style.cssText =
        "position:absolute;opacity:0;width:0;height:0;border:0;padding:0;";
      input.addEventListener("change", () => {
        const newHex = input.value;
        const num = parseInt(newHex.replace("#", ""), 16);
        api?.updateColor?.(a.id, num);
        colorBtn.style.background = newHex;
      });
      colorBtn.addEventListener("click", () => input.click());
      colorBtn.appendChild(input);

      // name input
      const name = document.createElement("input");
      name.type = "text";
      name.value = a.name;
      name.style.cssText =
        "flex:1;padding:4px 6px;border:1px solid var(--ui-border);border-radius:4px;background:var(--surface);color:var(--text-primary);";
      name.addEventListener("change", () => {
        api?.updateName?.(a.id, name.value.trim());
      });

      row.appendChild(colorBtn);
      row.appendChild(name);

      // delete button
      const canRemove = deps.permissions?.canRemoveFiles !== false;
      if (canRemove) {
        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.innerHTML = PLAYER_ICONS.trash;
        delBtn.style.cssText =
          "width:24px;height:24px;padding:0;border:none;background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--text-muted);opacity:0.7;";
        delBtn.title = "Remove audio file";

        delBtn.addEventListener("mouseenter", () => {
          delBtn.style.opacity = "1";
          delBtn.style.color = "var(--danger, #dc3545)";
        });
        delBtn.addEventListener("mouseleave", () => {
          delBtn.style.opacity = "0.7";
          delBtn.style.color = "var(--text-muted)";
        });

        delBtn.addEventListener("click", () => {
          api?.remove?.(a.id);
          // Pause playback when removing audio file
          try {
            deps.audioPlayer?.pause?.();
          } catch {}
          refresh();

          // Update main screen file toggle section
          const fileToggleContainer = document.querySelector(
            '[data-role="file-toggle"]'
          ) as HTMLElement | null;
          if (fileToggleContainer) {
            const FileToggleManager = (window as any).FileToggleManager;
            if (FileToggleManager) {
              FileToggleManager.updateFileToggleSection(
                fileToggleContainer,
                deps
              );
            }
          }
        });

        row.appendChild(delBtn);
      }

      list.appendChild(row);
    });

    /* ---------- Audio File Drop Zone ---------- */
    const canAdd = deps.permissions?.canAddFiles !== false;
    const allowFileDrop = deps.allowFileDrop !== false;

    // Drop zone container with dashed border
    const dropZone = document.createElement("div");
    dropZone.style.cssText = `
      margin-top:12px;
      padding:16px;
      border:2px dashed var(--ui-border);
      border-radius:8px;
      background:var(--surface);
      cursor:pointer;
      text-align:center;
      transition:all 0.2s ease;
    `;

    // Drop zone content
    const dropZoneContent = document.createElement("div");
    dropZoneContent.style.cssText = "pointer-events:none;";

    const dropZoneTitle = document.createElement("div");
    // Change text based on whether an audio file already exists
    dropZoneTitle.textContent =
      files.length > 0 ? "Change Audio File" : "+ Add Audio File";
    dropZoneTitle.style.cssText =
      "font-size:14px;font-weight:500;color:var(--text-primary);margin-bottom:4px;";

    const dropZoneHint = document.createElement("div");
    dropZoneHint.textContent = allowFileDrop
      ? "Click or drag & drop audio file"
      : "Click to choose an audio file";
    dropZoneHint.style.cssText =
      "font-size:12px;color:var(--text-muted);margin-bottom:2px;";

    const dropZoneFormats = document.createElement("div");
    dropZoneFormats.textContent = ".wav, .mp3, .m4a, .ogg";
    dropZoneFormats.style.cssText =
      "font-size:10px;color:var(--text-muted);opacity:0.7;";

    dropZoneContent.appendChild(dropZoneTitle);
    dropZoneContent.appendChild(dropZoneHint);
    dropZoneContent.appendChild(dropZoneFormats);
    dropZone.appendChild(dropZoneContent);

    // Hidden file input (audio files only)
    const hiddenInput = document.createElement("input");
    hiddenInput.type = "file";
    hiddenInput.accept = ".wav,.mp3,.m4a,.ogg";
    hiddenInput.style.display = "none";

    /**
     * Process audio file (single file only - replaces existing).
     */
    const processAudioFile = async (file: File) => {
      if (!canAdd) return;

      const ext = file.name.toLowerCase().match(/\.[^.]+$/)?.[0] || "";
      if (!AUDIO_EXTENSIONS.includes(ext)) {
        console.warn(`Unsupported audio format: ${ext}`);
        return;
      }

      try {
        const url = URL.createObjectURL(file);
        await addAudioFileFromUrl(null, url, file.name);
        refresh();

        // Update main screen file toggle section
        const fileToggleContainer = document.querySelector(
          '[data-role="file-toggle"]'
        ) as HTMLElement | null;
        if (fileToggleContainer) {
          const FileToggleManager = (window as any).FileToggleManager;
          if (FileToggleManager) {
            FileToggleManager.updateFileToggleSection(
              fileToggleContainer,
              deps
            );
          }
        }
      } catch (err) {
        console.error("Failed to load audio file:", err);
      }
    };

    // Click to open file picker (or trigger external callback)
    dropZone.onclick = () => {
      if (!canAdd) return;
      // If external callback is registered (e.g., VS Code integration), use it
      if (deps.onAudioFileAddRequest) {
        deps.onAudioFileAddRequest();
      } else {
        hiddenInput.click();
      }
    };

    // File input change handler
    hiddenInput.onchange = async (e) => {
      if (!canAdd) return;
      const fileList = (e.target as HTMLInputElement).files;
      if (!fileList || fileList.length === 0) return;

      // Single file only
      await processAudioFile(fileList[0]);
      hiddenInput.value = "";
    };

    if (allowFileDrop) {
      // Drag & drop visual feedback
      const setDropZoneHighlight = (active: boolean) => {
        if (active) {
          dropZone.style.borderColor = "var(--focus-ring)";
          dropZone.style.background = "var(--surface-alt)";
          dropZoneTitle.textContent = "Drop audio file here";
        } else {
          dropZone.style.borderColor = "var(--ui-border)";
          dropZone.style.background = "var(--surface)";
          dropZoneTitle.textContent =
            files.length > 0 ? "Change Audio File" : "+ Add Audio File";
        }
      };

      // Drag enter/over
      dropZone.addEventListener("dragenter", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer?.types.includes("Files")) {
          setDropZoneHighlight(true);
        }
      });

      dropZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer?.types.includes("Files")) {
          e.dataTransfer.dropEffect = "copy";
        }
      });

      dropZone.addEventListener("dragleave", (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDropZoneHighlight(false);
      });

      // Drop handler for audio files
      dropZone.addEventListener("drop", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDropZoneHighlight(false);

        if (!e.dataTransfer?.types.includes("Files")) {
          return;
        }

        const droppedFiles = Array.from(e.dataTransfer.files);
        // Only process the first valid audio file
        for (const file of droppedFiles) {
          const ext = file.name.toLowerCase().match(/\.[^.]+$/)?.[0] || "";
          if (AUDIO_EXTENSIONS.includes(ext)) {
            await processAudioFile(file);
            break; // Only one audio file allowed
          }
        }
      });
    }

    if (canAdd) {
      dropZone.appendChild(hiddenInput);
      list.appendChild(dropZone);
    }
  };

  refresh();
  return section;
}
