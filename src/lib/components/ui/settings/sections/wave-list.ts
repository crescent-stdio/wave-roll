import { UIComponentDependencies } from "../../types";
import { addAudioFileFromUrl } from "@/lib/core/waveform/register";
import { PLAYER_ICONS } from "@/assets/player-icons";

export function createWaveListSection(
  deps: UIComponentDependencies
): HTMLElement {
  const section = document.createElement("div");
  const header = document.createElement("h3");
  header.textContent = "Wave Files";
  header.style.cssText = "margin:0 0 12px;font-size:16px;font-weight:600;color:var(--text-primary);";
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
      row.style.cssText = "display:flex;align-items:center;gap:8px;background:var(--surface-alt);padding:8px;border-radius:6px;border:1px solid var(--ui-border);";

      // color swatch (square)
      const colorBtn = document.createElement("button");
      colorBtn.type = "button";
      const hex = `#${(a.color >>> 0).toString(16).padStart(6, "0")}`;
      colorBtn.style.cssText = `width:20px;height:20px;border-radius:3px;border:1px solid var(--ui-border);background:${hex};cursor:pointer;position:relative;padding:0;`;
      const input = document.createElement("input");
      input.type = "color";
      input.value = hex;
      input.style.cssText = "position:absolute;opacity:0;width:0;height:0;border:0;padding:0;";
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
      name.style.cssText = "flex:1;padding:4px 6px;border:1px solid var(--ui-border);border-radius:4px;background:var(--surface);color:var(--text-primary);";
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
        delBtn.style.cssText = "width:24px;height:24px;padding:0;border:none;background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--text-muted);opacity:0.7;";
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
          const fileToggleContainer = document.querySelector('[data-role="file-toggle"]') as HTMLElement | null;
          if (fileToggleContainer) {
            const FileToggleManager = (window as any).FileToggleManager;
            if (FileToggleManager) {
              FileToggleManager.updateFileToggleSection(fileToggleContainer, deps);
            }
          }
        });
        
        row.appendChild(delBtn);
      }

      list.appendChild(row);
    });

    /* ---------- Add/Change WAV File button ---------- */
    const canAdd = deps.permissions?.canAddFiles !== false;
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    // Change button text based on whether a WAV file already exists
    addBtn.textContent = files.length > 0 ? "Change WAV File" : "Add WAV File";
    addBtn.style.cssText =
      "margin-top:12px;padding:8px;border:1px solid var(--ui-border);border-radius:6px;background:var(--surface);cursor:pointer;font-size:14px;color:var(--text-primary);";

    const hiddenInput = document.createElement("input");
    hiddenInput.type = "file";
    hiddenInput.accept = ".wav,.mp3,.m4a,.ogg";
    hiddenInput.style.display = "none";

    addBtn.onclick = () => { if (canAdd) hiddenInput.click(); };

    hiddenInput.onchange = async (e) => {
      if (!canAdd) { return; }
      const files = Array.from((e.target as HTMLInputElement).files || []);
      if (files.length === 0) return;

      // Only take first file (single WAV limit enforced in addAudioFileFromUrl)
      const file = files[0];
      try {
        const url = URL.createObjectURL(file);
        await addAudioFileFromUrl(null, url, file.name);
        refresh();
        
        // Update main screen file toggle section
        const fileToggleContainer = document.querySelector('[data-role="file-toggle"]') as HTMLElement | null;
        if (fileToggleContainer) {
          const FileToggleManager = (window as any).FileToggleManager;
          if (FileToggleManager) {
            FileToggleManager.updateFileToggleSection(fileToggleContainer, deps);
          }
        }
      } catch (err) {
        console.error("Failed to load audio file", err);
      }
      hiddenInput.value = "";
    };
    
    if (canAdd) {
      list.appendChild(addBtn);
      list.appendChild(hiddenInput);
    }
  };

  refresh();
  return section;
}
