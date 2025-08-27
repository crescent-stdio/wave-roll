import { UIComponentDependencies } from "../../types";

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

  const refresh = () => {
    list.innerHTML = "";
    const api = (window as any)._waveRollAudio;
    const files = api?.getFiles?.() || [];
    files.forEach((a: any) => {
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
      name.value = a.displayName;
      name.style.cssText = "flex:1;padding:4px 6px;border:1px solid var(--ui-border);border-radius:4px;background:var(--surface);color:var(--text-primary);";
      name.addEventListener("change", () => {
        api?.updateDisplayName?.(a.id, name.value.trim());
      });

      row.appendChild(colorBtn);
      row.appendChild(name);
      list.appendChild(row);
    });
  };

  refresh();
  return section;
}

